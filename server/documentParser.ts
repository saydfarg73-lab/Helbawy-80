import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Part } from '@google/genai';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import type { ChatAttachmentMeta } from '../src/types/helbawey.ts';

export const CHAT_ATTACHMENTS_DIR = path.resolve(process.cwd(), 'data', 'chat-attachments');
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15 MB
const MAX_EXTRACTED_CHARS = 36_000;

export interface IncomingAttachmentPayload {
  name: string;
  mimeType?: string;
  base64Data: string;
  sizeBytes?: number;
}

function ensureAttachmentsDir(): void {
  if (!fs.existsSync(CHAT_ATTACHMENTS_DIR)) {
    fs.mkdirSync(CHAT_ATTACHMENTS_DIR, { recursive: true });
  }
}

export function clearChatAttachmentFiles(): void {
  if (!fs.existsSync(CHAT_ATTACHMENTS_DIR)) return;
  for (const entry of fs.readdirSync(CHAT_ATTACHMENTS_DIR)) {
    const full = path.resolve(CHAT_ATTACHMENTS_DIR, entry);
    if (full.startsWith(CHAT_ATTACHMENTS_DIR + path.sep)) {
      try {
        fs.unlinkSync(full);
      } catch {
        // ignore cleanup failure on individual file
      }
    }
  }
}

function sanitizeFileName(rawName: string): string {
  const base = path.basename(rawName || 'document').trim();
  const cleaned = base.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
  return cleaned || 'document';
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function decodeTextBuffer(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le');
  }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf8');
  }
  const utf8 = buffer.toString('utf8');
  const replacementCount = (utf8.match(/\uFFFD/g) || []).length;
  if (replacementCount > Math.max(3, utf8.length * 0.02)) {
    try {
      return new TextDecoder('windows-1256').decode(buffer);
    } catch {
      return utf8;
    }
  }
  return utf8;
}

function truncateText(text: string, maxChars = MAX_EXTRACTED_CHARS): { text: string; truncated: boolean } {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (normalized.length <= maxChars) {
    return { text: normalized, truncated: false };
  }
  return {
    text: `${normalized.slice(0, maxChars)}\n\n[... تم اقتطاع بقية المحتوى عند ${maxChars.toLocaleString('en-US')} حرف للحفاظ على سرعة التحليل ...]`,
    truncated: true,
  };
}

