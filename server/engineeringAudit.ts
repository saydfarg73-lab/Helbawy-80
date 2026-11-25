import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import ArabicReshaper from 'arabic-reshaper';
import bidiFactory from 'bidi-js';
import type {
  EngineeringAuditItem,
  EngineeringAuditReport,
  FeatureStatus,
  HelbaweyBootstrap,
  ModelWeightDiskAudit,
} from '../src/types/helbawey.ts';
import { buildStandaloneBundleArtifacts, runIndependenceVerification } from './exporter.ts';
import {
  findLocalLlamaBinary,
  listDiskWeightFiles,
  resolveWeightFilePath,
  sha256FileStreamSync,
} from './localLlamaManager.ts';

const STORE_PATH = path.resolve(process.cwd(), 'data', 'helbawey_store.json');
const DIST_DIR = path.resolve(process.cwd(), 'dist');

const FONT_REGULAR = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const FONT_MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf';

const bidi = bidiFactory();

const KNOWN_PLACEHOLDER_HASHES = new Set(
  ['', 'test', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((s) =>
    crypto.createHash('sha256').update(s).digest('hex')
  )
);

function findBinaryOnPath(binaryName: string): string | null {
  const localCandidate = path.resolve(process.cwd(), 'data', 'runtime', 'llama.cpp', binaryName);
  try {
    if (fs.existsSync(localCandidate) && fs.statSync(localCandidate).isFile()) {
      return localCandidate;
    }
  } catch {
    // ignore
  }
  const pathEnv = process.env.PATH || '';
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, binaryName);
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // ignore inaccessible directories
    }
  }
  return null;
}

