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
  it("runs docker compose up -d in given cwd", async () => {
    vi.mocked(run).mockResolvedValue({ stdout: "", stderr: "" });
    await composeUp("/some/project");
    expect(run).toHaveBeenCalledWith(
      "docker",
      ["compose", "up", "-d"],
      "/some/project",
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
