export type OutputFormat = "text" | "json";
export type ResultStatus = "ok" | "error" | "not_implemented";
export type CliFlagValue = boolean | string;

export interface ParsedCli {
  command?: string;
  flags: Record<string, CliFlagValue>;
  positionals: string[];
  format: OutputFormat;
  debug: boolean;
  help: boolean;
  repoPath?: string;
  errors: string[];
}

export interface CliDebugInfo {
  argv: string[];
  parsed: ParsedCli;
  runtime: {
    cwd: string;
    node: string;
    platform: NodeJS.Platform;
  };
}

export interface CliResult {
  status: ResultStatus;
  message: string;
  command?: string;
  repoPath?: string;
  data?: unknown;
  debug?: CliDebugInfo;
}
