const express = require('express');
const logger = require('../utils/logger');
const { testConnection } = require('../config/database');

// Import route modules
const authRoutes = require('../modules/auth/auth.routes');
const userRoutes = require('../modules/users/user.routes');
const deviceRoutes = require('../modules/devices/device.routes');
const attendanceRoutes = require('../modules/attendance/attendance.routes');
const scheduleRoutes = require('../modules/schedules/schedule.routes');
const leaveRoutes = require('../modules/leaves/leave.routes');
const chatRoutes = require('../modules/chat/chat.routes');
const announcementRoutes = require('../modules/announcements/announcement.routes');
const auditRoutes = require('../modules/audit/audit.routes');
const dashboardRoutes = require('../modules/dashboard/dashboard.routes');
const notificationRoutes = require('../modules/notifications/notification.routes');
const ruleRoutes = require('../modules/rules/rule.routes');
const adminRoutes = require('../modules/admin/admin.routes');
const hrRoutes = require('../modules/hr/hr.routes');
const roleRoutes = require('../modules/roles/role.routes');
const analyticsRoutes = require('../modules/analytics/analytics.routes');
const integrationRoutes = require('../modules/integrations/integration.routes');
const uploadRoutes = require('../modules/uploads/upload.routes');
const salaryRoutes    = require('../modules/salary/salary.routes');
const holidayRoutes   = require('../modules/holidays/holiday.routes');

const mountRoutes = (app) => {
  const api = express.Router();

  // ── Health check — used by Docker, load balancers, and uptime monitors ──────
  api.get('/health', async (req, res) => {
    const checks = { status: 'ok', uptime: Math.floor(process.uptime()), timestamp: new Date().toISOString() };

    // DB
    try {
      await testConnection();
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
      checks.status = 'degraded';
    }

    // Redis
    const getRedisStatus = req.app.get('redisStatus');
    checks.redis = getRedisStatus ? getRedisStatus() : 'not_configured';
    if (checks.redis !== 'ok' && checks.redis !== 'not_configured') {
      checks.status = 'degraded';
    }

    const code = checks.status === 'ok' ? 200 : 503;
    res.status(code).json(checks);
  });

  // Mount all module routes
  api.use('/auth', authRoutes);
  api.use('/users', userRoutes);
  api.use('/devices', deviceRoutes);
  api.use('/attendance', attendanceRoutes);
  api.use('/schedules', scheduleRoutes);
  api.use('/leaves', leaveRoutes);
  api.use('/chat', chatRoutes);
  api.use('/announcements', announcementRoutes);
  api.use('/audit', auditRoutes);
  api.use('/dashboard', dashboardRoutes);
  api.use('/notifications', notificationRoutes);
  api.use('/rules', ruleRoutes);
  api.use('/roles', roleRoutes);
  api.use('/analytics', analyticsRoutes);
  api.use('/integrations', integrationRoutes);
  api.use('/admin', adminRoutes);
  api.use('/hr', hrRoutes);
  api.use('/uploads', uploadRoutes);
  api.use('/salary',   salaryRoutes);
  api.use('/holidays', holidayRoutes);
  api.use('/offices', require('../modules/offices/office.routes'));

  // Mount API router
  app.use('/api', api);

  // Serve uploaded files statically (leave documents, etc.)
  const path = require('path');
  app.use('/uploads', express.static(path.join(__dirname, '../../../uploads')));

  logger.info('✅ API Gateway initialized - All routes mounted');
};

module.exports = { mountRoutes };
