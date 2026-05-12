export type AgentRunMode = "apply" | "debug" | "plan" | "report" | "verify";
export type AgentRunStatus = "cancelled" | "completed" | "failed" | "running";

export type CheckGuardPurpose = "build" | "custom" | "format" | "lint" | "test" | "typecheck";

export type FileChangeType = "create" | "delete" | "modify" | "rename";

export type FindingCategory =
  | "accessibility"
  | "architecture"
  | "correctness"
  | "developer_experience"
  | "documentation"
  | "maintainability"
  | "modernization"
  | "performance"
  | "security"
  | "testing"
  | "ui_polish";

export type FindingSeverity = "critical" | "high" | "info" | "low" | "medium";

export type ImprovementPlanStatus = "approved" | "applied" | "draft" | "proposed" | "rejected";

export type JsonArray = readonly JsonValue[];
export type JsonValue = JsonArray | JsonObject | boolean | number | string;

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export type PackageDependencyMap = Readonly<Record<string, string>>;
export type PackageManager = "bun" | "npm" | "pnpm" | "unknown" | "yarn";

export type PatchSetStatus = "applied" | "failed" | "pending" | "reverted" | "skipped";

export type PlanItemEffort = "large" | "medium" | "small";
export type PlanItemPriority = "critical" | "high" | "low" | "medium";
export type PlanItemRisk = "high" | "low" | "medium";
export type PlanItemStatus = "approved" | "applied" | "blocked" | "proposed" | "rejected" | "skipped";

export type ProjectFileKind =
  | "asset"
  | "build"
  | "config"
  | "documentation"
  | "generated"
  | "lockfile"
  | "manifest"
  | "source"
  | "style"
  | "test"
  | "unknown";

export type ProjectType = "frontend" | "fullstack" | "node" | "unknown";

export type VerificationResultLevel = "error" | "info" | "warning";
export type VerificationRunStatus = "failed" | "passed" | "running" | "skipped" | "timed_out";

export interface AgentRun {
  readonly completedAt?: string;
  readonly id: string;
  readonly mode: AgentRunMode;
  readonly projectId: string;
  readonly startedAt: string;
  readonly status: AgentRunStatus;
}

export interface CheckGuard {
  readonly command: string;
  readonly id: string;
  readonly projectId: string;
  readonly purpose: CheckGuardPurpose;
  readonly timeoutSeconds: number;
}

export interface FileChange {
  readonly changeType: FileChangeType;
  readonly id: string;
  readonly linesAdded: number;
  readonly linesRemoved: number;
  readonly patchSetId: string;
  readonly path: string;
}

export interface Finding {
  readonly category: FindingCategory;
  readonly confidence: number;
  readonly evidence: readonly FindingEvidence[];
  readonly id: string;
  readonly recommendedRemediation: string;
  readonly runId: string;
  readonly severity: FindingSeverity;
  readonly title: string;
}

export interface FindingEvidence {
  readonly filePath?: string;
  readonly line?: number;
  readonly message: string;
  readonly source: string;
  readonly value?: JsonValue;
}

export interface ImprovementPlan {
  readonly createdAt: string;
  readonly id: string;
  readonly items: readonly PlanItem[];
  readonly runId: string;
  readonly status: ImprovementPlanStatus;
}

export interface PackageManifest {
  readonly dependencies: PackageDependencyMap;
  readonly devDependencies: PackageDependencyMap;
  readonly id: string;
  readonly name?: string;
  readonly path: string;
  readonly peerDependencies: PackageDependencyMap;
  readonly projectId: string;
  readonly scripts: PackageDependencyMap;
  readonly version?: string;
}

export interface PatchSet {
  readonly changes: readonly FileChange[];
  readonly id: string;
  readonly planItemId: string;
  readonly runId: string;
  readonly status: PatchSetStatus;
  readonly summary: string;
}

export interface PlanItem {
  readonly acceptanceCriteria: readonly string[];
  readonly category: FindingCategory;
  readonly effort: PlanItemEffort;
  readonly findingIds: readonly string[];
  readonly id: string;
  readonly planId: string;
  readonly priority: PlanItemPriority;
  readonly risk: PlanItemRisk;
  readonly status: PlanItemStatus;
  readonly title: string;
}

export interface Project {
  readonly id: string;
  readonly name: string;
  readonly packageManager: PackageManager;
  readonly projectType: ProjectType;
  readonly rootPath: string;
}

export interface ProjectFile {
  readonly contentHash: string;
  readonly id: string;
  readonly kind: ProjectFileKind;
  readonly language: string;
  readonly path: string;
  readonly projectId: string;
  readonly sizeBytes: number;
}

export interface RunReport {
  readonly id: string;
  readonly jsonPath: string;
  readonly markdownPath: string;
  readonly runId: string;
  readonly summary: RunReportSummary;
}

export interface RunReportSummary {
  readonly findingCount: number;
  readonly planItemCount: number;
  readonly verificationCount: number;
}

export interface VerificationResult {
  readonly filePath?: string;
  readonly id: string;
  readonly level: VerificationResultLevel;
  readonly line?: number;
  readonly message: string;
  readonly verificationRunId: string;
}

export interface VerificationRun {
  readonly checkGuardId: string;
  readonly completedAt?: string;
  readonly durationMs: number;
  readonly exitCode?: number;
  readonly id: string;
  readonly results: readonly VerificationResult[];
  readonly runId: string;
  readonly startedAt: string;
  readonly status: VerificationRunStatus;
}
