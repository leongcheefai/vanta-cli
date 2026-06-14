# vanta-cli Design

**Date:** 2026-06-14
**Source spec:** `docs/HANDOFF.md`

---

## Overview

Globally-installed Node.js CLI (`vanta`) that bootstraps `vanta-base-admin` for new team members. Two commands: `vanta init [name]` and `vanta doctor`.

**Stack:** TypeScript (strict), Commander.js, @clack/prompts, execa, tsup, Biome, vitest.

---

## File Structure

```
vanta-cli/
├── src/
│   ├── index.ts              # Commander setup, registers init + doctor
│   ├── commands/
│   │   ├── init.ts           # orchestrates steps, owns spinner/clack UI
│   │   └── doctor.ts         # runs checks, prints pass/fail table
│   └── lib/
│       ├── preflight.ts      # checkNode, checkDocker, checkDockerRunning,
│       │                     #   checkPort5432, checkSSH, ensurePnpm
│       ├── env-wizard.ts     # buildEnvContent(), promptIntegrations()
│       ├── steps.ts          # cloneRepo, installDeps, composeUp,
│       │                     #   runMigrations, seedAdmin
│       └── exec.ts           # thin execa wrapper: run(cmd, args, cwd?)
├── tests/
│   ├── preflight.test.ts
│   ├── env-wizard.test.ts
│   └── steps.test.ts
├── biome.json
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

---

## Architecture

**Data flow:** `index.ts` → `init.ts` calls preflight checks sequentially (halt on first fail) → runs steps sequentially → each step calls `exec.ts` for shell ops. `doctor.ts` calls same preflight logic but never halts — collects all results and prints table.

**Key principle:** pure logic lives in `lib/`, I/O and clack UI live in `commands/`. This makes `lib/` unit-testable without mocking the terminal.

---

## `vanta init [name]`

### Preflight checks (sequential, halt on first failure)

| # | Check | Method | Failure message |
|---|---|---|---|
| 1 | Node >= 22 | `process.version` | `Node 22+ required. Install via https://nodejs.org` |
| 2 | Docker installed | `which docker` exit code | `Docker not found. Install from https://docker.com` |
| 3 | Docker running | `docker info` exit code | `Docker not running. Run: open -a Docker` |
| 4 | Port 5432 free | TCP connect to `localhost:5432` | `Port 5432 in use. Stop the conflicting process.` |
| 5 | SSH reachable | `ssh -T git@github.com` (exit 1 = authenticated) | SSH setup link |
| 6 | pnpm present | `pnpm --version`; if missing, run `corepack enable && corepack prepare pnpm@latest --activate` | Non-fatal — auto-installs |

### Steps (sequential, all idempotent)

1. **Clone** `git@github.com:leongcheefai/vanta-base-admin.git` into `./<name>` (default: `vanta-base-admin`). Skip if directory exists.
2. **`pnpm install`** inside project dir.
3. **`.env` wizard** — if `.env` exists, prompt overwrite (default N, skip if N).
   - Auto-fill: `DATABASE_URL`, `NODE_ENV`, `BETTER_AUTH_URL`, `APP_URL`, `WEB_URL`, `VITE_API_URL`
   - Auto-generate: `BETTER_AUTH_SECRET` via `crypto.randomBytes(33).toString('base64')`
   - Per-integration prompts (default N): Resend, Stripe, Google OAuth, S3, GitHub feedback
4. **`docker compose up -d`**
5. **`pnpm db:migrate`**
6. **Admin user** — prompt `Create initial admin user? [Y/n]` (default Y). If Y: prompt email + password (with confirmation, min 8 chars). Run `pnpm db:seed --email <email> --password <password>`.

### Error handling

Any preflight failure or step throw → `clack.cancel()` with spec message → `process.exit(1)`.

### Idempotency

- Dir exists → skip clone
- `.env` exists → prompt overwrite, default N
- `docker compose up -d` → no-op if already running
- `pnpm db:migrate` → no-op if migrations applied (Drizzle tracks state)
- `pnpm db:seed` → exits 0 if user already exists (idempotent by email)

---

## `vanta doctor`

Run from inside the cloned project directory. Read-only, no side effects. Runs all checks concurrently, collects results, prints pass/fail table via `clack.note()`.

| Check | Method |
|---|---|
| Node >= 22 | `process.version` |
| pnpm >= 9 | `pnpm --version` |
| Docker running | `docker info` exit code |
| `.env` exists | `fs.existsSync('.env')` |
| Required env vars non-empty | Parse `.env`, check `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `APP_URL`, `VITE_API_URL` |
| Postgres reachable at `DATABASE_URL` | TCP connect to extracted host:port |
| `node_modules/.pnpm` present | `fs.existsSync('node_modules/.pnpm')` |

---

## Testing

**Framework:** vitest. Unit tests only — no integration tests.

**Scope:** `lib/` pure functions only. `commands/` (thin orchestration + clack UI) are not tested.

- `preflight.test.ts` — mock `execa` and `net.connect`; test each check passes/fails correctly
- `env-wizard.test.ts` — test `buildEnvContent()` output for all integration flag combinations; verify `BETTER_AUTH_SECRET` is always 44-char base64
- `steps.test.ts` — test idempotency guards (dir-exists skips clone, etc.)

---

## Hardcoded values

- Repo SSH URL: `git@github.com:leongcheefai/vanta-base-admin.git`
- Default project folder: `vanta-base-admin`

No config file, no override flags. Change URL in `src/commands/init.ts` if repo moves.

---

## Out of scope (v1)

- Windows support
- `vanta update` command
- npm publish
- Auto-updating the CLI
- Multiple environment targets
