import { describe, expect, test } from "vitest";

import {
  getCommandSuggestions,
  updateCommandDraft,
} from "@/plugins/ssh-client/utils/command-suggestions";

describe("ssh command suggestions", () => {
  test("matches built-in commands and quick commands by current prefix", () => {
    const suggestions = getCommandSuggestions("do", [
      {
        id: "qc-1",
        name: "Docker logs",
        command: "docker logs -f api",
        sortOrder: 0,
      },
    ]);

    expect(suggestions.map((item) => item.command)).toEqual([
      "docker logs -f api",
      "docker",
      "docker ps",
      "docker compose",
    ]);
  });

  test("keeps the current draft in sync with printable input and controls", () => {
    let draft = "";

    draft = updateCommandDraft(draft, "d");
    draft = updateCommandDraft(draft, "o");
    draft = updateCommandDraft(draft, "\u007f");
    draft = updateCommandDraft(draft, "f");

    expect(draft).toBe("df");
    expect(updateCommandDraft(draft, "\r")).toBe("");
  });
});
