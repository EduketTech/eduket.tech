Here is your updated, production-ready `README.md`. It incorporates all recent architectural refinements—specifically addressing the **time-zone and dynamic reference bug mitigations in countdown logic**, the **hardened Firestore Security Rules (`sameSchool()` helper standardizations, `teacherCount` / `studentCount` scalar type validation)**, and the **resolution of nested `get()` execution limits**.

---

```markdown
<div align="center">

# Eduket OS

**A multi-tenant, AI-powered school management and examination platform for African education systems.**

Built by **Nextgen Skills** · Serving CAPS/NSC, IEB, SACAI, ZIMSEC, and other curricula across South Africa and beyond

[![Frontend](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61DAFB?style=for-the-badge&logo=react)](#technology-stack)
[![Backend](https://img.shields.io/badge/Backend-Flask-3B82F6?style=for-the-badge&logo=flask)](#technology-stack)
[![Database](https://img.shields.io/badge/Database-Firestore-FFA000?style=for-the-badge&logo=firebase)](#technology-stack)
[![AI](https://img.shields.io/badge/AI-Groq%20LLM-f59e0b?style=for-the-badge)](#technology-stack)
[![License](https://img.shields.io/badge/License-Proprietary-22c55e?style=for-the-badge)](#license)

</div>

---

## Table of Contents

- [What is Eduket OS](#what-is-eduket-os)
- [Who This Is For](#who-this-is-for)
- [Architecture Overview](#architecture-overview)
- [Technology Stack](#technology-stack)
- [Core Subsystems](#core-subsystems)
  - [1. Multi-Tenancy & Identity](#1-multi-tenancy--identity)
  - [2. Multi-Role Dashboards](#2-multi-role-dashboards)
  - [3. Document Extraction & Exam Pipeline (v4)](#3-document-extraction--exam-pipeline-v4)
  - [4. AI Marking Engine & Remarking](#4-ai-marking-engine--remarking)
  - [5. AI Tutor & Socratic Exam Guardian](#5-ai-tutor--socratic-exam-guardian)
  - [6. Subject Gap Analysis & Analytics](#6-subject-gap-analysis--analytics)
  - [7. Multi-Tier Billing & PayFast Engine](#7-multi-tier-billing--payfast-engine)
- [Data Model](#data-model)
- [Security Model & Rule Optimization](#security-model--rule-optimization)
- [State Management & Real-Time Engine (Countdown Timers)](#state-management--real-time-engine-countdown-timers)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Related Products](#related-products)
- [Known Gaps & Technical Debt](#known-gaps--technical-debt)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## What is Eduket OS

Eduket OS (internally referenced as **Eduplanet OS** / **EduCAT**) is an enterprise-grade school management and AI-driven examination ecosystem tailored for schools operating across CAPS, IEB, SACAI, and ZIMSEC frameworks. It unifies exam ingestion, automated mark computation, diagnostic progress tracking, and multi-currency billing into a single tenant-isolated platform.

The architecture is **strictly multi-tenant**:
- Every document across the database is isolated via a universal `schoolId` partition key.
- Purpose-built dashboards exist for four explicit user roles: **Student, Teacher, Principal, and Parent**.
- Institutions operate under distinct pricing tiers, currencies, and curriculum configurations without cross-tenant data leakage.

The ecosystem integrates three core systems:
1. **A Tenant Operations Platform** — Handles school onboarding, role verification, subscription states, and resource counts.
2. **An AI Ingestion & Exam Engine** — Converts raw exam papers (`.docx`/`.pdf`) into structured question JSONs, delivers low-latency exam environments, and calculates marks using semantic AI comparison.
3. **An Adaptive Learning Layer** — Operates a Groq-powered Socratic AI Tutor with persistent per-student performance memory, supported by a diagnostic report generation pipeline.

---

## Who This Is For

- **Principals & Administrators** — Require absolute tenant isolation, real-time subscription lifecycle management, and consolidated cross-school analytics without performance bottlenecks.
- **Teachers & Examiners** — Need to ingest paper-based exams instantly, execute AI auto-marking, manually adjust or trigger full AI re-marks, and generate letterhead-formatted analytical performance reports.
- **Students** — Require a stable exam environment that preserves session state across auto-saves, accurate countdown timers, and an AI tutor that targets historical weak points without giving away direct exam solutions.
- **Parents** — Require clear, actionable diagnostic progress summaries and gap analysis reports for their children rather than raw, uncontextualized grade metrics.

---

## Architecture Overview


```

