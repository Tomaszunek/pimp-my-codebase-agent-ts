import type { CliDebugInfo, ParsedCli } from "./types.js";

export function createDebugInfo(argv: string[], parsed: ParsedCli): CliDebugInfo {
  return {
    argv: argv.slice(2),
    parsed,
    runtime: {
      cwd: process.cwd(),
      node: process.version,
      platform: process.platform
    }
  };
}
