import { commandDescriptions } from "./commands.js";

const commandNameColumnWidth = 8;

export function printHelp(): void {
  console.log(`Pimp My Codebase Agent

Usage:
  pimp-my-codebase <command> --repo <path> [options]

Commands:
${commandDescriptions.map(([name, description]) => `  ${name.padEnd(commandNameColumnWidth)} ${description}`).join("\n")}

Options:
  --repo <path>       Repository path.
  --format <format>   Output format: text or json.
  --json              Shortcut for --format json.
  --debug             Include parsed CLI/runtime diagnostics.
  -h, --help          Print help.

Examples:
  pimp-my-codebase plan --repo ../logo
  pimp-my-codebase plan --repo ../logo --debug
  pimp-my-codebase verify --repo ../logo --format json
  pimp-my-codebase debug --repo ../logo --json
  pimp-my-codebase verify --repo ../logo
  pimp-my-codebase report --repo ../logo
`);
}
