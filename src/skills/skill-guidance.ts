import type { FindingCategory } from "../core/index.js";
import type { SkillDefinition, SkillLoadResult, SkillPlanGuidance } from "./types.js";

function addCategoryWeight(
  categoryWeights: Partial<Record<FindingCategory, number>>,
  category: FindingCategory,
  weight: number
): void {
  switch (category) {
    case "accessibility": {
      categoryWeights.accessibility = (categoryWeights.accessibility ?? 0) + weight;
      return;
    }
    case "architecture": {
      categoryWeights.architecture = (categoryWeights.architecture ?? 0) + weight;
      return;
    }
    case "correctness": {
      categoryWeights.correctness = (categoryWeights.correctness ?? 0) + weight;
      return;
    }
    case "developer_experience": {
      categoryWeights.developer_experience = (categoryWeights.developer_experience ?? 0) + weight;
      return;
    }
    case "documentation": {
      categoryWeights.documentation = (categoryWeights.documentation ?? 0) + weight;
      return;
    }
    case "maintainability": {
      categoryWeights.maintainability = (categoryWeights.maintainability ?? 0) + weight;
      return;
    }
    case "modernization": {
      categoryWeights.modernization = (categoryWeights.modernization ?? 0) + weight;
      return;
    }
    case "performance": {
      categoryWeights.performance = (categoryWeights.performance ?? 0) + weight;
      return;
    }
    case "security": {
      categoryWeights.security = (categoryWeights.security ?? 0) + weight;
      return;
    }
    case "testing": {
      categoryWeights.testing = (categoryWeights.testing ?? 0) + weight;
      return;
    }
    case "ui_polish": {
      categoryWeights.ui_polish = (categoryWeights.ui_polish ?? 0) + weight;
      return;
    }
  }

  throw new Error("Unknown finding category.");
}

function addCategoryWeightFromText(
  categoryWeights: Partial<Record<FindingCategory, number>>,
  category: string,
  weight: number
): void {
  switch (category) {
    case "accessibility": {
      addCategoryWeight(categoryWeights, "accessibility", weight);
      return;
    }
    case "architecture": {
      addCategoryWeight(categoryWeights, "architecture", weight);
      return;
    }
    case "correctness": {
      addCategoryWeight(categoryWeights, "correctness", weight);
      return;
    }
    case "developer_experience": {
      addCategoryWeight(categoryWeights, "developer_experience", weight);
      return;
    }
    case "documentation": {
      addCategoryWeight(categoryWeights, "documentation", weight);
      return;
    }
    case "maintainability": {
      addCategoryWeight(categoryWeights, "maintainability", weight);
      return;
    }
    case "modernization": {
      addCategoryWeight(categoryWeights, "modernization", weight);
      return;
    }
    case "performance": {
      addCategoryWeight(categoryWeights, "performance", weight);
      return;
    }
    case "security": {
      addCategoryWeight(categoryWeights, "security", weight);
      return;
    }
    case "testing": {
      addCategoryWeight(categoryWeights, "testing", weight);
      return;
    }
    case "ui_polish": {
      addCategoryWeight(categoryWeights, "ui_polish", weight);
      return;
    }
  }
}

function addUniqueCategory(values: FindingCategory[], seenValues: Set<FindingCategory>, value: FindingCategory): void {
  if (seenValues.has(value)) {
    return;
  }

  seenValues.add(value);
  values.push(value);
}

function addUniqueString(values: string[], seenValues: Set<string>, value: string): void {
  if (seenValues.has(value)) {
    return;
  }

  seenValues.add(value);
  values.push(value);
}

function mergeCategories(target: FindingCategory[], seenValues: Set<FindingCategory>, values: readonly FindingCategory[]): void {
  for (const value of values) {
    addUniqueCategory(target, seenValues, value);
  }
}

function mergeCategoryWeights(
  target: Partial<Record<FindingCategory, number>>,
  scoringWeights: SkillDefinition["scoringWeights"]
): void {
  for (const [category, weight] of Object.entries(scoringWeights)) {
    addCategoryWeightFromText(target, category, weight);
  }
}

function mergeStrings(target: string[], seenValues: Set<string>, values: readonly string[]): void {
  for (const value of values) {
    addUniqueString(target, seenValues, value);
  }
}

export function createSkillPlanGuidance(skillLoadResult: SkillLoadResult): SkillPlanGuidance {
  const allowedChangeTypes: string[] = [];
  const allowedChangeTypeSet = new Set<string>();
  const categoryWeights: Partial<Record<FindingCategory, number>> = {};
  const forbiddenChangeTypes: string[] = [];
  const forbiddenChangeTypeSet = new Set<string>();
  const loadedSkillNames: string[] = [];
  const loadedSkillNameSet = new Set<string>();
  const preferredCheckGuards: string[] = [];
  const preferredCheckGuardSet = new Set<string>();
  const preferredProjectSignals: string[] = [];
  const preferredProjectSignalSet = new Set<string>();
  const reportSections: FindingCategory[] = [];
  const reportSectionSet = new Set<FindingCategory>();

  for (const skill of skillLoadResult.loaded) {
    addUniqueString(loadedSkillNames, loadedSkillNameSet, skill.name);
    mergeStrings(allowedChangeTypes, allowedChangeTypeSet, skill.allowedChangeTypes);
    mergeStrings(forbiddenChangeTypes, forbiddenChangeTypeSet, skill.forbiddenChangeTypes);
    mergeStrings(preferredCheckGuards, preferredCheckGuardSet, skill.preferredCheckGuards);
    mergeStrings(preferredProjectSignals, preferredProjectSignalSet, skill.preferredProjectSignals);
    mergeCategories(reportSections, reportSectionSet, skill.reportSections);
    mergeCategoryWeights(categoryWeights, skill.scoringWeights);
  }

  return {
    allowedChangeTypes,
    categoryWeights,
    forbiddenChangeTypes,
    loadedSkillNames,
    preferredCheckGuards,
    preferredProjectSignals,
    reportSections,
    warnings: skillLoadResult.warnings
  };
}
