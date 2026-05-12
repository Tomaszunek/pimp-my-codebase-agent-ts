import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

import { DEFAULT_PROJECT_CONFIG } from "../config/index.js";
import { scanProject } from "./scan-project.js";

interface FixtureFile {
  readonly content: string;
  readonly path: string;
}

async function createFixture(files: readonly FixtureFile[]): Promise<string> {
  const fixtureRoot = path.join(process.cwd(), ".test-tmp", randomUUID());

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Tests create isolated fixtures under the workspace.
  await mkdir(fixtureRoot, { recursive: true });

  await Promise.all(
    files.map(async (file) => {
      const filePath = path.join(fixtureRoot, file.path);

      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Tests create isolated fixture files under the workspace.
      await mkdir(path.dirname(filePath), { recursive: true });
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Tests create isolated fixture files under the workspace.
      await writeFile(filePath, file.content);
    })
  );

  return fixtureRoot;
}

async function removeFixture(fixtureRoot: string): Promise<void> {
  const testRoot = path.resolve(process.cwd(), ".test-tmp");
  const resolvedFixtureRoot = path.resolve(fixtureRoot);

  assert.ok(resolvedFixtureRoot.startsWith(`${testRoot}${path.sep}`));
  await rm(resolvedFixtureRoot, { force: true, recursive: true });
}

void describe("scanProject", () => {
  void it("creates an inventory for a frontend pnpm project", async () => {
    const fixtureRoot = await createFixture([
      {
        content: JSON.stringify({
          dependencies: Object.fromEntries([
            ["@vitejs/plugin-react", "^latest"],
            ["react", "^latest"],
            ["react-dom", "^latest"]
          ]),
          devDependencies: {
            tailwindcss: "^latest",
            typescript: "^latest",
            vite: "^latest",
            vitest: "^latest"
          },
          name: "fixture-app",
          scripts: {
            build: "vite build",
            test: "vitest"
          },
          version: "0.1.0"
        }),
        path: "package.json"
      },
      { content: "lockfileVersion: '9.0'", path: "pnpm-lock.yaml" },
      { content: "{}", path: "tsconfig.json" },
      { content: "export default {}", path: "vite.config.ts" },
      { content: "export function App() { return null; }", path: "src/App.tsx" }
    ]);

    try {
      const inventory = await scanProject({ config: DEFAULT_PROJECT_CONFIG, repoPath: fixtureRoot });
      const [manifest] = inventory.packageManifests;
      const filePaths = new Set(inventory.files.map((file) => file.path));

      assert.equal(inventory.project.name, "fixture-app");
      assert.equal(inventory.project.packageManager, "pnpm");
      assert.equal(inventory.project.projectType, "frontend");
      assert.ok(manifest);
      assert.equal(manifest.scripts.build, "vite build");
      assert.equal(inventory.stackSignals.react, true);
      assert.equal(inventory.stackSignals.tailwind, true);
      assert.equal(inventory.stackSignals.typescript, true);
      assert.equal(inventory.stackSignals.vite, true);
      assert.equal(inventory.stackSignals.vitest, true);
      assert.equal(filePaths.has("src/App.tsx"), true);
      assert.equal(filePaths.has("pnpm-lock.yaml"), true);
    } finally {
      await removeFixture(fixtureRoot);
    }
  });

  void it("skips forbidden paths from privacy config", async () => {
    const fixtureRoot = await createFixture([
      { content: "{}", path: "package.json" },
      { content: "SECRET=value", path: ".env" },
      { content: "//registry.npmjs.org/:_authToken=secret", path: ".npmrc" },
      { content: "ignored", path: ".git/config" },
      { content: "ignored", path: "node_modules/pkg/index.js" },
      { content: "ignored", path: "dist/bundle.js" },
      { content: "console.log('safe');", path: "src/main.ts" }
    ]);

    try {
      const inventory = await scanProject({ config: DEFAULT_PROJECT_CONFIG, repoPath: fixtureRoot });
      const filePaths = new Set(inventory.files.map((file) => file.path));
      const skippedPaths = new Set(inventory.skippedPaths.map((skippedPath) => skippedPath.path));

      assert.equal(filePaths.has("src/main.ts"), true);
      assert.equal(filePaths.has(".env"), false);
      assert.equal(filePaths.has(".npmrc"), false);
      assert.equal(filePaths.has(".git/config"), false);
      assert.equal(filePaths.has("node_modules/pkg/index.js"), false);
      assert.equal(filePaths.has("dist/bundle.js"), false);
      assert.equal(skippedPaths.has(".env"), true);
      assert.equal(skippedPaths.has(".npmrc"), true);
      assert.equal(skippedPaths.has(".git"), true);
      assert.equal(skippedPaths.has("node_modules"), true);
      assert.equal(skippedPaths.has("dist"), true);
    } finally {
      await removeFixture(fixtureRoot);
    }
  });

  void it("skips generated files unless they are allowlisted", async () => {
    const fixtureRoot = await createFixture([
      { content: "{}", path: "package.json" },
      { content: "export const generated = true;", path: "src/generated/client.ts" },
      { content: "export const app = true;", path: "src/main.ts" }
    ]);

    try {
      const defaultInventory = await scanProject({ config: DEFAULT_PROJECT_CONFIG, repoPath: fixtureRoot });
      const allowlistedInventory = await scanProject({
        config: {
          ...DEFAULT_PROJECT_CONFIG,
          generatedFileAllowlist: ["src/generated/**"]
        },
        repoPath: fixtureRoot
      });
      const defaultFilePaths = new Set(defaultInventory.files.map((file) => file.path));
      const allowlistedFilePaths = new Set(allowlistedInventory.files.map((file) => file.path));

      assert.equal(defaultFilePaths.has("src/main.ts"), true);
      assert.equal(defaultFilePaths.has("src/generated/client.ts"), false);
      assert.equal(allowlistedFilePaths.has("src/generated/client.ts"), true);
    } finally {
      await removeFixture(fixtureRoot);
    }
  });
});
