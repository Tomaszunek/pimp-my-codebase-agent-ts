import type { FindingsArtifact } from "../analysis/index.js";
import type { LlmConfig } from "../config/index.js";
import type { PlanArtifact } from "../planning/index.js";
import type { ProjectInventory } from "../project/index.js";

export type LlmPlanReviewStatus = "completed" | "disabled" | "failed" | "skipped";

export interface GenerateLlmPlanReviewOptions {
  readonly config: LlmConfig;
  readonly findingsArtifact: FindingsArtifact;
  readonly planArtifact: PlanArtifact;
  readonly sdkLoader?: LmStudioSdkLoader;
  readonly projectInventory: ProjectInventory;
}

export interface LlmPlanReview {
  readonly baseUrl?: string;
  readonly content?: string;
  readonly model?: string;
  readonly provider: LlmConfig["provider"];
  readonly status: LlmPlanReviewStatus;
  readonly warnings: readonly string[];
}

export interface LmStudioClientConstructorOptions {
  readonly baseUrl?: string;
}

export interface LmStudioClientLike {
  readonly [Symbol.asyncDispose]?: () => Promise<void>;
  readonly llm: LmStudioLlmNamespaceLike;
}

export interface LmStudioLlmNamespaceLike {
  readonly model: (modelKey?: string) => Promise<LmStudioModelLike>;
}

export interface LmStudioModelLike {
  readonly respond: (chat: string, options?: LmStudioRespondOptions) => LmStudioPredictionLike;
}

export interface LmStudioPredictionLike extends PromiseLike<LmStudioPredictionResultLike> {
  readonly cancel: () => Promise<void>;
}

export interface LmStudioPredictionResultLike {
  readonly content: string;
}

export interface LmStudioRespondOptions {
  readonly maxTokens?: number | false;
  readonly temperature?: number;
}

export interface LmStudioSdkModule {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- External SDK export name.
  readonly LMStudioClient: new (options?: LmStudioClientConstructorOptions) => LmStudioClientLike;
}

export type LmStudioSdkLoader = () => Promise<LmStudioSdkModule>;
