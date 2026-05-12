import type {
  Finding,
  FindingCategory,
  FindingSeverity,
  PlanItem,
  PlanItemPriority,
  ProjectFileKind
} from "../core/index.js";
import type { SkippedPathReason } from "../project/index.js";
import type { CreateMarkdownReportOptions, MarkdownReportArtifact } from "./types.js";

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
const CHECK_GUARD_TIMEOUT_UNIT = "s";
const EMPTY_VALUE = "none";
const MAX_FINDINGS_PER_CATEGORY = 5;
const MAX_PATTERN_COUNT = 8;
const MAX_SKIPPED_PATH_EXAMPLES = 6;
const PRIORITY_CRITICAL_WEIGHT = 4;
const PRIORITY_HIGH_WEIGHT = 3;
const SEVERITY_CRITICAL_WEIGHT = 5;
const SEVERITY_HIGH_WEIGHT = 4;
const SEVERITY_MEDIUM_WEIGHT = 3;
const TABLE_PIPE_ESCAPE = String.raw`\|`;
const STACK_SIGNAL_LABELS: readonly [keyof CreateMarkdownReportOptions["inventory"]["stackSignals"], string][] = [
  ["eslint", "ESLint"],
  ["next", "Next"],
  ["playwright", "Playwright"],
  ["prettier", "Prettier"],
  ["react", "React"],
  ["storybook", "Storybook"],
  ["tailwind", "Tailwind"],
  ["typescript", "TypeScript"],
  ["vite", "Vite"],
  ["vitest", "Vitest"]
] as const;

function addSection(lines: string[], title: string): void {
  lines.push("", `## ${title}`, "");
}

function countFilesByKind(files: readonly { readonly kind: ProjectFileKind }[]): ReadonlyMap<ProjectFileKind, number> {
  const counts = new Map<ProjectFileKind, number>();

  for (const file of files) {
    counts.set(file.kind, (counts.get(file.kind) ?? 0) + 1);
  }

  return counts;
}

function countFindingsByCategory(findings: readonly Finding[]): ReadonlyMap<FindingCategory, readonly Finding[]> {
  const groupedFindings = new Map<FindingCategory, Finding[]>();

  for (const finding of findings) {
    const categoryFindings = groupedFindings.get(finding.category) ?? [];
    categoryFindings.push(finding);
    groupedFindings.set(finding.category, categoryFindings);
  }

  return groupedFindings;
}

function countSkippedByReason(skippedPaths: readonly { readonly reason: SkippedPathReason }[]): ReadonlyMap<SkippedPathReason, number> {
  const counts = new Map<SkippedPathReason, number>();

  for (const skippedPath of skippedPaths) {
    counts.set(skippedPath.reason, (counts.get(skippedPath.reason) ?? 0) + 1);
  }

  return counts;
}

function escapeTableCell(value: string): string {
  return value.replaceAll("|", TABLE_PIPE_ESCAPE).replaceAll("\n", " ");
}

function formatCategory(category: FindingCategory): string {
  return category.replaceAll("_", " ");
}

function formatCountMap<TKey extends string>(counts: ReadonlyMap<TKey, number>): string {
  if (counts.size === 0) {
    return EMPTY_VALUE;
  }

  const parts: string[] = [];

  for (const [key, count] of counts) {
    parts.push(`${key}: ${count}`);
  }

  return parts.join(", ");
}