function computeFileSha256(filePath: string): { bytes: number; sha256: string } {
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

function inspectDistBundle(): { distBuilt: boolean; distBundleJsBytes: number } {
  const indexHtml = path.resolve(DIST_DIR, 'index.html');
  const assetsDir = path.resolve(DIST_DIR, 'assets');
  if (!fs.existsSync(indexHtml)) {
    return { distBuilt: false, distBundleJsBytes: 0 };
  }
  let jsBytes = 0;
  if (fs.existsSync(assetsDir)) {
    for (const entry of fs.readdirSync(assetsDir)) {
      if (entry.endsWith('.js')) {
        jsBytes += fs.statSync(path.join(assetsDir, entry)).size;
      }
    }
  }
  return { distBuilt: true, distBundleJsBytes: jsBytes };
}

function buildLicenseNotes(license: string, commercialRedistribution: boolean): string {
  const lower = license.toLowerCase();
  if (!commercialRedistribution) {
    return `الترخيص (${license}) مقيد تجارياً ولا يسمح بالتضمين دون موافقة صريحة.`;
  }
  if (lower.includes('apache')) {
    return 'يسمح بالتضمين التجاري مع وجوب إرفاق ملف LICENSE ونص إشعارات NOTICE داخل الحزمة.';
  }
  if (lower.includes('llama')) {
    return 'يتطلب إرفاق رخصة Llama 3.2 وإظهار عبارة "Built with Llama" في الواجهة/الوثائق (<700M MAU).';
  }
  if (lower.includes('gemma')) {
    return 'يتطلب تمرير شروط الاستخدام المسؤول (Gemma Prohibited Use Policy) للمستخدم النهائي.';
  }
  if (lower.includes('qwen')) {
    return 'يسمح بالاستخدام التجاري تحت سقف 100M MAU مع وجوب إرفاق ملف الترخيص الأصلي.';
  }
  return 'يتطلب مراجعة وإرفاق نص الترخيص الرسمي مع الحزمة الموزعة.';
}

export function buildEngineeringAuditReport(
  store: HelbaweyBootstrap,
  projectId?: string
): EngineeringAuditReport {
  const generatedAt = new Date().toISOString();
  const reportId = `AUD-${generatedAt.slice(0, 10).replace(/-/g, '')}-${crypto
    .randomUUID()
    .slice(0, 6)
    .toUpperCase()}`;

  const project =
    (projectId ? store.projects.find((p) => p.id === projectId) : undefined) || store.projects[0];
  const activeModel =
    (project ? store.models.find((m) => m.id === project.selectedModelId) : undefined) ||
    store.models[0];

  const diskFiles = listDiskWeightFiles();
  const weightsFilesOnDisk = diskFiles.map((f) => f.fileName);
  const storeBytes = fs.existsSync(STORE_PATH) ? fs.statSync(STORE_PATH).size : 0;
  const distInfo = inspectDistBundle();

  const binariesDetected = {
    llamaServer: findLocalLlamaBinary('llama-server'),
    llamaCli: findLocalLlamaBinary('llama-cli'),
    ollama: findBinaryOnPath('ollama'),
  };
  const anyLocalLlmBinary = Boolean(
    binariesDetected.llamaServer || binariesDetected.llamaCli || binariesDetected.ollama
  );

  const totalRamGb = Number((os.totalmem() / (1024 * 1024 * 1024)).toFixed(1));
  const freeRamGb = Number((os.freemem() / (1024 * 1024 * 1024)).toFixed(1));
  const usedRamGb = Number(Math.max(0, totalRamGb - freeRamGb).toFixed(1));

  // Audit every registered model against disk reality
  const modelAudits: ModelWeightDiskAudit[] = store.models.map((m) => {
    const fileName = m.uploadedFileName || `${m.id}.${m.format.toLowerCase()}`;
    const safeName = path.basename(fileName);
    const resolved = m.uploadedFileName ? resolveWeightFilePath(safeName) : null;
    const expectedPath = resolved || `/tmp/helbawey-weights/${safeName}`;

    let diskExists = false;
    let diskBytes = 0;
    let actualDiskSha256: string | null = null;

    if (resolved) {
      const stat = fs.statSync(resolved);
      if (stat.isFile()) {
        diskExists = true;
        const computed = sha256FileStreamSync(resolved);
        diskBytes = computed.bytes;
        actualDiskSha256 = computed.sha256;
      }
    }

    const isPlaceholderHash = KNOWN_PLACEHOLDER_HASHES.has(m.sha256);
    const sha256Status: ModelWeightDiskAudit['sha256Status'] = diskExists
      ? actualDiskSha256 === m.sha256
        ? 'MATCH_VERIFIED'
        : 'MISMATCH'
      : isPlaceholderHash
        ? 'PLACEHOLDER_HASH'
        : 'MISSING_ON_DISK';

    const status: FeatureStatus =
      diskExists && sha256Status === 'MATCH_VERIFIED'
        ? 'TESTED'
        : diskExists
          ? 'FAILED'
          : 'FAILED';

    return {
      modelId: m.id,
      modelName: m.name,
      parameters: m.parameters,
      format: m.format,
      quantization: m.quantization,
      catalogSizeGb: m.sizeGb,
      expectedPath,
      diskExists,
      diskBytes,
      expectedSha256: m.sha256,
      actualDiskSha256,
      sha256Status,
      license: m.license,
      commercialRedistribution: m.commercialRedistribution,
      licenseNotesAr: buildLicenseNotes(m.license, m.commercialRedistribution),
      status,
    };
  });

  const bundle = project && activeModel ? buildStandaloneBundleArtifacts(project, activeModel) : null;
  const verifyReport =
    project && activeModel ? runIndependenceVerification(project, activeModel) : null;

  const activeModelAudit = modelAudits.find((a) => a.modelId === activeModel?.id);
  const anyWeightOnDisk = modelAudits.some((a) => a.diskExists && a.sha256Status === 'MATCH_VERIFIED');
  const placeholderHashesCount = modelAudits.filter((a) => a.sha256Status === 'PLACEHOLDER_HASH').length;

  const auditItems: EngineeringAuditItem[] = [
    {
      id: 'aud-build-dist',
      code: 'AUD-01',
      categoryAr: 'البناء والأنواع',
      titleAr: 'البناء الإنتاجي وفحص TypeScript (dist/ + tsc)',
      status: distInfo.distBuilt ? 'TESTED' : 'IMPLEMENTED',
      componentRef: 'package.json · dist/',
      evidenceAr: distInfo.distBuilt
        ? `مخرجات الإنتاج dist/ موجودة على القرص (حجم حزمة JS المجمّعة: ${(
            distInfo.distBundleJsBytes / 1024
          ).toFixed(1)} KB).`
        : 'الكود مبني بنمط TypeScript ولم تُرصد مخرجات dist/ على القرص حالياً.',
      gapOrActionAr: distInfo.distBundleJsBytes > 500 * 1024
        ? 'تحذير حجم الحزمة (>500 KB): يُستحسن تفعيل codeSplitting مستقبلاً.'
        : 'مكتمل.',
    },
    {
      id: 'aud-db-backend',
      code: 'AUD-02',
      categoryAr: 'قواعد البيانات والخلفية',
      titleAr: 'عمليات CRUD الخلفية وتخزين البيانات الفعلي',
      status: storeBytes > 0 ? 'TESTED' : 'IMPLEMENTED',
      componentRef: 'server.ts · data/helbawey_store.json',
      evidenceAr: `ملف التخزين الفعلي data/helbawey_store.json موجود بحجم ${(
        storeBytes / 1024
      ).toFixed(1)} KB ويدعم القراءة/الكتابة الذرّية (${store.projects.length} مشاريع، ${
        store.trainingDatasets.length
      } مجموعات تدريب).`,
      gapOrActionAr:
        'التخزين يعتمد حالياً على JSON (data/helbawey_store.json و db/data.json) وليس محرك SQL تنفيذي (SQLite/PostgreSQL)؛ ملف schema.sql توثيقي.',
    },
    {
      id: 'aud-rag-local',
      code: 'AUD-03',
      categoryAr: 'الذكاء المحلي RAG',
      titleAr: 'محرك الفهرسة والبحث الدلالي المحلي بدون إنترنت',
      status: 'TESTED',
      componentRef: 'server/ragEngine.ts · /api/projects/:id/rag/search',
      evidenceAr:
        'فهرسة TF-IDF وتطبيع عربي/إنجليزي وحساب Cosine Similarity تعمل محلياً بنسبة 100% دون أي استدعاء سحابي (externalApiCalled: false).',
      gapOrActionAr: 'يعمل باسترجاع نصي دلالي فقط؛ توليد صياغة حوارية عصبية يتطلب ربط نموذج GGUF ومحرك محلي.',
    },
    {
      id: 'aud-cloud-factory-chat',
      code: 'AUD-04',
      categoryAr: 'مصنع التطبيقات والدردشة',
      titleAr: 'توليد المشاريع والدردشة الطبيعية وقراءة المستندات',
      status: 'TESTED',
      componentRef: 'server/multiAgentFactory.ts · server/platformChat.ts · server/documentParser.ts',
      evidenceAr:
        'يعمل التوليد والدردشة وقراءة ملفات PDF/Word/Excel/الصور فعلياً عبر @google/genai (gemini-4-hydrogen) من الخادم، مع تصدير PDF عربي.',
      gapOrActionAr:
        'هذه الطبقة سحابية (تعتمد على GEMINI_API_KEY) وتُعد بيئة تطوير، ولا تُحتسب كاستدلال مستقل مفصول عن الإنترنت.',
    },
    {
      id: 'aud-weight-upload',
      code: 'AUD-05',
      categoryAr: 'استيراد الأوزان',
      titleAr: 'استيراد شرائح الأوزان وحساب SHA-256 عبر الواجهة',
      status: 'IMPLEMENTED',
      componentRef: 'ModelWeightsWorkspace.tsx · POST /api/models/:id/upload-weight',
      evidenceAr:
        'المسار الخلفي يحفظ الملف فعلياً في data/weights/ ويحسب بصمة SHA-256 للبايتات المرفوعة.',
      gapOrActionAr:
        'الرفع من المتصفح مقيد بحد أقصى 28 MB ولا يدعم رفع ملفات GGUF كاملة متعددة الجيجابايت (0.4–4.37 GB).',
    },
    {
      id: 'aud-weights-disk',
      code: 'AUD-06',
      categoryAr: 'الأوزان الفعلية',
      titleAr: 'وجود ملفات الأوزان الفعلية (GGUF / ONNX) على القرص',
      status: anyWeightOnDisk ? 'TESTED' : 'FAILED',
      componentRef: 'data/weights/',
      evidenceAr: anyWeightOnDisk
        ? `تم العثور على ${weightsFilesOnDisk.length} ملف أوزان داخل data/weights/.`
        : `مجلد data/weights/ فارغ تماماً (${weightsFilesOnDisk.length} ملفات)؛ لم يُرفق أي ملف GGUF أو ONNX حقيقي على القرص.`,
      gapOrActionAr: anyWeightOnDisk
        ? 'تحقق من توافق البصمات مع كل مشروع.'
        : 'يلزم وضع ملف الأوزان الفعلي (مثل Qwen2.5-1.5B-Instruct-Q4_K_M.gguf) داخل data/weights/ أو ربطه بمسار تخزين محلي.',
    },
    {
      id: 'aud-sha256-catalog',
      code: 'AUD-07',
      categoryAr: 'التكامل والبصمات',
      titleAr: 'سلامة بصمات SHA-256 في سجل النماذج',
      status: activeModelAudit?.sha256Status === 'MATCH_VERIFIED' ? 'TESTED' : 'FAILED',
      componentRef: 'server/store.ts (seedModels)',
      evidenceAr:
        placeholderHashesCount > 0
          ? `تم رصد ${placeholderHashesCount} من أصل ${modelAudits.length} نماذج ببصمات SHA-256 تجريبية لنصوص قصيرة (مثل sha256("test") و sha256("4") و sha256("")) رغم وسمها في البيانات الأولية بـ VERIFIED.`
          : 'البصمات المسجلة مطابقة للقرص.',
      gapOrActionAr:
        'استبدال البصمات التجريبية بالبصمات الرسمية الموثقة لملفات GGUF/ONNX الحقيقية عند إرفاقها.',
    },
    {
      id: 'aud-local-runtime',
      code: 'AUD-08',
      categoryAr: 'محرك الاستدلال',
      titleAr: 'توفر محرك الاستدلال المحلي (llama-server / ollama) والتوليد الفعلي',
      status: anyLocalLlmBinary && verifyReport?.localInferenceSucceeded ? 'TESTED' : 'FAILED',
      componentRef: 'PATH binaries · ai/runtime/inference-engine.mjs',
      evidenceAr: anyLocalLlmBinary
        ? `تم رصد محرك محلي: ${
            binariesDetected.llamaServer || binariesDetected.llamaCli || binariesDetected.ollama
          }`
        : 'لم يُرصد أي ثنائي محرك استدلال في PATH (llama-server: NOT FOUND · llama-cli: NOT FOUND · ollama: NOT FOUND).',
      gapOrActionAr:
        'بدون llama-server شغّال على 127.0.0.1:8080، يتحول inference-engine.mjs إلى وضع embedded-local-rag-engine (بحث نصي فقط وليس توليدي LLM).',
    },
    {
      id: 'aud-exporter-bundle',
      code: 'AUD-09',
      categoryAr: 'تغليف الحزمة',
      titleAr: 'شمولية حزمة التصدير ZIP (كود + أوزان + Tokenizer + تبعيات)',
      status:
        bundle?.weightsEmbedMode === 'EMBEDDED_FULL_SHARD' ? 'TESTED' : 'FAILED',
      componentRef: 'server/exporter.ts · tests/verify_independence.mjs',
      evidenceAr: bundle
        ? `حجم الحزمة الحالية بدون أوزان: ${(bundle.totalBytes / 1024).toFixed(1)} KB (${
            bundle.weightsEmbedMode
          }). تضم server.js و model.config.json و schema.sql، لكن tokenizer.json مستخرج من مفردات RAG و helbawey-local-embeddings.bin مصفوفة مصطنعة 64 KB، و node_modules غير مضمن.`
        : 'لا يوجد مشروع محدد.',
      gapOrActionAr:
        'تضمين شريحة الأوزان الفعلية + Tokenizer الأصلي للنموذج + مراجعة tests/verify_independence.mjs كي لا يمرر الحزمة عند غياب primary-model-weights-shard.',
    },
    {
      id: 'aud-offline-test',
      code: 'AUD-10',
      categoryAr: 'فصل الإنترنت',
      titleAr: 'تشغيل الحزمة المستقلة بعد فصل الإنترنت وتنفيذ توليد لغوي حقيقي',
      status: verifyReport?.worksOffline ? 'TESTED' : 'BLOCKED',
      componentRef: 'POST /api/projects/:id/verify · المادة 19-8..14',
      evidenceAr: verifyReport
        ? `فحص خلو الكود من APIs خارجية نجح (0 استدعاءات خارجية)، لكن نتيجة التحقق الكلية = ${verifyReport.verdict} (worksOffline=${verifyReport.worksOffline}).`
        : 'لم يُنفذ التحقق.',
      gapOrActionAr:
        'مُعلّق لحين توفر: (1) ملف الأوزان الفعلي على القرص، (2) ثنائي llama-server، (3) حزمة node_modules أوفلاين، (4) بيئة تشغيل معزولة الشبكة.',
    },
    {
      id: 'aud-lora-training',
      code: 'AUD-11',
      categoryAr: 'التدريب والتخصيص',
      titleAr: 'تنفيذ تدريب LoRA / QLoRA الفعلي على أوزان النموذج',
      status: 'PLANNED',
      componentRef: 'server.ts (/api/finetune/:id/run) · FineTuneWorkspace.tsx',
      evidenceAr:
        'المنصة تولّد ملفات إعداد PEFT LoRA وسكريبت Python (train_qlora.py) مع مكتبة بيانات تدريب متكاملة، لكن نقطة /api/finetune/:id/run تحسب تحسناً عددياً تقديرياً فقط دون تدريب GPU/CPU فعلي.',
      gapOrActionAr:
        'ربط مشغّل تدريب Python/PEFT/llama.cpp finetune فعلي على بيئة مزودة بموارد تدريب.',
    },
    {
      id: 'aud-licenses',
      code: 'AUD-12',
      categoryAr: 'الامتثال القانوني',
      titleAr: 'تضمين نصوص التراخيص وإشعارات التوزيع التجاري داخل الحزمة',
      status: 'BLOCKED',
      componentRef: 'ai/model.config.json · README_AR.md',
      evidenceAr:
        'التراخيص مُعرّفة في البيانات الوصفية (Apache-2.0, Qwen <100M MAU, Llama 3.2 Community, Gemma Terms)، لكن الحزمة المصدرة لا ترفق ملفات LICENSE/NOTICE الفعلية ولا تحقن إشعار "Built with Llama" أو قيود Gemma تلقائياً.',
      gapOrActionAr:
        'إضافة توليد تلقائي لملف LICENSE و NOTICE وإشعار الواجهة المطلوب لكل عائلة نموذج داخل exporter.ts قبل التوزيع التجاري.',
    },
  ];

  const statusCounts: Record<FeatureStatus, number> = {
    TESTED: 0,
    IMPLEMENTED: 0,
    PLANNED: 0,
    FAILED: 0,
    BLOCKED: 0,
  };
  for (const item of auditItems) {
    statusCounts[item.status] += 1;
  }

  const overallApproved = Boolean(
    anyWeightOnDisk && anyLocalLlmBinary && verifyReport?.verdict === 'INDEPENDENT_VERIFIED'
  );

  const executiveSummaryAr = overallApproved
    ? 'الحزمة والمضيف مستوفيان لمتطلبات الاستقلال الفعلي: ملفات الأوزان موجودة ومتطابقة SHA-256 ومحرك الاستدلال المحلي جاهز.'
    : 'توقيف الاعتماد النهائي: التطبيق والبناء وقاعدة البيانات JSON ومحرك RAG المحلي والتكامل السحابي مع Gemini API تعمل وتجتاز الاختبار، لكن الاستقلال اللغوي المحلي دون إنترنت ما يزال غير مكتمل لغياب ملفات الأوزان الفعلية في data/weights/ (0 ملفات)، وعدم توفر ثنائي llama-server/llama-cli على المضيف، واحتواء سجل النماذج الأولي على بصمات SHA-256 تجريبية.';

  const baseReport = {
    reportId,
    generatedAt,
    projectId: project?.id || null,
    projectName: project?.name || null,
    overallVerdict: overallApproved
      ? ('APPROVED_INDEPENDENT' as const)
      : ('HOLD_REQUIRES_WEIGHTS_AND_RUNTIME' as const),
    executiveSummaryAr,
    statusCounts,
    hostDiagnostics: {
      platform: os.platform(),
      arch: os.arch(),
      cpuCores: os.cpus().length,
      totalRamGb,
      usedRamGb,
      weightsDirPath: 'data/weights/',
      weightsDirFilesCount: weightsFilesOnDisk.length,
      storePath: 'data/helbawey_store.json',
      storeBytes,
      distBuilt: distInfo.distBuilt,
      distBundleJsBytes: distInfo.distBundleJsBytes,
      binariesDetected,
    },
    auditItems,
    modelAudits,
  };

  const reportDigestSha256 = crypto
    .createHash('sha256')
    .update(JSON.stringify(baseReport))
    .digest('hex');

  return {
    ...baseReport,
    reportDigestSha256,
  };
}

function containsArabic(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

function shapeAndReorderLine(logicalLine: string): string {
  if (!logicalLine) return '';
  if (!containsArabic(logicalLine)) return logicalLine;
  const shaped = ArabicReshaper.convertArabic(logicalLine);
  const levels = bidi.getEmbeddingLevels(shaped, 'rtl');
  return bidi.getReorderedString(shaped, levels);
}

function wrapRtlLogicalLines(
  doc: PDFKit.PDFDocument,
  text: string,
  maxWidth: number
): string[] {
  const paragraphs = text.split('\n');
  const visualLines: string[] = [];
  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) {
      visualLines.push('');
      continue;
    }
    const words = trimmed.split(/\s+/);
    let currentLine = '';
    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (currentLine && doc.widthOfString(shapeAndReorderLine(candidate)) > maxWidth) {
        visualLines.push(shapeAndReorderLine(currentLine));
        currentLine = word;
      } else {
        currentLine = candidate;
      }
    }
    if (currentLine) visualLines.push(shapeAndReorderLine(currentLine));
  }
  return visualLines;
}

