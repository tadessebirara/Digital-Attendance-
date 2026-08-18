require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { Server } = require('socket.io');
const { validateEnv } = require('./src/config/env');
validateEnv();

const { testConnection, query } = require('./src/config/database');
const logger = require('./src/utils/logger');
const socketHandler = require('./src/services/socket.service');
const { startCleanupJob } = require('./src/services/cleanup.service');

// Import routes
const apiGateway = require('./src/gateway/api.gateway');

const app = express();
const server = http.createServer(app);

const socketAuth = require('./src/middleware/socket-auth.middleware');
const standardizeResponse = require('./src/middleware/standardize-response.middleware');
const cookieParser = require('cookie-parser');

function parseCorsOrigins() {
  const raw =
    process.env.CORS_ORIGINS ||
    'http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

const corsOriginFn = (origin, cb) => {
  const allowed = parseCorsOrigins();
  if (!origin) return cb(null, true);
  // Allow any localhost/127.0.0.1 origin (covers Flutter web random ports)
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);
  cb(null, allowed.includes(origin));
};

// Body parsing middleware
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(cookieParser());
app.use(standardizeResponse);



const { createAdapter } = require('@socket.io/redis-adapter');
const Redis = require('ioredis');

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: corsOriginFn,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Redis Adapter for Scaling
let redisStatus = 'not_configured';
if (process.env.REDIS_URL) {
  try {
    const pubClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      retryStrategy: (times) => {
        if (times > 3) {
          logger.warn('[Redis] retry limit reached, disabling Redis adapter');
          redisStatus = 'retry_limit_reached';
          return null;
        }
        return Math.min(times * 500, 2000);
      }
    });
    const subClient = pubClient.duplicate();
    pubClient.on('error', (err) => logger.warn('[Redis pub]', err.message));
    subClient.on('error', (err) => logger.warn('[Redis sub]', err.message));
    pubClient.on('connect', () => { redisStatus = 'ok'; });
    pubClient.on('end', () => { redisStatus = 'disconnected'; logger.warn('[Redis] connection closed'); });
    io.adapter(createAdapter(pubClient, subClient));
    redisStatus = 'connecting';
    logger.info('? Socket.IO Redis adapter initialized');
  } catch (e) {
    redisStatus = 'error';
    logger.error('[Redis Adapter] Failed to initialize — running without adapter:', e.message);
  }
}
app.set('redisStatus', () => redisStatus);


// ?? ENTERPRISE SECURITY: Socket.IO Handshake Authentication
io.use(socketAuth);

const requestTracker = require('./src/middleware/request-tracker.middleware');
app.use(requestTracker);

app.use(cors({
  origin: corsOriginFn,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Device-ID',
    'X-Device-Signature',
    'X-Device-Version'
  ]
}));

// Security middleware with strict CSP
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://*"],
      // Allow OpenStreetMap iframes for the geofence map preview
      frameSrc: ["https://www.openstreetmap.org"],
      connectSrc: ["'self'", "ws:", "wss:", process.env.VITE_API_URL || "*"]
    },
  },
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Stricter limits on authentication surface (stacked before global /api limiter)
const authLimiter = rateLimit({
  windowMs: 60 * 1000,       // 1 minute window
  max: 30,                   // 30 attempts per IP per minute (dev-friendly)
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    error: 'Too many authentication attempts. Please wait 1 minute before trying again.',
    code: 'AUTH_RATE_LIMIT_EXCEEDED'
  }
});

// Slightly looser limit for token refresh (mobile apps refresh frequently)
const refreshLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many refresh attempts. Please wait before retrying.',
    code: 'REFRESH_RATE_LIMIT_EXCEEDED'
  }
});

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,                 // raised for dev — mobile app makes many calls on startup
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.originalUrl.split('?')[0].startsWith('/api/auth'),
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again after 15 minutes',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/verify-device-otp', authLimiter);
app.use('/api/auth/refresh', refreshLimiter);
app.use('/api/auth', authLimiter);
app.use('/api/', globalLimiter);

app.use(compression());

// Logging
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Make io available to routes
app.set('io', io);

// Mount all routes through API Gateway
apiGateway.mountRoutes(app);

// Socket.IO connection handling
socketHandler.initialize(io);

const errorHandler = require('./src/middleware/error.middleware');

// Error handling middleware
app.use(errorHandler);


// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

const PORT = process.env.PORT || 5000;

const { runMigrations } = require('./src/config/migrate');
const { runSeeds } = require('./src/config/seed');

// Test database connection before starting server
testConnection().then(async (connected) => {
  if (connected) {
    // Safety net: create critical tables individually — each in its own try/catch
    const safeQuery = async (sql) => { try { await query(sql); } catch (_) {} };
    await safeQuery(`CREATE TABLE IF NOT EXISTS refresh_tokens (
      id SERIAL PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(255) UNIQUE NOT NULL, expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, revoked_at TIMESTAMP NULL,
      device_id VARCHAR(255) NULL, ip_address VARCHAR(45) NULL, user_agent TEXT NULL,
      reuse_detected BOOLEAN NOT NULL DEFAULT FALSE, session_id UUID NULL, revoked_reason VARCHAR(50) NULL
    )`);
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id)`);
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens (token)`);
    await safeQuery(`CREATE TABLE IF NOT EXISTS device_keys (
      id SERIAL PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id VARCHAR(255) NOT NULL, device_key VARCHAR(128) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), revoked_at TIMESTAMP NULL, UNIQUE (user_id, device_id)
    )`);
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_device_keys_lookup ON device_keys (user_id, device_id) WHERE revoked_at IS NULL`);
    await safeQuery(`CREATE TABLE IF NOT EXISTS device_otp (
      id SERIAL PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id VARCHAR(255) NOT NULL, otp_code VARCHAR(10) NOT NULL,
      expires_at TIMESTAMP NOT NULL, used_at TIMESTAMP NULL,
      attempts INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await safeQuery(`CREATE TABLE IF NOT EXISTS session_tracking (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_id UUID,
      device_id VARCHAR(255),
      ip_address VARCHAR(45),
      user_agent TEXT,
      token_hash VARCHAR(255),
      last_activity TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ
    )`);
    await safeQuery(`CREATE TABLE IF NOT EXISTS token_blacklist (
      id SERIAL PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMP NOT NULL,
      reason VARCHAR(50) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await safeQuery(`ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1`);
    await safeQuery(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE`);
    await safeQuery(`ALTER TABLE users ADD COLUMN IF NOT EXISTS activation_requires_password BOOLEAN NOT NULL DEFAULT FALSE`);
    await safeQuery(`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_login BOOLEAN DEFAULT TRUE`);
    await safeQuery(`ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_device_id VARCHAR(255) NULL`);
    await safeQuery(`ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by VARCHAR(50) NULL`);
    // Salary column — required by salary.service, salary.controller, hr.controller
    await safeQuery(`ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_salary NUMERIC(12,2) NOT NULL DEFAULT 0`);
    await safeQuery(`ALTER TABLE users ADD COLUMN IF NOT EXISTS working_time_type VARCHAR(20) NULL`);
    await safeQuery(`ALTER TABLE users ADD COLUMN IF NOT EXISTS working_days_per_week INTEGER NULL`);
    await safeQuery(`ALTER TABLE users ADD COLUMN IF NOT EXISTS working_hours_per_day NUMERIC(4,1) NULL`);
    // user_devices columns used by login device registration
    await safeQuery(`ALTER TABLE user_devices ADD COLUMN IF NOT EXISTS device_hash    VARCHAR(255) NULL`);
    await safeQuery(`ALTER TABLE user_devices ADD COLUMN IF NOT EXISTS device_os      VARCHAR(100) NULL`);
    await safeQuery(`ALTER TABLE user_devices ADD COLUMN IF NOT EXISTS device_type    VARCHAR(50)  NULL DEFAULT 'mobile'`);
    await safeQuery(`ALTER TABLE user_devices ADD COLUMN IF NOT EXISTS last_used      TIMESTAMP    NULL`);
    await safeQuery(`ALTER TABLE user_devices ADD COLUMN IF NOT EXISTS is_trusted     BOOLEAN      NOT NULL DEFAULT FALSE`);
    await safeQuery(`ALTER TABLE user_devices ADD COLUMN IF NOT EXISTS device_version INTEGER      NOT NULL DEFAULT 0`);
    // device_otp verified_at used by registration flow
    await safeQuery(`ALTER TABLE device_otp ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP NULL`);
    // session_tracking columns used by login token issuance
    await safeQuery(`ALTER TABLE session_tracking ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP    NULL`);
    await safeQuery(`ALTER TABLE session_tracking ADD COLUMN IF NOT EXISTS device_id  VARCHAR(255) NULL`);
    await safeQuery(`ALTER TABLE session_tracking ADD COLUMN IF NOT EXISTS session_id UUID         NULL`);
    await safeQuery(`ALTER TABLE session_tracking ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP    NULL`);
    // login_attempts and security_alerts tables used by security.service
    await safeQuery(`CREATE TABLE IF NOT EXISTS login_attempts (
      id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE SET NULL,
      email VARCHAR(255) NOT NULL, ip_address VARCHAR(45) NULL, device_id VARCHAR(255) NULL,
      user_agent TEXT NULL, status VARCHAR(20) NOT NULL DEFAULT 'FAILED',
      failure_reason VARCHAR(50) NULL, created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`);
    await safeQuery(`CREATE TABLE IF NOT EXISTS security_alerts (
      id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE SET NULL,
      alert_type VARCHAR(50) NOT NULL, severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
      title VARCHAR(255) NOT NULL, message TEXT NOT NULL, metadata JSONB NULL,
      ip_address VARCHAR(45) NULL, device_id VARCHAR(255) NULL,
      is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
      resolved_by INT REFERENCES users(id), resolved_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`);
    // notifications extra columns
    await safeQuery(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS category VARCHAR(50) NULL`);
    await safeQuery(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS severity VARCHAR(20) NULL`);
    await safeQuery(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata JSONB       NULL`);
    // Ensure suspicious_activities table exists (used by analytics)
    await safeQuery(`CREATE TABLE IF NOT EXISTS suspicious_activities (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      activity_type VARCHAR(50) NOT NULL,
      details TEXT,
      ip_address VARCHAR(45),
      severity VARCHAR(20) DEFAULT 'MEDIUM',
      is_resolved BOOLEAN DEFAULT FALSE,
      resolved_by INT REFERENCES users(id),
      resolved_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    logger.info('? Safety net complete');

    // Auto-run migrations on every startup. A migration failure means the
    // runtime schema is unknown, so abort instead of serving partial behavior.
    await runMigrations();
    logger.info('? Migrations complete');

    // Auto-seed only if no admin user exists yet
    try {
      await runSeeds();
      logger.info('? Seed complete');
    } catch (err) {
      logger.warn('[Seed] skipped or partial:', err.message);
    }
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`? Port ${PORT} is already in use. Find and kill it:\n  netstat -ano | findstr :${PORT}\n  taskkill /PID <PID> /F`);
        process.exit(1);
      } else {
        throw err;
      }
    });

    const shutdown = (signal) => {
      logger.info(`${signal} received — shutting down gracefully`);
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10000).unref();
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    server.listen(PORT, '0.0.0.0', () => {
      logger.info(`
+------------------------------------------------------------+
¦         ?? ALYAH SMART ATTENDANCE - ENTERPRISE EDITION       ¦
¦------------------------------------------------------------¦
¦   ?? Mobile API:    http://0.0.0.0:${PORT}/api              ¦
¦   ?? Web API:       http://localhost:${PORT}/api            ¦
¦   ?? Health Check:  http://localhost:${PORT}/api/health     ¦
¦   ?? WebSocket:     ws://localhost:${PORT}                    ¦
¦   ???  Database:      PostgreSQL (alyah_smart_attendance)      ¦
+------------------------------------------------------------+
      `);
    });

    // Start background cleanup job (runs immediately + daily at 03:00)
    startCleanupJob(io);

    // Log optional feature status
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_PRIVATE_KEY) {
      logger.warn('[Firebase] FCM not configured — push notifications disabled. Set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL in .env to enable.');
    }
    if (!process.env.SMTP_HOST) {
      logger.warn('[Email] SMTP not configured — emails will be logged only (dev mode). Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env to enable.');
    }
    if (!process.env.REDIS_URL) {
      logger.info('[Redis] Not configured — Socket.IO running in single-instance mode. Set REDIS_URL for multi-instance scaling.');
    }
  } else {
    logger.error('? Failed to connect to database. Server not started.');
    process.exit(1);
  }
}).catch((error) => {
  logger.error('? Server startup error:', error);
  process.exit(1);
});

module.exports = { app, io, server };
