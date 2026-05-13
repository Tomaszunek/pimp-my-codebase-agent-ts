import type { ProjectConfig } from "../config/index.js";
import type { FileChange, PatchSet, PlanItem } from "../core/index.js";
import type { PlanArtifact } from "../planning/index.js";
import type { ProjectInventory } from "../project/index.js";

export interface ApplyArtifact {
  readonly patchSets: readonly PatchSet[];
  readonly runId: string;
  readonly summary: ApplySummary;
}

export interface ApplyPlanOptions {
  readonly allowHighRisk: boolean;
  readonly config: ProjectConfig;
  readonly inventory: ProjectInventory;
  readonly planArtifact: PlanArtifact;
  readonly runId: string;
  readonly selectedItemIds: readonly string[];
}

export interface ApplySummary {
  readonly byStatus: Readonly<Record<string, number>>;
  readonly changedFiles: number;
  readonly total: number;
}

export interface LoadedPlanArtifact {
  readonly artifact: PlanArtifact;
  readonly warnings: readonly string[];
}

export interface PatchRecipeResult {
  readonly changes: readonly FileChange[];
  readonly status: PatchSet["status"];
  readonly summary: string;
}

export interface PlanSelectionResult {
  readonly errors: readonly string[];
  readonly selectedItems: readonly PlanItem[];
}
