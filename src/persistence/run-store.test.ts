import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

import { createRun, resolveLatestRunPath, writeJsonArtifact, writeTextArtifact } from "./run-store.js";

const FIXED_COMPLETED_AT = new Date("2026-05-12T10:15:31.000Z");
const FIXED_STARTED_AT = new Date("2026-05-12T10:15:30.000Z");
const PROJECT_ID = "project-test";
const RUN_ID = "run-test";

async function createFixture(): Promise<string> {
  const fixtureRoot = path.join(process.cwd(), ".test-tmp", randomUUID());

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Tests create isolated fixtures under the workspace.
  await mkdir(fixtureRoot, { recursive: true });

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

void describe("run store", () => {
  void it("creates a stable run directory with initial artifacts", async () => {
    const fixtureRoot = await createFixture();

    try {
      const persistedRun = await createRun({
        completedAt: FIXED_COMPLETED_AT,
        mode: "plan",
        projectId: PROJECT_ID,
        projectRootPath: fixtureRoot,
        runId: RUN_ID,
        startedAt: FIXED_STARTED_AT
      });

      assert.equal(persistedRun.run.id, RUN_ID);
      assert.equal(persistedRun.run.startedAt, FIXED_STARTED_AT.toISOString());
      assert.equal(persistedRun.run.completedAt, FIXED_COMPLETED_AT.toISOString());
      assert.equal(persistedRun.runPath, path.join(fixtureRoot, ".pimp-my-codebase", "runs", RUN_ID));
      assert.match(await readUtf8File(persistedRun.artifacts.inventory), /"runId": "run-test"/u);
      assert.match(await readUtf8File(persistedRun.artifacts.patches), /"patchSets": \[\]/u);
      assert.match(await readUtf8File(persistedRun.artifacts.report), /Pimp My Codebase Run run-test/u);
      assert.equal(await resolveLatestRunPath(fixtureRoot), persistedRun.runPath);
    } finally {
      await removeFixture(fixtureRoot);
    }
  });

  void it("writes artifacts to both the stable run and latest directory", async () => {
    const fixtureRoot = await createFixture();

    try {
      const persistedRun = await createRun({
        completedAt: FIXED_COMPLETED_AT,
        mode: "plan",
        projectId: PROJECT_ID,
        projectRootPath: fixtureRoot,
        runId: RUN_ID,
        startedAt: FIXED_STARTED_AT
      });

      await writeJsonArtifact({
        artifactName: "inventory",
        run: persistedRun,
        value: {
          project: {
            id: PROJECT_ID
          },
          runId: RUN_ID
        }
      });
      await writeTextArtifact({
        artifactName: "report",
        run: persistedRun,
        value: "# Updated report\n"
      });

      assert.match(await readUtf8File(persistedRun.artifacts.inventory), /"id": "project-test"/u);
      assert.match(await readUtf8File(persistedRun.latestArtifacts.inventory), /"id": "project-test"/u);
      assert.equal(await readUtf8File(persistedRun.artifacts.report), "# Updated report\n");
      assert.equal(await readUtf8File(persistedRun.latestArtifacts.report), "# Updated report\n");
    } finally {
      await removeFixture(fixtureRoot);
    }
  });
});
