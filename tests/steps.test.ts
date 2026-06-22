import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("fs", () => ({ existsSync: vi.fn() }));
vi.mock("../src/lib/exec.js", () => ({
  run: vi.fn(),
  runInherit: vi.fn(),
}));

import { existsSync } from "node:fs";
import { run, runInherit } from "../src/lib/exec.js";
import {
  buildSupabaseDbUrl,
  cloneRepo,
  composeUp,
  createSupabaseOrg,
  createSupabaseProject,
  installDeps,
  installRailwayCli,
  installSupabaseCli,
  installVercelCli,
  listSupabaseOrgs,
  pushVercelEnv,
  railwayDeploy,
  runMigrations,
  seedAdmin,
  vercelDeploy,
  waitForPostgres,
  waitForSupabaseProject,
} from "../src/lib/steps.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("cloneRepo", () => {
  it("skips git clone when directory already exists", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    await cloneRepo("vanta-base-admin");
    expect(run).not.toHaveBeenCalled();
  });

  it("runs git clone when directory does not exist", async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(run).mockResolvedValue({ stdout: "", stderr: "" });
    await cloneRepo("vanta-base-admin");
    expect(run).toHaveBeenCalledWith("git", [
      "clone",
      "git@github.com:leongcheefai/vanta-base-admin.git",
      "vanta-base-admin",
    ]);
  });

  it("uses custom name in clone target", async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(run).mockResolvedValue({ stdout: "", stderr: "" });
    await cloneRepo("my-project");
    expect(run).toHaveBeenCalledWith("git", [
      "clone",
      "git@github.com:leongcheefai/vanta-base-admin.git",
      "my-project",
    ]);
  });
});

describe("installDeps", () => {
  it("runs pnpm install in given cwd", async () => {
    vi.mocked(run).mockResolvedValue({ stdout: "", stderr: "" });
    await installDeps("/some/project");
    expect(run).toHaveBeenCalledWith("pnpm", ["install"], "/some/project");
  });
});

describe("composeUp", () => {
  it("runs docker compose up -d with default port env", async () => {
    vi.mocked(run).mockResolvedValue({ stdout: "", stderr: "" });
    await composeUp("/some/project");
    expect(run).toHaveBeenCalledWith(
      "docker",
      ["compose", "up", "-d"],
      "/some/project",
      { POSTGRES_PORT: "5432" },
    );
  });

  it("passes custom port as POSTGRES_PORT env", async () => {
    vi.mocked(run).mockResolvedValue({ stdout: "", stderr: "" });
    await composeUp("/some/project", 5433);
    expect(run).toHaveBeenCalledWith(
      "docker",
      ["compose", "up", "-d"],
      "/some/project",
      { POSTGRES_PORT: "5433" },
    );
  });
});

describe("waitForPostgres", () => {
  it("uses the given port in pg_isready", async () => {
    vi.mocked(run)
      .mockResolvedValueOnce({ stdout: "0.0.0.0:5433", stderr: "" }) // docker compose port
      .mockResolvedValueOnce({ stdout: "", stderr: "" }); // pg_isready
    await waitForPostgres("/some/project", 5433);
    expect(run).toHaveBeenCalledWith("pg_isready", [
      "-h",
      "127.0.0.1",
      "-p",
      "5433",
      "-U",
      "postgres",
    ]);
  });

  it("throws when docker compose port returns empty (no host binding)", async () => {
    vi.mocked(run).mockResolvedValueOnce({ stdout: "", stderr: "" });
    await expect(waitForPostgres("/some/project", 5433)).rejects.toThrow(
      "Docker Postgres could not bind host port",
    );
  });
});

describe("runMigrations", () => {
  it("runs pnpm db:migrate in given cwd", async () => {
    vi.mocked(run).mockResolvedValue({ stdout: "", stderr: "" });
    await runMigrations("/some/project");
    expect(run).toHaveBeenCalledWith(
      "pnpm",
      ["db:migrate"],
      "/some/project",
      undefined,
    );
  });

  it("passes DATABASE_URL env when databaseUrl provided", async () => {
    vi.mocked(run).mockResolvedValue({ stdout: "", stderr: "" });
    await runMigrations(
      "/some/project",
      "postgresql://postgres:pass@db.ref.supabase.co:5432/postgres",
    );
    expect(run).toHaveBeenCalledWith("pnpm", ["db:migrate"], "/some/project", {
      DATABASE_URL:
        "postgresql://postgres:pass@db.ref.supabase.co:5432/postgres",
    });
  });
});

