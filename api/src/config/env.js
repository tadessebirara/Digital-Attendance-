const { z } = require('zod');
const logger = require('../utils/logger');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_ENV: z.string().optional(),
  DEV_MODE: z.string().optional(),
  ALLOW_EMULATOR: z.string().optional(),
  ALLOW_MULTI_LOGIN_TESTING: z.string().optional(),
  ACTIVATION_OTP_MINUTES: z.string().optional(),
  MOBILE_VERIFY_EMAIL_URL: z.string().optional(),
  PORT: z.string().default('5000'),
  // Accept either DATABASE_URL (Render/Heroku) or individual DB vars
  DATABASE_URL: z.string().optional(),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DB_HOST: z.string().optional(),
  DB_NAME: z.string().optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  DEVICE_SECRET: z.string().min(32, 'DEVICE_SECRET must be at least 32 characters'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173'),
  REDIS_URL: z.string().optional(),
  EMAIL_SERVICE: z.string().optional(),
  EMAIL_USER: z.string().optional(),
  EMAIL_PASS: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  // Firebase Cloud Messaging (optional — push notifications disabled if unset)
  FIREBASE_PROJECT_ID:    z.string().optional(),
  FIREBASE_PRIVATE_KEY:   z.string().optional(),
  FIREBASE_CLIENT_EMAIL:  z.string().optional(),
  // File uploads
  BASE_URL:    z.string().optional(),
  UPLOAD_DIR:  z.string().optional(),
  MAX_FILE_SIZE: z.string().optional(),
});

const validateEnv = () => {
  try {
    const parsed = envSchema.parse(process.env);

    // Must have either DATABASE_URL or all individual DB vars
    if (!parsed.DATABASE_URL && (!parsed.DB_HOST || !parsed.DB_USER || !parsed.DB_NAME)) {
      console.error('❌ Invalid environment variables:');
      console.error('   - Provide DATABASE_URL or all of: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME');
      process.exit(1);
    }

    logger.info('✅ Environment variables validated');
    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Invalid environment variables:');
      error.errors.forEach(err => {
        console.error(`   - ${err.path.join('.')}: ${err.message}`);
      });
      process.exit(1);
    }
    throw error;
  }
};

module.exports = { validateEnv };
