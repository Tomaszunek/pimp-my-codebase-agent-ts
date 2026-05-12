import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import type { CheckGuardConfig, ProjectConfig } from "../config/index.js";
import type {
  CheckGuard,
  PackageDependencyMap,
  PackageManager,
  PackageManifest,
  Project,
  ProjectFile,
  ProjectFileKind,
  ProjectType
} from "../core/index.js";
import type { FrontendStackSignals, ProjectInventory, ScanProjectOptions, SkippedPath } from "./types.js";

import { isGeneratedPath, isIgnoredPath, isPathAllowed, normalizeRelativePath } from "./path-policy.js";

const CONTENT_HASH_ALGORITHM = "sha256";
const GENERATED_LOCKFILE_HASH = "not-read";
const ID_HASH_LENGTH = 12;
const MAX_INDEXED_FILE_SIZE_BYTES = 1_000_000;
const PACKAGE_MANIFEST_FILE_NAME = "package.json";

const ASSET_EXTENSIONS = new Set([".gif", ".ico", ".jpeg", ".jpg", ".png", ".svg", ".webp", ".woff", ".woff2"]);
const CONFIG_FILE_NAMES = new Set([
  ".eslintrc",
  ".eslintignore",
  ".prettierrc",
  ".prettierignore",
  "eslint.config.cjs",
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.ts",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "playwright.config.ts",
  "postcss.config.js",
  "postcss.config.ts",
  "prettier.config.cjs",
  "prettier.config.js",
  "prettier.config.mjs",
  "tailwind.config.js",
  "tailwind.config.ts",
  "tsconfig.json",
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.ts",
  "vitest.config.js",
  "vitest.config.ts"
]);
const DOCUMENTATION_FILE_NAMES = new Set(["changelog.md", "license", "license.md", "readme.md"]);
const LOCKFILE_NAMES = new Set(["bun.lockb", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"]);
const SOURCE_EXTENSIONS = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".svelte", ".ts", ".tsx", ".vue"]);
const STYLE_EXTENSIONS = new Set([".css", ".less", ".sass", ".scss"]);

interface CollectedFiles {
  readonly files: readonly ProjectFile[];
  readonly skippedPaths: readonly SkippedPath[];
  readonly warnings: readonly string[];
}

interface DirectoryVisitOptions {
  readonly config: ProjectConfig;
  readonly projectId: string;
  readonly relativeDirectoryPath: string;
  readonly rootPath: string;
  readonly state: ScanState;
}

interface IndexFileOptions {
  readonly projectId: string;
  readonly relativePath: string;
  readonly rootPath: string;
  readonly state: ScanState;
}

interface ManifestReadResult {
  readonly manifest?: PackageManifest;
  readonly warning?: string;
}

interface ScanState {
  readonly files: ProjectFile[];
  readonly skippedPaths: SkippedPath[];
  readonly warnings: string[];
}

function createCheckGuard(projectId: string, checkGuard: CheckGuardConfig): CheckGuard {
  return {
    command: checkGuard.command,
    id: checkGuard.id,
    projectId,
    purpose: checkGuard.purpose,
    timeoutSeconds: checkGuard.timeoutSeconds
  };
}

function createContentHash(content: string | Uint8Array): string {
  return createHash(CONTENT_HASH_ALGORITHM).update(content).digest("hex");
}

function createStableId(prefix: string, value: string): string {
  return `${prefix}-${createContentHash(value).slice(0, ID_HASH_LENGTH)}`;
}

function detectFileKind(relativePath: string): ProjectFileKind {
  const normalizedPath = normalizeRelativePath(relativePath);
  const fileName = path.posix.basename(normalizedPath).toLowerCase();
  const extension = path.posix.extname(fileName);

  if (fileName === PACKAGE_MANIFEST_FILE_NAME) {
    return "manifest";
  }

  if (LOCKFILE_NAMES.has(fileName)) {
    return "lockfile";
  }

  if (CONFIG_FILE_NAMES.has(fileName) || normalizedPath.startsWith(".storybook/")) {
    return "config";
  }

  if (DOCUMENTATION_FILE_NAMES.has(fileName) || normalizedPath.startsWith("docs/")) {
    return "documentation";
  }

  if (isGeneratedPath(normalizedPath)) {
    return "generated";
  }

  if (normalizedPath.includes("__tests__/") || fileName.includes(".spec.") || fileName.includes(".test.")) {
    return "test";
  }

  if (STYLE_EXTENSIONS.has(extension)) {
    return "style";
  }

  if (SOURCE_EXTENSIONS.has(extension)) {
    return "source";
  }

  if (ASSET_EXTENSIONS.has(extension)) {
    return "asset";
  }

  return "unknown";
}

