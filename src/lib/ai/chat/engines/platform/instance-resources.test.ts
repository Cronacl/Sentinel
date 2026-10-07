import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const {
  createInstanceResourceMap,
  disposeInstanceResources,
  getInstanceResources,
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

  it("replaces and disposes a resource created for an older configuration", async () => {
    const dispose = mock(async (_resource: Resource) => {});
    const map = createInstanceResourceMap<Resource>({ dispose });

    const old = map.get("codex-work", "key-1", () => ({ name: "old" }));
    const fresh = map.get("codex-work", "key-2", () => ({ name: "new" }));
    await Promise.resolve();

    expect(fresh).not.toBe(old);
    expect(dispose.mock.calls).toEqual([[old]]);
    expect(map.values()).toEqual([fresh]);
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

    await disposeInstanceResources("work");

    expect(disposedCodex).toHaveBeenCalledTimes(1);
    expect(disposedCopilot.mock.calls).toEqual([[{ name: "copilot" }]]);
    expect(copilot.peek("other")).toEqual({ name: "other" });
  });
});
