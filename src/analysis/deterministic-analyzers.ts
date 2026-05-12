import { createHash } from "node:crypto";

import type {
  Finding,
  FindingCategory,
  FindingEvidence,
  FindingSeverity,
  JsonValue,
  PackageManifest,
  ProjectFile,
  ProjectFileKind
} from "../core/index.js";
import type { ProjectInventory, SkippedPathReason } from "../project/index.js";
import type { AnalyzeProjectOptions, FindingsArtifact, FindingsSummary, PendingFinding } from "./types.js";

interface AnalyzerContext {
  readonly inventory: ProjectInventory;
  readonly runId: string;
}

interface EvidenceOptions {
  readonly filePath?: string;
  readonly message: string;
  readonly source: string;
  readonly value?: JsonValue;
}

type Analyzer = (context: AnalyzerContext) => readonly PendingFinding[];
type GuardScriptName = "build" | "lint" | "test" | "typecheck";

const CONTENT_HASH_ALGORITHM = "sha256";
const EXPECTED_GUARD_SCRIPTS: readonly GuardScriptName[] = ["build", "lint", "test", "typecheck"] as const;
const FINDING_ID_HASH_LENGTH = 12;
const FULL_CONFIDENCE = 1;
const HIGH_CONFIDENCE = 0.95;
const MEDIUM_CONFIDENCE = 0.85;
const PACKAGE_MANIFEST_PATH = "package.json";
const PNPM_LOCKFILE_PATH = "pnpm-lock.yaml";
const README_PATH = "readme.md";

function createEvidence(options: EvidenceOptions): FindingEvidence {
  return {
    ...(options.filePath === undefined ? {} : { filePath: options.filePath }),
    message: options.message,
    source: options.source,
    ...(options.value === undefined ? {} : { value: options.value })
  };
}

function createFindingId(runId: string, analyzerId: string, title: string): string {
  const hashInput = `${runId}:${analyzerId}:${title}`;
  const hash = createHash(CONTENT_HASH_ALGORITHM).update(hashInput).digest("hex").slice(0, FINDING_ID_HASH_LENGTH);

  return `finding-${hash}`;
}

function createFinding(context: AnalyzerContext, pendingFinding: PendingFinding): Finding {
  return {
    category: pendingFinding.category,
    confidence: pendingFinding.confidence,
    evidence: pendingFinding.evidence,
    id: createFindingId(context.runId, pendingFinding.analyzerId, pendingFinding.title),
    recommendedRemediation: pendingFinding.recommendedRemediation,
    runId: context.runId,
    severity: pendingFinding.severity,
    title: pendingFinding.title
  };
}

function createPendingFinding(options: PendingFinding): PendingFinding {
  return options;
}

function getConfigFilePaths(inventory: ProjectInventory): ReadonlySet<string> {
  return new Set(inventory.configFiles.map((file) => file.path.toLowerCase()));
}

function getFilePaths(inventory: ProjectInventory): ReadonlySet<string> {
  return new Set(inventory.files.map((file) => file.path.toLowerCase()));
}

function getFilesByKind(inventory: ProjectInventory, kind: ProjectFileKind): readonly ProjectFile[] {
  return inventory.files.filter((file) => file.kind === kind);
}

function getRootManifest(inventory: ProjectInventory): PackageManifest | undefined {
  return inventory.packageManifests.find((manifest) => manifest.path === PACKAGE_MANIFEST_PATH);
}

function getScriptCommand(manifest: PackageManifest | undefined, scriptName: string): string | undefined {
  if (manifest === undefined) {
    return undefined;
  }

  const scriptEntry = Object.entries(manifest.scripts).find(([name, command]) => name === scriptName && command.length > 0);

  return scriptEntry?.[1];
}

function hasDependency(inventory: ProjectInventory, dependencyName: string): boolean {
  return inventory.packageManifests.some(
    (manifest) =>
      Object.hasOwn(manifest.dependencies, dependencyName) ||
      Object.hasOwn(manifest.devDependencies, dependencyName) ||
      Object.hasOwn(manifest.peerDependencies, dependencyName)
  );
}

function hasFilePath(inventory: ProjectInventory, filePath: string): boolean {
  return getFilePaths(inventory).has(filePath.toLowerCase());
}

