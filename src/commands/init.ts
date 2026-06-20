import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as clack from "@clack/prompts";
import { buildEnvContent } from "../lib/env-wizard.js";
import {
  checkDockerInstalled,
  checkDockerRunning,
  checkNode,
  checkSSH,
  checkVercelInstalled,
  checkVercelLoggedIn,
  ensurePnpm,
  findFreePort,
} from "../lib/preflight.js";
import {
  cloneRepo,
  composeUp,
  ensureDatabase,
  installDeps,
  installVercelCli,
  pushVercelEnv,
  runMigrations,
  seedAdmin,
  vercelDeploy,
  vercelLogin,
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

  let dbPort = 5432;
  let shouldDeployVercel = false;
  let apiUrl = "";

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

    const deployVercel = await clack.confirm({
      message: "Deploy to Vercel?",
      initialValue: false,
    });
    if (clack.isCancel(deployVercel)) abort("Aborted.");

    let apiUrl = "";
    if (deployVercel) {
      const apiUrlInput = await clack.text({
        message: "API URL for production (VITE_API_URL):",
        placeholder: "Leave blank to set later in Vercel dashboard",
        validate: (v) =>
          v === "" || v.startsWith("http") ? undefined : "Must be a valid URL",
      });
      if (clack.isCancel(apiUrlInput)) abort("Aborted.");
      apiUrl = apiUrlInput as string;
    }

    if (deployVercel) {
      let vercelReady = false;
      try {
        await checkVercelInstalled();
        vercelReady = true;
      } catch {
        const installIt = await clack.confirm({
          message: "Vercel CLI not found. Install via pnpm?",
          initialValue: true,
        });
        if (clack.isCancel(installIt)) abort("Aborted.");
        if (installIt) {
          await runStep("Installing Vercel CLI", installVercelCli);
          vercelReady = true;
        } else {
          clack.log.warn(
            "Skipping Vercel deploy. Run `vercel --prod` manually later.",
          );
        }
      }

      if (vercelReady) {
        try {
          await checkVercelLoggedIn();
        } catch {
          const doLogin = await clack.confirm({
            message: "Not logged into Vercel. Login now?",
            initialValue: true,
          });
          if (clack.isCancel(doLogin)) abort("Aborted.");
          if (doLogin) {
            await vercelLogin();
            try {
              await checkVercelLoggedIn();
            } catch {
              clack.log.warn(
                "Still not logged in. Skipping Vercel deploy. Run `vercel --prod` manually later.",
              );
              vercelReady = false;
            }
          } else {
            clack.log.warn(
              "Skipping Vercel deploy. Run `vercel --prod` manually later.",
            );
            vercelReady = false;
          }
        }
      }

      shouldDeployVercel = vercelReady;
    }

    // Find free port immediately before writing .env and starting Docker
    // to minimise the window between check and use
    await runStep("Finding a free Postgres port", async () => {
      dbPort = await findFreePort(5432);
    });
    clack.log.info(`Using Postgres host port ${dbPort}`);

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
  } else {
    // .env exists and user kept it — parse the port from DATABASE_URL so
    // Docker starts on the same port the app expects
    const envContent = readFileSync(envPath, "utf8");
    const match = envContent.match(/DATABASE_URL=.*localhost:(\d+)/);
    if (match) {
      dbPort = Number(match[1]);
      clack.log.info(`Using Postgres host port ${dbPort} (from existing .env)`);
    } else {
      await runStep("Finding a free Postgres port", async () => {
        dbPort = await findFreePort(5432);
      });
      clack.log.info(`Using Postgres host port ${dbPort}`);
    }
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

  let vercelUrl: string | null = null;

  if (shouldDeployVercel) {
    const spinner = clack.spinner();
    spinner.start("Deploying to Vercel");
    try {
      vercelUrl = await vercelDeploy(projectDir);
      spinner.stop("Deploying to Vercel");
    } catch (err: unknown) {
      spinner.stop("Deploying to Vercel", 1);
      clack.log.warn(
        `Vercel deploy failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      clack.log.info(`Run manually: cd ${name} && vercel --prod`);
    }

    if (vercelUrl && apiUrl) {
      try {
        await pushVercelEnv("VITE_API_URL", apiUrl, projectDir);
      } catch (err: unknown) {
        clack.log.warn(
          `Failed to push VITE_API_URL to Vercel: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      clack.log.info(
        "Env vars pushed. Run `vercel --prod` once more to pick them up.",
      );
    }
  }

  const outroLines = [`Local:  cd ${name} && pnpm dev`];
  if (vercelUrl) outroLines.push(`Vercel: ${vercelUrl}`);
  clack.outro(outroLines.join("\n"));
}
