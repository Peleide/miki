# MIKI - Suivi de Pointage: Brownfield Architecture Document

## Introduction

This document captures the **CURRENT STATE** of the MIKI codebase, including technical debt, workarounds, and real-world patterns. It serves as a reference for AI agents working on bug fixes and maintenance tasks.

MIKI is a multi-tenant cleaning and maintenance tracking application with AI assistance. It enables cleaning agents to check in/out of rooms via QR codes, managers to oversee operations, and clients to view anonymized analytics.

### Document Scope

Comprehensive documentation of the entire system - no specific PRD provided.

### Change Log

| Date       | Version | Description                   | Author     |
| ---------- | ------- | ----------------------------- | ---------- |
| 2026-01-08 | 1.0     | Initial brownfield analysis   | AI Analyst |

---

## Quick Reference - Key Files and Entry Points

### Critical Files for Understanding the System

| File | Purpose | Lines |
|------|---------|-------|
| `functions/src/index.ts` | **Main backend logic** - All Cloud Functions with transaction handling | ~327 |
| `services/db.ts` | **Frontend database bridge** - Cloud Functions calls + direct Firestore reads | ~250 |
| `App.tsx` | **Main app routing** - Auth flow, role-based views, tenant switching | ~187 |
| `services/geminiService.ts` | **AI chat** - Gemini integration with function calling | ~104 |
| `types.ts` | **Data model definitions** - All TypeScript interfaces | ~122 |
| `firestore.rules` | **Security rules** - Client-side access control | ~37 |
| `services/firebaseConfig.ts` | **Firebase initialization** - SDK setup with region config | ~25 |

### Main Entry Points

- **Frontend Entry**: `index.tsx` -> `App.tsx`
- **Backend Entry**: `functions/src/index.ts`
- **Configuration**: `vite.config.ts`, `services/firebaseConfig.ts`

---

## High Level Architecture

### Technical Summary

MIKI follows a **serverless architecture** with Firebase as the backend platform:

```
[React SPA] <---> [Cloud Functions] <---> [Firestore]
     |                   |
     |                   +---> [Firebase Auth]
     |
     +---> [Gemini AI API]
```

**Key Architectural Decisions:**
- **Writes go through Cloud Functions** - All mutations via `httpsCallable`, never direct Firestore writes from client
- **Reads are direct** - Client SDK reads from Firestore with security rules
- **Multi-tenant isolation** - Data partitioned under `/tenants/{tenantId}/` subcollections
- **Role-based access** - `tenantsAccess` map on User documents defines permissions per tenant

### Actual Tech Stack (from package.json)

| Category | Technology | Version | Notes |
|----------|------------|---------|-------|
| **Frontend** |
| UI Framework | React | 19.2.3 | Latest major version with hooks |
| Bundler | Vite | 6.2.0 | Dev server on port 3000 |
| Language | TypeScript | 5.8.2 | Strict mode enabled |
| Styling | Tailwind CSS | CDN | Via `index.html` CDN import |
| Icons | Lucide React | 0.562.0 | Full icon library |
| Charts | Recharts | 3.6.0 | For dashboard analytics |
| QR Scanning | html5-qrcode | 2.3.8 | Camera-based QR reader |
| QR Generation | react-qr-code | 2.0.15 | SVG QR code rendering |
| **Backend** |
| Platform | Firebase | 12.7.0 (client) | Full Firebase stack |
| Cloud Functions | firebase-functions | 7.0.2 (root), 6.0.0 (functions/) | **Version mismatch** |
| Admin SDK | firebase-admin | 13.6.0 (root), 13.0.0 (functions/) | **Version mismatch** |
| AI | @google/genai | 1.34.0 | Gemini 3 Flash Preview |
| **Runtime** |
| Node.js | 20 | Required for Cloud Functions |
| Region | australia-southeast1 | Hardcoded in both client and functions |

### Repository Structure

- **Type**: Single repository with nested functions package
- **Package Manager**: npm
- **Module System**: ESM for frontend (`"type": "module"`), CommonJS for functions

---

## Source Tree and Module Organization

### Project Structure (Actual)

