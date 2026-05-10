import { isKnownCommand } from "./commands.js";
import type { CliDebugInfo, CliResult, OutputFormat, ParsedCli } from "./types.js";

export function createResult(parsed: ParsedCli, debugInfo: CliDebugInfo): CliResult {
  if (parsed.errors.length > 0) {
    const result: CliResult = {
      status: "error",
      message: parsed.errors.join(" ")
    };

    if (parsed.debug) {
      result.debug = debugInfo;
    }

    return result;
  }

  if (parsed.command === undefined || parsed.command.length === 0) {
    return {
      status: "ok",
      message: "Help printed."
    };
  }

  if (!isKnownCommand(parsed.command)) {
    const result: CliResult = {
      status: "error",
      command: parsed.command,
      message: `Unknown command: ${parsed.command}`
    };

    if (parsed.debug) {
      result.debug = debugInfo;
    }

    return result;
  }

  if (parsed.command === "debug") {
    const result: CliResult = {
      status: "ok",
      command: parsed.command,
      message: "CLI debug information.",
      data: debugInfo
    };

    if (parsed.repoPath !== undefined && parsed.repoPath.length > 0) {
      result.repoPath = parsed.repoPath;
    }

    return result;
  }

  const result: CliResult = {
    status: "not_implemented",
    command: parsed.command,
    message: `Command '${parsed.command}' is scaffolded but not implemented yet.`
  };

  if (parsed.repoPath !== undefined && parsed.repoPath.length > 0) {
    result.repoPath = parsed.repoPath;
  }

  if (parsed.debug) {
    result.debug = debugInfo;
  }

  return result;
}

export function printResult(result: CliResult, format: OutputFormat): void {
  if (format === "json") {
    console.log(JSON.stringify(result, undefined, 2));
    return;
  }

  if (result.debug) {
    console.error(`[debug] ${JSON.stringify(result.debug, undefined, 2)}`);
  }

  if (result.status === "error") {
    console.error(result.message);
    console.error("Run `pimp-my-codebase --help` for usage.");
    return;
  }

  console.log(result.message);

  if (result.command === "debug" && result.data !== undefined) {
    console.log(JSON.stringify(result.data, undefined, 2));
  }
}
