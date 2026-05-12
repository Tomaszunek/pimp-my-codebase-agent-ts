import type { CheckGuardPurpose, PackageManager, ProjectType } from "../core/index.js";

export type ConfigLoadSource = "defaults" | "file";
export type LlmProvider = "lmstudio";

export interface CheckGuardConfig {
  readonly command: string;
  readonly id: string;
  readonly purpose: CheckGuardPurpose;
  readonly timeoutSeconds: number;
}

export interface ConfigLoadResult {
  readonly config: ProjectConfig;
  readonly configPath?: string;
  readonly errors: readonly string[];
  readonly source: ConfigLoadSource;
  readonly warnings: readonly string[];
}

export interface LlmConfig {
  readonly baseUrl: string;
  readonly enabled: boolean;
  readonly model: string;
  readonly provider: LlmProvider;
  readonly timeoutSeconds: number;
}

export interface PrivacyConfig {
  readonly ignore: readonly string[];
  readonly readGitHistory: boolean;
  readonly readSecrets: boolean;
}

export interface ProjectConfig {
  readonly checks: readonly CheckGuardConfig[];
  readonly generatedFileAllowlist: readonly string[];
  readonly llm: LlmConfig;
  readonly packageManager: PackageManager;
  readonly privacy: PrivacyConfig;
  readonly projectType: ProjectType;
  readonly skills: readonly string[];
}
