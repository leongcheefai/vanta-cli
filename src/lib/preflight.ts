import { createConnection } from 'net'
import { run } from './exec.js'

export async function checkNode(version = process.version): Promise<void> {
  const major = parseInt(version.slice(1).split('.')[0], 10)
  if (major < 22) {
    throw new Error('Node 22+ required. Install via https://nodejs.org')
  }
}

export async function checkDockerInstalled(): Promise<void> {
  try {
    await run('which', ['docker'])
  } catch {
    throw new Error('Docker not found. Install from https://docker.com')
  }
}

export async function checkDockerRunning(): Promise<void> {
  try {
    await run('docker', ['info'])
  } catch {
    throw new Error('Docker not running. Run: open -a Docker')
  }
}

export async function checkPort5432Free(): Promise<void> {
  return new Promise((resolve, reject) => {
    const conn = createConnection({ port: 5432, host: 'localhost' })
    conn.on('connect', () => {
      conn.destroy()
      reject(new Error('Port 5432 in use. Stop the conflicting process.'))
    })
    conn.on('error', () => {
      resolve()
    })
  })
}

export async function checkSSH(): Promise<void> {
  try {
    await run('ssh', ['-T', '-o', 'StrictHostKeyChecking=no', 'git@github.com'])
  } catch (err: any) {
    if (err?.stderr?.includes('successfully authenticated')) return
    throw new Error(
      'SSH auth failed. Set up your SSH key: https://docs.github.com/en/authentication/connecting-to-github-with-ssh',
    )
  }
}

export async function ensurePnpm(): Promise<void> {
  try {
    await run('pnpm', ['--version'])
  } catch {
    await run('corepack', ['enable'])
    await run('corepack', ['prepare', 'pnpm@latest', '--activate'])
  }
}
