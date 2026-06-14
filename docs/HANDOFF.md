# Vanta CLI — Handoff

Standalone CLI tool that bootstraps `vanta-base-admin` for new team members.

GitHub issue: https://github.com/leongcheefai/vanta-base-admin/issues/11

---

## What this is

A globally-installed Node.js CLI (`vanta`) with two commands:

- `vanta init [name]` — full local environment bootstrap
- `vanta doctor` — read-only environment health check

---

## Stack

| Concern | Choice |
|---|---|
| Language | TypeScript (strict) |
| Build | `tsup` → `dist/index.js` |
| CLI framework | Commander.js |
| Terminal UI | `@clack/prompts` (spinners, prompts, confirm) |
| Install | `npm i -g github:leongcheefai/vanta-cli` |

---

## Suggested project structure

```
vanta-cli/
├── src/
│   ├── index.ts          # entry point, Commander setup
│   ├── commands/
│   │   ├── init.ts       # vanta init [name]
│   │   └── doctor.ts     # vanta doctor
│   └── lib/
│       ├── preflight.ts  # all preflight checks (pure functions)
│       ├── env-wizard.ts # interactive .env builder
│       └── exec.ts       # execa wrapper for spawning child processes
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

---

## `vanta init [name]` — full spec

### Preflight checks (run sequentially, halt on first failure)

1. **Node >= 22** — hard fail. Print: `Node 22+ required. Install via https://nodejs.org`
2. **Docker installed** — hard fail. Print: `Docker not found. Install from https://docker.com`
3. **Docker daemon running** — hard fail. Print: `Docker not running. Run: open -a Docker`
4. **Port 5432 free** — hard fail. Print: `Port 5432 in use. Stop the conflicting process.`
5. **SSH reachable** — `ssh -T git@github.com` exit code check. Hard fail with SSH setup link.
6. **pnpm** — if missing, auto-run `corepack enable && corepack prepare pnpm@latest --activate`. Not a failure — continue.

### Steps (all idempotent)

1. Clone `git@github.com:leongcheefai/vanta-base-admin.git` into `./<name>` (default: `vanta-base-admin`). Skip if directory already exists.
2. `pnpm install` inside cloned directory.
3. **`.env` wizard** — if `.env` already exists, prompt `Overwrite? [y/N]` (default N, skip if N).
   - Auto-fill: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vanta_base_admin`, `NODE_ENV=development`, `BETTER_AUTH_URL=http://localhost:3001`, `APP_URL=http://localhost:3000`, `WEB_URL=http://localhost:4321`, `VITE_API_URL=http://localhost:3001`
   - Auto-generate: `BETTER_AUTH_SECRET` via `crypto.randomBytes(33).toString('base64')`
   - Per-integration prompts (default N): Resend, Stripe, Google OAuth, S3, GitHub feedback. Each reveals relevant var names if Y.
4. `docker compose up -d`
5. `pnpm db:migrate`
6. Prompt: `Create initial admin user? [Y/n]` (default Y). If Y: prompt email + password (with confirmation + min 8 chars). Call `pnpm db:seed --email <email> --password <password>` inside the project directory.

### Idempotency rules

- Directory exists → skip clone
- `.env` exists → prompt overwrite, default N
- Docker already running → `docker compose up -d` is a no-op
- Migrations already applied → `pnpm db:migrate` is a no-op (Drizzle tracks applied migrations)
- User already exists → `pnpm db:seed` exits 0 with a message (idempotent by email)

---

## `vanta doctor` — full spec

Read-only. No side effects. Prints a pass/fail table.

Checks:
- Node version >= 22
- pnpm version >= 9
- Docker daemon running
- Postgres reachable at `DATABASE_URL` from `.env`
- `.env` file exists in current directory
- Required env vars non-empty: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `APP_URL`, `VITE_API_URL`
- `node_modules/.pnpm` directory present

Run from inside the cloned project directory.

---

## Key dependencies to install

```json
{
  "dependencies": {
    "commander": "^12.x",
    "@clack/prompts": "^0.9.x",
    "execa": "^9.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "tsup": "^8.x",
    "@types/node": "^22.x"
  }
}
```

---

## package.json shape

```json
{
  "name": "vanta-cli",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "vanta": "./dist/index.js"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup src/index.ts --format esm --target node22",
    "dev": "tsx src/index.ts"
  },
  "engines": {
    "node": ">=22"
  }
}
```

---

## Monorepo dependency: `pnpm db:seed`

The CLI calls `pnpm db:seed --email <email> --password <password>` inside the cloned project directory. This script lives in `packages/db/scripts/seed.ts` in `vanta-base-admin`. It is **already implemented** — no changes needed to the CLI for admin user creation beyond spawning that command.

---

## Hardcoded values

- Repo SSH URL: `git@github.com:leongcheefai/vanta-base-admin.git`
- Default project folder name: `vanta-base-admin`

No config file. No override flags. If repo moves, change the URL in `src/commands/init.ts` and cut a new install.

---

## Out of scope (v1)

- Windows support
- `vanta update` command
- npm publish
- Auto-updating the CLI
- Multiple environment targets
