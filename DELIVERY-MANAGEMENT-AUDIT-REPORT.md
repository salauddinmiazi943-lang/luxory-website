# LUXORA GLOBAL TRADE — Delivery Management System Audit

**Audit date:** 2026-11-05  
**Scope:** Delivery-related UI, API routes, authentication/permissions, Mongoose models, order workflows, and audit helpers. The initial matrix below records the pre-Phase-1 baseline; the implementation update records subsequent source changes and verification.

## Executive summary

This is a source-code audit, not a live operational or production-database audit. At the initial audit baseline, the repository had a partial delivery workflow: admins could assign order-line quantities to eligible existing users, delivery actors could report outcomes, admins could verify handovers and record COD settlement, customers could submit delivery complaints, and order audit events were stored. The Phase 1 implementation update below reflects the subsequent changes.

It is **not yet a complete Delivery Management System**. OTP or delivery-proof/GPS flow, a full delivery-status state machine, cash-deposit ledger, and employee/date reporting API are still missing. No database was queried or changed, and no migration was run. Actual production users, records, environment settings, and authenticated runtime behavior are therefore **Not Verified**.

### Requested-feature matrix

| Feature | Status | Existing File/API | Missing Work |
|---|---|---|---|
| Delivery Man Account | **Partial** | [User model](./src/lib/models.ts#L5), [staff account API](./src/app/api/admin/delivery-staff/accounts/route.ts), [staff update API](./src/app/api/admin/delivery-staff/[id]/route.ts), [login API](./src/app/api/auth/login/route.ts#L10) | Phase 1 adds a dedicated role, employee profile, bcrypt password hashing, lifecycle controls, and staff dashboard. The unique employee-ID index migration is prepared but not run, so account creation and employee-ID edits are intentionally blocked in production until it is applied. Live login/lifecycle flows are not verified. |
| Order Assignment | **Partial** | [assignment API](./src/app/api/admin/orders/[id]/delivery-assignment/route.ts), [staff orders API](./src/app/api/delivery/orders/route.ts), [delivery action API](./src/app/api/orders/[id]/delivery/route.ts), [dashboard](./src/components/dashboard.tsx) | Phase 1 adds single-assignee order assignment/reassignment with history, eligibility checks, and server-side own-order scoping. Assignment is blocked for orders already using item handovers. Live assignment/reassignment and cross-staff isolation are not verified against a test database. |
| OTP Verification | **Missing** | [delivery action API](./src/app/api/orders/[id]/delivery/route.ts#L12), [guest access-key helper](./src/lib/delivery-security.ts#L3) | No customer OTP generation, expiry, attempt limit, validation, or OTP-gated completion exists. The guest access key is for submitting a delivery complaint; it is not an OTP and does not authorize or verify delivery. |
| GPS Tracking | **Missing** | [delivery model](./src/lib/models.ts#L87), [delivery action API](./src/app/api/orders/[id]/delivery/route.ts#L12) | No latitude/longitude, location timestamp, location event, tracking endpoint, or map integration is present in the delivery schema/API. |
| Failed Delivery | **Partial** | [delivery action API](./src/app/api/orders/[id]/delivery/route.ts#L14), [order model](./src/lib/models.ts#L25), [admin bookings UI](./src/components/dashboard.tsx#L550) | A failure reason is required by the API (minimum 3 characters); the current failure time, actor, and reason are stored, and delivery audit events retain prior outcomes. Admins can inspect booking data. There is no dedicated failed-delivery report/filter, reschedule workflow, customer retry scheduling, or `returned` order status. |
| COD Management | **Partial** | [handover model](./src/lib/models.ts#L65), [delivery action API](./src/app/api/orders/[id]/delivery/route.ts#L269), [delivery settings API](./src/app/api/admin/delivery-settings/route.ts#L11), [admin bookings UI](./src/components/dashboard.tsx#L532) | Per-handover due, staff-reported collected, admin-settled, and discrepancy amounts are persisted and audited. Collection is capped at due and settlement is admin-only. Missing: a separate cash-deposit/receipt ledger, consolidated outstanding-cash reconciliation, independently evidenced handover, correction/reversal workflow after settlement, and COD reports. A single settlement is locked by `settledAt`; the API allows the settled figure to differ from the amount reported collected and records the difference as disputed. |
| Admin Dashboard | **Partial** | [admin summary API](./src/app/api/admin/summary/route.ts#L6), [dashboard](./src/components/dashboard.tsx), [delivery staff dashboard](./src/components/delivery-staff-dashboard.tsx) | Phase 1 adds delivery employee management and a staff dashboard with assigned/pending/completed/failed counts and order details. The admin summary still lacks assigned/successful/failed/pending/returned delivery KPIs and COD/outstanding-cash totals. |
| Performance Report | **Missing** | [dashboard heuristic](./src/components/dashboard.tsx#L471), [orders API](./src/app/api/orders/route.ts#L32) | No employee-wise/date-wise report endpoint, date filters, downloadable history, failed-reason aggregation, COD report, or dependable success-rate report exists. The UI computes limited risk flags from currently loaded order events; it is not a reporting system. Complaint counts are added for each actor associated with an order, which can attribute the same order-level reports to multiple actors. |
| Security | **Partial** | [auth helpers](./src/lib/auth.ts#L31), [staff orders API](./src/app/api/delivery/orders/route.ts), [assignment API](./src/app/api/admin/orders/[id]/delivery-assignment/route.ts), [delivery action API](./src/app/api/orders/[id]/delivery/route.ts#L101), [audit helper](./src/lib/delivery-audit.ts#L28) | Phase 1 adds server-side staff role checks, active-account enforcement, own-order isolation, and assignment permission gates. Unauthenticated API smoke checks return 401, but real-account and cross-staff runtime tests remain unverified. Vendors retain existing delivery access for their own product lines. Audit HMAC signing is optional, and verification accepts entries without a signature even when signatures are expected. |

**Matrix totals after Phase 1:** **0 Complete · 6 Partial · 3 Missing**. The initial audit baseline was **0 Complete · 5 Partial · 4 Missing**. “Not Verified” applies to live/production records and configuration, not to the source-code presence/absence described above.

## Phase 1 implementation update

Phase 1 adds delivery-staff accounts and role, a separate responsive staff dashboard, profile editing, administrator account lifecycle controls, role-protected account/order APIs, assignment and reassignment history, and order outcome actions for the assigned staff member. The original item-level handover/COD APIs remain in place; orders using that workflow cannot also receive an order-level staff assignment.

The [employee-ID index migration](./scripts/migrations/employee-id-unique-index.ts) was created but **not run**. Its code-level preflight checks normalized duplicates and non-canonical IDs, treats an existing compatible single-field unique sparse index as a no-op, and refuses an incompatible single-field index. The new employee-ID index is not declared for automatic model index creation; the migration disables automatic index creation while it runs, and account creation or Employee ID edits return a clear service error until the index exists. Runtime migration/idempotence against a test database is **Not Verified**.

The [read-only duplicate checker](./scripts/check-employee-id-duplicates.ts) requires an explicitly supplied `DELIVERY_STAFF_CHECK_MONGODB_URI`; it never falls back to the application or production database configuration and performs aggregate reads only. It was checked to fail closed without that URI. No database was queried or changed.

Validation completed: production build, TypeScript check, targeted ESLint, `git diff --check`, mobile dashboard route smoke check (HTTP 200), unauthenticated staff/account/assignment APIs (HTTP 401), and unauthenticated logout handler (HTTP 200). Full-repository ESLint still reports an existing hooks lint error in `src/components/guest-delivery-report.tsx`. Admin/staff login with real credentials, staff creation, assignment/reassignment persistence, and cross-staff data isolation require a safe test database/account and remain **Not Verified**.

## Delivery-status workflow

The order model supports `pending`, `confirmed`, `shipped`, `delivered`, `failed`, and `cancelled` ([model](./src/lib/models.ts#L6)). The delivery action API transitions shipped items to delivered or failed, and permits failed items to be marked delivered after a retry ([delivery action API](./src/app/api/orders/[id]/delivery/route.ts#L34)). This is **Partial** against the requested status flow:

- **Assigned:** represented by a handover record, not an order status.
- **Picked Up / On The Way:** no model enum or API action.
- **Delivered:** supported, but not gated by OTP, proof, GPS, or mandatory admin verification.
- **Failed:** supported with a required reason and stored audit history.
- **Rescheduled:** no field, action, or workflow.
- **Returned:** physical return receipt/count and admin condition confirmation exist; `returned` is not an order status and there is no full return-to-origin workflow.

The generic order-status endpoint also prevents direct setting of `delivered`, directing callers to the delivery action instead ([order status API](./src/app/api/orders/[id]/route.ts#L9)).

## Detailed control and data findings

### Accounts, assignment, and isolation

- Normal login uses the shared user collection and session flow; there is no delivery-specific login or role ([login API](./src/app/api/auth/login/route.ts#L10), [role model](./src/lib/models.ts#L5)).
- The admin delivery-staff endpoint is a **read-only eligible-actor list**. Its eligible accounts are active vendors and admins with `manage_bookings`; it does not create, edit, or deactivate delivery employees ([delivery staff API](./src/app/api/admin/delivery-staff/route.ts#L6)).
- Super-admin endpoints can create/deactivate sub-admins and change their permissions, but these accounts remain `admin`, not delivery employees ([admin users API](./src/app/api/admin/users/route.ts#L29), [admin user update API](./src/app/api/admin/users/[id]/route.ts#L11)).
- Vendor order reads include orders containing that vendor’s products or handovers assigned to that vendor, and filter order items/handovers before returning them ([orders API](./src/app/api/orders/route.ts#L41)). This is useful scoping, but vendors are not a separate delivery-only account type and their vendor-order access is broader than assigned deliveries.
- Repeated handover entries provide some assignment history, with actor and quantity details in the audit trail. There is no explicit reassignment operation or way to release an existing allocation; the existing quantity remains counted against the order line.

### Verification, proof, and customer reports

- API-side validation requires a non-empty failed reason, but a successful delivery accepts optional notes only. There is no precondition requiring customer/admin proof before setting an item to delivered ([delivery action API](./src/app/api/orders/[id]/delivery/route.ts#L12)).
- Manual verification is a review state (`pending`, `verified`, or `flagged`) and automatic sampling can request an audit after a delivery has already been marked delivered ([audit sampling](./src/lib/delivery-audit-sampling.ts#L10)). It does not block delivery completion.
- Authenticated customers can report issues against their own orders; guest orders use a random private access key whose hash is stored for the guest-report endpoint. Guest reports are rate-limited and do not provide delivery verification ([guest report API](./src/app/api/orders/[id]/delivery/guest-report/route.ts#L8), [checkout](./src/components/checkout-page.tsx#L17)).
- A physical return receipt can be recorded and then admin-confirmed; good-condition returns are restocked inside a database transaction ([delivery action API](./src/app/api/orders/[id]/delivery/route.ts#L52)).

### Cash controls and auditability

- COD fields are stored on each delivery handover in MongoDB. Staff collection updates require the assigned actor and an accepted handover; admin settlement is role-gated and limited to the amount due ([delivery action API](./src/app/api/orders/[id]/delivery/route.ts#L269)).
- These are recorded operational claims, not a full cash-control ledger: there is no distinct deposit/handover record with receiver, receipt/reference, independent approval, aggregate balance, or adjustment process.
- Delivery audit events are hash-chained and the model blocks certain query-based updates/deletes ([audit helper](./src/lib/delivery-audit.ts#L56), [order model hooks](./src/lib/models.ts#L216)). HMAC signatures are only generated when `DELIVERY_AUDIT_SECRET` is configured; verification only checks a signature when one is present. Thus unsigned entries can still pass verification, and hash-only mode does not provide a trusted signature against database-level rewriting.

## Recommended implementation order

1. **Deploy and verify Phase 1 safely:** review and apply the employee-ID index migration in the intended database, then test account lifecycle, login, order assignment/reassignment, and two-staff isolation in a non-production test environment. Decide whether vendors should retain their current ability to mark their own orders delivered/failed.
2. **Define the delivery state machine:** add explicit assignment, pickup, in-transit, rescheduled, failed, delivered, and returned transitions with allowed actor/action rules; preserve history and prevent invalid transitions.
3. **Gate completion with verification:** implement expiring, rate-limited OTP verification (store only a secure hash), then make delivered transitions require a verified OTP. Add proof upload and GPS capture only with explicit retention/access controls.
4. **Build accountable COD reconciliation:** add cash handover/deposit records, receiver/approver identities, receipts, outstanding calculations, and audited corrections/reversals; verify all totals against order/return state.
5. **Add database-backed delivery metrics and reports:** aggregate employee/date/status/failed-reason/COD data server-side, with pagination and permissions; do not rely on client-derived heuristics.
6. **Harden and test security:** require valid signatures in signed audit mode, document hash-only limitations, minimize customer data returned to staff, and add tests for role isolation, assignment boundaries, transition rules, OTP, COD concurrency, and audit verification.

## Likely files for a future implementation

- Identity and roles: [models.ts](./src/lib/models.ts), [auth.ts](./src/lib/auth.ts), [login route](./src/app/api/auth/login/route.ts), [session route](./src/app/api/auth/me/route.ts), [delivery staff route](./src/app/api/admin/delivery-staff/route.ts), [admin users routes](./src/app/api/admin/users/route.ts).
- Assignment and state transitions: [delivery action route](./src/app/api/orders/[id]/delivery/route.ts), [orders route](./src/app/api/orders/route.ts), [order status route](./src/app/api/orders/[id]/route.ts), [dashboard.tsx](./src/components/dashboard.tsx).
- OTP, proof, and GPS: [models.ts](./src/lib/models.ts), [delivery action route](./src/app/api/orders/[id]/delivery/route.ts), [upload signature route](./src/app/api/upload/signature/route.ts), plus new delivery-specific API/UI modules.
- COD ledger and reporting: [models.ts](./src/lib/models.ts), [delivery action route](./src/app/api/orders/[id]/delivery/route.ts), [admin summary route](./src/app/api/admin/summary/route.ts), [dashboard.tsx](./src/components/dashboard.tsx), plus new report/settlement APIs.
- Audit integrity: [delivery-audit.ts](./src/lib/delivery-audit.ts), [models.ts](./src/lib/models.ts).

## Verification limits

- Reviewed repository source only; no application code was changed by this audit.
- No migration, seed, or database write/query was run.
- The initial audit did not exercise runtime API workflows. Phase 1 smoke checks and validation are listed in the implementation update above; authenticated workflows still need a separate test database and accounts.
- Production database state, real account roles/permissions, secrets, notification-provider setup, and actual KPI values are **Not Verified**.
