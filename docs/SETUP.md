# Alyah Smart Attendance — Local Setup Guide

## Prerequisites

Install these first:
- [Node.js 20+](https://nodejs.org)
- [PostgreSQL 15](https://www.postgresql.org/download/)
- [Flutter 3.24](https://flutter.dev/docs/get-started/install) *(only for mobile)*

---

## Step 1 — Clone

```bash
git clone https://github.com/Alyah-Digital-Attendance-Team/Digital-Attendance-System
cd Digital-Attendance-System
```

---

## Step 2 — Backend

```bash
cd api
npm install
```

Create the environment file:
```bash
copy .env.example .env      # Windows
cp .env.example .env        # Mac/Linux
```

Open `.env` and change **only these 3 lines:**
```env
DB_PASSWORD=your_postgres_password
JWT_SECRET=any_random_string_at_least_32_characters_long
DEVICE_SECRET=different_random_string_at_least_32_characters
```

Create the database in PostgreSQL (run once):
```bash
psql -U postgres -c "CREATE DATABASE alyah_smart_attendance;"
```

Start the backend:
```bash
node server.js
```

✅ First start automatically creates all database tables and default users.

---

## Step 3 — Web Dashboard

```bash
cd ../../web
npm install
npm run dev
```

Open **http://localhost:3000**

---

## Step 4 — Login

| Role | Email | Password |
|------|-------|----------|
| **Admin** | admin@system.com | Admin@123 |
| **HR** | hr@company.com | Hr@123 |
| **Employee** | employee@company.com | Employee@123 |

---

## Step 5 — Mobile App *(optional)*

First find your machine's local IP:
```bash
ipconfig          # Windows — look for IPv4 Address
ifconfig          # Mac/Linux — look for inet
```

Open `mobile/lib/utils/constants.dart` and update line 8:
```dart
static const String _localUrl = 'http://YOUR_IP_HERE:5000/api';
```
Replace `YOUR_IP_HERE` with your actual IP (e.g. `192.168.1.5`)

Then run:
```bash
cd ../mobile
flutter pub get
flutter run -d chrome --web-port 8080
```

Open **http://localhost:8080**

---

## Troubleshooting

**"Invalid email or password"**
→ Open `http://localhost:5000/api/admin/run-seed?secret=alyah-seed-2026` in browser

**Backend won't start — "JWT_SECRET must be at least 32 characters"**
→ Make sure JWT_SECRET and DEVICE_SECRET in `.env` are at least 32 characters

**Backend won't start — database connection failed**
→ Make sure PostgreSQL is running and DB_PASSWORD matches your PostgreSQL password

**Web shows blank page**
→ Make sure backend is running first, then refresh the web page
