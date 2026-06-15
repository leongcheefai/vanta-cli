import { EventEmitter } from "node:events";
import { createServer } from "node:net";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("net", () => ({ createServer: vi.fn() }));
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
  checkSSH,
  ensurePnpm,
  findFreePort,
  isPortFree,
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

function makeServer(events: { listening?: boolean; error?: boolean }) {
  const srv = Object.assign(new EventEmitter(), {
    listen: vi.fn().mockImplementation(function (
      this: EventEmitter,
      _port: number,
      _host: string,
    ) {
      setImmediate(() => {
        if (events.error) this.emit("error", new Error("EADDRINUSE"));
        else this.emit("listening");
      });
    }),
    close: vi.fn(),
  });
  return srv;
}

describe("isPortFree", () => {
  it("returns true when port is free (bind succeeds)", async () => {
    vi.mocked(createServer).mockReturnValue(
      makeServer({ listening: true }) as unknown as ReturnType<
        typeof createServer
      >,
    );
    await expect(isPortFree(5432)).resolves.toBe(true);
  });
  it("returns false when port is in use (bind fails)", async () => {
    vi.mocked(createServer).mockReturnValue(
      makeServer({ error: true }) as unknown as ReturnType<typeof createServer>,
    );
    await expect(isPortFree(5433)).resolves.toBe(false);
  });
});

describe("findFreePort", () => {
  it("returns startPort when it is free", async () => {
    vi.mocked(createServer).mockReturnValue(
      makeServer({ listening: true }) as unknown as ReturnType<
        typeof createServer
      >,
    );
    await expect(findFreePort(5432)).resolves.toBe(5432);
  });
  it("scans upward and returns the first free port", async () => {
    // 5432 busy, 5433 busy, 5434 free
    let callCount = 0;
    vi.mocked(createServer).mockImplementation(() => {
      const busy = callCount < 2;
      callCount++;
      return makeServer(
        busy ? { error: true } : { listening: true },
      ) as unknown as ReturnType<typeof createServer>;
    });
    await expect(findFreePort(5432)).resolves.toBe(5434);
  });
  it("throws when no free port found in range", async () => {
    vi.mocked(createServer).mockImplementation(
      () =>
        makeServer({ error: true }) as unknown as ReturnType<
          typeof createServer
        >,
    );
    await expect(findFreePort(5432, 3)).rejects.toThrow(
      "No free port found in range 5432-5434",
    );
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
