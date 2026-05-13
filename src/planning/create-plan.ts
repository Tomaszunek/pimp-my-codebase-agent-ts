import { createHash } from "node:crypto";

import type {
  Finding,
  FindingCategory,
  FindingSeverity,
  ImprovementPlan,
  PlanItem,
  PlanItemEffort,
  PlanItemPriority,
  PlanItemRisk
} from "../core/index.js";
import type { SkillPlanGuidance } from "../skills/index.js";
import type { CreateImprovementPlanOptions, PendingPlanItem, PlanArtifact, PlanGroup, PlanSummary } from "./types.js";

import { createSkillPlanGuidance } from "../skills/index.js";

const CONTENT_HASH_ALGORITHM = "sha256";
const DEFAULT_CREATED_AT = new Date("1970-01-01T00:00:00.000Z");
const HIGH_CONFIDENCE_THRESHOLD = 0.9;
const ID_HASH_LENGTH = 12;
const LARGE_GROUP_SIZE = 4;
const MEDIUM_GROUP_SIZE = 2;
const PRIORITY_CRITICAL_WEIGHT = 4;
const PRIORITY_HIGH_WEIGHT = 3;
const SKILL_PRIORITY_BOOST_WEIGHT = 4;
const SEVERITY_CRITICAL_WEIGHT = 5;
const SEVERITY_HIGH_WEIGHT = 4;
const SEVERITY_MEDIUM_WEIGHT = 3;

const CATEGORY_ORDER: readonly FindingCategory[] = [
  "correctness",
  "security",
  "testing",
  "developer_experience",
  "maintainability",
  "architecture",
  "performance",
  "accessibility",
  "ui_polish",
  "modernization",
  "documentation"
] as const;

function createHashId(prefix: string, values: readonly string[]): string {
  const hash = createHash(CONTENT_HASH_ALGORITHM).update(values.join(":")).digest("hex").slice(0, ID_HASH_LENGTH);

  return `${prefix}-${hash}`;
}

function createPlanItem(planId: string, pendingPlanItem: PendingPlanItem): PlanItem {
  return {
    acceptanceCriteria: pendingPlanItem.acceptanceCriteria,
    category: pendingPlanItem.category,
    effort: pendingPlanItem.effort,
    findingIds: pendingPlanItem.findingIds,
    id: createHashId("item", [planId, pendingPlanItem.category, ...pendingPlanItem.findingIds]),
    planId,
    priority: pendingPlanItem.priority,
    risk: pendingPlanItem.risk,
    status: "proposed",
    title: pendingPlanItem.title
  };
}

function createPlanId(runId: string, findings: readonly Finding[]): string {
  return createHashId("plan", [runId, ...findings.map((finding) => finding.id)]);
}

function getAcceptanceCriteria(category: FindingCategory): readonly string[] {
  switch (category) {
    case "correctness": {
      return [
        "TypeScript configuration is present and used by the typecheck command.",
        "The related correctness findings are resolved or explicitly documented.",
        "The configured typecheck guard can be run after the change."
      ];
    }
    case "security": {
      return [
        "Security-sensitive findings are resolved without reading or exposing ignored secret files.",
        "The remediation is documented when a manual follow-up is required.",
        "Relevant verification commands still pass."
      ];
    }
    case "testing": {
      return [
        "A repeatable test command exists in the root package manifest.",
        "At least one baseline test or documented test runner setup covers the current behavior.",
        "The configured test guard can be run after the change."
      ];
    }
    case "developer_experience": {
      return [
        "Package manager and lockfile state are aligned.",
        "Build, lint, test, and typecheck scripts are explicit or intentionally documented.",
        "Configured check guards map to real project commands."
      ];
    }
    case "maintainability": {
      return [
        "Code quality tooling is configured or the project policy is documented.",
        "Generated, build, and local artifact paths remain ignored by the scanner.",
        "Related maintainability findings are resolved or intentionally deferred."
      ];
    }
    case "architecture": {
      return [
        "Project type and detected stack signals agree.",
        "Any framework or build-tool expectation is reflected in config or dependencies.",
        "The change does not introduce unrelated architecture churn."
      ];
    }
    case "performance": {
      return [
        "Performance findings are backed by project evidence.",
        "The remediation avoids broad rewrites unless a plan item explicitly approves them.",
        "Relevant build or test guards still pass."
      ];
    }
    case "accessibility": {
      return [
        "Accessibility findings are mapped to concrete UI behavior.",
        "The remediation keeps keyboard and screen-reader behavior reviewable.",
        "Relevant frontend checks or tests are updated when available."
      ];
    }
    case "ui_polish": {
      return [
        "UI polish findings are translated into scoped visual changes.",
        "The result is checked across expected viewport sizes.",
        "The change does not alter unrelated application flows."
      ];
    }
    case "modernization": {
      return [
        "Modernization changes are scoped to the detected project stack.",
        "High-risk upgrades are separated from low-risk cleanup.",
        "Verification commands still pass after each approved item."
      ];
    }
    case "documentation": {
      return [
        "README or project documentation explains setup, commands, and verification workflow.",
        "Documentation matches the detected package manager and scripts.",
        "The related documentation findings are resolved."
      ];
    }
  }

  throw new Error("Unknown finding category.");
}