┌────────────────────────────────────────────────────────────────────────┐
│                   React + Vite Frontend (Netlify)                      │
│                                                                        │
│  Student Dashboard  · Teacher Dashboard  · Principal Dashboard          │
│  Parent Dashboard   · ExamResultsDisplay · ResultsTab · AITutor        │
│  AIExamMocker       · SchoolRegistration · Billing UI                  │
└───────────────────┬───────────────────────────┬────────────────────────┘
│                           │
Firebase SDK (Direct Reads)     HTTPS (REST Calls)
│                           │
▼                           ▼
┌───────────────────────────┐   ┌────────────────────────────────────────┐
│  Firebase Infrastructure  │   │       Flask REST API (Render)          │
│                           │   │                                        │
│  • Firestore Database     │   │  /exams/upload  /exams/usage           │
│  • Firebase Authentication│   │  /agent-chat    /subject-gap-analysis    │
│  • Firebase Storage       │   │  /remark        /start_exam            │
│                           │   │  /submit_exam   /api/billing/initiate  │
│  Declarative Security     │   └───────────────┬────────────────────────┘
│  Rules enforce `schoolId` │                   │
│  isolation per query      │                   ▼
└───────────────────┬───────┘   ┌────────────────────────────────────────┐
│           │         Groq Inference Engine          │
│           │                                        │
│           │  • llama-3.3-70b (Agent & Marking)     │
│           │  • qwen/qwen3-vl-8b (Vision Ingestion) │
│           └────────────────────────────────────────┘
│
▼
┌────────────────────────────────────────────────────────────────────────┐
│             Document Extraction Pipeline (v4 Architecture)             │
│                                                                        │
│  Uploaded exam file (.docx / .pdf)                                     │
│       → Headless LibreOffice conversion to PDF                         │
│       → PyMuPDF renders each page as a high-resolution image           │
│       → Page images uploaded to Firebase Storage                        │
│       → Groq Vision parses page images into structured Question JSON    │
│       → Questions merged, deduplicated, and memos matched via Q-Number  │
└────────────────────────────────────────────────────────────────────────┘

