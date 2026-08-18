require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { query, transaction } = require('./database');
const logger = require('../utils/logger');

const runMigrations = async () => {
  try {
    logger.info('Starting database migrations...');

    await query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const { rows: executedMigrations } = await query('SELECT name FROM migrations');
    const executedSet = new Set(executedMigrations.map((m) => m.name));

    const migrationsDir = path.join(__dirname, '../../database/migrations');
    if (!fs.existsSync(migrationsDir)) {
      throw new Error(`Migrations directory not found: ${migrationsDir}`);
    }

    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    if (migrationFiles.length === 0) {
      throw new Error(`No migration files found in ${migrationsDir}`);
    }

    logger.info(`Found ${migrationFiles.length} migration files`);

    for (const file of migrationFiles) {
      if (executedSet.has(file)) {
        logger.info(`Skipping ${file} (already executed)`);
        continue;
      }

      logger.info(`Executing migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      // Run the SQL directly (not in a transaction) so DDL statements like
      // CREATE TABLE + CREATE INDEX can coexist. Then record completion separately.
      const client = await require('./database').getClient();
      try {
        await client.query(sql);
        await client.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
      } finally {
        client.release();
      }

      logger.info(`Migration ${file} completed`);
    }

    logger.info('All migrations completed successfully');
  } catch (error) {
    logger.error('Migration failed:', error);
    if (require.main === module) {
      process.exit(1);
    }
    throw error;
  }
};

if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations };
