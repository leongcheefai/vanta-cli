# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build      # Compile src/ → dist/index.js (ESM, Node 22, shebang)
npm run dev        # Run CLI via tsx without building
npm test           # Vitest (run mode, CI-friendly)
npm run lint       # Biome lint check
npm run format     # Biome format auto-fix
```

Single test file: `npx vitest run tests/preflight.test.ts`

## Architecture

**Purpose:** Globally-installable CLI that bootstraps local `vanta-base-admin` environments for new team members.

**Two commands:**
- `vanta init [name]` — sequential preflight → clone → deps → .env wizard → Docker → migrations → optional seed
- `vanta doctor` — parallel health checks (never halts), prints pass/fail table

**Layer separation:**
- `commands/` — owns all clack UI (spinners, prompts, logging)
- `lib/` — pure logic, no I/O side effects, fully unit-testable
- `lib/exec.ts` — single execa wrapper; all shell calls route through here

**Data flow:**
```
index.ts → commands/init.ts or commands/doctor.ts
              ├── lib/preflight.ts  (check functions)
              ├── lib/env-wizard.ts (buildEnvContent)
              └── lib/steps.ts → lib/exec.ts
```

## Key Conventions

- **ESM only** (`"type": "module"` in package.json). Import paths need `.js` extension even for `.ts` source files.
- **Node 22+** required; enforced in both package.json engines and `vanta doctor`.
- Tests use `vi.mock()` for `node:net`, `node:fs`, and `../src/lib/exec.js`. Never mock Commander or clack.
- `init` halts on first preflight failure. `doctor` collects all results before printing.
- Steps are idempotent: clone skips if directory exists, .env prompts before overwrite.

## Hardcoded Values (by design)

- Repo: `git@github.com:leongcheefai/vanta-base-admin.git`
- Default folder: `vanta-base-admin`
- Postgres port: `5432`, DB URL: `postgresql://postgres:postgres@localhost:5432/vanta_base_admin`
- Node min: 22, pnpm min: 9
