import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

import { DEFAULT_PROJECT_CONFIG } from "../config/index.js";
import { createSkillPlanGuidance, loadSkills } from "./index.js";

const EXPECTED_DEFAULT_SKILL_COUNT = 3;
const EXPECTED_DEFAULT_MAINTAINABILITY_WEIGHT = 7;
const CUSTOM_SKILL_WEIGHT = 5;

async function createFixture(): Promise<string> {
  const fixtureRoot = path.join(process.cwd(), ".test-tmp", randomUUID());

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Tests create isolated fixtures under the workspace.
  await mkdir(fixtureRoot, { recursive: true });

  return fixtureRoot;
}

async function removeFixture(fixtureRoot: string): Promise<void> {
  const testRoot = path.resolve(process.cwd(), ".test-tmp");
  const resolvedFixtureRoot = path.resolve(fixtureRoot);

  assert.ok(resolvedFixtureRoot.startsWith(`${testRoot}${path.sep}`));
  await rm(resolvedFixtureRoot, { force: true, recursive: true });
}

void describe("loadSkills", () => {
  void it("loads default built-in skills from config names", async () => {
    const result = await loadSkills({
      config: DEFAULT_PROJECT_CONFIG,
      projectRootPath: process.cwd()
    });
    const guidance = createSkillPlanGuidance(result);

    assert.equal(result.loaded.length, EXPECTED_DEFAULT_SKILL_COUNT);
    assert.deepEqual(result.requested, DEFAULT_PROJECT_CONFIG.skills);
    assert.deepEqual(result.warnings, []);
    assert.ok(guidance.loadedSkillNames.includes("modernize"));
    assert.ok(guidance.loadedSkillNames.includes("quality"));
    assert.ok(guidance.loadedSkillNames.includes("frontend-polish"));
    assert.equal(guidance.categoryWeights.maintainability, EXPECTED_DEFAULT_MAINTAINABILITY_WEIGHT);
  });

  void it("loads project-local custom skill markdown by name", async () => {
    const fixtureRoot = await createFixture();
    const skillsDirectory = path.join(fixtureRoot, ".pimp-my-codebase", "skills");
    const skillPath = path.join(skillsDirectory, "local-quality.md");

    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Tests create isolated fixture files under the workspace.
      await mkdir(skillsDirectory, { recursive: true });
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Tests create isolated fixture files under the workspace.
      await writeFile(
        skillPath,
        `# local-quality

## Intent
Favor tiny local quality edits.

## Preferred Project Signals
- typescript

## Allowed Change Types
- maintainability

## Forbidden Change Types
- broad rewrite

## Scoring Weights
- maintainability: ${CUSTOM_SKILL_WEIGHT}

## Preferred Check Guards
- lint

## Report Sections
- maintainability
`
      );

      const result = await loadSkills({
        config: {
          ...DEFAULT_PROJECT_CONFIG,
          skills: ["local-quality"]
        },
        projectRootPath: fixtureRoot
      });
      const [skill] = result.loaded;

      assert.ok(skill);
      assert.equal(skill.source, "project");
      assert.equal(skill.sourcePath, skillPath);
      assert.equal(skill.scoringWeights.maintainability, CUSTOM_SKILL_WEIGHT);
      assert.deepEqual(result.warnings, []);
    } finally {
      await removeFixture(fixtureRoot);
    }
  });

  void it("warns and skips invalid or missing skill names", async () => {
    const result = await loadSkills({
      config: {
        ...DEFAULT_PROJECT_CONFIG,
        skills: ["../bad", "missing-skill"]
      },
      projectRootPath: process.cwd()
    });

    assert.deepEqual(result.loaded, []);
    assert.equal(result.warnings.length, 2);
  });
});