function detectLanguage(relativePath: string): string {
  const normalizedPath = normalizeRelativePath(relativePath);
  const fileName = path.posix.basename(normalizedPath).toLowerCase();
  const extension = path.posix.extname(fileName);

  if (fileName === PACKAGE_MANIFEST_FILE_NAME || extension === ".json") {
    return "json";
  }

  switch (extension) {
    case ".css": {
      return "css";
    }
    case ".js":
    case ".cjs":
    case ".mjs": {
      return "javascript";
    }
    case ".jsx": {
      return "javascriptreact";
    }
    case ".less": {
      return "less";
    }
    case ".md": {
      return "markdown";
    }
    case ".scss":
    case ".sass": {
      return "scss";
    }
    case ".ts":
    case ".cts":
    case ".mts": {
      return "typescript";
    }
    case ".tsx": {
      return "typescriptreact";
    }
    case ".vue": {
      return "vue";
    }
    case ".yaml":
    case ".yml": {
      return "yaml";
    }
    default: {
      return "unknown";
    }
  }
}

function detectPackageManager(files: readonly ProjectFile[], config: ProjectConfig): PackageManager {
  const indexedPaths = new Set(files.map((file) => file.path));

  if (indexedPaths.has("pnpm-lock.yaml")) {
    return "pnpm";
  }

  if (indexedPaths.has("package-lock.json")) {
    return "npm";
  }

  if (indexedPaths.has("yarn.lock")) {
    return "yarn";
  }

  if (indexedPaths.has("bun.lockb")) {
    return "bun";
  }

  return config.packageManager;
}

function detectProjectType(config: ProjectConfig, stackSignals: FrontendStackSignals): ProjectType {
  if (config.projectType !== "unknown") {
    return config.projectType;
  }

  if (stackSignals.next || stackSignals.react || stackSignals.tailwind || stackSignals.vite) {
    return "frontend";
  }

  return "unknown";
}

function hasAnyPath(indexedPaths: ReadonlySet<string>, paths: readonly string[]): boolean {
  return paths.some((filePath) => indexedPaths.has(filePath));
}

function hasDependency(packageManifests: readonly PackageManifest[], dependencyName: string): boolean {
  return packageManifests.some(
    (manifest) =>
      Object.hasOwn(manifest.dependencies, dependencyName) ||
      Object.hasOwn(manifest.devDependencies, dependencyName) ||
      Object.hasOwn(manifest.peerDependencies, dependencyName)
  );
}

function detectStackSignals(files: readonly ProjectFile[], packageManifests: readonly PackageManifest[]): FrontendStackSignals {
  const indexedPaths = new Set(files.map((file) => file.path));

  return {
    eslint: hasDependency(packageManifests, "eslint") || hasAnyPath(indexedPaths, ["eslint.config.js", "eslint.config.mjs", "eslint.config.ts"]),
    next: hasDependency(packageManifests, "next") || hasAnyPath(indexedPaths, ["next.config.js", "next.config.mjs", "next.config.ts"]),
    playwright:
      hasDependency(packageManifests, "@playwright/test") ||
      hasAnyPath(indexedPaths, ["playwright.config.ts", "playwright.config.js"]),
    prettier:
      hasDependency(packageManifests, "prettier") ||
      hasAnyPath(indexedPaths, [".prettierrc", "prettier.config.js", "prettier.config.mjs"]),
    react: hasDependency(packageManifests, "react") || hasDependency(packageManifests, "react-dom"),
    storybook: hasDependency(packageManifests, "storybook") || [...indexedPaths].some((filePath) => filePath.startsWith(".storybook/")),
    tailwind:
      hasDependency(packageManifests, "tailwindcss") ||
      hasAnyPath(indexedPaths, ["tailwind.config.js", "tailwind.config.ts"]),
    typescript: hasDependency(packageManifests, "typescript") || indexedPaths.has("tsconfig.json"),
    vite: hasDependency(packageManifests, "vite") || hasAnyPath(indexedPaths, ["vite.config.js", "vite.config.mjs", "vite.config.ts"]),
    vitest: hasDependency(packageManifests, "vitest") || hasAnyPath(indexedPaths, ["vitest.config.js", "vitest.config.ts"])
  };
}

