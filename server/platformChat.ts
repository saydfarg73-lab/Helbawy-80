import {
  type Content,
  type GenerateContentResponse,
  GoogleGenAI,
  type Part,
  ThinkingLevel,
} from '@google/genai';
import type {
  ChatAttachmentMeta,
  HelbaweyBootstrap,
  LegalJurisdictionScope,
  PlatformBrainId,
  PlatformChatMessage,
  PlatformChatMode,
  Project,
  TranslationStyle,
} from '../src/types/helbawey.ts';
import { buildGeminiPartsForMessage } from './documentParser.ts';
import {
  buildIroncladMemoryPromptSection,
  RECENT_VERBATIM_WINDOW,
} from './ironcladMemory.ts';
import {
  buildCompactLegalAddendumForGeneralChat,
  buildLegalExpertSystemPrompt,
} from './legalExpertKnowledge.ts';
import {
  buildCompactTranslationAddendum,
  buildUniversalTranslatorPrompt,
} from './translatorProtocol.ts';
import { buildOmniAdvisorSystemPrompt } from './omniAdvisorBrain.ts';
import { buildBaselineGeminiSystemPrompt } from './brainSelector.ts';
import { queryProjectSqlFacts } from './companySqlBridge.ts';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'مفتاح GEMINI_API_KEY غير مضبوط على الخادم. يُرجى التحقق من إعداده في لوحة Settings > Secrets لتفعيل المحادثة الطبيعية.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const DOCUMENT_INTELLIGENCE_PROTOCOL = [
  '=== بروتوكول فهم وقراءة وتحليل المستندات المرفقة (Document Intelligence) ===',
  'أنت مدرَّب على قراءة وفهم وتحليل كافة أنواع المستندات المرفقة في المحادثة بدقة متناهية:',
  '1. ملفات PDF والصور والمستندات المصوّرة (OCR): اقرأ كل النصوص العربية والإنجليزية وكافة اللغات العالمية والأختام والتواريخ والجداول والرسوم البيانية والمخططات الهندسية بدقة دون تخمين أرقام غير واضحة (وإن كان جزء غير مقروء فصرّح بذلك).',
  '2. ملفات Word و RTF و OpenDocument و PowerPoint: استوعب الهيكل الإداري أو القانوني أو العرض التقديمي، واربط بين الشرائح أو البنود والتذييلات.',
  '3. ملفات الجداول والبيانات (Excel .xlsx/.xls/.ods، CSV/TSV، JSON، XML، YAML، SQL): افحص الأعمدة والصفوف وأوراق العمل، واحسب المجاميع والمقارنات والشذوذات أو القيم المفقودة، واذكر اسم ورقة العمل أو العمود أو الصف عند الاستشهاد.',
  '4. الملفات البرمجية والتقنية واللوجات: اشرح البنية المعمارية، واكتشف الأخطاء المنطقية أو الثغرات الأمنية أو مشاكل الأداء مع اقتراح الإصلاح العملي.',
  '5. الملفات الصوتية والمرئية: فرّغ النقاط الرئيسية والقرارات والمهام المستخلصة بدقة.',
  '6. منهجية التحليل وصياغة الرد:',
  '   - اذكر الحقائق المستخرجة مباشرة من المستند مع عزوها للمصدر أو القسم أو رقم الصفحة/الورقة.',
  '   - فرّق بوضوح بين «ما ورد نصاً في المستند» وبين «التحليل والاستنتاج والتوصيات».',
  '   - عند طلب مقارنة أو تلخيص أو تدقيق أو ترجمة، استخدم تنسيق Markdown منظم بعناوين واضحة (`##`, `###`) وقوائم مرقمة وجداول Markdown نظيفة لتكون جاهزة مباشرة للنسخ والطباعة والتصدير كوثيقة رسمية.',
];

