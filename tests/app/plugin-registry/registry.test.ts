import { beforeEach, describe, expect, it } from "vitest";

import {
  clearRegistry,
  getAll,
  getById,
  register,
} from "@/app/plugin-registry/registry";
import type { PluginManifest } from "@/app/plugin-registry/types";

const createManifest = (id: string, sidebarOrder: number): PluginManifest => ({
  id,
  name: id,
  icon: null,
  version: "0.1.0",
  component: () => null,
  sidebarOrder,
});

describe("plugin registry", () => {
  beforeEach(() => {
    clearRegistry();
  });

  it("returns plugins sorted by sidebar order", () => {
    register(createManifest("redis", 20));
    register(createManifest("ssh", 10));

    expect(getAll().map((plugin) => plugin.id)).toEqual(["ssh", "redis"]);
  });

  it("ignores duplicate plugin id registration", () => {
    register(createManifest("redis", 20));
    register(createManifest("redis", 5));

    expect(getAll()).toHaveLength(1);
    expect(getById("redis")?.sidebarOrder).toBe(20);
  });
});
