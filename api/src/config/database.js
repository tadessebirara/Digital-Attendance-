const { Pool } = require('pg');
const logger = require('../utils/logger');

// Support both DATABASE_URL (Render/Heroku style) and individual vars
function buildPoolConfig() {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20,
      min: 2,
      idleTimeoutMillis: 60000,
      connectionTimeoutMillis: 10000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    };
  }
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'alyah_smart_attendance',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    max: 20,
    min: 2,
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 10000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  };
}

const pool = new Pool(buildPoolConfig());

// Test connection
const testConnection = async () => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    logger.info('✅ Database connected successfully');
    return true;
  } catch (error) {
    logger.error('❌ Database connection failed:', error.message);
    return false;
  }
};

// Query helper
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Query executed', { text: text.substring(0, 50), duration, rows: result.rowCount });
    return result;
  } catch (error) {
    logger.error('Query error:', { text: text.substring(0, 50), error: error.message });
    throw error;
  }
};

// Transaction helper
const transaction = async (callback, sessionContext = null) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // If session context is provided, set LOCAL variables for this transaction.
    // These are scoped to the transaction only (SET LOCAL) and are automatically
    // cleared on COMMIT or ROLLBACK — no cleanup required.
    // Used by the attendance trigger to derive write_context and log actor info.
    if (sessionContext) {
      const { actorRole, actorId, rulesVersion = 'v2' } = sessionContext;
      if (actorRole) {
        await client.query(`SELECT set_config('app.actor_role', $1, true)`, [actorRole]);
      }
      if (actorId != null) {
        await client.query(`SELECT set_config('app.actor_id', $1, true)`, [String(actorId)]);
      }
      await client.query(`SELECT set_config('app.rules_version', $1, true)`, [rulesVersion]);
    }

    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Get a client from the pool
const getClient = () => pool.connect();

module.exports = {
  pool,
  query,
  transaction,
  getClient,
  testConnection
};
