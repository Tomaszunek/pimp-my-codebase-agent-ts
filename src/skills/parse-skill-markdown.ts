import type { FindingCategory } from "../core/index.js";
import type { SkillDefinition, SkillMarkdownParseOptions, SkillMarkdownParseResult } from "./types.js";

type SkillMarkdownSection =
  | "allowedChangeTypes"
  | "forbiddenChangeTypes"
  | "intent"
  | "preferredCheckGuards"
  | "preferredProjectSignals"
  | "reportSections"
  | "scoringWeights";

interface MutableSkillMarkdownFields {
  readonly allowedChangeTypes: string[];
  readonly forbiddenChangeTypes: string[];
  readonly intentLines: string[];
  readonly preferredCheckGuards: string[];
  readonly preferredProjectSignals: string[];
  readonly reportSections: FindingCategory[];
  readonly scoringWeights: Map<FindingCategory, number>;
  readonly warnings: string[];
}

interface PushSectionValueOptions {
  readonly fields: MutableSkillMarkdownFields;
  readonly section: SkillMarkdownSection;
  readonly skillName: string;
  readonly value: string;
}

const HEADING_PREFIX = "## ";
const TITLE_PREFIX = "# ";
const LIST_ITEM_PREFIX = "- ";
const SCORING_WEIGHT_SEPARATOR = ":";

function addCategoryWeight(
  scoringWeights: Partial<Record<FindingCategory, number>>,
  category: FindingCategory,
  weight: number
): void {
  switch (category) {
    case "accessibility": {
      scoringWeights.accessibility = weight;
      return;
    }
    case "architecture": {
      scoringWeights.architecture = weight;
      return;
    }
    case "correctness": {
      scoringWeights.correctness = weight;
      return;
    }
    case "developer_experience": {
      scoringWeights.developer_experience = weight;
      return;
    }
    case "documentation": {
      scoringWeights.documentation = weight;
      return;
    }
    case "maintainability": {
      scoringWeights.maintainability = weight;
      return;
    }
    case "modernization": {
      scoringWeights.modernization = weight;
      return;
    }
    case "performance": {
      scoringWeights.performance = weight;
      return;
    }
    case "security": {
      scoringWeights.security = weight;
      return;
    }
    case "testing": {
      scoringWeights.testing = weight;
      return;
    }
    case "ui_polish": {
      scoringWeights.ui_polish = weight;
      return;
    }
  }

  throw new Error("Unknown finding category.");
}

function formatSkillMessage(skillName: string, message: string): string {
  return `${skillName}: ${message}`;
}

function getBulletValue(line: string): string | undefined {
  const trimmedLine = line.trim();

  if (!trimmedLine.startsWith(LIST_ITEM_PREFIX)) {
    return undefined;
  }

  const value = trimmedLine.slice(LIST_ITEM_PREFIX.length).trim();

  if (value.length === 0) {
    return undefined;
  }

  return value;
}

function getCategoryFromText(value: string): FindingCategory | undefined {
  switch (value) {
    case "accessibility": {
      return "accessibility";
    }
    case "architecture": {
      return "architecture";
    }
    case "correctness": {
      return "correctness";
    }
    case "developer_experience": {
      return "developer_experience";
    }
    case "documentation": {
      return "documentation";
    }
    case "maintainability": {
      return "maintainability";
    }
    case "modernization": {
      return "modernization";
    }
    case "performance": {
      return "performance";
    }
    case "security": {
      return "security";
    }
    case "testing": {
      return "testing";
    }
    case "ui_polish": {
      return "ui_polish";
    }
  }

  return undefined;
}

function getHeadingSection(line: string): SkillMarkdownSection | undefined {
  if (!line.startsWith(HEADING_PREFIX)) {
    return undefined;
  }

  switch (line.slice(HEADING_PREFIX.length).trim().toLowerCase()) {
    case "allowed change types": {
      return "allowedChangeTypes";
    }
    case "forbidden change types": {
      return "forbiddenChangeTypes";
    }
    case "intent": {
      return "intent";
    }
    case "preferred check guards": {
      return "preferredCheckGuards";
    }
    case "preferred project signals": {
      return "preferredProjectSignals";
    }
    case "report sections": {
      return "reportSections";
    }
    case "scoring weights": {
      return "scoringWeights";
    }
  }

  return undefined;
}

function getTitleName(line: string): string | undefined {
  if (line.startsWith(HEADING_PREFIX) || !line.startsWith(TITLE_PREFIX)) {
    return undefined;
  }

  const title = line.slice(TITLE_PREFIX.length).trim();

  if (title.length === 0) {
    return undefined;
  }

  return title;
}

function getUniqueCategories(values: readonly FindingCategory[]): readonly FindingCategory[] {
  const uniqueValues: FindingCategory[] = [];
  const seenValues = new Set<FindingCategory>();

  for (const value of values) {
    if (seenValues.has(value)) {
      continue;
    }

    seenValues.add(value);
    uniqueValues.push(value);
  }

  return uniqueValues;
}

