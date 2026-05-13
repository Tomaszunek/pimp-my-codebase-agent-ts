import type { ProjectConfig } from "../config/index.js";
import type { FindingCategory } from "../core/index.js";

export type SkillSource = "built-in" | "project";

export interface LoadSkillsOptions {
  readonly config: ProjectConfig;
  readonly projectRootPath: string;
}

export interface SkillDefinition {
  readonly allowedChangeTypes: readonly string[];
  readonly forbiddenChangeTypes: readonly string[];
  readonly intent: string;
  readonly name: string;
  readonly preferredCheckGuards: readonly string[];
  readonly preferredProjectSignals: readonly string[];
  readonly reportSections: readonly FindingCategory[];
  readonly scoringWeights: Readonly<Partial<Record<FindingCategory, number>>>;
  readonly source: SkillSource;
  readonly sourcePath?: string;
}

export interface SkillLoadResult {
  readonly loaded: readonly SkillDefinition[];
  readonly requested: readonly string[];
  readonly warnings: readonly string[];
}

export interface SkillMarkdownParseOptions {
  readonly markdown: string;
  readonly requestedName: string;
  readonly source: SkillSource;
  readonly sourcePath?: string;
}

export interface SkillMarkdownParseResult {
  readonly skill: SkillDefinition;
  readonly warnings: readonly string[];
}

export interface SkillPlanGuidance {
  readonly allowedChangeTypes: readonly string[];
  readonly categoryWeights: Readonly<Partial<Record<FindingCategory, number>>>;
  readonly forbiddenChangeTypes: readonly string[];
  readonly loadedSkillNames: readonly string[];
  readonly preferredCheckGuards: readonly string[];
  readonly preferredProjectSignals: readonly string[];
  readonly reportSections: readonly FindingCategory[];
  readonly warnings: readonly string[];
}
