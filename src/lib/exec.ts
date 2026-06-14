import { execa } from "execa";

export async function run(
  cmd: string,
  args: string[],
  cwd?: string,
): Promise<{ stdout: string; stderr: string }> {
  const result = await execa(cmd, args, { cwd });
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

export async function runInherit(
  cmd: string,
  args: string[],
  cwd?: string,
): Promise<void> {
  await execa(cmd, args, { cwd, stdio: "inherit" });
}
