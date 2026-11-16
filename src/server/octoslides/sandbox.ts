import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

/**
 * Runs one command in a fresh OctoSlides sandbox container
 * (image: infra/octoslides-sandbox). The model's scripts only ever run here.
 *
 * Isolation per job:
 *  - no network (`--network none`): scripts cannot reach the DB, the backend or the internet
 *  - read-only root filesystem; only /work (this deck's folder) and a /tmp tmpfs are writable
 *  - non-root uid 10001, all capabilities dropped, no-new-privileges
 *  - memory, CPU, pid and wall-clock limits; the container is killed on timeout
 *  - no environment variables from this process are passed in (no secrets)
 */

const IMAGE = process.env.OCTOSLIDES_SANDBOX_IMAGE || "octoslides-sandbox:2";
const MAX_CONCURRENT = Number(process.env.OCTOSLIDES_MAX_CONCURRENT || 2);
const OUTPUT_CAP = 48 * 1024;

export type SandboxResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
};

// Small FIFO semaphore: LibreOffice and node builds are CPU heavy, so cap them.
let active = 0;
const waiters: Array<() => void> = [];
async function acquire(): Promise<() => void> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiters.push(resolve));
  active += 1;
  return () => {
    active -= 1;
    waiters.shift()?.();
  };
}

function capped(buffer: string, chunk: Buffer): string {
  if (buffer.length >= OUTPUT_CAP) return buffer;
  const next = buffer + chunk.toString("utf8");
  return next.length > OUTPUT_CAP ? `${next.slice(0, OUTPUT_CAP)}\n…[output truncated]` : next;
}

export async function runInSandbox(
  workDir: string,
  argv: string[],
  options: { timeoutMs?: number; memoryMb?: number; cpus?: number } = {},
): Promise<SandboxResult> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const memoryMb = options.memoryMb ?? 1024;
  const cpus = options.cpus ?? 1.5;
  const name = `octoslides-${randomUUID()}`;

  const args = [
    "run", "--rm", "--name", name,
    "--network", "none",
    "--read-only",
    "--tmpfs", "/tmp:rw,size=512m,mode=1777",
    "--memory", `${memoryMb}m`, "--memory-swap", `${memoryMb}m`,
    "--cpus", String(cpus),
    "--pids-limit", "256",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    "--user", "10001:10001",
    "--env", "HOME=/tmp/home",
    "-v", `${workDir}:/work:rw`,
    "-w", "/work",
    IMAGE,
    ...argv,
  ];

  const release = await acquire();
  const started = Date.now();
  try {
    return await new Promise<SandboxResult>((resolve) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      // Only PATH is passed to the docker CLI; nothing from this process reaches the container.
      const env = { PATH: process.env.PATH ?? "/usr/bin:/bin" } as unknown as NodeJS.ProcessEnv;
      const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"], env });
      child.stdout.on("data", (c: Buffer) => (stdout = capped(stdout, c)));
      child.stderr.on("data", (c: Buffer) => (stderr = capped(stderr, c)));
      const timer = setTimeout(() => {
        timedOut = true;
        spawn("docker", ["kill", name], { stdio: "ignore" });
      }, timeoutMs);
      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({ exitCode: null, stdout, stderr: `${stderr}\n${err.message}`, timedOut, durationMs: Date.now() - started });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ exitCode: code, stdout, stderr, timedOut, durationMs: Date.now() - started });
      });
    });
  } finally {
    release();
  }
}
