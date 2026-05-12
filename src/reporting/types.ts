import type { FindingsArtifact } from "../analysis/index.js";
import type { ConfigLoadResult, ProjectConfig } from "../config/index.js";
import type { AgentRun } from "../core/index.js";
import type { PlanArtifact } from "../planning/index.js";
import type { ProjectInventory } from "../project/index.js";

export interface CreateMarkdownReportOptions {
  readonly config: ProjectConfig;
  readonly configLoadResult: Pick<ConfigLoadResult, "configPath" | "source" | "warnings">;
  readonly findingsArtifact: FindingsArtifact;
  readonly inventory: ProjectInventory;
  readonly planArtifact: PlanArtifact;
  readonly run: AgentRun;
}

export interface MarkdownReportArtifact {
  readonly markdown: string;
  readonly runId: string;
  readonly summary: MarkdownReportSummary;
}

export interface MarkdownReportSummary {
  readonly findingCount: number;
  readonly planItemCount: number;
  readonly skippedPathCount: number;
}
