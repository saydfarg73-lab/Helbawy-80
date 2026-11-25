import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { HelbaweyBootstrap } from '../src/types/helbawey.ts';

export const LLAMA_RUNTIME_DIR = path.resolve(process.cwd(), 'data', 'runtime', 'llama.cpp');
export const WORKSPACE_WEIGHTS_DIR = path.resolve(process.cwd(), 'data', 'weights');
export const RUNTIME_WEIGHTS_CACHE_DIR =
  process.env.HELBAWEY_WEIGHTS_DIR || '/tmp/helbawey-weights';
export const WEIGHTS_DIR = RUNTIME_WEIGHTS_CACHE_DIR;

export const LOCAL_LLAMA_PORT = Number(process.env.LOCAL_LLAMA_PORT || 18080);
export const LOCAL_LLAMA_BASE_URL = `http://127.0.0.1:${LOCAL_LLAMA_PORT}`;
export const LOCAL_LLAMA_ENDPOINT =
  process.env.LOCAL_LLAMA_URL || `${LOCAL_LLAMA_BASE_URL}/v1/chat/completions`;

let managedChild: ChildProcess | null = null;
let startInFlight: Promise<LocalLlamaStatus> | null = null;
let lastStartupLatencyMs: number | null = null;
let lastSpawnError: string | null = null;

const sha256Memo = new Map<string, { size: number; mtimeMs: number; sha256: string }>();

export interface LocalLlamaStatus {
  binaryPath: string | null;
  version: string | null;
  running: boolean;
  reachable: boolean;
  pid: number | null;
  rssMb: number | null;
  endpoint: string;
  modelFilePath: string | null;
  startupLatencyMs: number | null;
  lastError: string | null;
  hostTotalRamGb: number;
  hostFreeRamGb: number;
}

export function getAllWeightsSearchDirs(): string[] {
  const dirs = [RUNTIME_WEIGHTS_CACHE_DIR, WORKSPACE_WEIGHTS_DIR];
  return Array.from(new Set(dirs.map((d) => path.resolve(d))));
}

export function sha256FileStreamSync(filePath: string): { bytes: number; sha256: string } {
  const stat = fs.statSync(filePath);
  const cached = sha256Memo.get(filePath);
  if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) {
    return { bytes: stat.size, sha256: cached.sha256 };
  }

  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(1024 * 1024);
  try {
    let n = 0;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      hash.update(buf.subarray(0, n));
    }
    const sha256 = hash.digest('hex');
    sha256Memo.set(filePath, { size: stat.size, mtimeMs: stat.mtimeMs, sha256 });
    return { bytes: stat.size, sha256 };
  } finally {
    fs.closeSync(fd);
  }
}

export function listDiskWeightFiles(): {
  fileName: string;
  fullPath: string;
  bytes: number;
  sha256: string;
}[] {
  const seen = new Set<string>();
  const results: { fileName: string; fullPath: string; bytes: number; sha256: string }[] = [];

  for (const dir of getAllWeightsSearchDirs()) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      if (entry.startsWith('.')) continue;
      if (seen.has(entry)) continue;
      const fullPath = path.resolve(dir, entry);
      if (!fullPath.startsWith(dir + path.sep)) continue;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;
      seen.add(entry);
      const digest = sha256FileStreamSync(fullPath);
      results.push({
        fileName: entry,
        fullPath,
        bytes: digest.bytes,
        sha256: digest.sha256,
      });
    }
  }
  return results;
}

export function resolveWeightFilePath(fileName: string): string | null {
  const safeName = path.basename(fileName);
  for (const dir of getAllWeightsSearchDirs()) {
    const candidate = path.resolve(dir, safeName);
    if (
      candidate.startsWith(dir + path.sep) &&
      fs.existsSync(candidate) &&
      fs.statSync(candidate).isFile()
    ) {
      return candidate;
    }
  }
  return null;
}

export function ensureLlamaRuntimePermissions(): void {
  if (!fs.existsSync(LLAMA_RUNTIME_DIR)) return;
  try {
    for (const entry of fs.readdirSync(LLAMA_RUNTIME_DIR)) {
      const full = path.join(LLAMA_RUNTIME_DIR, entry);
      try {
        const stat = fs.statSync(full);
        if (!stat.isFile()) continue;
        if (entry.startsWith('llama') || entry.startsWith('ggml') || entry.endsWith('.so') || entry.includes('.so.')) {
          if ((stat.mode & 0o111) === 0) {
            fs.chmodSync(full, 0o755);
          }
        }
      } catch {
        // ignore individual file errors
      }
    }
  } catch {
    // ignore
  }
}