```

### Dual Data-Access Strategy
- **Client-Direct Firestore Reads:** The React frontend list-listens to Firestore directly for live updates (dashboards, results, exam states). Security is guaranteed by server-side declarative Security Rules, preventing redundant API layer round-trips.
- **Backend API Writes & High-Trust Operations:** The Flask REST API handles high-trust procedures: payment signature verification (PayFast ITN), document extraction pipelines, Groq API key protection, and write paths where `schoolId` must be derived from verified Auth context.

---

## Technology Stack

| Domain | Technology | Justification |
| :--- | :--- | :--- |
| **Frontend Framework** | React + Vite | Low-overhead SPA build process, fast component state reconciliation. |
| **Frontend Hosting** | Netlify | Global CDN edge distribution with automated git deployment hooks. |
| **Backend Framework** | Flask (Python 3.10+) | Synchronous thread processing aligned with blocking LLM processing pipelines. |
| **Backend Hosting** | Render | Persistent runtime supporting `gunicorn` worker processes and system dependencies (`LibreOffice`). |
| **Database & Auth** | Firebase (Firestore / Auth) | Real-time state syncing, built-in security rule evaluator, multi-provider identity management. |
| **File Storage** | Firebase Storage | High-throughput object storage for rendered exam page artifacts. |
| **AI / LLM Engine** | Groq (`llama-3.3-70b`, `qwen/qwen3-vl-8b`) | Sub-second latency required for student Socratic interaction and automated exam grading. |
| **Document Processing** | LibreOffice Headless + PyMuPDF | Flawless PDF transformation and vector page rendering for vision ingestion. |
| **Payments Integration** | PayFast | Multi-currency gateway handling ITN (Instant Transaction Notification) webhooks. |
| **Process Management** | `gunicorn` + `post_fork` hook | Isolated per-worker Firebase Admin SDK re-initialization to eliminate cross-thread lock state. |

---

## Core Subsystems

### 1. Multi-Tenancy & Identity
Tenant isolation relies on a universal `schoolId` field stamped on all primary documents. 
- **Security Rules Enforcement:** The client cannot pass arbitrary tenant identities. Every write operation verifies that `request.resource.data.schoolId` matches the client's verified profile (`users/{uid}.schoolId`).
- **Role Resolution:** Role helpers (`isTeacher()`, `isPrincipal()`, `isStaff()`) inspect the authenticated user's profile document (`users/{uid}`) to validate elevated permissions.

### 2. Multi-Role Dashboards
- **Student Dashboard:** Hosts active exam sessions, auto-saved attempts, AI Socratic Tutor, personalized study plan displays, and the `ExamResultsDisplay.jsx` insight suite.
- **Teacher Dashboard:** Manages class submissions, multi-type exam creation, manual score overrides, AI re-marks, and analytical PDF export workflows (`ResultsTab.jsx`).
- **Principal Dashboard:** Consolidates institution metrics, staff approval queues, audit trails, and subscription tier management inside an auth-gated listener.
- **Parent Dashboard:** Displays plain-language performance analysis, link-verified student access (`parentAccess`), and diagnostic progress letters.

### 3. Document Extraction & Exam Pipeline (v4)

```

.docx / .pdf File Upload
│
├──> Headless LibreOffice Pipeline (Converts DOCX to PDF)
│
├──> PyMuPDF Rendering Engine (Renders PDF pages to 300 DPI Images)
│
├──> Firebase Storage Ingestion (Generates volatile access URIs)
│
├──> Groq Vision Parsing Engine (Generates Structured Question & Memo JSON)
│
└──> Memo Injection (Matches Memo to Question strictly via `question_number`)

