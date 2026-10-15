import { describe, expect, it } from "bun:test";

import type { AcpRegistryAgentView } from "@/lib/ai/chat/engines/acp/registry/schema";

import {
  defaultRegistryDistribution,
  describeRegistryDistribution,
  describeRegistryInstall,
  filterRegistryAgents,
  registryNativeEngineNote,
} from "./acp-registry-helpers";

function agent(
  overrides: Partial<AcpRegistryAgentView> = {},
): AcpRegistryAgentView {
  return {
    authors: ["Cognition"],
    description: "Devin, the AI software engineer.",
    distributions: [
      {
        advisory: null,
        available: true,
        detail: "static.devin.ai",
        kind: "binary",
        verified: false,
      },
    ],
    featured: false,
    iconUrl: null,
    id: "devin",
    instanceIds: [],
    license: null,
    name: "Devin",
    nativeEngine: null,
    repository: "https://github.com/CognitionAI/devin-cli",
    version: "3000.11.3",
    website: null,
    ...overrides,
  };
}

describe("ACP Registry browser helpers", () => {
  it("filters by id, name and description", () => {
    const agents = [
      agent(),
      agent({ description: "Google", id: "gemini", name: "Gemini CLI" }),
    ];
    expect(
      filterRegistryAgents(agents, "engineer").map((entry) => entry.id),
    ).toEqual(["devin"]);
    expect(filterRegistryAgents(agents, "  ")).toHaveLength(2);
  });

  it("offers the first distribution that installs here", () => {
    expect(
      defaultRegistryDistribution(
        agent({
          distributions: [
            {
              advisory: "Needs Node.js (npm) on this computer.",
              available: false,
              detail: "x@1.0.0",
              kind: "npx",
              verified: null,
            },
            {
              advisory: null,
              available: true,
              detail: "y==1.0.0",
              kind: "uvx",
              verified: null,
            },
          ],
        }),
      ),
    ).toBe("uvx");
    expect(
      defaultRegistryDistribution(agent({ distributions: [] })),
    ).toBeNull();
  });

  it("describes distributions with their advisory and checksum state", () => {
    expect(describeRegistryDistribution(agent().distributions[0]!)).toBe(
      "Download from static.devin.ai (no published checksum)",
    );
    expect(
      describeRegistryDistribution({
        advisory: "Needs uv on this computer.",
        available: false,
        detail: "fast-agent-acp==0.10.1",
        kind: "uvx",
        verified: null,
      }),
    ).toBe("uv tool: Needs uv on this computer.");
  });

  it("names the source, authors and what runs in the confirmation", () => {
    const text = describeRegistryInstall(agent(), "binary");
    expect(text.title).toBe("Install Devin?");
    expect(text.confirmLabel).toBe("Install");
    expect(text.body.join("\n")).toContain(
      "Devin by Cognition is a third-party program",
    );
    expect(text.body.join("\n")).toContain("cannot be verified");
    expect(text.body.at(-1)).toBe(
      "Source: https://github.com/CognitionAI/devin-cli",
    );
    expect(
      describeRegistryInstall(agent({ instanceIds: ["acp-devin"] }), "binary")
        .confirmLabel,
    ).toBe("Reinstall");
  });

  it("points out agents Sentinel also drives natively", () => {
    expect(registryNativeEngineNote(agent({ nativeEngine: "cursor" }))).toBe(
      "Also available as the native Cursor engine.",
    );
  });
});