function htmlTablesToReadableText(html: string): string {
  const withTables = html.replace(/<table[\s\S]*?<\/table>/gi, (tableHtml) => {
    const rows: string[][] = [];
    const trMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    for (const tr of trMatches) {
      const cells: string[] = [];
      const cellMatches = tr.match(/<t[hd][\s\S]*?<\/t[hd]>/gi) || [];
      for (const cell of cellMatches) {
        const plain = decodeXmlEntities(cell.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
        cells.push(plain.replace(/\|/g, '\\|'));
      }
      if (cells.length > 0) rows.push(cells);
    }
    if (rows.length === 0) return '';
    const colCount = Math.max(...rows.map((r) => r.length));
    const lines = rows.map((row, idx) => {
      const padded = Array.from({ length: colCount }, (_, i) => row[i] || '');
      const line = `| ${padded.join(' | ')} |`;
      if (idx === 0) {
        return `${line}\n| ${Array.from({ length: colCount }, () => '---').join(' | ')} |`;
      }
      return line;
    });
    return `\n\n${lines.join('\n')}\n\n`;
  });

  return decodeXmlEntities(
    withTables
      .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function parseDocxBuffer(buffer: Buffer): Promise<{ text: string; noteAr: string }> {
  const htmlResult = await mammoth.convertToHtml({ buffer });
  let mainText = htmlTablesToReadableText(htmlResult.value || '');
  if (!mainText) {
    const rawResult = await mammoth.extractRawText({ buffer });
    mainText = (rawResult.value || '').trim();
  }

  // Also check headers/footers inside docx zip
  const extraParts: string[] = [];
  try {
    const zip = await JSZip.loadAsync(buffer);
    const headerFooterFiles = Object.keys(zip.files)
      .filter((name) => /^word\/(header|footer)\d*\.xml$/i.test(name))
      .sort();
    for (const hf of headerFooterFiles) {
      const xml = await zip.files[hf].async('string');
      const extracted = decodeXmlEntities(
        xml
          .replace(/<\/w:p>/g, '\n')
          .replace(/<[^>]+>/g, ' ')
          .replace(/[ \t]+/g, ' ')
      ).trim();
      if (extracted) {
        extraParts.push(`[${path.basename(hf)}]: ${extracted}`);
      }
    }
  } catch {
    // ignore zip header/footer inspection errors
  }

  const combined = extraParts.length > 0 ? `${extraParts.join('\n')}\n\n${mainText}` : mainText;
  const wordCount = combined ? combined.split(/\s+/).length : 0;
  return {
    text: combined || '(مستند Word فارغ أو يحتوي على صور فقط)',
    noteAr: `مستند Word · نحو ${wordCount.toLocaleString('en-US')} كلمة`,
  };
}

function parseLegacyDocBinary(buffer: Buffer): { text: string; noteAr: string } {
  const utf16Runs = buffer
    .toString('utf16le')
    .match(/[\u0600-\u06FF\u0020-\u007E\r\n]{6,}/g);
  const candidate = (utf16Runs || [])
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (candidate.length > 40) {
    return {
      text: candidate,
      noteAr: 'مستند DOC قديم (استخراج نصي)',
    };
  }
  return {
    text: 'تنبيه: هذا الملف بصيغة Word القديمة الثنائية (.doc) أو مشفر ولا يحتوي على نص مقروء مباشر. يُنصح بحفظه بصيغة .docx أو .pdf لتحليل كامل أدق.',
    noteAr: 'ملف DOC ثنائي قديم',
  };
}

function parseSpreadsheetBuffer(buffer: Buffer, ext: string): { text: string; noteAr: string } {
  let workbook: XLSX.WorkBook;
  if (ext === '.csv' || ext === '.tsv') {
    const decoded = decodeTextBuffer(buffer);
    workbook = XLSX.read(decoded, {
      type: 'string',
      FS: ext === '.tsv' ? '\t' : undefined,
      cellDates: true,
    });
  } else {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  }

  const sections: string[] = [];
  let totalRows = 0;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<(string | number | boolean | Date | null)[]>(sheet, {
      header: 1,
      defval: '',
      raw: false,
    });
    const nonEmptyRows = rows.filter((r) => r.some((cell) => String(cell ?? '').trim() !== ''));
    totalRows += nonEmptyRows.length;

    if (nonEmptyRows.length === 0) {
      sections.push(`### ورقة العمل: ${sheetName}\n(ورقة فارغة)`);
      continue;
    }

    const maxCols = Math.min(30, Math.max(...nonEmptyRows.map((r) => r.length), 1));
    const maxRowsPreview = Math.min(nonEmptyRows.length, 400);
    const mdLines: string[] = [];
    for (let r = 0; r < maxRowsPreview; r++) {
      const row = nonEmptyRows[r];
      const cells = Array.from({ length: maxCols }, (_, c) =>
        String(row[c] ?? '')
          .replace(/\r?\n/g, ' ')
          .replace(/\|/g, '\\|')
          .trim()
      );
      mdLines.push(`| ${cells.join(' | ')} |`);
      if (r === 0) {
        mdLines.push(`| ${Array.from({ length: maxCols }, () => '---').join(' | ')} |`);
      }
    }
    if (nonEmptyRows.length > maxRowsPreview) {
      mdLines.push(`\n[... عرض أول ${maxRowsPreview} صف من أصل ${nonEmptyRows.length} صف في ورقة "${sheetName}" ...]`);
    }

    sections.push(
      `### ورقة العمل: ${sheetName} (${nonEmptyRows.length} صف × ${maxCols} عمود)\n${mdLines.join('\n')}`
    );
  }

  return {
    text: sections.join('\n\n') || '(ملف جدول بيانات فارغ)',
    noteAr: `${workbook.SheetNames.length} ورقة عمل · ${totalRows.toLocaleString('en-US')} صف`,
  };
}

async function parsePptxBuffer(buffer: Buffer): Promise<{ text: string; noteAr: string }> {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml/i)?.[1] || 0);
      const nb = Number(b.match(/slide(\d+)\.xml/i)?.[1] || 0);
      return na - nb;
    });

  const slidesText: string[] = [];
  for (const slideFile of slideFiles) {
    const slideNum = slideFile.match(/slide(\d+)\.xml/i)?.[1] || '?';
    const xml = await zip.files[slideFile].async('string');
    const paragraphs = xml.split(/<\/a:p>/i).map((p) => {
      const runs = Array.from(p.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/gi)).map((m) =>
        decodeXmlEntities(m[1])
      );
      return runs.join('').trim();
    });
    const body = paragraphs.filter(Boolean).join('\n');

    const notesPath = `ppt/notesSlides/notesSlide${slideNum}.xml`;
    let notesBody = '';
    if (zip.files[notesPath]) {
      const notesXml = await zip.files[notesPath].async('string');
      const notesRuns = Array.from(notesXml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/gi)).map((m) =>
        decodeXmlEntities(m[1])
      );
      notesBody = notesRuns.join(' ').trim();
    }

    slidesText.push(
      `## الشريحة ${slideNum}\n${body || '(شريحة بدون نص)'}${notesBody ? `\nملاحظات المحاضر: ${notesBody}` : ''}`
    );
  }

  return {
    text: slidesText.join('\n\n') || '(عرض تقديمي بدون نصوص)',
    noteAr: `عرض تقديمي · ${slideFiles.length} شريحة`,
  };
}