function getCategoryRank(category: FindingCategory): number {
  const index = CATEGORY_ORDER.indexOf(category);

  if (index === -1) {
    return CATEGORY_ORDER.length;
  }

  return index;
}

function getPriorityWeight(priority: PlanItemPriority): number {
  switch (priority) {
    case "critical": {
      return PRIORITY_CRITICAL_WEIGHT;
    }
    case "high": {
      return PRIORITY_HIGH_WEIGHT;
    }
    case "medium": {
      return 2;
    }
    case "low": {
      return 1;
    }
  }

  throw new Error("Unknown plan item priority.");
}

function getSkillCategoryWeight(category: FindingCategory, skillGuidance: SkillPlanGuidance | undefined): number {
  if (skillGuidance === undefined) {
    return 0;
  }

  switch (category) {
    case "accessibility": {
      return skillGuidance.categoryWeights.accessibility ?? 0;
    }
    case "architecture": {
      return skillGuidance.categoryWeights.architecture ?? 0;
    }
    case "correctness": {
      return skillGuidance.categoryWeights.correctness ?? 0;
    }
    case "developer_experience": {
      return skillGuidance.categoryWeights.developer_experience ?? 0;
    }
    case "documentation": {
      return skillGuidance.categoryWeights.documentation ?? 0;
    }
    case "maintainability": {
      return skillGuidance.categoryWeights.maintainability ?? 0;
    }
    case "modernization": {
      return skillGuidance.categoryWeights.modernization ?? 0;
    }
    case "performance": {
      return skillGuidance.categoryWeights.performance ?? 0;
    }
    case "security": {
      return skillGuidance.categoryWeights.security ?? 0;
    }
    case "testing": {
      return skillGuidance.categoryWeights.testing ?? 0;
    }
    case "ui_polish": {
      return skillGuidance.categoryWeights.ui_polish ?? 0;
    }
  }

  throw new Error("Unknown finding category.");
}

function getSkillAdjustedPriority(
  priority: PlanItemPriority,
  category: FindingCategory,
  skillGuidance: SkillPlanGuidance | undefined
): PlanItemPriority {
  if (getSkillCategoryWeight(category, skillGuidance) < SKILL_PRIORITY_BOOST_WEIGHT) {
    return priority;
  }

  switch (priority) {
    case "critical":
    case "high": {
      return priority;
    }
    case "low": {
      return "medium";
    }
    case "medium": {
      return "high";
    }
  }

  throw new Error("Unknown plan item priority.");
}

