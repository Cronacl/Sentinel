import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const { mergeCatalogModels } = await import("./catalog-cache");

describe("mergeCatalogModels", () => {
  const effort = {
    choices: [{ id: "low", label: "Low" }],
    configId: "reasoning",
  } as never;

  it("keeps the agent's default and known efforts when a run learns models", () => {
    const merged = mergeCatalogModels(
      [
        { id: "default", isDefault: true, name: "Auto" },
        { effortOption: effort, id: "gpt-5.4", name: "GPT-5.4" },
      ],
      [
        { id: "default", name: "Auto" },
        { id: "gpt-5.4", name: "GPT-5.4" },
      ],
    );
    expect(merged).toEqual([
      { id: "default", isDefault: true, name: "Auto" },
      { effortOption: effort, id: "gpt-5.4", name: "GPT-5.4" },
    ]);
  });

  it("moves the default when a fresh session names another one", () => {
    const merged = mergeCatalogModels(
      [{ id: "default", isDefault: true, name: "Auto" }],
      [
        { id: "default", name: "Auto" },
        { id: "composer-2", isDefault: true, name: "Composer 2" },
      ],
    );
    expect(merged.filter((model) => model.isDefault)).toEqual([
      { id: "composer-2", isDefault: true, name: "Composer 2" },
    ]);
  });
});
