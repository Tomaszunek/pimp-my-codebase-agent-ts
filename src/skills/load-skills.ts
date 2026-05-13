import { readFile } from "node:fs/promises";
import path from "node:path";

import type { LoadSkillsOptions, SkillDefinition, SkillLoadResult } from "./types.js";

import { CONFIG_DIRECTORY_NAME } from "../config/index.js";
import { getBuiltInSkillMarkdown } from "./built-in-skills.js";
import { parseSkillMarkdown } from "./parse-skill-markdown.js";

type ProjectSkillMarkdownReadResult =
  | {
      readonly markdown: string;
      readonly path: string;
      readonly status: "found";
    }
  | {
      readonly path: string;
      readonly status: "missing";
    }
  | {
      readonly path: string;
      readonly status: "failed";
      readonly warning: string;
    };

const SKILL_FILE_NAME_EXTENSION = ".md";
const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;
const SKILLS_DIRECTORY_NAME = "skills";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function isValidSkillName(skillName: string): boolean {
  return SKILL_NAME_PATTERN.test(skillName);
}

function parseLoadedSkill(options: {
  readonly markdown: string;
  readonly requestedName: string;
  readonly source: "built-in" | "project";
  readonly sourcePath?: string;
  readonly warnings: string[];
}): SkillDefinition {
  const parsedSkill = parseSkillMarkdown({
    markdown: options.markdown,
    requestedName: options.requestedName,
    source: options.source,
    ...(options.sourcePath === undefined ? {} : { sourcePath: options.sourcePath })
  });

  options.warnings.push(...parsedSkill.warnings);

  return parsedSkill.skill;
}

async function readProjectSkillMarkdown(projectRootPath: string, skillName: string): Promise<ProjectSkillMarkdownReadResult> {
  const skillPath = path.join(
    projectRootPath,
    CONFIG_DIRECTORY_NAME,
    SKILLS_DIRECTORY_NAME,
    `${skillName}${SKILL_FILE_NAME_EXTENSION}`
  );

  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Skill files are loaded from the selected repo config directory after name validation.
    const markdown = await readFile(skillPath, "utf8");

    return {
      markdown,
      path: skillPath,
      status: "found"
    };
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {
        path: skillPath,
        status: "missing"
      };
    }

    return {
      path: skillPath,
      status: "failed",
      warning: `Unable to read project skill '${skillName}' at ${skillPath}: ${getErrorMessage(error)}.`
    };
  }
}

async function loadSkillByName(options: LoadSkillsOptions, skillName: string, warnings: string[]): Promise<SkillDefinition | undefined> {
  if (!isValidSkillName(skillName)) {
    warnings.push(`Skill '${skillName}' is not a valid skill name and was skipped.`);
    return undefined;
  }

  const projectSkill = await readProjectSkillMarkdown(options.projectRootPath, skillName);

  if (projectSkill.status === "found") {
    return parseLoadedSkill({
      markdown: projectSkill.markdown,
      requestedName: skillName,
      source: "project",
      sourcePath: projectSkill.path,
      warnings
    });
  }

  if (projectSkill.status === "failed") {
    warnings.push(projectSkill.warning);
  }

  const builtInSkillMarkdown = getBuiltInSkillMarkdown(skillName);

  if (builtInSkillMarkdown === undefined) {
    warnings.push(`Skill '${skillName}' was not found as a project or built-in skill.`);
    return undefined;
  }

  return parseLoadedSkill({
    markdown: builtInSkillMarkdown,
    requestedName: skillName,
    source: "built-in",
    warnings
  });
}

export async function loadSkills(options: LoadSkillsOptions): Promise<SkillLoadResult> {
  const loaded: SkillDefinition[] = [];
  const warnings: string[] = [];

  for (const skillName of options.config.skills) {
    const skill = await loadSkillByName(options, skillName, warnings);

    if (skill !== undefined) {
      loaded.push(skill);
    }
  }

  return {
    loaded,
    requested: options.config.skills,
    warnings
  };
}
