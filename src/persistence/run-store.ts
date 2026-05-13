import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AgentRun } from "../core/index.js";
import type {
  CreateRunOptions,
  PersistedRun,
  RunArtifactPaths,
  RunJsonArtifactName,
  RunStore,
  RunTextArtifactName,
  WriteJsonArtifactOptions,
  WriteTextArtifactOptions
} from "./types.js";

const ARTIFACT_FILE_NAMES: Readonly<Record<RunJsonArtifactName | RunTextArtifactName | "run", string>> = {
  findings: "findings.json",
  inventory: "inventory.json",
  patches: "patches.json",
  plan: "plan.json",
  report: "report.md",
  run: "run.json",
  verification: "verification.json"
};
const ISO_ID_SAFE_PATTERN = /[-:.]/g;
const LATEST_RUN_DIRECTORY_NAME = "latest";
const PERSISTENCE_DIRECTORY_NAME = ".pimp-my-codebase";
const RUN_ID_ENTROPY_LENGTH = 8;
const RUN_ID_PREFIX = "run";
const RUNS_DIRECTORY_NAME = "runs";

function createArtifactPaths(runPath: string): RunArtifactPaths {
  return {
    findings: path.join(runPath, ARTIFACT_FILE_NAMES.findings),
    inventory: path.join(runPath, ARTIFACT_FILE_NAMES.inventory),
    patches: path.join(runPath, ARTIFACT_FILE_NAMES.patches),
    plan: path.join(runPath, ARTIFACT_FILE_NAMES.plan),
    report: path.join(runPath, ARTIFACT_FILE_NAMES.report),
    run: path.join(runPath, ARTIFACT_FILE_NAMES.run),
    verification: path.join(runPath, ARTIFACT_FILE_NAMES.verification)
  };
}

function createJsonContent(value: unknown): string {
  return `${JSON.stringify(value, undefined, 2)}\n`;
}

function createRunId(date: Date = new Date()): string {
  const timestamp = date.toISOString().replaceAll(ISO_ID_SAFE_PATTERN, "");
  const entropy = randomUUID().replaceAll("-", "").slice(0, RUN_ID_ENTROPY_LENGTH);

  return `${RUN_ID_PREFIX}-${timestamp}-${entropy}`;
}

function createInitialFindingsArtifact(runId: string): unknown {
  return {
    findings: [],
    runId
  };
}

function createInitialPlanArtifact(runId: string): unknown {
  return {
    items: [],
    planStatus: "pending",
    runId
  };
}

function createInitialPatchArtifact(runId: string): unknown {
  return {
    patchSets: [],
    runId
  };
}

function createInitialVerificationArtifact(runId: string): unknown {
  return {
    runId,
    verificationRuns: []
  };
}

function createInitialReport(run: AgentRun): string {
  return [
    `# Pimp My Codebase Run ${run.id}`,
    "",
    `Mode: ${run.mode}`,
    `Status: ${run.status}`,
    `Started: ${run.startedAt}`,
    "",
    "The project inventory has been persisted. Findings, planning, reporting, and verification will populate this run in later steps.",
    ""
  ].join("\n");
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRunMetadata(value: unknown): value is AgentRun {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.mode === "string" &&
    typeof value.projectId === "string" &&
    typeof value.startedAt === "string" &&
    typeof value.status === "string"
  );
}

async function ensureDirectory(directoryPath: string): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Persistence writes only under the selected project root.
  await mkdir(directoryPath, { recursive: true });
}

async function readJsonFile(filePath: string): Promise<unknown> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Latest resolution reads the run metadata file created by this module.
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

async function writeUtf8File(filePath: string, content: string): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Artifact paths are derived from the selected project root and known file names.
  await writeFile(filePath, content, "utf8");
}

function getArtifactPath(artifactPaths: RunArtifactPaths, artifactName: keyof RunArtifactPaths): string {
  switch (artifactName) {
    case "findings": {
      return artifactPaths.findings;
    }
    case "inventory": {
      return artifactPaths.inventory;
    }
    case "patches": {
      return artifactPaths.patches;
    }
    case "plan": {
      return artifactPaths.plan;
    }
    case "report": {
      return artifactPaths.report;
    }
    case "run": {
      return artifactPaths.run;
    }
    case "verification": {
      return artifactPaths.verification;
    }
  }

  throw new Error("Unknown artifact name.");
}

