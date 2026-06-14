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
  // Verify the container is actually running (not exited due to port conflict)
  const { stdout } = await run(
    "docker",
    ["compose", "ps", "postgres", "--status", "running", "--format", "{{.Name}}"],
    cwd,
  ).catch(() => ({ stdout: "" }));
  if (!stdout.trim()) {
    throw new Error(
      "Postgres container failed to start. Port 5432 may still be in use by another process. Check: docker compose logs postgres",
    );
  }

  // Poll via host port so we validate the port mapping is actually reachable
  for (let i = 0; i < retries; i++) {
    try {
      await run("pg_isready", ["-h", "127.0.0.1", "-p", "5432", "-U", "postgres"]);
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
