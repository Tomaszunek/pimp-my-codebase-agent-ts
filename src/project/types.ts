import type { ProjectConfig } from "../config/index.js";
import type { CheckGuard, PackageManifest, Project, ProjectFile } from "../core/index.js";

export interface FrontendStackSignals {
  readonly eslint: boolean;
  readonly next: boolean;
  readonly playwright: boolean;
  readonly prettier: boolean;
  readonly react: boolean;
  readonly storybook: boolean;
  readonly tailwind: boolean;
  readonly typescript: boolean;
  readonly vite: boolean;
  readonly vitest: boolean;
}

export interface ProjectInventory {
  readonly checkGuards: readonly CheckGuard[];
  readonly configFiles: readonly ProjectFile[];
  readonly files: readonly ProjectFile[];
  readonly packageManifests: readonly PackageManifest[];
  readonly project: Project;
  readonly skippedPaths: readonly SkippedPath[];
  readonly stackSignals: FrontendStackSignals;
  readonly warnings: readonly string[];
}

export interface ScanProjectOptions {
  readonly config: ProjectConfig;
  readonly repoPath: string;
}

export interface SkippedPath {
  readonly path: string;
  readonly reason: SkippedPathReason;
}

export type SkippedPathReason =
  | "forbidden"
  | "generated"
  | "read_error"
  | "symbolic_link"
  | "too_large"
  | "unsupported_entry";
