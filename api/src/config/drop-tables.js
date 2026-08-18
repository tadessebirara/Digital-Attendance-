const { query } = require('./database');
const logger = require('../utils/logger');

const dropAllTables = async () => {
  try {
    logger.info('🗑️  Dropping all tables...');

    // Disable foreign key constraints temporarily
    await query('SET CONSTRAINTS ALL DEFERRED');

    // List of tables to drop (in reverse order of dependencies)
    const tables = [
      'migrations',
      'roles',
      'integrations',
      'tokens',
      'qr_codes',
      'offices',
      'system_settings',
      'attendance_rules',
      'announcements',
      'devices',
      'user_schedules',
      'attendance_records',
      'leave_requests',
      'leave_balances',
      'notifications',
      'audit_logs',
      'chat_messages',
      'chat_rooms',
      'users'
    ];

    for (const table of tables) {
      try {
        await query(`DROP TABLE IF EXISTS ${table} CASCADE`);
        logger.info(`✅ Dropped table: ${table}`);
      } catch (error) {
        logger.warn(`⚠️  Could not drop table ${table}: ${error.message}`);
      }
    }

    logger.info('🎉 All tables dropped successfully');
  } catch (error) {
    logger.error('❌ Failed to drop tables:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  dropAllTables();
}

module.exports = { dropAllTables };
