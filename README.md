# emissiON

Carbon footprint tracking platform for individuals, households, and companies.

---

## Quick Start (Docker)

### 1. Copy and fill in the environment file

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

| Variable | What to put |
|----------|-------------|
| `DB_USER` | Any username (e.g. `emissionuser`) |
| `DB_PASSWORD` | A strong password |
| `JWT_SECRET` | A random secret — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

Leave `DB_HOST=db` — that's the Docker service name.  
SMTP, AI, and AWS keys are optional; see comments in `.env.example`.

### 2. Start everything

```bash
docker compose up --build
```

The app will be available at **http://localhost:3000**.

On the very first run (empty volume), Docker initialises the database automatically:
- `sql/schema.sql` — creates all tables, indexes, and triggers
- `sql/seed.sql` — inserts test accounts and sample emission data

### 3. Wiping and re-seeding the database

The init scripts only run **once** (when the volume is empty).  
To reset everything and reload the seed data:

```bash
docker compose down -v      # removes the pgdata volume — ALL DATA IS PERMANENTLY DELETED
docker compose up --build
```

> **Warning:** `down -v` deletes every user account and all emission records.  
> Any accounts you registered manually will be gone. Only the seed test accounts will remain.

---

## Test Accounts (seed data)

All three accounts use the password **`Test1234!`**.

| Email | Role | Notes |
|-------|------|-------|
| `bireysel@test.com` | Individual | 3 months of sample emission records |
| `hane@test.com` | Household admin | Manages "Test Hanesi"; invite code `TEST-HANE-01` |
| `sirket@test.com` | Company | "Test Şirketi A.Ş.", exports to EU, steel sector |

---

## Forgot Password in Development

When SMTP is not configured (blank `SMTP_USER`/`SMTP_PASS` in `.env`), the app runs in **mock mail mode**: no emails are sent, but verification codes and password-reset links are printed directly to the server console.

**How to reset a password without real email:**

1. Click "Şifremi unuttum" on the login page and submit your email.
2. Check the Docker/app logs:
   ```bash
   docker compose logs app
   ```
3. Look for a block like:
   ```
   --- [MOCK MAIL: no SMTP configured] ---
   To: your@email.com
   Reset Link: http://localhost:3000/pages/reset-password.html?token=...&uid=...
   ---
   ```
4. Open that URL in your browser to set a new password.

The same mock output appears for email verification codes when you register.

> If SMTP credentials are filled in but sending still fails (wrong password, etc.),  
> the same console fallback prints the link so you're never stuck.

---

## Local Development (without Docker)

```bash
npm install

# Set up a local PostgreSQL database, then:
psql -U <user> -d emission_db -f sql/schema.sql
psql -U <user> -d emission_db -f sql/seed.sql

# Start with file-watch auto-restart
npm run dev
```

Set `DB_HOST=localhost` in `.env` for local dev.

### Applying a new migration

Never edit `schema.sql` after initial setup — always add a numbered migration file:

```bash
# Local:
psql -U <user> -d emission_db -f sql/migration_017_your_change.sql

# Docker (against the running container):
docker compose exec db psql -U $DB_USER -d $DB_NAME -f /docker-entrypoint-initdb.d/migration_017_your_change.sql
```

---

## Architecture

- **Frontend**: Vanilla JS ES modules, no bundler. Served as static files from `client/`.
- **Backend**: Node.js + Express, REST API at `/api/*`.
- **Database**: PostgreSQL 16 via `pg` connection pool.
- **AI**: Groq (primary) → Gemini (fallback) for insights, OCR parsing, roadmaps.

See `CLAUDE.md` for full architecture details.

---

## Troubleshooting

**"Login no longer accepts my credentials"**  
You likely ran `docker compose down -v` which wiped the database. Your old account is gone.  
Use a seed account (`bireysel@test.com` / `Test1234!`) or register a new account.

**"Forgot password email never arrives"**  
SMTP may not be configured. Check the app logs (`docker compose logs app`) for a `[MOCK MAIL]` or `[DEV FALLBACK]` block containing the reset link.

**"API calls return 500 errors"**  
Check the startup log for a `[DB] HATA` line. It means the app can't reach the database.  
Verify `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` in `.env` match what the `db` service was initialised with.  
If you changed `.env` after the volume was created, run `docker compose down -v && docker compose up --build` to reinitialise.
