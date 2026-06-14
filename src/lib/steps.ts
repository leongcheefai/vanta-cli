import { existsSync } from 'fs'
import { runInherit } from './exec.js'

const REPO_URL = 'git@github.com:leongcheefai/vanta-base-admin.git'

export async function cloneRepo(name: string): Promise<void> {
  if (existsSync(name)) return
  await runInherit('git', ['clone', REPO_URL, name])
}

export async function installDeps(cwd: string): Promise<void> {
  await runInherit('pnpm', ['install'], cwd)
}

export async function composeUp(cwd: string): Promise<void> {
  await runInherit('docker', ['compose', 'up', '-d'], cwd)
}

export async function runMigrations(cwd: string): Promise<void> {
  await runInherit('pnpm', ['db:migrate'], cwd)
}

export async function seedAdmin(cwd: string, email: string, password: string): Promise<void> {
  await runInherit('pnpm', ['db:seed', '--email', email, '--password', password], cwd)
}