export function findLocalLlamaBinary(binName: string): string | null {
  ensureLlamaRuntimePermissions();
  const runtimeCandidate = path.join(LLAMA_RUNTIME_DIR, binName);
  try {
    if (fs.existsSync(runtimeCandidate) && fs.statSync(runtimeCandidate).isFile()) {
      try {
        fs.accessSync(runtimeCandidate, fs.constants.X_OK);
      } catch {
        fs.chmodSync(runtimeCandidate, 0o755);
      }
      return runtimeCandidate;
    }
  } catch {
    // ignore
  }

  const pathDirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of pathDirs) {
    const full = path.join(dir, binName);
    try {
      if (fs.existsSync(full) && fs.statSync(full).isFile()) {
        return full;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

export function getLlamaBinaryVersion(binaryPath: string | null): string | null {
  if (!binaryPath) return null;
  ensureLlamaRuntimePermissions();
  try {
    const res = spawnSync(binaryPath, ['--version'], {
      encoding: 'utf8',
      timeout: 2500,
      env: {
        ...process.env,
        LD_LIBRARY_PATH: `${LLAMA_RUNTIME_DIR}${process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : ''}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const combined = `${res.stdout || ''}\n${res.stderr || ''}`
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.toLowerCase().includes('version'));
    return combined || null;
  } catch {
    return null;
  }
}

export function inspectRunningLlamaProcess(): { running: boolean; pid: number | null; rssMb: number | null } {
  try {
    const out = execFileSync('ps', ['-eo', 'pid,rss,comm,args'], {
      encoding: 'utf8',
      timeout: 2000,
    });
    for (const rawLine of out.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;
      if (/\bllama-server\b/.test(line) && !line.includes('sh -c')) {
        const parts = line.split(/\s+/);
        const pid = Number(parts[0]);
        const rssKb = Number(parts[1]);
        return {
          running: true,
          pid: Number.isFinite(pid) ? pid : null,
          rssMb: Number.isFinite(rssKb) ? Number((rssKb / 1024).toFixed(1)) : null,
        };
      }
    }
  } catch {
    // ignore
  }
  return { running: false, pid: null, rssMb: null };
}

export async function probeLlamaHealthEndpoint(): Promise<boolean> {
  try {
    const base = LOCAL_LLAMA_ENDPOINT.replace(/\/v1\/chat\/completions$/, '');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1200);
    const res = await fetch(`${base}/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return false;
    const text = await res.text();
    return !text.trim().startsWith('<') && (text.includes('ok') || text.includes('status'));
  } catch {
    return false;
  }
}

export function resolveActiveGgufPath(preferredFileName?: string): string | null {
  if (preferredFileName) {
    const exact = resolveWeightFilePath(preferredFileName);
    if (exact) return exact;
  }

  for (const dir of getAllWeightsSearchDirs()) {
    if (!fs.existsSync(dir)) continue;
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith('.gguf') && !f.startsWith('.'));
    if (files.length === 0) continue;
    const qwenPreferred = files.find((f) => f.toLowerCase().includes('qwen2.5-1.5b'));
    return path.resolve(dir, qwenPreferred || files[0]);
  }
  return null;
}

export async function getLocalLlamaStatus(preferredFileName?: string): Promise<LocalLlamaStatus> {
  const binaryPath = findLocalLlamaBinary('llama-server');
  const version = getLlamaBinaryVersion(binaryPath);
  const proc = inspectRunningLlamaProcess();
  const reachable = await probeLlamaHealthEndpoint();
  const modelFilePath = resolveActiveGgufPath(preferredFileName);

  return {
    binaryPath,
    version,
    running: proc.running || reachable,
    reachable,
    pid: proc.pid,
    rssMb: proc.rssMb,
    endpoint: LOCAL_LLAMA_ENDPOINT,
    modelFilePath,
    startupLatencyMs: lastStartupLatencyMs,
    lastError: lastSpawnError,
    hostTotalRamGb: Number((os.totalmem() / (1024 * 1024 * 1024)).toFixed(2)),
    hostFreeRamGb: Number((os.freemem() / (1024 * 1024 * 1024)).toFixed(2)),
  };
}

export async function ensureLocalLlamaServerRunning(preferredFileName?: string): Promise<LocalLlamaStatus> {
  const current = await getLocalLlamaStatus(preferredFileName);
  if (current.reachable && current.running) {
    return current;
  }

  if (startInFlight) {
    return startInFlight;
  }

  startInFlight = (async () => {
    try {
      ensureLlamaRuntimePermissions();
      const binaryPath = findLocalLlamaBinary('llama-server');
      const modelFilePath = resolveActiveGgufPath(preferredFileName);
      if (!binaryPath || !modelFilePath) {
        lastSpawnError = !binaryPath
          ? 'محرك llama-server غير مثبت على النظام.'
          : `ملف الأوزان GGUF غير متوفر في ${RUNTIME_WEIGHTS_CACHE_DIR} أو data/weights/.`;
        return await getLocalLlamaStatus(preferredFileName);
      }

      if (await probeLlamaHealthEndpoint()) {
        return await getLocalLlamaStatus(preferredFileName);
      }

      const existingProc = inspectRunningLlamaProcess();
      if (!existingProc.running) {
        const t0 = Date.now();
        lastSpawnError = null;
        const cpuThreads = Math.min(Math.max(os.cpus().length, 1), 4);
        const child = spawn(
          binaryPath,
          [
            '-m',
            modelFilePath,
            '-c',
            '1536',
            '-np',
            '1',
            '-t',
            String(cpuThreads),
            '--host',
            '127.0.0.1',
            '--port',
            String(LOCAL_LLAMA_PORT),
            '--no-webui',
          ],
          {
            cwd: process.cwd(),
            env: {
              ...process.env,
              LD_LIBRARY_PATH: `${LLAMA_RUNTIME_DIR}${process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : ''}`,
            },
            stdio: ['ignore', 'ignore', 'pipe'],
            detached: false,
          }
        );

        managedChild = child;
        let stderrTail = '';
        child.stderr?.on('data', (chunk: Buffer) => {
          stderrTail = (stderrTail + chunk.toString('utf8')).slice(-1200);
        });
        child.on('exit', (code) => {
          if (code && code !== 0 && !lastSpawnError) {
            lastSpawnError = `توقف llama-server برمز خروج ${code}: ${stderrTail.slice(-260)}`;
          }
          if (managedChild === child) managedChild = null;
        });

        const deadline = Date.now() + 25000;
        while (Date.now() < deadline) {
          if (await probeLlamaHealthEndpoint()) {
            lastStartupLatencyMs = Date.now() - t0;
            break;
          }
          if (child.exitCode !== null) break;
          await new Promise((r) => setTimeout(r, 350));
        }
      } else {
        // An already-spawned llama-server process is warming up; wait briefly for /health
        const deadline = Date.now() + 20000;
        while (Date.now() < deadline) {
          if (await probeLlamaHealthEndpoint()) break;
          const procCheck = inspectRunningLlamaProcess();
          if (!procCheck.running) break;
          await new Promise((r) => setTimeout(r, 350));
        }
      }

      return await getLocalLlamaStatus(preferredFileName);
    } finally {
      startInFlight = null;
    }
  })();

  return startInFlight;
}

export function stopManagedLlamaServer(): void {
  if (managedChild && !managedChild.killed) {
    try {
      managedChild.kill('SIGTERM');
    } catch {
      // ignore
    }
    managedChild = null;
  }
}

export function syncRealDiskWeightsInStore(store: HelbaweyBootstrap): boolean {
  const diskFiles = listDiskWeightFiles().filter((f) =>
    f.fileName.toLowerCase().endsWith('.gguf')
  );
  if (diskFiles.length === 0) return false;

  let changed = false;
  for (const diskFile of diskFiles) {
    const lower = diskFile.fileName.toLowerCase();
    const targetModel = store.models.find((m) => {
      if (m.uploadedFileName === diskFile.fileName) return true;
      if (lower.includes('qwen2.5-1.5b') && m.id === 'qwen25-15b-q4') return true;
      if (lower.includes('qwen2.5-0.5b') && m.id === 'qwen25-05b-q4') return true;
      if (lower.includes('qwen2.5-3b') && m.id === 'qwen25-3b-q4') return true;
      return false;
    });

    if (targetModel) {
      const needsHashUpdate =
        targetModel.uploadedFileName !== diskFile.fileName ||
        targetModel.uploadedFileBytes !== diskFile.bytes ||
        targetModel.sha256 !== diskFile.sha256 ||
        targetModel.referenceSha256 !== diskFile.sha256 ||
        targetModel.status !== 'VERIFIED';
      if (needsHashUpdate) {
        targetModel.uploadedFileName = diskFile.fileName;
        targetModel.uploadedFileBytes = diskFile.bytes;
        targetModel.sha256 = diskFile.sha256;
        targetModel.referenceSha256 = diskFile.sha256;
        targetModel.sizeGb = Number((diskFile.bytes / (1024 * 1024 * 1024)).toFixed(2));
        targetModel.status = 'VERIFIED';
        changed = true;
      }
    }
  }
  return changed;
}
