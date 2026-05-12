import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

import type { CliResult } from "./types.js";

import { createDebugInfo } from "./debug-info.js";
import { parseArguments } from "./parse-arguments.js";
import { createResult } from "./results.js";

interface FixtureFile {
  readonly content: string;
  readonly path: string;
}

async function createResultFor(argv: string[]): Promise<CliResult> {
  const parsed = parseArguments(argv);
  return createResult(parsed, createDebugInfo(argv, parsed));
}

async function createFixture(files: readonly FixtureFile[]): Promise<string> {
  const fixtureRoot = path.join(process.cwd(), ".test-tmp", randomUUID());

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Tests create isolated fixtures under the workspace.
  await mkdir(fixtureRoot, { recursive: true });

  await Promise.all(
    files.map(async (file) => {
      const filePath = path.join(fixtureRoot, file.path);

      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Tests create isolated fixture files under the workspace.
      await mkdir(path.dirname(filePath), { recursive: true });
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Tests create isolated fixture files under the workspace.
      await writeFile(filePath, file.content);
    })
  );

  return fixtureRoot;
}

async function readUtf8File(filePath: string): Promise<string> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Tests read isolated fixture artifacts.
  return readFile(filePath, "utf8");
}

async function removeFixture(fixtureRoot: string): Promise<void> {
  const testRoot = path.resolve(process.cwd(), ".test-tmp");
  const resolvedFixtureRoot = path.resolve(fixtureRoot);

  assert.ok(resolvedFixtureRoot.startsWith(`${testRoot}${path.sep}`));
  await rm(resolvedFixtureRoot, { force: true, recursive: true });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown): Readonly<Record<string, unknown>> {
  assert.ok(isRecord(value));
  return value;
}

function requireNumber(value: unknown): number {
  if (typeof value !== "number") {
    assert.fail("Expected a number value.");
  }

  return value;
}

function requireString(value: unknown): string {
  if (typeof value !== "string") {
    assert.fail("Expected a string value.");
  }

  return value;
}

void describe("createResult", () => {
  void it("returns debug data for the debug command", async () => {
    const result = await createResultFor(["node", "cli", "debug", "--repo", "../logo"]);

    assert.equal(result.status, "ok");
    assert.equal(result.command, "debug");
    assert.equal(result.repoPath, "../logo");
    assert.equal(result.message, "CLI debug information.");
    assert.notEqual(result.data, undefined);
  });

  void it("returns not implemented for scaffolded commands", async () => {
    const result = await createResultFor(["node", "cli", "verify", "--repo", "../logo"]);

    assert.equal(result.status, "not_implemented");
    assert.equal(result.command, "verify");
    assert.equal(result.repoPath, "../logo");
  });

  void it("includes debug info when requested", async () => {
    const result = await createResultFor(["node", "cli", "verify", "--debug"]);

    assert.equal(result.status, "not_implemented");
    assert.notEqual(result.debug, undefined);
  });

  void it("returns errors for unknown commands", async () => {
    const result = await createResultFor(["node", "cli", "unknown"]);

    assert.equal(result.status, "error");
    assert.equal(result.command, "unknown");
    assert.equal(result.message, "Unknown command: unknown");
  });

  void it("returns parser errors before command handling", async () => {
    const result = await createResultFor(["node", "cli", "verify", "--format", "xml"]);

    assert.equal(result.status, "error");
    assert.equal(result.message, "Invalid format 'xml'. Use 'text' or 'json'.");
  });

  void it("persists plan inventory and findings artifacts", async () => {
    const fixtureRoot = await createFixture([
      {
        content: JSON.stringify({
          devDependencies: {
            typescript: "^latest",
            vite: "^latest"
          },
          name: "result-fixture",
          scripts: {
            build: "vite build"
          }
        }),
        path: "package.json"
      },
      { content: "lockfileVersion: '9.0'", path: "pnpm-lock.yaml" }
    ]);

    try {
      const result = await createResultFor(["node", "cli", "plan", "--repo", fixtureRoot]);
      const data = requireRecord(result.data);
      const findings = requireRecord(data.findings);
      const summary = requireRecord(findings.summary);
      const run = requireRecord(data.run);
      const artifacts = requireRecord(run.artifacts);
      const latestArtifacts = requireRecord(run.latestArtifacts);
      const findingsPath = requireString(artifacts.findings);
      const inventoryPath = requireString(artifacts.inventory);
      const latestFindingsPath = requireString(latestArtifacts.findings);
      const latestInventoryPath = requireString(latestArtifacts.inventory);

      assert.equal(result.status, "ok");
      assert.equal(result.command, "plan");
      assert.equal(result.message, "Project inventory and deterministic findings created.");
      assert.ok(requireNumber(summary.total) > 0);
      assert.equal(path.dirname(requireString(run.path)), path.join(fixtureRoot, ".pimp-my-codebase", "runs"));
      assert.match(await readUtf8File(findingsPath), /"title": "Package manifest is missing guard scripts"/u);
      assert.match(await readUtf8File(inventoryPath), /"name": "result-fixture"/u);
      assert.match(await readUtf8File(latestFindingsPath), /"title": "Package manifest is missing guard scripts"/u);
      assert.match(await readUtf8File(latestInventoryPath), /"name": "result-fixture"/u);
    } finally {
      await removeFixture(fixtureRoot);
    }
  });
});
