# Pimp My Codebase Agent - Implementation Steps

## Build Target

Create a local-first TypeScript CLI agent for frontend TypeScript/Node projects. V1 focuses on pnpm projects, local LM Studio, Markdown reports, JSON run artifacts, batch-approved plan items, and safe verification through configured check guards.

## Recommended Defaults

- Store runs under `.pimp-my-codebase/runs/<run-id>/`.
- Save both `report.md` and machine-readable JSON artifacts.
- Use batch approval from a saved plan with selectable plan item IDs.
- Use strict TypeScript, pnpm, ESLint/Prettier, accessibility checks, tests, and clean module boundaries as the opinionated baseline.
- Deny generated files unless explicitly allowed in project config.
- Do not read `.env`, `.env.*`, `.npmrc`, `.git`, secrets, private registry credentials, or git history by default.

## Step 1 - Scaffold The CLI

Create the TypeScript project foundation.

- Add `package.json`.
- Add `tsconfig.json`.
- Add source directory structure.
- Add CLI entrypoint.
- Add `--debug`, `--json`, and `--format json` for inspecting CLI parsing and command results.
- Add build script.
- Add basic test script placeholder.

Expected files:

```text
src/
  cli/
    index.ts
  core/
  config/
  project/
  analysis/
  planning/
  llm/
  patching/
  verification/
  reporting/
  persistence/
```

Done when:

- `pnpm build` compiles.
- CLI can print help.
- CLI can print debug/result output as JSON.

## Step 2 - Define Core Types

Create shared domain types from the ERD.

- `Project`
- `ProjectFile`
- `PackageManifest`
- `CheckGuard`
- `AgentRun`
- `Finding`
- `ImprovementPlan`
- `PlanItem`
- `PatchSet`
- `FileChange`
- `VerificationRun`
- `VerificationResult`
- `RunReport`

Done when:

- Core types compile.
- All modules import shared types instead of duplicating shapes.

## Step 3 - Add Config Loading

Implement project config discovery and defaults.

Recommended config file:

```text
.pimp-my-codebase/config.json
```

Config should support:

- project type
- package manager
- LM Studio provider settings
- privacy ignore list
- check guards
- skills
- generated file allowlist

Done when:

- Missing config falls back to safe defaults.
- Invalid config returns clear validation errors.

## Step 4 - Implement Privacy-Safe Project Scanner

Build a scanner for frontend pnpm projects.

Scanner should:

- detect project root
- detect pnpm lockfile
- read `package.json`
- collect scripts and dependencies
- detect frontend stack signals: React, Vite, Next, Tailwind, Vitest, Playwright, Storybook
- read safe config files like `tsconfig.json`, Vite config, Tailwind config, ESLint config, Prettier config
- index safe source files with path, language, kind, size, and content hash

Scanner must skip:

- `.env`, `.env.*`
- `.npmrc`
- `.git`
- `node_modules`
- generated files unless allowed
- lockfile contents beyond metadata needed for detection

Done when:

- `pimp-my-codebase plan --repo ../logo` can create a project inventory.
- Forbidden files are not read.

## Step 5 - Add Run Persistence

Create a run store.

Each run should create:

```text
.pimp-my-codebase/
  runs/
    <run-id>/
      inventory.json
      findings.json
      plan.json
      report.md
      verification.json
```

Also maintain:

```text
.pimp-my-codebase/runs/latest
```

Done when:

- [x] each run has a stable ID
- [x] artifacts are written consistently
- [x] latest run can be resolved

Current note:

- `plan` persists the scanner inventory now. `findings.json`, `plan.json`, `report.md`, and `verification.json` are initialized as placeholders and will be populated by later steps.

## Step 6 - Implement Deterministic Analyzers

Start with deterministic analyzers before calling the LLM.

Initial analyzers:

- package manager analyzer
- scripts analyzer
- TypeScript config analyzer
- test setup analyzer
- lint/format analyzer
- frontend stack analyzer
- documentation analyzer
- repository hygiene analyzer

Each finding should include:

- category
- title
- severity
- confidence
- evidence
- recommended remediation

Done when:

- [x] scanner output becomes normalized findings
- [x] findings can be saved to `findings.json`

Current note:

- `plan` now runs deterministic analyzers and writes normalized findings to `findings.json`. The first analyzer pass covers package manager, scripts, TypeScript config, test setup, lint/format setup, frontend stack signals, documentation, and repository hygiene.

## Step 7 - Implement Planning

Convert findings into plan items.

Plan item fields:

- title
- category
- priority
- risk
- effort
- status
- finding IDs
- acceptance criteria

Planning rules:

- group related findings
- prefer reviewable plan items
- flag high-risk changes
- default status is `proposed`

Done when:

- [x] `plan.json` is created
- [x] report includes ranked plan items

Current note:

