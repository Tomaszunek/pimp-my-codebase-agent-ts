import type { Finding, FindingCategory, FindingSeverity } from "../core/index.js";
import type { ProjectInventory } from "../project/index.js";

export interface AnalyzeProjectOptions {
  readonly inventory: ProjectInventory;
  readonly runId: string;
}

export interface FindingsArtifact {
  readonly findings: readonly Finding[];
  readonly runId: string;
  readonly summary: FindingsSummary;
}

export interface FindingsSummary {
  readonly byCategory: Readonly<Record<string, number>>;
  readonly bySeverity: Readonly<Record<string, number>>;
  readonly total: number;
}

export interface PendingFinding {
  readonly analyzerId: string;
  readonly category: FindingCategory;
  readonly confidence: number;
  readonly evidence: readonly Finding["evidence"][number][];
  readonly recommendedRemediation: string;
  readonly severity: FindingSeverity;
  readonly title: string;
}
