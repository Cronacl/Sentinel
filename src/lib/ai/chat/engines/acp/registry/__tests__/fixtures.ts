import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

// Test support for the ACP Registry lane: a registry index shaped like the
// live one (cdn.agentclientprotocol.com/registry/v1/latest/registry.json,
// trimmed) and a fake registry served over real HTTP. Not a test file.

export const REGISTRY_ICON = (id: string) =>
  `https://cdn.agentclientprotocol.com/registry/v1/latest/${id}.svg`;

export function registryAgents() {
  return [
    {
      authors: ["Google"],
      description: "Google's open-source AI agent.",
      distribution: {
        npx: { args: ["--acp"], package: "@google/gemini-cli@0.63.0" },
      },
      icon: REGISTRY_ICON("gemini"),
      id: "gemini",
      license: "Apache-2.0",
      name: "Gemini CLI",
      repository: "https://github.com/google-gemini/gemini-cli",
      version: "0.63.0",
    },
    {
      authors: ["Cognition"],
      description: "Devin, the AI software engineer.",
      distribution: {
        binary: {
          "darwin-aarch64": {
            archive:
              "https://static.devin.ai/cli/3000.11.3/devin-darwin-arm64.tar.gz",
            args: ["acp"],
            cmd: "./bin/devin",
            sha256: "a".repeat(64),
          },
          "linux-x86_64": {
            archive:
              "https://static.devin.ai/cli/3000.11.3/devin-linux-x64.tar.gz",
            args: ["acp"],
            cmd: "./bin/devin",
          },
        },
      },
      icon: "https://evil.example.com/devin.svg",
      id: "devin",
      name: "Devin",
      repository: "https://github.com/CognitionAI/devin-cli",
      version: "3000.11.3",
    },
    {
      description: "Fast agent over ACP.",
      distribution: {
        uvx: { args: ["-x"], package: "fast-agent-acp==0.10.1" },
      },
      id: "fast-agent",
      name: "fast-agent",
      version: "0.10.1",
    },
    {
      description: "Mistral's coding agent.",
      distribution: {
        binary: {
          "linux-x86_64": {
            archive: "https://example.com/vibe.zip",
            cmd: "vibe-acp",
          },
        },
        npx: { package: "@mistralai/vibe@2.26.0" },
      },
      id: "mistral-vibe",
      name: "Mistral Vibe",
      version: "2.26.0",
    },
    // Dropped: no exact version, a plain-HTTP archive, a bad id.
    {
      description: "",
      distribution: { npx: { package: "loose-agent@latest" } },
      id: "loose",
      name: "Loose",
      version: "1.0.0",
    },
    {
      description: "",
      distribution: {
        binary: {
          "linux-x86_64": { archive: "http://example.com/a.tgz", cmd: "a" },
        },
      },
      id: "plain-http",
      name: "Plain",
      version: "1.0.0",
    },
    {
      description: "",
      distribution: {},
      id: "Bad Id",
      name: "x",
      version: "1",
    },
  ];
}

export function registryIndex() {
  return { agents: registryAgents(), version: "1.0.0" };
}

/** A registry served over HTTP on 127.0.0.1; `fetch` maps the CDN URL onto it. */
export async function startFakeRegistry(
  respond: (request: Request) => Response | Promise<Response> = () =>
    Response.json(registryIndex(), { headers: { etag: '"v1"' } }),
) {
  const requests: Array<{ headers: Headers }> = [];
  const server = createServer((incoming, outgoing) => {
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (typeof value === "string") headers.set(name, value);
    }
    requests.push({ headers });
    void Promise.resolve(
      respond(
        new Request(`http://127.0.0.1${incoming.url ?? "/"}`, { headers }),
      ),
    ).then(async (response) => {
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    async fetch(_url: string, init: RequestInit) {
      const response = await fetch(
        `http://127.0.0.1:${port}/registry.json`,
        init,
      );
      // As the CDN answers it (fetch's own Response keeps the http:// URL).
      return new Response(response.status === 304 ? null : response.body, {
        headers: response.headers,
        status: response.status,
      });
    },
    requests,
    stop: () => server.close(),
  };
}
