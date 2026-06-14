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

export async function composeUp(cwd: string): Promise<void> {
  await run("docker", ["compose", "up", "-d"], cwd);
}

export async function waitForPostgres(
  cwd: string,
  retries = 20,
  delayMs = 1000,
): Promise<void> {
  // Verify Docker actually owns port 5432 on the host (not just that the
  // container is running — it can run with the port binding silently failed
  // if a local Postgres process reclaimed 5432 after the kill)
  const { stdout: portOut } = await run(
    "docker",
    ["compose", "port", "postgres", "5432"],
    cwd,
  ).catch(() => ({ stdout: "" }));
  if (!portOut.trim()) {
    throw new Error(
      "Docker Postgres could not bind port 5432 — a local Postgres process " +
        "reclaimed it after the kill (launchd auto-restart). " +
        "Stop it with: brew services stop postgresql && lsof -ti :5432 | xargs kill -9\n" +
        "Then re-run: vanta init",
    );
  }

  for (let i = 0; i < retries; i++) {
    try {
      await run("pg_isready", [
        "-h",
        "127.0.0.1",
        "-p",
        "5432",
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
): Promise<void> {
  // docker-compose.yml uses POSTGRES_DB: praxor_kit (legacy name) so the
  // target database must be created explicitly before migrations run
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
  ).catch(() => {
    // "already exists" is fine — ignore
  });
}

export async function runMigrations(cwd: string): Promise<void> {
  await run("pnpm", ["db:migrate"], cwd);
}

export async function seedAdmin(
  cwd: string,
  email: string,
  password: string,
): Promise<void> {
  await run("pnpm", ["db:seed", "--email", email, "--password", password], cwd);
}
