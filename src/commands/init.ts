import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as clack from "@clack/prompts";
import { buildEnvContent } from "../lib/env-wizard.js";
import {
  checkDockerInstalled,
  checkDockerRunning,
  checkNode,
  checkPort5432Free,
  checkSSH,
  ensurePnpm,
  getPort5432DockerContainers,
  getPort5432Pids,
  killPort5432Pids,
  stopDockerContainers,
  waitForPort5432Free,
} from "../lib/preflight.js";
import {
  cloneRepo,
  composeUp,
  installDeps,
  runMigrations,
  seedAdmin,
  waitForPostgres,
} from "../lib/steps.js";

async function runStep(label: string, fn: () => Promise<void>): Promise<void> {
  const spinner = clack.spinner();
  spinner.start(label);
  try {
    await fn();
    spinner.stop(label);
  } catch (err: unknown) {
    spinner.stop(label, 1);
    clack.cancel(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

function abort(msg: string): never {
  clack.cancel(msg);
  process.exit(1);
}

export async function init(name: string): Promise<void> {
  clack.intro("vanta init");

  // Preflight checks — sequential, halt on first failure
  await runStep("Checking Node version", checkNode);
  await runStep("Checking Docker installed", checkDockerInstalled);
  await runStep("Checking Docker running", checkDockerRunning);
  // Port 5432 — offer to kill conflicting process
  const portSpinner = clack.spinner();
  portSpinner.start("Checking port 5432");
  try {
    await checkPort5432Free();
    portSpinner.stop("Checking port 5432");
  } catch {
    portSpinner.stop("Port 5432 in use", 1);
    const [pids, containers] = await Promise.all([
      getPort5432Pids(),
      getPort5432DockerContainers(),
    ]);
    const pidLabel = pids.length ? ` (PID: ${pids.join(", ")})` : "";
    const containerLabel = containers.length
      ? `, Docker: ${containers.join(", ")}`
      : "";
    const kill = await clack.confirm({
      message: `Port 5432 is in use${pidLabel}${containerLabel}. Kill the conflicting process?`,
      initialValue: true,
    });
    if (clack.isCancel(kill) || !kill)
      abort("Port 5432 in use. Stop the conflicting process.");
    if (containers.length) await stopDockerContainers(containers);
    if (pids.length) await killPort5432Pids(pids);
    try {
      await waitForPort5432Free();
      clack.log.success("Port 5432 is now free");
    } catch {
      abort(
        "Port 5432 still in use. Run: lsof -ti :5432 | xargs kill -9",
      );
    }
  }
  await runStep("Checking SSH access to GitHub", checkSSH);
  await runStep("Ensuring pnpm", ensurePnpm);

  // Clone
  await runStep(`Cloning into ./${name}`, () => cloneRepo(name));

  const projectDir = join(process.cwd(), name);

  // Install deps
  await runStep("Installing dependencies", () => installDeps(projectDir));

  // .env wizard
  const envPath = join(projectDir, ".env");
  let shouldWriteEnv = true;

  if (existsSync(envPath)) {
    const overwrite = await clack.confirm({
      message: ".env already exists. Overwrite?",
      initialValue: false,
    });
    if (clack.isCancel(overwrite)) abort("Aborted.");
    shouldWriteEnv = overwrite as boolean;
  }

  if (shouldWriteEnv) {
    const resend = await clack.confirm({
      message: "Set up Resend (email)?",
      initialValue: false,
    });
    if (clack.isCancel(resend)) abort("Aborted.");

    const stripe = await clack.confirm({
      message: "Set up Stripe (payments)?",
      initialValue: false,
    });
    if (clack.isCancel(stripe)) abort("Aborted.");

    const googleOAuth = await clack.confirm({
      message: "Set up Google OAuth?",
      initialValue: false,
    });
    if (clack.isCancel(googleOAuth)) abort("Aborted.");

    const s3 = await clack.confirm({
      message: "Set up S3 (file storage)?",
      initialValue: false,
    });
    if (clack.isCancel(s3)) abort("Aborted.");

    const githubFeedback = await clack.confirm({
      message: "Set up GitHub Feedback?",
      initialValue: false,
    });
    if (clack.isCancel(githubFeedback)) abort("Aborted.");

    const content = buildEnvContent({
      resend: resend as boolean,
      stripe: stripe as boolean,
      googleOAuth: googleOAuth as boolean,
      s3: s3 as boolean,
      githubFeedback: githubFeedback as boolean,
    });

    writeFileSync(envPath, content);
    clack.log.success(".env written");
  }

  // Docker + migrations
  await runStep("Starting Docker services", () => composeUp(projectDir));
  await runStep("Waiting for Postgres", () => waitForPostgres(projectDir));
  await runStep("Running migrations", () => runMigrations(projectDir));

  // Admin user
  const createAdmin = await clack.confirm({
    message: "Create initial admin user?",
    initialValue: true,
  });
  if (clack.isCancel(createAdmin)) abort("Aborted.");

  if (createAdmin) {
    const email = await clack.text({
      message: "Admin email:",
      validate: (v) => (v.includes("@") ? undefined : "Enter a valid email"),
    });
    if (clack.isCancel(email)) abort("Aborted.");

    let password!: string;
    while (true) {
      const pw = await clack.password({
        message: "Admin password (min 8 chars):",
      });
      if (clack.isCancel(pw)) abort("Aborted.");
      if ((pw as string).length < 8) {
        clack.log.warn("Password must be at least 8 characters.");
        continue;
      }
      const confirm = await clack.password({ message: "Confirm password:" });
      if (clack.isCancel(confirm)) abort("Aborted.");
      if (confirm !== pw) {
        clack.log.warn("Passwords do not match. Try again.");
        continue;
      }
      password = pw as string;
      break;
    }

    await runStep("Creating admin user", () =>
      seedAdmin(projectDir, email as string, password),
    );
  }

  clack.outro(`Done! Run: cd ${name} && pnpm dev`);
}
