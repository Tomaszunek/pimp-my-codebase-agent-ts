import type {
  CliDebugInfo,
  CliResult,
  OutputFormat,
  ParsedCli,
} from "./types.js";

import { analyzeProject } from "../analysis/index.js";
import { loadProjectConfig } from "../config/index.js";
import { generateLlmPlanReview } from "../llm/index.js";
import { createRun, writeJsonArtifact, writeTextArtifact } from "../persistence/index.js";
import { createImprovementPlan } from "../planning/index.js";
import { scanProject } from "../project/index.js";
import { createMarkdownReport } from "../reporting/index.js";
import { loadSkills } from "../skills/index.js";
import { isKnownCommand } from "./commands.js";

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
