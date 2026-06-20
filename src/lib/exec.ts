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
