import type {
  GenerateLlmPlanReviewOptions,
  LlmPlanReview,
  LmStudioClientLike,
  LmStudioPredictionLike,
  LmStudioPredictionResultLike,
  LmStudioSdkModule
} from "./types.js";

const DEFAULT_LMSTUDIO_SDK_BASE_URL = "ws://127.0.0.1:1234";
const LLM_DISABLED_MESSAGE = "LM Studio integration is disabled in project config.";
const MAX_PROMPT_FINDINGS = 12;
const MAX_PROMPT_PLAN_ITEMS = 8;
const MAX_REVIEW_TOKENS = 700;
const MILLISECONDS_PER_SECOND = 1000;
const SDK_PACKAGE_NAME = "@lmstudio/sdk";
const TEMPERATURE = 0.2;

export function normalizeLmStudioBaseUrl(baseUrl: string): string | undefined {
  const trimmedBaseUrl = baseUrl.trim();

  if (trimmedBaseUrl.length === 0) {
    return undefined;
  }

  try {
    const url = new URL(trimmedBaseUrl);

    if (url.protocol === "ws:" || url.protocol === "wss:") {
      return url.toString().replace(/\/$/u, "");
    }

    if (url.protocol === "http:" || url.protocol === "https:") {
      const protocol = url.protocol === "http:" ? "ws:" : "wss:";
      const path = url.pathname === "/" || url.pathname === "/v1" ? "" : url.pathname.replace(/\/$/u, "");

      return `${protocol}//${url.host}${path}`;
    }
  } catch {
    return trimmedBaseUrl;
  }

  return trimmedBaseUrl;
}

function createDisabledReview(options: GenerateLlmPlanReviewOptions): LlmPlanReview {
  return {
    provider: options.config.provider,
    status: "disabled",
    warnings: [LLM_DISABLED_MESSAGE]
  };
}

function createErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function createLmStudioClient(module: LmStudioSdkModule, baseUrl: string | undefined): LmStudioClientLike {
  if (baseUrl === undefined) {
    return new module.LMStudioClient();
  }

  return new module.LMStudioClient({ baseUrl });
}

function createMissingModelReview(options: GenerateLlmPlanReviewOptions): LlmPlanReview {
  const baseUrl = normalizeLmStudioBaseUrl(options.config.baseUrl);

  return {
    ...(baseUrl === undefined ? {} : { baseUrl }),
    provider: options.config.provider,
    status: "skipped",
    warnings: ["LM Studio is enabled, but llm.model is empty."]
  };
}

function createPlanReviewPrompt(options: GenerateLlmPlanReviewOptions): string {
  const { findingsArtifact, planArtifact, projectInventory } = options;
  const findings = findingsArtifact.findings.slice(0, MAX_PROMPT_FINDINGS);
  const planItems = planArtifact.plan.items.slice(0, MAX_PROMPT_PLAN_ITEMS);

  return [
    "You are reviewing a local, deterministic codebase improvement plan.",
    "Use only the metadata below. Do not ask for secrets, git history, ignored files, or full source contents.",
    "Return concise Markdown with: strongest plan item, missing risks, and suggested next review step.",
    "",
    "Project:",
    `- name: ${projectInventory.project.name}`,
    `- type: ${projectInventory.project.projectType}`,
    `- package manager: ${projectInventory.project.packageManager}`,
    `- indexed files: ${projectInventory.files.length}`,
    "",
    "Findings:",
    ...findings.map(
      (finding) =>
        `- ${finding.severity} ${finding.category}: ${finding.title}. Evidence: ${finding.evidence.map((evidence) => evidence.message).join("; ")}`
    ),
    "",
    "Proposed plan:",
    ...planItems.map(
      (planItem) =>
        `- ${planItem.id}: ${planItem.priority} priority, ${planItem.risk} risk, ${planItem.effort} effort - ${planItem.title}`
    )
  ].join("\n");
}

async function createTimeoutPromise(timeoutMilliseconds: number): Promise<never> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, timeoutMilliseconds);
  });

  throw new Error(`LM Studio request timed out after ${timeoutMilliseconds}ms.`);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLmStudioClientLike(value: unknown): value is LmStudioClientLike {
  return isRecord(value) && isRecord(value.llm) && typeof value.llm.model === "function";
}

function isLmStudioPredictionLike(value: unknown): value is LmStudioPredictionLike {
  return isRecord(value) && typeof value.then === "function" && typeof value.cancel === "function";
}

function isLmStudioPredictionResultLike(value: unknown): value is LmStudioPredictionResultLike {
  return isRecord(value) && typeof value.content === "string";
}

function isLmStudioSdkModule(value: unknown): value is LmStudioSdkModule {
  return isRecord(value) && typeof value.LMStudioClient === "function";
}

async function loadLmStudioSdk(): Promise<LmStudioSdkModule> {
  const loadedModule: unknown = await import(SDK_PACKAGE_NAME);

  if (!isLmStudioSdkModule(loadedModule)) {
    throw new Error("The @lmstudio/sdk module did not expose LMStudioClient.");
  }

  return loadedModule;
}

async function runWithTimeout(
  prediction: LmStudioPredictionLike,
  timeoutSeconds: number
): Promise<LmStudioPredictionResultLike> {
  const timeoutMilliseconds = timeoutSeconds * MILLISECONDS_PER_SECOND;

  try {
    const result: unknown = await Promise.race([prediction, createTimeoutPromise(timeoutMilliseconds)]);

    if (!isLmStudioPredictionResultLike(result)) {
      throw new Error("LM Studio returned an unexpected prediction result.");
    }

    return result;
  } catch (error: unknown) {
    await prediction.cancel();
    throw error;
  }
}

async function safelyDisposeClient(client: LmStudioClientLike): Promise<void> {
  const dispose = client[Symbol.asyncDispose];

  if (dispose !== undefined) {
    await dispose.call(client);
  }
}

export async function generateLlmPlanReview(options: GenerateLlmPlanReviewOptions): Promise<LlmPlanReview> {
  if (!options.config.enabled) {
    return createDisabledReview(options);
  }

  const model = options.config.model.trim();

  if (model.length === 0) {
    return createMissingModelReview(options);
  }

  const baseUrl = normalizeLmStudioBaseUrl(options.config.baseUrl) ?? DEFAULT_LMSTUDIO_SDK_BASE_URL;
  const sdkLoader = options.sdkLoader ?? loadLmStudioSdk;
  let client: LmStudioClientLike | undefined = undefined;

  try {
    const sdkModule = await sdkLoader();
    client = createLmStudioClient(sdkModule, baseUrl);

    if (!isLmStudioClientLike(client)) {
      throw new Error("LMStudioClient did not expose the expected llm namespace.");
    }

    const llm = await client.llm.model(model);
    const prediction: unknown = llm.respond(createPlanReviewPrompt(options), {
      maxTokens: MAX_REVIEW_TOKENS,
      temperature: TEMPERATURE
    });

    if (!isLmStudioPredictionLike(prediction)) {
      throw new Error("LM Studio returned an unexpected prediction handle.");
    }

    const result = await runWithTimeout(prediction, options.config.timeoutSeconds);

    return {
      baseUrl,
      content: result.content,
      model,
      provider: options.config.provider,
      status: "completed",
      warnings: []
    };
  } catch (error: unknown) {
    return {
      baseUrl,
      model,
      provider: options.config.provider,
      status: "failed",
      warnings: [createErrorMessage(error)]
    };
  } finally {
    if (client !== undefined) {
      await safelyDisposeClient(client);
    }
  }
}
