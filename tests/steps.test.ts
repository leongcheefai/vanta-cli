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
  runMigrations,
  seedAdmin,
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
      "Docker Postgres could not bind a host port",
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
