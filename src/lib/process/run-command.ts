import { spawn } from "node:child_process";

export type CommandResult = {
  code: number;
  stderr: string;
  stdout: string;
};

export async function runCommand({
  args,
  command,
  cwd,
  env,
  maxOutputBytes = 256 * 1024,
}: {
  args?: string[];
  command: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
  maxOutputBytes?: number;
}): Promise<CommandResult> {
  return await new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, args ?? [], {
      cwd,
      env: {
        ...process.env,
        ...(env ?? {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;

    const append = (
      current: string,
      chunk: Buffer,
      usedBytes: number,
    ): { next: string; nextBytes: number } => {
      if (usedBytes >= maxOutputBytes) {
        return { next: current, nextBytes: usedBytes };
      }

      const availableBytes = maxOutputBytes - usedBytes;
      const nextChunk =
        chunk.byteLength > availableBytes
          ? chunk.subarray(0, availableBytes)
          : chunk;
      return {
        next: current + nextChunk.toString("utf8"),
        nextBytes: usedBytes + nextChunk.byteLength,
      };
    };

    child.stdout.on("data", (chunk: Buffer) => {
      const next = append(stdout, chunk, stdoutBytes);
      stdout = next.next;
      stdoutBytes = next.nextBytes;
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const next = append(stderr, chunk, stderrBytes);
      stderr = next.next;
      stderrBytes = next.nextBytes;
    });

    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stderr: stderr.trim(),
        stdout: stdout.trim(),
      });
    });
  });
}
