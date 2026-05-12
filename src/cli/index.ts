#!/usr/bin/env node

import { createDebugInfo } from "./debug-info.js";
import { printHelp } from "./help.js";
import { parseArguments } from "./parse-arguments.js";
import { createResult, printResult } from "./results.js";

async function main(argv: string[]): Promise<void> {
  const parsed = parseArguments(argv);
  const debugInfo = createDebugInfo(argv, parsed);

  if (parsed.help || parsed.command === undefined || parsed.command.length === 0) {
    printHelp();
    return;
  }

  const result = await createResult(parsed, debugInfo);
  printResult(result, parsed.format);

  if (result.status === "error") {
    process.exitCode = 1;
  }
}

try {
  await main(process.argv);
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
