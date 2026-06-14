#!/usr/bin/env node

// src/index.ts
import { Command } from "commander";

// src/commands/doctor.ts
import * as clack from "@clack/prompts";
import { existsSync, readFileSync } from "fs";
import { createConnection } from "net";

// src/lib/exec.ts
import { execa } from "execa";
async function run(cmd, args, cwd) {
  const result = await execa(cmd, args, { cwd });
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

// src/commands/doctor.ts
async function check(label, fn) {
  try {
    await fn();
    return { label, pass: true };
  } catch (err) {
    return { label, pass: false, detail: err.message };
  }
}
async function tcpConnect(host, port) {
  return new Promise((resolve, reject) => {
    const conn = createConnection({ host, port });
    conn.on("connect", () => {
      conn.destroy();
      resolve();
    });
    conn.on("error", (err) => reject(err));
  });
}
async function doctor() {
  clack.intro("vanta doctor");
  const envExists = existsSync(".env");
  const envVars = envExists ? parseEnv(readFileSync(".env", "utf8")) : {};
  const results = await Promise.all([
    check("Node >= 22", async () => {
      const major = parseInt(process.version.slice(1).split(".")[0], 10);
      if (major < 22) throw new Error(`Node ${process.version} (need 22+)`);
    }),
    check("pnpm >= 9", async () => {
      const { stdout } = await run("pnpm", ["--version"]);
      const major = parseInt(stdout.trim().split(".")[0], 10);
      if (major < 9) throw new Error(`pnpm ${stdout.trim()} (need 9+)`);
    }),
    check("Docker running", async () => {
      await run("docker", ["info"]);
    }),
    check(".env exists", async () => {
      if (!envExists) throw new Error(".env not found in current directory");
    }),
    check("Required env vars", async () => {
      if (!envExists) throw new Error(".env not found");
      const required = ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "APP_URL", "VITE_API_URL"];
      const missing = required.filter((k) => !envVars[k]);
      if (missing.length) throw new Error(`Missing: ${missing.join(", ")}`);
    }),
    check("Postgres reachable", async () => {
      if (!envExists) throw new Error(".env not found");
      const url = envVars["DATABASE_URL"];
      if (!url) throw new Error("DATABASE_URL not set");
      const match = url.match(/postgresql:\/\/[^@]+@([^:/]+):(\d+)/);
      if (!match) throw new Error("Cannot parse DATABASE_URL host:port");
      await tcpConnect(match[1], parseInt(match[2], 10));
    }),
    check("node_modules/.pnpm present", async () => {
      if (!existsSync("node_modules/.pnpm"))
        throw new Error("node_modules/.pnpm not found \u2014 run pnpm install");
    })
  ]);
  const lines = results.map(
    (r) => `${r.pass ? "\u2713" : "\u2717"} ${r.label}${r.detail ? `: ${r.detail}` : ""}`
  );
  clack.note(lines.join("\n"), "Health Check");
  const allPass = results.every((r) => r.pass);
  if (allPass) {
    clack.outro("All checks passed.");
  } else {
    clack.outro("Some checks failed. Fix the issues above.");
    process.exit(1);
  }
}
function parseEnv(content) {
  const vars = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return vars;
}

// src/commands/init.ts
import * as clack2 from "@clack/prompts";
import { existsSync as existsSync3, writeFileSync } from "fs";
import { join } from "path";