function hasReadme(inventory: ProjectInventory): boolean {
  return getFilePaths(inventory).has(README_PATH);
}

function hasScript(manifest: PackageManifest | undefined, scriptName: string): boolean {
  return getScriptCommand(manifest, scriptName) !== undefined;
}

function hasTestRunnerDependency(inventory: ProjectInventory): boolean {
  return (
    hasDependency(inventory, "@playwright/test") ||
    hasDependency(inventory, "jest") ||
    hasDependency(inventory, "playwright") ||
    hasDependency(inventory, "vitest")
  );
}

function hasTsconfig(inventory: ProjectInventory): boolean {
  return hasFilePath(inventory, "tsconfig.json");
}

function hasProblematicSkippedReason(reason: SkippedPathReason): boolean {
  return reason === "read_error" || reason === "too_large" || reason === "unsupported_entry";
}

function incrementCount(counts: Map<string, number>, key: FindingCategory | FindingSeverity): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function summarizeFindings(findings: readonly Finding[]): FindingsSummary {
  const byCategory = new Map<string, number>();
  const bySeverity = new Map<string, number>();

  for (const finding of findings) {
    incrementCount(byCategory, finding.category);
    incrementCount(bySeverity, finding.severity);
  }

  return {
    byCategory: Object.fromEntries(byCategory),
    bySeverity: Object.fromEntries(bySeverity),
    total: findings.length
  };
}

function analyzePackageManager(context: AnalyzerContext): readonly PendingFinding[] {
  const { inventory } = context;
  const lockfilePaths = getFilesByKind(inventory, "lockfile").map((file) => file.path);
  const findings: PendingFinding[] = [];

  if (inventory.project.packageManager !== "pnpm") {
    findings.push(
      createPendingFinding({
        analyzerId: "package-manager",
        category: "developer_experience",
        confidence: HIGH_CONFIDENCE,
        evidence: [
          createEvidence({
            message: "The V1 default expects pnpm projects.",
            source: "package-manager-analyzer",
            value: inventory.project.packageManager
          })
        ],
        recommendedRemediation: "Standardize the project on pnpm or update the agent config and check guards for the detected package manager.",
        severity: "medium",
        title: "Project package manager differs from the V1 default"
      })
    );
  }

  if (inventory.project.packageManager === "pnpm" && !hasFilePath(inventory, PNPM_LOCKFILE_PATH)) {
    findings.push(
      createPendingFinding({
        analyzerId: "package-manager",
        category: "developer_experience",
        confidence: HIGH_CONFIDENCE,
        evidence: [
          createEvidence({
            message: "The project is configured as pnpm but no pnpm lockfile was indexed.",
            source: "package-manager-analyzer",
            value: PNPM_LOCKFILE_PATH
          })
        ],
        recommendedRemediation: "Commit pnpm-lock.yaml or adjust the package manager setting if this project intentionally uses a different tool.",
        severity: "medium",
        title: "Expected pnpm lockfile is missing"
      })
    );
  }

  if (lockfilePaths.length > 1) {
    findings.push(
      createPendingFinding({
        analyzerId: "package-manager",
        category: "developer_experience",
        confidence: HIGH_CONFIDENCE,
        evidence: [
          createEvidence({
            message: "Multiple package manager lockfiles were indexed.",
            source: "package-manager-analyzer",
            value: lockfilePaths.join(", ")
          })
        ],
        recommendedRemediation: "Keep only the lockfile for the package manager the project actually uses.",
        severity: "low",
        title: "Multiple package manager lockfiles detected"
      })
    );
  }

  return findings;
}

function analyzeScripts(context: AnalyzerContext): readonly PendingFinding[] {
  const rootManifest = getRootManifest(context.inventory);
  const missingScripts = EXPECTED_GUARD_SCRIPTS.filter((scriptName) => !hasScript(rootManifest, scriptName));

  if (missingScripts.length === 0) {
    return [];
  }

  return [
    createPendingFinding({
      analyzerId: "scripts",
      category: "developer_experience",
      confidence: FULL_CONFIDENCE,
      evidence: [
        createEvidence({
          filePath: PACKAGE_MANIFEST_PATH,
          message: "The root package manifest is missing one or more guard scripts.",
          source: "scripts-analyzer",
          value: missingScripts.join(", ")
        })
      ],
      recommendedRemediation: "Add explicit build, lint, test, and typecheck scripts so the agent can verify changes through predictable check guards.",
      severity: "medium",
      title: "Package manifest is missing guard scripts"
    })
  ];
}

