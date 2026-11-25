import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import ArabicReshaper from 'arabic-reshaper';
import bidiFactory from 'bidi-js';
import type {
  ModelTechnicalDossier,
  ModelWeightEntry,
  Project,
} from '../src/types/helbawey.ts';

const WEIGHTS_DIR = path.resolve(process.cwd(), 'data', 'weights');
const FONT_REGULAR = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const FONT_MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf';

const bidi = bidiFactory();

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
      const candidateVisual = shapeAndReorderLine(candidate);
      if (currentLine && doc.widthOfString(candidateVisual) > maxWidth) {
        visualLines.push(shapeAndReorderLine(currentLine));
        currentLine = word;
      } else {
        currentLine = candidate;
      }
    }
    if (currentLine) {
      visualLines.push(shapeAndReorderLine(currentLine));
    }
  }

  return visualLines;
}

export function buildModelTechnicalDossier(
  model: ModelWeightEntry,
  project?: Project
): ModelTechnicalDossier {
  const generatedAt = new Date().toISOString();
  const reportId = `TR-${model.id.toUpperCase()}-${generatedAt.slice(0, 10).replace(/-/g, '')}-${crypto
    .randomUUID()
    .slice(0, 6)
    .toUpperCase()}`;

  // Inspect actual weight file on disk
  let diskFileExists = false;
  let diskFileBytes = 0;
  let actualDiskSha256: string | null = null;
  let diskFilePath = 'data/weights/ (لا يوجد ملف أوزان مرفق على القرص)';

  if (model.uploadedFileName) {
    const safeName = path.basename(model.uploadedFileName);
    const resolved = path.resolve(WEIGHTS_DIR, safeName);
    diskFilePath = `data/weights/${safeName}`;
    if (resolved.startsWith(WEIGHTS_DIR + path.sep) && fs.existsSync(resolved)) {
      const stat = fs.statSync(resolved);
      if (stat.isFile()) {
        diskFileExists = true;
        diskFileBytes = stat.size;
        const hash = crypto.createHash('sha256');
        const fd = fs.openSync(resolved, 'r');
        const chunk = Buffer.alloc(1024 * 1024);
        try {
          let bytesRead = 0;
          while ((bytesRead = fs.readSync(fd, chunk, 0, chunk.length, null)) > 0) {
            hash.update(chunk.subarray(0, bytesRead));
          }
          actualDiskSha256 = hash.digest('hex');
        } finally {
          fs.closeSync(fd);
        }
      }
    }
  }

  const sha256MatchStatus: ModelTechnicalDossier['integrity']['sha256MatchStatus'] = !diskFileExists
    ? 'UNVERIFIED_MISSING_ON_DISK'
    : actualDiskSha256 === model.sha256
      ? 'MATCH_VERIFIED'
      : 'MISMATCH';

  const hostBinariesDetected = {
    llamaServer: findBinaryOnPath('llama-server'),
    llamaCli: findBinaryOnPath('llama-cli'),
    ollama: findBinaryOnPath('ollama'),
  };

  const activeEngine = project?.runtimeEngine || model.runtimeEngines[0] || 'llama.cpp';
  const totalMemGb = Number((os.totalmem() / (1024 * 1024 * 1024)).toFixed(1));
  const freeMemGb = Number((os.freemem() / (1024 * 1024 * 1024)).toFixed(1));
  const usedMemGb = Number(Math.max(0, totalMemGb - freeMemGb).toFixed(1));

  let projectContext: ModelTechnicalDossier['hardware']['projectContext'] = null;
  if (project) {
    const gpuMatch = model.gpuRequirements.match(/(\d+(?:\.\d+)?)\s*GB/i);
    const gpuReqGb = gpuMatch ? Number(gpuMatch[1]) : 0;
    const minRamOk = project.targetRamGb >= model.minRamGb;
    const osOk = project.targetOs !== 'Android' || model.runtimeEngines.includes('Android-NNAPI');
    const vramAndRamDeficit =
      gpuReqGb > 0 && project.targetGpuVramGb < gpuReqGb && project.targetRamGb < model.ramRequiredGb;
    const compatible = minRamOk && osOk && !vramAndRamDeficit && model.commercialRedistribution;

    const compatibilitySummaryAr = !minRamOk
      ? `غير متوافق: ذاكرة العميل (${project.targetRamGb} GB) أقل من الحد الأدنى للنموذج (${model.minRamGb} GB).`
      : !osOk
        ? 'غير متوافق: نظام Android يتطلب دعم محرك Android-NNAPI.'
        : vramAndRamDeficit
          ? `غير متوافق: يتطلب ${gpuReqGb} GB VRAM أو ${model.ramRequiredGb} GB RAM للتشغيل البديل.`
          : project.targetRamGb < model.ramRequiredGb
            ? `توافق بالحد الأدنى: المتاح ${project.targetRamGb} GB والموصى به ${model.ramRequiredGb} GB.`
            : project.targetGpuVramGb === 0 && gpuReqGb > 0
              ? `متوافق (وضع CPU فقط): سيعمل على RAM النظام (${project.targetRamGb} GB) دون تسريع GPU.`
              : `متوافق تماماً: يترك هامش ذاكرة ${(project.targetRamGb - model.ramRequiredGb).toFixed(1)} GB RAM.`;

    projectContext = {
      projectId: project.id,
      projectName: project.name,
      targetOs: project.targetOs,
      targetRamGb: project.targetRamGb,
      targetGpuVramGb: project.targetGpuVramGb,
      hardwareCompatible: compatible,
      compatibilitySummaryAr,
      verificationVerdict: project.verificationReport?.verdict || null,
    };
  }

  const runtimeReadyOnHost = Boolean(
    hostBinariesDetected.llamaServer || hostBinariesDetected.llamaCli || hostBinariesDetected.ollama
  );
  const approvalReady = sha256MatchStatus === 'MATCH_VERIFIED' && runtimeReadyOnHost;

  const baseDossier = {
    reportId,
    generatedAt,
    modelId: model.id,
    modelName: model.name,
    family: model.family,
    parameters: model.parameters,
    format: model.format,
    quantization: model.quantization,
    contextLength: model.contextLength,
    shardsCount: model.shardsCount,
    catalogSizeGb: model.sizeGb,
    postQuantAccuracy: model.postQuantAccuracy,
    knownLimits: model.knownLimits,
    recommendedTasks: model.recommendedTasks,
    integrity: {
      expectedSha256: model.sha256,
      diskFileName: model.uploadedFileName || null,
      diskFilePath,
      diskFileExists,
      diskFileBytes,
      actualDiskSha256,
      sha256MatchStatus,
    },
    licensing: {
      license: model.license,
      commercialRedistribution: model.commercialRedistribution,
      redistributionNotes: model.redistributionNotes,
    },
    inferenceEngine: {
      activeEngine,
      supportedEngines: model.runtimeEngines,
      loopbackEndpoint: 'http://127.0.0.1:8080/v1/chat/completions',
      hostBinariesDetected,
      referenceTokensPerSec: model.measuredTokensPerSec,
      runtimeNotesAr: runtimeReadyOnHost
        ? `يتصل محرك التشغيل المحلي (${activeEngine}) بالخادم الموضعي على 127.0.0.1 فقط دون أي اتصال خارجي.`
        : `لم يُرصد ملف ثنائي لمحرك الاستدلال (llama-server / llama-cli / ollama) في PATH على المضيف الحالي؛ في الحزمة المصدرة يتصل المحرك بالمسار المحلي 127.0.0.1:8080 أو يفعّل محرك RAG المدمج كبديل.`,
    },
    hardware: {
      minRamGb: model.minRamGb,
      recommendedRamGb: model.ramRequiredGb,
      cpuRequirements: model.cpuRequirements,
      gpuRequirements: model.gpuRequirements,
      ramVsGpuGuidanceAr:
        'ذاكرة النظام (RAM) متطلب إلزامي لتحميل الأوزان وذاكرة السياق KV-Cache في وضع CPU-Only، بينما ذاكرة GPU VRAM خيار تسريع اختياري لرفع معدل الرموز/ثانية.',
      hostSnapshot: {
        cpuCores: os.cpus().length,
        totalRamGb: totalMemGb,
        usedRamGb: usedMemGb,
      },
      projectContext,
    },
    approvalReadiness: {
      status: approvalReady ? ('READY_VERIFIED' as const) : ('HOLD_MISSING_WEIGHTS_OR_ENGINE' as const),
      summaryAr: approvalReady
        ? 'تم التحقق من وجود ملف الأوزان الفعلي على القرص وتطابق SHA-256 وتوفر محرك الاستدلال المحلي.'
        : 'الاعتماد موقوف مرحلياً: يلزم إرفاق ملف الأوزان الفعلي داخل data/weights/ وتطابق SHA-256 وتوفر محرك الاستدلال المحلي لاكتمال الجاهزية التشغيلية.',
    },
  };

  const reportDigestSha256 = crypto
    .createHash('sha256')
    .update(JSON.stringify(baseDossier))
    .digest('hex');

  return {
    ...baseDossier,
    reportDigestSha256,
  };
}

