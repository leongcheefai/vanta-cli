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

// Like runInherit but never throws and silences stdout/stderr.
// stdin stays inherited so Railway can show interactive prompts if needed.
// stdout/stderr are piped (discarded) to hide expected noise like "Deploy crashed".
export async function runInheritTolerant(
  cmd: string,
  args: string[],
  cwd?: string,
  timeoutMs = 300_000,
): Promise<void> {
  try {
    await execa(cmd, args, {
      cwd,
      stdin: "inherit",
      stdout: "pipe",
      stderr: "pipe",
      timeout: timeoutMs,
    });
  } catch {
    // Swallow: deployment failure, timeout kill, or non-zero exit are all OK here.
  }
}