function analyzeTypeScriptConfig(context: AnalyzerContext): readonly PendingFinding[] {
  const { inventory } = context;

  if (!inventory.stackSignals.typescript || hasTsconfig(inventory)) {
    return [];
  }

  return [
    createPendingFinding({
      analyzerId: "typescript-config",
      category: "correctness",
      confidence: HIGH_CONFIDENCE,
      evidence: [
        createEvidence({
          message: "TypeScript was detected from dependencies or source files, but tsconfig.json was not indexed.",
          source: "typescript-config-analyzer"
        })
      ],
      recommendedRemediation: "Add a root tsconfig.json with strict compiler settings and make sure the typecheck script uses it.",
      severity: "medium",
      title: "TypeScript project is missing tsconfig.json"
    })
  ];
}

function analyzeTestSetup(context: AnalyzerContext): readonly PendingFinding[] {
  const { inventory } = context;
  const rootManifest = getRootManifest(inventory);
  const hasTestFiles = getFilesByKind(inventory, "test").length > 0;

  if (hasScript(rootManifest, "test") || hasTestFiles || hasTestRunnerDependency(inventory)) {
    return [];
  }

  return [
    createPendingFinding({
      analyzerId: "test-setup",
      category: "testing",
      confidence: MEDIUM_CONFIDENCE,
      evidence: [
        createEvidence({
          filePath: PACKAGE_MANIFEST_PATH,
          message: "No test script, test files, or common test runner dependency was detected.",
          source: "test-setup-analyzer"
        })
      ],
      recommendedRemediation: "Add a minimal test runner and a package script so behavior can be protected before automated edits land.",
      severity: "medium",
      title: "No test setup detected"
    })
  ];
}

function analyzeLintAndFormat(context: AnalyzerContext): readonly PendingFinding[] {
  const { inventory } = context;
  const configFilePaths = getConfigFilePaths(inventory);
  const rootManifest = getRootManifest(inventory);
  const hasEslintConfig = inventory.stackSignals.eslint || configFilePaths.has("eslint.config.js") || configFilePaths.has("eslint.config.mjs");
  const hasPrettierConfig =
    inventory.stackSignals.prettier || configFilePaths.has(".prettierrc") || configFilePaths.has("prettier.config.js");
  const findings: PendingFinding[] = [];

  if (!hasEslintConfig && !hasScript(rootManifest, "lint")) {
    findings.push(
      createPendingFinding({
        analyzerId: "lint-format",
        category: "maintainability",
        confidence: HIGH_CONFIDENCE,
        evidence: [
          createEvidence({
            filePath: PACKAGE_MANIFEST_PATH,
            message: "No ESLint config, ESLint dependency, or lint script was detected.",
            source: "lint-format-analyzer"
          })
        ],
        recommendedRemediation: "Add ESLint with a strict TypeScript-aware config and expose it through a lint script.",
        severity: "medium",
        title: "No lint setup detected"
      })
    );
  }

  if (hasEslintConfig && !hasScript(rootManifest, "lint")) {
    findings.push(
      createPendingFinding({
        analyzerId: "lint-format",
        category: "developer_experience",
        confidence: HIGH_CONFIDENCE,
        evidence: [
          createEvidence({
            filePath: PACKAGE_MANIFEST_PATH,
            message: "ESLint is detected, but package.json does not expose a lint script.",
            source: "lint-format-analyzer"
          })
        ],
        recommendedRemediation: "Add a lint script that runs the project ESLint command used by contributors and CI.",
        severity: "medium",
        title: "ESLint is configured without a lint script"
      })
    );
  }

  if (!hasPrettierConfig && !hasScript(rootManifest, "format")) {
    findings.push(
      createPendingFinding({
        analyzerId: "lint-format",
        category: "maintainability",
        confidence: MEDIUM_CONFIDENCE,
        evidence: [
          createEvidence({
            filePath: PACKAGE_MANIFEST_PATH,
            message: "No Prettier config, Prettier dependency, or format script was detected.",
            source: "lint-format-analyzer"
          })
        ],
        recommendedRemediation: "Add a formatter setup or document the formatting policy so style churn stays predictable.",
        severity: "low",
        title: "No formatter setup detected"
      })
    );
  }

  return findings;
}

