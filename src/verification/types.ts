import type { CheckGuard, VerificationResult, VerificationRun } from "../core/index.js";

export interface RunCheckGuardsOptions {
  readonly checkGuards: readonly CheckGuard[];
  readonly projectRootPath: string;
  readonly runId: string;
}

export interface VerificationArtifact {
  readonly runId: string;
  readonly summary: VerificationSummary;
  readonly verificationRuns: readonly VerificationRunRecord[];
}

export interface VerificationRunRecord extends VerificationRun {
  readonly command: string;
  readonly purpose: CheckGuard["purpose"];
  readonly stderrSummary: string;
  readonly stdoutSummary: string;
}

export interface VerificationSummary {
  readonly byStatus: Readonly<Record<string, number>>;
  readonly durationMs: number;
  readonly total: number;
}

export interface VerifyCommandParseResult {
  readonly arguments_: readonly string[];
  readonly executable?: string;
  readonly error?: string;
}

export interface VerifyOutputSummary {
  readonly text: string;
  readonly truncated: boolean;
}

export interface VerifyProcessOutput {
  readonly stderr: VerifyOutputSummary;
  readonly stdout: VerifyOutputSummary;
}

export interface VerifyResultMessageOptions {
  readonly checkGuardId: string;
  readonly exitCode?: number;
  readonly output: VerifyProcessOutput;
  readonly status: VerificationRunRecord["status"];
  readonly verificationRunId: string;
}

export interface VerifyRunRecordOptions {
  readonly checkGuard: CheckGuard;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly exitCode?: number;
  readonly output: VerifyProcessOutput;
  readonly resultMessages: readonly VerificationResult[];
  readonly runId: string;
  readonly startedAt: string;
  readonly status: VerificationRunRecord["status"];
  readonly verificationRunId: string;
}