async function parseOpenDocBuffer(buffer: Buffer, ext: string): Promise<{ text: string; noteAr: string }> {
  const zip = await JSZip.loadAsync(buffer);
  const contentFile = zip.files['content.xml'];
  if (!contentFile) {
    return { text: '(مستند OpenDocument فارغ)', noteAr: `ملف ${ext}` };
  }
  const xml = await contentFile.async('string');
  const plain = decodeXmlEntities(
    xml
      .replace(/<\/(text:p|text:h|table:table-row)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
  ).trim();
  return {
    text: plain || '(مستند بدون نص)',
    noteAr: `مستند OpenDocument (${ext})`,
  };
}

function parseRtfBuffer(buffer: Buffer): { text: string; noteAr: string } {
  const raw = buffer.toString('latin1');
  // Decode RTF Unicode escapes \uN? and hex \'xx using windows-1256 for Arabic RTF
  let out = raw
    .replace(/\\par\b/g, '\n')
    .replace(/\\line\b/g, '\n')
    .replace(/\\tab\b/g, '\t')
    .replace(/\\u(-?\d+)\??/g, (_, code) => {
      const n = Number(code);
      const cp = n < 0 ? 65536 + n : n;
      return String.fromCharCode(cp);
    });

  // Decode consecutive \'xx bytes via windows-1256
  out = out.replace(/(?:\\'[0-9a-fA-F]{2})+/g, (seq) => {
    const bytes = (seq.match(/[0-9a-fA-F]{2}/g) || []).map((h) => parseInt(h, 16));
    try {
      return new TextDecoder('windows-1256').decode(Uint8Array.from(bytes));
    } catch {
      return Buffer.from(bytes).toString('utf8');
    }
  });

  // Strip RTF header/control words and braces
  out = out
    .replace(/\{\\\*\\[^}]+\}/g, '')
    .replace(/\\[a-zA-Z]+-?\d* ?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { text: out || '(مستند RTF فارغ)', noteAr: 'مستند RTF' };
}

function normalizeImageMime(ext: string, rawMime: string): string | null {
  const supported = new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
  ]);
  if (supported.has(rawMime)) return rawMime;
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.heic') return 'image/heic';
  if (ext === '.heif') return 'image/heif';
  return null;
}

