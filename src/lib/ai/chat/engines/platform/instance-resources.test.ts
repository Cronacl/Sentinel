import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const {
  createInstanceResourceMap,
  disposeInstanceResources,
  getInstanceResources,
  retireInstanceResources,
} = await import("./instance-resources");

type Resource = { name: string };

describe("createInstanceResourceMap", () => {
  it("creates one resource per instance and reuses it for the same key", () => {
    const map = createInstanceResourceMap<Resource>({ dispose: () => {} });
    const create = mock(() => ({ name: "a" }));

    const first = map.get("codex-work", "key-1", create);
    expect(map.get("codex-work", "key-1", create)).toBe(first);
    expect(create).toHaveBeenCalledTimes(1);
    expect(map.peek("codex-work")).toBe(first);
    expect(map.peek("codex")).toBeNull();
  });

  it("never ends another key's resource on lookup, only when it is retired", async () => {
    const dispose = mock(async (_resource: Resource) => {});
    const map = createInstanceResourceMap<Resource>({ dispose });

    // A caller without an instance ("default") and one with the customized
    // default instance alternate: neither may kill the other's runtime.
    const legacy = map.get("codex", "default", () => ({ name: "legacy" }));
    const resolved = map.get("codex", "codex:abc", () => ({ name: "new" }));
    expect(map.get("codex", "default", () => ({ name: "x" }))).toBe(legacy);
    expect(map.get("codex", "codex:abc", () => ({ name: "x" }))).toBe(resolved);
    await Promise.resolve();
    expect(dispose).not.toHaveBeenCalled();
    expect(map.peek("codex", "default")).toBe(legacy);
    expect(map.peek("codex")).toBe(resolved);

    await map.retire("codex", "codex:abc");

    expect(dispose.mock.calls).toEqual([[legacy]]);
    expect(map.values()).toEqual([resolved]);
  });

  it("disposes one instance or all, reporting errors without throwing", async () => {
    const errors: string[] = [];
    const map = createInstanceResourceMap<Resource>({
      dispose: (resource) => {
        if (resource.name === "bad") {
          throw new Error("kill failed");
        }
      },
      onDisposeError: (_error, slot) => errors.push(slot),
    });
    map.get("a", "k", () => ({ name: "good" }));
    map.get("b", "k", () => ({ name: "bad" }));

    await map.dispose("a");
    expect(map.peek("a")).toBeNull();
    await map.dispose("missing");

    await map.disposeAll();
    expect(map.values()).toEqual([]);
    expect(errors).toEqual(["b"]);
  });
});

describe("process-wide instance resources", () => {
  it("disposes an instance's resources across every kind", async () => {
    const disposedCodex = mock((_resource: Resource) => {});
    const disposedCopilot = mock((_resource: Resource) => {});
    const codex = getInstanceResources<Resource>("test-codex", {
      dispose: disposedCodex,
    });
    const copilot = getInstanceResources<Resource>("test-copilot", {
      dispose: disposedCopilot,
    });
    expect(
      getInstanceResources<Resource>("test-codex", { dispose: () => {} }),
    ).toBe(codex);

    codex.get("work", "k", () => ({ name: "codex" }));
    copilot.get("work", "k", () => ({ name: "copilot" }));
    copilot.get("other", "k", () => ({ name: "other" }));

    copilot.get("work", "k2", () => ({ name: "copilot-new" }));
    await retireInstanceResources("work", "k2");
    expect(disposedCodex.mock.calls).toEqual([[{ name: "codex" }]]);
    expect(disposedCopilot.mock.calls).toEqual([[{ name: "copilot" }]]);

    await disposeInstanceResources("work");

    expect(disposedCopilot.mock.calls).toEqual([
      [{ name: "copilot" }],
      [{ name: "copilot-new" }],
    ]);
    expect(copilot.peek("other")).toEqual({ name: "other" });
  });
});
