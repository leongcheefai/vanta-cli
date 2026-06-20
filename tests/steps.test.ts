import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("fs", () => ({ existsSync: vi.fn() }));
vi.mock("../src/lib/exec.js", () => ({
  run: vi.fn(),
  runInherit: vi.fn(),
}));

import { existsSync } from "node:fs";
import { run } from "../src/lib/exec.js";
import {
  cloneRepo,
  composeUp,
  installDeps,
  installRailwayCli,
  installVercelCli,
  pushVercelEnv,
  railwayDeploy,
  runMigrations,
  seedAdmin,
  vercelDeploy,
  waitForPostgres,
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
    expect(run).toHaveBeenCalledWith("pnpm", ["db:migrate"], "/some/project");
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
  it("runs init → up → domain in sequence and returns https URL", async () => {
    vi.mocked(run)
      .mockResolvedValueOnce({ stdout: "", stderr: "" }) // railway init
      .mockResolvedValueOnce({ stdout: "", stderr: "" }) // railway up
      .mockResolvedValueOnce({
        stdout: JSON.stringify({ domain: "my-api.railway.app" }),
        stderr: "",
      }); // railway domain
    const url = await railwayDeploy("my-project", "/some/project/apps/api");
    expect(run).toHaveBeenNthCalledWith(
      1,
      "railway",
      ["init", "--name", "my-project"],
      "/some/project/apps/api",
    );
    expect(run).toHaveBeenNthCalledWith(
      2,
      "railway",
      ["up", "--detach"],
      "/some/project/apps/api",
    );
    expect(run).toHaveBeenNthCalledWith(
      3,
      "railway",
      ["domain", "--json", "--port", "3000"],
      "/some/project/apps/api",
    );
    expect(url).toBe("https://my-api.railway.app");
  });

  it("prepends https:// when domain has no scheme", async () => {
    vi.mocked(run)
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({ domain: "my-api.railway.app" }),
        stderr: "",
      });
    await expect(
      railwayDeploy("my-project", "/some/project/apps/api"),
    ).resolves.toBe("https://my-api.railway.app");
  });

  it("returns URL as-is when domain already has https scheme", async () => {
    vi.mocked(run)
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({ domain: "https://my-api.railway.app" }),
        stderr: "",
      });
    await expect(
      railwayDeploy("my-project", "/some/project/apps/api"),
    ).resolves.toBe("https://my-api.railway.app");
  });

  it("falls back to https:// line scan when output is not JSON", async () => {
    vi.mocked(run)
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockResolvedValueOnce({
        stdout: "Generating domain...\nhttps://my-api.railway.app",
        stderr: "",
      });
    await expect(
      railwayDeploy("my-project", "/some/project/apps/api"),
    ).resolves.toBe("https://my-api.railway.app");
  });

  it("throws when domain cannot be extracted", async () => {
    vi.mocked(run)
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockResolvedValueOnce({ stdout: "{}", stderr: "" });
    await expect(
      railwayDeploy("my-project", "/some/project/apps/api"),
    ).rejects.toThrow("Could not extract Railway domain from output.");
  });
});
