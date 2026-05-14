import type { SshQuickCommand } from "@/plugins/ssh-client/types";

export interface CommandSuggestion {
  label: string;
  command: string;
  source: "quick" | "builtin";
}

const BUILTIN_COMMANDS = [
  "cat",
  "cd",
  "chmod",
  "chown",
  "cp",
  "curl",
  "df -h",
  "docker",
  "docker ps",
  "docker compose",
  "du -sh",
  "grep",
  "journalctl -xe",
  "less",
  "ls -la",
  "mkdir",
  "mv",
  "ps aux",
  "pwd",
  "rm",
  "scp",
  "sed",
  "ssh",
  "sudo",
  "systemctl status",
  "tail -f",
  "tar",
  "top",
  "vim",
];

function normalizeDraft(draft: string): string {
  return draft.trimStart().toLowerCase();
}

export function updateCommandDraft(current: string, chunk: string): string {
  if (chunk === "\r" || chunk === "\n" || chunk === "\u0003") {
    return "";
  }

  if (chunk === "\u007f" || chunk === "\b") {
    return current.slice(0, -1);
  }

  if (chunk === "\u0015") {
    return "";
  }

  if (chunk === "\u001b[D" || chunk === "\u001b[C" || chunk === "\u001b[A" || chunk === "\u001b[B") {
    return current;
  }

  if (/^[\x20-\x7e]+$/.test(chunk)) {
    return `${current}${chunk}`;
  }

  return current;
}

export function getCommandSuggestions(
  draft: string,
  quickCommands: SshQuickCommand[],
  limit = 6,
): CommandSuggestion[] {
  const prefix = normalizeDraft(draft);

  if (prefix.length < 2) {
    return [];
  }

  const seen = new Set<string>();
  const quickMatches = quickCommands
    .filter((item) => item.command.toLowerCase().startsWith(prefix))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((item) => ({
      label: item.name,
      command: item.command,
      source: "quick" as const,
    }));

  const builtinMatches = BUILTIN_COMMANDS.filter((command) =>
    command.toLowerCase().startsWith(prefix),
  ).map((command) => ({
    label: command,
    command,
    source: "builtin" as const,
  }));

  return [...quickMatches, ...builtinMatches].filter((item) => {
    if (seen.has(item.command)) {
      return false;
    }
    seen.add(item.command);
    return true;
  }).slice(0, limit);
}