```
*Note: Array-index matching was deprecated in v4 to resolve misalignments caused by uneven page section breaks.*

### 4. AI Marking Engine & Remarking
The platform processes distinct question paradigms using custom evaluation routines:

| Question Paradigm | Evaluation Protocol |
| :--- | :--- |
| **Multiple Choice (MCQ)** | String-level exact match against key — zero LLM overhead. |
| **True / False** | Normalized string match with optional statement correction verification. |
| **Matching Columns** | Key-value mapping array evaluation with proportional score distribution. |
| **Open-Ended / Descriptive** | Groq LLM semantic parsing against mark schemes. Enforces strict boundary clamping (`0 <= mark <= max_marks`) in JSON outputs. |

Teachers can initiate an **AI Re-mark** (re-evaluating the submission against updated mark schemes) or perform a **Manual Adjustment** directly within the `Remark` modal. Both operations write directly to Firestore, updating student and teacher UIs instantly.

### 5. AI Tutor & Socratic Exam Guardian
The AI Tutor operates as a tool-calling agent with persistent student memory:
- **Persistent Knowledge Graph:** Tracks student weak points, past exam failures, and topic mastery over time (`memory.py`).
- **Socratic Exam Mode:** When an active exam attempt is detected, the tutor enters a constrained mode. It references the underlying answer memo internally to provide guiding questions without disclosing direct answers.
- **State Isolation:** Prevents concurrent execution of tutor agent tool calls during active exam submission lockouts.

### 6. Subject Gap Analysis & Analytics
Through `/subject-gap-analysis`, the system compiles student performance data into diagnostic summaries:
- Processes incorrect answers across configurable timeframes (7, 30, 90, 365 days, or custom ranges).
- Identifies underlying conceptual gaps using Groq LLM logic instead of relying on simple percentage metrics.
- Generates downloadable, letterhead-formatted assessment reports for teachers, parents, and school leadership.

### 7. Multi-Tier Billing & PayFast Engine
Operates a 5-tier institutional model (**Free, Silver, Gold, Platinum, Diamond**):
- Features a dynamic pricing formula combining regional currency weights (e.g., 3× pricing multiplier for USD-billed zones) and school size indices.
- Utilizes PayFast ITN webhook handlers (`payfast_itn.py`) running under Admin SDK privileges.
- Implements **strict field locking** in Firestore Security Rules: Critical billing attributes (`tier`, `nextBillingDate`, `tierUpdatedAt`, `pfPaymentId`, `subscribedAt`) are read-only for clients and can only be mutated by the Firebase Admin SDK.

---

## Data Model

Primary Firestore collections and their corresponding tenant partition keys:

| Collection Path | Purpose | Partition Key / Access Control |
| :--- | :--- | :--- |
| `/users/{uid}` | Core profile, role, and tenant metadata | `schoolId` / Owned by `uid` |
| `/schools/{schoolId}` | Institution metadata, capacity counters, tier | Document ID (`schoolId`) |
| `/students/{uid}` | Student-specific profile extension | `schoolId` / Owned by `uid` |
| `/teachers/{uid}` | Teacher profile and assigned subjects | `schoolId` / Owned by `uid` |
| `/principals/{uid}` | Executive staff credentials | Owned by `uid` |
| `/exams/{examId}` | Ingested exam metadata and answer keys | `schoolId` |
| `/exam_questions/{docId}` | Questions tied to parent exams | Resolves via parent `examId` |
| `/exam_attempts/{docId}` | Exam attempt records, marks, and feedback | `schoolId`, `studentUid` (and `studentId`) |
| `/schoolActivity/{eventId}`| System logs and audit events | `schoolId` |
| `/parentAccess/{accessId}`| Parent-to-student access mappings | `schoolId`, `parentUid`, `studentUid` |
| `/billing/{docId}` | School billing records | `schoolId` (Admin SDK write-locked) |
| `/paymentTransactions/{txId}`| PayFast audit records | Admin SDK only |

---

## Security Model & Rule Optimization

Firestore Security Rules enforce tenant isolation and system integrity. Recent refactoring resolved recursive `get()` limits and security loopholes.

### Key Security Implementations
1. **Elimination of Recursive Lookup Chains:** Helper functions optimize document checks to prevent exceeding Firestore's limit of 10 `get()` calls per evaluation.
2. **Standardized School Isolation (`sameSchool`):** Replaced duplicate inline check logic with a unified `sameSchool(schoolId)` helper.
3. **Counter Tamper Protection:** Restricted updates to `/schools/{schoolId}` to enforce `is number` type-checks on `teacherCount` and `studentCount`, preventing arbitrary string or out-of-bounds scalar injections.
4. **Billing Lockout Protection:** Client updates to `/schools/{schoolId}` cannot mutate billing fields (`tier`, `subscribedAt`, etc.). These fields are restricted to Admin SDK context.
5. **Collection Query Compatibility:** Rules align with client-side `where()` clauses. Queries missing appropriate filters (e.g., `where('schoolId', '==', userSchoolId)`) are blocked by design.

#### Consolidated Rules Architecture Example
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() {
      return request.auth != null;
    }

    function getUserData() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
    }

    function hasUserDoc() {
      return isSignedIn() && exists(/databases/$(database)/documents/users/$(request.auth.uid));
    }

    function userRole() {
      return hasUserDoc() ? getUserData().role : null;
    }

    function userSchoolId() {
      return hasUserDoc() ? getUserData().schoolId : null;
    }

    function isStaff() {
      return isSignedIn() && (userRole() == 'teacher' || userRole() == 'principal');
    }

    function sameSchool(schoolId) {
      return isSignedIn() && userSchoolId() == schoolId;
    }

    // Example: Strict document isolation for exam attempts
    match /exam_attempts/{docId} {
      allow read: if isSignedIn() && (
        resource.data.studentUid == request.auth.uid ||
        (isStaff() && sameSchool(resource.data.schoolId))
      );
      allow create: if isSignedIn() && request.resource.data.studentUid == request.auth.uid;
      allow update: if isSignedIn() && (
        resource.data.studentUid == request.auth.uid ||
        (isStaff() && sameSchool(resource.data.schoolId))
      );
    }
  }
}

```

