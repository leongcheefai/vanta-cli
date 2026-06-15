import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as clack from "@clack/prompts";
import { buildEnvContent } from "../lib/env-wizard.js";
import {
  checkDockerInstalled,
  checkDockerRunning,
  checkNode,
  checkSSH,
  ensurePnpm,
  findFreePort,
} from "../lib/preflight.js";
import {
  cloneRepo,
  composeUp,
  ensureDatabase,
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

  await runStep("Checking Node version", checkNode);
  await runStep("Checking Docker installed", checkDockerInstalled);
  await runStep("Checking Docker running", checkDockerRunning);

  let dbPort!: number;
  await runStep("Finding a free Postgres port", async () => {
    dbPort = await findFreePort(5432);
  });
  clack.log.info(`Using Postgres host port ${dbPort}`);

  await runStep("Checking SSH access to GitHub", checkSSH);
  await runStep("Ensuring pnpm", ensurePnpm);

  await runStep(`Cloning into ./${name}`, () => cloneRepo(name));

  const projectDir = join(process.cwd(), name);

  await runStep("Installing dependencies", () => installDeps(projectDir));

  const envPath = join(projectDir, ".env");
  let shouldWriteEnv = true;

  if (existsSync(envPath)) {
    const overwrite = await clack.confirm({
      message: ".env already exists. Overwrite?",
      initialValue: false,
    });
    if (clack.isCancel(overwrite)) abort("Aborted.");
    shouldWriteEnv = overwrite;
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

    const content = buildEnvContent(
      {
        resend: resend,
        stripe: stripe,
        googleOAuth: googleOAuth,
        s3: s3,
        githubFeedback: githubFeedback,
      },
      dbPort,
    );

    writeFileSync(envPath, content);
    clack.log.success(".env written");
  }

  await runStep("Starting Docker services", () =>
    composeUp(projectDir, dbPort),
  );
  await runStep("Waiting for Postgres", () =>
    waitForPostgres(projectDir, dbPort),
  );
  await runStep("Creating database", () =>
    ensureDatabase(projectDir, "vanta_base_admin", dbPort),
  );
  await runStep("Running migrations", () => runMigrations(projectDir));

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
      if (pw.length < 8) {
        clack.log.warn("Password must be at least 8 characters.");
        continue;
      }
      const confirm = await clack.password({ message: "Confirm password:" });
      if (clack.isCancel(confirm)) abort("Aborted.");
      if (confirm !== pw) {
        clack.log.warn("Passwords do not match. Try again.");
        continue;
      }
      password = pw;
      break;
    }

    await runStep("Creating admin user", () =>
      seedAdmin(projectDir, email, password),
    );
  }

  clack.outro(`Done! Run: cd ${name} && pnpm dev`);
}
