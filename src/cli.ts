import { Command, CommanderError } from "commander";
import packageJson from "../package.json" with { type: "json" };
import { registerRowCommands } from "./commands/rows.js";
import { registerSheetCommands } from "./commands/sheets.js";
import { reportCliError } from "./core/cli-response.js";

export function createProgram(): Command {
  const program = new Command()
    .name("smartsheet")
    .description("Read and write Smartsheet data")
    .version(packageJson.version, "-v, --version", "Display version number")
    .helpOption("-h, --help", "Display help for command");

  registerSheetCommands(program);
  registerRowCommands(program);
  return program;
}

function configureParsing(command: Command): void {
  command.exitOverride();
  command.configureOutput({
    writeErr: () => undefined,
    outputError: () => undefined,
  });
  command.commands.forEach(configureParsing);
}

function usageMessage(code: string): string {
  switch (code) {
    case "commander.unknownCommand":
      return "Unknown command.";
    case "commander.unknownOption":
      return "Unknown option.";
    case "commander.missingArgument":
      return "A required argument is missing.";
    case "commander.optionMissingArgument":
      return "An option value is missing.";
    case "commander.missingMandatoryOptionValue":
      return "A required option is missing.";
    default:
      return "Invalid command usage.";
  }
}

export async function run(
  argv: readonly string[] = process.argv,
): Promise<void> {
  const program = createProgram();

  if (argv.length <= 2) {
    program.outputHelp();
    return;
  }

  configureParsing(program);

  try {
    await program.parseAsync([...argv]);
  } catch (error) {
    if (!(error instanceof CommanderError)) throw error;
    if (error.exitCode === 0) return;

    reportCliError({
      code: "CLI_USAGE_ERROR",
      message: usageMessage(error.code),
      retryable: false,
      nextSteps: ["Run `smartsheet --help` to list valid commands."],
    });
  }
}