```
miki/
├── index.html              # HTML entry with CDN imports (Tailwind, fonts)
├── index.tsx               # React entry point
├── App.tsx                 # Main app component with auth/routing
├── types.ts                # All TypeScript interfaces
├── package.json            # Frontend dependencies
├── vite.config.ts          # Vite configuration
├── tsconfig.json           # TypeScript config (ES2022, react-jsx)
├── firestore.rules         # Firestore security rules
├── metadata.json           # App metadata (permissions)
│
├── components/             # React UI components (9 files)
│   ├── AdminPanel.tsx      # Platform admin interface
│   ├── AgentView.tsx       # Agent check-in/out interface (~515 lines)
│   ├── AIChat.tsx          # Gemini AI chat panel
│   ├── Dashboard.tsx       # Manager/Client analytics (~662 lines)
│   ├── ForcePasswordChange.tsx # Mandatory password change flow
│   ├── Layout.tsx          # App wrapper with navigation
│   ├── Login.tsx           # Auth form with auto-seeding
│   ├── Logo.tsx            # Branding component
│   └── ManagementPanel.tsx # Manager admin panel (~460 lines)
│
├── services/               # Business logic services (4 files)
│   ├── db.ts               # Database service class (~250 lines)
│   ├── firebaseConfig.ts   # Firebase SDK initialization
│   ├── geminiService.ts    # AI service with function calling
│   └── mockDb.ts           # Commented out (legacy/unused)
│
├── functions/              # Firebase Cloud Functions
│   ├── package.json        # Functions dependencies (separate)
│   ├── tsconfig.json       # Functions TypeScript config (ES2017)
│   └── src/
│       └── index.ts        # All Cloud Functions (~327 lines)
│
└── backend/                # Legacy/reference implementation
    └── functions.ts        # Alternative backend (appears unused)
```

### Key Modules and Their Purpose

**Frontend Components:**

| Component | Responsibility | Key Features |
|-----------|---------------|--------------|
| `App.tsx` | Main orchestrator | Auth state, tenant switching, role-based routing |
| `AgentView.tsx` | Agent operations | QR scanning, check-in/out, manual exit, reports |
| `Dashboard.tsx` | Analytics view | Check-in history, reports, filtering, CSV export |
| `ManagementPanel.tsx` | Manager admin | User CRUD, room management, QR printing |
| `AdminPanel.tsx` | Platform admin | Tenant management, global user management |
| `Login.tsx` | Authentication | Auto-seeds database on first run |

**Services:**

| Service | Responsibility | Pattern |
|---------|---------------|---------|
| `db.ts` | All data operations | Class-based singleton, bridges to Cloud Functions |
| `geminiService.ts` | AI integration | Instance-per-user for context isolation |
| `firebaseConfig.ts` | SDK setup | Single initialization, exports instances |

---

## Data Models and APIs

### Data Models

All interfaces defined in `types.ts`:

```typescript
// Core enums
enum UserRole { ADMIN, MANAGER, AGENT, CLIENT }
type CheckInType = 'ENTRY' | 'EXIT';

// Key interfaces (see types.ts for full definitions)
interface Tenant { id, name, status, logoUrl?, timezone, quotas }
interface User { id, email, firstName, lastName, tenantId, role, tenantsAccess, activeSessionId?, activeRoomId? }
interface Room { id, tenantId, departmentId, name, qrCode, instructions, isArchived }
interface CheckIn { id, tenantId, roomId, userId, timestamp, type, sessionId, agentNameSnapshot?, ... }
interface Report { id, tenantId, roomId, userId, message, tags, status }
interface Department { id, tenantId, establishmentId, name, isArchived }
interface Establishment { id, tenantId, name, isArchived }
interface AuditLog { id, timestamp, userId, userName, action, details, tenantId, category }
```

### Firestore Collections Structure

```
/tenants/{tenantId}/
  ├── rooms/           # Cleaning locations with QR codes
  ├── departments/     # Organizational units
  ├── establishments/  # Physical facilities
  ├── checkins/        # Entry/exit timestamps
  └── reports/         # Maintenance issues

/users/{uid}/          # User profiles with multi-tenant access
/audit_logs/           # Platform-wide audit trail (admin only)
```

### Cloud Functions API

