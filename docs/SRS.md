# Software Requirements Specification (SRS)

## Alyah Smart Attendance — Enterprise Workforce Management System

**Document Version:** 1.0  
**Prepared By:** Alyah Technologies Development Team  
**Date:** July 10, 2026  
**Status:** Final  

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Overall Description](#2-overall-description)
3. [Problem Statement](#3-problem-statement)
4. [Proposed Solution](#4-proposed-solution)
5. [System Architecture](#5-system-architecture)
6. [Functional Requirements](#6-functional-requirements)
7. [Non-Functional Requirements](#7-non-functional-requirements)
8. [Unique Features](#8-unique-features)
9. [System Interfaces](#9-system-interfaces)
10. [Security Requirements](#10-security-requirements)
11. [Benefits and Impact](#11-benefits-and-impact)

---

## 1. Introduction

### 1.1 Purpose

This Software Requirements Specification (SRS) document defines the complete functional and non-functional requirements for **Alyah Smart Attendance**, an enterprise-grade workforce management system. It serves as the authoritative reference for developers, testers, project managers, and stakeholders throughout the development and maintenance lifecycle.

### 1.2 Scope

Alyah Smart Attendance is a three-platform workforce management system comprising:

- A **Flutter mobile application** for employees (iOS and Android)
- A **React web dashboard** for HR managers and Administrators
- A **Node.js/PostgreSQL backend API** with real-time Socket.IO capabilities

The system covers the complete employee attendance lifecycle: registration, device binding, clock-in/out (GPS and QR), leave management, HR approvals, payroll, analytics, audit logging, and real-time communication.

### 1.3 Intended Audience

| Audience | Usage |
|---|---|
| Software Developers | Implementation reference and technical specification |
| QA/Testers | Test case derivation and acceptance criteria |
| HR Managers | Feature scope and process workflow validation |
| System Administrators | Deployment, configuration, and security guidelines |
| Executive Stakeholders | Project scope, feature coverage, and strategic alignment |
| Auditors/Compliance | Security controls, audit trail, and data governance |

### 1.4 Definitions and Acronyms

| Term | Definition |
|---|---|
| **GPS** | Global Positioning System — used for location-based clock-in/out |
| **QR** | Quick Response code — scanned by employees to record attendance |
| **JWT** | JSON Web Token — cryptographic token used for authentication |
| **HMAC** | Hash-based Message Authentication Code — used for device signature |
| **OTP** | One-Time Password — 6-digit code for email verification |
| **FCM** | Firebase Cloud Messaging — push notification delivery |
| **Socket.IO** | Real-time bidirectional event-based communication framework |
| **RBAC** | Role-Based Access Control — restricts system access by role |
| **Admin** | System administrator with full platform access |
| **HR** | Human Resources staff with HR-domain access |
| **Employee** | End-user employee with personal attendance access |

### 1.5 References

- Alyah Technologies Internship Project Brief (June 2026)
- Enterprise Sync Performance UI Requirements Specification
- Account Activation Flows Specification
- Forgot Password Flow Specification
- Node.js 20 / PostgreSQL 15 / Flutter 3.24 Official Documentation

---

## 2. Overall Description

### 2.1 Product Perspective

Alyah Smart Attendance is a standalone enterprise system replacing fragmented, paper-based, or spreadsheet-driven workforce management processes. It integrates:

- **Real-time attendance tracking** via GPS geofencing and cryptographic QR codes
- **Complete HR lifecycle management** including leave, salary, and employee records
- **Live communication** through enterprise chat and announcement broadcasting
- **Multi-layer security** using device binding, token rotation, and audit logging
- **Offline-capable mobile experience** with automatic sync on reconnection

The system is production-deployed on Render cloud infrastructure and is designed to scale to thousands of concurrent users.

### 2.2 Product Functions (High-Level Summary)

| Function Area | Key Capabilities |
|---|---|
| Authentication & Security | JWT + refresh rotation, 2FA email OTP, device OTP, brute-force lockout, HMAC device binding |
| Attendance | GPS geofenced check-in/out, QR code scanning, offline sync, conflict resolution |
| Leave Management | Multi-type leave, document upload, HR approval workflow, balance tracking |
| Schedules | Per-employee shift types, overtime, bulk assignment, real-time sync |
| HR Management | Employee records, departments, positions, salary, performance, warnings |
| Chat & Communication | Real-time direct messaging, typing indicators, unread badges |
| Announcements | Role-targeted broadcasting, priority levels, view tracking |
| Analytics & Reporting | Attendance summaries, overtime, late arrivals, CSV export, charts |
| Notifications | In-app feed, Firebase push (mobile), Web Push (browser) |
| Admin Controls | System settings, QR rotation, security alerts, audit logs, integrations |
| Holidays | Recurring and one-off public holidays, Ethiopian calendar support |

### 2.3 User Classes and Characteristics

**Administrator**
- Full platform access across all modules
- Responsible for system configuration, security monitoring, and user management
- Access via React web dashboard exclusively

**HR Manager**
- Access to HR-domain features: attendance monitoring, leave approvals, salary, announcements
- Can create and manage employee accounts
- Access via React web dashboard

**Employee**
- Personal attendance features: GPS/QR clock-in/out, own schedule, leave requests, chat
- Access via Flutter mobile application
- One registered device per employee enforced by the system

### 2.4 Operating Environment

| Component | Technology |
|---|---|
| Backend Runtime | Node.js 20 on Linux (Docker container) |
| Web Browser Support | Chrome 110+, Firefox 110+, Edge 110+, Safari 16+ |
| Mobile Platform | iOS 14+, Android 8+ (Flutter 3.24) |
| Database | PostgreSQL 15 |
| Cache / Pub-Sub | Redis 7 |
| Cloud Platform | Render (production), Docker Compose (local development) |
| CI/CD | GitHub Actions |

### 2.5 Assumptions and Dependencies

- All employees own a smartphone capable of running Flutter 3.24 applications
- Email delivery depends on configured SMTP credentials (Gmail or equivalent)
- Push notifications require Firebase project configuration
- GPS attendance requires location services to be enabled on the mobile device
- The system assumes a single organisation deployment (single-tenant)

---

## 3. Problem Statement

### 3.1 Background

Workforce attendance management is a critical operational function for any organisation. Traditional methods — paper registers, manual spreadsheets, and disconnected time-tracking tools — introduce significant challenges that scale with organisational size.

### 3.2 Identified Problems

**3.2.1 Manual and Error-Prone Tracking**  
Paper-based and spreadsheet attendance records are inherently susceptible to human error, illegible entries, lost documents, and deliberate falsification. There is no automated validation of whether an employee is physically present at the office.

**3.2.2 No Real-Time Visibility**  
HR and management have no live view of who is present, absent, or late. Attendance data is consolidated retrospectively, preventing timely interventions and real-time workforce decisions.

**3.2.3 Buddy Punching and Fraud**  
Without cryptographic verification, colleagues can clock in on behalf of absent employees (known as "buddy punching"). There is no technical mechanism to confirm the identity of the person recording attendance.

**3.2.4 Fragmented HR Processes**  
Leave requests, approvals, schedule changes, and salary updates are managed through separate tools or manual communication channels (email, phone, paper forms). This fragmentation creates delays, miscommunication, and lost records.

**3.2.5 Poor Employee Experience**  
Employees receive no immediate confirmation of attendance records, leave approvals, or schedule changes. They must follow up manually to get status updates.

**3.2.6 Lack of Audit and Compliance**  
Without a comprehensive audit trail, organisations cannot reconstruct who did what, when, and from where. This creates compliance risks and makes dispute resolution extremely difficult.

**3.2.7 Inefficient Communication**  
Company announcements, policy changes, and HR notices are distributed through informal channels with no confirmation of delivery or readership tracking.

**3.2.8 Data Integrity Risks During Connectivity Issues**  
Field employees or those in areas with poor connectivity cannot record attendance when offline, leading to data gaps or retroactive manual corrections.

### 3.3 Impact of the Problems

| Problem | Organisational Impact |
|---|---|
| Manual tracking | HR staff waste 15–20% of work time on attendance admin |
| No real-time visibility | Management delays in absence intervention |
| Buddy punching | Payroll fraud and inaccurate performance records |
| Fragmented HR | Leave processing delays of 2–5 business days |
| No audit trail | Legal and compliance exposure |
| Poor communication | Policy non-compliance due to missed announcements |

---

## 4. Proposed Solution

### 4.1 Solution Overview

Alyah Smart Attendance is a unified, three-platform enterprise workforce management system that solves all identified problems through a combination of cryptographic security, GPS geofencing, real-time event-driven architecture, and an offline-first mobile experience.

### 4.2 Solution Architecture Philosophy

The system is designed around four core principles:

1. **Trust Nothing, Verify Everything** — Every attendance record is cryptographically signed by a device-bound key. Every user action is logged with context.
2. **Real-Time by Default** — No user should ever need to manually refresh to see current data. All changes propagate instantly via WebSocket.
3. **Offline-Resilient** — Poor connectivity never blocks an employee. Actions queue locally and sync automatically.
4. **Conflict Authority** — When multiple sources write the same record, a deterministic precedence engine resolves conflicts reliably.

### 4.3 How the Solution Addresses Each Problem

| Problem | Solution |
|---|---|
| Manual/error-prone tracking | Automated GPS and QR attendance with server-side validation |
| No real-time visibility | Socket.IO live dashboard updated within 500ms of any event |
| Buddy punching | HMAC-SHA256 device binding — only the registered device can sign requests |
| Fragmented HR | Single platform covering leave, salary, schedules, chat, and announcements |
| No audit trail | Immutable audit log capturing every action with user, IP, timestamp, and change diff |
| Poor employee experience | Instant push notifications for all relevant events; mobile-first design |
| Data integrity gaps | Offline queue with idempotent replay; trigger-based conflict resolution |
| Communication gaps | Role-targeted announcement broadcasting with view confirmation tracking |

### 4.4 Solution Components

**Component 1: Flutter Mobile Application**  
The primary interface for employees. Enables GPS-verified and QR-verified clock-in/out, schedule viewing, leave requests, company announcements, and direct HR messaging. Works offline and syncs automatically.

**Component 2: React Web Dashboard**  
The management interface for HR and Admin. Provides live attendance monitoring, employee management, leave approval workflows, salary management, analytics reports, and system administration — all updating in real time without page refresh.

**Component 3: Node.js REST API + Socket.IO**  
The backend core. Handles all business logic, enforces security rules, broadcasts real-time events, manages the database, and delivers email and push notifications. Built with 21 independent modules for maintainability.

**Component 4: PostgreSQL Database**  
The single source of truth. 33 migration files building a fully normalised schema with trigger-based attendance conflict resolution, optimistic locking, and comprehensive indexing.

**Component 5: Redis**  
Enables horizontal scaling of WebSocket connections across multiple server instances and provides high-performance session caching.

---

## 5. System Architecture

### 5.1 High-Level Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                              │
│  ┌────────────────────────┐   ┌──────────────────────────────┐  │
│  │  Flutter Mobile App    │   │   React Web Dashboard        │  │
│  │  (Employee)            │   │   (HR Manager / Admin)       │  │
│  │  iOS & Android         │   │   Any Modern Browser         │  │
│  └──────────┬─────────────┘   └──────────────┬───────────────┘  │
└─────────────┼──────────────────────────────── ┼─────────────────┘
              │   REST API + Socket.IO           │
┌─────────────▼──────────────────────────────── ▼─────────────────┐
│                     BACKEND API LAYER                            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Node.js 20 + Express.js                               │    │
│  │  ├── 21 Feature Modules (Auth, Attendance, HR, Chat…)  │    │
│  │  ├── Middleware (JWT, HMAC Device Sig, Rate Limit, Zod)│    │
│  │  ├── Socket.IO Gateway (real-time rooms per role)      │    │
│  │  └── Background Services (Email, Push, Cron, Audit)   │    │
│  └─────────────────────────────────────────────────────────┘    │
└──────────────────────────┬───────────────────────────────────────┘
                           │
         ┌─────────────────┴────────────────┐
         │                                  │
┌────────▼───────────┐            ┌─────────▼──────────┐
│   PostgreSQL 15    │            │     Redis 7         │
│  Primary Datastore │            │  Socket.IO Scaling  │
│  33 Migrations     │            │  Session Cache      │
│  Trigger-based FSM │            └────────────────────┘
└────────────────────┘
```

### 5.2 Module Inventory

| Module | Responsibility |
|---|---|
| `auth` | Login, registration, OTP, token refresh, logout, password reset, activation |
| `attendance` | GPS/QR clock-in/out, history, status resolver, manual entry |
| `users` | Employee directory, profiles, CRUD |
| `leaves` | Leave requests, HR approval, balance tracking |
| `schedules` | Per-employee work schedules, shift types, bulk assignment |
| `hr` | Employee management, performance reviews, warnings |
| `salary` | Salary records, payroll management |
| `chat` | Real-time direct messaging, rooms, delivery receipts |
| `announcements` | Role-targeted broadcasts, priority, view tracking |
| `notifications` | In-app feed, Firebase FCM push, Web Push VAPID |
| `holidays` | Public holiday calendar, Ethiopian calendar |
| `dashboard` | Role-scoped KPI aggregation |
| `analytics` | Reports, CSV export, Recharts data |
| `admin` | System settings, QR rotation, security alerts |
| `audit` | Immutable action log, full-text search |
| `devices` | Device registration, approval, HMAC key rotation |
| `offices` | Office coordinates, GPS radius, map integration |
| `roles` | Permissions management |
| `rules` | JSON-driven attendance rule engine |
| `integrations` | Third-party integration configuration |
| `uploads` | File storage for documents and profile pictures |

### 5.3 Attendance Write Precedence

When multiple sources write to the same attendance record, a PostgreSQL trigger enforces deterministic resolution:

```
MANUAL HR Correction  (Priority 100)
       ↓ wins over
Leave Record          (Priority 80)
       ↓ wins over
Realtime / QR Scan    (Priority 60)
       ↓ wins over
Offline Sync          (Priority 20)
```

An HR manual correction can never be overwritten by a subsequent offline sync or QR scan.

---

## 6. Functional Requirements

### 6.1 Authentication and Account Management

#### FR-AUTH-01: User Login
The system SHALL authenticate users via email and password, returning a short-lived JWT access token and a rotating refresh token. The system SHALL enforce a maximum of 5 failed login attempts before locking the account for 30 minutes.

#### FR-AUTH-02: Two-Factor Authentication
The system SHALL support email OTP as a second factor during login. OTP codes SHALL be 6 digits, time-limited, and single-use.

#### FR-AUTH-03: Device Registration and Approval
Each employee SHALL register their mobile device. Device registrations SHALL enter a `PENDING` state requiring Admin or HR approval before the device can submit attendance. The system SHALL derive a unique HMAC-SHA256 key per device from the `DEVICE_SECRET`.

#### FR-AUTH-04: Refresh Token Rotation
The system SHALL issue a new refresh token on every use and invalidate the previous one. Refresh token reuse SHALL trigger automatic session termination across all devices for that user.

#### FR-AUTH-05: Account Activation — Self-Registration Path
When an employee self-registers, verifies their email OTP, and is approved by HR, the system SHALL set the account directly to `ACTIVE` and send an approval notification.

#### FR-AUTH-06: Account Activation — Admin-Created Path
When an Admin/HR creates an employee account, the system SHALL send an activation email with a 6-digit OTP. The employee SHALL complete OTP verification and set their password before the account becomes `ACTIVE`.

#### FR-AUTH-07: Forgot Password
The system SHALL provide a secure password reset flow for Admin and HR users via a time-limited, single-use token sent by email. The raw token SHALL never be stored; only its SHA-256 hash is persisted. Successful reset SHALL revoke all active sessions.

#### FR-AUTH-08: Token Versioning
The system SHALL maintain a `token_version` integer per user, enabling instant invalidation of all active JWTs for a user by incrementing the version.

### 6.2 Attendance Management

#### FR-ATT-01: GPS-Based Check-In/Out
The mobile app SHALL capture the employee's GPS coordinates at clock-in and clock-out. The backend SHALL validate the coordinates using the Haversine formula against the employee's assigned office location and configured radius. The system SHALL reject clock-ins from outside the geofence.

#### FR-ATT-02: QR Code Check-In/Out
The backend SHALL generate HMAC-signed, nonce-based, time-limited QR tokens per office. Tokens SHALL be one-time-use. The mobile app SHALL scan the QR code and submit the token to the backend for validation. QR secrets SHALL auto-rotate on a configured schedule.

#### FR-ATT-03: Offline Attendance Sync
The mobile app SHALL record attendance events offline and queue them with a client-generated idempotency key. Upon reconnection, the app SHALL replay queued events in order within 5 seconds. The backend SHALL deduplicate events by idempotency key.

#### FR-ATT-04: Attendance Conflict Resolution
The PostgreSQL trigger `trg_resolve_attendance_status` SHALL enforce precedence: MANUAL (100) > LEAVE (80) > REALTIME/QR (60) > OFFLINE (20). Every write attempt SHALL be appended to the `attendance_events` log.

#### FR-ATT-05: Manual Attendance Entry
HR and Admin users SHALL be able to manually enter or correct attendance records from the web dashboard. Manual entries receive the highest precedence and cannot be overwritten by automated sources.

#### FR-ATT-06: Attendance History and Export
The system SHALL provide paginated attendance history per employee, filterable by date range, status, and department. HR and Admin users SHALL be able to export attendance data to CSV format.

### 6.3 Leave Management

#### FR-LEAVE-01: Leave Request Submission
Employees SHALL submit leave requests via the mobile app, specifying leave type (SICK, VACATION, PERSONAL, EMERGENCY, MATERNITY, PATERNITY), date range, reason, and optionally attaching a supporting document.

#### FR-LEAVE-02: HR Approval Workflow
HR and Admin users SHALL receive real-time notification of pending leave requests. They SHALL be able to approve or reject requests with an optional reason. Approval/rejection SHALL be broadcast to the employee's device in real time.

#### FR-LEAVE-03: Automatic Reconciliation
Upon leave approval, the system SHALL automatically update the employee's attendance record for the covered dates from ABSENT to EXCUSED.

#### FR-LEAVE-04: Leave Balance Tracking
The system SHALL maintain leave balances per employee, per leave type, per year. Balances SHALL update automatically when leave is approved.

### 6.4 Work Schedules

#### FR-SCHED-01: Schedule Types
The system SHALL support four schedule types: REGULAR (fixed daily hours), FLEXIBLE (start/end within a window), SHIFT (rotating shift patterns), and CUSTOM (arbitrary per-day configuration). Overnight shifts SHALL be supported.

#### FR-SCHED-02: Per-Employee Overrides
HR SHALL be able to assign schedule overrides for individual employees that take precedence over department-level defaults.

#### FR-SCHED-03: Real-Time Schedule Push
Schedule changes SHALL be broadcast to the affected employee's mobile device in real time via Socket.IO without requiring an app restart.

#### FR-SCHED-04: Bulk Assignment
HR SHALL be able to assign a schedule to multiple employees simultaneously.

### 6.5 Real-Time Communication

#### FR-CHAT-01: Direct Messaging
The system SHALL support direct message rooms between employees and HR. Messages SHALL be delivered within 200ms. Read and delivery receipts SHALL be maintained per message.

#### FR-CHAT-02: Typing Indicators
The system SHALL broadcast a typing indicator to room participants when a user is composing a message, automatically clearing after 3 seconds of inactivity.

#### FR-CHAT-03: Unread Badge Counts
The system SHALL maintain and display unread message counts per room and as a total badge, updating in real time.

#### FR-ANNC-01: Announcement Broadcasting
Admin and HR users SHALL publish announcements with target audience (All, specific department, specific role), priority level (NORMAL, URGENT), and optional expiry. Announcements SHALL be broadcast to all eligible clients within 500ms.

#### FR-ANNC-02: View Tracking
The system SHALL record when each employee views an announcement. View counts SHALL be visible to HR and Admin users in real time.

### 6.6 Notifications

#### FR-NOTIF-01: In-App Notifications
The system SHALL deliver in-app notifications for all relevant events: new messages, announcements, leave decisions, schedule changes, attendance corrections, payroll updates, and role changes.

#### FR-NOTIF-02: Push Notifications
The system SHALL deliver push notifications via Firebase Cloud Messaging for mobile and Web Push API for browsers, even when the app is not in the foreground.

#### FR-NOTIF-03: Deep Linking
Tapping a push notification SHALL navigate the user directly to the relevant screen within the app.

#### FR-NOTIF-04: User Preferences
Users SHALL be able to mute notification categories or specific senders. Muted notifications SHALL be suppressed on all devices.

### 6.7 HR Management

#### FR-HR-01: Employee Record Management
HR and Admin SHALL create, update, deactivate, and manage employee records including departments, positions, contact information, and profile pictures.

#### FR-HR-02: Department and Position Management
The system SHALL support creating and managing departments and positions with real-time propagation of changes to all connected clients.

#### FR-HR-03: Salary Management
HR SHALL manage salary records per employee. Salary updates SHALL be broadcast to the affected employee and to HR/Admin users.

#### FR-HR-04: Performance and Disciplinary Records
HR SHALL issue performance reviews and warnings, with notifications delivered to the affected employee in real time.

### 6.8 Analytics and Reporting

#### FR-ANLT-01: Attendance Analytics
The system SHALL provide attendance summaries, late arrival reports, absenteeism reports, overtime summaries, and leave summaries — all filterable by date range, department, and employee.

#### FR-ANLT-02: Dashboard KPIs
The dashboard SHALL display live KPIs: total employees, present today, on leave, absent, late, pending approvals, and unread messages — updating in real time.

#### FR-ANLT-03: CSV Export
All report views SHALL provide CSV export functionality.

### 6.9 System Administration

#### FR-ADMIN-01: System Settings
Admin users SHALL configure system-wide settings including office locations, QR rotation schedules, rate limits, and company information.

#### FR-ADMIN-02: Audit Log
Every user action SHALL be logged with user ID, IP address, entity type, entity ID, action type, old and new values (JSONB), severity, and timestamp. Logs SHALL be searchable and filterable.

#### FR-ADMIN-03: Security Alerts
The system SHALL detect and record suspicious activities (excessive failed logins, access from unusual locations, token reuse) with severity ratings and a resolution workflow.

#### FR-ADMIN-04: Integration Management
Admin users SHALL configure third-party integrations through a dedicated UI backed by the `integrations` table.

---

## 7. Non-Functional Requirements

### 7.1 Performance

| Requirement | Target |
|---|---|
| Initial screen paint (4G network, mid-range device) | ≤ 2 seconds |
| Login flow completion | ≤ 3 seconds |
| Screen navigation | ≤ 300 milliseconds |
| UI animation frame rate | Minimum 60 FPS; target 120 FPS on capable devices |
| Real-time event propagation | ≤ 500 milliseconds |
| REST API response (p95) | ≤ 200 milliseconds at 500 concurrent users |
| WebSocket connection capacity | ≥ 2,000 concurrent connections per backend instance |

### 7.2 Scalability

- The backend SHALL support horizontal scaling via Redis-backed Socket.IO adapter
- All list endpoints SHALL require pagination parameters and return a maximum of 100 records per page
- Database connection pooling SHALL maintain a minimum of 10 and maximum of 100 connections
- When CPU exceeds 80% for 60 seconds, the health endpoint SHALL return a `degraded` status

### 7.3 Availability and Reliability

- The system SHALL implement exponential back-off reconnection (1s initial, 30s cap, with jitter)
- The backend SHALL implement graceful shutdown: drain in-flight requests within 30 seconds on SIGTERM
- The mobile app SHALL function in offline mode, queuing all writes for later sync
- All queued actions SHALL be replayed within 5 seconds of reconnection

### 7.4 Security

- All passwords SHALL be hashed with bcrypt at cost factor 12
- JWT access tokens SHALL expire after 8 hours; refresh tokens after 7 days
- Every mobile API request SHALL carry a device-specific HMAC-SHA256 signature
- All WebSocket connections SHALL be authenticated via JWT within 5 seconds
- The system SHALL enforce RBAC on every API endpoint; unauthorized requests receive HTTP 403
- All database interactions SHALL use parameterised queries — dynamic SQL on user inputs is prohibited
- The system SHALL enforce rate limiting: 30 req/min on auth endpoints; 1,000 req/period global

### 7.5 Data Integrity

- All concurrent updates to shared entities SHALL use optimistic locking (`version` column), returning HTTP 409 on conflict
- All list endpoint data SHALL be consistent — no stale reads from unacknowledged cache entries
- Cache invalidation SHALL occur immediately on receiving a Socket.IO domain event for a record
- The offline conflict resolver SHALL use server-authority for automatic resolution and present the user with a choice UI for irresolvable conflicts

### 7.6 Maintainability

- No single source file SHALL exceed 500 lines of code
- Business logic SHALL be separated into feature modules with clear presentation/domain/data layers
- All shared UI patterns SHALL use a single canonical implementation from the Component Library
- All duplicated API client logic SHALL be extracted into a single `ApiService` class

### 7.7 Accessibility

- All interactive elements SHALL have a minimum tap/click target of 44 × 44 dp
- The system SHALL achieve WCAG 2.1 AA contrast ratio of 4.5:1 for body text
- All layouts SHALL be responsive from 320 dp (mobile) to 1920 px (desktop) without horizontal overflow
- The system SHALL support both light and dark themes, defaulting to system preference

### 7.8 Internationalisation

- All currency, date, and time values SHALL respect the user's configured locale and timezone
- The system includes Ethiopian calendar support and Ethiopian public holiday data
- Announcement content supports bilingual inputs (English and Amharic)

### 7.9 Logging and Monitoring

- The backend SHALL use structured JSON logging with log levels (debug, info, warn, error)
- Every log entry SHALL include: `correlationId`, `userId`, `method`, `path`, `statusCode`, `durationMs`, `timestamp`
- The `/api/health` endpoint SHALL report database connectivity, Redis connectivity, and active WebSocket count, responding within 500ms
- All unhandled exceptions SHALL be wrapped in a structured error response with a `correlationId` and logged server-side

---

## 8. Unique Features

### 8.1 Cryptographic Device Binding (Zero-Trust Attendance)

Every employee is bound to a single registered mobile device. At provisioning, a unique HMAC-SHA256 key is derived from the global `DEVICE_SECRET` and the device's unique identifier, then stored securely in the iOS Keychain or Android Keystore. Every API request from the mobile app includes an `X-Device-Signature` header computed with this device key.

The backend verifies this signature on every attendance write. A device that has not been provisioned and approved by HR/Admin cannot submit attendance records, even if an attacker obtains valid login credentials. This completely eliminates buddy punching and remote attendance fraud.

After a password reset, device records are preserved but the user must re-authenticate, and the Zero-Trust device validation applies to the next login — ensuring the device binding survives credential changes.

### 8.2 Trigger-Based Attendance Conflict Resolution

Unlike most attendance systems that simply overwrite records, Alyah Smart Attendance implements a PostgreSQL trigger-based Finite State Machine (`trg_resolve_attendance_status`) that enforces a deterministic priority hierarchy:

- **MANUAL (100):** HR or Admin manually entered/corrected attendance
- **LEAVE (80):** Automated reconciliation from an approved leave
- **REALTIME/QR (60):** Direct GPS or QR scan attendance
- **OFFLINE (20):** Attendance recorded offline and synced later

This ensures that an HR correction applied in the afternoon can never be silently overwritten by an employee's delayed offline sync. Every write attempt is also appended to the `attendance_events` event log, providing a complete reconstruction history.

### 8.3 Ethiopian Calendar and Localisation

The system includes a native Ethiopian calendar utility (`ethiopian_calendar.dart`) and a full database of Ethiopian public holidays (migration `021_ethiopian_public_holidays.sql`). Public holidays support recurring (annual) and non-recurring types, full-day and half-day designations, religious categories, and bilingual names (English and Amharic).

This localisation extends throughout the system — schedule definitions, holiday calendar views, and attendance status calculations all respect Ethiopian business context.

### 8.4 Offline-First Architecture with Idempotent Replay

The mobile application implements a full offline queue backed by SQLite. When the network is unavailable, all user actions (clock-in, clock-out, leave requests, profile updates, chat messages) are persisted locally with a client-generated idempotency key. On reconnection, the queue replays in original order within 5 seconds.

The idempotency key prevents duplicate submissions even if the network drops mid-request and the action retries. Server-side, the same key is checked before processing, ensuring each action executes exactly once regardless of how many times the client retries.

### 8.5 Multi-Source Real-Time Synchronisation Engine

All 21 backend modules are connected to a Redis-backed Socket.IO event bus. Every domain event — attendance record, leave decision, schedule change, announcement, chat message, salary update — is broadcast to all eligible connected clients within 500 milliseconds. Role-scoped Socket.IO rooms ensure each client only receives events they are authorised to see.

This means an HR manager watching the attendance dashboard sees an employee clock in the moment it happens, with the dashboard KPI updating live without any polling or page refresh.

### 8.6 Refresh Token Reuse Detection

The system implements a family-based refresh token security model. Every token rotation invalidates the previous token. If a previously invalidated token is presented (indicating a stolen token being replayed), the system automatically terminates all active sessions for that user across every device. This provides protection against session hijacking attacks even when the attacker holds a valid refresh token.

### 8.7 HMAC-Signed, Nonce-Based QR Attendance

QR codes for attendance are not static images. They are dynamically generated HMAC-SHA256 tokens that include a nonce (to prevent reuse), an expiration timestamp (time-limited), and a signature verified against the office's secret. Each QR token is single-use — once scanned and submitted, the nonce is invalidated and the same token cannot be accepted again.

QR secrets can be rotated by Admin users on demand or on a scheduled basis, and the rotation is immediately effective — any QR tokens generated before rotation are automatically invalid.

---

## 9. System Interfaces

### 9.1 REST API Interface

**Base URL:** `/api`  
**Authentication:** Bearer JWT in `Authorization` header; `X-Device-Signature` on mobile endpoints  
**Response Envelope:**
```json
{ "success": true, "data": { ... } }
{ "success": false, "error": "Human-readable message" }
```

**Error Response (structured):**
```json
{
  "error": {
    "code": "MACHINE_READABLE_CODE",
    "message": "Human-readable description",
    "correlationId": "uuid-v4"
  }
}
```

| Route Prefix | Module | Key Operations |
|---|---|---|
| `/auth` | Authentication | Login, register, OTP, refresh, logout, password reset, device OTP |
| `/users` | Users | CRUD, profile update, employee directory |
| `/attendance` | Attendance | GPS check-in/out, QR scan, manual entry, history, stats |
| `/schedules` | Schedules | Per-employee schedule CRUD, bulk assign, shift types |
| `/leaves` | Leaves | Submit, approve, reject, balance, history |
| `/devices` | Devices | Register, approve, revoke, key rotation |
| `/notifications` | Notifications | Feed, mark read, push token registration |
| `/announcements` | Announcements | Create, publish, view track, target audience |
| `/chat` | Chat | Rooms, messages, read receipts, unread counts |
| `/analytics` | Analytics | Attendance log, summaries, overtime, CSV export |
| `/dashboard` | Dashboard | Role-scoped KPI snapshots |
| `/admin` | Admin | System settings, QR rotation, security alerts |
| `/hr` | HR | Employee management, departments, positions, salary |
| `/audit` | Audit | Search and filter audit logs |
| `/uploads` | Uploads | File upload (documents, avatars) |
| `/holidays` | Holidays | CRUD for public holidays, recurring/one-off |
| `/offices` | Offices | Office locations, GPS radius, assignment |

### 9.2 WebSocket Interface

**Protocol:** Socket.IO over WebSocket (HTTP long-poll fallback)  
**Authentication:** JWT passed in handshake `auth.token`  
**Rooms:** Clients join role-scoped rooms on connection

| Event | Direction | Description |
|---|---|---|
| `attendance:checkin` | Server → Client | Employee clocked in |
| `attendance:checkout` | Server → Client | Employee clocked out |
| `leave:submitted` | Server → Client | New leave request pending |
| `leave:decided` | Server → Client | Leave approved or rejected |
| `schedule:changed` | Server → Client | Employee schedule updated |
| `announcement:new` | Server → Client | New announcement published |
| `chat:message` | Bidirectional | New chat message |
| `chat:typing` | Bidirectional | Typing indicator |
| `notification:new` | Server → Client | New in-app notification |
| `account_status_changed` | Server → Client | Account activated/deactivated |

### 9.3 Email Interface

**Provider:** Gmail SMTP via Nodemailer (configurable)  
**Email Types:**
- Account registration OTP
- Device OTP verification
- Account activation (admin-created employees)
- Account approved notification
- Forgot password reset link (with mobile deep link)
- Password changed confirmation
- Leave decision notifications

### 9.4 Push Notification Interface

**Mobile:** Firebase Cloud Messaging (FCM) — iOS APNs and Android FCM  
**Web:** Web Push API with VAPID keys  
**Payload:** Sender, message preview, deep-link URL for navigation

---

## 10. Security Requirements

### 10.1 Authentication Security

| Control | Implementation |
|---|---|
| Password hashing | bcrypt, cost factor 12 |
| Access token lifetime | 8 hours (configurable via JWT_EXPIRES_IN) |
| Refresh token lifetime | 7 days (configurable via REFRESH_EXPIRES_MINUTES) |
| Refresh token reuse | Auto-revokes all sessions on replay detection |
| Brute-force protection | Account lock for 30 minutes after 5 failed attempts |
| Token invalidation | `token_version` column enables instant full invalidation |
| Password reset token | SHA-256 hash only stored; raw token never persisted |
| Reset token lifetime | 1 hour from generation |

### 10.2 Transport and Communication Security

- All production traffic SHALL be served over HTTPS/WSS
- CORS allowlist enforced via `CORS_ORIGINS` environment variable
- Helmet middleware sets security headers (CSP, HSTS, X-Frame-Options, etc.)
- Rate limiting applied at auth endpoints (30 req/min) and globally (1,000 req/period)

### 10.3 Device and API Request Security

- Every mobile API request carries `X-Device-Signature` (HMAC-SHA256 of request body + timestamp + device key)
- Devices in `PENDING`, `REJECTED`, or `REVOKED` state cannot submit attendance
- Admin can force-reset an employee's device binding via the admin panel
- QR tokens are nonce-based, time-limited, and single-use

### 10.4 Data Security

- All database queries use parameterised statements — SQL injection is architecturally prevented
- Sensitive fields (passwords, device keys, reset tokens) are never returned in API responses
- File uploads are stored in a private directory, served only via authenticated endpoints
- Salary and payroll data is scoped by RBAC — employees cannot access others' salary records

### 10.5 Audit and Compliance

- Every action is logged to `audit_logs` with: `user_id`, `action`, `entity`, `entity_id`, `old_value` (JSONB), `new_value` (JSONB), `ip_address`, `severity`, `timestamp`
- Suspicious activities (token reuse, unusual login patterns) are tracked in `suspicious_activities` with severity levels
- Audit logs are append-only and searchable by Admin users
- Password reset events generate audit entries for both requests and completions

---

## 11. Benefits and Impact

### 11.1 Operational Benefits

**Elimination of Manual Work**  
Automated GPS and QR attendance removes the need for manual registers. HR staff previously spending 15–20% of their time on attendance administration can redirect that effort to higher-value tasks. Attendance records are captured, validated, and stored in real time with zero manual intervention.

**Real-Time Decision Making**  
The live dashboard provides managers with an instant view of workforce status — who is present, who is late, who is on approved leave, and who has unexcused absences. This enables faster responses to staffing gaps and eliminates the information lag inherent in daily or weekly manual reports.

**Elimination of Attendance Fraud**  
The cryptographic device binding system makes buddy punching technically impossible. An attendance record from an unregistered device or one not matching the HMAC signature is automatically rejected. This directly protects payroll accuracy.

**Streamlined HR Workflows**  
Leave requests, approvals, schedule changes, and employee management are all handled in one platform with real-time notifications at each step. What previously took 2–5 days through email chains is reduced to hours with in-app workflows and instant push notifications.

### 11.2 Employee Experience Benefits

**Instant Feedback**  
Employees receive immediate confirmation when they clock in or out, and real-time notifications when their leave requests are approved or rejected. There is no uncertainty about whether their attendance was recorded or their request was received.

**Mobile-First Convenience**  
The Flutter mobile app brings all attendance and HR functions to the employee's phone. Clock in from any location, request leave from home, view your schedule without asking HR — all from a single app.

**Works Without Internet**  
The offline-first architecture ensures that connectivity issues never block an employee from recording attendance. Actions are queued locally and sync automatically, providing a seamless experience regardless of network quality.

### 11.3 Management and Compliance Benefits

**Complete Audit Trail**  
Every action in the system — attendance write, leave approval, role change, device registration — is permanently recorded with full context. This provides a complete reconstruction capability for disputes, compliance audits, and legal inquiries.

**Reliable Data Integrity**  
The trigger-based conflict resolution engine guarantees that HR corrections are authoritative and cannot be silently overwritten. Management can trust that the data they see reflects the most accurate, authoritative state.

**Scalable Analytics**  
Built-in analytics provide attendance patterns, overtime summaries, absenteeism rates, and leave utilisation — all with CSV export for further analysis. Reports that previously required hours of manual compilation are available on demand.

### 11.4 Strategic Benefits

**Reduced Payroll Errors**  
With accurate, tamper-resistant attendance records feeding into the salary module, payroll processing becomes faster and more reliable. Fewer disputes and corrections reduce administrative overhead.

**Compliance Readiness**  
The comprehensive audit log, structured permission system, and secure data handling practices position the organisation well for labour law compliance and data protection requirements.

**Future-Ready Infrastructure**  
The system is built on a horizontally scalable architecture with Redis-backed Socket.IO, Docker containerisation, and a clean module structure. It can grow from dozens to thousands of employees without re-platforming.

### 11.5 Summary of Key Metrics

| Metric | Without Alyah Smart Attendance | With Alyah Smart Attendance |
|---|---|---|
| Attendance recording time | 2–5 minutes (manual) | < 5 seconds (GPS/QR) |
| Attendance data availability | End of day | Real-time (< 500ms) |
| Leave processing time | 2–5 business days | Hours (real-time workflow) |
| Buddy punching risk | High | Eliminated (device binding) |
| Audit reconstruction | Manual, incomplete | Complete, instant |
| HR admin workload | 15–20% of work time | < 2% of work time |
| Report generation time | Hours (manual) | Seconds (on-demand) |

---

*Document ends — Alyah Smart Attendance SRS v1.0*  
*Prepared by Alyah Technologies Development Team — July 10, 2026*