function normalizeAudioVideoMime(ext: string, rawMime: string): { kind: 'audio' | 'video'; mime: string } | null {
  const audioMap: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.aac': 'audio/aac',
    '.flac': 'audio/flac',
    '.m4a': 'audio/mp4',
  };
  const videoMap: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
  };
  if (audioMap[ext]) return { kind: 'audio', mime: audioMap[ext] };
  if (videoMap[ext]) return { kind: 'video', mime: videoMap[ext] };
  if (rawMime === 'audio/x-m4a') return { kind: 'audio', mime: 'audio/mp4' };
  if (rawMime.startsWith('audio/')) return { kind: 'audio', mime: rawMime };
  if (rawMime.startsWith('video/')) return { kind: 'video', mime: rawMime };
  return null;
}

export async function processUploadedChatAttachments(
  payloads: IncomingAttachmentPayload[]
): Promise<ChatAttachmentMeta[]> {
  if (!Array.isArray(payloads) || payloads.length === 0) return [];
  if (payloads.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    throw new Error(`الحد الأقصى للمرفقات في الرسالة الواحدة هو ${MAX_ATTACHMENTS_PER_MESSAGE} ملفات.`);
  }

  ensureAttachmentsDir();
  const processed: ChatAttachmentMeta[] = [];

  for (const item of payloads) {
    const safeName = sanitizeFileName(item.name);
    const ext = path.extname(safeName).toLowerCase();
    const rawMime = String(item.mimeType || '').toLowerCase().trim();
    const rawB64 = String(item.base64Data || '').replace(/^data:[^;]+;base64,/, '').trim();
    if (!rawB64) {
      throw new Error(`الملف "${safeName}" فارغ أو غير صالح.`);
    }

    const buffer = Buffer.from(rawB64, 'base64');
    if (buffer.length === 0) {
      throw new Error(`تعذر فك ترميز الملف "${safeName}".`);
    }
    if (buffer.length > MAX_ATTACHMENT_BYTES) {
      throw new Error(
        `حجم الملف "${safeName}" (${(buffer.length / (1024 * 1024)).toFixed(1)} MB) يتجاوز الحد المسموح (15 MB).`
      );
    }

    const id = `att-${crypto.randomUUID().slice(0, 8)}`;

    // 1. PDF (Native Gemini multimodal understanding: layouts, Arabic/English, scans, charts)
    if (ext === '.pdf' || rawMime === 'application/pdf') {
      const storageFileName = `${id}-${safeName}`;
      fs.writeFileSync(path.resolve(CHAT_ATTACHMENTS_DIR, storageFileName), buffer);
      processed.push({
        id,
        name: safeName,
        mimeType: 'application/pdf',
        sizeBytes: buffer.length,
        kind: 'pdf',
        parseStrategy: 'multimodal-inline',
        storageFileName,
        summaryNoteAr: 'ملف PDF (قراءة بصرية ونصية كاملة)',
      });
      continue;
    }

    // 2. Raster Images (OCR, invoices, diagrams, UI screenshots)
    const imgMime = ext === '.svg' ? null : normalizeImageMime(ext, rawMime);
    if (imgMime) {
      const storageFileName = `${id}-${safeName}`;
      fs.writeFileSync(path.resolve(CHAT_ATTACHMENTS_DIR, storageFileName), buffer);
      processed.push({
        id,
        name: safeName,
        mimeType: imgMime,
        sizeBytes: buffer.length,
        kind: 'image',
        parseStrategy: 'multimodal-inline',
        storageFileName,
        summaryNoteAr: 'صورة / مستند مصور (OCR وتحليل بصري)',
      });
      continue;
    }

    // 3. Audio / Video
    const av = normalizeAudioVideoMime(ext, rawMime);
    if (av) {
      const storageFileName = `${id}-${safeName}`;
      fs.writeFileSync(path.resolve(CHAT_ATTACHMENTS_DIR, storageFileName), buffer);
      processed.push({
        id,
        name: safeName,
        mimeType: av.mime,
        sizeBytes: buffer.length,
        kind: av.kind,
        parseStrategy: 'multimodal-inline',
        storageFileName,
        summaryNoteAr: av.kind === 'audio' ? 'ملف صوتي (تفريغ وتحليل)' : 'ملف فيديو (تحليل سمعي وبصري)',
      });
      continue;
    }

    // 4. Word (.docx / .doc)
    if (
      ext === '.docx' ||
      rawMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      const parsed = await parseDocxBuffer(buffer);
      const { text } = truncateText(parsed.text);
      processed.push({
        id,
        name: safeName,
        mimeType: rawMime || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: buffer.length,
        kind: 'word',
        parseStrategy: 'extracted-text',
        extractedText: text,
        summaryNoteAr: parsed.noteAr,
      });
      continue;
    }

    if (ext === '.doc' || rawMime === 'application/msword') {
      const parsed = parseLegacyDocBinary(buffer);
      const { text } = truncateText(parsed.text);
      processed.push({
        id,
        name: safeName,
        mimeType: rawMime || 'application/msword',
        sizeBytes: buffer.length,
        kind: 'word',
        parseStrategy: 'extracted-text',
        extractedText: text,
        summaryNoteAr: parsed.noteAr,
      });
      continue;
    }

    // 5. Excel & Spreadsheets (.xlsx, .xls, .xlsm, .xlsb, .ods, .csv, .tsv)
    if (
      ['.xlsx', '.xls', '.xlsm', '.xlsb', '.ods', '.csv', '.tsv'].includes(ext) ||
      rawMime.includes('spreadsheet') ||
      rawMime.includes('excel') ||
      rawMime === 'text/csv'
    ) {
      const parsed = parseSpreadsheetBuffer(buffer, ext);
      const { text } = truncateText(parsed.text);
      processed.push({
        id,
        name: safeName,
        mimeType: rawMime || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: buffer.length,
        kind: 'excel',
        parseStrategy: 'extracted-text',
        extractedText: text,
        summaryNoteAr: parsed.noteAr,
      });
      continue;
    }

    // 6. PowerPoint (.pptx) & OpenDocument (.odt, .odp)
    if (
      ext === '.pptx' ||
      rawMime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ) {
      const parsed = await parsePptxBuffer(buffer);
      const { text } = truncateText(parsed.text);
      processed.push({
        id,
        name: safeName,
        mimeType: rawMime || 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        sizeBytes: buffer.length,
        kind: 'presentation',
        parseStrategy: 'extracted-text',
        extractedText: text,
        summaryNoteAr: parsed.noteAr,
      });
      continue;
    }

    if (ext === '.odt' || ext === '.odp') {
      const parsed = await parseOpenDocBuffer(buffer, ext);
      const { text } = truncateText(parsed.text);
      processed.push({
        id,
        name: safeName,
        mimeType: rawMime || 'application/vnd.oasis.opendocument.text',
        sizeBytes: buffer.length,
        kind: ext === '.odp' ? 'presentation' : 'word',
        parseStrategy: 'extracted-text',
        extractedText: text,
        summaryNoteAr: parsed.noteAr,
      });
      continue;
    }

    // 7. RTF
    if (ext === '.rtf' || rawMime === 'application/rtf' || rawMime === 'text/rtf') {
      const parsed = parseRtfBuffer(buffer);
      const { text } = truncateText(parsed.text);
      processed.push({
        id,
        name: safeName,
        mimeType: rawMime || 'application/rtf',
        sizeBytes: buffer.length,
        kind: 'text',
        parseStrategy: 'extracted-text',
        extractedText: text,
        summaryNoteAr: parsed.noteAr,
      });
      continue;
    }

    // 8. HTML / Plain text / Markdown / JSON / XML / YAML / SQL / Code / Logs
    const textExtensions = new Set([
      '.txt', '.md', '.markdown', '.json', '.jsonl', '.xml', '.yaml', '.yml',
      '.html', '.htm', '.css', '.scss', '.sql', '.ts', '.tsx', '.js', '.jsx',
      '.mjs', '.cjs', '.py', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.go',
      '.rs', '.php', '.rb', '.sh', '.bash', '.ps1', '.ini', '.conf', '.cfg',
      '.env', '.log', '.svg', '.tex',
    ]);

    const looksTextual =
      textExtensions.has(ext) ||
      rawMime.startsWith('text/') ||
      rawMime === 'application/json' ||
      rawMime === 'application/xml' ||
      rawMime === 'application/javascript' ||
      !buffer.subarray(0, 1024).includes(0);

    if (looksTextual) {
      let decoded = decodeTextBuffer(buffer);
      if (ext === '.html' || ext === '.htm') {
        const cleanedHtml = decoded
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '');
        const readable = htmlTablesToReadableText(cleanedHtml);
        decoded = readable || decoded;
      }
      const lineCount = decoded ? decoded.split('\n').length : 0;
      const { text } = truncateText(decoded);
      processed.push({
        id,
        name: safeName,
        mimeType: rawMime || 'text/plain',
        sizeBytes: buffer.length,
        kind: 'text',
        parseStrategy: 'extracted-text',
        extractedText: text,
        summaryNoteAr: `مستند نصي/برمجي (${ext || 'TEXT'}) · ${lineCount.toLocaleString('en-US')} سطر`,
      });
      continue;
    }

    throw new Error(
      `صيغة الملف "${safeName}" (${ext || rawMime || 'غير معروفة'}) غير قابلة للقراءة النصية أو البصرية المباشرة.`
    );
  }

  return processed;
}

