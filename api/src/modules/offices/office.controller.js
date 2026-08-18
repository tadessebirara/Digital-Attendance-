const { query } = require('../../config/database');
const logger = require('../../utils/logger');
const { auditLog } = require('../../services/audit.service');

// ── Get all offices ───────────────────────────────────────────────────────────
const getAllOffices = async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT o.*, COUNT(DISTINCT ess.user_id) AS employee_count
       FROM offices o
       LEFT JOIN employee_schedule_settings ess ON ess.office_id = o.id
       WHERE o.is_active = TRUE
       GROUP BY o.id
       ORDER BY o.name`
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    logger.error('Get offices error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch offices' });
  }
};

// ── Get single office ─────────────────────────────────────────────────────────
const getOffice = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await query(
      `SELECT o.*, COUNT(DISTINCT ess.user_id) AS employee_count
       FROM offices o
       LEFT JOIN employee_schedule_settings ess ON ess.office_id = o.id
       WHERE o.id = $1
       GROUP BY o.id`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Office not found' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    logger.error('Get office error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch office' });
  }
};

// ── Create office ─────────────────────────────────────────────────────────────
const createOffice = async (req, res) => {
  try {
    const { name, latitude, longitude, radius_meters, gps_accuracy_warn_m, gps_accuracy_max_m } = req.body;

    if (!name || latitude == null || longitude == null) {
      return res.status(400).json({ success: false, error: 'Name, latitude, and longitude are required' });
    }

    const { rows } = await query(
      `INSERT INTO offices (name, latitude, longitude, radius_meters, gps_accuracy_warn_m, gps_accuracy_max_m, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       RETURNING *`,
      [
        name,
        parseFloat(latitude),
        parseFloat(longitude),
        parseInt(radius_meters || 200, 10),
        parseInt(gps_accuracy_warn_m || 50, 10),
        parseInt(gps_accuracy_max_m  || 100, 10),
      ]
    );

    await auditLog(req.user.id, 'CREATE_OFFICE', 'offices', rows[0].id, { name, latitude, longitude, radius_meters }, req);

    // Notify all connected mobile clients that office config has changed
    const io = req.app.get('io');
    if (io) io.emit('config:update', { source: 'office_created', officeId: rows[0].id });

    res.json({ success: true, data: rows[0], message: 'Office created successfully' });
  } catch (error) {
    logger.error('Create office error:', error);
    res.status(500).json({ success: false, error: 'Failed to create office' });
  }
};

// ── Update office ─────────────────────────────────────────────────────────────
const updateOffice = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, latitude, longitude, radius_meters, is_active, gps_accuracy_warn_m, gps_accuracy_max_m } = req.body;

    const updates = [];
    const params = [];
    let idx = 1;

    if (name !== undefined) { updates.push(`name = $${idx++}`); params.push(name); }
    if (latitude !== undefined) { updates.push(`latitude = $${idx++}`); params.push(parseFloat(latitude)); }
    if (longitude !== undefined) { updates.push(`longitude = $${idx++}`); params.push(parseFloat(longitude)); }
    if (radius_meters !== undefined) { updates.push(`radius_meters = $${idx++}`); params.push(parseInt(radius_meters, 10)); }
    if (is_active !== undefined) { updates.push(`is_active = $${idx++}`); params.push(Boolean(is_active)); }
    if (gps_accuracy_warn_m !== undefined) { updates.push(`gps_accuracy_warn_m = $${idx++}`); params.push(parseInt(gps_accuracy_warn_m, 10)); }
    if (gps_accuracy_max_m  !== undefined) { updates.push(`gps_accuracy_max_m  = $${idx++}`); params.push(parseInt(gps_accuracy_max_m,  10)); }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    params.push(id);
    const { rows } = await query(
      `UPDATE offices
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${idx}
       RETURNING *`,
      params
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Office not found' });
    }

    await auditLog(req.user.id, 'UPDATE_OFFICE', 'offices', id, { name, latitude, longitude, radius_meters, is_active }, req);

    // Notify all connected mobile clients that office GPS/radius has changed
    const io = req.app.get('io');
    if (io) io.emit('config:update', { source: 'office_updated', officeId: parseInt(id) });

    res.json({ success: true, data: rows[0], message: 'Office updated successfully' });
  } catch (error) {
    logger.error('Update office error:', error);
    res.status(500).json({ success: false, error: 'Failed to update office' });
  }
};

// ── Delete (deactivate) office ────────────────────────────────────────────────
const deleteOffice = async (req, res) => {
  try {
    const { id } = req.params;

    // Soft delete — set is_active to FALSE
    const { rows } = await query(
      `UPDATE offices SET is_active = FALSE WHERE id = $1 RETURNING *`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Office not found' });
    }

    // Also clear office assignments from employee_schedule_settings
    await query(`UPDATE employee_schedule_settings SET office_id = NULL WHERE office_id = $1`, [id]);

    await auditLog(req.user.id, 'DELETE_OFFICE', 'offices', id, { name: rows[0].name }, req);

    // Notify all connected mobile clients that an office was removed
    const io = req.app.get('io');
    if (io) io.emit('config:update', { source: 'office_deleted', officeId: parseInt(id) });

    res.json({ success: true, message: 'Office deactivated successfully' });
  } catch (error) {
    logger.error('Delete office error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete office' });
  }
};

// ── Get employees assigned to an office ───────────────────────────────────────
const getOfficeEmployees = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.status,
              ess.grace_minutes, ess.gps_radius_meters
       FROM users u
       JOIN employee_schedule_settings ess ON ess.user_id = u.id
       WHERE ess.office_id = $1 AND u.role = 'EMPLOYEE' AND u.status = 'ACTIVE'
       ORDER BY u.last_name, u.first_name`,
      [id]
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    logger.error('Get office employees error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch office employees' });
  }
};

// ── Assign employee to office ─────────────────────────────────────────────────
const assignEmployeeToOffice = async (req, res) => {
  try {
    const { userId, officeId } = req.body;

    if (!userId || !officeId) {
      return res.status(400).json({ success: false, error: 'userId and officeId are required' });
    }

    // Ensure employee_schedule_settings row exists
    await query(
      `INSERT INTO employee_schedule_settings (user_id, office_id, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE
       SET office_id = $2, updated_at = NOW()`,
      [userId, officeId]
    );

    await auditLog(req.user.id, 'ASSIGN_EMPLOYEE_TO_OFFICE', 'employee_schedule_settings', userId, { officeId }, req);

    res.json({ success: true, message: 'Employee assigned to office successfully' });
  } catch (error) {
    logger.error('Assign employee to office error:', error);
    res.status(500).json({ success: false, error: 'Failed to assign employee' });
  }
};

module.exports = {
  getAllOffices,
  getOffice,
  createOffice,
  updateOffice,
  deleteOffice,
  getOfficeEmployees,
  assignEmployeeToOffice,
};
