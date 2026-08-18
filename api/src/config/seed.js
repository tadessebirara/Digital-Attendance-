require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { query } = require('./database');
const logger = require('../utils/logger');
const bcrypt = require('bcryptjs');

// ─── Seed system roles (always runs — idempotent) ─────────────────────────────
async function seedRoles() {
  const systemRoles = [
    {
      name: 'ADMIN',
      description: 'Full system access — manage users, settings, security and all data',
      permissions: JSON.stringify([
        'users.view','users.create','users.edit','users.delete',
        'attendance.view','attendance.edit','attendance.export',
        'leaves.view','leaves.approve','leaves.reject',
        'announcements.view','announcements.create','announcements.edit','announcements.delete',
        'reports.view','reports.export',
        'settings.view','settings.edit',
        'roles.view','roles.create','roles.edit','roles.delete',
        'audit.view','chat.view','chat.send',
        'schedules.view','schedules.edit','notifications.view',
      ])
    },
    {
      name: 'HR',
      description: 'HR management — employees, attendance, leaves and announcements',
      permissions: JSON.stringify([
        'users.view','users.create','users.edit',
        'attendance.view','attendance.edit','attendance.export',
        'leaves.view','leaves.approve','leaves.reject',
        'announcements.view','announcements.create','announcements.edit',
        'reports.view','reports.export',
        'chat.view','chat.send','schedules.view','schedules.edit','notifications.view',
      ])
    },
    {
      name: 'EMPLOYEE',
      description: 'Employee access — check-in/out, leaves, schedule and chat',
      permissions: JSON.stringify([
        'attendance.view','leaves.view','leaves.create',
        'announcements.view','chat.view','chat.send',
        'schedules.view','notifications.view',
      ])
    }
  ];

  for (const role of systemRoles) {
    await query(`
      INSERT INTO roles (name, description, permissions)
      VALUES ($1, $2, $3::jsonb)
      ON CONFLICT (name) DO UPDATE SET
        description = EXCLUDED.description,
        permissions = EXCLUDED.permissions
    `, [role.name, role.description, role.permissions]);
  }
  logger.info('✅ System roles seeded (ADMIN, HR, EMPLOYEE)');
}

async function seedSystemSettings() {
  const settings = [
    { key: 'COMPANY_NAME',    value: process.env.COMPANY_NAME || 'Alyah Smart Attendance', desc: 'Company name' },
    { key: 'TIMEZONE',        value: process.env.TZ || 'Africa/Addis_Ababa',        desc: 'System timezone' },
    { key: 'DATE_FORMAT',     value: 'YYYY-MM-DD',  desc: 'Date format' },
    { key: 'TIME_FORMAT',     value: '24H',          desc: 'Time format' },
    { key: 'CURRENCY',        value: 'ETB',          desc: 'Currency for payroll' },
    { key: 'LANGUAGE',        value: 'en',           desc: 'Default language' },
    { key: 'MAX_LOGIN_ATTEMPTS',      value: '5',  desc: 'Max failed login attempts before lockout' },
    { key: 'LOCKOUT_DURATION_MINUTES', value: '30', desc: 'Account lockout duration in minutes' },
  ];
  for (const s of settings) {
    await query(
      `INSERT INTO system_settings (setting_key, setting_value, description)
       VALUES ($1, $2, $3) ON CONFLICT (setting_key) DO NOTHING`,
      [s.key, s.value, s.desc]
    );
  }
  logger.info('✅ System settings seeded');
}

const runSeeds = async () => {
  try {
    logger.info('🌱 Starting database seeding...');
    // Check if admin already exists
    const { rows: existingAdmin } = await query(
      "SELECT id FROM users WHERE email = 'admin@system.com'"
    );

    // Always seed roles regardless of whether admin exists
    await seedRoles();

    if (existingAdmin.length > 0) {
      logger.info('⚠️  Admin user already exists, skipping user seed');
      // Still seed roles even if admin exists
      await seedRoles();
      await seedSystemSettings();
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash('Admin@123', 12);

    // Insert default admin only
    await query(`
      INSERT INTO users (
        email, password, first_name, last_name, role, status, employee_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (email) DO NOTHING
    `, [
      'admin@system.com',
      hashedPassword,
      'System',
      'Administrator',
      'ADMIN',
      'ACTIVE',
      'EMP001'
    ]);

    logger.info('✅ Admin user created — email: admin@system.com / password: Admin@123');

    await seedRoles();
    await seedSystemSettings();

    logger.info('🎉 Database seeding completed successfully');
  } catch (error) {
    logger.error('❌ Seeding failed:', error.message);
    if (require.main === module) {
      process.exit(1);
    }
    throw error;
  }
};

if (require.main === module) {
  runSeeds();
}

module.exports = { runSeeds };
