import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { FindingsArtifact } from "../analysis/index.js";
import type { LlmConfig } from "../config/index.js";
import type { PlanArtifact } from "../planning/index.js";
import type { ProjectInventory } from "../project/index.js";
import type {
  LmStudioClientLike,
  LmStudioLlmNamespaceLike,
  LmStudioModelLike,
  LmStudioPredictionLike,
  LmStudioPredictionResultLike,
  LmStudioSdkModule
} from "./types.js";

import { generateLlmPlanReview, normalizeLmStudioBaseUrl } from "./lmstudio-provider.js";

const CHECK_TIMEOUT_SECONDS = 12;
const RUN_ID = "run-test";

function ignoreCancellationError(): void {
  assert.ok(true);
}

const baseConfig: LlmConfig = {
  baseUrl: "http://localhost:1234/v1",
  enabled: true,
  model: "local-model",
  provider: "lmstudio",
  timeoutSeconds: CHECK_TIMEOUT_SECONDS
};

const findingsArtifact: FindingsArtifact = {
  findings: [],
  runId: RUN_ID,
  summary: {
    byCategory: {},
    bySeverity: {},
    total: 0
  }
};

const planArtifact: PlanArtifact = {
  plan: {
    createdAt: "2026-05-12T12:00:00.000Z",
    id: "plan-test",
    items: [],
    runId: RUN_ID,
    status: "proposed"
  },
  runId: RUN_ID,
  summary: {
    byPriority: {},
    byRisk: {},
    total: 0
  }
};

const projectInventory: ProjectInventory = {
  checkGuards: [],
  configFiles: [],
  files: [],
  packageManifests: [],
  project: {
    id: "project-test",
    name: "fixture",
    packageManager: "pnpm",
    projectType: "frontend",
    rootPath: "fixture"
  },
  skippedPaths: [],
  stackSignals: {
    eslint: false,
    next: false,
    playwright: false,
    prettier: false,
    react: false,
    storybook: false,
    tailwind: false,
    typescript: true,
    vite: false,
    vitest: false
  },
  warnings: []
};

class FakePrediction implements LmStudioPredictionLike {
  private readonly promise: Promise<LmStudioPredictionResultLike>;

  public constructor(content: string) {
    this.promise = Promise.resolve({ content });
  }

  public async cancel(): Promise<void> {
    await this.promise.catch(ignoreCancellationError);
  }

  // eslint-disable-next-line unicorn/no-thenable -- The SDK returns a promise-like prediction handle with cancel().
  public then<TResult1 = LmStudioPredictionResultLike, TResult2 = never>(
    onfulfilled?: ((value: LmStudioPredictionResultLike) => PromiseLike<TResult1> | TResult1) | null,
    onrejected?: ((reason: unknown) => PromiseLike<TResult2> | TResult2) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected);
  }
}

function createSdkModule(content: string): LmStudioSdkModule {
  class FakeLmStudioClient implements LmStudioClientLike {
    public readonly llm: LmStudioLlmNamespaceLike = {
      model: async (): Promise<LmStudioModelLike> => {
        await Promise.resolve();

        return {
          respond: (): LmStudioPredictionLike => new FakePrediction(content)
        };
      }
    };
  }

  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- External SDK export name.
    LMStudioClient: FakeLmStudioClient
  };
}

void describe("normalizeLmStudioBaseUrl", () => {
  void it("converts OpenAI-compatible HTTP URLs to SDK websocket URLs", () => {
    assert.equal(normalizeLmStudioBaseUrl("http://localhost:1234/v1"), "ws://localhost:1234");
    assert.equal(normalizeLmStudioBaseUrl("https://example.test/lmstudio"), "wss://example.test/lmstudio");
    assert.equal(normalizeLmStudioBaseUrl("ws://127.0.0.1:8080/"), "ws://127.0.0.1:8080");
  });
});

void describe("generateLlmPlanReview", () => {
  void it("returns disabled status without loading the SDK when config disables LLM", async () => {
    let loaderCalled = false;
    const review = await generateLlmPlanReview({
      config: {
        ...baseConfig,
        enabled: false
      },
      findingsArtifact,
      planArtifact,
      projectInventory,
      sdkLoader: async () => {
        await Promise.resolve();
        loaderCalled = true;
        return createSdkModule("unused");
      }
    });

    assert.equal(review.status, "disabled");
    assert.equal(loaderCalled, false);
  });

  void it("skips LM Studio when model is missing", async () => {
    const review = await generateLlmPlanReview({
      config: {
        ...baseConfig,
        model: ""
      },
      findingsArtifact,
      planArtifact,
      projectInventory
    });

    assert.equal(review.status, "skipped");
  });

  void it("uses the SDK to generate a plan review when enabled", async () => {
    const review = await generateLlmPlanReview({
      config: baseConfig,
      findingsArtifact,
      planArtifact,
      projectInventory,
      sdkLoader: async () => {
        await Promise.resolve();
        return createSdkModule("Looks solid.");
      }
    });

    assert.equal(review.status, "completed");
    assert.equal(review.baseUrl, "ws://localhost:1234");
    assert.equal(review.content, "Looks solid.");
    assert.deepEqual(review.warnings, []);
  });
});
