import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Finding } from "../core/index.js";

import { createImprovementPlan } from "./create-plan.js";

const CREATED_AT = new Date("2026-05-12T12:00:00.000Z");
const EXPECTED_PLAN_ITEM_COUNT = 3;
const RUN_ID = "run-test";

function createFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    category: "developer_experience",
    confidence: 1,
    evidence: [
      {
        message: "Evidence",
        source: "test"
      }
    ],
    id: "finding-test",
    recommendedRemediation: "Fix it.",
    runId: RUN_ID,
    severity: "medium",
    title: "Test finding",
    ...overrides
  };
}

void describe("createImprovementPlan", () => {
  void it("groups findings into ranked proposed plan items", () => {
    const artifact = createImprovementPlan({
      createdAt: CREATED_AT,
      findings: [
        createFinding({
          category: "documentation",
          id: "finding-docs",
          severity: "low",
          title: "README is missing"
        }),
        createFinding({
          category: "testing",
          id: "finding-tests",
          severity: "medium",
          title: "No test setup detected"
        }),
        createFinding({
          category: "developer_experience",
          id: "finding-scripts",
          severity: "medium",
          title: "Package manifest is missing guard scripts"
        }),
        createFinding({
          category: "developer_experience",
          id: "finding-lockfile",
          severity: "medium",
          title: "Expected pnpm lockfile is missing"
        })
      ],
      runId: RUN_ID
    });
    const [firstItem, secondItem] = artifact.plan.items;
    const developerExperienceItem = artifact.plan.items.find((item) => item.category === "developer_experience");

    assert.equal(artifact.runId, RUN_ID);
    assert.equal(artifact.plan.status, "proposed");
    assert.equal(artifact.plan.createdAt, CREATED_AT.toISOString());
    assert.equal(artifact.summary.total, EXPECTED_PLAN_ITEM_COUNT);
    assert.ok(firstItem);
    assert.equal(firstItem.category, "testing");
    assert.equal(firstItem.priority, "medium");
    assert.ok(secondItem);
    assert.equal(secondItem.category, "developer_experience");
    assert.ok(developerExperienceItem);
    assert.equal(developerExperienceItem.findingIds.length, 2);
    assert.equal(developerExperienceItem.status, "proposed");
    assert.equal(developerExperienceItem.risk, "medium");
    assert.equal(developerExperienceItem.effort, "medium");
    assert.equal(developerExperienceItem.title, "Stabilize development workflow and verification commands");
    assert.ok(developerExperienceItem.acceptanceCriteria.length > 0);
  });

  void it("creates an empty proposed plan when no findings exist", () => {
    const artifact = createImprovementPlan({
      createdAt: CREATED_AT,
      findings: [],
      runId: RUN_ID
    });

    assert.equal(artifact.plan.status, "proposed");
    assert.deepEqual(artifact.plan.items, []);
    assert.equal(artifact.summary.total, 0);
  });
});