describe("seedAdmin", () => {
  it("runs pnpm db:seed with email and password", async () => {
    vi.mocked(run).mockResolvedValue({ stdout: "", stderr: "" });
    await seedAdmin("/some/project", "admin@example.com", "supersecret");
    expect(run).toHaveBeenCalledWith(
      "pnpm",
      ["db:seed", "--email", "admin@example.com", "--password", "supersecret"],
      "/some/project",
      undefined,
    );
  });

  it("passes DATABASE_URL env when databaseUrl provided", async () => {
    vi.mocked(run).mockResolvedValue({ stdout: "", stderr: "" });
    await seedAdmin(
      "/some/project",
      "admin@example.com",
      "supersecret",
      "postgresql://postgres:pass@db.ref.supabase.co:5432/postgres",
    );
    expect(run).toHaveBeenCalledWith(
      "pnpm",
      ["db:seed", "--email", "admin@example.com", "--password", "supersecret"],
      "/some/project",
      {
        DATABASE_URL:
          "postgresql://postgres:pass@db.ref.supabase.co:5432/postgres",
      },
    );
  });
});

describe("installVercelCli", () => {
  it("runs pnpm add -g vercel", async () => {
    vi.mocked(run).mockResolvedValue({ stdout: "", stderr: "" });
    await installVercelCli();
    expect(run).toHaveBeenCalledWith("pnpm", ["add", "-g", "vercel"]);
  });
});

describe("vercelDeploy", () => {
  it("returns the last https:// line from stdout", async () => {
    vi.mocked(run).mockResolvedValue({
      stdout:
        "Deploying...\nInspect: https://vercel.com/inspect/abc\nhttps://my-app.vercel.app",
      stderr: "",
    });
    await expect(vercelDeploy("/some/project")).resolves.toBe(
      "https://my-app.vercel.app",
    );
  });

  it("throws when stdout contains no https:// URL", async () => {
    vi.mocked(run).mockResolvedValue({
      stdout: "Deploying...\nDone.",
      stderr: "",
    });
    await expect(vercelDeploy("/some/project")).rejects.toThrow(
      "Could not extract deployment URL",
    );
  });
});

describe("pushVercelEnv", () => {
  it("calls vercel env add with key, production environment, and value as stdin input", async () => {
    vi.mocked(run).mockResolvedValue({ stdout: "", stderr: "" });
    await pushVercelEnv("BETTER_AUTH_SECRET", "mysecret", "/some/project");
    expect(run).toHaveBeenCalledWith(
      "vercel",
      ["env", "add", "BETTER_AUTH_SECRET", "production"],
      "/some/project",
      undefined,
      "mysecret",
    );
  });
});

describe("installRailwayCli", () => {
  it("runs pnpm add -g @railway/cli", async () => {
    vi.mocked(run).mockResolvedValue({ stdout: "", stderr: "" });
    await installRailwayCli();
    expect(run).toHaveBeenCalledWith("pnpm", ["add", "-g", "@railway/cli"]);
  });
});

