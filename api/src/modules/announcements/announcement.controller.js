const { query } = require('../../config/database');
const logger = require('../../utils/logger');
const { auditLog } = require('../../services/audit.service');
const socketService = require('../../services/socket.service');

function mapAnnouncement(a) {
  return {
    id: a.id,
    title: a.title,
    content: a.content,
    type: a.type,
    priority: a.priority,
    status: a.status,
    targetRoles: a.target_roles,
    isActive: a.is_active,
    expiresAt: a.expires_at,
    scheduledAt: a.scheduled_at,
    publishedAt: a.published_at,
    editedAt: a.edited_at,
    editedBy: a.edited_by_name
      ? { id: a.edited_by, firstName: a.edited_by_fname, lastName: a.edited_by_lname }
      : null,
    createdBy: {
      id: a.created_by,
      firstName: a.creator_fname,
      lastName: a.creator_lname,
      fullName: `${a.creator_fname} ${a.creator_lname}`,
    },
    viewCount: parseInt(a.view_count ?? 0, 10),
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}

const BASE_SELECT = `
  SELECT
    a.*,
    uc.first_name AS creator_fname,
    uc.last_name AS creator_lname,
    ue.first_name AS edited_by_fname,
    ue.last_name AS edited_by_lname,
    ue.first_name || ' ' || ue.last_name AS edited_by_name,
    COALESCE(v.cnt, 0) AS view_count
  FROM announcements a
  JOIN users uc ON a.created_by = uc.id
  LEFT JOIN users ue ON a.edited_by = ue.id
  LEFT JOIN (
    SELECT announcement_id, COUNT(*) AS cnt
    FROM announcement_views
    GROUP BY announcement_id
  ) v ON v.announcement_id = a.id
`;

function canAccessAnnouncement(row, userRole, isManager) {
  if (isManager) return true;
  if (row.status !== 'PUBLISHED') return false;
  if (row.expires_at && new Date(row.expires_at) <= new Date()) return false;

  const targetRoles = Array.isArray(row.target_roles) ? row.target_roles : [];
  return targetRoles.length === 0 || targetRoles.includes('ALL') || targetRoles.includes(userRole);
}

async function emitAnnouncementEvent(event, data, targetRoles) {
  const normalizedRoles = Array.isArray(targetRoles) ? targetRoles.filter(Boolean) : [];

  if (normalizedRoles.length === 0 || normalizedRoles.includes('ALL')) {
    socketService.broadcast(event, data);
    return;
  }

  const { rows } = await query(
    `SELECT id FROM users WHERE status = 'ACTIVE' AND role = ANY($1::text[])`,
    [normalizedRoles]
  );

  rows.forEach((user) => socketService.emitToUser(user.id, event, data));
}

const getAnnouncements = async (req, res) => {
  try {
    const userRole = req.user.role;
    const { page = 1, limit = 50, type, priority, status } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const isManager = ['ADMIN', 'HR'].includes(userRole);

    const conditions = [];
    const params = [];
    let idx = 1;

    if (!isManager) {
      conditions.push(`a.status = 'PUBLISHED'`);
      conditions.push(`(a.expires_at IS NULL OR a.expires_at > NOW())`);
    }

    if (status && isManager) {
      conditions.push(`a.status = $${idx++}`);
      params.push(status);
    }

    if (type) {
      conditions.push(`a.type = $${idx++}`);
      params.push(type);
    }

    if (priority) {
      conditions.push(`a.priority = $${idx++}`);
      params.push(priority);
    }

    conditions.push(
      `(a.target_roles IS NULL OR a.target_roles = '[]'::jsonb OR a.target_roles @> $${idx}::jsonb OR a.target_roles @> '["ALL"]'::jsonb)`
    );
    params.push(JSON.stringify([userRole]));
    idx++;

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows: countRows } = await query(`SELECT COUNT(*) FROM announcements a ${where}`, params);
    const total = parseInt(countRows[0].count, 10);

    const { rows } = await query(
      `${BASE_SELECT} ${where}
       ORDER BY
         COALESCE(a.published_at, a.created_at) DESC,
         a.priority DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, parseInt(limit, 10), offset]
    );

    res.json({
      success: true,
      data: rows.map(mapAnnouncement),
      meta: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / parseInt(limit, 10))
      }
    });
  } catch (error) {
    logger.error('Get announcements error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch announcements' });
  }
};

const getAnnouncementById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;
    const isManager = ['ADMIN', 'HR'].includes(userRole);

    const { rows } = await query(`${BASE_SELECT} WHERE a.id = $1`, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Announcement not found' });
    }

    const announcement = rows[0];
    if (!canAccessAnnouncement(announcement, userRole, isManager)) {
      return res.status(404).json({ success: false, error: 'Announcement not found' });
    }

    await query(
      `INSERT INTO announcement_views (announcement_id, user_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [id, userId]
    );

    const { rows: viewers } = await query(
      `SELECT u.id, u.first_name, u.last_name, u.role, u.profile_picture, av.viewed_at
       FROM announcement_views av
       JOIN users u ON av.user_id = u.id
       WHERE av.announcement_id = $1
       ORDER BY av.viewed_at DESC`,
      [id]
    );

    const ann = mapAnnouncement(announcement);
    ann.viewers = viewers.map((v) => ({
      id: v.id,
      firstName: v.first_name,
      lastName: v.last_name,
      fullName: `${v.first_name} ${v.last_name}`,
      role: v.role,
      profilePicture: v.profile_picture,
      viewedAt: v.viewed_at,
    }));

    res.json({ success: true, data: ann });
  } catch (error) {
    logger.error('Get announcement by ID error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch announcement' });
  }
};

