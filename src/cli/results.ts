import path from "node:path";

import type { FindingsArtifact } from "../analysis/index.js";
import type { ApplyArtifact } from "../apply/index.js";
import type { PlanArtifact } from "../planning/index.js";
import type { VerificationArtifact } from "../verification/index.js";
import type {
  CliDebugInfo,
  CliResult,
  OutputFormat,
  ParsedCli,
} from "./types.js";

import { analyzeProject } from "../analysis/index.js";
import { applyPlan, loadPlanArtifact } from "../apply/index.js";
import { loadProjectConfig } from "../config/index.js";
import { generateLlmPlanReview } from "../llm/index.js";
import { createRun, writeJsonArtifact, writeTextArtifact } from "../persistence/index.js";
import { createImprovementPlan } from "../planning/index.js";
import { scanProject } from "../project/index.js";
import { createMarkdownReport } from "../reporting/index.js";
import { loadSkills } from "../skills/index.js";
import { runCheckGuards } from "../verification/index.js";
import { isKnownCommand } from "./commands.js";

const DEFAULT_PLAN_ARTIFACT_PATH = path.join(".pimp-my-codebase", "runs", "latest", "plan.json");

type AsyncResult<Value> =
  | {
      readonly status: "error";
      readonly message: string;
    }
  | {
      readonly status: "ok";
      readonly value: Value;
    };

async function captureAsyncResult<Value>(promise: Promise<Value>): Promise<AsyncResult<Value>> {
  try {
    return {
      status: "ok",
      value: await promise
    };
  } catch (error: unknown) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

function createEmptyFindingsArtifact(runId: string): FindingsArtifact {
  return {
    findings: [],
    runId,
    summary: {
      byCategory: {},
      bySeverity: {},
      total: 0
    }
  };
}

function createEmptyPlanArtifact(runId: string, createdAt: string): PlanArtifact {
  return {
    plan: {
      createdAt,
      id: `${runId}-verification-plan`,
      items: [],
      runId,
      status: "proposed"
    },
    runId,
    summary: {
      byPriority: {},
      byRisk: {},
      total: 0
    }
  };
}

function getVerificationIssueCount(verificationArtifact: VerificationArtifact): number {
  return (
    (verificationArtifact.summary.byStatus.failed ?? 0) +
    (verificationArtifact.summary.byStatus.skipped ?? 0) +
    (verificationArtifact.summary.byStatus.timed_out ?? 0)
  );
}

function getAppliedPatchSetCount(patchArtifact: ApplyArtifact): number {
  return patchArtifact.patchSets.filter((patchSet) => patchSet.status === "applied").length;
}

function getAllowHighRiskFlag(parsed: ParsedCli): boolean {
  const value = parsed.flags["allow-high-risk"];

  return value === true || value === "true";
}

function getItemsFlag(parsed: ParsedCli): string | undefined {
  const value = parsed.flags.items;

  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }

  return value;
}

function getPlanFlag(parsed: ParsedCli): string | undefined {
  const value = parsed.flags.plan;

  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }

  return value;
}

