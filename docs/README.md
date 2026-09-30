# 🚀 Alyah Smart Attendance

### Zero-Trust Enterprise Workforce Management System

A production-ready **attendance, HR, and workforce management platform** built with:

* 📱 Flutter (Mobile)
* 🌐 React + Tailwind (Web)
* ⚙️ Node.js + Express (Backend)
* 🗄️ PostgreSQL (Database)
* 🔌 Socket.IO (Real-time system)

---

# 🧠 System Overview

Alyah Smart Attendance is a **Zero-Trust workforce system**, meaning:

* Every login is validated by **device + identity**
* Every action is **audited**
* Every attendance event is **verified in real-time**
* HR controls approvals, schedules, and workforce rules

---

# 👥 Roles (FINAL)

* 👑 **ADMIN** → Full system control
* 🧑‍💼 **HR** → Workforce management
* 👷 **EMPLOYEE** → Attendance & personal access only

---

# 🏗️ Architecture

```text
attendance-pro-flow/
├── api/                (Node.js + Express + Socket.IO)
│   ├── src/            ← modules, middleware, services, config
│   ├── database/       ← PostgreSQL migrations & seeds
│   └── scripts/        ← one-off debug/fix scripts
│
├── web/                (React + Tailwind Dashboard)
├── mobile/             (Flutter App)
└── docs/
```

---

# 🚀 Quick Start

## 1. Install Dependencies

```bash
npm install
```

## 2. Setup Database

```bash
cd api
npm run migrate
npm run seed
```

## 3. Start System

```bash
npm run dev
```

---

# 🌐 Services

| Service       | URL                                                    |
| ------------- | ------------------------------------------------------ |
| Web Dashboard | [http://localhost:3000](http://localhost:3000)         |
| Backend API   | [http://localhost:5000/api](http://localhost:5000/api) |
| Socket.IO     | ws://localhost:5000                                    |

---

# 📱 Mobile App (Flutter)

### Employee Features:

* 🔐 Login (Zero-Trust device validation)
* ⏰ Check-in / Check-out (GPS + QR)
* 📊 Attendance history
* 🏖 Leave requests
* 💬 Real-time chat with HR
* 📅 Schedule view
* 👤 Profile management
* 🔔 Notifications
* 📴 Offline handling & auto-sync when reconnecting

---

# 🌐 Web Dashboard (React)

## 👑 ADMIN PANEL

* User management (all employees)
* System configuration
* Audit logs (full tracking)
* Security monitoring
* Rule engine control
* Reports & analytics

## 🧑‍💼 HR PANEL

* Approve users
* Approve devices
* Manage attendance
* Create schedules
* Handle leave requests
* Send announcements
* Chat with employees

---

# ⚙️ Backend (Node.js)

## Core Systems

* JWT Authentication
* Device Binding (Zero-Trust)
* Attendance Engine
* Schedule Engine
* Rule Engine
* Audit Logger
* Notification Service
* Socket.IO real-time engine

---

# 🗄️ Database (PostgreSQL)

### 42 Enterprise Tables

#### Core

* users
* attendance_records
* leave_requests
* announcements
* audit_logs

#### Security

* user_devices
* device_sessions
* login_attempts
* token_blacklist

#### Communication

* chat_rooms
* chat_messages
* notifications

#### HR System

* user_schedules
* leave_balances
* departments

---

# 🔐 Security Model (Zero-Trust)

Every request validates:

1. User identity (JWT)
2. Device identity (Device ID)
3. Session validity
4. Role permission
5. Audit logging
6. Refresh token rotation
7. Session invalidation on logout/device revoke

---

# ⏰ Attendance Logic

### Check-in Flow:

* Validate schedule
* Validate GPS location
* Validate device
* Determine status:

  * PRESENT
  * LATE
  * REJECTED

### Auto-Absent:

* Runs daily
* Marks missing employees as ABSENT
* Excludes leave users

---

# 💬 Real-Time System (Socket.IO)

Events:

* `attendance_update`
* `leave_status`
* `new_message`
* `announcement`
* `device_update`

---

# 🧾 Audit System

Every action is logged:

* login/logout
* attendance actions
* device approvals
* leave actions
* profile updates

Stored with:

* user_id
* action
* timestamp
* metadata (JSONB)

---

# 👤 Schedule System (IMPORTANT)

### Created by: HR only

Stored in:

```
user_schedules
```

Fields:

* user_id
* day_of_week
* start_time
* end_time
* late_threshold
* is_working_day

Used by:

* Attendance engine
* Auto-absent job
* Mobile schedule view

---

# 🔑 Development Credentials (Local Only)

⚠️ **WARNING:** These are for local development ONLY. Change before production.

| Role     | Email                | Password     |
|----------|---------------------|--------------|
| Admin    | admin@system.com    | Admin@123    |
| HR       | hr@company.com      | Hr@123       |
| Employee | employee@company.com| Employee@123 |
| DB       | postgres            | smart_attendance_system         |

---

---

# 📊 System Status

### ✅ Feature Complete

* Backend (Feature Complete)
* Database (Feature Complete)
* Auth + Zero-Trust (Feature Complete)
* Socket.IO (Feature Complete)
* Web Dashboard (Feature Complete)
* Mobile App (Feature Complete)

---

## 🚀 Production Checklist

- [ ] Change all default credentials
- [ ] Set strong JWT_SECRET (32+ chars)
- [ ] Enable HTTPS (Nginx / Reverse Proxy)
- [ ] Configure environment variables (no hardcoding)
- [ ] Setup PostgreSQL backups (daily)
- [ ] Configure monitoring (logs + uptime)
- [ ] Restrict CORS origins
- [ ] Enable firewall rules
- [ ] Test real-time sockets under load

---

# 🧠 FINAL SUMMARY

This system is:

✔ Enterprise-grade backend
✔ Fully structured database
✔ Real-time architecture
✔ Secure Zero-Trust model
✔ Complete mobile app (Flutter)
✔ Complete web dashboard (React)

---

# 🏁 FINAL VERDICT

Alyah Smart Attendance is a **feature-complete, enterprise-grade workforce management system** with:

✔ Zero-Trust security architecture  
✔ Real-time synchronization (Socket.IO)  
✔ Full mobile + web ecosystem  
✔ Scalable PostgreSQL backend  

⚠️ Production readiness depends on proper deployment, security configuration, and real-world testing.

**Built with ❤️ using Flutter, React, Node.js, and PostgreSQL**
