import { Command } from "commander";
import pkg from "../package.json" with { type: "json" };
import { doctor } from "./commands/doctor.js";
import { init } from "./commands/init.js";
import { update } from "./commands/update.js";
import { checkForUpdate } from "./lib/update-check.js";

const program = new Command();

program
  .name("vanta")
  .description("Bootstrap vanta-base-admin for new team members")
  .version(pkg.version);

program
  .command("init [name]")
  .description("Full local environment bootstrap")
  .action(async (name = "vanta-base-admin") => {
    try {
      await init(name);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("doctor")
  .description("Read-only environment health check")
  .action(async () => {
    try {
      await doctor();
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("update")
  .description("Update vanta CLI to the latest version")
  .action(async () => {
    try {
      await update();
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const isUpdateCommand = process.argv[2] === "update";
const updateCheck = isUpdateCommand
  ? Promise.resolve(null)
  : checkForUpdate(pkg.version, "vantatech-cli");

await program.parseAsync(process.argv);

const latestVersion = await updateCheck;
if (latestVersion) {
  console.log(
    `\n  Update available: ${pkg.version} → ${latestVersion}\n  Run: vanta update\n`,
  );
}