function getEntryRelativePath(relativeDirectoryPath: string, entryName: string): string {
  if (relativeDirectoryPath.length === 0) {
    return entryName;
  }

  return `${relativeDirectoryPath}/${entryName}`;
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeDependencyMap(value: unknown): PackageDependencyMap {
  if (!isPlainObject(value)) {
    return {};
  }

  const entries: [string, string][] = [];

  for (const [dependencyName, version] of Object.entries(value)) {
    if (typeof version === "string") {
      entries.push([dependencyName, version]);
    }
  }

  return Object.fromEntries(entries);
}

function normalizePackageManifest(
  rawManifest: Readonly<Record<string, unknown>>,
  projectId: string,
  manifestPath: string
): PackageManifest {
  const { name, version } = rawManifest;

  return {
    dependencies: normalizeDependencyMap(rawManifest.dependencies),
    devDependencies: normalizeDependencyMap(rawManifest.devDependencies),
    id: createStableId("manifest", `${projectId}:${manifestPath}`),
    ...(typeof name === "string" && name.length > 0 ? { name } : {}),
    path: manifestPath,
    peerDependencies: normalizeDependencyMap(rawManifest.peerDependencies),
    projectId,
    scripts: normalizeDependencyMap(rawManifest.scripts),
    ...(typeof version === "string" && version.length > 0 ? { version } : {})
  };
}

function shouldSkipPath(relativePath: string, config: ProjectConfig): SkippedPath | undefined {
  if (isIgnoredPath(relativePath, config.privacy.ignore)) {
    return { path: relativePath, reason: "forbidden" };
  }

  if (isGeneratedPath(relativePath) && !isPathAllowed(relativePath, config.generatedFileAllowlist)) {
    return { path: relativePath, reason: "generated" };
  }

  return undefined;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function readSafeFile(filePath: string): Promise<Uint8Array>;
async function readSafeFile(filePath: string, encoding: BufferEncoding): Promise<string>;
async function readSafeFile(filePath: string, encoding?: BufferEncoding): Promise<string | Uint8Array> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Scanner reads only paths that passed the privacy policy.
  return encoding === undefined ? readFile(filePath) : readFile(filePath, encoding);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Project root detection checks known file names.
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findProjectRoot(repoPath: string): Promise<string> {
  const startingPath = path.resolve(repoPath);
  let currentPath = startingPath;

  for (;;) {
    if (await fileExists(path.join(currentPath, PACKAGE_MANIFEST_FILE_NAME))) {
      return currentPath;
    }

    const parentPath = path.dirname(currentPath);

    if (parentPath === currentPath) {
      return startingPath;
    }

    currentPath = parentPath;
  }
}

async function indexFile(options: IndexFileOptions): Promise<void> {
  const { projectId, relativePath, rootPath, state } = options;
  const absolutePath = path.join(rootPath, relativePath);
  const kind = detectFileKind(relativePath);

  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Scanner indexes files under the selected project root.
    const fileStats = await stat(absolutePath);

    if (fileStats.size > MAX_INDEXED_FILE_SIZE_BYTES) {
      state.skippedPaths.push({ path: relativePath, reason: "too_large" });
      return;
    }

    const contentHash = kind === "lockfile" ? GENERATED_LOCKFILE_HASH : createContentHash(await readSafeFile(absolutePath));

    state.files.push({
      contentHash,
      id: createStableId("file", `${projectId}:${relativePath}`),
      kind,
      language: detectLanguage(relativePath),
      path: relativePath,
      projectId,
      sizeBytes: fileStats.size
    });
  } catch (error: unknown) {
    state.skippedPaths.push({ path: relativePath, reason: "read_error" });
    state.warnings.push(`Unable to index ${relativePath}: ${getErrorMessage(error)}.`);
  }
}

async function readPackageManifest(rootPath: string, projectId: string, manifestPath: string): Promise<ManifestReadResult> {
  const absolutePath = path.join(rootPath, manifestPath);

  try {
    const rawManifest = JSON.parse(await readSafeFile(absolutePath, "utf8")) as unknown;

    if (!isPlainObject(rawManifest)) {
      return { warning: `${manifestPath} must contain a JSON object.` };
    }

    return { manifest: normalizePackageManifest(rawManifest, projectId, manifestPath) };
  } catch (error: unknown) {
    return { warning: `Unable to parse ${manifestPath}: ${getErrorMessage(error)}.` };
  }
}

async function readPackageManifests(
  rootPath: string,
  projectId: string,
  files: readonly ProjectFile[]
): Promise<readonly ManifestReadResult[]> {
  return Promise.all(
    files
      .filter((file) => file.kind === "manifest")
      .map(async (file) => readPackageManifest(rootPath, projectId, file.path))
  );
}

async function visitDirectory(options: DirectoryVisitOptions): Promise<void> {
  const { config, projectId, relativeDirectoryPath, rootPath, state } = options;
  const absoluteDirectoryPath = path.join(rootPath, relativeDirectoryPath);

  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Scanner walks the selected project root.
    const entries = await readdir(absoluteDirectoryPath, { withFileTypes: true });

    await Promise.all(
      entries.map(async (directoryEntry) => {
        const relativePath = normalizeRelativePath(getEntryRelativePath(relativeDirectoryPath, directoryEntry.name));
        const skippedPath = shouldSkipPath(relativePath, config);

        if (skippedPath !== undefined) {
          state.skippedPaths.push(skippedPath);
          return;
        }

        if (directoryEntry.isSymbolicLink()) {
          state.skippedPaths.push({ path: relativePath, reason: "symbolic_link" });
          return;
        }

        if (directoryEntry.isDirectory()) {
          await visitDirectory({
            config,
            projectId,
            relativeDirectoryPath: relativePath,
            rootPath,
            state
          });
          return;
        }

        if (directoryEntry.isFile()) {
          await indexFile({
            projectId,
            relativePath,
            rootPath,
            state
          });
          return;
        }

        state.skippedPaths.push({ path: relativePath, reason: "unsupported_entry" });
      })
    );
  } catch (error: unknown) {
    const skippedPath = relativeDirectoryPath.length === 0 ? "." : relativeDirectoryPath;
    state.skippedPaths.push({ path: skippedPath, reason: "read_error" });
    state.warnings.push(`Unable to read ${skippedPath}: ${getErrorMessage(error)}.`);
  }
}

