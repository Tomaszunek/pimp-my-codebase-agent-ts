import type { CliFlagValue, ParsedCli } from "./types.js";

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

function createFlags(): Record<string, CliFlagValue> {
  return {};
}

function setFlag(flags: Record<string, CliFlagValue>, name: string, value: CliFlagValue): void {
  Object.defineProperty(flags, name, {
    configurable: true,
    enumerable: true,
    value,
    writable: true
  });
}

export function parseArguments(argv: string[]): ParsedCli {
  const cliArguments = argv.slice(2);
  const parsed: ParsedCli = {
    flags: createFlags(),
    positionals: [],
    format: "text",
    debug: false,
    help: false,
    errors: []
  };

  for (let index = 0; index < cliArguments.length; index += 1) {
    const argument = cliArguments.at(index);

    if (argument === undefined || argument.length === 0) {
      continue;
    }

    if (argument === "-h" || argument === "--help") {
      parsed.help = true;
      continue;
    }

    if (argument === "--json") {
      setFlag(parsed.flags, "json", true);
      parsed.format = "json";
      continue;
    }

    if (argument.startsWith("--")) {
      const withoutPrefix = argument.slice(2);
      const [rawName, inlineValue] = withoutPrefix.split("=", 2);
      const name = (rawName ?? "").trim();

      if (name.length === 0) {
        parsed.errors.push(`Invalid option: ${argument}`);
        continue;
      }

      let value: CliFlagValue = true;

      if (inlineValue === undefined) {
        const nextArgument = cliArguments.at(index + 1);

        if (nextArgument === undefined) {
          value = true;
        } else if (nextArgument.startsWith("-")) {
          value = true;
        } else {
          value = nextArgument;
          index += 1;
        }
      } else {
        value = inlineValue;
      }

      setFlag(parsed.flags, name, value);
      applyKnownFlag(parsed, name, value);
      continue;
    }

    if (parsed.command === undefined || parsed.command.length === 0) {
      parsed.command = argument;
    } else {
      parsed.positionals.push(argument);
    }
  }

  if (parsed.command === "help") {
    parsed.help = true;
  }

  return parsed;
}
