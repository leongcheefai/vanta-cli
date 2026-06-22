import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as clack from "@clack/prompts";
import { buildEnvContent } from "../lib/env-wizard.js";
import {
  checkDockerInstalled,
  checkDockerRunning,
  checkNode,
  checkRailwayInstalled,
  checkRailwayLoggedIn,
  checkSSH,
  checkSupabaseInstalled,
  checkSupabaseLoggedIn,
  checkVercelInstalled,
  checkVercelLoggedIn,
  ensurePnpm,
  findFreePort,
} from "../lib/preflight.js";
import {
  buildSupabaseDbUrl,
  cloneRepo,
  composeUp,
  createSupabaseOrg,
  createSupabaseProject,
  ensureDatabase,
  installDeps,
  installRailwayCli,
  installSupabaseCli,
  installVercelCli,
  listSupabaseOrgs,
  pushVercelEnv,
  railwayDeploy,
  railwayLogin,
  runMigrations,
  seedAdmin,
  supabaseLogin,
  vercelDeploy,
  vercelLogin,
  waitForPostgres,
  waitForSupabaseProject,
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

async function runStepSoft(
  label: string,
  fn: () => Promise<void>,
): Promise<boolean> {
  const spinner = clack.spinner();
  spinner.start(label);
  try {
    await fn();
    spinner.stop(label);
    return true;
  } catch (err: unknown) {
    spinner.stop(label, 1);
    clack.log.warn(err instanceof Error ? err.message : String(err));
    return false;
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
  let shouldDeployRailway = false;
  let apiUrl = "";
  let shouldProvisionSupabase = false;
  let supabaseDbUrl: string | undefined;
  let supabaseDbPassword: string | undefined;
  let supabaseOrgId: string | undefined;
  let supabaseProjName = name;
  let supabaseRegion = "ap-southeast-1";
  let adminEmail: string | undefined;
  let adminPassword: string | undefined;

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

    const deployRailway = await clack.confirm({
      message: "Deploy backend to Railway?",
      initialValue: false,
    });
    if (clack.isCancel(deployRailway)) abort("Aborted.");

    if (deployRailway) {
      let railwayReady = false;
      try {
        await checkRailwayInstalled();
        railwayReady = true;
      } catch {
        const installIt = await clack.confirm({
          message: "Railway CLI not found. Install via pnpm?",
          initialValue: true,
        });
        if (clack.isCancel(installIt)) abort("Aborted.");
        if (installIt) {
          await runStep("Installing Railway CLI", installRailwayCli);
          railwayReady = true;
        } else {
          clack.log.warn(
            "Skipping Railway deploy. Run `railway up` manually later.",
          );
        }
      }

      if (railwayReady) {
        try {
          await checkRailwayLoggedIn();
        } catch {
          const doLogin = await clack.confirm({
            message: "Not logged into Railway. Login now?",
            initialValue: true,
          });
          if (clack.isCancel(doLogin)) abort("Aborted.");
          if (doLogin) {
            await railwayLogin();
            try {
              await checkRailwayLoggedIn();
            } catch {
              clack.log.warn(
                "Still not logged in. Skipping Railway deploy. Run `railway up` manually later.",
              );
              railwayReady = false;
            }
          } else {
            clack.log.warn(
              "Skipping Railway deploy. Run `railway up` manually later.",
            );
            railwayReady = false;
          }
        }
      }

      shouldDeployRailway = railwayReady;

      if (shouldDeployRailway) {
        const provisionSupabase = await clack.confirm({
          message: "Provision a Supabase database for Railway?",
          initialValue: true,
        });
        if (clack.isCancel(provisionSupabase)) abort("Aborted.");

        if (provisionSupabase) {
          let supabaseReady = false;
          try {
            await checkSupabaseInstalled();
            supabaseReady = true;
          } catch {
            const installIt = await clack.confirm({
              message: "Supabase CLI not found. Install via pnpm?",
              initialValue: true,
            });
            if (clack.isCancel(installIt)) abort("Aborted.");
            if (installIt) {
              await runStep("Installing Supabase CLI", installSupabaseCli);
              supabaseReady = true;
            } else {
              clack.log.warn(
                "Skipping Supabase provisioning. Set DATABASE_URL manually in Railway dashboard.",
              );
            }
          }

          if (supabaseReady) {
            try {
              await checkSupabaseLoggedIn();
            } catch {
              const doLogin = await clack.confirm({
                message: "Not logged into Supabase. Login now?",
                initialValue: true,
              });
              if (clack.isCancel(doLogin)) abort("Aborted.");
              if (doLogin) {
                await supabaseLogin();
                try {
                  await checkSupabaseLoggedIn();
                } catch {
                  clack.log.warn(
                    "Still not logged in. Skipping Supabase provisioning.",
                  );
                  supabaseReady = false;
                }
              } else {
                clack.log.warn(
                  "Skipping Supabase provisioning. Set DATABASE_URL manually in Railway dashboard.",
                );
                supabaseReady = false;
              }
            }
          }

          if (supabaseReady) {
            let orgs: { id: string; name: string }[] = [];
            try {
              orgs = await listSupabaseOrgs();
            } catch {
              clack.log.warn("Could not list Supabase orgs.");
            }

            const CREATE_NEW = "__create_new__";
            const orgOptions = [
              ...orgs.map((o) => ({ value: o.id, label: o.name })),
              { value: CREATE_NEW, label: "Create new organization..." },
            ];

            const selectedOrg = await clack.select({
              message: "Select Supabase organization:",
              options: orgOptions,
            });
            if (clack.isCancel(selectedOrg)) abort("Aborted.");

            if (selectedOrg === CREATE_NEW) {
              const newOrgName = await clack.text({
                message: "New organization name:",
                validate: (v) => (v.trim() ? undefined : "Name required"),
              });
              if (clack.isCancel(newOrgName)) abort("Aborted.");
              try {
                supabaseOrgId = await createSupabaseOrg(newOrgName as string);
              } catch (err: unknown) {
                clack.log.warn(
                  `Failed to create org: ${err instanceof Error ? err.message : String(err)}`,
                );
                supabaseReady = false;
              }
            } else {
              supabaseOrgId = selectedOrg as string;
            }
          }

          if (supabaseReady && supabaseOrgId) {
            const USE_EXISTING = "__use_existing__";
            const projectMode = await clack.select({
              message: "Supabase project:",
              options: [
                {
                  value: "create",
                  label: "Create new project",
                },
                {
                  value: USE_EXISTING,
                  label: "Use existing project (enter ref + password)",
                },
              ],
            });
            if (clack.isCancel(projectMode)) abort("Aborted.");

            if (projectMode === USE_EXISTING) {
              const existingRef = await clack.text({
                message:
                  "Project reference ID (from supabase.com/dashboard → project settings):",
                validate: (v) => (v.trim() ? undefined : "Reference required"),
              });
              if (clack.isCancel(existingRef)) abort("Aborted.");

              const existingPass = await clack.password({
                message: "Database password for that project:",
              });
              if (clack.isCancel(existingPass)) abort("Aborted.");

              supabaseDbUrl = buildSupabaseDbUrl(
                (existingRef as string).trim(),
                existingPass as string,
              );
              clack.log.info(
                "Will run migrations and seed against existing Supabase project.",
              );
              shouldProvisionSupabase = false;
              supabaseOrgId = undefined;
            } else {
              const projNameInput = await clack.text({
                message: "Supabase project name:",
                initialValue: name,
                validate: (v) => (v.trim() ? undefined : "Name required"),
              });
              if (clack.isCancel(projNameInput)) abort("Aborted.");
              supabaseProjName = projNameInput as string;

              const SUPABASE_REGIONS = [
                {
                  value: "ap-southeast-1",
                  label: "ap-southeast-1 (Singapore)",
                },
                {
                  value: "us-east-1",
                  label: "us-east-1 (US East N. Virginia)",
                },
                {
                  value: "us-west-1",
                  label: "us-west-1 (US West Oregon)",
                },
                {
                  value: "eu-west-1",
                  label: "eu-west-1 (EU West Ireland)",
                },
                {
                  value: "eu-central-1",
                  label: "eu-central-1 (EU Central Frankfurt)",
                },
                {
                  value: "ap-northeast-1",
                  label: "ap-northeast-1 (AP Northeast Tokyo)",
                },
                {
                  value: "ap-southeast-2",
                  label: "ap-southeast-2 (AP Southeast Sydney)",
                },
              ];

              const regionInput = await clack.select({
                message: "Supabase region:",
                options: SUPABASE_REGIONS,
                initialValue: "ap-southeast-1",
              });
              if (clack.isCancel(regionInput)) abort("Aborted.");
              supabaseRegion = regionInput as string;

              supabaseDbPassword = randomBytes(24).toString("hex");
              shouldProvisionSupabase = true;
            }
          }
        }
      }
    }

    const deployVercel = await clack.confirm({
      message: "Deploy to Vercel?",
      initialValue: false,
    });
    if (clack.isCancel(deployVercel)) abort("Aborted.");

    // Only ask for the API URL manually when Railway is not deploying the backend;
    // if Railway succeeds it will auto-feed VITE_API_URL after deploy.
    if (deployVercel && !shouldDeployRailway) {
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
        resend,
        stripe,
        googleOAuth,
        s3,
        githubFeedback,
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
    const emailInput = await clack.text({
      message: "Admin email:",
      validate: (v) => (v.includes("@") ? undefined : "Enter a valid email"),
    });
    if (clack.isCancel(emailInput)) abort("Aborted.");
    adminEmail = emailInput as string;

    let pw!: string;
    while (true) {
      const pwInput = await clack.password({
        message: "Admin password (min 8 chars):",
      });
      if (clack.isCancel(pwInput)) abort("Aborted.");
      if (pwInput.length < 8) {
        clack.log.warn("Password must be at least 8 characters.");
        continue;
      }
      const confirm = await clack.password({ message: "Confirm password:" });
      if (clack.isCancel(confirm)) abort("Aborted.");
      if (confirm !== pwInput) {
        clack.log.warn("Passwords do not match. Try again.");
        continue;
      }
      pw = pwInput;
      break;
    }
    adminPassword = pw;

    const localEmail = adminEmail as string;
    await runStep("Creating admin user", () =>
      seedAdmin(projectDir, localEmail, pw),
    );
  }

  if (!shouldProvisionSupabase && supabaseDbUrl) {
    await runStepSoft("Running migrations on Supabase", () =>
      runMigrations(projectDir, supabaseDbUrl),
    );
    if (adminEmail && adminPassword) {
      const e = adminEmail;
      const p = adminPassword;
      await runStepSoft("Seeding admin on Supabase", () =>
        seedAdmin(projectDir, e, p, supabaseDbUrl),
      );
    }
  }

  if (shouldProvisionSupabase && supabaseOrgId && supabaseDbPassword) {
    const orgId = supabaseOrgId;
    const dbPassword = supabaseDbPassword;
    let ref = "";

    const projOk = await runStepSoft(
      `Creating Supabase project "${supabaseProjName}"`,
      async () => {
        ref = await createSupabaseProject(
          orgId,
          supabaseProjName,
          dbPassword,
          supabaseRegion,
        );
      },
    );

    if (projOk && ref) {
      const waitOk = await runStepSoft(
        "Waiting for Supabase project to be ready (this can take 1–2 min)",
        () => waitForSupabaseProject(ref),
      );

      if (waitOk) {
        supabaseDbUrl = buildSupabaseDbUrl(ref, dbPassword);
        // Migrations and seed on Supabase are best-effort — Railway still gets
        // the real URL even if they fail so the user can run them manually.
        await runStepSoft("Running migrations on Supabase", () =>
          runMigrations(projectDir, supabaseDbUrl),
        );
        if (adminEmail && adminPassword) {
          const e = adminEmail;
          const p = adminPassword;
          await runStepSoft("Seeding admin on Supabase", () =>
            seedAdmin(projectDir, e, p, supabaseDbUrl),
          );
        }
      } else {
        clack.log.warn(
          "Supabase project not ready in time. Railway will deploy with placeholder DATABASE_URL.",
        );
      }
    } else {
      clack.log.warn(
        "Supabase project creation failed. Railway will deploy with placeholder DATABASE_URL.",
      );
    }
  }

  let railwayUrl: string | undefined;

  if (shouldDeployRailway) {
    clack.log.info("Deploying backend to Railway...");
    try {
      // Deploy from monorepo root so the builder picks up pnpm-lock.yaml
      // and resolves workspace:* dependencies correctly.
      railwayUrl = await railwayDeploy(name, projectDir, supabaseDbUrl);
      clack.log.success(`Backend: ${railwayUrl}`);
      if (!supabaseDbUrl) {
        clack.log.warn(
          "Placeholder env vars were set. Update DATABASE_URL and BETTER_AUTH_SECRET with real values in Railway dashboard → Variables tab.",
        );
      }
      apiUrl = railwayUrl;
    } catch (err: unknown) {
      clack.log.warn(
        `Railway deploy failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      clack.log.info(`Run manually: cd ${name} && railway up`);
    }
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
  if (railwayUrl) outroLines.push(`Railway: ${railwayUrl}`);
  if (vercelUrl) outroLines.push(`Vercel: ${vercelUrl}`);
  if (supabaseDbUrl) {
    outroLines.push(`Supabase DB password: ${supabaseDbPassword}`);
  }
  clack.outro(outroLines.join("\n"));
}
