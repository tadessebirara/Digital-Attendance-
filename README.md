<div align="center">

# Alyah Smart Attendance
### Alyah Smart Attendance — Enterprise Workforce Management System

[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Flutter](https://img.shields.io/badge/Flutter-3.24-02569B?logo=flutter&logoColor=white)](https://flutter.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

A production-deployed, full-stack attendance management system with GPS geofencing, QR code verification, cryptographic device binding, real-time HR notifications, and a complete audit trail.

**[Live API](https://digital-attendance-system-giw9.onrender.com/api/health)** · **[Setup Guide](SETUP.md)** · **[Full SRS](docs/SRS.md)**

</div>

---

## What is this?

Alyah Smart Attendance is a three-platform workforce management system built for [Alyah Technologies](https://github.com/Alyah-Digital-Attendance-Team). It replaces paper registers and fragmented tools with a single, auditable platform covering the complete employee attendance lifecycle:

- Employees check in via the **Flutter mobile app** using GPS location or QR code scan
- HR and Admin manage everything through the **React web dashboard**
- A **Node.js/PostgreSQL API** enforces business rules, handles real-time events via Socket.IO, and maintains a full audit log of every action

The system is live in production on Render and handles multi-source attendance writes through a PostgreSQL trigger-based conflict resolution model.

---

## Feature Overview

| Area | What's built |
|---|---|
| **Authentication** | JWT + refresh token rotation, 2FA via email OTP, device OTP, forgot/reset password, brute-force lockout |
| **Device Security** | Single-device binding per employee, HMAC-SHA256 per-device key provisioning, key rotation, admin-forced device reset |
| **GPS Attendance** | Check-in/out with Haversine distance validation against configurable office coordinates and per-employee radius |
| **QR Attendance** | HMAC-signed, nonce-based, time-limited QR tokens — one-time use, rotating secret |
| **Offline Sync** | Attendance recorded offline is synced on reconnect with trigger-enforced precedence (MANUAL > LEAVE > REALTIME > OFFLINE) |
| **Leave Management** | Submit with document upload, HR approval workflow, automatic ABSENT → EXCUSED reconciliation, balance tracking |
| **Work Schedules** | Per-employee daily schedules (REGULAR / FLEXIBLE / SHIFT / CUSTOM), overnight shifts, bulk assignment, real-time push to device |
| **Real-time Events** | Socket.IO rooms per role — check-in/out, leave approvals, new messages, schedule changes delivered live |
| **Announcements** | Role-targeted posts (Admin / HR / Employee / All), scheduled publishing, expiry, view-count tracking |
| **Chat** | Employee ↔ HR direct messaging with unread badges and real-time delivery |
| **Analytics** | Attendance log, summary, late arrivals, absent, leave summary, overtime — all with CSV export and charts |
| **Audit Logging** | Every system action logged with user, IP, entity, severity, and details JSON — full-text searchable |
| **Admin Controls** | System settings, QR secret rotation, security alerts, user/role management |
| **Notifications** | In-app notification feed + Firebase Cloud Messaging (push) integration |

---

## Tech Stack

```
Backend       Node.js 20 · Express.js · Socket.IO · PostgreSQL 15 · Redis
Web           React 18 · TypeScript · Tailwind CSS · Vite · Recharts
Mobile        Flutter 3 · Dart · Provider · Socket.IO Client
Security      JWT · bcrypt (cost 12) · Helmet · HMAC-SHA256 · Zod validation
DevOps        Docker · Docker Compose · Render (cloud) · GitHub Actions
Tooling       Turborepo · Winston · Nodemailer · Firebase Admin · node-cron
```

---

## Repository Structure

```
attendance-pro-flow/
├── api/                  # Node.js REST API + Socket.IO server
│   ├── src/
│   │   ├── modules/      # auth, attendance, leaves, schedules, users,
│   │   │                 # hr, admin, devices, notifications, announcements,
│   │   │                 # chat, dashboard, analytics, audit, uploads …
│   │   ├── middleware/
│   │   ├── services/
│   │   ├── gateway/
│   │   └── config/
│   ├── database/
│   │   ├── migrations/   # 001–033 SQL migrations (single source of truth)
│   │   └── seeds/
│   ├── scripts/          # one-off debug/fix scripts
│   ├── tests/
│   └── server.js
├── web/                  # React 18 + TypeScript dashboard (HR / Admin)
├── mobile/               # Flutter 3 mobile app (Employee)
├── docs/                 # SRS, setup guides, redis notes
└── README.md
```

---

## Quick Start

> For a full walkthrough see **[SETUP.md](SETUP.md)**. Steps below get you running in under 5 minutes.

### Prerequisites

- [Node.js 20+](https://nodejs.org)
- [PostgreSQL 15](https://www.postgresql.org/download/)
- [Flutter 3.24](https://flutter.dev/docs/get-started/install) *(mobile only)*

### 1. Clone

```bash
git clone https://github.com/Alyah-Digital-Attendance-Team/Digital-Attendance-System.git
cd Digital-Attendance-System
```

### 2. Backend

```bash
cd api
npm install
cp .env.example .env        # Windows: copy .env.example .env
```

Open `.env` and set these three values:

```env
DB_PASSWORD=your_postgres_password
JWT_SECRET=<64-char random string>
DEVICE_SECRET=<different 64-char random string>
```

Generate secrets with:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Create the database, then start:
```bash
psql -U postgres -c "CREATE DATABASE alyah_smart_attendance;"
node server.js
```

The server auto-runs all migrations and seeds default users on first start.  
Health check: `http://localhost:5000/api/health`

### 3. Web Dashboard

```bash
cd ../web
npm install
npm run dev
```

Open `http://localhost:3000`

### 4. Default Login Credentials

| Role | Email | Password |
|---|---|---|
| Admin | `admin@system.com` | `Admin@123` |
| HR | `hr@company.com` | `Hr@123` |
| Employee | `employee@company.com` | `Employee@123` |

> Change these after first login.

### 5. Mobile App *(optional)*

Find your machine's local IP (`ipconfig` on Windows / `ifconfig` on Mac/Linux), then update `mobile/lib/utils/constants.dart`:

```dart
static const String _localUrl = 'http://YOUR_LOCAL_IP:5000/api';
```

```bash
cd mobile
flutter pub get
flutter run
```

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port (default: 5000) |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | Yes | PostgreSQL connection |
| `JWT_SECRET` | Yes | Min 32 chars — signs access tokens |
| `DEVICE_SECRET` | Yes | Min 32 chars — derives per-device HMAC keys |
| `REFRESH_EXPIRES_MINUTES` | No | Refresh token TTL (default: 10080 = 7 days) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Yes* | Email (OTP, reset, activation) |
| `FRONTEND_URL` | Yes | CORS allow-list origin for web dashboard |
| `CORS_ORIGINS` | No | Comma-separated additional origins |
| `FIREBASE_*` | No | Firebase Admin SDK (push notifications) |
| `REDIS_URL` | No | Redis URL for Socket.IO multi-node scaling |
| `SEED_SECRET` | No | Guards the `/admin/run-seed` endpoint |

*Required for OTP-dependent flows (registration, 2FA, password reset).

Full template in [`api/.env.example`](api/.env.example).

---

## API Overview

Base URL: `/api`

| Prefix | Description |
|---|---|
| `/auth` | Login, register, OTP, refresh, logout, password reset |
| `/users` | User CRUD, profile, employee directory |
| `/attendance` | GPS check-in/out, QR, stats, manual entry, history |
| `/schedules` | Per-employee work schedules |
| `/leaves` | Leave requests, approval, balance |
| `/devices` | Device registration, approval, key rotation |
| `/notifications` | In-app notification feed |
| `/announcements` | Announcement board |
| `/chat` | Direct messages |
| `/analytics` | Reports and CSV exports |
| `/dashboard` | Role-specific dashboard data |
| `/admin` | System settings, security alerts, seed |
| `/hr` | HR operations |
| `/audit` | Audit log search |
| `/uploads` | File upload / serve |

Response envelope:
```json
{ "success": true, "data": { ... } }
{ "success": false, "error": "message" }
```

---

## Security Model

- **Device binding** — each employee has one registered primary device; requests from unregistered devices are rejected
- **HMAC-SHA256 signatures** — every API request from the mobile app carries `X-Device-Signature` proving it originated from the provisioned device key stored in iOS Keychain / Android Keystore
- **Refresh token reuse detection** — replayed refresh tokens trigger automatic session termination for the entire user
- **Token versioning** — `token_version` column enables instant invalidation of all active JWTs for a user
- **Brute-force protection** — account locked for 30 minutes after 5 consecutive failed logins
- **Rate limiting** — 30 req/min on auth endpoints; configurable global rate limit
- **Audit trail** — every action (login, attendance write, leave approval, role change, device reset…) is logged with user ID, IP, severity, and a details JSON blob

---

## Attendance Write Precedence

When multiple sources write to the same attendance record, a PostgreSQL trigger (`trg_resolve_attendance_status`) enforces this authority order:

```
MANUAL (100)  >  LEAVE (80)  >  REALTIME / QR (60)  >  OFFLINE (20)
```

An HR manual correction can never be overwritten by a later offline sync. Every write attempt is also appended to the `attendance_events` log for full auditability.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Invalid email or password" on first login | Open `http://localhost:5000/api/admin/run-seed?secret=alyah-seed-2026` |
| Backend won't start — JWT_SECRET error | Ensure `JWT_SECRET` and `DEVICE_SECRET` are at least 32 characters |
| Backend won't start — DB connection error | Confirm PostgreSQL is running and `DB_PASSWORD` is correct |
| Web shows blank page | Start the backend first, then refresh |
| Mobile can't reach backend | Update `_localUrl` in `constants.dart` to your machine's LAN IP |

---

## Project Background

This system was built as a final internship submission for **Alyah Technologies** by the Internship Development Team (June 2026). It demonstrates production-level engineering: database trigger-based conflict resolution, cryptographic per-device key management, refresh token reuse detection, real-time WebSocket delivery, and a fully auditable event log — deployed to a live cloud environment.

Full technical documentation is in [docs/SRS.md](docs/SRS.md).

---

<div align="center">

Built with Node.js · React · Flutter · PostgreSQL

</div>
