import type { CheckGuardConfig, ProjectConfig } from "./types.js";

const BUILD_TIMEOUT_SECONDS = 240;
const DEFAULT_LLM_TIMEOUT_SECONDS = 60;
const TEST_TIMEOUT_SECONDS = 180;
export const DEFAULT_CHECK_TIMEOUT_SECONDS = 120;

export const CONFIG_DIRECTORY_NAME = ".pimp-my-codebase";
export const CONFIG_FILE_NAME = "config.json";

export const DEFAULT_PRIVACY_IGNORE = [
  ".env",
  ".env.*",
  ".npmrc",
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".pimp-my-codebase/runs"
] as const;

export const DEFAULT_CHECK_GUARDS: readonly CheckGuardConfig[] = [
  {
    command: "pnpm typecheck",
    id: "typecheck",
    purpose: "typecheck",
    timeoutSeconds: DEFAULT_CHECK_TIMEOUT_SECONDS
  },
  {
    command: "pnpm lint",
    id: "lint",
    purpose: "lint",
    timeoutSeconds: DEFAULT_CHECK_TIMEOUT_SECONDS
  },
  {
    command: "pnpm test",
    id: "test",
    purpose: "test",
    timeoutSeconds: TEST_TIMEOUT_SECONDS
  },
  {
    command: "pnpm build",
    id: "build",
    purpose: "build",
    timeoutSeconds: BUILD_TIMEOUT_SECONDS
  }
] as const;

export const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  checks: DEFAULT_CHECK_GUARDS,
  generatedFileAllowlist: [],
  llm: {
    baseUrl: "http://localhost:1234/v1",
    enabled: false,
    model: "",
    provider: "lmstudio",
    timeoutSeconds: DEFAULT_LLM_TIMEOUT_SECONDS
  },
  packageManager: "pnpm",
  privacy: {
    ignore: DEFAULT_PRIVACY_IGNORE,
    readGitHistory: false,
    readSecrets: false
  },
  projectType: "frontend",
  skills: ["modernize", "quality", "frontend-polish"]
} as const;