function parseSelectedItemIds(parsed: ParsedCli): readonly string[] {
  const rawItems = getItemsFlag(parsed);

  if (rawItems === undefined) {
    return [];
  }

  return rawItems
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function resolvePlanArtifactPath(projectRootPath: string, planPath: string | undefined): string {
  const selectedPlanPath = planPath ?? DEFAULT_PLAN_ARTIFACT_PATH;

  if (path.isAbsolute(selectedPlanPath)) {
    return selectedPlanPath;
  }

  return path.resolve(projectRootPath, selectedPlanPath);
}

export async function createResult(
  parsed: ParsedCli,
  debugInfo: CliDebugInfo,
): Promise<CliResult> {
  if (parsed.errors.length > 0) {
    const result: CliResult = {
      status: "error",
      message: parsed.errors.join(" "),
    };

    if (parsed.debug) {
      result.debug = debugInfo;
    }

    return result;
  }

  if (parsed.command === undefined || parsed.command.length === 0) {
    return {
      status: "ok",
      message: "Help printed.",
    };
  }

  if (!isKnownCommand(parsed.command)) {
    const result: CliResult = {
      status: "error",
      command: parsed.command,
      message: `Unknown command: ${parsed.command}`,
    };

    if (parsed.debug) {
      result.debug = debugInfo;
    }

    return result;
  }

  if (parsed.command === "debug") {
    const result: CliResult = {
      status: "ok",
      command: parsed.command,
      message: "CLI debug information.",
      data: debugInfo,
    };

    if (parsed.repoPath !== undefined && parsed.repoPath.length > 0) {
      result.repoPath = parsed.repoPath;
    }

    return result;
  }

  if (parsed.command === "plan") {
    const repoPath = parsed.repoPath ?? process.cwd();
    const configLoadResult = await loadProjectConfig(repoPath);

    if (configLoadResult.errors.length > 0) {
      const result: CliResult = {
        status: "error",
        command: parsed.command,
        data: configLoadResult,
        message: configLoadResult.errors.join(" "),
        repoPath,
      };

      if (parsed.debug) {
        result.debug = debugInfo;
      }

      return result;
    }

    const inventory = await scanProject({
      config: configLoadResult.config,
      repoPath,
    });
    const persistedRun = await createRun({
      mode: "plan",
      projectId: inventory.project.id,
      projectRootPath: inventory.project.rootPath
    });

    await writeJsonArtifact({
      artifactName: "inventory",
      run: persistedRun,
      value: inventory
    });
    const findingsArtifact = analyzeProject({
      inventory,
      runId: persistedRun.run.id
    });

    await writeJsonArtifact({
      artifactName: "findings",
      run: persistedRun,
      value: findingsArtifact
    });
    const skillLoadResult = await loadSkills({
      config: configLoadResult.config,
      projectRootPath: inventory.project.rootPath
    });
    const planArtifact = createImprovementPlan({
      createdAt: new Date(persistedRun.run.startedAt),
      findings: findingsArtifact.findings,
      runId: persistedRun.run.id,
      skillLoadResult
    });
    const llmReview = await generateLlmPlanReview({
      config: configLoadResult.config.llm,
      findingsArtifact,
      planArtifact,
      projectInventory: inventory
    });
    const reviewedPlanArtifact = {
      ...planArtifact,
      llmReview
    };

    await writeJsonArtifact({
      artifactName: "plan",
      run: persistedRun,
      value: reviewedPlanArtifact
    });
    const reportArtifact = createMarkdownReport({
      config: configLoadResult.config,
      configLoadResult,
      findingsArtifact,
      inventory,
      planArtifact: reviewedPlanArtifact,
      run: persistedRun.run
    });

    await writeTextArtifact({
      artifactName: "report",
      run: persistedRun,
      value: reportArtifact.markdown
    });

    const result: CliResult = {
      status: "ok",
      command: parsed.command,
      data: {
        config: {
          configPath: configLoadResult.configPath,
          source: configLoadResult.source,
          warnings: configLoadResult.warnings,
        },
        findings: findingsArtifact,
        inventory,
        plan: reviewedPlanArtifact,
        report: {
          latestPath: persistedRun.latestArtifacts.report,
          path: persistedRun.artifacts.report,
          summary: reportArtifact.summary,
          runId: reportArtifact.runId
        },
        run: {
          artifacts: persistedRun.artifacts,
          id: persistedRun.run.id,
          latestArtifacts: persistedRun.latestArtifacts,
          latestPath: persistedRun.latestPath,
          path: persistedRun.runPath
        },
        skills: skillLoadResult
      },
      message: "Project inventory, findings, skill-guided improvement plan, and report created.",
      repoPath,
    };

    if (parsed.debug) {
      result.debug = debugInfo;
    }

    return result;
  }

  if (parsed.command === "verify") {
    const repoPath = parsed.repoPath ?? process.cwd();
    const configLoadResult = await loadProjectConfig(repoPath);

    if (configLoadResult.errors.length > 0) {
      const result: CliResult = {
        status: "error",
        command: parsed.command,
        data: configLoadResult,
        message: configLoadResult.errors.join(" "),
        repoPath,
      };

      if (parsed.debug) {
        result.debug = debugInfo;
      }

      return result;
    }

    const inventory = await scanProject({
      config: configLoadResult.config,
      repoPath,
    });
    const persistedRun = await createRun({
      mode: "verify",
      projectId: inventory.project.id,
      projectRootPath: inventory.project.rootPath
    });

    await writeJsonArtifact({
      artifactName: "inventory",
      run: persistedRun,
      value: inventory
    });

    const verificationArtifact = await runCheckGuards({
      checkGuards: inventory.checkGuards,
      projectRootPath: inventory.project.rootPath,
      runId: persistedRun.run.id
    });

    await writeJsonArtifact({
      artifactName: "verification",
      run: persistedRun,
      value: verificationArtifact
    });

    const findingsArtifact = createEmptyFindingsArtifact(persistedRun.run.id);
    const planArtifact = createEmptyPlanArtifact(persistedRun.run.id, persistedRun.run.startedAt);
    const reportArtifact = createMarkdownReport({
      config: configLoadResult.config,
      configLoadResult,
      findingsArtifact,
      inventory,
      planArtifact,
      run: persistedRun.run,
      verificationArtifact
    });

    await writeTextArtifact({
      artifactName: "report",
      run: persistedRun,
      value: reportArtifact.markdown
    });

    const issueCount = getVerificationIssueCount(verificationArtifact);
    const result: CliResult = {
      status: "ok",
      command: parsed.command,
      data: {
        config: {
          configPath: configLoadResult.configPath,
          source: configLoadResult.source,
          warnings: configLoadResult.warnings,
        },
        inventory,
        report: {
          latestPath: persistedRun.latestArtifacts.report,
          path: persistedRun.artifacts.report,
          summary: reportArtifact.summary,
          runId: reportArtifact.runId
        },
        run: {
          artifacts: persistedRun.artifacts,
          id: persistedRun.run.id,
          latestArtifacts: persistedRun.latestArtifacts,
          latestPath: persistedRun.latestPath,
          path: persistedRun.runPath
        },
        verification: verificationArtifact
      },
      message:
        issueCount === 0
          ? "Configured check guards completed."
          : `Configured check guards completed with ${issueCount} issue(s).`,
      repoPath,
    };

    if (parsed.debug) {
      result.debug = debugInfo;
    }

    return result;
  }

  if (parsed.command === "apply") {
    const repoPath = parsed.repoPath ?? process.cwd();
    const configLoadResult = await loadProjectConfig(repoPath);

    if (configLoadResult.errors.length > 0) {
      const result: CliResult = {
        status: "error",
        command: parsed.command,
        data: configLoadResult,
        message: configLoadResult.errors.join(" "),
        repoPath,
      };

      if (parsed.debug) {
        result.debug = debugInfo;
      }

      return result;
    }

    const selectedItemIds = parseSelectedItemIds(parsed);

    if (selectedItemIds.length === 0) {
      const result: CliResult = {
        status: "error",
        command: parsed.command,
        message: "Apply requires at least one plan item ID via --items.",
        repoPath,
      };

      if (parsed.debug) {
        result.debug = debugInfo;
      }

      return result;
    }

    const initialInventory = await scanProject({
      config: configLoadResult.config,
      repoPath,
    });
    const planPath = resolvePlanArtifactPath(initialInventory.project.rootPath, getPlanFlag(parsed));
    const loadedPlanResult = await captureAsyncResult(loadPlanArtifact(planPath));

    if (loadedPlanResult.status === "error") {
      const result: CliResult = {
        status: "error",
        command: parsed.command,
        message: `Unable to load plan artifact at ${planPath}: ${loadedPlanResult.message}`,
        repoPath,
      };

      if (parsed.debug) {
        result.debug = debugInfo;
      }

      return result;
    }

    const { value: loadedPlan } = loadedPlanResult;

    const persistedRun = await createRun({
      mode: "apply",
      projectId: initialInventory.project.id,
      projectRootPath: initialInventory.project.rootPath
    });
    const patchArtifactResult = await captureAsyncResult(
      applyPlan({
        allowHighRisk: getAllowHighRiskFlag(parsed),
        config: configLoadResult.config,
        inventory: initialInventory,
        planArtifact: loadedPlan.artifact,
        runId: persistedRun.run.id,
        selectedItemIds
      })
    );

    if (patchArtifactResult.status === "error") {
      const result: CliResult = {
        status: "error",
        command: parsed.command,
        message: patchArtifactResult.message,
        repoPath,
      };

      if (parsed.debug) {
        result.debug = debugInfo;
      }

      return result;
    }

    const { value: patchArtifact } = patchArtifactResult;

    await writeJsonArtifact({
      artifactName: "patches",
      run: persistedRun,
      value: patchArtifact
    });
    await writeJsonArtifact({
      artifactName: "plan",
      run: persistedRun,
      value: loadedPlan.artifact
    });

    const inventory = await scanProject({
      config: configLoadResult.config,
      repoPath,
    });
    const findingsArtifact = analyzeProject({
      inventory,
      runId: persistedRun.run.id
    });

    await writeJsonArtifact({
      artifactName: "inventory",
      run: persistedRun,
      value: inventory
    });
    await writeJsonArtifact({
      artifactName: "findings",
      run: persistedRun,
      value: findingsArtifact
    });

    const verificationArtifact = await runCheckGuards({
      checkGuards: inventory.checkGuards,
      projectRootPath: inventory.project.rootPath,
      runId: persistedRun.run.id
    });

    await writeJsonArtifact({
      artifactName: "verification",
      run: persistedRun,
      value: verificationArtifact
    });

    const reportArtifact = createMarkdownReport({
      config: configLoadResult.config,
      configLoadResult,
      findingsArtifact,
      inventory,
      patchArtifact,
      planArtifact: loadedPlan.artifact,
      run: persistedRun.run,
      verificationArtifact
    });

    await writeTextArtifact({
      artifactName: "report",
      run: persistedRun,
      value: reportArtifact.markdown
    });

    const appliedPatchSetCount = getAppliedPatchSetCount(patchArtifact);
    const verificationIssueCount = getVerificationIssueCount(verificationArtifact);
    const result: CliResult = {
      status: "ok",
      command: parsed.command,
      data: {
        config: {
          configPath: configLoadResult.configPath,
          source: configLoadResult.source,
          warnings: configLoadResult.warnings,
        },
        findings: findingsArtifact,
        inventory,
        patches: patchArtifact,
        plan: loadedPlan.artifact,
        report: {
          latestPath: persistedRun.latestArtifacts.report,
          path: persistedRun.artifacts.report,
          summary: reportArtifact.summary,
          runId: reportArtifact.runId
        },
        run: {
          artifacts: persistedRun.artifacts,
          id: persistedRun.run.id,
          latestArtifacts: persistedRun.latestArtifacts,
          latestPath: persistedRun.latestPath,
          path: persistedRun.runPath
        },
        verification: verificationArtifact
      },
      message:
        verificationIssueCount === 0
          ? `Apply completed with ${appliedPatchSetCount} applied patch set(s).`
          : `Apply completed with ${appliedPatchSetCount} applied patch set(s) and ${verificationIssueCount} verification issue(s).`,
      repoPath,
    };

    if (parsed.debug) {
      result.debug = debugInfo;
    }

    return result;
  }

  const result: CliResult = {
    status: "not_implemented",
    command: parsed.command,
    message: `Command '${parsed.command}' is scaffolded but not implemented yet.`,
  };

  if (parsed.repoPath !== undefined && parsed.repoPath.length > 0) {
    result.repoPath = parsed.repoPath;
  }

  if (parsed.debug) {
    result.debug = debugInfo;
  }

  return result;
}

export function printResult(result: CliResult, format: OutputFormat): void {
  if (format === "json") {
    console.log(JSON.stringify(result, undefined, 2));
    return;
  }

  if (result.debug) {
    console.error(`[debug] ${JSON.stringify(result.debug, undefined, 2)}`);
  }

  if (result.status === "error") {
    console.error(result.message);
    console.error("Run `pimp-my-codebase --help` for usage.");
    return;
  }

  console.log(result.message);

  if (result.command === "debug" && result.data !== undefined) {
    console.log(JSON.stringify(result.data, undefined, 2));
  }
}
