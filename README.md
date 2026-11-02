# SDE Intern Assignment: Shared Bill Splitter

A full-stack, type-safe expense splitting application designed for shared living spaces. Built with Hono on Cloudflare Workers, Cloudflare D1 (SQLite), React, Vite, and TanStack Router.

---

## Decisions

> Update this README with a short section called Decisions. Write 3 decisions you made and why.

### 1. Integer-Cent Arithmetic & Deterministic Remainder Distribution

All currency values are strictly modeled and stored as positive whole integer cents (`total_cents`, `amount_cents`). Floating-point numbers are never used for monetary math or stored in the database, eliminating IEEE 754 rounding artifacts. When splitting a bill where `totalCents % memberCount !== 0`, the remainder cents are deterministically distributed one-by-one to members in their chronological join order (`position ASC`):
```ts
const baseAmount = Math.floor(totalCents / memberCount)
const remainder = totalCents % memberCount
const amountCents = baseAmount + (index < remainder ? 1 : 0)
```
This guarantees mathematical invariants: the sum of all shares always equals `totalCents`, and split calculations are 100% reproducible.

### 2. Atomic Conditional Updates for Payment Idempotency

Payment execution relies on an atomic conditional SQL `UPDATE` statement guarded by `paid_at IS NULL`:
```sql
UPDATE shares
SET paid_at = ?, idempotency_key = ?
WHERE id = ? AND bill_id = ? AND paid_at IS NULL
```

- **Same idempotency key retry:** If a request is resent with the same `Idempotency-Key`, the API detects the existing record and returns `200 OK` with the original payment timestamp (`paidAt`), preventing duplicate charges.
- **Concurrent requests / Different key:** If two requests race to pay the same share simultaneously, SQLite's atomic execution guarantees only one transaction modifies the row (`changes === 1`). The competing request receives `409 Conflict`.
- Database integrity is backed by a CHECK constraint: `chk_shares_payment_state` requiring `paid_at` and `idempotency_key` to be either both `NULL` or both `NOT NULL`.

### 3. Local Home Persistence with Graceful Recovery & Discovery

To prevent duplicate home creation on page refreshes and test reloads, the active home ID is preserved in browser `localStorage`. On application mount:
- The frontend restores the existing home by querying `GET /api/homes/:homeId`.
- Members, bills, and balances are synchronized in parallel using `Promise.all`.
- If a stored ID is invalid or deleted, `localStorage` is cleared and a graceful fallback notice is shown without crashing.
- Users can switch homes or open existing database test fixtures (e.g. `3d0fb824-957a-49f6-a8cb-dfc01dc320e2`) via the built-in home switcher.

---

## Schema & Named Constraints

The database schema (`api/migrations/0001_init.sql`) enforces strict integrity using named constraints:

1. `chk_homes_name`: Ensures home names are non-empty after trimming whitespace (`length(trim(name)) > 0`).
2. `fk_members_home`: Foreign key cascade-deleting members if a parent home is deleted.
3. `uq_members_home_position`: Enforces unique sequential ordering of members within each home.
4. `chk_members_name`: Disallows blank or whitespace-only member names.
5. `chk_members_position`: Guarantees member positions are non-negative (`position >= 0`).
6. `fk_bills_home`: Foreign key linking bills to their home with cascade deletion.
7. `chk_bills_total_positive`: Enforces that all bills have a positive total amount in cents (`total_cents > 0`).
8. `chk_bills_title`: Disallows blank or whitespace-only bill titles.
9. `fk_shares_bill`: Foreign key cascading bill deletion to all associated shares.
10. `fk_shares_member`: Foreign key associating each share with a valid member.
11. `uq_shares_bill_member`: Guarantees each member has at most one share per bill.
12. `chk_shares_amount`: Guarantees share amounts are non-negative (`amount_cents >= 0`).
13. `chk_shares_payment_state`: Guarantees payment consistency: `paid_at` and `idempotency_key` must be both `NULL` or both `NOT NULL`.

---

## API Reference

Every endpoint returns JSON. Errors consistently follow `{ "error": "message" }`.

### Homes & Members

- `GET /api/health` — Health check endpoint (`200` `{ "status": "ok" }`).
- `GET /api/homes` — Lists all registered homes (`200` `{ "homes": [...] }`).
- `GET /api/homes/:homeId` — Retrieves a single home by ID (`200` `{ id, name, createdAt }` or `404`).
- `POST /api/homes` — Creates a home (`201` `{ id, name }`).
- `GET /api/homes/:homeId/members` — Lists members of a home in join order (`200` `{ "members": [...] }` or `404`).
- `POST /api/homes/:homeId/members` — Adds a member to a home (`201` `{ id, homeId, name }` or `404` / `422`).

### Bills & Expenses

- `POST /api/homes/:homeId/bills` — Creates a bill and splits it evenly across all home members (`201` `{ id, homeId, title, totalCents, shares: [...] }`, `404` if home missing, `422` if invalid amount or no members).
- `GET /api/homes/:homeId/bills` — Retrieves all bills with full share breakdown (`200` `{ "bills": [...] }` or `404`).

### Payments & Balances

- `POST /api/bills/:billId/shares/:shareId/pay` — Marks a member's share as paid with idempotency protection.
  - Header: `Idempotency-Key: <unique-uuid>`
  - Success: `200` `{ id, memberId, amountCents, paidAt }`
  - Errors: `400` (missing key), `404` (bill/share not found), `409` (share already paid with different key).
- `GET /api/homes/:homeId/balances` — Computes unpaid outstanding balances per member in join order (`200` `{ "balances": [{ memberId, name, outstandingCents }] }` or `404`).

---

## Getting Started

### Prerequisites

- Node.js (v20+ recommended)
- `pnpm` (`npm install -g pnpm`)

### Installation

```bash
# Clone the repository
git clone https://github.com/DoCoDeGo-Engineering/sde-intern-task-002.git
cd sde-intern-task-002

# Install dependencies
pnpm install
```

### Running Locally

```bash
# Start both backend worker (:8787) and frontend dev server (:5173)
pnpm dev
```
Open **http://localhost:5173** in your browser.

---

## Automated Checks & Testing

Run all quality checks and automated test suites:

```bash
# Run unit & integration tests (36 tests across 5 test suites)
pnpm test

# Run TypeScript type check on both api and web
pnpm typecheck

# Run Biome linter and formatter check
pnpm check

# Build the web application for production
pnpm build
```

---

## Video Walkthrough Checklist (3 Minutes)

1. **Architecture & Stack:** Explain Hono on Cloudflare Workers, Cloudflare D1 (SQLite), React + Vite, and TanStack Router.
2. **Data Flow:** Show creating a home, adding members, creating an expense, deterministic integer cent remainder distribution, and balance calculation.
3. **Idempotency & Race Safety:** Demonstrate paying a share, retrying with the same key (safe 200 return), and concurrent protection (409 conflict).
4. **Trade-off:** Discuss the trade-off between conditional SQL writes vs distributed locks for idempotency on edge runtimes.
