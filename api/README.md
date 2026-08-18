# Alyah Smart Attendance — Backend API

Node.js + Express REST API with Socket.IO real-time, PostgreSQL, and Redis.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Create your .env file (see full template below)
copy .env.example .env      # Windows
cp .env.example .env        # Mac/Linux

# 3. Start the server
node server.js
```

Server starts at `http://localhost:5000`  
Health check: `http://localhost:5000/api/health`

---

## .env Setup — Copy this exactly

Create a file called `.env` in this folder (`api/.env`) and paste:

```env
# Server
PORT=5000
NODE_ENV=development

# Database (local PostgreSQL)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=alyah_smart_attendance
DB_USER=postgres
DB_PASSWORD=your_postgres_password

# Security — generate with:
# node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=paste_64_char_random_string_here
JWT_EXPIRES_IN=8h
DEVICE_SECRET=paste_different_64_char_random_string_here
REFRESH_EXPIRES_MINUTES=10080

# Seed endpoint secret (any string you choose)
SEED_SECRET=alyah-seed-2026

# Frontend URLs
FRONTEND_URL=http://localhost:3000
MOBILE_DEEP_LINK_URL=alyah://reset-password
MOBILE_VERIFY_EMAIL_URL=alyah://verify-email

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:8080

# Email (Gmail SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_gmail@gmail.com
SMTP_PASS=your_gmail_app_password
SMTP_FROM=Alyah Smart Attendance <your_gmail@gmail.com>

# Company
COMPANY_NAME=Alyah Smart Attendance

# Rate limiting
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION_MINUTES=30
RATE_LIMIT_MAX_REQUESTS=1000

# File uploads
MAX_FILE_SIZE=5242880
UPLOAD_DIR=uploads
```

### How to generate JWT_SECRET and DEVICE_SECRET

Run this command twice (use different values for each):
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### How to get Gmail App Password

1. Go to [myaccount.google.com](https://myaccount.google.com)
2. Security → 2-Step Verification → App passwords
3. Create one for "Mail" → copy the 16-character password
4. Paste it as `SMTP_PASS`

---

## First-time database setup

After the server starts it automatically runs all migrations and seeds the DB.

To manually seed users, open in browser:
```
http://localhost:5000/api/admin/run-seed?secret=alyah-seed-2026
```

---

## Default credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@system.com` | `Admin@123` |
| HR | `hr@company.com` | `Hr@123` |
| Employee | `employee@company.com` | `Employee@123` |

**Change these after first login.**

---

## API endpoints

All routes under `/api/`:

| Prefix | Description |
|--------|-------------|
| `/auth` | Login, register, OTP, device management |
| `/users` | User CRUD |
| `/attendance` | Check-in/out, QR, GPS |
| `/schedules` | Work schedules |
| `/leaves` | Leave requests |
| `/chat` | Real-time messaging |
| `/announcements` | Company announcements |
| `/notifications` | Push notifications |
| `/analytics` | Reports and charts |
| `/admin` | System settings, security |
| `/hr` | HR operations |
| `/audit` | Audit logs |