export function buildGeminiPartsForMessage(
  content: string,
  attachments: ChatAttachmentMeta[] = [],
  options: { includeBinary?: boolean } = { includeBinary: true }
): Part[] {
  const parts: Part[] = [];
  const includeBinary = options.includeBinary !== false;

  for (const att of attachments) {
    if (att.parseStrategy === 'multimodal-inline' && att.storageFileName) {
      if (includeBinary) {
        const safeName = path.basename(att.storageFileName);
        const resolved = path.resolve(CHAT_ATTACHMENTS_DIR, safeName);
        if (resolved.startsWith(CHAT_ATTACHMENTS_DIR + path.sep) && fs.existsSync(resolved)) {
          const bytes = fs.readFileSync(resolved);
          parts.push({
            inlineData: {
              mimeType: att.mimeType,
              data: bytes.toString('base64'),
            },
          });
          parts.push({
            text: `[مرفق وسائط متعددة مُحمّل للتحليل: "${att.name}" | النوع: ${att.mimeType} | الحجم: ${(att.sizeBytes / 1024).toFixed(1)} KB]`,
          });
          continue;
        }
      }
      parts.push({
        text: `[مرجع مرفق سابق: "${att.name}" (${att.summaryNoteAr || att.mimeType})]`,
      });
      continue;
    }

    if (att.extractedText) {
      const snippet = includeBinary ? att.extractedText : att.extractedText.slice(0, 4000);
      parts.push({
        text: `=== بداية المستند المرفق: "${att.name}" (${att.summaryNoteAr || att.kind}) ===\n${snippet}\n=== نهاية المستند المرفق: "${att.name}" ===`,
      });
    }
  }

  const trimmedContent = content.trim();
  if (trimmedContent) {
    parts.push({ text: trimmedContent });
  } else if (attachments.length > 0) {
    parts.push({
      text: 'قم بقراءة وفهم وتحليل المستندات المرفقة بدقة واستخرج أهم المعلومات والنتائج والتوصيات.',
    });
  }

  return parts;
}
