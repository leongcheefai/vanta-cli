import * as clack from '@clack/prompts'
import { existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import { buildEnvContent } from '../lib/env-wizard.js'
import {
  checkDockerInstalled,
  checkDockerRunning,
  checkNode,
  checkPort5432Free,
  checkSSH,
  ensurePnpm,
} from '../lib/preflight.js'
import { cloneRepo, composeUp, installDeps, runMigrations, seedAdmin } from '../lib/steps.js'

async function runStep(label: string, fn: () => Promise<void>): Promise<void> {
  const spinner = clack.spinner()
  spinner.start(label)
  try {
    await fn()
    spinner.stop(label)
  } catch (err: any) {
    spinner.stop(label, 1)
    clack.cancel(err.message)
    process.exit(1)
  }
}

function abort(msg: string): never {
  clack.cancel(msg)
  process.exit(1)
}

export async function init(name: string): Promise<void> {
  clack.intro('vanta init')

  // Preflight checks — sequential, halt on first failure
  await runStep('Checking Node version', checkNode)
  await runStep('Checking Docker installed', checkDockerInstalled)
  await runStep('Checking Docker running', checkDockerRunning)
  await runStep('Checking port 5432', checkPort5432Free)
  await runStep('Checking SSH access to GitHub', checkSSH)
  await runStep('Ensuring pnpm', ensurePnpm)

  // Clone
  await runStep(`Cloning into ./${name}`, () => cloneRepo(name))

  const projectDir = join(process.cwd(), name)

  // Install deps
  await runStep('Installing dependencies', () => installDeps(projectDir))

  // .env wizard
  const envPath = join(projectDir, '.env')
  let shouldWriteEnv = true

  if (existsSync(envPath)) {
    const overwrite = await clack.confirm({
      message: '.env already exists. Overwrite?',
      initialValue: false,
    })
    if (clack.isCancel(overwrite)) abort('Aborted.')
    shouldWriteEnv = overwrite as boolean
  }

  if (shouldWriteEnv) {
    const resend = await clack.confirm({ message: 'Set up Resend (email)?', initialValue: false })
    if (clack.isCancel(resend)) abort('Aborted.')

    const stripe = await clack.confirm({ message: 'Set up Stripe (payments)?', initialValue: false })
    if (clack.isCancel(stripe)) abort('Aborted.')

    const googleOAuth = await clack.confirm({ message: 'Set up Google OAuth?', initialValue: false })
    if (clack.isCancel(googleOAuth)) abort('Aborted.')

    const s3 = await clack.confirm({ message: 'Set up S3 (file storage)?', initialValue: false })
    if (clack.isCancel(s3)) abort('Aborted.')

    const githubFeedback = await clack.confirm({
      message: 'Set up GitHub Feedback?',
      initialValue: false,
    })
    if (clack.isCancel(githubFeedback)) abort('Aborted.')

    const content = buildEnvContent({
      resend: resend as boolean,
      stripe: stripe as boolean,
      googleOAuth: googleOAuth as boolean,
      s3: s3 as boolean,
      githubFeedback: githubFeedback as boolean,
    })

    writeFileSync(envPath, content)
    clack.log.success('.env written')
  }

  // Docker + migrations
  await runStep('Starting Docker services', () => composeUp(projectDir))
  await runStep('Running migrations', () => runMigrations(projectDir))

  // Admin user
  const createAdmin = await clack.confirm({
    message: 'Create initial admin user?',
    initialValue: true,
  })
  if (clack.isCancel(createAdmin)) abort('Aborted.')

  if (createAdmin) {
    const email = await clack.text({
      message: 'Admin email:',
      validate: (v) => (v.includes('@') ? undefined : 'Enter a valid email'),
    })
    if (clack.isCancel(email)) abort('Aborted.')

    let password: string | undefined
    while (true) {
      const pw = await clack.password({ message: 'Admin password (min 8 chars):' })
      if (clack.isCancel(pw)) abort('Aborted.')
      if ((pw as string).length < 8) {
        clack.log.warn('Password must be at least 8 characters.')
        continue
      }
      const confirm = await clack.password({ message: 'Confirm password:' })
      if (clack.isCancel(confirm)) abort('Aborted.')
      if (confirm !== pw) {
        clack.log.warn('Passwords do not match. Try again.')
        continue
      }
      password = pw as string
      break
    }

    await runStep('Creating admin user', () => seedAdmin(projectDir, email as string, password!))
  }

  clack.outro(`Done! Run: cd ${name} && pnpm dev`)
}
