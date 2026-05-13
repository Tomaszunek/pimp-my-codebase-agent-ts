import { readFile } from "node:fs/promises";

import type { PlanItem } from "../core/index.js";
import type { PlanArtifact, PlanSummary } from "../planning/index.js";
import type { LoadedPlanArtifact } from "./types.js";

const PLAN_ITEM_CATEGORIES = [
  "accessibility",
  "architecture",
  "correctness",
  "developer_experience",
  "documentation",
  "maintainability",
  "modernization",
  "performance",
  "security",
  "testing",
  "ui_polish"
] as const;
const PLAN_ITEM_EFFORTS = ["large", "medium", "small"] as const;
const PLAN_ITEM_PRIORITIES = ["critical", "high", "low", "medium"] as const;
const PLAN_ITEM_RISKS = ["high", "low", "medium"] as const;
const PLAN_ITEM_STATUSES = ["approved", "applied", "blocked", "proposed", "rejected", "skipped"] as const;
const PLAN_STATUSES = ["approved", "applied", "draft", "proposed", "rejected"] as const;

function isAllowedValue<const AllowedValue extends string>(
  value: unknown,
  allowedValues: readonly AllowedValue[]
): value is AllowedValue {
  return typeof value === "string" && (allowedValues as readonly string[]).includes(value);
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeStringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const strings: string[] = [];

  for (const item of value as readonly unknown[]) {
    if (typeof item !== "string") {
      return undefined;
    }

    strings.push(item);
  }

  return strings;
}

function parsePlanItem(value: unknown): PlanItem | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const acceptanceCriteria = normalizeStringArray(value.acceptanceCriteria);
  const findingIds = normalizeStringArray(value.findingIds);

  if (
    acceptanceCriteria === undefined ||
    findingIds === undefined ||
    !isAllowedValue(value.category, PLAN_ITEM_CATEGORIES) ||
    !isAllowedValue(value.effort, PLAN_ITEM_EFFORTS) ||
    !isAllowedValue(value.priority, PLAN_ITEM_PRIORITIES) ||
    !isAllowedValue(value.risk, PLAN_ITEM_RISKS) ||
    !isAllowedValue(value.status, PLAN_ITEM_STATUSES) ||
    typeof value.id !== "string" ||
    typeof value.planId !== "string" ||
    typeof value.title !== "string"
  ) {
    return undefined;
  }

  return {
    acceptanceCriteria,
    category: value.category,
    effort: value.effort,
    findingIds,
    id: value.id,
    planId: value.planId,
    priority: value.priority,
    risk: value.risk,
    status: value.status,
    title: value.title
  };
}

function summarizePlanItems(items: readonly PlanItem[]): PlanSummary {
  const byPriority = new Map<string, number>();
  const byRisk = new Map<string, number>();

  for (const item of items) {
    byPriority.set(item.priority, (byPriority.get(item.priority) ?? 0) + 1);
    byRisk.set(item.risk, (byRisk.get(item.risk) ?? 0) + 1);
  }

  return {
    byPriority: Object.fromEntries(byPriority),
    byRisk: Object.fromEntries(byRisk),
    total: items.length
  };
}

export function parsePlanArtifact(value: unknown): LoadedPlanArtifact {
  if (!isPlainObject(value) || !isPlainObject(value.plan)) {
    throw new Error("Plan artifact must contain a plan object.");
  }

  const { plan } = value;

  if (
    typeof plan.createdAt !== "string" ||
    typeof plan.id !== "string" ||
    typeof plan.runId !== "string" ||
    !isAllowedValue(plan.status, PLAN_STATUSES) ||
    !Array.isArray(plan.items)
  ) {
    throw new Error("Plan artifact has an invalid plan shape.");
  }

  const items: PlanItem[] = [];

  for (const item of plan.items as readonly unknown[]) {
    const parsedItem = parsePlanItem(item);

    if (parsedItem === undefined) {
      throw new Error("Plan artifact contains an invalid plan item.");
    }

    items.push(parsedItem);
  }

  const artifact: PlanArtifact = {
    plan: {
      createdAt: plan.createdAt,
      id: plan.id,
      items,
      runId: plan.runId,
      status: plan.status
    },
    runId: typeof value.runId === "string" ? value.runId : plan.runId,
    summary: summarizePlanItems(items)
  };

  return {
    artifact,
    warnings: []
  };
}

export async function loadPlanArtifact(planPath: string): Promise<LoadedPlanArtifact> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- The user selects the saved plan artifact path.
  const rawPlan = await readFile(planPath, "utf8");

  return parsePlanArtifact(JSON.parse(rawPlan) as unknown);
}