describe("railwayDeploy", () => {
  it("runs init → add (service + vars) → up --detach → domain and returns https URL", async () => {
    vi.mocked(runInherit).mockResolvedValue(); // railway init
    vi.mocked(run)
      .mockResolvedValueOnce({ stdout: "", stderr: "" }) // railway add
      .mockResolvedValueOnce({ stdout: "", stderr: "" }) // railway up --detach
      .mockResolvedValueOnce({
        stdout: JSON.stringify({ domain: "my-api.railway.app" }),
        stderr: "",
      }); // domain
    const url = await railwayDeploy("my-project", "/some/project");
    expect(runInherit).toHaveBeenCalledWith(
      "railway",
      ["init", "--name", "my-project"],
      "/some/project",
    );
    expect(run).toHaveBeenCalledWith(
      "railway",
      [
        "add",
        "--service",
        "my-project",
        "--variables",
        expect.stringMatching(/^DATABASE_URL=postgresql:\/\//),
        "--variables",
        expect.stringMatching(/^BETTER_AUTH_SECRET=.{32,}/),
      ],
      "/some/project",
    );
    expect(run).toHaveBeenCalledWith(
      "railway",
      ["up", "--detach", "--service", "my-project"],
      "/some/project",
    );
    expect(run).toHaveBeenLastCalledWith(
      "railway",
      ["domain", "--service", "my-project", "--json", "--port", "3000"],
      "/some/project",
    );
    expect(url).toBe("https://my-api.railway.app");
  });

  it("prepends https:// when domain has no scheme", async () => {
    vi.mocked(runInherit).mockResolvedValue();
    vi.mocked(run)
      .mockResolvedValueOnce({ stdout: "", stderr: "" }) // add
      .mockResolvedValueOnce({ stdout: "", stderr: "" }) // up --detach
      .mockResolvedValueOnce({
        stdout: JSON.stringify({ domain: "my-api.railway.app" }),
        stderr: "",
      });
    await expect(railwayDeploy("my-project", "/some/project")).resolves.toBe(
      "https://my-api.railway.app",
    );
  });

  it("returns URL as-is when domain already has https scheme", async () => {
    vi.mocked(runInherit).mockResolvedValue();
    vi.mocked(run)
      .mockResolvedValueOnce({ stdout: "", stderr: "" }) // add
      .mockResolvedValueOnce({ stdout: "", stderr: "" }) // up --detach
      .mockResolvedValueOnce({
        stdout: JSON.stringify({ domain: "https://my-api.railway.app" }),
        stderr: "",
      });
    await expect(railwayDeploy("my-project", "/some/project")).resolves.toBe(
      "https://my-api.railway.app",
    );
  });

  it("falls back to https:// line scan when domain output is not JSON", async () => {
    vi.mocked(runInherit).mockResolvedValue();
    vi.mocked(run)
      .mockResolvedValueOnce({ stdout: "", stderr: "" }) // add
      .mockResolvedValueOnce({ stdout: "", stderr: "" }) // up --detach
      .mockResolvedValueOnce({
        stdout: "Generating domain...\nhttps://my-api.railway.app",
        stderr: "",
      });
    await expect(railwayDeploy("my-project", "/some/project")).resolves.toBe(
      "https://my-api.railway.app",
    );
  });

  it("throws when domain cannot be extracted", async () => {
    vi.mocked(runInherit).mockResolvedValue();
    vi.mocked(run)
      .mockResolvedValueOnce({ stdout: "", stderr: "" }) // add
      .mockResolvedValueOnce({ stdout: "", stderr: "" }) // up --detach
      .mockResolvedValueOnce({ stdout: "{}", stderr: "" });
    await expect(railwayDeploy("my-project", "/some/project")).rejects.toThrow(
      "Could not extract Railway domain from output.",
    );
  });

  it("uses real databaseUrl in --variables when provided", async () => {
    const realUrl =
      "postgresql://postgres:secret@db.abc123.supabase.co:5432/postgres";
    vi.mocked(runInherit).mockResolvedValue();
    vi.mocked(run)
      .mockResolvedValueOnce({ stdout: "", stderr: "" }) // add
      .mockResolvedValueOnce({ stdout: "", stderr: "" }) // up --detach
      .mockResolvedValueOnce({
        stdout: JSON.stringify({ domain: "my-api.railway.app" }),
        stderr: "",
      });
    await railwayDeploy("my-project", "/some/project", realUrl);
    expect(run).toHaveBeenCalledWith(
      "railway",
      [
        "add",
        "--service",
        "my-project",
        "--variables",
        `DATABASE_URL=${realUrl}`,
        "--variables",
        expect.stringMatching(/^BETTER_AUTH_SECRET=.{32,}/),
      ],
      "/some/project",
    );
  });
});

describe("installSupabaseCli", () => {
  it("runs pnpm add -g supabase", async () => {
    vi.mocked(run).mockResolvedValue({ stdout: "", stderr: "" });
    await installSupabaseCli();
    expect(run).toHaveBeenCalledWith("pnpm", ["add", "-g", "supabase"]);
  });
});

// Supabase CLI uses plain ASCII | separator, no border pipes
const ORGS_TABLE = [
  " ID      | NAME     ",
  "---------|----------",
  " org-1   | Acme Corp",
  " org-2   | Beta Inc ",
].join("\n");

// Real format: LINKED(empty) | ORG_ID | REFERENCE_ID | NAME | REGION | CREATED_AT
// Empty LINKED column filtered out → cols[0]=ORG_ID, cols[1]=REF, cols[2]=NAME
const PROJECTS_TABLE = [
  " LINKED | ORG ID   | REFERENCE ID       | NAME       | REGION         | CREATED AT (UTC)    ",
  "--------|----------|--------------------|------------|----------------|---------------------",
  "        | org-aaa  | abcdefghijklmnop   | my-project | ap-southeast-1 | 2026-01-01 00:00:00 ",
  "        | org-bbb  | zyxwvutsrqponml    | other-proj | us-east-1      | 2026-01-02 00:00:00 ",
].join("\n");

describe("listSupabaseOrgs", () => {
  it("parses supabase orgs list table and returns id+name pairs", async () => {
    vi.mocked(run).mockResolvedValue({ stdout: ORGS_TABLE, stderr: "" });
    await expect(listSupabaseOrgs()).resolves.toEqual([
      { id: "org-1", name: "Acme Corp" },
      { id: "org-2", name: "Beta Inc" },
    ]);
    expect(run).toHaveBeenCalledWith("supabase", ["orgs", "list"]);
  });

  it("returns empty array when table has no data rows", async () => {
    vi.mocked(run).mockResolvedValue({
      stdout: " ID | NAME\n----|-----",
      stderr: "",
    });
    await expect(listSupabaseOrgs()).resolves.toEqual([]);
  });
});

describe("createSupabaseOrg", () => {
  it("diffs before/after orgs list to return new org id", async () => {
    const beforeTable = [
      " ID      | NAME     ",
      "---------|----------",
      " org-1   | Acme Corp",
    ].join("\n");
    const afterTable = [
      " ID      | NAME     ",
      "---------|----------",
      " org-1   | Acme Corp",
      " org-new | Beta Inc ",
    ].join("\n");
    vi.mocked(run)
      .mockResolvedValueOnce({ stdout: beforeTable, stderr: "" }) // orgs list (before)
      .mockResolvedValueOnce({ stdout: "", stderr: "" }) // orgs create
      .mockResolvedValueOnce({ stdout: afterTable, stderr: "" }); // orgs list (after)
    await expect(createSupabaseOrg("Beta Inc")).resolves.toBe("org-new");
    expect(run).toHaveBeenCalledWith(
      "supabase",
      ["orgs", "create", "Beta Inc"],
      undefined,
      undefined,
      "Beta Inc\n",
    );
  });

  it("throws when no new org appears in list after creation", async () => {
    vi.mocked(run)
      .mockResolvedValueOnce({ stdout: ORGS_TABLE, stderr: "" }) // orgs list (before)
      .mockResolvedValueOnce({ stdout: "", stderr: "" }) // orgs create
      .mockResolvedValueOnce({ stdout: ORGS_TABLE, stderr: "" }); // orgs list (after — same)
    await expect(createSupabaseOrg("Ghost Org")).rejects.toThrow(
      "could not detect it in list",
    );
  });
});

describe("createSupabaseProject", () => {
  it("runs projects create then lists to return ref", async () => {
    vi.mocked(run)
      .mockResolvedValueOnce({ stdout: "", stderr: "" }) // projects create
      .mockResolvedValueOnce({ stdout: PROJECTS_TABLE, stderr: "" }); // projects list
    await expect(
      createSupabaseProject(
        "org-1",
        "my-project",
        "secretpass",
        "ap-southeast-1",
      ),
    ).resolves.toBe("abcdefghijklmnop");
    expect(run).toHaveBeenCalledWith("supabase", [
      "projects",
      "create",
      "my-project",
      "--org-id",
      "org-1",
      "--db-password",
      "secretpass",
      "--region",
      "ap-southeast-1",
    ]);
    expect(run).toHaveBeenCalledWith("supabase", ["projects", "list"]);
  });

  it("throws when project ref cannot be found after creation", async () => {
    vi.mocked(run)
      .mockResolvedValueOnce({ stdout: "", stderr: "" }) // projects create
      .mockResolvedValueOnce({ stdout: PROJECTS_TABLE, stderr: "" }); // projects list
    await expect(
      createSupabaseProject("org-1", "unknown", "pass", "us-east-1"),
    ).rejects.toThrow(
      'Could not find ref for project "unknown" after creation.',
    );
  });
});

describe("waitForSupabaseProject", () => {
  it("resolves when pg_isready succeeds on first try", async () => {
    vi.mocked(run).mockResolvedValue({ stdout: "", stderr: "" });
    await expect(
      waitForSupabaseProject("abcdefghijklmnop", 3, 0),
    ).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledWith("pg_isready", [
      "-h",
      "db.abcdefghijklmnop.supabase.co",
      "-p",
      "5432",
      "-U",
      "postgres",
    ]);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("polls until pg_isready succeeds", async () => {
    vi.mocked(run)
      .mockRejectedValueOnce(new Error("not ready"))
      .mockResolvedValueOnce({ stdout: "", stderr: "" });
    await expect(
      waitForSupabaseProject("abcdefghijklmnop", 5, 0),
    ).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("throws when pg_isready never succeeds within retries", async () => {
    vi.mocked(run).mockRejectedValue(new Error("connection refused"));
    await expect(
      waitForSupabaseProject("abcdefghijklmnop", 2, 0),
    ).rejects.toThrow("Supabase project did not become ready in time");
  });
});

describe("buildSupabaseDbUrl", () => {
  it("builds correct postgresql URL", () => {
    expect(buildSupabaseDbUrl("abcdefghijklmnop", "mypassword")).toBe(
      "postgresql://postgres:mypassword@db.abcdefghijklmnop.supabase.co:5432/postgres",
    );
  });

  it("percent-encodes special chars in password", () => {
    expect(buildSupabaseDbUrl("ref123", "p@ss:w/rd")).toBe(
      "postgresql://postgres:p%40ss%3Aw%2Frd@db.ref123.supabase.co:5432/postgres",
    );
  });
});
