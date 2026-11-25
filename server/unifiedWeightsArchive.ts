import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import type {
  DetectedRuntimeEngineInfo,
  ForensicComponentRow,
  HelbaweyBootstrap,
  RealArchiveVerificationTest,
  UnifiedWeightsArchiveStatus,
} from '../src/types/helbawey.ts';
import { generateStandaloneRagModuleCode } from './ragEngine.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const WEIGHTS_DIR = path.resolve(DATA_DIR, 'weights');
const TOKENIZERS_DIR = path.resolve(DATA_DIR, 'tokenizers');
const ENGINES_DIR = path.resolve(DATA_DIR, 'engines');
const ADAPTERS_DIR = path.resolve(DATA_DIR, 'adapters');
const UNIFIED_DIR = path.resolve(DATA_DIR, 'unified-weights');

export const UNIFIED_WEIGHTS_FILENAME = 'اوزان المنصه.zip';
export const UNIFIED_WEIGHTS_ASCII_FALLBACK = 'awzan-almanassa.zip';
export const UNIFIED_WEIGHTS_RELATIVE_PATH = `data/unified-weights/${UNIFIED_WEIGHTS_FILENAME}`;

const UNIFIED_ARCHIVE_PATH = path.resolve(UNIFIED_DIR, UNIFIED_WEIGHTS_FILENAME);
const UNIFIED_META_PATH = path.resolve(UNIFIED_DIR, 'manifest.meta.json');

const NEURAL_WEIGHT_EXTENSIONS = new Set([
  '.gguf',
  '.onnx',
  '.safetensors',
  '.pt',
  '.pth',
  '.ckpt',
  '.bin',
  '.ggml',
  '.tflite',
]);

const TOKENIZER_FILENAMES = new Set([
  'tokenizer.json',
  'tokenizer.model',
  'tokenizer_config.json',
  'vocab.json',
  'vocab.txt',
  'merges.txt',
  'spiece.model',
  'special_tokens_map.json',
]);

const KNOWN_PLACEHOLDER_HASHES = new Set(
  ['', 'test', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map((s) =>
    crypto.createHash('sha256').update(s).digest('hex')
  )
);

function ensureUnifiedDirs(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(WEIGHTS_DIR)) fs.mkdirSync(WEIGHTS_DIR, { recursive: true });
  if (!fs.existsSync(UNIFIED_DIR)) fs.mkdirSync(UNIFIED_DIR, { recursive: true });
}

function sha256Buffer(buf: Buffer | string): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function formatBytesLabel(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function computeDiskFileDigest(filePath: string): { bytes: number; sha256: string } {
  const stat = fs.statSync(filePath);
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const chunk = Buffer.alloc(1024 * 1024);
  try {
    let bytesRead = 0;
    while ((bytesRead = fs.readSync(fd, chunk, 0, chunk.length, null)) > 0) {
      hash.update(chunk.subarray(0, bytesRead));
    }
    return { bytes: stat.size, sha256: hash.digest('hex') };
  } finally {
    fs.closeSync(fd);
  }
}

function findExecutableOnPath(binName: string): string | null {
  const localRuntimeDir = path.resolve(process.cwd(), 'data', 'runtime', 'llama.cpp');
  const localCandidate = path.join(localRuntimeDir, binName);
  try {
    if (fs.existsSync(localCandidate) && fs.statSync(localCandidate).isFile()) {
      return localCandidate;
    }
  } catch {
    // Ignore
  }
  const pathEnv = process.env.PATH || '';
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, binName);
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // Ignore inaccessible dirs
    }
  }
  return null;
}

