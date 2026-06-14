import { existsSync, readFileSync } from "node:fs";
import { createConnection } from "node:net";
import * as clack from "@clack/prompts";
import { run } from "../lib/exec.js";

interface CheckResult {
  label: string;
  pass: boolean;
  detail?: string;
}

async function check(
  label: string,
  fn: () => Promise<void>,
): Promise<CheckResult> {
  try {
    await fn();
    return { label, pass: true };
  } catch (err: unknown) {
    return {
      label,
      pass: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function tcpConnect(host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const conn = createConnection({ host, port });
    conn.on("connect", () => {
      conn.destroy();
      resolve();
    });
    conn.on("error", (err) => reject(err));
  });
}

export async function doctor(): Promise<void> {
  clack.intro("vanta doctor");

  const envExists = existsSync(".env");
  const envVars = envExists ? parseEnv(readFileSync(".env", "utf8")) : {};

  const results = await Promise.all([
    check("Node >= 22", async () => {
      const major = Number.parseInt(process.version.slice(1).split(".")[0], 10);
      if (major < 22) throw new Error(`Node ${process.version} (need 22+)`);
    }),
    check("pnpm >= 9", async () => {
      const { stdout } = await run("pnpm", ["--version"]);
      const major = Number.parseInt(stdout.trim().split(".")[0], 10);
      if (major < 9) throw new Error(`pnpm ${stdout.trim()} (need 9+)`);
    }),
    check("Docker running", async () => {
      await run("docker", ["info"]);
    }),
    check(".env exists", async () => {
      if (!envExists) throw new Error(".env not found in current directory");
    }),
    check("Required env vars", async () => {
      if (!envExists) throw new Error(".env not found");
      const required = [
        "DATABASE_URL",
        "BETTER_AUTH_SECRET",
        "BETTER_AUTH_URL",
        "APP_URL",
        "VITE_API_URL",
      ];
      const missing = required.filter((k) => !envVars[k]);
      if (missing.length) throw new Error(`Missing: ${missing.join(", ")}`);
    }),
    check("Postgres reachable", async () => {
      if (!envExists) throw new Error(".env not found");
      const url = envVars.DATABASE_URL;
      if (!url) throw new Error("DATABASE_URL not set");
      const match = url.match(/postgresql:\/\/[^@]+@([^:/]+):(\d+)/);
      if (!match) throw new Error("Cannot parse DATABASE_URL host:port");
      await tcpConnect(match[1], Number.parseInt(match[2], 10));
    }),
    check("node_modules/.pnpm present", async () => {
      if (!existsSync("node_modules/.pnpm"))
        throw new Error("node_modules/.pnpm not found — run pnpm install");
    }),
  ]);

  const lines = results.map(
    (r) => `${r.pass ? "✓" : "✗"} ${r.label}${r.detail ? `: ${r.detail}` : ""}`,
  );
  clack.note(lines.join("\n"), "Health Check");

  const allPass = results.every((r) => r.pass);
  if (allPass) {
    clack.outro("All checks passed.");
  } else {
    clack.outro("Some checks failed. Fix the issues above.");
    process.exit(1);
  }
}

function parseEnv(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return vars;
}
