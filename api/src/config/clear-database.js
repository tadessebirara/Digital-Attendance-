const { query } = require('./database');
const logger = require('../utils/logger');

const clearDatabase = async () => {
  try {
    logger.info('🗑️  Starting database cleanup...');

    // List of tables to clear (in order of dependencies)
    const tables = [
      'chat_messages',
      'chat_rooms',
      'notifications',
      'audit_logs',
      'leave_requests',
      'user_schedules',
      'attendance_records',
      'devices',
      'announcements',
      'attendance_rules',
      'system_settings',
      'offices',
      'qr_codes',
      'tokens',
      'migrations',
      'integrations',
      'roles',
      'users'
    ];

    for (const table of tables) {
      try {
        await query(`DELETE FROM ${table}`);
        logger.info(`✅ Cleared table: ${table}`);
      } catch (error) {
        logger.warn(`⚠️  Could not clear table ${table}: ${error.message}`);
      }
    }

    // Reset sequences
    try {
      await query(`SELECT setval('users_id_seq', 1, false)`);
      await query(`SELECT setval('attendance_records_id_seq', 1, false)`);
      await query(`SELECT setval('leave_requests_id_seq', 1, false)`);
      await query(`SELECT setval('devices_id_seq', 1, false)`);
      await query(`SELECT setval('announcements_id_seq', 1, false)`);
      await query(`SELECT setval('chat_messages_id_seq', 1, false)`);
      await query(`SELECT setval('chat_rooms_id_seq', 1, false)`);
      await query(`SELECT setval('notifications_id_seq', 1, false)`);
      await query(`SELECT setval('audit_logs_id_seq', 1, false)`);
      logger.info('✅ Reset all sequences');
    } catch (error) {
      logger.warn(`⚠️  Could not reset sequences: ${error.message}`);
    }

    logger.info('🎉 Database cleanup completed successfully');
  } catch (error) {
    logger.error('❌ Database cleanup failed:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  clearDatabase();
}

module.exports = { clearDatabase };
