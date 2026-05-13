import type { FindingsArtifact } from "../analysis/index.js";
import type { ApplyArtifact } from "../apply/index.js";
import type { ConfigLoadResult, ProjectConfig } from "../config/index.js";
import type { AgentRun } from "../core/index.js";
import type { PlanArtifact } from "../planning/index.js";
import type { ProjectInventory } from "../project/index.js";
import type { VerificationArtifact } from "../verification/index.js";

export interface CreateMarkdownReportOptions {
  readonly config: ProjectConfig;
  readonly configLoadResult: Pick<ConfigLoadResult, "configPath" | "source" | "warnings">;
  readonly findingsArtifact: FindingsArtifact;
  readonly inventory: ProjectInventory;
  readonly patchArtifact?: ApplyArtifact;
  readonly planArtifact: PlanArtifact;
  readonly run: AgentRun;
  readonly verificationArtifact?: VerificationArtifact;
}

export interface MarkdownReportArtifact {
  readonly markdown: string;
  readonly runId: string;
  readonly summary: MarkdownReportSummary;
}

export interface MarkdownReportSummary {
  readonly findingCount: number;
  readonly patchSetCount: number;
  readonly planItemCount: number;
  readonly skippedPathCount: number;
  readonly verificationCount: number;
}