All functions deployed to `australia-southeast1`:

| Function | Purpose | Allowed Roles | Key Logic |
|----------|---------|---------------|-----------|
| `addCheckIn` | Record entry/exit | AGENT, MANAGER, ADMIN | Transaction-based state machine |
| `cancelActiveSession` | Abort session | AGENT, MANAGER, ADMIN | Batch delete + user state reset |
| `deleteCheckIn` | Remove check-in | MANAGER, ADMIN | Direct delete |
| `manageUser` | CREATE/UPDATE/RESET_PASSWORD | MANAGER, ADMIN | Firebase Auth integration |
| `manageStructure` | CRUD for entities | MANAGER, ADMIN | Tenant/Est/Dept/Room management |
| `submitReport` | Create/archive reports | All roles (archive: MANAGER+) | Snapshot-based records |
| `seedSystem` | Initialize demo data | Unauthenticated (one-time) | Creates admin + demo tenant |

### Frontend Service Methods (db.ts)

**Write Operations (via Cloud Functions):**
- `addCheckIn()`, `deleteCheckIn()`, `cancelActiveSession()`
- `createUser()`, `managerUpdateUser()`, `adminUpdateUser()`, `managerResetPassword()`
- `createTenant()`, `createEstablishment()`, `createDepartment()`, `createRoom()`, `updateRoom()`
- `createReport()`, `archiveReport()`

**Read Operations (direct Firestore):**
- `authenticate()`, `getUserProfile()`, `switchTenant()`
- `getCheckIns()`, `getCheckInsForAI()`, `getReports()`
- `getRooms()`, `getDepartments()`, `getEstablishments()`
- `getUsers()`, `getAllUsers()`, `getTenant()`, `getAllTenants()`
- `getAuditLogs()`, `getTenantUsageMetrics()`

---

## Technical Debt and Known Issues

### Critical Technical Debt

1. **Package Version Mismatch** (`package.json` vs `functions/package.json`)
   - Root: `firebase-admin@13.6.0`, `firebase-functions@7.0.2`
   - Functions: `firebase-admin@13.0.0`, `firebase-functions@6.0.0`
   - **Impact**: Potential runtime inconsistencies, confusing for maintenance
   - **Location**: `package.json:20-21`, `functions/package.json:17-18`

2. **Hardcoded Firebase Config** (`services/firebaseConfig.ts:7-15`)
   - API keys embedded in source code
   - **Impact**: Not a security risk for client SDKs, but makes rotation difficult
   - **Recommendation**: Move to environment variables for flexibility

3. **Large Component Files**
   - `Dashboard.tsx`: 662 lines - complex filtering, hybrid state/history logic
   - `AgentView.tsx`: 515 lines - scanner management, modal state
   - `ManagementPanel.tsx`: 460 lines - multiple CRUD operations
   - **Impact**: Harder to maintain, test, and understand

4. **No Test Suite**
   - Zero test files, no testing framework installed
   - **Impact**: No safety net for refactoring or bug fixes
   - **Location**: Missing `tests/`, no Jest/Vitest in dependencies

5. **Unused Legacy Code** (`backend/functions.ts`, `services/mockDb.ts`)
   - Appears to be reference/backup implementation
   - **Impact**: Confusion about canonical implementation
   - **Recommendation**: Remove or document purpose

6. **Lint Skipped** (`functions/package.json:4`)
   - `"lint": "echo Lint-Skipped"` - ESLint not running
   - **Impact**: Code quality not enforced

### Workarounds and Gotchas

1. **Timezone Handling** (`Dashboard.tsx:73-87`)
   - Date range queries extended by -1/+1 day to compensate for timezone differences
   - **Comment in code**: "CORRECTION TIMEZONE : On élargit la requête BDD"
   - **Impact**: Must understand this when modifying date filters

2. **Session State Machine** (`functions/src/index.ts:38-101`)
   - Complex validation logic for ENTRY/EXIT state transitions
   - Uses `activeRoomId` and `activeSessionId` on User document
   - **CRITICAL**: Must maintain transaction integrity

3. **Client Role Anonymization** (`services/db.ts:218`)
   - CLIENT role users see anonymized agent data: `agentNameSnapshot: 'Agent', userId: 'ANON'`
   - **Impact**: AI service also respects this in `geminiService.ts:45-46`