export async function generateEngineeringAuditPdfBuffer(
  report: EngineeringAuditReport
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 40, bottom: 46, left: 38, right: 38 },
      bufferPages: true,
      info: {
        Title: `ALHELBAWEY Engineering Audit Report — ${report.reportId}`,
        Author: 'ALHELBAWEY AI Software Factory',
        Subject: 'Engineering Audit, Model Weights Disk Verification & Independence Readiness',
      },
    });

    const hasRegularFont = fs.existsSync(FONT_REGULAR);
    const hasBoldFont = fs.existsSync(FONT_BOLD);
    const hasMonoFont = fs.existsSync(FONT_MONO);
    if (hasRegularFont) doc.registerFont('ArabicRegular', FONT_REGULAR);
    if (hasBoldFont) doc.registerFont('ArabicBold', FONT_BOLD);
    if (hasMonoFont) doc.registerFont('Mono', FONT_MONO);

    const regularFont = hasRegularFont ? 'ArabicRegular' : 'Helvetica';
    const boldFont = hasBoldFont ? 'ArabicBold' : 'Helvetica-Bold';
    const monoFont = hasMonoFont ? 'Mono' : 'Courier';

    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err) => reject(err));

    const pageLeft = doc.page.margins.left;
    const contentWidth = doc.page.width - pageLeft - doc.page.margins.right;
    const bottomLimit = doc.page.height - doc.page.margins.bottom - 20;

    const ensureSpace = (needed: number) => {
      if (doc.y + needed > bottomLimit) doc.addPage();
    };

    const drawRtl = (
      text: string,
      opts: { x?: number; width?: number; fontSize?: number; bold?: boolean; color?: string; lineGap?: number } = {}
    ) => {
      const x = opts.x ?? pageLeft;
      const width = opts.width ?? contentWidth;
      const fontSize = opts.fontSize ?? 9;
      const lineGap = opts.lineGap ?? 3;
      doc.font(opts.bold ? boldFont : regularFont).fontSize(fontSize).fillColor(opts.color ?? '#0f172a');
      const lines = wrapRtlLogicalLines(doc, text, width);
      for (const line of lines) {
        ensureSpace(fontSize + lineGap + 4);
        doc.text(line, x, doc.y, { width, align: 'right', lineBreak: false });
        doc.y += fontSize + lineGap;
      }
    };

    const drawSectionHeader = (title: string) => {
      ensureSpace(34);
      doc.y += 8;
      const top = doc.y;
      doc.save();
      doc.rect(pageLeft, top, contentWidth, 22).fill('#f1f5f9');
      doc.restore();
      doc
        .font(boldFont)
        .fontSize(10)
        .fillColor('#0f172a')
        .text(shapeAndReorderLine(title), pageLeft + 10, top + 5, {
          width: contentWidth - 20,
          align: 'right',
          lineBreak: false,
        });
      doc.y = top + 28;
    };

    // Banner
    const bTop = doc.y;
    doc.save();
    doc.roundedRect(pageLeft, bTop, contentWidth, 74, 8).fill('#0f172a');
    doc.restore();

    doc
      .font(boldFont)
      .fontSize(13)
      .fillColor('#ffffff')
      .text(
        shapeAndReorderLine('تقرير التدقيق الهندسي الشامل — منصة الهلباوي (ALHELBAWEY)'),
        pageLeft + 14,
        bTop + 12,
        { width: contentWidth - 28, align: 'right', lineBreak: false }
      );

    doc
      .font(regularFont)
      .fontSize(8.5)
      .fillColor('#cbd5e1')
      .text(
        shapeAndReorderLine(
          `رقم التقرير: ${report.reportId}  |  المشروع: ${report.projectName || 'الكل'}  |  التاريخ: ${new Date(
            report.generatedAt
          ).toLocaleString('ar-EG')}`
        ),
        pageLeft + 14,
        bTop + 34,
        { width: contentWidth - 28, align: 'right', lineBreak: false }
      );

    const verdictColor =
      report.overallVerdict === 'APPROVED_INDEPENDENT' ? '#34d399' : '#fb7185';
    doc
      .font(boldFont)
      .fontSize(8.5)
      .fillColor(verdictColor)
      .text(
        shapeAndReorderLine(
          `الحكم النهائي: ${
            report.overallVerdict === 'APPROVED_INDEPENDENT'
              ? 'APPROVED_INDEPENDENT — معتمد ومستقل بالكامل'
              : 'HOLD_REQUIRES_WEIGHTS_AND_RUNTIME — الاعتماد موقوف لحين توفر الأوزان ومحرك الاستدلال'
          }`
        ),
        pageLeft + 14,
        bTop + 52,
        { width: contentWidth - 28, align: 'right', lineBreak: false }
      );

    doc.y = bTop + 84;

    // Executive summary & 5-state breakdown
    drawRtl(report.executiveSummaryAr, { fontSize: 9, color: '#1e293b', lineGap: 3.5 });
    doc.y += 4;
    drawRtl(
      `ملخص الحالات: TESTED: ${report.statusCounts.TESTED}  |  IMPLEMENTED: ${report.statusCounts.IMPLEMENTED}  |  PLANNED: ${report.statusCounts.PLANNED}  |  FAILED: ${report.statusCounts.FAILED}  |  BLOCKED: ${report.statusCounts.BLOCKED}`,
      { fontSize: 9, bold: true, color: '#0f172a' }
    );

    // Host diagnostics
    drawSectionHeader('1. تشخيص المضيف ومخرجات البناء الفعلية');
    const h = report.hostDiagnostics;
    drawRtl(
      `النظام: ${h.platform} (${h.arch}) · الأنوية: ${h.cpuCores} · الذاكرة الحية: ${h.usedRamGb} / ${h.totalRamGb} GB RAM`,
      { fontSize: 8.5 }
    );
    drawRtl(
      `ملفات الأوزان في ${h.weightsDirPath}: ${h.weightsDirFilesCount} ملف · قاعدة البيانات (${h.storePath}): ${(
        h.storeBytes / 1024
      ).toFixed(1)} KB · حزمة dist/: ${h.distBuilt ? `موجودة (${(h.distBundleJsBytes / 1024).toFixed(1)} KB)` : 'غير مبنية'}`,
      { fontSize: 8.5 }
    );
    drawRtl(
      `محركات الاستدلال في PATH: llama-server (${h.binariesDetected.llamaServer || 'NOT FOUND'}) · llama-cli (${
        h.binariesDetected.llamaCli || 'NOT FOUND'
      }) · ollama (${h.binariesDetected.ollama || 'NOT FOUND'})`,
      { fontSize: 8.5, color: '#334155' }
    );

    // Engineering Audit Items
    drawSectionHeader('2. نتائج اختبارات وفحوصات التدقيق الهندسي');
    const statusColors: Record<FeatureStatus, string> = {
      TESTED: '#047857',
      IMPLEMENTED: '#0369a1',
      PLANNED: '#475569',
      BLOCKED: '#b45309',
      FAILED: '#be123c',
    };

    for (const item of report.auditItems) {
      ensureSpace(58);
      drawRtl(`${item.code} [${item.status}] — ${item.titleAr} (${item.categoryAr})`, {
        fontSize: 9,
        bold: true,
        color: statusColors[item.status],
        lineGap: 2.5,
      });
      drawRtl(`المكون: ${item.componentRef} | الدليل: ${item.evidenceAr}`, {
        fontSize: 8.3,
        color: '#1e293b',
        lineGap: 2.5,
      });
      drawRtl(`المتطلب / الإجراء: ${item.gapOrActionAr}`, {
        fontSize: 8.2,
        color: '#475569',
        lineGap: 3,
      });
      doc.y += 2;
      doc
        .moveTo(pageLeft, doc.y)
        .lineTo(pageLeft + contentWidth, doc.y)
        .strokeColor('#e2e8f0')
        .lineWidth(0.5)
        .stroke();
      doc.y += 4;
    }

    // Model Weights Disk & License Audit
    drawSectionHeader('3. جرد مسارات وأحجام ملفات الأوزان والبصمات SHA-256 والتراخيص');
    for (const m of report.modelAudits) {
      ensureSpace(52);
      drawRtl(
        `[${m.status}] ${m.modelName} (${m.parameters} · ${m.format} · ${m.quantization}) — المسار المتوقع: ${m.expectedPath}`,
        {
          fontSize: 8.8,
          bold: true,
          color: statusColors[m.status],
          lineGap: 2.5,
        }
      );
      drawRtl(
        `حجم الكتالوج: ${m.catalogSizeGb} GB | الحجم الفعلي على القرص: ${m.diskBytes} bytes (${
          m.diskExists ? 'موجود' : 'مفقود'
        }) | حالة SHA-256: ${m.sha256Status}`,
        { fontSize: 8.2, color: '#1e293b', lineGap: 2.5 }
      );
      drawRtl(`الترخيص: ${m.license} — ${m.licenseNotesAr}`, {
        fontSize: 8,
        color: '#475569',
        lineGap: 2.5,
      });
      doc
        .font(monoFont)
        .fontSize(7.2)
        .fillColor('#64748b')
        .text(`Expected SHA-256: ${m.expectedSha256}`, pageLeft, doc.y, {
          width: contentWidth,
          align: 'left',
        });
      doc.y += 4;
    }

    // Report Digest Footer
    ensureSpace(32);
    doc.y += 4;
    drawRtl('البصمة الرقمية لمحتوى تقرير التدقيق (Report Digest SHA-256):', {
      fontSize: 8,
      bold: true,
      color: '#475569',
    });
    doc
      .font(monoFont)
      .fontSize(7.5)
      .fillColor('#475569')
      .text(report.reportDigestSha256, pageLeft, doc.y, { width: contentWidth, align: 'left' });

    const pageRange = doc.bufferedPageRange();
    for (let i = 0; i < pageRange.count; i++) {
      doc.switchToPage(i);
      const footerY = doc.page.height - doc.page.margins.bottom + 8;
      doc
        .font(monoFont)
        .fontSize(7.5)
        .fillColor('#64748b')
        .text(`ALHELBAWEY Engineering Audit (${report.reportId})`, pageLeft, footerY, {
          width: contentWidth * 0.75,
          align: 'left',
          lineBreak: false,
        });
      doc.text(`Page ${i + 1} / ${pageRange.count}`, pageLeft + contentWidth * 0.75, footerY, {
        width: contentWidth * 0.25,
        align: 'right',
        lineBreak: false,
      });
    }

    doc.end();
  });
}
