const cron = require('node-cron');
const { query } = require('../config/database');
const logger = require('../utils/logger');
const { publishScheduled } = require('../modules/announcements/announcement.controller');
const { runAttendanceReconciliation } = require('./attendance-worker.service');

/**
 * Purges expired/used rows from security tables so the DB doesn't grow unbounded.
 *
 * Targets:
 *   password_reset_tokens — expired OR already used
 *   token_blacklist       — past their expires_at
 *   refresh_tokens        — expired OR revoked more than 7 days ago
 *
 * Schedule: every day at 03:00 (low-traffic window).
 * A startup run is also performed so stale rows from a long downtime are cleared immediately.
 */

async function runCleanup() {
  const start = Date.now();
  logger.info('[Cleanup] Starting expired token cleanup...');

  try {
    // ── 1. Password reset tokens: expired or used ─────────────────────────────
    const { rowCount: prtDeleted } = await query(
      `DELETE FROM password_reset_tokens
       WHERE expires_at < NOW()
          OR used_at IS NOT NULL`
    );

    // ── 2. Token blacklist: past expiry ───────────────────────────────────────
    const { rowCount: blDeleted } = await query(
      `DELETE FROM token_blacklist
       WHERE expires_at < NOW()`
    );

    // ── 3. Refresh tokens: expired or revoked > 7 days ago ───────────────────
    //    Keep recently-revoked ones briefly so reuse-detection still works.
    const { rowCount: rtDeleted } = await query(
      `DELETE FROM refresh_tokens
       WHERE expires_at < NOW()
          OR (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '7 days')`
    );

    const elapsed = Date.now() - start;
    logger.info(
      `[Cleanup] Done in ${elapsed}ms — ` +
      `reset_tokens: ${prtDeleted}, blacklist: ${blDeleted}, refresh_tokens: ${rtDeleted}`
    );
  } catch (error) {
    logger.error('[Cleanup] Token cleanup failed:', error.message);
    // Non-fatal — log and continue; next scheduled run will retry
  }
}

/**
 * Registers the cron schedule and runs an immediate cleanup on startup.
 * Call once from server.js after the DB connection is confirmed.
 */
function startCleanupJob(io) {
  // Run immediately on startup to clear any backlog from downtime
  runCleanup();

  // Publish any scheduled announcements whose time has arrived — every minute
  cron.schedule('* * * * *', () => publishScheduled(io), { scheduled: true });

  // Attendance auto-absent / missed-checkout / auto-checkout — every 5 minutes
  cron.schedule('*/5 * * * *', () => runAttendanceReconciliation(io), { scheduled: true });

  // Then run every day at 03:00 server time
  cron.schedule('0 3 * * *', runCleanup, {
    scheduled: true,
    timezone: process.env.TZ || 'UTC',
  });

  logger.info('[Cleanup] Token cleanup job scheduled (daily at 03:00 UTC)');
  logger.info('[Cleanup] Scheduled announcement publisher running every minute');
  logger.info('[Cleanup] Attendance reconciliation worker running every 5 minutes');
}

module.exports = { startCleanupJob, runCleanup };
