import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { FindingsArtifact } from "../analysis/index.js";
import type { ProjectConfig } from "../config/index.js";
import type { AgentRun, Finding, PlanItem } from "../core/index.js";
import type { PlanArtifact } from "../planning/index.js";
import type { ProjectInventory } from "../project/index.js";

import { DEFAULT_PROJECT_CONFIG } from "../config/index.js";
import { createMarkdownReport } from "./markdown-report.js";

const RUN_ID = "run-test";
const CHECK_TIMEOUT_SECONDS = 120;
const PACKAGE_FILE_SIZE_BYTES = 100;

const run: AgentRun = {
  completedAt: "2026-05-12T12:01:00.000Z",
  id: RUN_ID,
  mode: "plan",
  projectId: "project-test",
  startedAt: "2026-05-12T12:00:00.000Z",
  status: "completed"
};

const config: ProjectConfig = DEFAULT_PROJECT_CONFIG;

const finding: Finding = {
  category: "developer_experience",
  confidence: 1,
  evidence: [
    {
      filePath: "package.json",
      message: "The root package manifest is missing one or more guard scripts.",
      source: "scripts-analyzer",
      value: "typecheck"
    }
  ],
  id: "finding-scripts",
  recommendedRemediation: "Add explicit build, lint, test, and typecheck scripts.",
  runId: RUN_ID,
  severity: "medium",
  title: "Package manifest is missing guard scripts"
};

const planItem: PlanItem = {
  acceptanceCriteria: ["Configured check guards map to real project commands."],
  category: "developer_experience",
  effort: "small",
  findingIds: ["finding-scripts"],
  id: "item-dev-workflow",
  planId: "plan-test",
  priority: "medium",
  risk: "low",
  status: "proposed",
  title: "Stabilize development workflow and verification commands"
};

const findingsArtifact: FindingsArtifact = {
  findings: [finding],
  runId: RUN_ID,
  summary: {
    byCategory: Object.fromEntries([["developer_experience", 1]]),
    bySeverity: {
      medium: 1
    },
    total: 1
  }
};

const planArtifact: PlanArtifact = {
  plan: {
    createdAt: "2026-05-12T12:00:00.000Z",
    id: "plan-test",
    items: [planItem],
    runId: RUN_ID,
    status: "proposed"
  },
  runId: RUN_ID,
  summary: {
    byPriority: {
      medium: 1
    },
    byRisk: {
      low: 1
    },
    total: 1
  }
};

const inventory: ProjectInventory = {
  checkGuards: [
    {
      command: "pnpm typecheck",
      id: "typecheck",
      projectId: "project-test",
      purpose: "typecheck",
      timeoutSeconds: CHECK_TIMEOUT_SECONDS
    }
  ],
  configFiles: [],
  files: [
    {
      contentHash: "hash-package",
      id: "file-package",
      kind: "manifest",
      language: "json",
      path: "package.json",
      projectId: "project-test",
      sizeBytes: PACKAGE_FILE_SIZE_BYTES
    }
  ],
  packageManifests: [],
  project: {
    id: "project-test",
    name: "fixture",
    packageManager: "pnpm",
    projectType: "frontend",
    rootPath: "fixture"
  },
  skippedPaths: [
    {
      path: ".env",
      reason: "forbidden"
    }
  ],
  stackSignals: {
    eslint: true,
    next: false,
    playwright: false,
    prettier: false,
    react: true,
    storybook: false,
    tailwind: false,
    typescript: true,
    vite: true,
    vitest: false
  },
  warnings: []
};

void describe("createMarkdownReport", () => {
  void it("creates a human-readable report from run artifacts", () => {
    const report = createMarkdownReport({
      config,
      configLoadResult: {
        source: "defaults",
        warnings: []
      },
      findingsArtifact,
      inventory,
      planArtifact,
      run
    });

    assert.equal(report.runId, RUN_ID);
    assert.equal(report.summary.findingCount, 1);
    assert.equal(report.summary.planItemCount, 1);
    assert.match(report.markdown, /^# Pimp My Codebase Report/u);
    assert.match(report.markdown, /## Detected Project Facts/u);
    assert.match(report.markdown, /## Safety And Privacy Summary/u);
    assert.match(report.markdown, /## Findings By Category/u);
    assert.match(report.markdown, /Package manifest is missing guard scripts/u);
    assert.match(report.markdown, /## Skill Guidance/u);
    assert.match(report.markdown, /## Prioritized Plan/u);
    assert.match(report.markdown, /item-dev-workflow/u);
    assert.match(report.markdown, /## Suggested Check Guards/u);
    assert.match(report.markdown, /pnpm typecheck/u);
    assert.match(report.markdown, /## Skipped And Ignored Paths/u);
    assert.match(report.markdown, /## Next Actions/u);
  });
});
