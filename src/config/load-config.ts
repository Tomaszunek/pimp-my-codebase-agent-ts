import { readFile } from "node:fs/promises";
import path from "node:path";

import type { CheckGuardPurpose } from "../core/index.js";
import type { CheckGuardConfig, ConfigLoadResult, LlmConfig, PrivacyConfig } from "./types.js";

import { CONFIG_DIRECTORY_NAME, CONFIG_FILE_NAME, DEFAULT_CHECK_TIMEOUT_SECONDS, DEFAULT_PROJECT_CONFIG } from "./defaults.js";

const checkGuardPurposes = ["build", "custom", "format", "lint", "test", "typecheck"] as const;
const llmProviders = ["lmstudio"] as const;
const packageManagers = ["bun", "npm", "pnpm", "unknown", "yarn"] as const;
const projectTypes = ["frontend", "fullstack", "node", "unknown"] as const;

interface StringArrayOptions {
  readonly defaultValue: readonly string[];
  readonly pathName: string;
  readonly value: unknown;
}

interface UnionValueOptions<AllowedValue extends string> {
  readonly allowedValues: readonly AllowedValue[];
  readonly defaultValue: AllowedValue;
  readonly pathName: string;
  readonly value: unknown;
}

interface ValidationState {
  readonly errors: string[];
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function inferCheckGuardPurpose(id: string): CheckGuardPurpose {
  if (id === "build" || id === "format" || id === "lint" || id === "test" || id === "typecheck") {
    return id;
  }

  return "custom";
}

function isAllowedValue<const AllowedValue extends string>(
  value: unknown,
  allowedValues: readonly AllowedValue[]
): value is AllowedValue {
  return typeof value === "string" && (allowedValues as readonly string[]).includes(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function normalizeOptionalBoolean(value: unknown, pathName: string, state: ValidationState): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    state.errors.push(`${pathName} must be a boolean.`);
    return undefined;
  }

  return value;
}

function normalizeOptionalString(value: unknown, pathName: string, state: ValidationState): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.length === 0) {
    state.errors.push(`${pathName} must be a non-empty string.`);
    return undefined;
  }

  return value;
}

function normalizeStringArray(options: StringArrayOptions, state: ValidationState): readonly string[] {
  const { defaultValue, pathName, value } = options;

  if (value === undefined) {
    return defaultValue;
  }

  if (!Array.isArray(value)) {
    state.errors.push(`${pathName} must be an array of non-empty strings.`);
    return defaultValue;
  }

  const stringValues: string[] = [];

  for (const item of value as readonly unknown[]) {
    if (typeof item !== "string" || item.length === 0) {
      state.errors.push(`${pathName} must be an array of non-empty strings.`);
      return defaultValue;
    }

    stringValues.push(item);
  }

  return stringValues;
}

function normalizeUnionValue<const AllowedValue extends string>(
  options: UnionValueOptions<AllowedValue>,
  state: ValidationState
): AllowedValue {
  const { allowedValues, defaultValue, pathName, value } = options;

  if (value === undefined) {
    return defaultValue;
  }

  if (!isAllowedValue(value, allowedValues)) {
    state.errors.push(`${pathName} must be one of: ${allowedValues.join(", ")}.`);
    return defaultValue;
  }

  return value;
}

function normalizeCheckGuard(rawCheck: unknown, checkPath: string, state: ValidationState): CheckGuardConfig | undefined {
  if (!isPlainObject(rawCheck)) {
    state.errors.push(`${checkPath} must be an object.`);
    return undefined;
  }

  const { command, id, purpose: rawPurpose, timeoutSeconds: rawTimeoutSeconds } = rawCheck;

  if (typeof id !== "string" || id.length === 0) {
    state.errors.push(`${checkPath}.id must be a non-empty string.`);
  }

  if (typeof command !== "string" || command.length === 0) {
    state.errors.push(`${checkPath}.command must be a non-empty string.`);
  }

  if (rawTimeoutSeconds !== undefined && !isPositiveInteger(rawTimeoutSeconds)) {
    state.errors.push(`${checkPath}.timeoutSeconds must be a positive integer.`);
  }

  if (rawPurpose !== undefined && !isAllowedValue(rawPurpose, checkGuardPurposes)) {
    state.errors.push(`${checkPath}.purpose must be one of: ${checkGuardPurposes.join(", ")}.`);
  }

  if (typeof id !== "string" || id.length === 0 || typeof command !== "string" || command.length === 0) {
    return undefined;
  }

  return {
    command,
    id,
    purpose: isAllowedValue(rawPurpose, checkGuardPurposes) ? rawPurpose : inferCheckGuardPurpose(id),
    timeoutSeconds: isPositiveInteger(rawTimeoutSeconds) ? rawTimeoutSeconds : DEFAULT_CHECK_TIMEOUT_SECONDS
  };
}

function normalizeCheckGuards(rawChecks: unknown, state: ValidationState): readonly CheckGuardConfig[] {
  if (rawChecks === undefined) {
    return DEFAULT_PROJECT_CONFIG.checks;
  }

  if (!Array.isArray(rawChecks)) {
    state.errors.push("checks must be an array.");
    return DEFAULT_PROJECT_CONFIG.checks;
  }

  return (rawChecks as readonly unknown[])
    .map((rawCheck, index) => normalizeCheckGuard(rawCheck, `checks[${index}]`, state))
    .filter((checkGuard): checkGuard is CheckGuardConfig => checkGuard !== undefined);
}

