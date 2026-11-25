import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  HelbaweyBootstrap,
  WeightIntegrityReport,
  WeightIntegrityRow,
} from '../src/types/helbawey.ts';

const WEIGHTS_DIR = path.resolve(process.cwd(), 'data', 'weights');

const KNOWN_PLACEHOLDER_HASHES = new Set(
  ['', 'test', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map((s) =>
    crypto.createHash('sha256').update(s).digest('hex')
  )
);

function computeDiskFileSha256(filePath: string): { bytes: number; sha256: string } {
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

export function buildWeightsIntegrityReport(
  store: HelbaweyBootstrap,
  projectId?: string
): WeightIntegrityReport {
  const project =
    (projectId ? store.projects.find((p) => p.id === projectId) : undefined) || store.projects[0];

  const linkedFiles = new Set<string>();
  let importedCount = 0;
  let matchedCount = 0;
  let mismatchCount = 0;
  let missingCount = 0;

  const rows: WeightIntegrityRow[] = store.models.map((model) => {
    const safeName = model.uploadedFileName ? path.basename(model.uploadedFileName) : null;
    const diskPath = safeName ? path.resolve(WEIGHTS_DIR, safeName) : null;
    const exists = Boolean(
      diskPath &&
        diskPath.startsWith(WEIGHTS_DIR + path.sep) &&
        fs.existsSync(diskPath) &&
        fs.statSync(diskPath).isFile()
    );

    let actualSha256: string | null = null;
    let importedBytes = 0;

    if (exists && diskPath && safeName) {
      linkedFiles.add(safeName);
      const digest = computeDiskFileSha256(diskPath);
      actualSha256 = digest.sha256;
      importedBytes = digest.bytes;
      importedCount += 1;
    } else {
      missingCount += 1;
    }

    const referenceSha256 = (model.referenceSha256 || model.sha256 || '').toLowerCase();
    const modelNameSha = crypto.createHash('sha256').update(model.name).digest('hex');
    const referenceIsPlaceholder =
      !referenceSha256 ||
      KNOWN_PLACEHOLDER_HASHES.has(referenceSha256) ||
      referenceSha256 === modelNameSha;

    let matchStatus: WeightIntegrityRow['matchStatus'];
    let mismatchReasonAr: string | null = null;

    if (!actualSha256) {
      matchStatus = 'MISSING_ON_DISK';
      mismatchReasonAr = 'لم يُستورد ملف أوزان فعلي على القرص في data/weights/ بعد للمقارنة.';
    } else if (actualSha256.toLowerCase() !== referenceSha256) {
      matchStatus = 'MISMATCH';
      mismatchCount += 1;
      mismatchReasonAr = `عدم تطابق حرج! بصمة الملف المستورد (${actualSha256.slice(0, 12)}...) لا تطابق الهاش المرجعي المعلن (${referenceSha256.slice(0, 12)}...).`;
    } else if (referenceIsPlaceholder) {
      matchStatus = 'UNVERIFIED_PLACEHOLDER_REF';
      mismatchReasonAr =
        'الهاش المرجعي الحالي مرجع اختباري بالكتالوج؛ أدخل الهاش الرسمي من مصدر النموذج للتحقق الموثق.';
    } else {
      matchStatus = 'MATCH_VERIFIED';
      matchedCount += 1;
    }

    return {
      modelId: model.id,
      modelName: model.name,
      format: model.format,
      quantization: model.quantization,
      license: model.license,
      isSelectedInProject: project?.selectedModelId === model.id,
      imported: Boolean(actualSha256),
      importedFileName: safeName,
      importedRelativePath: exists && safeName ? `data/weights/${safeName}` : null,
      importedBytes,
      actualSha256,
      referenceSha256,
      referenceIsPlaceholder,
      referenceSourceLabel: model.referenceSha256
        ? 'الهاش المرجعي المعلن والمعتمد'
        : referenceIsPlaceholder
          ? 'هاش كتالوج اختباري (غير رسمي)'
          : 'هاش مصدر النموذج المسجل',
      matchStatus,
      mismatchReasonAr,
    };
  });

  const unlinkedDiskFiles: WeightIntegrityReport['unlinkedDiskFiles'] = [];
  if (fs.existsSync(WEIGHTS_DIR)) {
    for (const entry of fs.readdirSync(WEIGHTS_DIR)) {
      if (entry.startsWith('.')) continue;
      if (linkedFiles.has(entry)) continue;
      const fullPath = path.resolve(WEIGHTS_DIR, entry);
      if (!fullPath.startsWith(WEIGHTS_DIR + path.sep)) continue;
      const st = fs.statSync(fullPath);
      if (!st.isFile()) continue;
      const d = computeDiskFileSha256(fullPath);
      unlinkedDiskFiles.push({
        fileName: entry,
        bytes: d.bytes,
        actualSha256: d.sha256,
      });
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    weightsDirectory: 'data/weights/',
    importedCount,
    matchedCount,
    mismatchCount,
    missingCount,
    rows,
    unlinkedDiskFiles,
  };
}
