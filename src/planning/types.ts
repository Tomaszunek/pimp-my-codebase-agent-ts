import type { Finding, FindingCategory, ImprovementPlan, PlanItem } from "../core/index.js";
import type { LlmPlanReview } from "../llm/index.js";

export interface CreateImprovementPlanOptions {
  readonly createdAt?: Date;
  readonly findings: readonly Finding[];
  readonly runId: string;
}

export interface PlanArtifact {
  readonly llmReview?: LlmPlanReview;
  readonly plan: ImprovementPlan;
  readonly runId: string;
  readonly summary: PlanSummary;
}

export interface PlanGroup {
  readonly findings: readonly Finding[];
  readonly key: FindingCategory;
}

export interface PlanSummary {
  readonly byPriority: Readonly<Record<string, number>>;
  readonly byRisk: Readonly<Record<string, number>>;
  readonly total: number;
}

export interface PendingPlanItem {
  readonly acceptanceCriteria: readonly string[];
  readonly category: PlanItem["category"];
  readonly effort: PlanItem["effort"];
  readonly findingIds: readonly string[];
  readonly priority: PlanItem["priority"];
  readonly risk: PlanItem["risk"];
  readonly title: string;
}
