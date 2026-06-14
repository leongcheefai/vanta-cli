# vanta-cli

CLI for bootstrapping and managing a local [vanta-base-admin](https://github.com/leongcheefai/vanta-base-admin) environment.

## Install

```bash
npm i -g vantatech-cli
```

## Commands

### `vanta init [name]`

Full local environment bootstrap:

- Checks Node 22+, Docker, SSH access to GitHub, pnpm
- Clones `vanta-base-admin` into `./<name>` (default: `vanta-base-admin`)
- Installs dependencies
- Guides through `.env` setup (Resend, Stripe, Google OAuth, S3, GitHub Feedback)
- Starts Docker services and runs migrations
- Optionally creates an admin user

```bash
vanta init
vanta init my-project
```

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