// src/lib/env-wizard.ts
import { randomBytes } from "crypto";
function buildEnvContent(flags) {
  const secret = randomBytes(33).toString("base64");
  const lines = [
    `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vanta_base_admin`,
    `NODE_ENV=development`,
    `BETTER_AUTH_URL=http://localhost:3001`,
    `BETTER_AUTH_SECRET=${secret}`,
    `APP_URL=http://localhost:3000`,
    `WEB_URL=http://localhost:4321`,
    `VITE_API_URL=http://localhost:3001`
  ];
  if (flags.resend) {
    lines.push("", "# Resend", "RESEND_API_KEY=");
  }
  if (flags.stripe) {
    lines.push("", "# Stripe", "STRIPE_SECRET_KEY=", "STRIPE_WEBHOOK_SECRET=", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=");
  }
  if (flags.googleOAuth) {
    lines.push("", "# Google OAuth", "GOOGLE_CLIENT_ID=", "GOOGLE_CLIENT_SECRET=");
  }
  if (flags.s3) {
    lines.push("", "# S3", "S3_ACCESS_KEY_ID=", "S3_SECRET_ACCESS_KEY=", "S3_BUCKET=", "S3_REGION=");
  }
  if (flags.githubFeedback) {
    lines.push("", "# GitHub Feedback", "GITHUB_TOKEN=", "GITHUB_FEEDBACK_REPO=");
  }
  return lines.join("\n") + "\n";
}

// src/lib/preflight.ts
import { createConnection as createConnection2 } from "net";
async function checkNode(version = process.version) {
  const major = parseInt(version.slice(1).split(".")[0], 10);
  if (major < 22) {
    throw new Error("Node 22+ required. Install via https://nodejs.org");
  }
}
async function checkDockerInstalled() {
  try {
    await run("which", ["docker"]);
  } catch {
    throw new Error("Docker not found. Install from https://docker.com");
  }
}
async function checkDockerRunning() {
  try {
    await run("docker", ["info"]);
  } catch {
    throw new Error("Docker not running. Run: open -a Docker");
  }
}
async function checkPort5432Free() {
  return new Promise((resolve, reject) => {
    const conn = createConnection2({ port: 5432, host: "localhost" });
    conn.on("connect", () => {
      conn.destroy();
      reject(new Error("Port 5432 in use. Stop the conflicting process."));
    });
    conn.on("error", () => {
      conn.destroy();
      resolve();
    });
  });
}
async function checkSSH() {
  try {
    await run("ssh", ["-T", "-o", "StrictHostKeyChecking=accept-new", "git@github.com"]);
  } catch (err) {
    if (err?.stderr?.includes("successfully authenticated")) return;
    throw new Error(
      "SSH auth failed. Set up your SSH key: https://docs.github.com/en/authentication/connecting-to-github-with-ssh"
    );
  }
}
async function ensurePnpm() {
  try {
    await run("pnpm", ["--version"]);
  } catch {
    try {
      await run("corepack", ["enable"]);
      await run("corepack", ["prepare", "pnpm@latest", "--activate"]);
    } catch {
    }
  }
}

// src/lib/steps.ts
import { existsSync as existsSync2 } from "fs";
var REPO_URL = "git@github.com:leongcheefai/vanta-base-admin.git";
async function cloneRepo(name) {
  if (existsSync2(name)) return;
  await run("git", ["clone", REPO_URL, name]);
}
async function installDeps(cwd) {
  await run("pnpm", ["install"], cwd);
}
async function composeUp(cwd) {
  await run("docker", ["compose", "up", "-d"], cwd);
}
async function runMigrations(cwd) {
  await run("pnpm", ["db:migrate"], cwd);
}
async function seedAdmin(cwd, email, password2) {
  await run("pnpm", ["db:seed", "--email", email, "--password", password2], cwd);
}

// src/commands/init.ts
async function runStep(label, fn) {
  const spinner2 = clack2.spinner();
  spinner2.start(label);
  try {
    await fn();
    spinner2.stop(label);
  } catch (err) {
    spinner2.stop(label, 1);
    clack2.cancel(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
function abort(msg) {
  clack2.cancel(msg);
  process.exit(1);
}
async function init(name) {
  clack2.intro("vanta init");
  await runStep("Checking Node version", checkNode);
  await runStep("Checking Docker installed", checkDockerInstalled);
  await runStep("Checking Docker running", checkDockerRunning);
  await runStep("Checking port 5432", checkPort5432Free);
  await runStep("Checking SSH access to GitHub", checkSSH);
  await runStep("Ensuring pnpm", ensurePnpm);
  await runStep(`Cloning into ./${name}`, () => cloneRepo(name));
  const projectDir = join(process.cwd(), name);
  await runStep("Installing dependencies", () => installDeps(projectDir));
  const envPath = join(projectDir, ".env");
  let shouldWriteEnv = true;
  if (existsSync3(envPath)) {
    const overwrite = await clack2.confirm({
      message: ".env already exists. Overwrite?",
      initialValue: false
    });
    if (clack2.isCancel(overwrite)) abort("Aborted.");
    shouldWriteEnv = overwrite;
  }
  if (shouldWriteEnv) {
    const resend = await clack2.confirm({ message: "Set up Resend (email)?", initialValue: false });
    if (clack2.isCancel(resend)) abort("Aborted.");
    const stripe = await clack2.confirm({ message: "Set up Stripe (payments)?", initialValue: false });
    if (clack2.isCancel(stripe)) abort("Aborted.");
    const googleOAuth = await clack2.confirm({ message: "Set up Google OAuth?", initialValue: false });
    if (clack2.isCancel(googleOAuth)) abort("Aborted.");
    const s3 = await clack2.confirm({ message: "Set up S3 (file storage)?", initialValue: false });
    if (clack2.isCancel(s3)) abort("Aborted.");
    const githubFeedback = await clack2.confirm({
      message: "Set up GitHub Feedback?",
      initialValue: false
    });
    if (clack2.isCancel(githubFeedback)) abort("Aborted.");
    const content = buildEnvContent({
      resend,
      stripe,
      googleOAuth,
      s3,
      githubFeedback
    });
    writeFileSync(envPath, content);
    clack2.log.success(".env written");
  }
  await runStep("Starting Docker services", () => composeUp(projectDir));
  await runStep("Running migrations", () => runMigrations(projectDir));
  const createAdmin = await clack2.confirm({
    message: "Create initial admin user?",
    initialValue: true
  });
  if (clack2.isCancel(createAdmin)) abort("Aborted.");
  if (createAdmin) {
    const email = await clack2.text({
      message: "Admin email:",
      validate: (v) => v.includes("@") ? void 0 : "Enter a valid email"
    });
    if (clack2.isCancel(email)) abort("Aborted.");
    let password2;
    while (true) {
      const pw = await clack2.password({ message: "Admin password (min 8 chars):" });
      if (clack2.isCancel(pw)) abort("Aborted.");
      if (pw.length < 8) {
        clack2.log.warn("Password must be at least 8 characters.");
        continue;
      }
      const confirm2 = await clack2.password({ message: "Confirm password:" });
      if (clack2.isCancel(confirm2)) abort("Aborted.");
      if (confirm2 !== pw) {
        clack2.log.warn("Passwords do not match. Try again.");
        continue;
      }
      password2 = pw;
      break;
    }
    await runStep("Creating admin user", () => seedAdmin(projectDir, email, password2));
  }
  clack2.outro(`Done! Run: cd ${name} && pnpm dev`);
}

// src/index.ts
var program = new Command();
program.name("vanta").description("Bootstrap vanta-base-admin for new team members").version("1.0.0");
program.command("init [name]").description("Full local environment bootstrap").action((name = "vanta-base-admin") => {
  init(name).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
});
program.command("doctor").description("Read-only environment health check").action(() => {
  doctor().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
});
program.parse();
