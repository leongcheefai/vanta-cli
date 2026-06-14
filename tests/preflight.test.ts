import { EventEmitter } from "node:events";
import { createConnection } from "node:net";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("net", () => ({ createConnection: vi.fn() }));
vi.mock("../src/lib/exec.js", () => ({
  run: vi.fn(),
  runInherit: vi.fn(),
}));

import { run } from "../src/lib/exec.js";

beforeEach(() => vi.clearAllMocks());

import {
  checkDockerInstalled,
  checkDockerRunning,
  checkNode,
  checkPort5432Free,
  checkSSH,
  ensurePnpm,
} from "../src/lib/preflight.js";

describe("checkNode", () => {
  it("resolves when Node >= 22", async () => {
    await expect(checkNode("v22.0.0")).resolves.toBeUndefined();
  });
  it("resolves for v23", async () => {
    await expect(checkNode("v23.1.0")).resolves.toBeUndefined();
  });
  it("throws for v21", async () => {
    await expect(checkNode("v21.9.0")).rejects.toThrow("Node 22+ required");
  });
  it("throws for v20", async () => {
    await expect(checkNode("v20.0.0")).rejects.toThrow("Node 22+ required");
  });
});

describe("checkDockerInstalled", () => {
  it("resolves when docker found", async () => {
    vi.mocked(run).mockResolvedValue({ stdout: "/usr/bin/docker", stderr: "" });
    await expect(checkDockerInstalled()).resolves.toBeUndefined();
  });
  it("throws when docker not found", async () => {
    vi.mocked(run).mockRejectedValue(new Error("Command failed"));
    await expect(checkDockerInstalled()).rejects.toThrow("Docker not found");
  });
});

describe("checkDockerRunning", () => {
  it("resolves when docker info succeeds", async () => {
    vi.mocked(run).mockResolvedValue({ stdout: "Server:", stderr: "" });
    await expect(checkDockerRunning()).resolves.toBeUndefined();
  });
  it("throws when docker info fails", async () => {
    vi.mocked(run).mockRejectedValue(new Error("Cannot connect"));
    await expect(checkDockerRunning()).rejects.toThrow("Docker not running");
  });
});

describe("checkPort5432Free", () => {
  it("resolves when port is free (connection refused)", async () => {
    const socket = Object.assign(new EventEmitter(), { destroy: vi.fn() });
    vi.mocked(createConnection).mockReturnValue(
      socket as unknown as ReturnType<typeof createConnection>,
    );
    const promise = checkPort5432Free();
    socket.emit("error", new Error("ECONNREFUSED"));
    await expect(promise).resolves.toBeUndefined();
  });
  it("throws when port is in use (connection succeeds)", async () => {
    const socket = Object.assign(new EventEmitter(), { destroy: vi.fn() });
    vi.mocked(createConnection).mockReturnValue(
      socket as unknown as ReturnType<typeof createConnection>,
    );
    const promise = checkPort5432Free();
    socket.emit("connect");
    await expect(promise).rejects.toThrow("Port 5432 in use");
  });
});

describe("checkSSH", () => {
  it('resolves when stderr contains "successfully authenticated"', async () => {
    vi.mocked(run).mockRejectedValue({
      stderr: "Hi username! You've successfully authenticated",
      exitCode: 1,
    });
    await expect(checkSSH()).resolves.toBeUndefined();
  });
  it("throws when stderr does not mention successful auth", async () => {
    vi.mocked(run).mockRejectedValue({
      stderr: "Permission denied (publickey)",
      exitCode: 255,
    });
    await expect(checkSSH()).rejects.toThrow("SSH auth failed");
  });
  it("resolves when run succeeds (exit 0)", async () => {
    vi.mocked(run).mockResolvedValue({ stdout: "", stderr: "" });
    await expect(checkSSH()).resolves.toBeUndefined();
  });
});

describe("ensurePnpm", () => {
  it("does nothing when pnpm is already installed", async () => {
    vi.mocked(run).mockResolvedValue({ stdout: "9.0.0", stderr: "" });
    await expect(ensurePnpm()).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("runs corepack when pnpm is missing", async () => {
    vi.mocked(run)
      .mockRejectedValueOnce(new Error("pnpm not found"))
      .mockResolvedValue({ stdout: "", stderr: "" });
    await expect(ensurePnpm()).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledWith("corepack", ["enable"]);
    expect(run).toHaveBeenCalledWith("corepack", [
      "prepare",
      "pnpm@latest",
      "--activate",
    ]);
  });
});
