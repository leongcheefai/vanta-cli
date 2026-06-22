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

describe("listSupabaseOrgs", () => {
  it("returns parsed org list", async () => {
    vi.mocked(run).mockResolvedValue({
      stdout: JSON.stringify([
        { id: "org-1", name: "Acme" },
        { id: "org-2", name: "Beta" },
      ]),
      stderr: "",
    });
    await expect(listSupabaseOrgs()).resolves.toEqual([
      { id: "org-1", name: "Acme" },
      { id: "org-2", name: "Beta" },
    ]);
    expect(run).toHaveBeenCalledWith("supabase", ["orgs", "list", "--json"]);
  });
});

describe("createSupabaseOrg", () => {
  it("returns org id from JSON output", async () => {
    vi.mocked(run).mockResolvedValue({
      stdout: JSON.stringify({ id: "new-org-id", name: "My Org" }),
      stderr: "",
    });
    await expect(createSupabaseOrg("My Org")).resolves.toBe("new-org-id");
    expect(run).toHaveBeenCalledWith("supabase", [
      "orgs",
      "create",
      "My Org",
      "--json",
    ]);
  });
});

describe("createSupabaseProject", () => {
  it("returns project ref from JSON output (ref field)", async () => {
    vi.mocked(run).mockResolvedValue({
      stdout: JSON.stringify({ ref: "abcdefghijklmnop", name: "my-project" }),
      stderr: "",
    });
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
      "--json",
    ]);
  });

  it("falls back to id field when ref is absent", async () => {
    vi.mocked(run).mockResolvedValue({
      stdout: JSON.stringify({ id: "abcdefghijklmnop" }),
      stderr: "",
    });
    await expect(
      createSupabaseProject("org-1", "my-project", "secretpass", "us-east-1"),
    ).resolves.toBe("abcdefghijklmnop");
  });

  it("throws when neither ref nor id present", async () => {
    vi.mocked(run).mockResolvedValue({ stdout: "{}", stderr: "" });
    await expect(
      createSupabaseProject("org-1", "my-project", "secretpass", "us-east-1"),
    ).rejects.toThrow("Could not extract project ref");
  });
});

describe("waitForSupabaseProject", () => {
  it("resolves immediately when project is ACTIVE_HEALTHY", async () => {
    vi.mocked(run).mockResolvedValue({
      stdout: JSON.stringify({ status: "ACTIVE_HEALTHY" }),
      stderr: "",
    });
    await expect(
      waitForSupabaseProject("ref123", 3, 0),
    ).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("polls until ACTIVE_HEALTHY", async () => {
    vi.mocked(run)
      .mockResolvedValueOnce({
        stdout: JSON.stringify({ status: "COMING_UP" }),
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({ status: "ACTIVE_HEALTHY" }),
        stderr: "",
      });
    await expect(
      waitForSupabaseProject("ref123", 5, 0),
    ).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("throws when project never becomes ready", async () => {
    vi.mocked(run).mockResolvedValue({
      stdout: JSON.stringify({ status: "COMING_UP" }),
      stderr: "",
    });
    await expect(waitForSupabaseProject("ref123", 2, 0)).rejects.toThrow(
      "Supabase project did not become ready in time",
    );
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
