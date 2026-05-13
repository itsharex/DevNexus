import { beforeEach, describe, expect, it } from "vitest";

import { clearRegistry, getAll, register } from "@/app/plugin-registry/registry";
import { apiDebuggerPlugin } from "@/plugins/api-debugger";
import { networkToolsPlugin } from "@/plugins/network-tools";

describe("network tools plugin manifest", () => {
  beforeEach(() => {
    clearRegistry();
  });

  it("can be registered in the plugin registry", () => {
    register(networkToolsPlugin);

    expect(getAll().map((plugin) => plugin.id)).toEqual(["network-tools"]);
  });

  it("registers the api debugger plugin manifest", () => {
    register(apiDebuggerPlugin);

    expect(getAll().map((plugin) => plugin.id)).toEqual(["api-debugger"]);
  });
});
