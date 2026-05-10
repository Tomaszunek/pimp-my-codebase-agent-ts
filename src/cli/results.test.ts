import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CliResult } from "./types.js";

import { createDebugInfo } from "./debug-info.js";
import { parseArguments } from "./parse-arguments.js";
import { createResult } from "./results.js";

function createResultFor(argv: string[]): CliResult {
  const parsed = parseArguments(argv);
  return createResult(parsed, createDebugInfo(argv, parsed));
}

void describe("createResult", () => {
  void it("returns debug data for the debug command", () => {
    const result = createResultFor(["node", "cli", "debug", "--repo", "../logo"]);

    assert.equal(result.status, "ok");
    assert.equal(result.command, "debug");
    assert.equal(result.repoPath, "../logo");
    assert.equal(result.message, "CLI debug information.");
    assert.notEqual(result.data, undefined);
  });

  void it("returns not implemented for scaffolded commands", () => {
    const result = createResultFor(["node", "cli", "plan", "--repo", "../logo"]);

    assert.equal(result.status, "not_implemented");
    assert.equal(result.command, "plan");
    assert.equal(result.repoPath, "../logo");
  });

  void it("includes debug info when requested", () => {
    const result = createResultFor(["node", "cli", "plan", "--debug"]);

    assert.equal(result.status, "not_implemented");
    assert.notEqual(result.debug, undefined);
  });

  void it("returns errors for unknown commands", () => {
    const result = createResultFor(["node", "cli", "unknown"]);

    assert.equal(result.status, "error");
    assert.equal(result.command, "unknown");
    assert.equal(result.message, "Unknown command: unknown");
  });

  void it("returns parser errors before command handling", () => {
    const result = createResultFor(["node", "cli", "verify", "--format", "xml"]);

    assert.equal(result.status, "error");
    assert.equal(result.message, "Invalid format 'xml'. Use 'text' or 'json'.");
  });
});
