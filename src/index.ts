import { Command } from "commander";
import { doctor } from "./commands/doctor.js";
import { init } from "./commands/init.js";
import pkg from "../package.json" with { type: "json" };

const program = new Command();

program
  .name("vanta")
  .description("Bootstrap vanta-base-admin for new team members")
  .version(pkg.version);

program
  .command("init [name]")
  .description("Full local environment bootstrap")
  .action((name = "vanta-base-admin") => {
    init(name).catch((err: Error) => {
      console.error(err.message);
      process.exit(1);
    });
  });

program
  .command("doctor")
  .description("Read-only environment health check")
  .action(() => {
    doctor().catch((err: Error) => {
      console.error(err.message);
      process.exit(1);
    });
  });

program.parse();