async function writeArtifactToBothPaths(
  persistedRun: PersistedRun,
  artifactName: keyof RunArtifactPaths,
  content: string
): Promise<void> {
  await Promise.all([
    writeUtf8File(getArtifactPath(persistedRun.artifacts, artifactName), content),
    writeUtf8File(getArtifactPath(persistedRun.latestArtifacts, artifactName), content)
  ]);
}

async function writeRunMetadata(persistedRun: PersistedRun): Promise<void> {
  await writeArtifactToBothPaths(persistedRun, "run", createJsonContent(persistedRun.run));
}

export async function writeJsonArtifact(options: WriteJsonArtifactOptions): Promise<void> {
  await writeArtifactToBothPaths(options.run, options.artifactName, createJsonContent(options.value));
}

export async function writeTextArtifact(options: WriteTextArtifactOptions): Promise<void> {
  await writeArtifactToBothPaths(options.run, options.artifactName, options.value);
}

async function writeInitialArtifacts(persistedRun: PersistedRun): Promise<void> {
  const { id } = persistedRun.run;

  await Promise.all([
    writeJsonArtifact({
      artifactName: "findings",
      run: persistedRun,
      value: createInitialFindingsArtifact(id)
    }),
    writeJsonArtifact({
      artifactName: "inventory",
      run: persistedRun,
      value: {
        project: undefined,
        runId: id
      }
    }),
    writeJsonArtifact({
      artifactName: "plan",
      run: persistedRun,
      value: createInitialPlanArtifact(id)
    }),
    writeJsonArtifact({
      artifactName: "patches",
      run: persistedRun,
      value: createInitialPatchArtifact(id)
    }),
    writeTextArtifact({
      artifactName: "report",
      run: persistedRun,
      value: createInitialReport(persistedRun.run)
    }),
    writeJsonArtifact({
      artifactName: "verification",
      run: persistedRun,
      value: createInitialVerificationArtifact(id)
    })
  ]);
}

export function createRunStore(projectRootPath: string): RunStore {
  const resolvedProjectRootPath = path.resolve(projectRootPath);
  const rootPath = path.join(resolvedProjectRootPath, PERSISTENCE_DIRECTORY_NAME);
  const runsPath = path.join(rootPath, RUNS_DIRECTORY_NAME);

  return {
    latestPath: path.join(runsPath, LATEST_RUN_DIRECTORY_NAME),
    projectRootPath: resolvedProjectRootPath,
    rootPath,
    runsPath
  };
}

export async function createRun(options: CreateRunOptions): Promise<PersistedRun> {
  const store = createRunStore(options.projectRootPath);
  const startedAt = options.startedAt ?? new Date();
  const completedAt = options.completedAt ?? startedAt;
  const run: AgentRun = {
    completedAt: completedAt.toISOString(),
    id: options.runId ?? createRunId(startedAt),
    mode: options.mode,
    projectId: options.projectId,
    startedAt: startedAt.toISOString(),
    status: "completed"
  };
  const runPath = path.join(store.runsPath, run.id);
  const persistedRun: PersistedRun = {
    artifacts: createArtifactPaths(runPath),
    latestArtifacts: createArtifactPaths(store.latestPath),
    latestPath: store.latestPath,
    run,
    runPath,
    store
  };

  await Promise.all([ensureDirectory(runPath), ensureDirectory(store.latestPath)]);
  await Promise.all([writeRunMetadata(persistedRun), writeInitialArtifacts(persistedRun)]);

  return persistedRun;
}

export async function resolveLatestRunPath(projectRootPath: string): Promise<string | undefined> {
  const store = createRunStore(projectRootPath);

  try {
    const metadata = await readJsonFile(path.join(store.latestPath, ARTIFACT_FILE_NAMES.run));

    if (!isRunMetadata(metadata)) {
      return undefined;
    }

    return path.join(store.runsPath, metadata.id);
  } catch {
    return undefined;
  }
}
