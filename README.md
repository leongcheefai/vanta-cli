# vanta-cli

CLI for bootstrapping and managing a local [vanta-base-admin](https://github.com/leongcheefai/vanta-base-admin) environment.

## Install

```bash
npm i -g vantatech-cli
```

## Commands

### `vanta init [name]`

Full environment bootstrap — local first, then optional cloud deployment.

```bash
vanta init
vanta init my-project
```

**Preflight checks**

- Node 22+, pnpm, Docker installed and running
- SSH access to GitHub

**Local setup (always runs)**

1. Clone `vanta-base-admin` into `./<name>`
2. Install dependencies
3. Write `.env` with secrets for enabled services
4. Start Docker (Postgres), run migrations
5. Optionally create an initial admin user

**Integrations (prompted, all optional)**

| Service | What it does |
|---|---|
| Resend | Transactional email |
| Stripe | Payments |
| Google OAuth | Social login |
| S3 | File storage |
| GitHub Feedback | In-app feedback via GitHub issues |

**Cloud deployment (prompted, all optional)**

| Service | What it does |
|---|---|
| Railway | Deploys backend API; auto-installs Railway CLI if missing |
| Supabase | Provisions a managed Postgres DB for Railway (create new or use existing project); runs migrations + seed against it |
| Vercel | Deploys frontend; auto-installs Vercel CLI if missing; pushes `VITE_API_URL` from Railway URL |

When Railway + Supabase + Vercel are all enabled, `vanta init` wires `VITE_API_URL` automatically so the frontend points at the deployed backend.

---

### `vanta doctor`

Read-only health check for an existing project. Run from inside the project directory.

Checks: Node version, pnpm version, Docker, `.env` presence, required env vars, Postgres connectivity, `node_modules`.

```bash
cd my-project
vanta doctor
```

## Update

```bash
npm i -g vantatech-cli
```