4. **Auto-Seed on Empty Database** (`components/Login.tsx:14-21`)
   - Automatically calls `seedDatabase()` if no tenants exist
   - Creates `admin@miki.app` with `password123`
   - **Impact**: Useful for demo, but must change credentials in production

5. **QR Code Format** (`functions/src/index.ts:256-257`)
   - QR codes prefixed with `MIKI_` followed by random alphanumeric
   - Scanner validates this prefix (`AgentView.tsx:122`)
   - **Format**: `MIKI_{8-char-random}`

6. **Firebase Functions Region**
   - **Hardcoded in two places**: `services/firebaseConfig.ts:24` and `functions/src/index.ts:40`
   - Must update both if region changes

7. **Local Storage Keys**
   - `miki_view_{userId}`: Persisted view preference
   - `miki_agent_mode`: Persisted scan/list mode for agents

---

## Integration Points and External Dependencies

### External Services

| Service | Purpose | Integration Type | Key Files |
|---------|---------|------------------|-----------|
| Firebase Auth | User authentication | SDK | `services/firebaseConfig.ts`, `services/db.ts` |
| Firestore | Document database | SDK + Admin | `services/db.ts`, `functions/src/index.ts` |
| Cloud Functions | Backend logic | httpsCallable | `services/db.ts:28-37` |
| Google Gemini AI | AI chat assistant | REST SDK | `services/geminiService.ts` |

### Firebase Project Details

```
Project ID: miki-app-d3a74
Region: australia-southeast1
Auth Domain: miki-app-d3a74.firebaseapp.com
Storage Bucket: miki-app-d3a74.firebasestorage.app
```

### Environment Variables

| Variable | Purpose | Location |
|----------|---------|----------|
| `GEMINI_API_KEY` / `API_KEY` | Google AI API key | `.env.local` (not in repo) |

**Vite Injection** (`vite.config.ts:13-15`):
```javascript
'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
```

---

## Development and Deployment

### Local Development Setup

1. **Install dependencies:**
   ```bash
   npm install
   cd functions && npm install
   ```

2. **Create `.env.local`:**
   ```
   GEMINI_API_KEY=your_api_key_here
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```
   Server runs on `http://0.0.0.0:3000`

4. **First run**: Login page will auto-seed database with:
   - Email: `admin@miki.app`
   - Password: `password123`

### Build and Deployment

**Frontend:**
```bash
npm run build     # Production build via Vite
npm run preview   # Preview production build locally
```

**Functions:**
```bash
cd functions
npm run build           # TypeScript compilation
npm run serve           # Local emulator
npm run deploy          # Deploy to Firebase
npm run logs            # View function logs
```

### Project Scripts (package.json)

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `vite` | Start dev server |
| `build` | `vite build` | Production build |
| `preview` | `vite preview` | Preview production |

---

## Security Model

### Access Control Flow

```
1. User authenticates via Firebase Auth
2. Client SDK reads /users/{uid} document
3. tenantsAccess map determines roles per tenant
4. Cloud Functions verify access via verifyAccess()
5. Firestore Rules provide client-side backup validation
```

### verifyAccess() Function (`functions/src/index.ts:12-36`)

```typescript
async function verifyAccess(uid: string, tenantId: string, allowedRoles: string[]) {
  // 1. Check user exists and not disabled/archived
  // 2. Platform ADMIN has global access
  // 3. 'platform' tenantId = self-service operations
  // 4. Verify role in tenantsAccess[tenantId]
}
```

### Firestore Rules Summary (`firestore.rules`)

| Collection | Read | Write |
|------------|------|-------|
| `/users/{userId}` | Own profile or platform admin | **Never** (functions only) |
| `/tenants/{tenantId}/**` | Tenant members | **Never** (functions only) |
| `/audit_logs/{logId}` | Platform admin only | **Never** |

**Key Security Principle**: All writes disabled at client level, enforced through Cloud Functions.

---

## Testing Reality

### Current Test Coverage

- **Unit Tests**: None
- **Integration Tests**: None
- **E2E Tests**: None
- **Manual Testing**: Primary QA method

