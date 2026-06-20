import { existsSync } from "node:fs";
import { run } from "./exec.js";

const REPO_URL = "git@github.com:leongcheefai/vanta-base-admin.git";

export async function cloneRepo(name: string): Promise<void> {
  if (existsSync(name)) return;
  await run("git", ["clone", REPO_URL, name]);
}

export async function installDeps(cwd: string): Promise<void> {
  await run("pnpm", ["install"], cwd);
}

export async function composeUp(cwd: string, port = 5432): Promise<void> {
  await run("docker", ["compose", "up", "-d"], cwd, {
    POSTGRES_PORT: String(port),
  });
}

export async function waitForPostgres(
  cwd: string,
  port = 5432,
  retries = 20,
  delayMs = 1000,
): Promise<void> {
  const portEnv = { POSTGRES_PORT: String(port) };
  // Verify Docker actually owns a host port for the container's 5432
  const { stdout: portOut } = await run(
    "docker",
    ["compose", "port", "postgres", "5432"],
    cwd,
    portEnv,
  ).catch(() => ({ stdout: "" }));
  const boundPort = portOut.trim();
  if (!boundPort || boundPort === "invalid IP:0" || boundPort.endsWith(":0")) {
    throw new Error(
      `Docker Postgres could not bind host port ${port} — it may already be in use. Check: docker compose logs postgres`,
    );
  }

  for (let i = 0; i < retries; i++) {
    try {
      await run("pg_isready", [
        "-h",
        "127.0.0.1",
        "-p",
        String(port),
        "-U",
        "postgres",
      ]);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error(
    "Postgres did not become ready in time. Check: docker compose logs postgres",
  );
}

export async function ensureDatabase(
  cwd: string,
  dbName = "vanta_base_admin",
  port = 5432,
): Promise<void> {
  await run(
    "docker",
    [
      "compose",
      "exec",
      "postgres",
      "psql",
      "-U",
      "postgres",
      "-c",
      `CREATE DATABASE "${dbName}";`,
    ],
    cwd,
    { POSTGRES_PORT: String(port) },
  ).catch((err: unknown) => {
    if (!String(err).includes("already exists")) throw err;
  });
}

export async function runMigrations(cwd: string): Promise<void> {
  await run("pnpm", ["db:migrate"], cwd);
}

export async function installVercelCli(): Promise<void> {
  await run("pnpm", ["add", "-g", "vercel"]);
}

export async function vercelDeploy(cwd: string): Promise<string> {
  const { stdout } = await run("vercel", ["--prod", "--yes"], cwd);
  const lines = stdout.trim().split("\n");
  const url = lines.reverse().find((l) => l.startsWith("https://"));
  if (!url)
    throw new Error("Could not extract deployment URL from vercel output.");
  return url;
}

export async function pushVercelEnv(
  key: string,
  value: string,
  cwd: string,
): Promise<void> {
  await run("vercel", ["env", "add", key, "production"], cwd, undefined, value);
}

export async function seedAdmin(
  cwd: string,
  email: string,
  password: string,
): Promise<void> {
  await run("pnpm", ["db:seed", "--email", email, "--password", password], cwd);
}