const createAnnouncement = async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, content, type, priority, targetRoles, scheduledAt, expiresAt } = req.body;

    const isScheduled = !!scheduledAt && new Date(scheduledAt) > new Date();
    const status = isScheduled ? 'SCHEDULED' : 'PUBLISHED';
    const publishedAt = isScheduled ? null : new Date();

    const { rows } = await query(
      `INSERT INTO announcements
         (title, content, type, priority, target_roles, is_active,
          status, scheduled_at, published_at, expires_at, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,true,$6,$7,$8,$9,$10,NOW(),NOW())
       RETURNING *`,
      [
        title,
        content,
        type,
        priority,
        targetRoles ? JSON.stringify(targetRoles) : null,
        status,
        isScheduled ? new Date(scheduledAt) : null,
        publishedAt,
        expiresAt || null,
        userId,
      ]
    );

    const ann = rows[0];

    await auditLog(userId, 'ANNOUNCEMENT_CREATED', 'announcements', ann.id, {
      title,
      status,
      scheduledAt: ann.scheduled_at
    }, req);

    if (status === 'PUBLISHED') {
      await emitAnnouncementEvent(socketService.EVENTS.ANNOUNCEMENT_NEW, {
        id: ann.id,
        title: ann.title,
        content: ann.content,
        priority: ann.priority,
        type: ann.type,
        status: ann.status,
        targetRoles: ann.target_roles,
        createdAt: ann.created_at,
      }, ann.target_roles);
    }

    res.status(201).json({
      success: true,
      message: status === 'SCHEDULED' ? 'Announcement scheduled' : 'Announcement posted',
      data: { id: ann.id, title: ann.title, status, scheduledAt: ann.scheduled_at },
    });
  } catch (error) {
    logger.error('Create announcement error:', error);
    res.status(500).json({ success: false, error: 'Failed to create announcement' });
  }
};

const updateAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { title, content, type, priority, targetRoles, isActive, expiresAt, scheduledAt } = req.body;

    let newStatus;
    let newPublishedAt;
    if (scheduledAt !== undefined) {
      const isScheduled = !!scheduledAt && new Date(scheduledAt) > new Date();
      newStatus = isScheduled ? 'SCHEDULED' : 'PUBLISHED';
      newPublishedAt = isScheduled ? null : new Date();
    }

    const { rows } = await query(
      `UPDATE announcements
       SET title        = COALESCE($1, title),
           content      = COALESCE($2, content),
           type         = COALESCE($3, type),
           priority     = COALESCE($4, priority),
           target_roles = COALESCE($5, target_roles),
           is_active    = COALESCE($6, is_active),
           expires_at   = COALESCE($7, expires_at),
           scheduled_at = COALESCE($8, scheduled_at),
           status       = COALESCE($9, status),
           published_at = COALESCE($10, published_at),
           edited_at    = NOW(),
           edited_by    = $11,
           updated_at   = NOW()
       WHERE id = $12
       RETURNING *`,
      [
        title ?? null,
        content ?? null,
        type ?? null,
        priority ?? null,
        targetRoles !== undefined ? JSON.stringify(targetRoles) : null,
        isActive !== undefined ? isActive : null,
        expiresAt !== undefined ? expiresAt : null,
        scheduledAt !== undefined ? (scheduledAt ? new Date(scheduledAt) : null) : null,
        newStatus ?? null,
        newPublishedAt !== undefined ? newPublishedAt : null,
        userId,
        id,
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Announcement not found' });
    }

    const ann = rows[0];

    await auditLog(userId, 'ANNOUNCEMENT_UPDATED', 'announcements', parseInt(id, 10), {
      title: ann.title,
      editedBy: userId
    }, req);

    if (ann.status === 'PUBLISHED') {
      await emitAnnouncementEvent(socketService.EVENTS.ANNOUNCEMENT_UPDATE, {
        id: ann.id,
        title: ann.title,
        content: ann.content,
        priority: ann.priority,
        type: ann.type,
        status: ann.status,
        targetRoles: ann.target_roles,
        editedAt: ann.edited_at,
      }, ann.target_roles);
    }

    res.json({
      success: true,
      message: 'Announcement updated',
      data: { id: ann.id, status: ann.status, editedAt: ann.edited_at }
    });
  } catch (error) {
    logger.error('Update announcement error:', error);
    res.status(500).json({ success: false, error: 'Failed to update announcement' });
  }
};

const deleteAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await query('DELETE FROM announcements WHERE id = $1 RETURNING id, title', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Announcement not found' });
    }

    await auditLog(req.user.id, 'ANNOUNCEMENT_DELETED', 'announcements', parseInt(id, 10), {
      title: rows[0].title
    }, req);

    res.json({ success: true, message: 'Announcement deleted' });
  } catch (error) {
    logger.error('Delete announcement error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete announcement' });
  }
};

const exportAnnouncements = async (req, res) => {
  try {
    const { rows } = await query(
      `${BASE_SELECT}
       WHERE 1=1
       ORDER BY a.created_at DESC`
    );

    const csv = [
      ['ID', 'Title', 'Type', 'Priority', 'Status', 'Created By', 'Views', 'Scheduled At', 'Published At', 'Created At'].join(','),
      ...rows.map((a) => [
        a.id,
        `"${(a.title || '').replace(/"/g, '""')}"`,
        a.type,
        a.priority,
        a.status,
        `"${a.creator_fname} ${a.creator_lname}"`,
        a.view_count ?? 0,
        a.scheduled_at ? new Date(a.scheduled_at).toISOString() : '',
        a.published_at ? new Date(a.published_at).toISOString() : '',
        new Date(a.created_at).toISOString(),
      ].join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="announcements-${Date.now()}.csv"`);
    res.send(csv);
  } catch (error) {
    logger.error('Export announcements error:', error);
    res.status(500).json({ success: false, error: 'Failed to export' });
  }
};

const publishScheduled = async () => {
  try {
    const { rows } = await query(
      `UPDATE announcements
       SET status = 'PUBLISHED', published_at = NOW(), updated_at = NOW()
       WHERE status = 'SCHEDULED' AND scheduled_at <= NOW()
       RETURNING *`
    );

    for (const ann of rows) {
      logger.info(`[Announcements] Auto-published scheduled announcement #${ann.id}: "${ann.title}"`);
      await emitAnnouncementEvent(socketService.EVENTS.ANNOUNCEMENT_NEW, {
        id: ann.id,
        title: ann.title,
        content: ann.content,
        priority: ann.priority,
        type: ann.type,
        status: 'PUBLISHED',
        targetRoles: ann.target_roles,
        publishedAt: ann.published_at,
      }, ann.target_roles);
    }

    return rows.length;
  } catch (error) {
    logger.error('[Announcements] publishScheduled error:', error);
    return 0;
  }
};

module.exports = {
  getAnnouncements,
  getAnnouncementById,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  exportAnnouncements,
  publishScheduled,
};