function getSkillAcceptanceCriteria(category: FindingCategory, skillGuidance: SkillPlanGuidance | undefined): readonly string[] {
  if (skillGuidance === undefined || skillGuidance.loadedSkillNames.length === 0) {
    return [];
  }

  const criteria = [`Loaded skill guidance reviewed: ${skillGuidance.loadedSkillNames.join(", ")}.`];
  const categoryWeight = getSkillCategoryWeight(category, skillGuidance);

  if (categoryWeight >= SKILL_PRIORITY_BOOST_WEIGHT) {
    criteria.push(`Skill scoring prioritizes ${category.replaceAll("_", " ")} with weight ${categoryWeight}.`);
  }

  if (skillGuidance.forbiddenChangeTypes.length > 0) {
    criteria.push(`Forbidden skill change types stay out of scope: ${skillGuidance.forbiddenChangeTypes.join(", ")}.`);
  }

  if (skillGuidance.preferredCheckGuards.length > 0) {
    criteria.push(`Preferred skill check guards are considered: ${skillGuidance.preferredCheckGuards.join(", ")}.`);
  }

  return criteria;
}

function getSeverityWeight(severity: FindingSeverity): number {
  switch (severity) {
    case "critical": {
      return SEVERITY_CRITICAL_WEIGHT;
    }
    case "high": {
      return SEVERITY_HIGH_WEIGHT;
    }
    case "medium": {
      return SEVERITY_MEDIUM_WEIGHT;
    }
    case "low": {
      return 2;
    }
    case "info": {
      return 1;
    }
  }

  throw new Error("Unknown finding severity.");
}

function comparePlanGroups(firstGroup: PlanGroup, secondGroup: PlanGroup): number {
  return getCategoryRank(firstGroup.key) - getCategoryRank(secondGroup.key);
}

function comparePlanItems(firstItem: PlanItem, secondItem: PlanItem, skillGuidance: SkillPlanGuidance | undefined): number {
  const priorityDifference = getPriorityWeight(secondItem.priority) - getPriorityWeight(firstItem.priority);

  if (priorityDifference !== 0) {
    return priorityDifference;
  }

  const skillWeightDifference =
    getSkillCategoryWeight(secondItem.category, skillGuidance) - getSkillCategoryWeight(firstItem.category, skillGuidance);

  if (skillWeightDifference !== 0) {
    return skillWeightDifference;
  }

  const categoryDifference = getCategoryRank(firstItem.category) - getCategoryRank(secondItem.category);

  if (categoryDifference !== 0) {
    return categoryDifference;
  }

  return firstItem.title.localeCompare(secondItem.title);
}

function getGroupConfidence(findings: readonly Finding[]): number {
  if (findings.length === 0) {
    return 0;
  }

  let confidenceTotal = 0;

  for (const finding of findings) {
    confidenceTotal += finding.confidence;
  }

  return confidenceTotal / findings.length;
}

function getGroupSeverity(findings: readonly Finding[]): FindingSeverity {
  let highestSeverity: FindingSeverity = "info";

  for (const finding of findings) {
    if (getSeverityWeight(finding.severity) > getSeverityWeight(highestSeverity)) {
      highestSeverity = finding.severity;
    }
  }

  return highestSeverity;
}

function getPlanItemEffort(findings: readonly Finding[]): PlanItemEffort {
  if (findings.length >= LARGE_GROUP_SIZE || findings.some((finding) => finding.severity === "critical" || finding.severity === "high")) {
    return "large";
  }

  if (findings.length >= MEDIUM_GROUP_SIZE) {
    return "medium";
  }

  return "small";
}

function getPlanItemPriority(findings: readonly Finding[]): PlanItemPriority {
  switch (getGroupSeverity(findings)) {
    case "critical": {
      return "critical";
    }
    case "high": {
      return "high";
    }
    case "medium": {
      return "medium";
    }
    case "info":
    case "low": {
      return "low";
    }
  }

  throw new Error("Unknown finding severity.");
}

function getPlanItemRisk(findings: readonly Finding[], priority: PlanItemPriority): PlanItemRisk {
  if (priority === "critical" || priority === "high") {
    return "high";
  }

  if (findings.length >= MEDIUM_GROUP_SIZE || getGroupConfidence(findings) < HIGH_CONFIDENCE_THRESHOLD) {
    return "medium";
  }

  return "low";
}

