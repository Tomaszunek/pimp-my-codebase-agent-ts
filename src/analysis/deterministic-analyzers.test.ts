import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PackageManifest, ProjectFile, ProjectFileKind } from "../core/index.js";
import type { FrontendStackSignals, ProjectInventory } from "../project/index.js";

import { analyzeProject } from "./deterministic-analyzers.js";

const PROJECT_ID = "project-test";
const RUN_ID = "run-test";

function createFile(filePath: string, kind: ProjectFileKind): ProjectFile {
  return {
    contentHash: `hash-${filePath}`,
    id: `file-${filePath}`,
    kind,
    language: "unknown",
    path: filePath,
    projectId: PROJECT_ID,
    sizeBytes: filePath.length
  };
}

function createManifest(options: {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly scripts?: Readonly<Record<string, string>>;
}): PackageManifest {
  return {
    dependencies: options.dependencies ?? {},
    devDependencies: options.devDependencies ?? {},
    id: "manifest-test",
    name: "fixture",
    path: "package.json",
    peerDependencies: {},
    projectId: PROJECT_ID,
    scripts: options.scripts ?? {},
    version: "0.1.0"
  };
}

function createStackSignals(overrides: Partial<FrontendStackSignals> = {}): FrontendStackSignals {
  return {
    eslint: false,
    next: false,
    playwright: false,
    prettier: false,
    react: false,
    storybook: false,
    tailwind: false,
    typescript: false,
    vite: false,
    vitest: false,
    ...overrides
  };
}

function createInventory(options: {
  readonly files: readonly ProjectFile[];
  readonly manifest: PackageManifest;
  readonly stackSignals?: FrontendStackSignals;
}): ProjectInventory {
  return {
    checkGuards: [],
    configFiles: options.files.filter((file) => file.kind === "config"),
    files: options.files,
    packageManifests: [options.manifest],
    project: {
      id: PROJECT_ID,
      name: "fixture",
      packageManager: "pnpm",
      projectType: "frontend",
      rootPath: "fixture"
    },
    skippedPaths: [],
    stackSignals: options.stackSignals ?? createStackSignals(),
    warnings: []
  };
}

void describe("analyzeProject", () => {
  void it("creates deterministic findings from project inventory", () => {
    const inventory = createInventory({
      files: [
        createFile("package.json", "manifest"),
        createFile("pnpm-lock.yaml", "lockfile"),
        createFile("tsconfig.json", "config"),
        createFile(".gitignore", "unknown")
      ],
      manifest: createManifest({
        devDependencies: {
          typescript: "^latest"
        },
        scripts: {
          build: "vite build"
        }
      }),
      stackSignals: createStackSignals({ typescript: true })
    });
    const artifact = analyzeProject({ inventory, runId: RUN_ID });
    const titles = new Set(artifact.findings.map((finding) => finding.title));

    assert.equal(artifact.runId, RUN_ID);
    assert.equal(artifact.summary.total, artifact.findings.length);
    assert.equal(titles.has("Package manifest is missing guard scripts"), true);
    assert.equal(titles.has("No test setup detected"), true);
    assert.equal(titles.has("No lint setup detected"), true);
    assert.equal(titles.has("No formatter setup detected"), true);
    assert.equal(titles.has("Frontend project type has no primary frontend stack signal"), true);
    assert.equal(titles.has("README is missing"), true);
    assert.ok(artifact.findings.every((finding) => finding.id.startsWith("finding-")));
  });

  void it("returns no findings for a healthy baseline inventory", () => {
    const inventory = createInventory({
      files: [
        createFile(".gitignore", "unknown"),
        createFile(".prettierrc", "config"),
        createFile("README.md", "documentation"),
        createFile("eslint.config.js", "config"),
        createFile("package.json", "manifest"),
        createFile("pnpm-lock.yaml", "lockfile"),
        createFile("src/App.test.tsx", "test"),
        createFile("src/App.tsx", "source"),
        createFile("tsconfig.json", "config"),
        createFile("vite.config.ts", "config")
      ],
      manifest: createManifest({
        dependencies: Object.fromEntries([
          ["react", "^latest"],
          ["react-dom", "^latest"]
        ]),
        devDependencies: {
          eslint: "^latest",
          prettier: "^latest",
          typescript: "^latest",
          vite: "^latest",
          vitest: "^latest"
        },
        scripts: {
          build: "vite build",
          format: "prettier . --check",
          lint: "eslint .",
          test: "vitest",
          typecheck: "tsc --noEmit"
        }
      }),
      stackSignals: createStackSignals({
        eslint: true,
        prettier: true,
        react: true,
        typescript: true,
        vite: true,
        vitest: true
      })
    });
    const artifact = analyzeProject({ inventory, runId: RUN_ID });

    assert.deepEqual(artifact.findings, []);
    assert.equal(artifact.summary.total, 0);
  });
});
