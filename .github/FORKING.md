# Forking OBELISK

Running your own instance of Obelisk for a different institution? This guide covers what a fork needs beyond the docs: fresh secrets, environment values, and the JMCFI-specific bits. For day-to-day development see [`CONTRIBUTING.md`](CONTRIBUTING.md); for going live see [`DEPLOYMENT.md`](DEPLOYMENT.md).

---

## 1. What a fork does (and doesn't) get

The code is all yours, but **the secrets are not**:

- The committed env files (`.env.local`, `.env.prod`, `.env.docker`) are **encrypted with dotenvx public-key encryption** to the upstream maintainer's keys. The private keys live in the gitignored `.env.keys`, which never travels through a fork — so out of the box your clone **cannot decrypt them** and they are useless to you anyway (they point at JMCFI's database, OAuth client, and domain).
- Everything institution-specific (email domain, OAuth, branding, seed data) must be replaced with your own values.

You start from scratch with your own env files.

---

## 2. Clone your fork

```sh
git clone https://github.com/<you>/Obelisk.git
cd Obelisk
bun install        # one root install for the whole workspace
```

---

## 3. Create your own env files

You have two options — pick **Option B** unless you specifically want encrypted files (e.g. before deploying, see [`DEPLOYMENT.md`](DEPLOYMENT.md)).

### Option B (recommended to start) — plaintext `.env.local`

Create `.env.local` at the repo root from the template in [`CONTRIBUTING.md` §2](CONTRIBUTING.md) with your own values (see §4 below). dotenvx reads plaintext files fine — no keys needed for development.

Replace (or delete) the committed encrypted `.env.prod` / `.env.docker` in your fork with your own plaintext versions when you get to deploying.

### Option A — encrypt with your own keys

If you want the upstream workflow (encrypted files + gitignored `.env.keys`), mint your own keypair per file:

```sh
bunx dotenvx keypair       # prints a DOTENV_PUBLIC_KEY / DOTENV_PRIVATE_KEY pair
```

1. Write one generated `DOTENV_PRIVATE_KEY_*` per file to a gitignored **`.env.keys`** at the repo root — the names must match the file suffixes:
   ```env
   DOTENV_PRIVATE_KEY_LOCAL="<private key for .env.local>"
   DOTENV_PRIVATE_KEY_PROD="<private key for .env.prod>"
   DOTENV_PRIVATE_KEY_DOCKER="<private key for .env.docker>"
   ```
2. Replace the committed encrypted env files with **plaintext** files containing your values (the upstream ciphertext is undecryptable for you).
3. `just env-encrypt` — encrypts all three in place with your keys and rewrites the `DOTENV_PUBLIC_KEY_*` headers. Edit later with `just env-decrypt` → edit → `just env-encrypt`.

> Keep `.env.keys` out of git (it is already in `.gitignore`). If you ever publish it, rotate every secret it protected — a public-key-encrypted file is only as private as its private key.

---

## 4. Environment values to change

All of these live in the root env files ([`CONTRIBUTING.md` §2](CONTRIBUTING.md) has the full template):

| Key | Why |
| :--- | :--- |
| `ORG_EMAIL_DOMAIN` | **Google sign-in is restricted to this hosted domain** (the `hd` claim is checked in `apps/backend/src/v1/auth/service.ts`) — set your institution's email domain or nobody can sign in |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Your own Google OAuth client (register your deployment's redirect URI in the Google Cloud console) |
| `BETTER_AUTH_SECRET` | Generate a fresh long random string — never reuse upstream's |
| `DATABASE_URL` / `DIRECT_URL` | Your Postgres/Neon database |
| `BETTER_AUTH_URL`, `FRONTEND_URL`, `NEXT_PUBLIC_API_URL` | Your domains — localhost for dev, your public origin for prod |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID` (`.env.prod`) | Optional — umami tracker website key; leave empty to ship no analytics script (see `DEPLOYMENT.md`) |
| `OBELISK_ALLOWED_ORIGINS` | Your frontend origin(s), for the ETL CORS check |
| `OBELISK_LLM_API_KEYS`, `OBELISK_WEBAPP_SHARED_SECRET` | Optional — your own keys, see `CONTRIBUTING.md` §2 |
| `APP_DOMAIN`, `DOZZLE_DOMAIN`, `UMAMI_DOMAIN`, `ADMIN_IPS` (`.env.docker`) | Your deployment domain, log-viewer domain, analytics domain and admin IPs, see `DEPLOYMENT.md` |
| `DUCKDNS_SUBDOMAINS`, `DUCKDNS_TOKEN` (`.env.docker`) | DuckDNS updater — bare subdomain names + dashboard token (or delete the `duckdns` service if you don't use DuckDNS), see `DEPLOYMENT.md` |
| `UMAMI_DB_PASSWORD`, `UMAMI_APP_SECRET` (`.env.docker`) | Self-hosted umami secrets — postgres password + signing secret (or delete the `umami`/`umami-db` services if you don't self-host analytics), see `DEPLOYMENT.md` |

---

## 5. JMCFI-specific bits in the code

These are hardcoded to the original institution — adjust them to taste (all safe, small edits):

- **Branding** — [`packages/app-info/index.ts`](../packages/app-info/index.ts) is the single source of truth: product title, description, legal title, `organization` / `organizationAbbr`, and logo paths (logo files live in `apps/frontend/public/metadata/`).
- **Seed accounts** — `just db-seed` creates `<role>@jmcfi.edu.ph` / `password123`; the domain appears in `apps/backend/prisma/seed.ts` and is mirrored in `apps/frontend/lib/dev-accounts.ts` (**keep the two in sync** — the dev-session route signs in against them). Change both if you want your own dev-login domain.
- **Institutional docs** — everything in [`system-docs/`](../system-docs/README.md) describes the JMCFI WIN-OBE manual (37 forms, role names, approval policies). Use them as a reference for what the code implements, not as your institution's documentation.

### Larger adaptations (real code changes)

- **Roles** — the workflow assumes the JMCFI role ladder (`faculty → program_chair → dean → aqau → vpaa`, plus `system_admin`). Different titles mean touching the role enum in the Prisma schema, `apps/backend/lib/role-access.ts` **and** its frontend mirror `apps/frontend/lib/role-access.ts` (drift-guarded by a test), and the per-form approval chains in `apps/backend/lib/forms/approval-routes.ts`.
- **Form set / domain rules** — approval chains, the ≥70% floors, and the composite formula are institutional rules from the OBE manual; see `apps/backend/SYSTEM-DESIGN.md` before changing any of them.

---

## 6. Where to go next

1. [`CONTRIBUTING.md`](CONTRIBUTING.md) — env setup, running the services, quality checks, dev mode.
2. [`DEPLOYMENT.md`](DEPLOYMENT.md) — self-hosted Docker stack on your VPS (remember your own `.env.keys` if you chose Option A).
3. [`system-docs/roadmap.md`](../system-docs/roadmap.md) — what's built and what's still pending.