function analyzeFrontendStack(context: AnalyzerContext): readonly PendingFinding[] {
  const { inventory } = context;
  const hasPrimaryFrontendSignal = inventory.stackSignals.next || inventory.stackSignals.react || inventory.stackSignals.vite;

  if (inventory.project.projectType !== "frontend" || hasPrimaryFrontendSignal) {
    return [];
  }

  return [
    createPendingFinding({
      analyzerId: "frontend-stack",
      category: "architecture",
      confidence: MEDIUM_CONFIDENCE,
      evidence: [
        createEvidence({
          message: "Project type is frontend, but React, Vite, and Next signals were not detected.",
          source: "frontend-stack-analyzer",
          value: inventory.project.projectType
        })
      ],
      recommendedRemediation: "Confirm the project type in config or add the expected frontend framework/build tooling signals.",
      severity: "info",
      title: "Frontend project type has no primary frontend stack signal"
    })
  ];
}

function analyzeDocumentation(context: AnalyzerContext): readonly PendingFinding[] {
  if (hasReadme(context.inventory)) {
    return [];
  }

  return [
    createPendingFinding({
      analyzerId: "documentation",
      category: "documentation",
      confidence: HIGH_CONFIDENCE,
      evidence: [
        createEvidence({
          message: "README.md was not indexed at the project root.",
          source: "documentation-analyzer",
          value: "README.md"
        })
      ],
      recommendedRemediation: "Add a concise README covering project purpose, setup, verification commands, and development workflow.",
      severity: "low",
      title: "README is missing"
    })
  ];
}

function analyzeRepositoryHygiene(context: AnalyzerContext): readonly PendingFinding[] {
  const { inventory } = context;
  const findings: PendingFinding[] = [];

  if (!hasFilePath(inventory, ".gitignore")) {
    findings.push(
      createPendingFinding({
        analyzerId: "repository-hygiene",
        category: "maintainability",
        confidence: HIGH_CONFIDENCE,
        evidence: [
          createEvidence({
            message: ".gitignore was not indexed at the project root.",
            source: "repository-hygiene-analyzer",
            value: ".gitignore"
          })
        ],
        recommendedRemediation: "Add a .gitignore that excludes dependencies, build output, test output, local run artifacts, and secrets.",
        severity: "low",
        title: ".gitignore is missing"
      })
    );
  }

  if (inventory.skippedPaths.some((skippedPath) => hasProblematicSkippedReason(skippedPath.reason))) {
    findings.push(
      createPendingFinding({
        analyzerId: "repository-hygiene",
        category: "maintainability",
        confidence: MEDIUM_CONFIDENCE,
        evidence: inventory.skippedPaths
          .filter((skippedPath) => hasProblematicSkippedReason(skippedPath.reason))
          .map((skippedPath) =>
            createEvidence({
              filePath: skippedPath.path,
              message: `Scanner skipped path because of ${skippedPath.reason}.`,
              source: "repository-hygiene-analyzer"
            })
          ),
        recommendedRemediation: "Review unreadable or oversized paths and decide whether they should be fixed, ignored, or explicitly documented.",
        severity: "low",
        title: "Scanner skipped paths that may need cleanup"
      })
    );
  }

  return findings;
}

const ANALYZERS: readonly Analyzer[] = [
  analyzePackageManager,
  analyzeScripts,
  analyzeTypeScriptConfig,
  analyzeTestSetup,
  analyzeLintAndFormat,
  analyzeFrontendStack,
  analyzeDocumentation,
  analyzeRepositoryHygiene
] as const;

export function analyzeProject(options: AnalyzeProjectOptions): FindingsArtifact {
  const context: AnalyzerContext = {
    inventory: options.inventory,
    runId: options.runId
  };
  const findings = ANALYZERS.flatMap((analyzer) => analyzer(context).map((pendingFinding) => createFinding(context, pendingFinding)));

  return {
    findings,
    runId: options.runId,
    summary: summarizeFindings(findings)
  };
}
