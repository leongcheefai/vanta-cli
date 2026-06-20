import { execa } from "execa";

export async function run(
  cmd: string,
  args: string[],
  cwd?: string,
  env?: Record<string, string>,
  input?: string,
): Promise<{ stdout: string; stderr: string }> {
  const result = await execa(cmd, args, {
    cwd,
    env: env ? { ...process.env, ...env } : undefined,
    input,
  });
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

export async function runInherit(
  cmd: string,
  args: string[],
  cwd?: string,
): Promise<void> {
  await execa(cmd, args, { cwd, stdio: "inherit" });
}

// Like runInherit but never throws. Use when the process may exit non-zero
// (e.g. first railway deploy before env vars are set) but side effects
// (service creation, local link update) still happen during the run.
export async function runInheritTolerant(
  cmd: string,
  args: string[],
  cwd?: string,
  timeoutMs = 300_000,
): Promise<void> {
  try {
    await execa(cmd, args, { cwd, stdio: "inherit", timeout: timeoutMs });
  } catch {
    // Swallow: deployment failure, timeout kill, or non-zero exit are all OK here.
  }
}