async function scanFiles(rootPath: string, projectId: string, config: ProjectConfig): Promise<CollectedFiles> {
  const state: ScanState = {
    files: [],
    skippedPaths: [],
    warnings: []
  };

  await visitDirectory({
    config,
    projectId,
    relativeDirectoryPath: "",
    rootPath,
    state
  });

  return {
    files: state.files,
    skippedPaths: state.skippedPaths,
    warnings: state.warnings
  };
}

export async function scanProject(options: ScanProjectOptions): Promise<ProjectInventory> {
  const { config, repoPath } = options;
  const rootPath = await findProjectRoot(repoPath);
  const projectId = createStableId("project", rootPath);
  const collectedFiles = await scanFiles(rootPath, projectId, config);
  const manifestResults = await readPackageManifests(rootPath, projectId, collectedFiles.files);
  const packageManifests = manifestResults.flatMap((result) => (result.manifest === undefined ? [] : [result.manifest]));
  const manifestWarnings = manifestResults.flatMap((result) => (result.warning === undefined ? [] : [result.warning]));
  const stackSignals = detectStackSignals(collectedFiles.files, packageManifests);
  const rootManifest = packageManifests.find((manifest) => manifest.path === PACKAGE_MANIFEST_FILE_NAME);
  const projectName = rootManifest?.name ?? path.basename(rootPath);
  const project: Project = {
    id: projectId,
    name: projectName,
    packageManager: detectPackageManager(collectedFiles.files, config),
    projectType: detectProjectType(config, stackSignals),
    rootPath
  };

  return {
    checkGuards: config.checks.map((checkGuard) => createCheckGuard(projectId, checkGuard)),
    configFiles: collectedFiles.files.filter((file) => file.kind === "config"),
    files: collectedFiles.files,
    packageManifests,
    project,
    skippedPaths: collectedFiles.skippedPaths,
    stackSignals,
    warnings: [...collectedFiles.warnings, ...manifestWarnings]
  };
}
