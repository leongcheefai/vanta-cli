#!/usr/bin/env node
import { execSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Only patch PATH during global install
if (process.env.npm_config_global !== "true") process.exit(0);

const npmBinDir = join(
  process.env.npm_config_prefix ??
    execSync("npm prefix -g", { encoding: "utf8" }).trim(),
  "bin",
);

// Already accessible — nothing to do
const inPath = (process.env.PATH ?? "").split(":").includes(npmBinDir);
if (inPath) process.exit(0);

// Detect shell profile
const shell = process.env.SHELL ?? "";
let profile;
if (shell.endsWith("zsh")) {
  profile = join(homedir(), ".zshrc");
} else if (shell.endsWith("bash")) {
  const rc = join(homedir(), ".bashrc");
  profile = existsSync(rc) ? rc : join(homedir(), ".bash_profile");
} else {
  profile = join(homedir(), ".profile");
}

const existing = existsSync(profile) ? readFileSync(profile, "utf8") : "";
if (!existing.includes(npmBinDir)) {
  appendFileSync(profile, `\nexport PATH="${npmBinDir}:$PATH"\n`);
  console.log(`\n  ✓ Added ${npmBinDir} to PATH in ${profile}`);
}

console.log(`\n  Run: source ${profile} && vanta --help\n`);