function formatList(values: readonly string[]): string {
  if (values.length === 0) {
    return EMPTY_VALUE;
  }

  return values.join(", ");
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

function hasStackSignal(
  options: CreateMarkdownReportOptions,
  key: keyof CreateMarkdownReportOptions["inventory"]["stackSignals"]
): boolean {
  switch (key) {
    case "eslint": {
      return options.inventory.stackSignals.eslint;
    }
    case "next": {
      return options.inventory.stackSignals.next;
    }
    case "playwright": {
      return options.inventory.stackSignals.playwright;
    }
    case "prettier": {
      return options.inventory.stackSignals.prettier;
    }
    case "react": {
      return options.inventory.stackSignals.react;
    }
    case "storybook": {
      return options.inventory.stackSignals.storybook;
    }
    case "tailwind": {
      return options.inventory.stackSignals.tailwind;
    }
    case "typescript": {
      return options.inventory.stackSignals.typescript;
    }
    case "vite": {
      return options.inventory.stackSignals.vite;
    }
    case "vitest": {
      return options.inventory.stackSignals.vitest;
    }
  }

  throw new Error("Unknown stack signal.");
}

function getStackSignalNames(options: CreateMarkdownReportOptions): readonly string[] {
  const signals: string[] = [];

  for (const [key, label] of STACK_SIGNAL_LABELS) {
    if (hasStackSignal(options, key)) {
      signals.push(label);
    }
  }

  return signals;
}

function sortFindings(findings: readonly Finding[]): readonly Finding[] {
  const sortedFindings = [...findings];

  sortedFindings.sort((firstFinding, secondFinding) => {
    const severityDifference = getSeverityWeight(secondFinding.severity) - getSeverityWeight(firstFinding.severity);

    if (severityDifference !== 0) {
      return severityDifference;
    }

    return firstFinding.title.localeCompare(secondFinding.title);
  });

  return sortedFindings;
}

function sortPlanItems(planItems: readonly PlanItem[]): readonly PlanItem[] {
  const sortedPlanItems = [...planItems];

  sortedPlanItems.sort((firstItem, secondItem) => {
    const priorityDifference = getPriorityWeight(secondItem.priority) - getPriorityWeight(firstItem.priority);

    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    const categoryDifference = getCategoryRank(firstItem.category) - getCategoryRank(secondItem.category);

    if (categoryDifference !== 0) {
      return categoryDifference;
    }

    return firstItem.title.localeCompare(secondItem.title);
  });

  return sortedPlanItems;
}

function truncateValues(values: readonly string[], limit: number): readonly string[] {
  if (values.length <= limit) {
    return values;
  }

  return [...values.slice(0, limit), `and ${values.length - limit} more`];
}

function writeCheckGuards(lines: string[], options: CreateMarkdownReportOptions): void {
  addSection(lines, "Suggested Check Guards");

  if (options.inventory.checkGuards.length === 0) {
    lines.push("No check guards are configured yet.");
    return;
  }

  lines.push("| ID | Purpose | Command | Timeout |", "| --- | --- | --- | --- |");

  for (const checkGuard of options.inventory.checkGuards) {
    lines.push(
      `| ${escapeTableCell(checkGuard.id)} | ${checkGuard.purpose} | \`${escapeTableCell(checkGuard.command)}\` | ${checkGuard.timeoutSeconds}${CHECK_GUARD_TIMEOUT_UNIT} |`
    );
  }
}

function writeDetectedProjectFacts(lines: string[], options: CreateMarkdownReportOptions): void {
  const fileKindCounts = countFilesByKind(options.inventory.files);

  addSection(lines, "Detected Project Facts");
  lines.push(
    `- Project: ${options.inventory.project.name}`,
    `- Root: ${options.inventory.project.rootPath}`,
    `- Project type: ${options.inventory.project.projectType}`,
    `- Package manager: ${options.inventory.project.packageManager}`,
    `- Package manifests: ${options.inventory.packageManifests.length}`,
    `- Indexed files: ${options.inventory.files.length}`,
    `- File kinds: ${formatCountMap(fileKindCounts)}`,
    `- Stack signals: ${formatList(getStackSignalNames(options))}`
  );
}

function writeFindings(lines: string[], options: CreateMarkdownReportOptions): void {
  addSection(lines, "Findings By Category");

  if (options.findingsArtifact.findings.length === 0) {
    lines.push("No deterministic findings were generated.");
    return;
  }

  const groupedFindings = countFindingsByCategory(options.findingsArtifact.findings);

  for (const category of CATEGORY_ORDER) {
    const findings = groupedFindings.get(category) ?? [];

    if (findings.length === 0) {
      continue;
    }

    lines.push(`### ${formatCategory(category)}`, "");

    const sortedFindings = sortFindings(findings);
    const visibleFindings = sortedFindings.slice(0, MAX_FINDINGS_PER_CATEGORY);

    for (const finding of visibleFindings) {
      const evidenceMessages = finding.evidence.map((evidence) => evidence.message);

      lines.push(
        `- ${finding.severity} - ${finding.title}`,
        `  - Evidence: ${formatList(evidenceMessages)}`,
        `  - Remediation: ${finding.recommendedRemediation}`
      );
    }

    if (sortedFindings.length > MAX_FINDINGS_PER_CATEGORY) {
      lines.push(`- and ${sortedFindings.length - MAX_FINDINGS_PER_CATEGORY} more.`);
    }

    lines.push("");
  }
}

function writeNextActions(lines: string[], options: CreateMarkdownReportOptions): void {
  addSection(lines, "Next Actions");

  if (options.planArtifact.plan.items.length === 0) {
    lines.push("- Keep the current baseline green and rerun the agent after meaningful project changes.");
    return;
  }

  const [firstItem] = sortPlanItems(options.planArtifact.plan.items);

  if (firstItem !== undefined) {
    lines.push(`- Review the top proposed item: ${firstItem.id} - ${firstItem.title}.`);
  }

  lines.push(
    "- Decide which proposed plan item IDs should be approved for implementation.",
    "- Run the listed check guard commands before and after approved edits.",
    "- Keep generated files, secrets, local artifacts, and ignored paths out of automated edit scope."
  );
}

function writePlan(lines: string[], options: CreateMarkdownReportOptions): void {
  addSection(lines, "Prioritized Plan");

  if (options.planArtifact.plan.items.length === 0) {
    lines.push("No plan items were generated because there are no findings.");
    return;
  }

  lines.push("| ID | Priority | Risk | Effort | Category | Title |", "| --- | --- | --- | --- | --- | --- |");

  for (const planItem of sortPlanItems(options.planArtifact.plan.items)) {
    lines.push(
      `| ${planItem.id} | ${planItem.priority} | ${planItem.risk} | ${planItem.effort} | ${formatCategory(planItem.category)} | ${escapeTableCell(planItem.title)} |`
    );
  }
}

function writePrivacySummary(lines: string[], options: CreateMarkdownReportOptions): void {
  const ignorePatterns = truncateValues([...options.config.privacy.ignore], MAX_PATTERN_COUNT);

  addSection(lines, "Safety And Privacy Summary");
  lines.push(
    `- Config source: ${options.configLoadResult.source}`,
    `- Config path: ${options.configLoadResult.configPath ?? EMPTY_VALUE}`,
    `- Read secrets: ${options.config.privacy.readSecrets}`,
    `- Read git history: ${options.config.privacy.readGitHistory}`,
    `- Ignored path patterns: ${formatList(ignorePatterns)}`,
    `- Config warnings: ${formatList(options.configLoadResult.warnings)}`
  );
}

function writeRunSummary(lines: string[], options: CreateMarkdownReportOptions): void {
  lines.push(
    "# Pimp My Codebase Report",
    "",
    `- Run ID: ${options.run.id}`,
    `- Status: ${options.run.status}`,
    `- Mode: ${options.run.mode}`,
    `- Started: ${options.run.startedAt}`,
    `- Completed: ${options.run.completedAt ?? EMPTY_VALUE}`,
    `- Findings: ${options.findingsArtifact.summary.total}`,
    `- Plan items: ${options.planArtifact.summary.total}`
  );
}

function writeSkippedPaths(lines: string[], options: CreateMarkdownReportOptions): void {
  const skippedCounts = countSkippedByReason(options.inventory.skippedPaths);
  const skippedPathExamples = truncateValues(
    options.inventory.skippedPaths.map((skippedPath) => `${skippedPath.path} (${skippedPath.reason})`),
    MAX_SKIPPED_PATH_EXAMPLES
  );

  addSection(lines, "Skipped And Ignored Paths");
  lines.push(
    `- Skipped paths: ${options.inventory.skippedPaths.length}`,
    `- Reasons: ${formatCountMap(skippedCounts)}`,
    `- Examples: ${formatList(skippedPathExamples)}`
  );
}

export function createMarkdownReport(options: CreateMarkdownReportOptions): MarkdownReportArtifact {
  const lines: string[] = [];

  writeRunSummary(lines, options);
  writeDetectedProjectFacts(lines, options);
  writePrivacySummary(lines, options);
  writeFindings(lines, options);
  writePlan(lines, options);
  writeCheckGuards(lines, options);
  writeSkippedPaths(lines, options);
  writeNextActions(lines, options);
  lines.push("");

  return {
    markdown: lines.join("\n"),
    runId: options.run.id,
    summary: {
      findingCount: options.findingsArtifact.summary.total,
      planItemCount: options.planArtifact.summary.total,
      skippedPathCount: options.inventory.skippedPaths.length
    }
  };
}
