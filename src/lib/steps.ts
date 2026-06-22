import { existsSync } from "node:fs";
import { run, runInherit } from "./exec.js";

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

export async function runMigrations(
  cwd: string,
  databaseUrl?: string,
): Promise<void> {
  await run(
    "pnpm",
    ["db:migrate"],
    cwd,
    databaseUrl ? { DATABASE_URL: databaseUrl } : undefined,
  );
}

export async function installVercelCli(): Promise<void> {
  await run("pnpm", ["add", "-g", "vercel"]);
}

export async function vercelLogin(): Promise<void> {
  await runInherit("vercel", ["login"]);
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

export async function installRailwayCli(): Promise<void> {
  await run("pnpm", ["add", "-g", "@railway/cli"]);
}

export async function railwayLogin(): Promise<void> {
  await runInherit("railway", ["login"]);
}

// Placeholder env vars so the deployed NestJS app passes zod validation at
// startup. The user must replace these with real values in the Railway
// dashboard (Variables tab) before the backend is usable.
const RAILWAY_PLACEHOLDER_VARS = [
  "DATABASE_URL=postgresql://postgres:placeholder@placeholder:5432/railway",
  "BETTER_AUTH_SECRET=change-me-to-a-real-secret-min-32-chars!!",
];

export async function railwayDeploy(
  name: string,
  cwd: string,
  databaseUrl?: string,
): Promise<string> {
  await runInherit("railway", ["init", "--name", name], cwd);
  // Create the service WITH env vars BEFORE deploying any code. railway add
  // creates the service and sets its variables in one shot, so the first
  // deploy boots healthy — no crash, and no "Cannot redeploy without a
  // snapshot" error from setting variables on a service that has never
  // successfully deployed.
  const vars = databaseUrl
    ? [`DATABASE_URL=${databaseUrl}`, RAILWAY_PLACEHOLDER_VARS[1]]
    : RAILWAY_PLACEHOLDER_VARS;
  const addArgs = ["add", "--service", name];
  for (const v of vars) addArgs.push("--variables", v);
  await run("railway", addArgs, cwd);
  // Fresh deploy into the service that already has its vars. --detach uploads
  // and triggers the deploy without streaming build/deploy logs. This is a
  // brand-new deployment (creates a snapshot), not a redeploy, so --detach is
  // safe here.
  await run("railway", ["up", "--detach", "--service", name], cwd);
  const { stdout } = await run(
    "railway",
    ["domain", "--service", name, "--json", "--port", "3000"],
    cwd,
  );
  let domain: string | undefined;
  try {
    const parsed = JSON.parse(stdout);
    domain = parsed.domain ?? parsed.url;
  } catch {
    // fall back to scanning for https:// line if output is not JSON
    const lines = stdout.trim().split("\n");
    domain = lines.find((l) => l.startsWith("https://"));
  }
  if (!domain) throw new Error("Could not extract Railway domain from output.");
  return domain.startsWith("http") ? domain : `https://${domain}`;
}

export async function seedAdmin(
  cwd: string,
  email: string,
  password: string,
  databaseUrl?: string,
): Promise<void> {
  await run(
    "pnpm",
    ["db:seed", "--email", email, "--password", password],
    cwd,
    databaseUrl ? { DATABASE_URL: databaseUrl } : undefined,
  );
}

export async function installSupabaseCli(): Promise<void> {
  await run("pnpm", ["add", "-g", "supabase"]);
}

export async function supabaseLogin(): Promise<void> {
  await runInherit("supabase", ["login"]);
}

export async function listSupabaseOrgs(): Promise<
  { id: string; name: string }[]
> {
  const { stdout } = await run("supabase", ["orgs", "list", "--json"]);
  const orgs = JSON.parse(stdout) as { id: string; name: string }[];
  return orgs.map((o) => ({ id: o.id, name: o.name }));
}

export async function createSupabaseOrg(name: string): Promise<string> {
  const { stdout } = await run("supabase", ["orgs", "create", name, "--json"]);
  const org = JSON.parse(stdout) as { id: string };
  return org.id;
}

export async function createSupabaseProject(
  orgId: string,
  name: string,
  password: string,
  region: string,
): Promise<string> {
  const { stdout } = await run("supabase", [
    "projects",
    "create",
    name,
    "--org-id",
    orgId,
    "--db-password",
    password,
    "--region",
    region,
    "--json",
  ]);
  const project = JSON.parse(stdout) as { id?: string; ref?: string };
  const ref = project.ref ?? project.id;
  if (!ref)
    throw new Error("Could not extract project ref from Supabase output.");
  return ref;
}

export async function waitForSupabaseProject(
  ref: string,
  retries = 60,
  delayMs = 5000,
): Promise<void> {
  for (let i = 0; i < retries; i++) {
    const { stdout } = await run("supabase", [
      "projects",
      "get",
      ref,
      "--json",
    ]);
    const project = JSON.parse(stdout) as { status?: string };
    if (project.status === "ACTIVE_HEALTHY") return;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(
    "Supabase project did not become ready in time. Check the Supabase dashboard.",
  );
}

export function buildSupabaseDbUrl(ref: string, password: string): string {
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
}