export function buildPlatformSystemInstruction(
  store: HelbaweyBootstrap,
  activeProject: Project | undefined,
  includeContext: boolean,
  chatMode: PlatformChatMode = 'legal-expert',
  jurisdictionScope: LegalJurisdictionScope = 'global-comparative',
  options?: {
    userQuery?: string;
    translationSourceLang?: string;
    translationTargetLang?: string;
    translationStyle?: TranslationStyle;
    brainId?: PlatformBrainId;
  }
): string {
  const effectiveBrain: PlatformBrainId = options?.brainId || store.activeBrain || 'attia-advisor';
  if (effectiveBrain === 'gemini-standard') {
    return [
      buildBaselineGeminiSystemPrompt(activeProject, includeContext),
      '',
      ...DOCUMENT_INTELLIGENCE_PROTOCOL,
    ].join('\n');
  }

  const { sectionText: ironcladMemoryBlock, glossaryItems } = buildIroncladMemoryPromptSection({
    store,
    query: options?.userQuery || '',
    activeProjectId: activeProject?.id,
  });

  if (chatMode === 'omni-advisor') {
    const omniCore = buildOmniAdvisorSystemPrompt({
      activeProject,
      includePlatformContext: includeContext,
      jurisdictionScope,
    });
    return [
      omniCore,
      '',
      ...DOCUMENT_INTELLIGENCE_PROTOCOL,
      buildCompactTranslationAddendum(glossaryItems),
      ironcladMemoryBlock,
    ].join('\n');
  }

  if (chatMode === 'legal-expert') {
    const legalCore = buildLegalExpertSystemPrompt({
      scope: jurisdictionScope,
      activeProject,
      includePlatformContext: includeContext,
    });
    return [
      legalCore,
      '',
      ...DOCUMENT_INTELLIGENCE_PROTOCOL,
      buildCompactTranslationAddendum(glossaryItems),
      ironcladMemoryBlock,
    ].join('\n');
  }

  if (chatMode === 'translator') {
    const translatorCore = buildUniversalTranslatorPrompt({
      sourceLang: options?.translationSourceLang,
      targetLang: options?.translationTargetLang,
      style: options?.translationStyle,
      glossaryItems,
    });
    return [
      translatorCore,
      '',
      ...DOCUMENT_INTELLIGENCE_PROTOCOL,
      ironcladMemoryBlock,
    ].join('\n');
  }

  const basePrompt = [
    'أنت المساعد الحواري الطبيعي والعقل التحليلي لمنصة الهلباوي (ALHELBAWEY — مصنع البرمجيات الذكية المستقلة).',
    'تحاور مع المستخدم بأسلوب بشري طبيعي وواضح وودود ومحترف باللغة التي يكتب بها (العربية الفصحى المبسطة افتراضياً، أو أي لغة عالمية أخرى يخاطبك بها).',
    'تجنب الردود الآلية الجافة أو القوالب المكررة؛ استجب لسياق الحديث مباشرة، وقدم اقتراحات عملية وخطوات واضحة عند الحاجة.',
    'كن دقيقاً وأميناً تماماً في الحقائق التقنية: لا تدّعِ أبداً وجود ملفات أوزان GGUF محلية على القرص إذا لم تكن مرفقة فعلياً، ولا تخلط بين القيم المرجعية والقياسات الحية.',
    '',
    ...DOCUMENT_INTELLIGENCE_PROTOCOL,
    buildCompactLegalAddendumForGeneralChat(),
    buildCompactTranslationAddendum(glossaryItems),
  ];

  if (!includeContext) {
    return [...basePrompt, ironcladMemoryBlock].join('\n');
  }

  const modelsSummary = store.models
    .slice(0, 8)
    .map(
      (m) =>
        `- ${m.name} (${m.parameters}, ${m.minRamGb}-${m.ramRequiredGb} GB RAM, GPU: ${m.gpuRequirements}, رخصة: ${m.license}, مرفق بالقرص: ${m.uploadedFileName ? 'نعم' : 'لا'})`
    )
    .join('\n');

  const sqlFactsBlock = activeProject
    ? [
        '=== وقائع SQL الحية من قاعدة بيانات الشركة (مُلزم بالاعتماد عليها دون اختلاق) ===',
        queryProjectSqlFacts(activeProject, options?.userQuery || '').joinedFactsText,
        'قاعدة صارمة: عند الإجابة عن أي استفسار يخص الشركة أو عقودها أو فواتيرها أو مورديها أو مهامها، انقل الوقائع والأرقام والتواريخ حرفياً دون تخمين، واختم الإجابة بـ «مصدر البيانات» و«تاريخ آخر تحديث للبيانات».',
      ].join('\n')
    : '';

  const projectSummary = activeProject
    ? [
        `المشروع النشط حالياً: "${activeProject.name}" (${activeProject.id})`,
        `- مواصفات الجهاز المستهدف: ${activeProject.targetOs} · ${activeProject.targetRamGb} GB RAM · ${activeProject.targetGpuVramGb} GB GPU VRAM`,
        `- النموذج المخصص: ${activeProject.selectedModelId} | محرك التشغيل: ${activeProject.runtimeEngine} | حالة التحقق: ${activeProject.verificationReport?.verdict || activeProject.status}`,
        `- الجداول (${activeProject.dbTables.length}): ${activeProject.dbTables.map((t) => t.name).join(', ')}`,
        `- الصفحات (${activeProject.pages.length}): ${activeProject.pages.map((p) => p.titleAr).join('، ')}`,
        `- مستندات المعرفة المحلية RAG: ${activeProject.ragDocuments.length}`,
        `- آخر تحديث للبيانات: ${activeProject.updatedAt}`,
      ].join('\n')
    : 'لا يوجد مشروع نشط محدد حالياً.';

  const datasetsSummary = `${store.trainingDatasets.length} مجموعات بيانات في مكتبة التدريب (${store.trainingDatasets
    .slice(0, 4)
    .map((d) => d.name)
    .join('، ')}).`;

  return [
    ...basePrompt,
    '',
    '=== السياق الحي الحالي للمنصة ===',
    projectSummary,
    sqlFactsBlock,
    '',
    'النماذج المسجلة في المكتبة:',
    modelsSummary,
    '',
    `مكتبة بيانات التدريب: ${datasetsSummary}`,
    ironcladMemoryBlock,
  ]
    .filter(Boolean)
    .join('\n');
}