---

## State Management & Real-Time Engine (Countdown Timers)

To ensure reliable timing across subscription counters and timed exam sessions, timer components must handle component lifecycle states and time-zone calculations correctly.

### Mitigation of Common Countdown Anomalies

1. **Preventing Re-creation of Date Instances:** Defining dynamic dates (e.g., `new Date()`) directly inside component render cycles causes reference shifts on every re-render. Target dates should be memoized using `useMemo` or stored in React `state`.
2. **Timezone Standardization:** ISO strings without explicit offset designations default to UTC midnight (`00:00:00Z`), which can cause local time shifts. Target strings should include explicit offsets or be parsed with unified Unix timestamp arithmetic (`.getTime()`).

#### Production Countdown Pattern

```javascript
useEffect(() => {
    if (!expiryDate || isSubscribed) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true });
        return;
    }

    const updateTimer = () => {
        const targetTime = expiryDate instanceof Date ? expiryDate.getTime() : new Date(expiryDate).getTime();
        const now = Date.now();
        const distance = targetTime - now;

        if (distance <= 0) {
            setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true });
            return;
        }

        // Millisecond base conversions: 86,400,000 ms/day; 3,600,000 ms/hr; 60,000 ms/min
        setTimeLeft({
            days: Math.floor(distance / 86400000),
            hours: Math.floor((distance % 86400000) / 3600000),
            minutes: Math.floor((distance % 3600000) / 60000),
            seconds: Math.floor((distance % 60000) / 1000),
            isExpired: false,
        });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
}, [expiryDate, isSubscribed]);

```

---

## Project Structure

```
eduket-os/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ExamResultsDisplay.jsx   # Student progress and AI result visualization
│   │   │   ├── ResultsTab.jsx           # Teacher results table, remarking, and export engine
│   │   │   ├── AITutor.jsx              # Socratic AI tutor interface
│   │   │   ├── AIExamMocker.jsx         # Exam delivery UI with local state tracking
│   │   │   └── SchoolRegistration.jsx   # School registration with dynamic subject pickers
│   │   └── utils/
│   │       ├── firebase.js              # Client-side Firebase SDK configuration
│   │       └── StudentId.js             # Identity mapping utility
│   └── firestore.rules                  # Production Security Rules source file
│
├── backend/
│   ├── app.py                           # Core Flask REST routing and app context
│   ├── billing_routes.py                # PayFast initiation endpoints
│   ├── payfast_itn.py                   # Secure ITN webhook verification
│   ├── model.py                         # Evaluation routines for varied question types
│   ├── agent.py                         # Groq Socratic agent loop
│   ├── process_exams.py                 # Document extraction and parsing pipeline (v4)
│   └── memory.py                        # Student knowledge graph and history tracking
│
└── README.md

```

---

## Getting Started

### Prerequisites