function normalizeLlmConfig(rawLlm: unknown, state: ValidationState): LlmConfig {
  if (rawLlm === undefined) {
    return DEFAULT_PROJECT_CONFIG.llm;
  }

  if (!isPlainObject(rawLlm)) {
    state.errors.push("llm must be an object.");
    return DEFAULT_PROJECT_CONFIG.llm;
  }

  const {
    baseUrl: rawBaseUrl,
    enabled: rawEnabled,
    model: rawModel,
    provider: rawProvider,
    timeoutSeconds: rawTimeoutSeconds
  } = rawLlm;

  if (rawProvider !== undefined && !isAllowedValue(rawProvider, llmProviders)) {
    state.errors.push(`llm.provider must be one of: ${llmProviders.join(", ")}.`);
  }

  if (rawTimeoutSeconds !== undefined && !isPositiveInteger(rawTimeoutSeconds)) {
    state.errors.push("llm.timeoutSeconds must be a positive integer.");
  }

  return {
    baseUrl: normalizeOptionalString(rawBaseUrl, "llm.baseUrl", state) ?? DEFAULT_PROJECT_CONFIG.llm.baseUrl,
    enabled: normalizeOptionalBoolean(rawEnabled, "llm.enabled", state) ?? DEFAULT_PROJECT_CONFIG.llm.enabled,
    model: normalizeOptionalString(rawModel, "llm.model", state) ?? DEFAULT_PROJECT_CONFIG.llm.model,
    provider: isAllowedValue(rawProvider, llmProviders) ? rawProvider : DEFAULT_PROJECT_CONFIG.llm.provider,
    timeoutSeconds: isPositiveInteger(rawTimeoutSeconds) ? rawTimeoutSeconds : DEFAULT_PROJECT_CONFIG.llm.timeoutSeconds
  };
}

function normalizePrivacyConfig(rawPrivacy: unknown, state: ValidationState): PrivacyConfig {
  if (rawPrivacy === undefined) {
    return DEFAULT_PROJECT_CONFIG.privacy;
  }

  if (!isPlainObject(rawPrivacy)) {
    state.errors.push("privacy must be an object.");
    return DEFAULT_PROJECT_CONFIG.privacy;
  }

  const { ignore, readGitHistory, readSecrets } = rawPrivacy;

  return {
    ignore: normalizeStringArray(
      {
        defaultValue: DEFAULT_PROJECT_CONFIG.privacy.ignore,
        pathName: "privacy.ignore",
        value: ignore
      },
      state
    ),
    readGitHistory:
      normalizeOptionalBoolean(readGitHistory, "privacy.readGitHistory", state) ??
      DEFAULT_PROJECT_CONFIG.privacy.readGitHistory,
    readSecrets: normalizeOptionalBoolean(readSecrets, "privacy.readSecrets", state) ?? DEFAULT_PROJECT_CONFIG.privacy.readSecrets
  };
}

function normalizeProjectConfig(rawConfig: Readonly<Record<string, unknown>>, configPath: string): ConfigLoadResult {
  const state: ValidationState = { errors: [] };
  const {
    checks,
    generatedFileAllowlist,
    llm,
    packageManager: rawPackageManager,
    privacy,
    projectType: rawProjectType,
    skills
  } = rawConfig;

  const projectType = normalizeUnionValue(
    {
      allowedValues: projectTypes,
      defaultValue: DEFAULT_PROJECT_CONFIG.projectType,
      pathName: "projectType",
      value: rawProjectType
    },
    state
  );
  const packageManager = normalizeUnionValue(
    {
      allowedValues: packageManagers,
      defaultValue: DEFAULT_PROJECT_CONFIG.packageManager,
      pathName: "packageManager",
      value: rawPackageManager
    },
    state
  );

  return {
    config: {
      checks: normalizeCheckGuards(checks, state),
      generatedFileAllowlist: normalizeStringArray(
        {
          defaultValue: DEFAULT_PROJECT_CONFIG.generatedFileAllowlist,
          pathName: "generatedFileAllowlist",
          value: generatedFileAllowlist
        },
        state
      ),
      llm: normalizeLlmConfig(llm, state),
      packageManager,
      privacy: normalizePrivacyConfig(privacy, state),
      projectType,
      skills: normalizeStringArray(
        {
          defaultValue: DEFAULT_PROJECT_CONFIG.skills,
          pathName: "skills",
          value: skills
        },
        state
      )
    },
    configPath,
    errors: state.errors,
    source: "file",
    warnings: []
  };
}

export function parseProjectConfig(rawConfig: string, configPath = CONFIG_FILE_NAME): ConfigLoadResult {
  try {
    const parsedConfig = JSON.parse(rawConfig) as unknown;

    if (!isPlainObject(parsedConfig)) {
      return {
        config: DEFAULT_PROJECT_CONFIG,
        configPath,
        errors: [`Invalid config in ${configPath}: expected a JSON object.`],
        source: "file",
        warnings: []
      };
    }

    return normalizeProjectConfig(parsedConfig, configPath);
  } catch (error: unknown) {
    return {
      config: DEFAULT_PROJECT_CONFIG,
      configPath,
      errors: [`Invalid JSON in ${configPath}: ${getErrorMessage(error)}.`],
      source: "file",
      warnings: []
    };
  }
}

export async function loadProjectConfig(repoPath: string): Promise<ConfigLoadResult> {
  const configPath = path.join(repoPath, CONFIG_DIRECTORY_NAME, CONFIG_FILE_NAME);

  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- The user-selected repo root defines config discovery.
    const rawConfig = await readFile(configPath, "utf8");
    return parseProjectConfig(rawConfig, configPath);
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {
        config: DEFAULT_PROJECT_CONFIG,
        errors: [],
        source: "defaults",
        warnings: []
      };
    }

    return {
      config: DEFAULT_PROJECT_CONFIG,
      configPath,
      errors: [`Unable to read config at ${configPath}: ${getErrorMessage(error)}.`],
      source: "file",
      warnings: []
    };
  }
}
