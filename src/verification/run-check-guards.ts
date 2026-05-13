import type { ChildProcessWithoutNullStreams } from "node:child_process";

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";

import type { CheckGuard, VerificationResult, VerificationResultLevel } from "../core/index.js";
import type {
  RunCheckGuardsOptions,
  VerificationArtifact,
  VerificationRunRecord,
  VerifyCommandParseResult,
  VerifyOutputSummary,
  VerifyProcessOutput,
  VerifyResultMessageOptions,
  VerifyRunRecordOptions
} from "./types.js";

const CONTENT_HASH_ALGORITHM = "sha256";
const ID_HASH_LENGTH = 12;
const MAX_OUTPUT_SUMMARY_CHARACTERS = 4000;
const MILLISECONDS_PER_SECOND = 1000;
const PROCESS_KILL_SIGNAL = "SIGTERM";
const UNSAFE_COMMAND_PARTS = ["&&", "&", "||", "|", ";", "<", ">", "`", "$("] as const;
const WINDOWS_ARGUMENT_QUOTE_PATTERN = /[\s"]/u;
const WINDOWS_ESCAPED_QUOTE = String.raw`\"`;
const WHITESPACE_PATTERN = /\s/u;
const WINDOWS_COMMAND_SHIMS = new Set(["npm", "npx", "pnpm", "yarn"]);

interface OutputBufferState {
  text: string;
  truncated: boolean;
}

interface SpawnCommand {
  readonly arguments_: readonly string[];
  readonly executable: string;
}

function appendOutputChunk(state: OutputBufferState, chunk: Buffer): void {
  if (state.text.length >= MAX_OUTPUT_SUMMARY_CHARACTERS) {
    state.truncated = true;
    return;
  }

  const nextText = chunk.toString("utf8");
  const remainingCharacters = MAX_OUTPUT_SUMMARY_CHARACTERS - state.text.length;

  if (nextText.length > remainingCharacters) {
    state.text += nextText.slice(0, remainingCharacters);
    state.truncated = true;
    return;
  }

  state.text += nextText;
}

function buildOutputSummary(state: OutputBufferState): VerifyOutputSummary {
  return {
    text: state.truncated ? `${state.text}\n[output truncated]` : state.text,
    truncated: state.truncated
  };
}

function createHashId(prefix: string, values: readonly string[]): string {
  const hash = createHash(CONTENT_HASH_ALGORITHM).update(values.join(":")).digest("hex").slice(0, ID_HASH_LENGTH);

  return `${prefix}-${hash}`;
}

function createRunRecord(options: VerifyRunRecordOptions): VerificationRunRecord {
  const runBase = {
    checkGuardId: options.checkGuard.id,
    command: options.checkGuard.command,
    completedAt: options.completedAt,
    durationMs: options.durationMs,
    id: options.verificationRunId,
    purpose: options.checkGuard.purpose,
    results: options.resultMessages,
    runId: options.runId,
    startedAt: options.startedAt,
    status: options.status,
    stderrSummary: options.output.stderr.text,
    stdoutSummary: options.output.stdout.text
  };

  if (options.exitCode === undefined) {
    return runBase;
  }

  return {
    ...runBase,
    exitCode: options.exitCode
  };
}

function getDurationMs(startedAtMs: number): number {
  return Math.round(performance.now() - startedAtMs);
}

function getResultLevel(status: VerificationRunRecord["status"]): VerificationResultLevel {
  switch (status) {
    case "passed": {
      return "info";
    }
    case "failed":
    case "timed_out": {
      return "error";
    }
    case "running":
    case "skipped": {
      return "warning";
    }
  }

  throw new Error("Unknown verification status.");
}

function getResultMessage(options: VerifyResultMessageOptions): string {
  switch (options.status) {
    case "failed": {
      return `Check guard '${options.checkGuardId}' failed with exit code ${options.exitCode ?? "unknown"}.`;
    }
    case "passed": {
      return `Check guard '${options.checkGuardId}' passed.`;
    }
    case "running": {
      return `Check guard '${options.checkGuardId}' is still running.`;
    }
    case "skipped": {
      return options.output.stderr.text.length > 0
        ? options.output.stderr.text
        : `Check guard '${options.checkGuardId}' was skipped.`;
    }
    case "timed_out": {
      return `Check guard '${options.checkGuardId}' timed out.`;
    }
  }

  throw new Error("Unknown verification status.");
}

function getProcessCloseStatus(timedOut: boolean, exitCode: number | undefined): VerificationRunRecord["status"] {
  if (timedOut) {
    return "timed_out";
  }

  if (exitCode === 0) {
    return "passed";
  }

  return "failed";
}

function quoteWindowsArgument(value: string): string {
  if (!WINDOWS_ARGUMENT_QUOTE_PATTERN.test(value)) {
    return value;
  }

  return `"${value.replaceAll("\"", WINDOWS_ESCAPED_QUOTE)}"`;
}

function getSpawnCommand(executable: string, arguments_: readonly string[]): SpawnCommand {
  if (process.platform !== "win32" || !WINDOWS_COMMAND_SHIMS.has(executable.toLowerCase())) {
    return {
      arguments_,
      executable
    };
  }

  return {
    arguments_: ["/d", "/s", "/c", [executable, ...arguments_].map((value) => quoteWindowsArgument(value)).join(" ")],
    executable: "cmd.exe"
  };
}

function spawnCheckProcess(spawnCommand: SpawnCommand, projectRootPath: string): ChildProcessWithoutNullStreams | Error {
  try {
    return spawn(spawnCommand.executable, [...spawnCommand.arguments_], {
      cwd: projectRootPath,
      shell: false,
      windowsHide: true
    });
  } catch (error: unknown) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

function createResultMessage(options: VerifyResultMessageOptions): VerificationResult {
  const level = getResultLevel(options.status);
  const message = getResultMessage(options);

  return {
    id: createHashId("verification-result", [options.verificationRunId, level, message]),
    level,
    message,
    verificationRunId: options.verificationRunId
  };
}

function hasUnsafeCommandPart(command: string): boolean {
  return UNSAFE_COMMAND_PARTS.some((part) => command.includes(part));
}

function incrementStatusCount(counts: Map<string, number>, status: VerificationRunRecord["status"]): void {
  counts.set(status, (counts.get(status) ?? 0) + 1);
}

function parseCommand(command: string): VerifyCommandParseResult {
  if (hasUnsafeCommandPart(command)) {
    return {
      arguments_: [],
      error: "Command contains shell control syntax and was skipped."
    };
  }

  const tokens: string[] = [];
  let currentToken = "";
  let quote: "\"" | "'" | undefined = undefined;

  for (const character of command) {
    if (quote !== undefined) {
      if (character === quote) {
        quote = undefined;
        continue;
      }

      currentToken += character;
      continue;
    }

    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }

    if (WHITESPACE_PATTERN.test(character)) {
      if (currentToken.length > 0) {
        tokens.push(currentToken);
        currentToken = "";
      }

      continue;
    }

    currentToken += character;
  }

  if (quote !== undefined) {
    return {
      arguments_: [],
      error: "Command contains an unterminated quote and was skipped."
    };
  }

  if (currentToken.length > 0) {
    tokens.push(currentToken);
  }

  const [executable, ...arguments_] = tokens;

  if (executable === undefined) {
    return {
      arguments_: [],
      error: "Command is empty and was skipped."
    };
  }

  return {
    arguments_,
    executable
  };
}

function summarizeVerificationRuns(runId: string, verificationRuns: readonly VerificationRunRecord[]): VerificationArtifact {
  const byStatus = new Map<string, number>();
  let durationMs = 0;

  for (const verificationRun of verificationRuns) {
    incrementStatusCount(byStatus, verificationRun.status);
    durationMs += verificationRun.durationMs;
  }

  return {
    runId,
    summary: {
      byStatus: Object.fromEntries(byStatus),
      durationMs,
      total: verificationRuns.length
    },
    verificationRuns
  };
}

async function runConfiguredCheckGuard(
  checkGuard: CheckGuard,
  projectRootPath: string,
  runId: string
): Promise<VerificationRunRecord> {
  const verificationRunId = createHashId("verification", [runId, checkGuard.id, checkGuard.command]);
  const parsedCommand = parseCommand(checkGuard.command);
  const { executable } = parsedCommand;
  const startedAt = new Date();
  const startedAtMs = performance.now();

  if (parsedCommand.error !== undefined || executable === undefined) {
    const output: VerifyProcessOutput = {
      stderr: {
        text: parsedCommand.error ?? "Command could not be parsed.",
        truncated: false
      },
      stdout: {
        text: "",
        truncated: false
      }
    };
    const completedAt = new Date();
    const resultMessages = [
      createResultMessage({
        checkGuardId: checkGuard.id,
        output,
        status: "skipped",
        verificationRunId
      })
    ];

    return createRunRecord({
      checkGuard,
      completedAt: completedAt.toISOString(),
      durationMs: getDurationMs(startedAtMs),
      output,
      resultMessages,
      runId,
      startedAt: startedAt.toISOString(),
      status: "skipped",
      verificationRunId
    });
  }

  return new Promise((resolve) => {
    const stdoutState: OutputBufferState = {
      text: "",
      truncated: false
    };
    const stderrState: OutputBufferState = {
      text: "",
      truncated: false
    };
    let resolved = false;
    let timedOut = false;
    const spawnCommand = getSpawnCommand(executable, parsedCommand.arguments_);
    const childProcess = spawnCheckProcess(spawnCommand, projectRootPath);

    if (childProcess instanceof Error) {
      const output: VerifyProcessOutput = {
        stderr: {
          text: childProcess.message,
          truncated: false
        },
        stdout: buildOutputSummary(stdoutState)
      };
      const completedAt = new Date();
      const resultMessages = [
        createResultMessage({
          checkGuardId: checkGuard.id,
          output,
          status: "failed",
          verificationRunId
        })
      ];

      resolve(
        createRunRecord({
          checkGuard,
          completedAt: completedAt.toISOString(),
          durationMs: getDurationMs(startedAtMs),
          output,
          resultMessages,
          runId,
          startedAt: startedAt.toISOString(),
          status: "failed",
          verificationRunId
        })
      );
      return;
    }

    const timeout = setTimeout(() => {
      timedOut = true;
      childProcess.kill(PROCESS_KILL_SIGNAL);
    }, checkGuard.timeoutSeconds * MILLISECONDS_PER_SECOND);

    childProcess.stdout.on("data", (chunk: Buffer) => {
      appendOutputChunk(stdoutState, chunk);
    });
    childProcess.stderr.on("data", (chunk: Buffer) => {
      appendOutputChunk(stderrState, chunk);
    });
    childProcess.on("error", (error: Error) => {
      if (resolved) {
        return;
      }

      resolved = true;
      clearTimeout(timeout);

      const output: VerifyProcessOutput = {
        stderr: {
          text: error.message,
          truncated: false
        },
        stdout: buildOutputSummary(stdoutState)
      };
      const completedAt = new Date();
      const status = timedOut ? "timed_out" : "failed";
      const resultMessages = [
        createResultMessage({
          checkGuardId: checkGuard.id,
          output,
          status,
          verificationRunId
        })
      ];

      resolve(
        createRunRecord({
          checkGuard,
          completedAt: completedAt.toISOString(),
          durationMs: getDurationMs(startedAtMs),
          output,
          resultMessages,
          runId,
          startedAt: startedAt.toISOString(),
          status,
          verificationRunId
        })
      );
    });
    childProcess.on("close", (exitCode: number | null) => {
      if (resolved) {
        return;
      }

      resolved = true;
      clearTimeout(timeout);

      const output: VerifyProcessOutput = {
        stderr: buildOutputSummary(stderrState),
        stdout: buildOutputSummary(stdoutState)
      };
      const completedAt = new Date();
      const normalizedExitCode = exitCode ?? undefined;
      const status = getProcessCloseStatus(timedOut, normalizedExitCode);
      const resultMessages = [
        createResultMessage({
          checkGuardId: checkGuard.id,
          ...(normalizedExitCode === undefined ? {} : { exitCode: normalizedExitCode }),
          output,
          status,
          verificationRunId
        })
      ];

      resolve(
        createRunRecord({
          checkGuard,
          completedAt: completedAt.toISOString(),
          durationMs: getDurationMs(startedAtMs),
          ...(normalizedExitCode === undefined ? {} : { exitCode: normalizedExitCode }),
          output,
          resultMessages,
          runId,
          startedAt: startedAt.toISOString(),
          status,
          verificationRunId
        })
      );
    });
  });
}

export async function runCheckGuards(options: RunCheckGuardsOptions): Promise<VerificationArtifact> {
  const verificationRuns: VerificationRunRecord[] = [];

  for (const checkGuard of options.checkGuards) {
    verificationRuns.push(await runConfiguredCheckGuard(checkGuard, options.projectRootPath, options.runId));
  }

  return summarizeVerificationRuns(options.runId, verificationRuns);
}
