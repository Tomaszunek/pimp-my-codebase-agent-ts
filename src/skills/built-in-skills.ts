export const ARCHITECTURE_CLEANUP_SKILL_MARKDOWN = `# architecture-cleanup

## Intent
Clarify boundaries, module ownership, and project structure before larger edits.

## Preferred Project Signals
- typescript
- source-directories
- package-manifest

## Allowed Change Types
- architecture
- maintainability
- documentation

## Forbidden Change Types
- unrelated rewrites
- framework swaps
- generated artifact churn

## Scoring Weights
- architecture: 4
- maintainability: 3
- documentation: 2

## Preferred Check Guards
- typecheck
- build

## Report Sections
- architecture
- maintainability
- documentation
`;

export const FRONTEND_POLISH_SKILL_MARKDOWN = `# frontend-polish

## Intent
Improve frontend behavior, visual finish, accessibility, and interaction quality in scoped passes.

## Preferred Project Signals
- react
- vite
- next
- tailwind
- styles

## Allowed Change Types
- ui_polish
- accessibility
- performance
- testing

## Forbidden Change Types
- branding rewrite
- unrelated navigation changes
- inaccessible visual-only fixes

## Scoring Weights
- ui_polish: 4
- accessibility: 3
- performance: 2

## Preferred Check Guards
- lint
- test
- build

## Report Sections
- ui_polish
- accessibility
- performance
`;

export const MODERNIZE_SKILL_MARKDOWN = `# modernize

## Intent
Keep tooling, dependencies, and implementation patterns current without broad rewrites.

## Preferred Project Signals
- typescript
- package-manifest
- lockfile
- vite
- react

## Allowed Change Types
- modernization
- developer_experience
- maintainability
- documentation

## Forbidden Change Types
- secret access
- broad framework rewrite
- generated artifact churn

## Scoring Weights
- modernization: 4
- developer_experience: 3
- maintainability: 3

## Preferred Check Guards
- typecheck
- lint
- build

## Report Sections
- modernization
- developer_experience
- maintainability
`;

export const QUALITY_SKILL_MARKDOWN = `# quality

## Intent
Raise correctness, maintainability, and repeatable verification before risky code changes.

## Preferred Project Signals
- typescript
- eslint
- tests
- package-manifest

## Allowed Change Types
- correctness
- maintainability
- testing
- developer_experience

## Forbidden Change Types
- unverified behavior changes
- secret access
- unrelated formatting churn

## Scoring Weights
- correctness: 4
- maintainability: 4
- testing: 3
- developer_experience: 2

## Preferred Check Guards
- typecheck
- lint
- test

## Report Sections
- correctness
- maintainability
- testing
- developer_experience
`;

export const SECURITY_PASS_SKILL_MARKDOWN = `# security-pass

## Intent
Reduce security hygiene risks while preserving local privacy and ignored secret boundaries.

## Preferred Project Signals
- package-manifest
- env-files
- config-files

## Allowed Change Types
- security
- correctness
- documentation

## Forbidden Change Types
- reading secrets
- logging sensitive values
- disabling privacy ignores

## Scoring Weights
- security: 5
- correctness: 2
- documentation: 2

## Preferred Check Guards
- lint
- test

## Report Sections
- security
- correctness
- documentation
`;

export const TEST_BOOSTER_SKILL_MARKDOWN = `# test-booster

## Intent
Add a small, repeatable test baseline around current behavior before deeper implementation work.

## Preferred Project Signals
- tests
- vitest
- playwright
- node-test

## Allowed Change Types
- testing
- correctness
- developer_experience

## Forbidden Change Types
- brittle snapshot churn
- external service dependency
- broad behavior rewrite

## Scoring Weights
- testing: 5
- correctness: 3
- developer_experience: 2

## Preferred Check Guards
- test
- typecheck

## Report Sections
- testing
- correctness
- developer_experience
`;

export function getBuiltInSkillMarkdown(skillName: string): string | undefined {
  switch (skillName) {
    case "architecture-cleanup": {
      return ARCHITECTURE_CLEANUP_SKILL_MARKDOWN;
    }
    case "frontend-polish": {
      return FRONTEND_POLISH_SKILL_MARKDOWN;
    }
    case "modernize": {
      return MODERNIZE_SKILL_MARKDOWN;
    }
    case "quality": {
      return QUALITY_SKILL_MARKDOWN;
    }
    case "security-pass": {
      return SECURITY_PASS_SKILL_MARKDOWN;
    }
    case "test-booster": {
      return TEST_BOOSTER_SKILL_MARKDOWN;
    }
  }

  return undefined;
}