- `plan` now converts findings into grouped, ranked, proposed plan items and writes `plan.json`. The Markdown report includes those ranked plan items.

## Step 8 - Add Markdown Reporting

Generate a human-friendly report.

Report sections:

- run summary
- detected project facts
- safety/privacy summary
- findings by category
- prioritized plan
- suggested check guards
- skipped/ignored paths summary
- next actions

Done when:

- [x] `report.md` is useful without opening JSON files
- [x] report is generated for `../logo`

Current note:

- `plan` now writes a human-readable `report.md` with run summary, detected project facts, safety/privacy summary, findings by category, prioritized plan items, suggested check guards, skipped paths, and next actions.

## Step 9 - Add LM Studio Provider

Add local LLM support after deterministic context exists.

Provider interface should support:

- model name
- base URL
- chat completion request
- timeout
- error handling

LM Studio default:

```text
ws://127.0.0.1:1234
```

Use LLM for:

- improving plan quality
- explaining findings
- suggesting modernization steps
- applying skill markdown guidance

Do not send:

- forbidden files
- secrets
- env files
- git history

Done when:

- [x] plan generation can optionally use LM Studio
- [x] deterministic plan still works if LM Studio is unavailable

Current note:

- `plan` records an `llmReview` in `plan.json`. When LLM config is disabled, it records a disabled status. When enabled with a model, the LM Studio provider uses `@lmstudio/sdk` to request a concise review of safe metadata only; failures are captured as warnings without breaking deterministic artifacts.

## Step 10 - Add Skill Markdown Loading

Implement skill markdown as the preset/customization layer.

Skill files should define:

- intent
- preferred project signals
- allowed change types
- forbidden change types
- scoring weights
- preferred check guards
- report sections

Suggested built-in skills:

- `modernize`
- `quality`
- `frontend-polish`
- `security-pass`
- `test-booster`
- `architecture-cleanup`

Done when:

- [x] config can load skills by name
- [x] plan generation uses skill guidance

Current note:

- Built-in skill Markdown is parsed for `modernize`, `quality`, `frontend-polish`, `security-pass`, `test-booster`, and `architecture-cleanup`. Projects can override or add skills with `.pimp-my-codebase/skills/<name>.md`; the generated plan records compact skill guidance instead of full Markdown content.

## Step 11 - Implement Check Guards

Add safe verification.

Check guard fields:

- ID
- command
- purpose
- timeout seconds

Default suggested guards:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Rules:

- run only configured commands
- capture exit code
- capture duration
- summarize stdout/stderr
- attach result to report

Done when:

- `pimp-my-codebase verify --repo ../logo` runs configured checks
- verification results are saved to `verification.json`

## Step 12 - Add Apply Mode

Implement batch-approved edits from a saved plan.

CLI shape:

```bash
pimp-my-codebase apply --repo . --plan .pimp-my-codebase/runs/latest/plan.json --items item-1,item-2
```

Apply mode should:

- load plan
- validate selected item IDs
- refuse high-risk items unless explicitly allowed
- inspect target files before edit
- refuse dirty or unsafe file edits
- apply patch
- record patch set
- run configured check guards when relevant
- generate final report

Done when:

- one low-risk improvement can be applied and reported

## Step 13 - Strengthen Frontend Intelligence

Add richer analyzers.

Focus areas:

- accessibility
- UI polish
- component structure
- module boundaries
- stale dependencies
- missing tests
- weak error states
- performance risks
- documentation gaps
- modernization opportunities

Done when:

- reports feel useful for real frontend refactoring and modernization

## Step 14 - Add Scores If Useful

Add optional before/after scores.

Possible scores:

- modernization
- maintainability
- test readiness
- accessibility
- security hygiene
- developer experience

Done when:

- scores are explainable
- scores are based on evidence, not vibes

## First Milestone Checklist

- [x] TypeScript CLI skeleton exists.
- [x] `pimp-my-codebase plan --repo ../logo` works.
- [x] pnpm frontend project detection works.
- [x] privacy-safe scanner skips forbidden files.
- [x] deterministic analyzers produce findings.
- [x] `plan.json` is saved.
- [x] `report.md` is saved.
- [ ] `pimp-my-codebase verify --repo ../logo` runs check guards.
- [ ] verification results are saved.
- [ ] report summarizes findings, plan, and verification.

## V1 Completion Checklist

- [ ] CLI commands exist: `plan`, `apply`, `verify`, `report`.
- [x] local LM Studio provider works.
- [x] deterministic fallback works without LM Studio.
- [ ] skill markdown files influence planning.
- [ ] batch approval by plan item ID works.
- [ ] apply mode can make one safe low-risk edit.
- [ ] patch sets and file changes are recorded.
- [ ] final report includes applied changes and verification results.
- [ ] generated files are denied unless explicitly allowed.
- [ ] no git automation is performed.
