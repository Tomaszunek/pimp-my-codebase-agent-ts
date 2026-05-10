#!/usr/bin/env node

import { createDebugInfo } from "./debugInfo.js";
import { printHelp } from "./help.js";
import { parseArgs } from "./parseArgs.js";
import { createResult, printResult } from "./results.js";

function main(argv: string[]): void {
  const parsed = parseArgs(argv);
  const debugInfo = createDebugInfo(argv, parsed);

  if (parsed.help || !parsed.command) {
    printHelp();
    return;
  }

  const result = createResult(parsed, debugInfo);
  printResult(result, parsed.format);

  if (result.status === "error") {
    process.exitCode = 1;
  }
}

main(process.argv);
