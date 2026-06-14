import { createConnection } from "node:net";
import { run } from "./exec.js";

export async function checkNode(version = process.version): Promise<void> {
  const major = Number.parseInt(version.slice(1).split(".")[0], 10);
  if (major < 22) {
    throw new Error("Node 22+ required. Install via https://nodejs.org");
  }
}

export async function checkDockerInstalled(): Promise<void> {
  try {
    await run("which", ["docker"]);
  } catch {
    throw new Error("Docker not found. Install from https://docker.com");
  }
}

export async function checkDockerRunning(): Promise<void> {
  try {
    await run("docker", ["info"]);
  } catch {
    throw new Error("Docker not running. Run: open -a Docker");
  }
}

export async function checkPort5432Free(): Promise<void> {
  return new Promise((resolve, reject) => {
    const conn = createConnection({ port: 5432, host: "localhost" });
    conn.on("connect", () => {
      conn.destroy();
      reject(new Error("Port 5432 in use. Stop the conflicting process."));
    });
    conn.on("error", () => {
      conn.destroy();
      resolve();
    });
  });
}

export async function getPort5432Pids(): Promise<string[]> {
  try {
    const { stdout } = await run("lsof", ["-ti", ":5432"]);
    return stdout.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export async function killPort5432Pids(pids: string[]): Promise<void> {
  for (const pid of pids) {
    await run("kill", ["-9", pid]);
  }
}

export async function getPort5432DockerContainers(): Promise<string[]> {
  try {
    const { stdout } = await run("docker", [
      "ps",
      "--filter",
      "publish=5432",
      "--format",
      "{{.Names}}",
    ]);
    return stdout.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export async function stopDockerContainers(names: string[]): Promise<void> {
  for (const name of names) {
    await run("docker", ["stop", name]);
  }
}

export async function waitForPort5432Free(
  retries = 8,
  delayMs = 500,
): Promise<void> {
  for (let i = 0; i < retries; i++) {
    await new Promise((r) => setTimeout(r, delayMs));
    try {
      await checkPort5432Free();
      return;
    } catch {
      // keep retrying
    }
  }
  throw new Error("Port 5432 still in use after killing process.");
}

export async function checkSSH(): Promise<void> {
  try {
    // accept-new auto-accepts unknown hosts but rejects changed keys (prevents MITM on key rotation)
    await run("ssh", [
      "-T",
      "-o",
      "StrictHostKeyChecking=accept-new",
      "git@github.com",
    ]);
  } catch (err: unknown) {
    const stderr =
      typeof err === "object" && err !== null && "stderr" in err
        ? (err as { stderr: string }).stderr
        : "";
    if (stderr.includes("successfully authenticated")) return;
    throw new Error(
      "SSH auth failed. Set up your SSH key: https://docs.github.com/en/authentication/connecting-to-github-with-ssh",
    );
  }
}

export async function ensurePnpm(): Promise<void> {
  try {
    await run("pnpm", ["--version"]);
  } catch {
    try {
      await run("corepack", ["enable"]);
      await run("corepack", ["prepare", "pnpm@latest", "--activate"]);
    } catch {
      // non-fatal — pnpm install step will fail with a clear error if pnpm is still absent
    }
  }
}
