import { existsSync } from "node:fs";
import { run, runInherit } from "./exec.js";

// Parse a |-separated table output from the Supabase CLI into rows of columns.
// Skips the header row and divider lines (------|------).
function parseSupabaseTable(stdout: string): string[][] {
  const SEP = "|"; // regular ASCII pipe used by supabase CLI
  return stdout
    .split("\n")
    .filter((l) => l.includes(SEP) && !/^[-|+\s]+$/.test(l.trim()))
    .slice(1) // drop header row (ID | NAME | ...)
    .map((l) =>
      l
        .split(SEP)
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    )
    .filter((cols) => cols.length > 0);
}

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
  const { stdout } = await run("supabase", ["orgs", "list"]);
  return parseSupabaseTable(stdout)
    .filter((cols) => cols.length >= 2 && cols[0] && cols[1])
    .map((cols) => ({ id: cols[0], name: cols[1] }));
}

export async function createSupabaseOrg(name: string): Promise<string> {
  // Snapshot existing org IDs before creation so we can find the new one by
  // diff rather than name-match (CLI may slugify or trim the display name).
  const before = await listSupabaseOrgs();
  const beforeIds = new Set(before.map((o) => o.id));
  try {
    await run(
      "supabase",
      ["orgs", "create", name],
      undefined,
      undefined,
      `${name}\n`,
    );
  } catch (err: unknown) {
    const raw = (err as { stderr?: string })?.stderr ?? "";
    const match = raw.match(/"message"\s*:\s*"([^"]+)"/);
    throw new Error(
      match ? match[1] : `supabase orgs create failed: ${raw || String(err)}`,
    );
  }
  // Find the org that wasn't in the before-snapshot.
  const after = await listSupabaseOrgs();
  const newOrg = after.find((o) => !beforeIds.has(o.id));
  if (!newOrg)
    throw new Error(
      `Org "${name}" created in Supabase but could not detect it in list. Run "supabase orgs list" to verify.`,
    );
  return newOrg.id;
}

export async function createSupabaseProject(
  orgId: string,
  name: string,
  password: string,
  region: string,
): Promise<string> {
  try {
    await run("supabase", [
      "projects",
      "create",
      name,
      "--org-id",
      orgId,
      "--db-password",
      password,
      "--region",
      region,
    ]);
  } catch (err: unknown) {
    // Extract the human-readable message from Supabase CLI's JSON stderr output
    const raw = (err as { stderr?: string; stdout?: string })?.stderr ?? "";
    const match = raw.match(/"message"\s*:\s*"([^"]+)"/);
    throw new Error(
      match
        ? match[1]
        : `supabase projects create failed: ${raw || String(err)}`,
    );
  }
  // columns after empty-filter: [ORG_ID, REFERENCE_ID, NAME, REGION, CREATED_AT]
  const { stdout } = await run("supabase", ["projects", "list"]);
  const rows = parseSupabaseTable(stdout).filter((cols) => cols.length >= 3);
  const project = rows.find((cols) => cols[2] === name);
  if (!project)
    throw new Error(`Could not find ref for project "${name}" after creation.`);
  return project[1]; // REFERENCE ID
}

export async function waitForSupabaseProject(
  ref: string,
  retries = 60,
  delayMs = 5000,
): Promise<void> {
  // projects list has no STATUS column — poll via pg_isready instead
  const host = `db.${ref}.supabase.co`;
  for (let i = 0; i < retries; i++) {
    try {
      await run("pg_isready", ["-h", host, "-p", "5432", "-U", "postgres"]);
      return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(
    "Supabase project did not become ready in time. Check the Supabase dashboard.",
  );
}

export function buildSupabaseDbUrl(ref: string, password: string): string {
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres?sslmode=require`;
}
