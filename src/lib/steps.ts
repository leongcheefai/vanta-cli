import { existsSync } from 'fs'
import { run } from './exec.js'

const REPO_URL = 'git@github.com:leongcheefai/vanta-base-admin.git'

export async function cloneRepo(name: string): Promise<void> {
  if (existsSync(name)) return
  await run('git', ['clone', REPO_URL, name])
}

export async function installDeps(cwd: string): Promise<void> {
  await run('pnpm', ['install'], cwd)
}

export async function composeUp(cwd: string): Promise<void> {
  await run('docker', ['compose', 'up', '-d'], cwd)
}

export async function runMigrations(cwd: string): Promise<void> {
  await run('pnpm', ['db:migrate'], cwd)
}

export async function seedAdmin(cwd: string, email: string, password: string): Promise<void> {
  await run('pnpm', ['db:seed', '--email', email, '--password', password], cwd)
}