* **Node.js:** v18.0.0 or higher
* **Python:** v3.10 or higher
* **LibreOffice:** Installed on system `PATH` (Backend dependency for document rendering)
* **Firebase Project:** Configured with Auth, Firestore, and Storage
* **Groq API Key:** Active key from the [Groq Console](https://console.groq.com)

### Frontend Installation

```bash
cd frontend
npm install
npm run dev

```

*Configure client values in `src/utils/firebase.js` and set the backend API endpoint to target your server environment.*

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate # On Windows: venv\Scripts\activate
pip install -r requirements.txt
echo "GROQ_API_KEY=your_groq_api_key_here" > .env
python app.py

```

### Firestore Security Rules Deployment

Deploy updated security rules using the Firebase CLI:

```bash
firebase deploy --only firestore:rules

```

---

## Environment Variables

| Variable | Target Environment | Purpose |
| --- | --- | --- |
| `GROQ_API_KEY` | Backend (`.env`) | Authorizes requests to the Groq inference engine. |
| `PAYFAST_MERCHANT_ID` | Backend (`.env`) | PayFast account identification string. |
| `PAYFAST_MERCHANT_KEY` | Backend (`.env`) | Key required for PayFast payment gateway transactions. |
| `PAYFAST_PASSPHRASE` | Backend (`.env`) | Passphrase used for server-side ITN signature generation. |
| `FIREBASE_ADMIN_CREDENTIALS` | Backend (`Render Env`) | JSON string containing Firebase Service Account keys. |
| `VITE_FIREBASE_API_KEY` | Frontend (`.env`) | Client-side Firebase configuration values. |

---

## Related Products

* **EPRU Referee Portal:** An independent sports administration system sharing similar design patterns, including multi-tenant security structures and Firestore-backed reactive states. It operates in a separate repository with its own deployment targets.

---

## Known Gaps & Technical Debt

* **Dual Student Identifier References (`studentId` vs `studentUid`):** Legacy records utilize string-based display identifiers (`studentId`), whereas newer records use standard Firebase Auth UIDs (`studentUid`). Current frontend views query and merge both datasets client-side. A unified migration script is planned to consolidate these records to canonical `studentUid` references.
* **Exam Reference Integrity:** Select `exam_attempts` rely on dynamic session IDs rather than referencing primary document IDs in `/exams`. Cross-referencing falls back to raw string subject matches when primary IDs are unavailable.
* **Unfiltered Snapshot Listeners:** Listeners lacking explicit `where('schoolId', '==', ...)` parameters will trigger Firestore `permission-denied` errors due to query evaluation rules. All new client-side listeners must include appropriate tenant filters.
* **Sequential Multi-Subject Gap Calculations:** The `/subject-gap-analysis` endpoint queries subject reports sequentially. Consolidating these into a single batched LLM request will reduce overall API latency for multi-subject processing.

---

## Roadmap

* [ ] Execute database backfill script to standardize `exam_attempts` onto canonical `studentUid` keys.
* [ ] Implement automated Firebase Rules testing suite (`@firebase/rules-unit-testing`).
* [ ] Add support for diagram parsing and image-based sub-questions within the v4 extraction pipeline.
* [ ] Migrate Socratic AI Tutor responses to chunked streaming output (`Transfer-Encoding: chunked`).
* [ ] Implement batch processing for the multi-subject gap analysis endpoint.

---

## Contributing

Review system architecture and security rule patterns before submitting pull requests.

1. Ensure all new client-side Firestore queries contain appropriate `where('schoolId', '==', ...)` filters to comply with Security Rules.
2. Verify that billing field modifications are restricted to Admin SDK context.
3. Test document ingestion pipelines against complex `.docx` and `.pdf` files to verify parsing accuracy.

```bash
git checkout -b feature/feature-name
# Commit updates
git push origin feature/feature-name
# Open Pull Request

```

---

## License

Proprietary — © Nextgen Skills Development (Pvt) Ltd. All rights reserved.

---

Built for African schools · Multi-tenant by design · AI-assisted, human-verified  