export async function generateModelTechnicalPdfBuffer(
  dossier: ModelTechnicalDossier
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 44, bottom: 48, left: 42, right: 42 },
      bufferPages: true,
      info: {
        Title: `${dossier.modelName} — Technical Specification & Audit Report`,
        Author: 'ALHELBAWEY AI Software Factory',
        Subject: `Model Technical Report (${dossier.modelId}) — SHA-256, License & Inference Engine`,
        Keywords: `${dossier.modelName}, ${dossier.licensing.license}, ${dossier.inferenceEngine.activeEngine}, SHA-256`,
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
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err) => reject(err));

    const pageLeft = doc.page.margins.left;
    const pageRight = doc.page.margins.right;
    const contentWidth = doc.page.width - pageLeft - pageRight;
    const bottomLimit = doc.page.height - doc.page.margins.bottom - 20;

    const ensureSpace = (neededHeight: number) => {
      if (doc.y + neededHeight > bottomLimit) {
        doc.addPage();
      }
    };

    const drawRtlText = (
      text: string,
      opts: {
        x?: number;
        width?: number;
        fontSize?: number;
        bold?: boolean;
        color?: string;
        lineGap?: number;
      } = {}
    ) => {
      const x = opts.x ?? pageLeft;
      const width = opts.width ?? contentWidth;
      const fontSize = opts.fontSize ?? 9.5;
      const color = opts.color ?? '#0f172a';
      const lineGap = opts.lineGap ?? 3;

      doc.font(opts.bold ? boldFont : regularFont).fontSize(fontSize).fillColor(color);
      const lines = wrapRtlLogicalLines(doc, text, width);
      for (const line of lines) {
        ensureSpace(fontSize + lineGap + 4);
        doc.text(line, x, doc.y, { width, align: 'right', lineBreak: false });
        doc.y += fontSize + lineGap;
      }
    };

    const drawLtrMono = (
      text: string,
      opts: {
        x?: number;
        width?: number;
        fontSize?: number;
        color?: string;
        bgColor?: string;
      } = {}
    ) => {
      const x = opts.x ?? pageLeft;
      const width = opts.width ?? contentWidth;
      const fontSize = opts.fontSize ?? 8.2;
      const color = opts.color ?? '#0f172a';

      doc.font(monoFont).fontSize(fontSize);
      const textHeight = doc.heightOfString(text, { width: width - 16 }) + 10;
      ensureSpace(textHeight + 4);

      if (opts.bgColor) {
        doc
          .save()
          .roundedRect(x, doc.y, width, textHeight, 4)
          .fill(opts.bgColor)
          .restore();
      }
      doc.fillColor(color).text(text, x + 8, doc.y + 5, { width: width - 16, align: 'left' });
      doc.y += textHeight + 4;
    };

    const drawSectionHeader = (indexLabel: string, titleAr: string, subtitleEn: string) => {
      ensureSpace(34);
      doc.y += 6;
      const headerY = doc.y;
      doc.save().roundedRect(pageLeft, headerY, contentWidth, 24, 4).fill('#0f172a').restore();

      doc
        .font(monoFont)
        .fontSize(8)
        .fillColor('#94a3b8')
        .text(`${indexLabel} · ${subtitleEn}`, pageLeft + 10, headerY + 7, {
          width: contentWidth * 0.45,
          align: 'left',
          lineBreak: false,
        });

      doc.font(boldFont).fontSize(10).fillColor('#ffffff');
      const shapedTitle = shapeAndReorderLine(titleAr);
      doc.text(shapedTitle, pageLeft + contentWidth * 0.45, headerY + 6, {
        width: contentWidth * 0.55 - 10,
        align: 'right',
        lineBreak: false,
      });

      doc.y = headerY + 30;
    };

    const drawKeyValueRow = (
      labelAr: string,
      value: string,
      options: { isMonoValue?: boolean; badgeColor?: string } = {}
    ) => {
      const labelColW = 165;
      const valueColW = contentWidth - labelColW - 14;

      doc.font(options.isMonoValue ? monoFont : regularFont).fontSize(9);
      const visualValueLines = options.isMonoValue
        ? [value]
        : wrapRtlLogicalLines(doc, value, valueColW);
      const valHeight = options.isMonoValue
        ? doc.heightOfString(value, { width: valueColW })
        : Math.max(13, visualValueLines.length * 13);

      doc.font(boldFont).fontSize(9);
      const visualLabelLines = wrapRtlLogicalLines(doc, labelAr, labelColW);
      const lblHeight = Math.max(13, visualLabelLines.length * 13);

      const rowHeight = Math.max(valHeight, lblHeight) + 10;
      ensureSpace(rowHeight + 2);

      const rowY = doc.y;
      doc
        .save()
        .rect(pageLeft, rowY, contentWidth, rowHeight)
        .fill('#f8fafc')
        .strokeColor('#e2e8f0')
        .lineWidth(0.5)
        .stroke()
        .restore();

      // Right column: Arabic label
      doc.font(boldFont).fontSize(9).fillColor('#334155');
      let ly = rowY + 5;
      for (const lLine of visualLabelLines) {
        doc.text(lLine, pageLeft + valueColW + 8, ly, {
          width: labelColW,
          align: 'right',
          lineBreak: false,
        });
        ly += 12.5;
      }

      // Left column: value
      const valColor = options.badgeColor || '#0f172a';
      if (options.isMonoValue) {
        doc
          .font(monoFont)
          .fontSize(8.5)
          .fillColor(valColor)
          .text(value, pageLeft + 8, rowY + 5, { width: valueColW, align: 'left' });
      } else {
        doc.font(regularFont).fontSize(9).fillColor(valColor);
        let vy = rowY + 5;
        for (const vLine of visualValueLines) {
          doc.text(vLine, pageLeft + 8, vy, {
            width: valueColW,
            align: 'right',
            lineBreak: false,
          });
          vy += 12.5;
        }
      }

      doc.y = rowY + rowHeight + 2;
    };

    // ==================== COVER / TOP BANNER ====================
    const bannerTop = doc.y;
    doc.save().roundedRect(pageLeft, bannerTop, contentWidth, 74, 6).fill('#0f172a').restore();

    doc
      .font(monoFont)
      .fontSize(8.5)
      .fillColor('#38bdf8')
      .text('ALHELBAWEY AI SOFTWARE FACTORY · TECHNICAL MODEL DOSSIER', pageLeft + 14, bannerTop + 12, {
        width: contentWidth - 28,
        align: 'left',
      });

    doc.font(boldFont).fontSize(14).fillColor('#ffffff');
    doc.text(
      shapeAndReorderLine(`التقرير الفني الشامل للنموذج: ${dossier.modelName}`),
      pageLeft + 14,
      bannerTop + 28,
      { width: contentWidth - 28, align: 'right' }
    );

    doc
      .font(monoFont)
      .fontSize(8)
      .fillColor('#cbd5e1')
      .text(
        `Report ID: ${dossier.reportId}   |   Generated: ${dossier.generatedAt}`,
        pageLeft + 14,
        bannerTop + 52,
        { width: contentWidth - 28, align: 'left' }
      );

    doc.y = bannerTop + 82;

    // Audit Readiness Banner
    const isVerified = dossier.approvalReadiness.status === 'READY_VERIFIED';
    const statusBoxY = doc.y;
    const statusBg = isVerified ? '#ecfdf5' : '#fff1f2';
    const statusBorder = isVerified ? '#6ee7b7' : '#fda4af';
    const statusTextCol = isVerified ? '#065f46' : '#9f1239';

    doc
      .save()
      .roundedRect(pageLeft, statusBoxY, contentWidth, 34, 4)
      .fillAndStroke(statusBg, statusBorder)
      .restore();

    doc.font(boldFont).fontSize(9).fillColor(statusTextCol);
    const statusLine = shapeAndReorderLine(
      `حالة الجاهزية للاعتماد (${dossier.approvalReadiness.status}): ${dossier.approvalReadiness.summaryAr}`
    );
    const statusLines = wrapRtlLogicalLines(
      doc,
      `حالة الجاهزية (${dossier.approvalReadiness.status}): ${dossier.approvalReadiness.summaryAr}`,
      contentWidth - 20
    );
    let sy = statusBoxY + 6;
    for (const sLine of statusLines.slice(0, 2)) {
      doc.text(sLine, pageLeft + 10, sy, { width: contentWidth - 20, align: 'right', lineBreak: false });
      sy += 12;
    }
    void statusLine;
    doc.y = statusBoxY + 42;

    // ==================== SECTION 1: IDENTITY & ARCHITECTURE ====================
    drawSectionHeader('01', 'الهوية الفنية ومواصفات المعمارية', 'MODEL IDENTITY & SPECS');
    drawKeyValueRow('معرّف النموذج (ID)', dossier.modelId, { isMonoValue: true });
    drawKeyValueRow('الاسم الرسمي للنموذج', dossier.modelName, { isMonoValue: true });
    drawKeyValueRow('العائلة وحجم المعاملات', `${dossier.family} · ${dossier.parameters}`);
    drawKeyValueRow('صيغة الأوزان والتكميم', `${dossier.format} · ${dossier.quantization}`);
    drawKeyValueRow(
      'طول نافذة السياق والشرائح',
      `${dossier.contextLength.toLocaleString('en-US')} tokens · ${dossier.shardsCount} shard(s)`
    );
    drawKeyValueRow('الحجم المرجعي في السجل', `${dossier.catalogSizeGb} GB (مرجعي للكتالوج)`);
    drawKeyValueRow('الدقة بعد التكميم', dossier.postQuantAccuracy);
    drawKeyValueRow('القيود الفنية المعروفة', dossier.knownLimits);
    drawKeyValueRow('المهام الموصى بها', dossier.recommendedTasks.join(' · '));

    // ==================== SECTION 2: SHA-256 & INTEGRITY ====================
    drawSectionHeader('02', 'التحقق التشفيري وسلامة ملف الأوزان (SHA-256)', 'SHA-256 & DISK INTEGRITY');
    drawKeyValueRow(
      'حالة مطابقة SHA-256',
      dossier.integrity.sha256MatchStatus === 'MATCH_VERIFIED'
        ? 'MATCH_VERIFIED — البصمة مطابقة للملف الفعلي على القرص'
        : dossier.integrity.sha256MatchStatus === 'MISMATCH'
          ? 'MISMATCH — تعارض بين بصمة الملف والكتالوج'
          : 'UNVERIFIED_MISSING_ON_DISK — لم يُثبت التطابق لعدم وجود ملف أوزان فعلي على القرص',
      {
        badgeColor:
          dossier.integrity.sha256MatchStatus === 'MATCH_VERIFIED' ? '#047857' : '#be123c',
      }
    );
    drawKeyValueRow('مسار الملف المحلي المفحوص', dossier.integrity.diskFilePath, {
      isMonoValue: !containsArabic(dossier.integrity.diskFilePath),
    });
    drawKeyValueRow(
      'الحجم الفعلي على القرص',
      dossier.integrity.diskFileExists
        ? `${dossier.integrity.diskFileBytes.toLocaleString('en-US')} bytes (${(
            dossier.integrity.diskFileBytes /
            (1024 * 1024)
          ).toFixed(2)} MB)`
        : '0 bytes (الملف غير موجود على القرص حالياً)',
      { badgeColor: dossier.integrity.diskFileExists ? '#0f172a' : '#be123c' }
    );

    drawRtlText('البصمة الرقمية المعتمدة في السجل (Catalog Expected SHA-256):', {
      bold: true,
      fontSize: 8.5,
      color: '#334155',
    });
    drawLtrMono(dossier.integrity.expectedSha256, {
      bgColor: '#f1f5f9',
      color: '#0f172a',
    });

    drawRtlText('البصمة الرقمية المحسوبة من القرص (Computed Disk SHA-256):', {
      bold: true,
      fontSize: 8.5,
      color: '#334155',
    });
    drawLtrMono(
      dossier.integrity.actualDiskSha256 ||
        'NULL (NO WEIGHT FILE PRESENT IN data/weights/ TO COMPUTE SHA-256)',
      {
        bgColor: dossier.integrity.actualDiskSha256 ? '#ecfdf5' : '#fff1f2',
        color: dossier.integrity.actualDiskSha256 ? '#065f46' : '#9f1239',
      }
    );

    // ==================== SECTION 3: LICENSING ====================
    drawSectionHeader('03', 'الترخيص القانوني وإعادة التوزيع التجاري', 'LICENSING & COMPLIANCE');
    drawKeyValueRow('نسخة واسم الرخصة', dossier.licensing.license, { isMonoValue: true });
    drawKeyValueRow(
      'إعادة التوزيع التجاري داخل الحزم',
      dossier.licensing.commercialRedistribution
        ? 'مسموح — مسموح بتضمين الأوزان وتوزيعها تجارياً وفق شروط الرخصة'
        : 'غير مسموح / مقيد — يتطلب مراجعة قانونية',
      { badgeColor: dossier.licensing.commercialRedistribution ? '#047857' : '#be123c' }
    );
    drawKeyValueRow('تفاصيل والتزامات الرخصة', dossier.licensing.redistributionNotes);

    // ==================== SECTION 4: INFERENCE ENGINE ====================
    drawSectionHeader('04', 'محرك الاستدلال وبروتوكول التشغيل المحلي', 'INFERENCE ENGINE & RUNTIME');
    drawKeyValueRow('المحرك النشط المعتمد', dossier.inferenceEngine.activeEngine, {
      isMonoValue: true,
    });
    drawKeyValueRow(
      'محركات الاستدلال المدعومة',
      dossier.inferenceEngine.supportedEngines.join(', '),
      { isMonoValue: true }
    );
    drawKeyValueRow('نقطة الاتصال المحلية (Loopback)', dossier.inferenceEngine.loopbackEndpoint, {
      isMonoValue: true,
    });
    drawKeyValueRow(
      'فحص الثنائيات التنفيذية على المضيف',
      `llama-server: ${dossier.inferenceEngine.hostBinariesDetected.llamaServer || 'NOT INSTALLED'} | llama-cli: ${dossier.inferenceEngine.hostBinariesDetected.llamaCli || 'NOT INSTALLED'} | ollama: ${dossier.inferenceEngine.hostBinariesDetected.ollama || 'NOT INSTALLED'}`,
      { isMonoValue: true }
    );
    drawKeyValueRow(
      'معدل التوليد المرجعي',
      `${dossier.inferenceEngine.referenceTokensPerSec} tokens/sec (قيمة مرجعية للكتالوج وليست قياس استدلال حي ما لم يُشغَّل المحرك)`
    );
    drawKeyValueRow('ملاحظات التشغيل المستقل', dossier.inferenceEngine.runtimeNotesAr);

    // ==================== SECTION 5: HARDWARE & PROJECT CONTEXT ====================
    drawSectionHeader('05', 'متطلبات العتاد ومطابقة جهاز العميل والمضيف', 'HARDWARE & DEVICE FIT');
    drawKeyValueRow(
      'متطلب ذاكرة النظام الإلزامي (RAM)',
      `${dossier.hardware.minRamGb} GB كحد أدنى · ${dossier.hardware.recommendedRamGb} GB موصى به`
    );
    drawKeyValueRow('متطلبات المعالج المركزي (CPU)', dossier.hardware.cpuRequirements);
    drawKeyValueRow('متطلبات مسرّع الرسوميات (GPU)', dossier.hardware.gpuRequirements);
    drawKeyValueRow('توضيح RAM مقابل GPU الاختياري', dossier.hardware.ramVsGpuGuidanceAr);
    drawKeyValueRow(
      'قياسات المضيف الحية (node:os)',
      `الأنوية: ${dossier.hardware.hostSnapshot.cpuCores} · إجمالي RAM: ${dossier.hardware.hostSnapshot.totalRamGb} GB · المستخدم: ${dossier.hardware.hostSnapshot.usedRamGb} GB`
    );

    if (dossier.hardware.projectContext) {
      const ctx = dossier.hardware.projectContext;
      drawKeyValueRow(
        'سياق المشروع المرتبط',
        `${ctx.projectName} (${ctx.projectId}) — ${ctx.targetOs} · ${ctx.targetRamGb} GB RAM · ${ctx.targetGpuVramGb} GB VRAM`
      );
      drawKeyValueRow('نتيجة مطابقة العتاد للمشروع', ctx.compatibilitySummaryAr, {
        badgeColor: ctx.hardwareCompatible ? '#047857' : '#be123c',
      });
      if (ctx.verificationVerdict) {
        drawKeyValueRow('آخر نتيجة لوحدة التحقق من الاستقلال', ctx.verificationVerdict, {
          isMonoValue: true,
          badgeColor: ctx.verificationVerdict === 'INDEPENDENT_VERIFIED' ? '#047857' : '#be123c',
        });
      }
    }

    // ==================== FOOTER & REPORT DIGEST ====================
    ensureSpace(44);
    doc.y += 6;
    drawRtlText('البصمة الرقمية لمحتوى هذا التقرير (Report Payload SHA-256):', {
      bold: true,
      fontSize: 8,
      color: '#475569',
    });
    drawLtrMono(dossier.reportDigestSha256, { bgColor: '#f8fafc', color: '#475569' });

    // Number all pages cleanly
    const pageRange = doc.bufferedPageRange();
    for (let i = 0; i < pageRange.count; i++) {
      doc.switchToPage(i);
      const footerY = doc.page.height - doc.page.margins.bottom + 8;
      doc
        .font(monoFont)
        .fontSize(7.5)
        .fillColor('#64748b')
        .text(
          `ALHELBAWEY Technical Report (${dossier.modelId}) — Generated Offline (Zero External APIs)`,
          pageLeft,
          footerY,
          { width: contentWidth * 0.75, align: 'left', lineBreak: false }
        );
      doc.text(
        `Page ${i + 1} / ${pageRange.count}`,
        pageLeft + contentWidth * 0.75,
        footerY,
        { width: contentWidth * 0.25, align: 'right', lineBreak: false }
      );
    }

    doc.end();
  });
}

