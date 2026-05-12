export const commandDescriptions = [
  ["plan", "Analyze a repository and create a Markdown/JSON improvement plan."],
  ["apply", "Apply batch-approved plan items from a saved plan."],
  ["verify", "Run configured check guards for a repository."],
  ["report", "Print or regenerate the latest run report."],
  ["debug", "Print parsed CLI arguments and runtime diagnostics."]
] as const;

export type CommandName = (typeof commandDescriptions)[number][0];

export function isKnownCommand(command: string): command is CommandName {
  return commandDescriptions.some(([name]) => name === command);
}
