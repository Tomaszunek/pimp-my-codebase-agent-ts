import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

import type { CheckGuard } from "../core/index.js";

import { runCheckGuards } from "./index.js";

const RUN_ID = "run-verify-test";
const TEST_TIMEOUT_SECONDS = 10;

async function createFixture(): Promise<string> {
  const fixtureRoot = path.join(process.cwd(), ".test-tmp", randomUUID());

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Tests create isolated fixtures under the workspace.
  await mkdir(fixtureRoot, { recursive: true });

  return fixtureRoot;
}

function createCheckGuard(overrides: Partial<CheckGuard> = {}): CheckGuard {
  return {
    command: `"${process.execPath}" -e "console.log('ok')"`,
    id: "node-ok",
    projectId: "project-test",
    purpose: "custom",
    timeoutSeconds: TEST_TIMEOUT_SECONDS,
    ...overrides
  };
}

async function removeFixture(fixtureRoot: string): Promise<void> {
  const testRoot = path.resolve(process.cwd(), ".test-tmp");
  const resolvedFixtureRoot = path.resolve(fixtureRoot);

  assert.ok(resolvedFixtureRoot.startsWith(`${testRoot}${path.sep}`));
  await rm(resolvedFixtureRoot, { force: true, recursive: true });
}

void describe("runCheckGuards", () => {
  void it("runs configured commands and captures stdout", async () => {
    const fixtureRoot = await createFixture();

    try {
      const artifact = await runCheckGuards({
        checkGuards: [createCheckGuard()],
        projectRootPath: fixtureRoot,
        runId: RUN_ID
      });
      const [verificationRun] = artifact.verificationRuns;

      assert.equal(artifact.summary.total, 1);
      assert.equal(artifact.summary.byStatus.passed, 1);
      assert.ok(verificationRun);
      assert.equal(verificationRun.status, "passed");
      assert.equal(verificationRun.exitCode, 0);
      assert.equal(verificationRun.stdoutSummary, "ok\n");
    } finally {
      await removeFixture(fixtureRoot);
    }
  });

  void it("records failed exit codes", async () => {
    const fixtureRoot = await createFixture();

    try {
      const artifact = await runCheckGuards({
        checkGuards: [
          createCheckGuard({
            command: `"${process.execPath}" -e "process.exit(1)"`,
            id: "node-fail"
          })
        ],
        projectRootPath: fixtureRoot,
        runId: RUN_ID
      });
      const [verificationRun] = artifact.verificationRuns;

      assert.equal(artifact.summary.byStatus.failed, 1);
      assert.ok(verificationRun);
      assert.equal(verificationRun.status, "failed");
      assert.equal(verificationRun.exitCode, 1);
    } finally {
      await removeFixture(fixtureRoot);
    }
  });

  void it("skips commands that contain shell control syntax", async () => {
    const fixtureRoot = await createFixture();

    try {
      const artifact = await runCheckGuards({
        checkGuards: [
          createCheckGuard({
            command: `"${process.execPath}" -e "console.log('ok')" && "${process.execPath}" -e "console.log('again')"`,
            id: "node-unsafe"
          })
        ],
        projectRootPath: fixtureRoot,
        runId: RUN_ID
      });
      const [verificationRun] = artifact.verificationRuns;

      assert.equal(artifact.summary.byStatus.skipped, 1);
      assert.ok(verificationRun);
      assert.equal(verificationRun.status, "skipped");
      assert.match(verificationRun.stderrSummary, /shell control syntax/u);
    } finally {
      await removeFixture(fixtureRoot);
    }
  });
});