export function normalizeChatHistory(messages: PlatformChatMessage[]): Content[] {
  const recentWindow = messages.slice(-RECENT_VERBATIM_WINDOW);
  // Hydrate binary inlineData only for the 3 most recent attachment-bearing turns to keep context nimble
  const attachmentTurnIndices = recentWindow
    .map((m, idx) => (m.attachments && m.attachments.length > 0 ? idx : -1))
    .filter((idx) => idx >= 0);
  const hydratedBinarySet = new Set(attachmentTurnIndices.slice(-3));

  const contents: Content[] = [];
  for (let idx = 0; idx < recentWindow.length; idx++) {
    const msg = recentWindow[idx];
    const hasAttachments = Boolean(msg.attachments && msg.attachments.length > 0);
    const text = msg.content.trim();
    if (!text && !hasAttachments) continue;

    const role = msg.role === 'model' ? 'model' : 'user';
    // History must start with a 'user' turn and strictly alternate between 'user' and 'model'
    if (contents.length === 0 && role !== 'user') continue;

    const parts: Part[] =
      role === 'user' && hasAttachments
        ? buildGeminiPartsForMessage(text, msg.attachments, {
            includeBinary: hydratedBinarySet.has(idx),
          })
        : [{ text }];

    const prev = contents[contents.length - 1];
    if (prev && prev.role === role) {
      prev.parts = [...(prev.parts || []), ...parts];
    } else {
      contents.push({ role, parts });
    }
  }

  // Ensure history ends with 'model' if non-empty so the new user message alternates cleanly
  if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
    contents.pop();
  }
  return contents;
}

export async function* streamNaturalPlatformChat(params: {
  message: string;
  attachments?: ChatAttachmentMeta[];
  history: PlatformChatMessage[];
  systemInstruction: string;
  chatMode?: PlatformChatMode;
  brainId?: PlatformBrainId;
}): AsyncGenerator<string, void, unknown> {
  const ai = getGeminiClient();
  const normalizedHistory = normalizeChatHistory(params.history);
  const currentAttachments = params.attachments || [];
  const hasAnyDocsInTurnOrRecent =
    currentAttachments.length > 0 ||
    params.history.slice(-8).some((m) => m.attachments && m.attachments.length > 0);

  const messagePayload: string | Part[] =
    currentAttachments.length > 0
      ? buildGeminiPartsForMessage(params.message, currentAttachments, { includeBinary: true })
      : params.message;

  const thinkingLevel =
    params.brainId === 'gemini-standard'
      ? ThinkingLevel.LOW
      : params.chatMode === 'omni-advisor' ||
          params.chatMode === 'legal-expert' ||
          params.chatMode === 'translator'
        ? ThinkingLevel.HIGH
        : hasAnyDocsInTurnOrRecent
          ? ThinkingLevel.MEDIUM
          : ThinkingLevel.LOW;

  const candidateModels = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as const;
  let lastError: unknown = null;

  for (const model of candidateModels) {
    const modelThinking =
      model === 'gemini-3.1-flash-lite'
        ? thinkingLevel === ThinkingLevel.HIGH
          ? ThinkingLevel.LOW
          : ThinkingLevel.MINIMAL
        : thinkingLevel;

    const chat = ai.chats.create({
      model,
      history: normalizedHistory,
      config: {
        systemInstruction: params.systemInstruction,
        thinkingConfig: {
          thinkingLevel: modelThinking,
        },
      },
    });

    const maxAttempts = 2;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let emittedAnyChunk = false;
      try {
        const stream = await chat.sendMessageStream({
          message: messagePayload,
        });
        for await (const chunk of stream) {
          const c = chunk as GenerateContentResponse;
          if (c.text) {
            emittedAnyChunk = true;
            yield c.text;
          }
        }
        return;
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        const isQuota =
          msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Quota exceeded');
        const isTransient = msg.includes('503') || msg.includes('UNAVAILABLE');
        if (emittedAnyChunk) {
          throw err;
        }
        if (isQuota) {
          // Immediately fail over to the next free-tier Gemini model
          break;
        }
        if (isTransient && attempt + 1 < maxAttempts) {
          await new Promise((r) => setTimeout(r, 900));
          continue;
        }
        if (isTransient) {
          break;
        }
        throw err;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('تعذر الاتصال بنماذج Gemini المتاحة.');
}
