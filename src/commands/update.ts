import * as clack from "@clack/prompts";
import { runInherit } from "../lib/exec.js";

export async function update(): Promise<void> {
  clack.intro("vanta update");
  const spinner = clack.spinner();
  spinner.start("Installing latest version");
  try {
    await runInherit("npm", ["install", "-g", "vantatech-cli@latest"]);
    spinner.stop("Updated successfully");
  } catch {
    spinner.stop("Update failed", 1);
    clack.cancel("Run manually: npm install -g vantatech-cli@latest");
    process.exit(1);
  }
  clack.outro("Done");
}