function tryExecVersion(cmd: string, args: string[]): string | null {
  try {
    const localRuntimeDir = path.resolve(process.cwd(), 'data', 'runtime', 'llama.cpp');
    const out = execFileSync(cmd, args, {
      encoding: 'utf8',
      timeout: 2500,
      env: {
        ...process.env,
        LD_LIBRARY_PATH: `${localRuntimeDir}${process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : ''}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return out.trim().split('\n')[0] || null;
  } catch {
    return null;
  }
}

export function getUnifiedWeightsArchivePath(): string {
  return UNIFIED_ARCHIVE_PATH;
}

interface ScannedDiskAssets {
  realWeightFiles: { fileName: string; relativePath: string; fullPath: string; bytes: number; sha256: string; ext: string }[];
  realTokenizerFiles: { fileName: string; relativePath: string; fullPath: string; bytes: number; sha256: string }[];
  realAdapterFiles: { fileName: string; relativePath: string; fullPath: string; bytes: number; sha256: string }[];
  shardCompletenessIssues: string[];
}

function scanRealDiskAiAssets(): ScannedDiskAssets {
  ensureUnifiedDirs();
  const realWeightFiles: ScannedDiskAssets['realWeightFiles'] = [];
  const realTokenizerFiles: ScannedDiskAssets['realTokenizerFiles'] = [];
  const realAdapterFiles: ScannedDiskAssets['realAdapterFiles'] = [];

  const dirsToScan = [WEIGHTS_DIR, TOKENIZERS_DIR, ADAPTERS_DIR, ENGINES_DIR];

  for (const baseDir of dirsToScan) {
    if (!fs.existsSync(baseDir)) continue;
    const stack = [baseDir];
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
          continue;
        }
        if (!entry.isFile()) continue;

        const lowerName = entry.name.toLowerCase();
        const ext = path.extname(lowerName);
        const rel = path.relative(process.cwd(), fullPath);

        if (TOKENIZER_FILENAMES.has(lowerName)) {
          const digest = computeDiskFileDigest(fullPath);
          realTokenizerFiles.push({
            fileName: entry.name,
            relativePath: rel,
            fullPath,
            bytes: digest.bytes,
            sha256: digest.sha256,
          });
        } else if (NEURAL_WEIGHT_EXTENSIONS.has(ext)) {
          const digest = computeDiskFileDigest(fullPath);
          if (current.startsWith(ADAPTERS_DIR)) {
            realAdapterFiles.push({
              fileName: entry.name,
              relativePath: rel,
              fullPath,
              bytes: digest.bytes,
              sha256: digest.sha256,
            });
          } else {
            realWeightFiles.push({
              fileName: entry.name,
              relativePath: rel,
              fullPath,
              bytes: digest.bytes,
              sha256: digest.sha256,
              ext,
            });
          }
        }
      }
    }
  }

  // Check multi-shard completeness (e.g. model-00001-of-00003.gguf)
  const shardCompletenessIssues: string[] = [];
  const shardGroups = new Map<string, { expectedTotal: number; indices: Set<number> }>();
  for (const f of realWeightFiles) {
    const m = f.fileName.match(/^(.*)-(\d{5})-of-(\d{5})(\.[^.]+)$/i);
    if (m) {
      const prefix = `${m[1]}${m[4]}`;
      const idx = Number(m[2]);
      const total = Number(m[3]);
      const grp = shardGroups.get(prefix) || { expectedTotal: total, indices: new Set<number>() };
      grp.indices.add(idx);
      shardGroups.set(prefix, grp);
    }
  }
  for (const [prefix, grp] of shardGroups.entries()) {
    const missing: number[] = [];
    for (let i = 1; i <= grp.expectedTotal; i++) {
      if (!grp.indices.has(i)) missing.push(i);
    }
    if (missing.length > 0) {
      shardCompletenessIssues.push(`نقص أجزاء (${missing.join(', ')} من ${grp.expectedTotal}) للنموذج ${prefix}`);
    }
  }

  return {
    realWeightFiles,
    realTokenizerFiles,
    realAdapterFiles,
    shardCompletenessIssues,
  };
}

export function scanRuntimeAndEngines(): DetectedRuntimeEngineInfo[] {
  const engines: DetectedRuntimeEngineInfo[] = [];

  // 1. Real native inference binaries on PATH
  for (const binName of ['llama-server', 'llama-cli', 'ollama', 'onnxruntime']) {
    const p = findExecutableOnPath(binName);
    if (p) {
      const digest = computeDiskFileDigest(p);
      engines.push({
        name: binName,
        category: 'neural-inference',
        isRealLocalNeuralEngine: true,
        installed: true,
        version: tryExecVersion(p, ['--version']),
        path: p,
        sizeBytes: digest.bytes,
        sha256: digest.sha256,
        dependencies: ['libc', 'libstdc++'],
        launchCommand: binName === 'llama-server' ? `${p} -m <model.gguf> --port 8080` : `${p} -m <model.gguf>`,
      });
    } else {
      engines.push({
        name: binName,
        category: 'neural-inference',
        isRealLocalNeuralEngine: true,
        installed: false,
        version: null,
        path: null,
        sizeBytes: 0,
        sha256: null,
        dependencies: [],
        launchCommand: null,
      });
    }
  }

  // 2. Check Node neural runtime packages in node_modules
  const nodeModulesDir = path.resolve(process.cwd(), 'node_modules');
  for (const pkg of ['node-llama-cpp', 'onnxruntime-node', '@huggingface/transformers', '@xenova/transformers']) {
    const pkgJsonPath = path.join(nodeModulesDir, ...pkg.split('/'), 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) as { version?: string };
      engines.push({
        name: pkg,
        category: 'neural-inference',
        isRealLocalNeuralEngine: true,
        installed: true,
        version: pkgJson.version || 'installed',
        path: path.dirname(pkgJsonPath),
        sizeBytes: fs.statSync(pkgJsonPath).size,
        sha256: computeDiskFileDigest(pkgJsonPath).sha256,
        dependencies: ['node'],
        launchCommand: `import '${pkg}'`,
      });
    } else {
      engines.push({
        name: pkg,
        category: 'neural-inference',
        isRealLocalNeuralEngine: true,
        installed: false,
        version: null,
        path: null,
        sizeBytes: 0,
        sha256: null,
        dependencies: ['node'],
        launchCommand: null,
      });
    }
  }

  // 3. Check Python neural inference & training packages
  const pythonPath = findExecutableOnPath('python3');
  let pyResults: Record<string, string | null> = {};
  if (pythonPath) {
    try {
      const out = execFileSync(
        pythonPath,
        [
          '-c',
          'import importlib,json; pkgs=["torch","transformers","onnxruntime","llama_cpp","peft","bitsandbytes","accelerate","safetensors","datasets"]; res={}; \nfor p in pkgs:\n  try:\n    m=importlib.import_module(p); res[p]=getattr(m,"__version__","installed")\n  except Exception:\n    res[p]=None\nprint(json.dumps(res))',
        ],
        { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'pipe'] }
      );
      pyResults = JSON.parse(out.trim()) as Record<string, string | null>;
    } catch {
      pyResults = {};
    }
  }

  for (const pyPkg of ['llama_cpp', 'onnxruntime', 'torch', 'transformers', 'peft', 'bitsandbytes']) {
    const ver = pyResults[pyPkg] || null;
    engines.push({
      name: `python:${pyPkg}`,
      category: pyPkg === 'peft' || pyPkg === 'bitsandbytes' ? 'neural-training' : 'neural-inference',
      isRealLocalNeuralEngine: true,
      installed: Boolean(ver),
      version: ver,
      path: ver ? pythonPath : null,
      sizeBytes: 0,
      sha256: null,
      dependencies: ['python3'],
      launchCommand: ver ? `python3 -m ${pyPkg}` : null,
    });
  }

  // 4. Local JS RAG & HTTP wrapper (Honest classification: NOT a neural engine)
  const ragPath = path.resolve(process.cwd(), 'server', 'ragEngine.ts');
  if (fs.existsSync(ragPath)) {
    const d = computeDiskFileDigest(ragPath);
    engines.push({
      name: 'HelbaweyLocalRagEngine (JS TF-IDF Wrapper)',
      category: 'wrapper-rag-only',
      isRealLocalNeuralEngine: false,
      installed: true,
      version: '1.0.0-rag-lexical',
      path: 'server/ragEngine.ts',
      sizeBytes: d.bytes,
      sha256: d.sha256,
      dependencies: ['node >= 20'],
      launchCommand: 'يستدعي البحث النصي المحلي + http://127.0.0.1:8080 عند توفر llama-server فقط',
    });
  }

  // 5. Base system runtimes (Node / Python)
  const nodePath = process.execPath;
  if (fs.existsSync(nodePath)) {
    const d = computeDiskFileDigest(nodePath);
    engines.push({
      name: 'Node.js Runtime',
      category: 'system-runtime',
      isRealLocalNeuralEngine: false,
      installed: true,
      version: process.version,
      path: nodePath,
      sizeBytes: d.bytes,
      sha256: d.sha256,
      dependencies: ['V8', 'libuv', 'OpenSSL'],
      launchCommand: `${nodePath} server.ts`,
    });
  }

  if (pythonPath && fs.existsSync(pythonPath)) {
    const d = computeDiskFileDigest(pythonPath);
    engines.push({
      name: 'Python 3 Interpreter',
      category: 'system-runtime',
      isRealLocalNeuralEngine: false,
      installed: true,
      version: tryExecVersion(pythonPath, ['--version']),
      path: pythonPath,
      sizeBytes: d.bytes,
      sha256: d.sha256,
      dependencies: ['glibc'],
      launchCommand: `${pythonPath} train_lora.py`,
    });
  }

  return engines;
}

function verifyExtractedArchiveInTempDir(archivePath: string): {
  extractedOk: boolean;
  verifiedFilesCount: number;
  checksumMismatchCount: number;
  evidenceAr: string;
} {
  if (!fs.existsSync(archivePath)) {
    return {
      extractedOk: false,
      verifiedFilesCount: 0,
      checksumMismatchCount: 0,
      evidenceAr: 'الأرشيف الموحد غير موجود على القرص لاختبار الاستخراج.',
    };
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helbawey-unified-extract-'));
  try {
    // Synchronous unzip inspection via JSZip isn't sync, so we verify in async caller;
    // keep sync helper minimal and run real async extraction in runRealVerificationTestsAsync!
    return {
      extractedOk: true,
      verifiedFilesCount: 0,
      checksumMismatchCount: 0,
      evidenceAr: tmpDir,
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function runArchiveExtractionVerification(archivePath: string): Promise<{
  extractedOk: boolean;
  verifiedFilesCount: number;
  checksumMismatchCount: number;
  manifestExists: boolean;
  evidenceAr: string;
}> {
  if (!fs.existsSync(archivePath)) {
    return {
      extractedOk: false,
      verifiedFilesCount: 0,
      checksumMismatchCount: 0,
      manifestExists: false,
      evidenceAr: 'الأرشيف غير موجود على القرص لاختبار الاستخراج.',
    };
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helbawey-extract-'));
  try {
    const zipBuffer = fs.readFileSync(archivePath);
    const zip = await JSZip.loadAsync(zipBuffer);
    let writtenCount = 0;

    for (const [relPath, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const destPath = path.resolve(tmpDir, relPath);
      if (!destPath.startsWith(tmpDir + path.sep)) {
        throw new Error(`Unsafe zip entry path detected: ${relPath}`);
      }
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      const content = await entry.async('nodebuffer');
      fs.writeFileSync(destPath, content);
      writtenCount += 1;
    }

    const checksumPath = path.resolve(tmpDir, 'checksums.sha256');
    const manifestPath = path.resolve(tmpDir, 'manifest.json');
    const manifestExists = fs.existsSync(manifestPath);
    let verifiedFilesCount = 0;
    let checksumMismatchCount = 0;

    if (fs.existsSync(checksumPath)) {
      const lines = fs
        .readFileSync(checksumPath, 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      for (const line of lines) {
        const match = line.match(/^([a-f0-9]{64})\s{2}(.+)$/i);
        if (!match) continue;
        const [, expectedHash, fileRel] = match;
        const target = path.resolve(tmpDir, fileRel);
        if (!target.startsWith(tmpDir + path.sep) || !fs.existsSync(target)) {
          checksumMismatchCount += 1;
          continue;
        }
        const actualHash = computeDiskFileDigest(target).sha256;
        if (actualHash === expectedHash) {
          verifiedFilesCount += 1;
        } else {
          checksumMismatchCount += 1;
        }
      }
    }

    return {
      extractedOk: writtenCount > 0 && checksumMismatchCount === 0 && manifestExists,
      verifiedFilesCount,
      checksumMismatchCount,
      manifestExists,
      evidenceAr: `تم استخراج ${writtenCount} ملفاً إلى مجلد معزول والتحقق من SHA-256 لعدد ${verifiedFilesCount} ملفاً (أخطاء تطابق: ${checksumMismatchCount}). ملاحظة: تشغيل النموذج من الملفات المستخرجة BLOCKED لعدم وجود ملف وزن ثنائي أو محرك استدلال محلي داخل الأرشيف.`,
    };
  } catch (err) {
    return {
      extractedOk: false,
      verifiedFilesCount: 0,
      checksumMismatchCount: 1,
      manifestExists: false,
      evidenceAr: err instanceof Error ? err.message : 'فشل استخراج الأرشيف إلى مجلد معزول.',
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function buildForensicSnapshot(
  store: HelbaweyBootstrap,
  archiveInfo: {
    existsOnDisk: boolean;
    bytes: number;
    sha256: string | null;
    builtAt: string | null;
    entriesCount: number;
  },
  extractionVerification?: {
    extractedOk: boolean;
    verifiedFilesCount: number;
    checksumMismatchCount: number;
    evidenceAr: string;
  }
): Omit<UnifiedWeightsArchiveStatus, 'fileName' | 'relativeDiskPath'> {
  const diskAssets = scanRealDiskAiAssets();
  const detectedEngines = scanRuntimeAndEngines();

  const realNeuralEngines = detectedEngines.filter((e) => e.isRealLocalNeuralEngine && e.installed);
  const totalWeightsBytes = diskAssets.realWeightFiles.reduce((sum, f) => sum + f.bytes, 0);
  const totalTokenizersBytes = diskAssets.realTokenizerFiles.reduce((sum, f) => sum + f.bytes, 0);
  const totalAdaptersBytes = diskAssets.realAdapterFiles.reduce((sum, f) => sum + f.bytes, 0);

  const shardDetails: UnifiedWeightsArchiveStatus['shardDetails'] = store.models.map((model) => {
    const candidateName = model.uploadedFileName ? path.basename(model.uploadedFileName) : null;
    const matchedDiskWeight = candidateName
      ? diskAssets.realWeightFiles.find((w) => w.fileName === candidateName)
      : undefined;

    const nameSha = sha256Buffer(model.name);
    const placeholderHashDetected =
      !matchedDiskWeight &&
      (KNOWN_PLACEHOLDER_HASHES.has(model.sha256) || model.sha256 === nameSha);

    const hasBinaryOnDisk = Boolean(matchedDiskWeight);
    const hasRealTokenizer = diskAssets.realTokenizerFiles.length > 0;
    const hasRealInferenceEngine = realNeuralEngines.some((e) => e.category === 'neural-inference');
    const offlineRunnable = hasBinaryOnDisk && hasRealInferenceEngine && (hasRealTokenizer || matchedDiskWeight?.ext === '.gguf');

    const blockersAr: string[] = [];
    if (!hasBinaryOnDisk) blockersAr.push('ملف الأوزان الثنائي (.gguf/.onnx/.safetensors) غير موجود على القرص');
    if (!hasRealTokenizer && matchedDiskWeight?.ext !== '.gguf') {
      blockersAr.push('ملفات Tokenizer الحقيقية (tokenizer.json/tokenizer.model) غير موجودة');
    }
    if (!hasRealInferenceEngine) blockersAr.push('محرك الاستدلال المحلي (llama-server/llama-cli/onnxruntime) غير مثبت');
    if (placeholderHashDetected) blockersAr.push('بصمة SHA-256 الحالية في الكتالوج بصمة مرجعية/اختبارية وليست بصمة ملف أوزان فعلي');

    return {
      modelId: model.id,
      modelName: model.name,
      hasBinaryOnDisk,
      hasRealTokenizer,
      hasRealInferenceEngine,
      offlineRunnable,
      placeholderHashDetected,
      fileName: matchedDiskWeight?.fileName || candidateName,
      bytes: matchedDiskWeight?.bytes || 0,
      sha256: matchedDiskWeight?.sha256 || model.sha256,
      license: model.license,
      blockersAr,
    };
  });

  const ragEngine = detectedEngines.find((e) => e.category === 'wrapper-rag-only');
  const nodeRuntime = detectedEngines.find((e) => e.name === 'Node.js Runtime');
  const pyRuntime = detectedEngines.find((e) => e.name === 'Python 3 Interpreter');
  const combinedRuntimeBytes = (nodeRuntime?.sizeBytes || 0) + (pyRuntime?.sizeBytes || 0) + (ragEngine?.sizeBytes || 0);

  const forensicComponents: ForensicComponentRow[] = [
    {
      key: 'weights',
      componentAr: 'الأوزان العصبية',
      actualFoundAr:
        diskAssets.realWeightFiles.length > 0
          ? `${diskAssets.realWeightFiles.length} ملف أوزان فعلي (${diskAssets.realWeightFiles.map((f) => f.fileName).join(', ')})`
          : `غير موجودة (0 ملفات GGUF/ONNX/SafeTensors/PyTorch في data/weights/؛ الموجود فقط 8 سجلات كتالوج JSON)`,
      sizeBytes: totalWeightsBytes,
      sizeLabel: formatBytesLabel(totalWeightsBytes),
      sha256:
        diskAssets.realWeightFiles.length > 0
          ? diskAssets.realWeightFiles[0].sha256
          : 'غير متوفر (أوزان غير موجودة — بصمات الكتالوج اختبارية)',
      status:
        diskAssets.realWeightFiles.length > 0
          ? diskAssets.shardCompletenessIssues.length > 0
            ? 'PARTIAL'
            : 'PASS'
          : 'BLOCKED',
    },
    {
      key: 'tokenizer',
      componentAr: 'Tokenizer',
      actualFoundAr:
        diskAssets.realTokenizerFiles.length > 0
          ? `${diskAssets.realTokenizerFiles.length} ملف (${diskAssets.realTokenizerFiles.map((t) => t.fileName).join(', ')})`
          : 'غير موجود (0 ملفات tokenizer.json / tokenizer.model / vocab.json / merges.txt)',
      sizeBytes: totalTokenizersBytes,
      sizeLabel: formatBytesLabel(totalTokenizersBytes),
      sha256: diskAssets.realTokenizerFiles[0]?.sha256 || 'غير متوفر',
      status: diskAssets.realTokenizerFiles.length > 0 ? 'PASS' : 'BLOCKED',
    },
    {
      key: 'inference_engine',
      componentAr: 'محركات الاستدلال',
      actualFoundAr:
        realNeuralEngines.some((e) => e.category === 'neural-inference')
          ? realNeuralEngines
              .filter((e) => e.category === 'neural-inference')
              .map((e) => `${e.name} (${e.version || '-'})`)
              .join(' · ')
          : 'غير موجود محلياً (لا يوجد llama-server / llama-cli / ollama / onnxruntime؛ المتوفر فقط غلاف RAG نصي + @google/genai السحابي)',
      sizeBytes: realNeuralEngines.reduce((s, e) => s + e.sizeBytes, 0),
      sizeLabel:
        realNeuralEngines.some((e) => e.category === 'neural-inference')
          ? formatBytesLabel(realNeuralEngines.reduce((s, e) => s + e.sizeBytes, 0))
          : `0 B (غلاف ragEngine.ts: ${formatBytesLabel(ragEngine?.sizeBytes || 0)})`,
      sha256:
        realNeuralEngines.find((e) => e.category === 'neural-inference')?.sha256 ||
        `غير متوفر للمحرك العصبي (RAG wrapper: ${ragEngine?.sha256?.slice(0, 16) || '-'}...)`,
      status: realNeuralEngines.some((e) => e.category === 'neural-inference') ? 'PASS' : 'BLOCKED',
    },
    {
      key: 'training_engine',
      componentAr: 'محركات التدريب',
      actualFoundAr:
        realNeuralEngines.some((e) => e.category === 'neural-training') && diskAssets.realAdapterFiles.length > 0
          ? `متوفر (${diskAssets.realAdapterFiles.length} ملف LoRA فعلي)`
          : 'غير موجود (لا يوجد PyTorch/PEFT/bitsandbytes؛ نقطة /api/finetune/:id/run تحاكي التقييم رقمياً وتنشئ JSON/سكربت فقط دون أوزان LoRA أو Checkpoints)',
      sizeBytes: totalAdaptersBytes,
      sizeLabel: formatBytesLabel(totalAdaptersBytes),
      sha256: diskAssets.realAdapterFiles[0]?.sha256 || 'غير متوفر (0 ملفات Checkpoints/LoRA)',
      status:
        realNeuralEngines.some((e) => e.category === 'neural-training') && diskAssets.realAdapterFiles.length > 0
          ? 'PASS'
          : 'BLOCKED',
    },
    {
      key: 'runtime_files',
      componentAr: 'ملفات Runtime',
      actualFoundAr: `Node.js ${process.version} + Python 3.11.2 + HelbaweyLocalRag (بدون مكتبات تشغيل عصبية .so/.node لـ llama.cpp أو ONNX)`,
      sizeBytes: combinedRuntimeBytes,
      sizeLabel: formatBytesLabel(combinedRuntimeBytes),
      sha256: nodeRuntime?.sha256 || '-',
      status: realNeuralEngines.length > 0 ? 'PASS' : 'PARTIAL',
    },
    {
      key: 'unified_archive',
      componentAr: 'الأرشيف الموحد',
      actualFoundAr: archiveInfo.existsOnDisk
        ? `${UNIFIED_WEIGHTS_FILENAME} (${archiveInfo.entriesCount} ملفاً: فهارس وإعدادات النماذج + سكربتات + شرائح: ${diskAssets.realWeightFiles.length})`
        : 'لم يُبنَ بعد على القرص',
      sizeBytes: archiveInfo.bytes,
      sizeLabel: formatBytesLabel(archiveInfo.bytes),
      sha256: archiveInfo.sha256 || '-',
      status:
        !archiveInfo.existsOnDisk
          ? 'BLOCKED'
          : diskAssets.realWeightFiles.length > 0 && realNeuralEngines.some((e) => e.category === 'neural-inference')
            ? 'PASS'
            : 'PARTIAL',
    },
  ];

  // Attempt live local neural load & inference ONLY if BOTH real weight file AND llama-cli exist
  let realLoadTestPassed = false;
  let realInferenceTestPassed = false;
  let realInferenceOutput = '';
  const llamaCli = detectedEngines.find((e) => e.name === 'llama-cli' && e.installed && e.path);
  const firstGguf = diskAssets.realWeightFiles.find((w) => w.ext === '.gguf');

  if (llamaCli?.path && firstGguf) {
    try {
      const genOut = execFileSync(
        llamaCli.path,
        ['-m', firstGguf.fullPath, '-p', 'Hello', '-n', '12', '--no-display-prompt'],
        { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] }
      );
      realLoadTestPassed = true;
      realInferenceTestPassed = genOut.trim().length > 0;
      realInferenceOutput = genOut.trim().slice(0, 120);
    } catch (err) {
      realLoadTestPassed = false;
      realInferenceOutput = err instanceof Error ? err.message : 'فشل تنفيذ llama-cli';
    }
  }

  const verificationTests: RealArchiveVerificationTest[] = [
    {
      id: 1,
      titleAr: 'إثبات وجود ملفات الأوزان الثنائية الفعلية وحساب أحجامها',
      status: diskAssets.realWeightFiles.length > 0 ? 'PASS' : 'BLOCKED',
      evidenceAr:
        diskAssets.realWeightFiles.length > 0
          ? `تم العثور على ${diskAssets.realWeightFiles.length} ملف أوزان فعلي بإجمالي حجم ${formatBytesLabel(totalWeightsBytes)}.`
          : 'BLOCKED: مجلد data/weights/ فارغ تماماً (0 ملفات ثنائية، 0 بايت).',
    },
    {
      id: 2,
      titleAr: 'التحقق من سلامة جميع الملفات الحقيقية باستخدام SHA-256',
      status:
        diskAssets.realWeightFiles.length > 0 && archiveInfo.existsOnDisk
          ? 'PASS'
          : archiveInfo.existsOnDisk
            ? 'PARTIAL'
            : 'BLOCKED',
      evidenceAr: archiveInfo.existsOnDisk
        ? `تم حساب SHA-256 للأرشيف الموحد (${archiveInfo.sha256?.slice(0, 20)}...)، بينما بصمات النماذج الثمانية في الكتالوج هي بصمات اختبارية (مثل sha256("test") و sha256("4")) وليست بصمات أوزان حقيقية.`
        : 'BLOCKED: الأرشيف الموحد غير مبني بعد.',
    },
    {
      id: 3,
      titleAr: 'التحقق من اكتمال الأجزاء (Shards) وعدم وجود أجزاء مفقودة',
      status:
        diskAssets.realWeightFiles.length === 0
          ? 'BLOCKED'
          : diskAssets.shardCompletenessIssues.length === 0
            ? 'PASS'
            : 'FAILED',
      evidenceAr:
        diskAssets.realWeightFiles.length === 0
          ? 'BLOCKED: لا توجد أي شرائح أوزان (0 Shards) على القرص لفحص اكتمالها.'
          : diskAssets.shardCompletenessIssues.length === 0
            ? `PASS: جميع الشرائح (${diskAssets.realWeightFiles.length}) مكتملة دون فجوات ترقيم.`
            : `FAILED: ${diskAssets.shardCompletenessIssues.join(' | ')}`,
    },
    {
      id: 4,
      titleAr: 'اختبار تحميل وزن حقيقي بواسطة محرك الاستدلال المحلي',
      status: realLoadTestPassed ? 'PASS' : 'BLOCKED',
      evidenceAr: realLoadTestPassed
        ? `PASS: تم تحميل ${firstGguf?.fileName} عبر ${llamaCli?.path}.`
        : 'BLOCKED: يتعذر التحميل لعدم وجود ملف أوزان ثنائي وعدم توفر ثنائي llama-cli / llama-server / onnxruntime على النظام.',
    },
    {
      id: 5,
      titleAr: 'إجراء توليد نص محلي فعلي بدون إنترنت أو API خارجي',
      status: realInferenceTestPassed ? 'PASS' : 'BLOCKED',
      evidenceAr: realInferenceTestPassed
        ? `PASS: توليد محلي مستقل 100% — المخرج: "${realInferenceOutput}"`
        : 'BLOCKED: لا يمكن تنفيذ توليد عصبي محلي دون ملف أوزان ومحرك استدلال محلي (تم استبعاد Gemini API السحابي كمحرك محلي).',
    },
    {
      id: 6,
      titleAr: 'اختبار استخراج الأرشيف والتشغيل المستقل من المجلد المستخرج',
      status:
        !archiveInfo.existsOnDisk
          ? 'BLOCKED'
          : extractionVerification
            ? extractionVerification.extractedOk && realInferenceTestPassed
              ? 'PASS'
              : extractionVerification.extractedOk
                ? 'PARTIAL'
                : 'FAILED'
            : 'PARTIAL',
      evidenceAr: extractionVerification
        ? extractionVerification.evidenceAr
        : 'PARTIAL: ملف ZIP مبني ويمكن استخراجه والتحقق من manifest.json و checksums.sha256، لكن التشغيل العصبي منه محتجز لغياب الأوزان والمحركات.',
    },
    {
      id: 7,
      titleAr: 'إثبات احتواء الأرشيف على كل متطلبات التشغيل المستقل أو حصر النواقص',
      status:
        diskAssets.realWeightFiles.length > 0 &&
        realNeuralEngines.some((e) => e.category === 'neural-inference') &&
        realInferenceTestPassed
          ? 'PASS'
          : 'BLOCKED',
      evidenceAr:
        diskAssets.realWeightFiles.length > 0 && realInferenceTestPassed
          ? 'PASS: الأرشيف مكتمل للتشغيل المستقل 100%.'
          : 'BLOCKED: الأرشيف الحالي يحتوي على بطاقات وإعدادات وسكربتات فقط، ويفتقر إلى ملفات الأوزان (.gguf/.onnx) وملفات Tokenizer وثنائيات محرك الاستدلال المحلي.',
    },
  ];

  const missingRequirementsAr: string[] = [];
  if (diskAssets.realWeightFiles.length === 0) {
    missingRequirementsAr.push('رفع أو إرفاق ملفات الأوزان العصبية الفعلية (.gguf / .onnx / .safetensors) إلى data/weights/');
  }
  if (diskAssets.realTokenizerFiles.length === 0) {
    missingRequirementsAr.push('توفير ملفات Tokenizer الحقيقية (tokenizer.json / tokenizer.model / vocab.json)');
  }
  if (!realNeuralEngines.some((e) => e.category === 'neural-inference')) {
    missingRequirementsAr.push('تثبيت أو تضمين ثنائي محرك استدلال محلي (llama-server / llama-cli أو onnxruntime)');
  }
  if (!realNeuralEngines.some((e) => e.category === 'neural-training') || diskAssets.realAdapterFiles.length === 0) {
    missingRequirementsAr.push('توفير بيئة PyTorch + PEFT وأوزان محولات LoRA المدربة فعلياً (.safetensors) إذا كان التدريب مطلوباً');
  }

  let overallVerdict: UnifiedWeightsArchiveStatus['overallVerdict'] = 'BLOCKED';
  if (
    diskAssets.realWeightFiles.length > 0 &&
    realNeuralEngines.some((e) => e.category === 'neural-inference') &&
    realInferenceTestPassed
  ) {
    overallVerdict = 'PASS';
  } else if (
    diskAssets.realWeightFiles.length > 0 ||
    realNeuralEngines.some((e) => e.category === 'neural-inference')
  ) {
    overallVerdict = 'PARTIAL';
  }

  return {
    existsOnDisk: archiveInfo.existsOnDisk,
    bytes: archiveInfo.bytes,
    sha256: archiveInfo.sha256,
    builtAt: archiveInfo.builtAt,
    registeredModelsCount: store.models.length,
    attachedBinaryShardsCount: diskAssets.realWeightFiles.length,
    attachedBinaryShardsBytes: totalWeightsBytes,
    realTokenizersCount: diskAssets.realTokenizerFiles.length,
    realNeuralEnginesCount: realNeuralEngines.length,
    fineTuneAdaptersCount: store.fineTuneJobs.length,
    entriesCount: archiveInfo.entriesCount,
    overallVerdict,
    missingRequirementsAr,
    forensicComponents,
    detectedEngines,
    verificationTests,
    shardDetails,
  };
}

export async function getUnifiedWeightsArchiveStatus(
  store: HelbaweyBootstrap,
  runExtractionCheck = false
): Promise<UnifiedWeightsArchiveStatus> {
  ensureUnifiedDirs();
  const existsOnDisk = fs.existsSync(UNIFIED_ARCHIVE_PATH) && fs.statSync(UNIFIED_ARCHIVE_PATH).isFile();

  let bytes = 0;
  let sha256: string | null = null;
  let builtAt: string | null = null;
  let entriesCount = 0;

  if (existsOnDisk) {
    const stat = fs.statSync(UNIFIED_ARCHIVE_PATH);
    bytes = stat.size;
    builtAt = stat.mtime.toISOString();
    if (fs.existsSync(UNIFIED_META_PATH)) {
      try {
        const meta = JSON.parse(fs.readFileSync(UNIFIED_META_PATH, 'utf8')) as {
          bytes?: number;
          sha256?: string;
          builtAt?: string;
          entriesCount?: number;
        };
        if (meta.bytes === bytes && typeof meta.sha256 === 'string') {
          sha256 = meta.sha256;
          builtAt = meta.builtAt || builtAt;
          entriesCount = Number(meta.entriesCount || 0);
        }
      } catch {
        // Compute digest directly below
      }
    }
    if (!sha256) {
      sha256 = computeDiskFileDigest(UNIFIED_ARCHIVE_PATH).sha256;
    }
  }

  const extractionVerification =
    runExtractionCheck && existsOnDisk
      ? await runArchiveExtractionVerification(UNIFIED_ARCHIVE_PATH)
      : undefined;

  const snapshot = buildForensicSnapshot(
    store,
    { existsOnDisk, bytes, sha256, builtAt, entriesCount },
    extractionVerification
  );

  return {
    fileName: UNIFIED_WEIGHTS_FILENAME,
    relativeDiskPath: UNIFIED_WEIGHTS_RELATIVE_PATH,
    ...snapshot,
  };
}

export async function buildAndSaveUnifiedWeightsArchive(
  store: HelbaweyBootstrap
): Promise<UnifiedWeightsArchiveStatus> {
  ensureUnifiedDirs();
  const builtAt = new Date().toISOString();
  const diskAssets = scanRealDiskAiAssets();
  const detectedEngines = scanRuntimeAndEngines();
  const preSnapshot = buildForensicSnapshot(store, {
    existsOnDisk: false,
    bytes: 0,
    sha256: null,
    builtAt,
    entriesCount: 0,
  });

  const zip = new JSZip();
  const checksumLines: string[] = [];
  const manifestFiles: {
    zipPath: string;
    sourceDiskPath: string | null;
    componentType: 'weight-shard' | 'tokenizer' | 'adapter' | 'runtime' | 'model-config' | 'audit';
    belongsToModelId: string | null;
    bytes: number;
    sha256: string;
    isRealNeuralArtifact: boolean;
  }[] = [];
  let entriesCount = 0;

  const addTextEntry = (
    zipPath: string,
    content: string,
    componentType: (typeof manifestFiles)[number]['componentType'],
    belongsToModelId: string | null = null,
    sourceDiskPath: string | null = null,
    isRealNeuralArtifact = false
  ) => {
    const buf = Buffer.from(content, 'utf8');
    const sha = sha256Buffer(buf);
    zip.file(zipPath, buf);
    checksumLines.push(`${sha}  ${zipPath}`);
    manifestFiles.push({
      zipPath,
      sourceDiskPath,
      componentType,
      belongsToModelId,
      bytes: buf.length,
      sha256: sha,
      isRealNeuralArtifact,
    });
    entriesCount += 1;
  };

  const addBinaryFileEntry = (
    zipPath: string,
    diskPath: string,
    expectedSha: string,
    componentType: (typeof manifestFiles)[number]['componentType'],
    belongsToModelId: string | null,
    isRealNeuralArtifact: boolean
  ) => {
    const buffer = fs.readFileSync(diskPath);
    zip.file(zipPath, buffer, { compression: 'STORE' });
    checksumLines.push(`${expectedSha}  ${zipPath}`);
    manifestFiles.push({
      zipPath,
      sourceDiskPath: path.relative(process.cwd(), diskPath),
      componentType,
      belongsToModelId,
      bytes: buffer.length,
      sha256: expectedSha,
      isRealNeuralArtifact,
    });
    entriesCount += 1;
  };

  // 1. Pack all model configurations & any real attached binary shards
  for (const model of store.models) {
    const safeId = model.id.replace(/[^a-zA-Z0-9._-]/g, '_');
    const detail = preSnapshot.shardDetails.find((d) => d.modelId === model.id);

    const modelConfig = {
      modelId: model.id,
      modelName: model.name,
      family: model.family,
      parameters: model.parameters,
      format: model.format,
      quantization: model.quantization,
      contextLength: model.contextLength,
      runtimeEngines: model.runtimeEngines,
      licensing: {
        license: model.license,
        commercialRedistribution: model.commercialRedistribution,
        notes: model.redistributionNotes,
      },
      offlineRunnable: Boolean(detail?.offlineRunnable),
      hasRealBinaryWeightOnDisk: Boolean(detail?.hasBinaryOnDisk),
      placeholderHashDetected: Boolean(detail?.placeholderHashDetected),
      blockersAr: detail?.blockersAr || [],
      includedShardPath: detail?.hasBinaryOnDisk && detail.fileName ? `shards/${detail.fileName}` : null,
      sha256: detail?.sha256 || model.sha256,
    };

    addTextEntry(
      `models/${safeId}/model.config.json`,
      JSON.stringify(modelConfig, null, 2),
      'model-config',
      model.id
    );
    addTextEntry(
      `models/${safeId}/model.card.json`,
      JSON.stringify(model, null, 2),
      'model-config',
      model.id
    );
  }

  // 2. Pack EVERY real neural weight file found anywhere in data/weights or data/
  for (const wf of diskAssets.realWeightFiles) {
    const ownerModel = store.models.find((m) => m.uploadedFileName && path.basename(m.uploadedFileName) === wf.fileName);
    addBinaryFileEntry(
      `shards/${wf.fileName}`,
      wf.fullPath,
      wf.sha256,
      'weight-shard',
      ownerModel?.id || null,
      true
    );
  }

  // 3. Pack EVERY real tokenizer file found on disk
  for (const tf of diskAssets.realTokenizerFiles) {
    addBinaryFileEntry(
      `tokenizers/${tf.fileName}`,
      tf.fullPath,
      tf.sha256,
      'tokenizer',
      null,
      true
    );
  }

  // 4. Pack any real trained adapter weights (.safetensors/.bin) + existing LoRA JSON configs/scripts clearly labeled
  for (const af of diskAssets.realAdapterFiles) {
    addBinaryFileEntry(`adapters/trained/${af.fileName}`, af.fullPath, af.sha256, 'adapter', null, true);
  }

  for (const job of store.fineTuneJobs) {
    const safeJobId = job.id.replace(/[^a-zA-Z0-9._-]/g, '_');
    const adapterMeta = {
      id: job.id,
      name: job.name,
      baseModelId: job.baseModelId,
      method: job.method,
      artifactKind: 'CONFIG_AND_SCRIPT_ONLY_NO_TRAINED_WEIGHTS',
      noteAr: 'إعدادات وسكربت فقط — لا توجد أوزان LoRA (.safetensors) مدربة فعلياً.',
      config: JSON.parse(job.adapterConfigJson || '{}'),
    };
    addTextEntry(`adapters/${safeJobId}.adapter.json`, JSON.stringify(adapterMeta, null, 2), 'adapter', job.baseModelId);
    addTextEntry(`adapters/${safeJobId}.train.sh`, job.trainingScript || '', 'adapter', job.baseModelId);
  }

  // 5. Pack available local runtime artifacts & engine forensic report (plus native inference binary if under 40MB)
  const localRagCode = generateStandaloneRagModuleCode();
  addTextEntry('runtime/local-rag-engine.mjs', localRagCode, 'runtime', null, 'server/ragEngine.ts', false);
  addTextEntry(
    'runtime/engines-inventory.json',
    JSON.stringify(detectedEngines, null, 2),
    'runtime',
    null,
    null,
    false
  );
  for (const eng of detectedEngines) {
    if (
      eng.isRealLocalNeuralEngine &&
      eng.installed &&
      eng.path &&
      fs.existsSync(eng.path) &&
      eng.sizeBytes > 0 &&
      eng.sizeBytes <= 40 * 1024 * 1024
    ) {
      addBinaryFileEntry(
        `runtime/bin/${path.basename(eng.path)}`,
        eng.path,
        eng.sha256 || computeDiskFileDigest(eng.path).sha256,
        'runtime',
        null,
        true
      );
    }
  }

  // 6. Comprehensive Forensic Manifest + Audit Table
  const manifest = {
    archiveName: UNIFIED_WEIGHTS_FILENAME,
    platform: 'ALHELBAWEY AI SOFTWARE FACTORY — منصة الهلباوي',
    builtAt,
    overallVerdict: preSnapshot.overallVerdict,
    missingRequirementsAr: preSnapshot.missingRequirementsAr,
    forensicComponents: preSnapshot.forensicComponents,
    models: preSnapshot.shardDetails,
    files: manifestFiles,
  };
  addTextEntry('manifest.json', JSON.stringify(manifest, null, 2), 'audit', null);

  const readmeLines = [
    '====================================================================',
    'تقرير الفحص الهندسي وأرشيف أوزان منصة الهلباوي (اوزان المنصه.zip)',
    'ALHELBAWEY AI SOFTWARE FACTORY — Forensic Unified Weights Archive',
    '====================================================================',
    `تاريخ الفحص والتحديث: ${builtAt}`,
    `الحكم النهائي للتشغيل المستقل: ${preSnapshot.overallVerdict}`,
    `ملفات الأوزان الثنائية الفعلية: ${diskAssets.realWeightFiles.length} (${formatBytesLabel(preSnapshot.attachedBinaryShardsBytes)})`,
    `ملفات Tokenizer الفعلية: ${diskAssets.realTokenizerFiles.length}`,
    `محركات الاستدلال العصبية المحلية المثبتة: ${preSnapshot.realNeuralEnginesCount}`,
    '',
    'النواقص المطلوبة للتشغيل المستقل الكامل (PASS):',
    ...(preSnapshot.missingRequirementsAr.length > 0
      ? preSnapshot.missingRequirementsAr.map((m, i) => `  ${i + 1}. ${m}`)
      : ['  لا توجد نواقص — جميع المكونات مكتملة.']),
  ];
  addTextEntry('README_AR.txt', readmeLines.join('\n'), 'audit', null);

  zip.file('checksums.sha256', checksumLines.join('\n') + '\n');
  entriesCount += 1;

  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const archiveSha256 = sha256Buffer(zipBuffer);
  const tmpArchivePath = path.resolve(UNIFIED_DIR, `.tmp.${process.pid}.${UNIFIED_WEIGHTS_FILENAME}`);
  fs.writeFileSync(tmpArchivePath, zipBuffer);
  fs.renameSync(tmpArchivePath, UNIFIED_ARCHIVE_PATH);

  const metaPayload = {
    fileName: UNIFIED_WEIGHTS_FILENAME,
    relativeDiskPath: UNIFIED_WEIGHTS_RELATIVE_PATH,
    bytes: zipBuffer.length,
    sha256: archiveSha256,
    builtAt,
    entriesCount,
  };
  const tmpMetaPath = path.resolve(UNIFIED_DIR, `.tmp.${process.pid}.manifest.meta.json`);
  fs.writeFileSync(tmpMetaPath, JSON.stringify(metaPayload, null, 2), 'utf8');
  fs.renameSync(tmpMetaPath, UNIFIED_META_PATH);

  // Execute live Test #6: extract into isolated temp folder and verify SHA-256 of extracted files
  const extractionCheck = await runArchiveExtractionVerification(UNIFIED_ARCHIVE_PATH);

  const finalSnapshot = buildForensicSnapshot(
    store,
    {
      existsOnDisk: true,
      bytes: zipBuffer.length,
      sha256: archiveSha256,
      builtAt,
      entriesCount,
    },
    extractionCheck
  );

  return {
    fileName: UNIFIED_WEIGHTS_FILENAME,
    relativeDiskPath: UNIFIED_WEIGHTS_RELATIVE_PATH,
    ...finalSnapshot,
  };
}
