const { query } = require('../../config/database');
const logger = require('../../utils/logger');
const { auditLog } = require('../../services/audit.service');

// Helper: normalize permissions from DB (jsonb returns array directly)
function parsePerms(raw) {
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === 'string') return raw.split(',').map(p => p.trim()).filter(Boolean);
  return [];
}

// Helper: serialize permissions for DB (jsonb)
function serializePerms(perms) {
  if (Array.isArray(perms)) return JSON.stringify(perms);
  return JSON.stringify([]);
}

// Get all roles
const getAllRoles = async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, name, description, permissions, created_at, updated_at FROM roles ORDER BY name'
    );
    res.json({
      success: true,
      data: rows.map(r => ({
        id: r.id,
        name: r.name,
        description: r.description,
        permissions: parsePerms(r.permissions),
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }))
    });
  } catch (error) {
    logger.error('Get all roles error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch roles' });
  }
};

// Get role by ID
const getRoleById = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await query('SELECT * FROM roles WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Role not found' });
    const r = rows[0];
    res.json({
      success: true,
      data: {
        id: r.id,
        name: r.name,
        description: r.description,
        permissions: parsePerms(r.permissions),
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }
    });
  } catch (error) {
    logger.error('Get role by ID error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch role' });
  }
};

// Create role (Admin only)
const createRole = async (req, res) => {
  try {
    const { name, description, permissions } = req.body;
    const { rows: existing } = await query('SELECT id FROM roles WHERE name = $1', [name]);
    if (existing.length > 0) return res.status(400).json({ success: false, error: 'Role already exists' });

    const { rows: newRole } = await query(
      'INSERT INTO roles (name, description, permissions) VALUES ($1, $2, $3) RETURNING *',
      [name, description, serializePerms(permissions)]
    );
    const r = newRole[0];
    await auditLog(req.user.id, 'ROLE_CREATED', 'roles', r.id, { name, permissions }, req);
    res.status(201).json({
      success: true,
      message: 'Role created successfully',
      data: { id: r.id, name: r.name, description: r.description, permissions: parsePerms(r.permissions), createdAt: r.created_at }
    });
  } catch (error) {
    logger.error('Create role error:', error);
    res.status(500).json({ success: false, error: 'Failed to create role' });
  }
};

// Update role (Admin only)
const updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, permissions } = req.body;

    const { rows: updated } = await query(
      `UPDATE roles
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           permissions = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [name, description, serializePerms(permissions), id]
    );
    if (updated.length === 0) return res.status(404).json({ success: false, error: 'Role not found' });
    const r = updated[0];
    await auditLog(req.user.id, 'ROLE_UPDATED', 'roles', parseInt(id), { name, permissions }, req);
    res.json({
      success: true,
      message: 'Role updated successfully',
      data: { id: r.id, name: r.name, description: r.description, permissions: parsePerms(r.permissions), updatedAt: r.updated_at }
    });
  } catch (error) {
    logger.error('Update role error:', error);
    res.status(500).json({ success: false, error: 'Failed to update role' });
  }
};

// Delete role (Admin only)
const deleteRole = async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch role
    const { rows: roleRows } = await query('SELECT name FROM roles WHERE id = $1', [id]);
    if (roleRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Role not found' });
    }

    const roleName = roleRows[0].name.toUpperCase();

    // Block deletion of ADMIN only — HR, EMPLOYEE, and custom roles can be deleted
    if (roleName === 'ADMIN') {
      return res.status(400).json({ success: false, error: 'The ADMIN role cannot be deleted.' });
    }

    // Lock all users assigned to this role — set status to LOCKED_ROLE
    const { rows: lockedUsers } = await query(
      `UPDATE users
       SET status = 'LOCKED_ROLE', updated_at = NOW()
       WHERE role = $1
       RETURNING id, email, first_name, last_name`,
      [roleRows[0].name]
    );

    // Delete the role
    await query('DELETE FROM roles WHERE id = $1', [id]);

    // Audit log
    await auditLog(req.user.id, 'ROLE_DELETED', 'roles', parseInt(id), {
      roleName: roleRows[0].name,
      usersLocked: lockedUsers.length,
      lockedUsers: lockedUsers.map(u => ({ id: u.id, email: u.email, name: `${u.first_name} ${u.last_name}` })),
      reason: 'Role deleted — users locked until role is restored',
    }, req);

    res.json({
      success: true,
      message: `Role deleted. ${lockedUsers.length} user(s) are now locked.`,
      usersLocked: lockedUsers.length,
      lockedUsers: lockedUsers.map(u => u.email),
    });
  } catch (error) {
    logger.error('Delete role error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete role' });
  }
};

// Get current user's permissions
const getMyPermissions = async (req, res) => {
  try {
    const userRole = req.user.role;
    if (userRole === 'ADMIN') {
      return res.json({
        success: true,
        data: { permissions: ['*'], isAdmin: true }
      });
    }
    const { rows } = await query('SELECT permissions FROM roles WHERE name = $1', [userRole]);
    const permissions = parsePerms(rows[0]?.permissions);
    res.json({
      success: true,
      data: { permissions, isAdmin: false }
    });
  } catch (error) {
    logger.error('Get my permissions error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch permissions' });
  }
};

module.exports = { getAllRoles, getRoleById, createRole, updateRole, deleteRole, getMyPermissions };
