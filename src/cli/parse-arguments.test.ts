import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseArguments } from "./parse-arguments.js";

void describe("parseArguments", () => {
  void it("parses a command with repo and JSON output flags", () => {
    const parsed = parseArguments(["node", "cli", "debug", "--repo", "../logo", "--json"]);

    assert.equal(parsed.command, "debug");
    assert.equal(parsed.repoPath, "../logo");
    assert.equal(parsed.format, "json");
    assert.equal(parsed.flags.json, true);
    assert.deepEqual(parsed.positionals, []);
    assert.deepEqual(parsed.errors, []);
  });

  void it("supports inline option values", () => {
    const parsed = parseArguments(["node", "cli", "plan", "--repo=../logo", "--format=json"]);

    assert.equal(parsed.command, "plan");
    assert.equal(parsed.repoPath, "../logo");
    assert.equal(parsed.format, "json");
    assert.equal(parsed.flags.repo, "../logo");
    assert.equal(parsed.flags.format, "json");
  });

  void it("keeps extra positional arguments after the command", () => {
    const parsed = parseArguments(["node", "cli", "apply", "item-1", "item-2"]);

    assert.equal(parsed.command, "apply");
    assert.deepEqual(parsed.positionals, ["item-1", "item-2"]);
  });

  void it("reports invalid output formats", () => {
    const parsed = parseArguments(["node", "cli", "verify", "--format", "xml"]);

    assert.equal(parsed.command, "verify");
    assert.equal(parsed.format, "text");
    assert.deepEqual(parsed.errors, ["Invalid format 'xml'. Use 'text' or 'json'."]);
  });

  void it("treats help as a help request", () => {
    const parsed = parseArguments(["node", "cli", "help"]);

    assert.equal(parsed.help, true);
  });
});
