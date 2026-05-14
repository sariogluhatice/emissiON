# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (file-watch auto-restart)
npm run dev          # node --watch src/app.js — runs on port 3000

# Production
npm start            # node src/app.js

# Docker (full stack: Postgres + app)
docker-compose up --build

# Database: apply a new migration manually
psql -U <user> -d emission_db -f sql/migration_NNN_name.sql
```

No test runner or linter is configured. There are no build steps — the frontend is served as static files directly from `client/`.

## Architecture Overview

### Request lifecycle

```
Browser (Vanilla JS ES modules)
  → client/js/api/ApiClient      — fetch wrapper, attaches JWT Bearer header,
                                   redirects to /login on 401
  → Express routes  (src/routes/)
  → Controller      (src/controllers/)   — input guards (str/posFloat/dateStr),
                                            calls service, returns ok/handle
  → Service         (src/services/)      — all business logic & SQL via pg Pool
  → PostgreSQL
```

The frontend is **not bundled**. All `<script type="module">` imports are native ES modules loaded directly by the browser. The Express server serves `client/` as static at `/`. API calls go to `/api/*` on the same origin.

### Authentication

- `POST /api/auth/register` → email verification code sent via Nodemailer/Gmail SMTP
- `POST /api/auth/login` → returns JWT `{ token, user: { id, name, email, role } }`
- JWT payload: `{ id, role }`. Secret: `JWT_SECRET`. Expiry: `JWT_EXPIRES_IN` (default 7d).
- `src/middleware/authMiddleware.js` — `authenticate` middleware attaches `req.user = { id, role }`.
- Frontend stores token in `localStorage` under key `emission_token` (via `TokenManager`). `sessionStorage` is used when "remember me" is off.
- `req.user.role` is one of `individual | household | company` (Postgres ENUM).

### Role-based routing (route-level middleware)

| Role | Guard middleware | Where |
|---|---|---|
| `household` | `requireHouseholdRole` → `requireMember` → optionally `requireAdmin` | `householdRoutes.js` |
| `company` | `requireCompanyRole` | `companyRoutes.js` |
| All roles | `authenticate` | every protected router |

`requireMember` attaches `req.membership` (household_id, role, admin_user_id) so downstream handlers avoid a second DB round-trip.

### Controller → Service contract

Every controller follows the same pattern:
- Input guards at the top (pure functions: `str`, `posFloat`, `nonNegFloat`, `dateStr`, `posInt`)
- One service call inside `try/catch`
- `ok(res, data, message, status)` on success
- `handle(res, err)` on error — shaped errors have `err.status` set by `_fail(status, msg)` in the service

Services never touch `req`/`res`. They throw shaped errors with `_fail(status, message)`.

### Database

- Connection pool: `src/config/db.js` (pg Pool, env vars `DB_HOST/PORT/NAME/USER/PASSWORD`)
- Schema baseline: `sql/schema.sql` — run once on a fresh DB
- Incremental changes: `sql/migration_NNN_*.sql` — applied manually in order
- **Always add new columns via a new migration file** (`migration_016_...sql`), never edit `schema.sql` after initial setup
- Transactions used for multi-table writes (e.g. `createCbamEntry` writes to both `cbam_entries` and `emission_records` atomically)

### Core tables

| Table | Purpose |
|---|---|
| `users` | All accounts; `role` enum; `onboarding_completed` flag |
| `emission_records` | Central fact table — kg CO₂e per user per date |
| `individual_profiles` / `company_profiles` / `onboarding_answers` | Role-specific onboarding data |
| `households` + `household_members` | Many-users-one-household; `role = admin|member` |
| `cbam_entries` | Company CBAM export declarations; links back to `emission_records` |
| `company_tasks` / `company_simulations` | Company module |
| `household_tasks` / `household_task_comments` | Household module |
| `admin_cbam_config` | Admin-controlled CBAM thresholds; cached 5 min in `companyService.js` |

### External services

| Service | Used for | Key env vars |
|---|---|---|
| **Groq** (`llama-3.1-8b-instant`) | Primary AI: OCR parsing, insights, suggestions | `GROQ_API_KEY` |
| **Google Gemini 1.5 Flash** | AI fallback (3 keys in rotation) | `GEMINI_API_KEY`, `GEMINI_API_KEY2`, `GEMINI_API_KEY3` |
| **AWS Textract + S3** | Invoice OCR — image uploaded to S3, Textract reads it | `AWS_*` vars |
| **Climatiq** | Emission factor lookup (flights, food, etc.) | `CLIMATIQ_API_KEY` |
| **Nodemailer / Gmail SMTP** | Email verification + password reset | `SMTP_*` vars |

`aiService.js` tries Groq first; falls back through Gemini keys on failure. `textractService.js` handles S3 upload + Textract pipeline. `ocrNormalizer.js` post-processes raw OCR text to detect bill category (electricity/gas/water/shopping) before emission calculation.

### Frontend module structure

```
client/js/
  api/          — one service file per backend domain (apiClient.js, emissionService.js, …)
  utils/        — uiUtils.js (shared helpers), globe.js (Three.js globe), themeManager.js
  layout.js     — renders sidebar + topbar, returns current user or redirects
  <page>.js     — one module per HTML page; imports from api/ and utils/
client/css/
  settings/variables.css   — all design tokens (colors, spacing, radius, shadows)
  components/              — reusable component styles
  layout/dashboard.css     — app shell, sidebar, topbar, page-header
  pages/                   — page-specific overrides
```

Every authenticated page calls `renderLayout()` at the top, which returns the user object or redirects to login. Role checks happen immediately after.

### CSS conventions

- All tokens are CSS custom properties in `variables.css`; never hardcode colors or spacing
- `glass-card` + `content-card` are the two primary card variants
- `main.css` is the single import point — add new component files there under the correct section
- Utility classes live in `components/company.css` (`.btn-block`, `.field-hint`, `.required-mark`, etc.)

### Household system specifics

The household module has three middleware layers stacked in order on protected routes:
1. `authenticate` — verifies JWT
2. `requireHouseholdRole` — rejects non-household accounts
3. `requireMember` — verifies DB membership, attaches `req.membership`
4. `requireAdmin` (optional) — checks `req.membership.role === 'admin'`

### Company / CBAM specifics

- `companyService.js` has a 5-minute in-memory config cache (`_configCache`) for `admin_cbam_config`
- `createCbamEntry` runs inside a DB transaction: inserts into `emission_records` first, then `cbam_entries` with the `emission_record_id` FK
- `deleteCbamEntry` also cascades: deletes the linked `emission_records` row
- `getDashboard` compliance score is multi-factor: risk level + months of data coverage + task completion rate + paid carbon price declarations
- Pagination is supported on `getCbamEntries` and `getSavedSimulations` via `?page=&limit=`
- PATCH `/api/company/cbam/entries/:id` updates mutable fields only; re-computes `estimated_cbam_cost` and `risk_level` if `paid_carbon_price` changes
