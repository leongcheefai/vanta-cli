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
  for (let i = 0; i < retries; i++) {
    try {
      await run(
        "docker",
        ["compose", "exec", "postgres", "pg_isready", "-U", "postgres"],
        cwd,
      );
      return;
    } catch {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error(
    "Postgres did not become ready in time. Check: docker compose logs postgres",
  );
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