function getUniqueStrings(values: readonly string[]): readonly string[] {
  const uniqueValues: string[] = [];
  const seenValues = new Set<string>();

  for (const value of values) {
    const normalizedValue = value.trim();

    if (normalizedValue.length === 0 || seenValues.has(normalizedValue)) {
      continue;
    }

    seenValues.add(normalizedValue);
    uniqueValues.push(normalizedValue);
  }

  return uniqueValues;
}

function mapScoringWeights(scoringWeightMap: ReadonlyMap<FindingCategory, number>): Readonly<Partial<Record<FindingCategory, number>>> {
  const scoringWeights: Partial<Record<FindingCategory, number>> = {};

  for (const [category, weight] of scoringWeightMap) {
    addCategoryWeight(scoringWeights, category, weight);
  }

  return scoringWeights;
}

function parseReportSection(skillName: string, value: string, fields: MutableSkillMarkdownFields): void {
  const category = getCategoryFromText(value);

  if (category === undefined) {
    fields.warnings.push(formatSkillMessage(skillName, `unknown report section '${value}' ignored.`));
    return;
  }

  fields.reportSections.push(category);
}

function parseScoringWeight(skillName: string, value: string, fields: MutableSkillMarkdownFields): void {
  const separatorIndex = value.indexOf(SCORING_WEIGHT_SEPARATOR);

  if (separatorIndex === -1) {
    fields.warnings.push(formatSkillMessage(skillName, `invalid scoring weight '${value}' ignored.`));
    return;
  }

  const category = getCategoryFromText(value.slice(0, separatorIndex).trim());
  const weight = Number.parseFloat(value.slice(separatorIndex + SCORING_WEIGHT_SEPARATOR.length).trim());

  if (category === undefined || !Number.isFinite(weight) || weight <= 0) {
    fields.warnings.push(formatSkillMessage(skillName, `invalid scoring weight '${value}' ignored.`));
    return;
  }

  fields.scoringWeights.set(category, weight);
}

function pushSectionValue(options: PushSectionValueOptions): void {
  const {
    fields,
    section,
    skillName,
    value
  } = options;

  switch (section) {
    case "allowedChangeTypes": {
      fields.allowedChangeTypes.push(value);
      return;
    }
    case "forbiddenChangeTypes": {
      fields.forbiddenChangeTypes.push(value);
      return;
    }
    case "intent": {
      fields.intentLines.push(value);
      return;
    }
    case "preferredCheckGuards": {
      fields.preferredCheckGuards.push(value);
      return;
    }
    case "preferredProjectSignals": {
      fields.preferredProjectSignals.push(value);
      return;
    }
    case "reportSections": {
      parseReportSection(skillName, value, fields);
      return;
    }
    case "scoringWeights": {
      parseScoringWeight(skillName, value, fields);
      return;
    }
  }

  throw new Error("Unknown skill markdown section.");
}

function toSkillDefinition(
  fields: MutableSkillMarkdownFields,
  options: SkillMarkdownParseOptions,
  parsedName: string
): SkillDefinition {
  const skillBase = {
    allowedChangeTypes: getUniqueStrings(fields.allowedChangeTypes),
    forbiddenChangeTypes: getUniqueStrings(fields.forbiddenChangeTypes),
    intent: fields.intentLines.join(" ").trim(),
    name: parsedName,
    preferredCheckGuards: getUniqueStrings(fields.preferredCheckGuards),
    preferredProjectSignals: getUniqueStrings(fields.preferredProjectSignals),
    reportSections: getUniqueCategories(fields.reportSections),
    scoringWeights: mapScoringWeights(fields.scoringWeights),
    source: options.source
  };

  if (options.sourcePath === undefined) {
    return skillBase;
  }

  return {
    ...skillBase,
    sourcePath: options.sourcePath
  };
}

export function parseSkillMarkdown(options: SkillMarkdownParseOptions): SkillMarkdownParseResult {
  const fields: MutableSkillMarkdownFields = {
    allowedChangeTypes: [],
    forbiddenChangeTypes: [],
    intentLines: [],
    preferredCheckGuards: [],
    preferredProjectSignals: [],
    reportSections: [],
    scoringWeights: new Map<FindingCategory, number>(),
    warnings: []
  };
  let currentSection: SkillMarkdownSection | undefined = undefined;
  let parsedName = options.requestedName;

  for (const line of options.markdown.split("\n")) {
    const titleName = getTitleName(line);

    if (titleName !== undefined) {
      parsedName = titleName;
      continue;
    }

    const headingSection = getHeadingSection(line);

    if (headingSection !== undefined) {
      currentSection = headingSection;
      continue;
    }

    if (currentSection === undefined) {
      continue;
    }

    const bulletValue = getBulletValue(line);
    const trimmedLine = line.trim();
    const value = bulletValue ?? trimmedLine;

    if (value.length === 0) {
      continue;
    }

    pushSectionValue({
      fields,
      section: currentSection,
      skillName: parsedName,
      value
    });
  }

  if (fields.intentLines.length === 0) {
    fields.warnings.push(formatSkillMessage(parsedName, "intent is missing."));
  }

  return {
    skill: toSkillDefinition(fields, options, parsedName),
    warnings: fields.warnings
  };
}
