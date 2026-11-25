import crypto from 'node:crypto';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  ChatAttachmentMeta,
  HelbaweyBootstrap,
  IroncladMemoryCategory,
  IroncladMemoryItem,
  PlatformChatMessage,
} from '../src/types/helbawey.ts';
import { loadStore, saveStore } from './store.ts';

export const RECENT_VERBATIM_WINDOW = 36;
export const MAX_PERSISTED_CHAT_HISTORY = 400;

export function normalizeArabicAndTextForSearch(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeQuery(input: string): string[] {
  const norm = normalizeArabicAndTextForSearch(input);
  return Array.from(new Set(norm.split(' ').filter((w) => w.length >= 2)));
}

function scoreMatch(tokens: string[], targetText: string): number {
  if (tokens.length === 0) return 0;
  const normTarget = normalizeArabicAndTextForSearch(targetText);
  if (!normTarget) return 0;
  let score = 0;
  for (const tok of tokens) {
    if (normTarget.includes(tok)) {
      score += tok.length >= 5 ? 3 : 2;
    }
  }
  return score;
}

export function recallRelevantIroncladMemory(params: {
  store: HelbaweyBootstrap;
  query: string;
  activeProjectId?: string;
}): {
  pinnedItems: IroncladMemoryItem[];
  recalledItems: IroncladMemoryItem[];
  glossaryItems: IroncladMemoryItem[];
  archivedHistoryHits: { turnIndex: number; role: string; createdAt: string; excerpt: string }[];
  archiveSummary: string;
} {
  const allMemory = Array.isArray(params.store.platformChatMemory)
    ? params.store.platformChatMemory
    : [];
  const tokens = tokenizeQuery(params.query);

  const pinnedItems = allMemory.filter((m) => m.pinned);
  const glossaryItems = allMemory.filter((m) => m.category === 'glossary-term');

  const nonPinned = allMemory
    .filter((m) => !m.pinned)
    .map((item) => {
      const lexical = scoreMatch(
        tokens,
        `${item.title} ${item.content} ${item.tags.join(' ')}`
      );
      const projectBoost =
        params.activeProjectId && item.projectId === params.activeProjectId ? 2 : 0;
      const categoryBoost = item.category === 'document-digest' || item.category === 'legal-case' ? 1 : 0;
      const ageHours = Math.max(
        0,
        (Date.now() - new Date(item.updatedAt).getTime()) / (1000 * 60 * 60)
      );
      const recencyBoost = ageHours < 24 ? 2 : ageHours < 168 ? 1 : 0;
      return {
        item,
        totalScore: lexical * 3 + projectBoost + categoryBoost + recencyBoost,
      };
    })
    .sort((a, b) => b.totalScore - a.totalScore);

  const recalledItems = nonPinned.slice(0, 18).map((entry) => entry.item);

  // Also search older conversation turns beyond the immediate verbatim window
  const history = Array.isArray(params.store.platformChatHistory)
    ? params.store.platformChatHistory
    : [];
  const olderTurns =
    history.length > RECENT_VERBATIM_WINDOW
      ? history.slice(0, history.length - RECENT_VERBATIM_WINDOW)
      : [];

  const archivedHistoryHits = olderTurns
    .map((msg, idx) => {
      const attText = (msg.attachments || [])
        .map((a) => `${a.name} ${a.summaryNoteAr || ''} ${a.extractedText || ''}`)
        .join(' ');
      const s = scoreMatch(tokens, `${msg.content} ${attText}`);
      return { msg, idx, score: s };
    })
    .filter((hit) => hit.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((hit) => ({
      turnIndex: hit.idx + 1,
      role: hit.msg.role === 'user' ? 'المستخدم' : 'المحاور',
      createdAt: hit.msg.createdAt,
      excerpt: hit.msg.content.slice(0, 420),
    }));

  return {
    pinnedItems,
    recalledItems,
    glossaryItems,
    archivedHistoryHits,
    archiveSummary: params.store.platformChatMemoryArchiveSummary || '',
  };
}

export function buildIroncladMemoryPromptSection(params: {
  store: HelbaweyBootstrap;
  query: string;
  activeProjectId?: string;
}): { sectionText: string; glossaryItems: IroncladMemoryItem[]; injectedCount: number } {
  const { pinnedItems, recalledItems, glossaryItems, archivedHistoryHits, archiveSummary } =
    recallRelevantIroncladMemory(params);

  if (
    pinnedItems.length === 0 &&
    recalledItems.length === 0 &&
    archivedHistoryHits.length === 0 &&
    !archiveSummary
  ) {
    return {
      sectionText: [
        '',
        '=== الذاكرة الحديدية الدائمة (Ironclad Persistent Memory) ===',
        'الذاكرة الدائمة نشطة وجاهزة لحفظ أي حقائق أو قضايا أو مستندات أو مصطلحات ترجمة يذكرها المستخدم تلقائياً عبر الجلسات.',
      ].join('\n'),
      glossaryItems,
      injectedCount: 0,
    };
  }

  const lines: string[] = [
    '',
    '=== الذاكرة الحديدية الدائمة (Ironclad Persistent Memory — عبر الجلسات) ===',
    'التزم بهذه الحقائق والقواعد والمستندات والمصطلحات المسترجعة من الذاكرة الحديدية الدائمة باعتبارها سياقاً موثقاً ومستمراً من جلسات سابقة (حتى لو بدأ المستخدم محادثة جديدة):',
  ];

  if (pinnedItems.length > 0) {
    lines.push('1. القواعد والحقائق المثبتة إلزامياً (Pinned Memory):');
    for (const item of pinnedItems) {
      lines.push(`   - [${item.category}] ${item.title}: ${item.content}`);
    }
  }

  if (recalledItems.length > 0) {
    lines.push('2. الحقائق والقضايا والمستندات المسترجعة ذات الصلة:');
    for (const item of recalledItems) {
      lines.push(`   - [${item.category}] ${item.title}: ${item.content}`);
    }
  }

  if (archivedHistoryHits.length > 0) {
    lines.push('3. مقتطفات مسترجعة من أرشيف الرسائل الأقدم:');
    for (const hit of archivedHistoryHits) {
      lines.push(`   - [رسالة #${hit.turnIndex} - ${hit.role}]: ${hit.excerpt}`);
    }
  }

  if (archiveSummary.trim()) {
    lines.push('4. ملخص الأرشيف التاريخي المضغوط:');
    lines.push(`   ${archiveSummary.trim()}`);
  }

  return {
    sectionText: lines.join('\n'),
    glossaryItems,
    injectedCount: pinnedItems.length + recalledItems.length + archivedHistoryHits.length,
  };
}

export function upsertMemoryItemInList(
  list: IroncladMemoryItem[],
  candidate: {
    category: IroncladMemoryCategory;
    title: string;
    content: string;
    tags?: string[];
    pinned?: boolean;
    sourceType: IroncladMemoryItem['sourceType'];
    projectId?: string;
  }
): IroncladMemoryItem[] {
  const cleanTitle = candidate.title.trim().slice(0, 140);
  const cleanContent = candidate.content.trim().slice(0, 900);
  if (!cleanTitle || !cleanContent) return list;

  const normTitle = normalizeArabicAndTextForSearch(cleanTitle);
  const now = new Date().toISOString();
  const next = [...list];

  const existingIdx = next.findIndex(
    (m) =>
      m.category === candidate.category &&
      normalizeArabicAndTextForSearch(m.title) === normTitle
  );

  if (existingIdx >= 0) {
    const existing = next[existingIdx];
    next[existingIdx] = {
      ...existing,
      content: cleanContent,
      tags: Array.from(new Set([...(existing.tags || []), ...(candidate.tags || [])])).slice(0, 8),
      pinned: candidate.pinned !== undefined ? candidate.pinned : existing.pinned,
      updatedAt: now,
      recallCount: existing.recallCount + 1,
    };
  } else {
    next.unshift({
      id: `mem-${crypto.randomUUID().slice(0, 8)}`,
      category: candidate.category,
      title: cleanTitle,
      content: cleanContent,
      tags: (candidate.tags || []).slice(0, 8),
      pinned: Boolean(candidate.pinned),
      sourceType: candidate.sourceType,
      projectId: candidate.projectId,
      createdAt: now,
      updatedAt: now,
      recallCount: 0,
    });
  }

  // Cap total items at 250 while never evicting pinned items
  const pinned = next.filter((m) => m.pinned);
  const unpinned = next.filter((m) => !m.pinned).slice(0, Math.max(0, 250 - pinned.length));
  return [...pinned, ...unpinned];
}

export function indexDocumentAttachmentsIntoMemory(
  store: HelbaweyBootstrap,
  attachments: ChatAttachmentMeta[],
  projectId?: string
): number {
  if (!attachments || attachments.length === 0) return 0;
  let memory = Array.isArray(store.platformChatMemory) ? [...store.platformChatMemory] : [];
  let added = 0;
  for (const att of attachments) {
    const snippet = att.extractedText
      ? att.extractedText.replace(/\s+/g, ' ').trim().slice(0, 380)
      : att.summaryNoteAr || `${att.kind} (${att.sizeBytes} bytes)`;
    memory = upsertMemoryItemInList(memory, {
      category: 'document-digest',
      title: `مستند مرفق: ${att.name}`,
      content: `النوع: ${att.kind} · الحجم: ${att.sizeBytes} بايت · خلاصة المحتوى: ${snippet}`,
      tags: [att.kind, att.name],
      pinned: false,
      sourceType: 'document',
      projectId,
    });
    added += 1;
  }
  store.platformChatMemory = memory;
  return added;
}

export function foldOverflowHistoryIntoArchive(store: HelbaweyBootstrap): void {
  const history = Array.isArray(store.platformChatHistory) ? store.platformChatHistory : [];
  if (history.length <= MAX_PERSISTED_CHAT_HISTORY) return;

  const overflowCount = history.length - MAX_PERSISTED_CHAT_HISTORY;
  const dropped = history.slice(0, overflowCount);
  store.platformChatHistory = history.slice(overflowCount);

  const foldedNotes = dropped
    .filter((m) => m.role === 'user' && m.content.trim())
    .slice(-12)
    .map((m) => `- ${m.content.replace(/\s+/g, ' ').trim().slice(0, 140)}`)
    .join('\n');

  if (foldedNotes) {
    const prev = store.platformChatMemoryArchiveSummary || '';
    store.platformChatMemoryArchiveSummary = `${prev}\n${foldedNotes}`.trim().slice(-2800);
  }
}

export async function extractAndMergeIroncladMemory(params: {
  userMessage: string;
  assistantReply: string;
  projectId?: string;
}): Promise<void> {
  const userText = params.userMessage.trim();
  const replyText = params.assistantReply.trim();
  if (!userText && !replyText) return;

  // Deterministic rule capture if user explicitly asks to remember/pin something
  const explicitPinMatch = userText.match(
    /(?:تذكر(?:\s+دائماً)?|احفظ(?:\s+في\s+الذاكرة)?|قاعدة\s+ثابتة|remember\s+always)[:：\s]+([^\n]+)/i
  );

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    if (explicitPinMatch?.[1]) {
      const store = loadStore();
      store.platformChatMemory = upsertMemoryItemInList(store.platformChatMemory || [], {
        category: 'user-rule',
        title: `قاعدة مثبتة (${new Date().toLocaleDateString('ar-EG')})`,
        content: explicitPinMatch[1].trim(),
        tags: ['pinned', 'user-rule'],
        pinned: true,
        sourceType: 'user-pinned',
        projectId: params.projectId,
      });
      saveStore(store);
    }
    return;
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: [
        'استخرج فقط الحقائق الدائمة الجديدة أو القضايا/الأطراف القانونية أو القرارات أو مصطلحات الترجمة المعتمدة أو قواعد المستخدم من هذا الحوار.',
        'لا تخترع أي معلومة غير واردة في النص، وإذا كان الحوار مجرد تحية عابرة فأعد مصفوفة فارغة [].',
        `رسالة المستخدم: ${userText.slice(0, 2400)}`,
        `رد المحاور: ${replyText.slice(0, 2800)}`,
      ].join('\n\n'),
      config: {
        systemInstruction:
          'أنت محلل ذاكرة حديدية دقيقة. استخرج نقاطاً موجزة ومفيدة جداً عبر الجلسات بصيغة JSON فقط دون تكرار.',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              category: {
                type: Type.STRING,
                description:
                  'One of: fact-entity, legal-case, glossary-term, user-rule, decision',
              },
              title: { type: Type.STRING, description: 'Short descriptive title (<= 80 chars)' },
              content: { type: Type.STRING, description: 'Concise factual detail (<= 300 chars)' },
              tags: { type: Type.ARRAY, items: { type: Type.STRING } },
              shouldPin: {
                type: Type.BOOLEAN,
                description:
                  'True only when user explicitly asked to remember/always follow a rule or glossary term',
              },
            },
          },
        },
      },
    });

    const rawJson = (response.text ?? '[]').trim();
    const extracted = JSON.parse(rawJson) as {
      category?: string;
      title?: string;
      content?: string;
      tags?: string[];
      shouldPin?: boolean;
    }[];

    if (!Array.isArray(extracted) && !explicitPinMatch?.[1]) return;

    const validCats = new Set<IroncladMemoryCategory>([
      'fact-entity',
      'legal-case',
      'glossary-term',
      'user-rule',
      'decision',
    ]);

    const store = loadStore();
    let memory = Array.isArray(store.platformChatMemory) ? [...store.platformChatMemory] : [];

    if (explicitPinMatch?.[1]) {
      memory = upsertMemoryItemInList(memory, {
        category: 'user-rule',
        title: explicitPinMatch[1].trim().slice(0, 75),
        content: explicitPinMatch[1].trim(),
        tags: ['user-rule'],
        pinned: true,
        sourceType: 'user-pinned',
        projectId: params.projectId,
      });
    }

    if (Array.isArray(extracted)) {
      for (const item of extracted.slice(0, 5)) {
        if (!item?.title || !item?.content) continue;
        const cat: IroncladMemoryCategory = validCats.has(item.category as IroncladMemoryCategory)
          ? (item.category as IroncladMemoryCategory)
          : 'fact-entity';
        memory = upsertMemoryItemInList(memory, {
          category: cat,
          title: item.title,
          content: item.content,
          tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
          pinned: Boolean(item.shouldPin),
          sourceType: item.shouldPin ? 'user-pinned' : 'auto-extracted',
          projectId: params.projectId,
        });
      }
    }

    store.platformChatMemory = memory;
    saveStore(store);
  } catch {
    // Non-fatal background memory extraction; deterministic pin still persists if matched
    if (explicitPinMatch?.[1]) {
      const store = loadStore();
      store.platformChatMemory = upsertMemoryItemInList(store.platformChatMemory || [], {
        category: 'user-rule',
        title: explicitPinMatch[1].trim().slice(0, 75),
        content: explicitPinMatch[1].trim(),
        tags: ['user-rule'],
        pinned: true,
        sourceType: 'user-pinned',
        projectId: params.projectId,
      });
      saveStore(store);
    }
  }
}

export function createManualMemoryItem(params: {
  category: IroncladMemoryCategory;
  title: string;
  content: string;
  tags?: string[];
  pinned?: boolean;
  projectId?: string;
}): IroncladMemoryItem[] {
  const store = loadStore();
  const next = upsertMemoryItemInList(store.platformChatMemory || [], {
    category: params.category,
    title: params.title,
    content: params.content,
    tags: params.tags || [],
    pinned: params.pinned ?? true,
    sourceType: 'user-pinned',
    projectId: params.projectId,
  });
  store.platformChatMemory = next;
  saveStore(store);
  return next;
}