export async function generateChatReplyPdfBuffer(params: {
  title: string;
  content: string;
  createdAt?: string;
  projectName?: string;
  attachmentNames?: string[];
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 44, bottom: 48, left: 42, right: 42 },
      bufferPages: true,
      info: {
        Title: params.title || 'ALHELBAWEY — تقرير تحليلي من محاورة المنصة',
        Author: 'ALHELBAWEY AI Software Factory',
        Subject: 'Platform Chat Document Analysis Export',
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
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err) => reject(err));

    const pageLeft = doc.page.margins.left;
    const pageRight = doc.page.margins.right;
    const contentWidth = doc.page.width - pageLeft - pageRight;
    const bottomLimit = doc.page.height - doc.page.margins.bottom - 22;

    const ensureSpace = (neededHeight: number) => {
      if (doc.y + neededHeight > bottomLimit) {
        doc.addPage();
      }
    };

    const drawRtlText = (
      text: string,
      opts: {
        x?: number;
        width?: number;
        fontSize?: number;
        bold?: boolean;
        color?: string;
        lineGap?: number;
      } = {}
    ) => {
      const x = opts.x ?? pageLeft;
      const width = opts.width ?? contentWidth;
      const fontSize = opts.fontSize ?? 10;
      const color = opts.color ?? '#0f172a';
      const lineGap = opts.lineGap ?? 4;

      doc.font(opts.bold ? boldFont : regularFont).fontSize(fontSize).fillColor(color);
      const lines = wrapRtlLogicalLines(doc, text, width);
      for (const line of lines) {
        ensureSpace(fontSize + lineGap + 4);
        doc.text(line, x, doc.y, { width, align: 'right', lineBreak: false });
        doc.y += fontSize + lineGap;
      }
    };

    // Header Banner
    const bannerTop = doc.y;
    doc.save();
    doc.roundedRect(pageLeft, bannerTop, contentWidth, 66, 8).fill('#0f172a');
    doc.restore();

    doc
      .font(boldFont)
      .fontSize(13)
      .fillColor('#ffffff')
      .text(
        shapeAndReorderLine(params.title || 'تقرير ومخرجات المحاورة التحليلية — منصة الهلباوي'),
        pageLeft + 14,
        bannerTop + 13,
        { width: contentWidth - 28, align: 'right', lineBreak: false }
      );

    const metaParts = [
      params.projectName ? `المشروع: ${params.projectName}` : 'منصة الهلباوي (ALHELBAWEY)',
      params.createdAt
        ? `التاريخ: ${new Date(params.createdAt).toLocaleString('ar-EG')}`
        : `التاريخ: ${new Date().toLocaleString('ar-EG')}`,
    ];
    doc
      .font(regularFont)
      .fontSize(8.5)
      .fillColor('#cbd5e1')
      .text(shapeAndReorderLine(metaParts.join('  |  ')), pageLeft + 14, bannerTop + 37, {
        width: contentWidth - 28,
        align: 'right',
        lineBreak: false,
      });

    doc.y = bannerTop + 76;

    if (params.attachmentNames && params.attachmentNames.length > 0) {
      ensureSpace(26);
      drawRtlText(`المستندات المرفقة في التحليل: ${params.attachmentNames.join('، ')}`, {
        fontSize: 8.5,
        bold: true,
        color: '#0f766e',
        lineGap: 3,
      });
      doc.y += 4;
    }

    // Parse markdown content line-by-line into clean RTL PDF blocks
    const rawLines = (params.content || '').replace(/\r\n/g, '\n').split('\n');
    let inCodeBlock = false;

    const stripMdInline = (s: string) =>
      s
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .trim();

    for (const rawLine of rawLines) {
      const trimmed = rawLine.trim();

      if (trimmed.startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        doc.y += 3;
        continue;
      }

      if (inCodeBlock) {
        ensureSpace(14);
        doc
          .font(monoFont)
          .fontSize(8.2)
          .fillColor('#1e293b')
          .text(rawLine || ' ', pageLeft + 8, doc.y, {
            width: contentWidth - 16,
            align: 'left',
          });
        doc.y += 2;
        continue;
      }

      if (!trimmed) {
        doc.y += 5;
        continue;
      }

      // Skip markdown table divider rows like | --- | --- |
      if (/^\|[\s:-]+\|/.test(trimmed) && !/[a-zA-Z0-9\u0600-\u06FF]/.test(trimmed)) {
        continue;
      }

      if (trimmed.startsWith('### ')) {
        doc.y += 4;
        drawRtlText(stripMdInline(trimmed.slice(4)), {
          fontSize: 10.5,
          bold: true,
          color: '#0f172a',
          lineGap: 3,
        });
      } else if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
        doc.y += 6;
        const headingText = stripMdInline(trimmed.replace(/^#{1,3}\s+/, ''));
        drawRtlText(headingText, {
          fontSize: 11.5,
          bold: true,
          color: '#0f172a',
          lineGap: 4,
        });
        ensureSpace(4);
        doc
          .moveTo(pageLeft, doc.y)
          .lineTo(pageLeft + contentWidth, doc.y)
          .strokeColor('#e2e8f0')
          .lineWidth(0.7)
          .stroke();
        doc.y += 4;
      } else if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        const cells = trimmed
          .slice(1, -1)
          .split('|')
          .map((c) => stripMdInline(c))
          .filter(Boolean);
        drawRtlText(`▪ ${cells.join('  |  ')}`, {
          fontSize: 9,
          color: '#1e293b',
          lineGap: 3,
        });
      } else if (/^[-*•]\s+/.test(trimmed)) {
        drawRtlText(`• ${stripMdInline(trimmed.replace(/^[-*•]\s+/, ''))}`, {
          fontSize: 9.5,
          color: '#1e293b',
          lineGap: 3.5,
        });
      } else if (/^\d+[.)]\s+/.test(trimmed)) {
        drawRtlText(stripMdInline(trimmed), {
          fontSize: 9.5,
          color: '#1e293b',
          lineGap: 3.5,
        });
      } else {
        drawRtlText(stripMdInline(trimmed), {
          fontSize: 9.5,
          color: '#0f172a',
          lineGap: 3.5,
        });
      }
    }

    const pageRange = doc.bufferedPageRange();
    for (let i = 0; i < pageRange.count; i++) {
      doc.switchToPage(i);
      const footerY = doc.page.height - doc.page.margins.bottom + 8;
      doc
        .font(monoFont)
        .fontSize(7.5)
        .fillColor('#64748b')
        .text('ALHELBAWEY Platform Chat Export', pageLeft, footerY, {
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