### Missing Testing Infrastructure

- No test framework (Jest, Vitest, etc.)
- No test configuration files
- No CI/CD pipeline for automated testing
- Lint skipped in functions package

---

## UI/UX Patterns

### Design System

- **Font**: Geist (via CDN)
- **Styling**: Tailwind CSS with custom design tokens
- **Animation**: `animate-in`, `slide-in-from-*`, `zoom-in-*` classes
- **Icons**: Lucide React throughout

### Component Patterns

1. **Modal Pattern**: Fixed overlay with backdrop blur, slide-up animation
2. **Form Pattern**: Labels as uppercase tracking-widest, rounded-2xl inputs
3. **Button Pattern**: Primary (bg-primary), Danger (bg-danger), Ghost (bg-gray-50)
4. **Table Pattern**: Desktop table view, mobile card view

### Responsive Breakpoints

- Mobile-first design
- `sm:` for tablet
- `lg:` for desktop (table views appear at lg)

---

## Key Business Logic

### Check-In State Machine (`functions/src/index.ts:38-101`)

```
                    ┌─────────────────┐
                    │   No Session    │
                    └────────┬────────┘
                             │ ENTRY
                             ▼
                    ┌─────────────────┐
                    │ Active Session  │
                    │ (activeRoomId)  │
                    └────────┬────────┘
                             │ EXIT (same room)
                             ▼
                    ┌─────────────────┐
                    │   No Session    │
                    └─────────────────┘

BLOCKED:
- ENTRY when active in DIFFERENT room
- ENTRY when already active in SAME room
- EXIT when no active session
- EXIT for DIFFERENT room than active
```

### Session Hybrid View (`Dashboard.tsx:169-256`)

Dashboard reconstructs sessions from two sources:
1. **Check-in logs**: Historical ENTRY/EXIT pairs matched by sessionId
2. **Live user state**: Users with `activeRoomId` set (may not have logs yet)

This hybrid approach ensures "live" sessions appear even before first log sync.

### Multi-Tenant Access Model

```typescript
// User document structure
{
  tenantsAccess: {
    "platform": "ADMIN",     // Global admin access
    "t1": "MANAGER",         // Manager on tenant t1
    "t2": "AGENT"            // Agent on tenant t2
  },
  accessibleTenantIds: ["platform", "t1", "t2"]
}
```

Users can switch between tenants via `db.switchTenant()`, which updates the session context (tenantId, role) without server call.

---

## Appendix - Useful Commands and Scripts

### Frequently Used Commands

```bash
# Development
npm run dev                    # Start frontend dev server (port 3000)
cd functions && npm run serve  # Start functions emulator

# Build
npm run build                  # Build frontend
cd functions && npm run build  # Build functions

# Deployment
cd functions && npm run deploy # Deploy functions to Firebase

# Logs
cd functions && npm run logs   # View Firebase function logs
```

### Common File Locations

| Need | File |
|------|------|
| Add new type | `types.ts` |
| Add new Cloud Function | `functions/src/index.ts` |
| Add new DB method | `services/db.ts` |
| Change Firebase config | `services/firebaseConfig.ts` |
| Change security rules | `firestore.rules` |
| Add new component | `components/` |
| Change routing | `App.tsx` |

### Debugging Tips

1. **Cloud Functions errors**: Check console for `[MIKI BACKEND]` prefix
2. **Auth issues**: Check `tenantsAccess` map on user document
3. **Session issues**: Verify `activeRoomId`/`activeSessionId` on user document
4. **Timezone issues**: Remember +/- 1 day buffer in queries

---

## Summary for AI Agents

**Before making changes:**
1. Read the relevant file completely
2. Understand the transaction/security implications
3. Check for hardcoded values that might need updating in multiple places
4. Test changes manually (no automated tests exist)

**Key constraints:**
- All writes must go through Cloud Functions
- Session state machine must be respected
- Timezone handling has specific workarounds
- CLIENT role sees anonymized data

**High-risk areas:**
- `addCheckIn` function - complex state machine
- `Dashboard.tsx` - hybrid session reconstruction
- Any changes to `tenantsAccess` handling - affects authorization everywhere