function getPlanItemTitle(category: FindingCategory): string {
  switch (category) {
    case "correctness": {
      return "Harden TypeScript and correctness safeguards";
    }
    case "security": {
      return "Resolve security hygiene findings";
    }
    case "testing": {
      return "Add baseline test coverage and test command";
    }
    case "developer_experience": {
      return "Stabilize development workflow and verification commands";
    }
    case "maintainability": {
      return "Standardize code quality and repository hygiene";
    }
    case "architecture": {
      return "Clarify project architecture and frontend stack signals";
    }
    case "performance": {
      return "Address performance risks";
    }
    case "accessibility": {
      return "Improve accessibility safeguards";
    }
    case "ui_polish": {
      return "Polish frontend UI behavior";
    }
    case "modernization": {
      return "Modernize project tooling and patterns";
    }
    case "documentation": {
      return "Document setup and verification workflow";
    }
  }

  throw new Error("Unknown finding category.");
}

function groupFindings(findings: readonly Finding[]): readonly PlanGroup[] {
  const groups = new Map<FindingCategory, Finding[]>();

  for (const finding of findings) {
    const existingGroup = groups.get(finding.category) ?? [];
    existingGroup.push(finding);
    groups.set(finding.category, existingGroup);
  }

  const sortedGroups = [...groups.entries()].map<PlanGroup>(([category, groupedFindings]) => ({
    findings: groupedFindings,
    key: category
  }));

  sortedGroups.sort(comparePlanGroups);

  return sortedGroups;
}

function incrementCount(counts: Map<string, number>, key: PlanItemPriority | PlanItemRisk): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function mapGroupToPendingPlanItem(group: PlanGroup, skillGuidance: SkillPlanGuidance | undefined): PendingPlanItem {
  const { key: category } = group;
  const priority = getSkillAdjustedPriority(getPlanItemPriority(group.findings), category, skillGuidance);

  return {
    acceptanceCriteria: [...getAcceptanceCriteria(category), ...getSkillAcceptanceCriteria(category, skillGuidance)],
    category,
    effort: getPlanItemEffort(group.findings),
    findingIds: group.findings.map((finding) => finding.id),
    priority,
    risk: getPlanItemRisk(group.findings, priority),
    title: getPlanItemTitle(category)
  };
}

function sortPlanItems(planItems: readonly PlanItem[], skillGuidance: SkillPlanGuidance | undefined): readonly PlanItem[] {
  const sortedPlanItems = [...planItems];

  sortedPlanItems.sort((firstItem, secondItem) => comparePlanItems(firstItem, secondItem, skillGuidance));

  return sortedPlanItems;
}

function summarizePlan(planItems: readonly PlanItem[]): PlanSummary {
  const byPriority = new Map<string, number>();
  const byRisk = new Map<string, number>();

  for (const planItem of planItems) {
    incrementCount(byPriority, planItem.priority);
    incrementCount(byRisk, planItem.risk);
  }

  return {
    byPriority: Object.fromEntries(byPriority),
    byRisk: Object.fromEntries(byRisk),
    total: planItems.length
  };
}

export function createImprovementPlan(options: CreateImprovementPlanOptions): PlanArtifact {
  const createdAt = options.createdAt ?? DEFAULT_CREATED_AT;
  const skillGuidance =
    options.skillLoadResult === undefined ? undefined : createSkillPlanGuidance(options.skillLoadResult);
  const planId = createPlanId(options.runId, options.findings);
  const items = sortPlanItems(
    groupFindings(options.findings).map((group) => createPlanItem(planId, mapGroupToPendingPlanItem(group, skillGuidance))),
    skillGuidance
  );
  const plan: ImprovementPlan = {
    createdAt: createdAt.toISOString(),
    id: planId,
    items,
    runId: options.runId,
    status: "proposed"
  };
  const artifact: PlanArtifact = {
    plan,
    runId: options.runId,
    summary: summarizePlan(items)
  };

  if (skillGuidance === undefined) {
    return artifact;
  }

  return {
    ...artifact,
    skillGuidance
  };
}
