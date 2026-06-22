import { Socket, createServer } from "node:net";
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

export async function isPortFree(port: number): Promise<boolean> {
  // Connect-based check detects Docker-bound ports that bind-based checks miss on macOS
  const connectable = await new Promise<boolean>((resolve) => {
    const socket = new Socket();
    socket.setTimeout(300);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", (err) => {
      socket.destroy();
      resolve((err as NodeJS.ErrnoException).code !== "ECONNREFUSED");
    });
    socket.connect(port, "127.0.0.1");
  });
  if (connectable) return false;

  // Secondary bind check for non-Docker processes
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(port, "127.0.0.1");
  });
}

export async function findFreePort(
  startPort = 5432,
  maxTries = 100,
): Promise<number> {
  for (let port = startPort; port < startPort + maxTries; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(
    `No free port found in range ${startPort}-${startPort + maxTries - 1}.`,
  );
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

export async function checkVercelInstalled(): Promise<void> {
  try {
    await run("which", ["vercel"]);
  } catch {
    throw new Error("Vercel CLI not found.");
  }
}

export async function checkVercelLoggedIn(): Promise<void> {
  try {
    const { stdout } = await run("vercel", ["whoami"]);
    if (!stdout.trim()) throw new Error("not logged in");
  } catch {
    throw new Error("Not logged into Vercel. Run: vercel login");
  }
}

export async function checkRailwayInstalled(): Promise<void> {
  try {
    await run("which", ["railway"]);
  } catch {
    throw new Error("Railway CLI not found.");
  }
}

export async function checkRailwayLoggedIn(): Promise<void> {
  try {
    const { stdout } = await run("railway", ["whoami"]);
    if (!stdout.trim()) throw new Error("not logged in");
  } catch {
    throw new Error("Not logged into Railway. Run: railway login");
  }
}

export async function checkSupabaseInstalled(): Promise<void> {
  try {
    await run("which", ["supabase"]);
  } catch {
    throw new Error("Supabase CLI not found.");
  }
}

export async function checkSupabaseLoggedIn(): Promise<void> {
  try {
    await run("supabase", ["orgs", "list"]);
  } catch {
    throw new Error("Not logged into Supabase. Run: supabase login");
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
