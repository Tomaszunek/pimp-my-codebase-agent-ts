import type { CliFlagValue, ParsedCli } from "./types.js";

export function parseArgs(argv: string[]): ParsedCli {
  const args = argv.slice(2);
  const parsed: ParsedCli = {
    flags: {},
    positionals: [],
    format: "text",
    debug: false,
    help: false,
    errors: []
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      continue;
    }

    if (arg === "-h" || arg === "--help") {
      parsed.help = true;
      continue;
    }

    if (arg === "--json") {
      parsed.flags.json = true;
      parsed.format = "json";
      continue;
    }

    if (arg.startsWith("--")) {
      const withoutPrefix = arg.slice(2);
      const [rawName, inlineValue] = withoutPrefix.split("=", 2);
      const name = (rawName ?? "").trim();

      if (!name) {
        parsed.errors.push(`Invalid option: ${arg}`);
        continue;
      }

      let value: CliFlagValue = true;

      if (inlineValue !== undefined) {
        value = inlineValue;
      } else {
        const nextArg = args[index + 1];

        if (nextArg && !nextArg.startsWith("-")) {
          value = nextArg;
          index += 1;
        }
      }

      parsed.flags[name] = value;
      applyKnownFlag(parsed, name, value);
      continue;
    }

    if (!parsed.command) {
      parsed.command = arg;
    } else {
      parsed.positionals.push(arg);
    }
  }

  if (parsed.command === "help") {
    parsed.help = true;
  }

  return parsed;
}

function applyKnownFlag(parsed: ParsedCli, name: string, value: CliFlagValue): void {
  if (name === "debug") {
    parsed.debug = value === true || value === "true";
  }

  if (name === "format") {
    if (value === "json" || value === "text") {
      parsed.format = value;
    } else {
      parsed.errors.push(`Invalid format '${String(value)}'. Use 'text' or 'json'.`);
    }
  }

  if (name === "repo" && typeof value === "string") {
    parsed.repoPath = value;
  }
}
