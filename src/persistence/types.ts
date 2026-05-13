import type { AgentRun } from "../core/index.js";

export type RunJsonArtifactName = "findings" | "inventory" | "patches" | "plan" | "verification";
export type RunTextArtifactName = "report";
export type RunArtifactName = RunJsonArtifactName | RunTextArtifactName;

export interface CreateRunOptions {
  readonly completedAt?: Date;
  readonly mode: AgentRun["mode"];
  readonly projectId: string;
  readonly projectRootPath: string;
  readonly runId?: string;
  readonly startedAt?: Date;
}

export interface PersistedRun {
  readonly artifacts: RunArtifactPaths;
  readonly latestArtifacts: RunArtifactPaths;
  readonly latestPath: string;
  readonly run: AgentRun;
  readonly runPath: string;
  readonly store: RunStore;
}

export interface RunArtifactPaths {
  readonly findings: string;
  readonly inventory: string;
  readonly patches: string;
  readonly plan: string;
  readonly report: string;
  readonly run: string;
  readonly verification: string;
}

export interface RunStore {
  readonly latestPath: string;
  readonly projectRootPath: string;
  readonly rootPath: string;
  readonly runsPath: string;
}

export interface WriteJsonArtifactOptions {
  readonly artifactName: RunJsonArtifactName;
  readonly run: PersistedRun;
  readonly value: unknown;
}

export interface WriteTextArtifactOptions {
  readonly artifactName: RunTextArtifactName;
  readonly run: PersistedRun;
  readonly value: string;
}
