import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type {
  BrainCompareResponse,
  BrainCompareSideResult,
  BrainOptionProfile,
  HelbaweyBootstrap,
  LegalJurisdictionScope,
  Project,
} from '../src/types/helbawey.ts';
import { buildIroncladMemoryPromptSection } from './ironcladMemory.ts';
import { buildOmniAdvisorSystemPrompt } from './omniAdvisorBrain.ts';

export const BRAIN_PROFILES: BrainOptionProfile[] = [
  {
    id: 'attia-advisor',
    titleAr: 'عقل المستشار عطيه الهلباوى المستقبل',
    subtitleAr: 'عقل الرشاد والتحليل الشامل عابر التخصصات والذاكرة الحديدية',
    modelId: 'gemini-4-hydrogen',
    thinkingLevel: 'HIGH',
    methodologyAr:
      'تفكيك المبادئ الأولى + التركيب بين 7 تخصصات كبرى (الهندسة، القانون العالمي والمحلي، الاقتصاد، العلوم، الطب، المنطق، والترجمة) + الفحص العكسي (Red-Teaming) + الذاكرة الحديدية الدائمة.',
    strengthsAr: [
      'استدلال عميق عبر ThinkingLevel.HIGH ومناهج الرشاد التنفيذي',
      'استرجاع القواعد والسوابق المثبتة تلقائياً من الذاكرة الحديدية الدائمة',
      'ربط تشريعي ومقارن بالقوانين المحلية والدولية والعالمية عند اللزوم',
      'تحليل عكسي يكشف الثغرات والمخاطر والبدائل قبل اعتماد القرار',
    ],
    usesIroncladMemory: true,
    usesLegalAndPolymathSynthesis: true,
  },
  {
    id: 'gemini-standard',
    titleAr: 'عقل جيميني القياسي',
    subtitleAr: 'النموذج المرجعي المباشر للاستجابات العامة السريعة والمقارنة الموضوعية',
    modelId: 'gemini-4-hydrogen',
    thinkingLevel: 'LOW',
    methodologyAr:
      'استجابة مباشرة بنمط المساعد العام القياسي دون حقن مناهج التخصصات المتقاطعة أو التأصيل القانوني المقارن أو القواعد المثبتة بالذاكرة الحديدية.',
    strengthsAr: [
      'إجابات عامة سريعة ومباشرة بالحد الأدنى من زمن التفكير',
      'خط أساس محايد (Baseline) لقياس وإظهار الفارق أمام عقل المستشار',
      'مناسب للأسئلة العامة البسيطة غير المتعددة الأبعاد',
      'بلا فرضيات منهجية إضافية أو تقطير من الذاكرة الحديدية',
    ],
    usesIroncladMemory: false,
    usesLegalAndPolymathSynthesis: false,
  },
];

export function buildBaselineGeminiSystemPrompt(
  activeProject: Project | undefined,
  includePlatformContext: boolean
): string {
  const lines = [
    'أنت نموذج جيميني القياسي (Gemini Standard Baseline).',
    'أجب عن سؤال المستخدم مباشرة بأسلوب واضح ومختصر ومفيد كمساعد عام قياسي.',
  ];
  if (includePlatformContext && activeProject) {
    lines.push(
      `معلومة سريعة عن المشروع النشط: "${activeProject.name}" (${activeProject.targetOs} · ${activeProject.targetRamGb} GB RAM).`
    );
  }
  return lines.join('\n');
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'مفتاح GEMINI_API_KEY غير مضبوط على الخادم. يُرجى التحقق من إعداده في لوحة Settings > Secrets لتشغيل المقارنة الحية.'
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

function measureTextStats(text: string): {
  charCount: number;
  wordCount: number;
  headingsCount: number;
} {
  const trimmed = text.trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  const headingsCount = (trimmed.match(/^#{1,6}\s+/gm) || []).length;
  return {
    charCount: trimmed.length,
    wordCount,
    headingsCount,
  };
}

export async function compareBrainsLive(params: {
  store: HelbaweyBootstrap;
  prompt: string;
  projectId?: string;
  includeContext?: boolean;
  jurisdictionScope?: LegalJurisdictionScope;
}): Promise<BrainCompareResponse> {
  const ai = getGeminiClient();
  const activeProject =
    (params.projectId
      ? params.store.projects.find((p) => p.id === params.projectId)
      : undefined) || params.store.projects[0];
  const includeContext = params.includeContext !== false;
  const scope: LegalJurisdictionScope = params.jurisdictionScope || 'global-comparative';

  const baselineInstruction = buildBaselineGeminiSystemPrompt(activeProject, includeContext);

  const { sectionText: ironcladMemoryBlock, injectedCount } = buildIroncladMemoryPromptSection({
    store: params.store,
    query: params.prompt,
    activeProjectId: activeProject?.id,
  });

  const attiaCore = buildOmniAdvisorSystemPrompt({
    activeProject,
    includePlatformContext: includeContext,
    jurisdictionScope: scope,
  });
  const attiaInstruction = [attiaCore, ironcladMemoryBlock].join('\n');

  const runWithRetry = async (
    labelAr: string,
    systemInstruction: string,
    thinkingLevel: ThinkingLevel
  ): Promise<{ outputText: string; elapsedMs: number; modelUsed: string }> => {
    const candidateModels = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as const;
    for (const model of candidateModels) {
      const modelThinking =
        model === 'gemini-3.1-flash-lite'
          ? thinkingLevel === ThinkingLevel.HIGH
            ? ThinkingLevel.LOW
            : ThinkingLevel.MINIMAL
          : thinkingLevel;
      const maxAttempts = 2;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const started = Date.now();
        try {
          const response = await ai.models.generateContent({
            model,
            contents: params.prompt,
            config: {
              systemInstruction,
              thinkingConfig: { thinkingLevel: modelThinking },
            },
          });
          return {
            outputText: (response.text || '').trim(),
            elapsedMs: Date.now() - started,
            modelUsed: model,
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const isQuota = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
          const isTransient = msg.includes('503') || msg.includes('UNAVAILABLE');
          if (isQuota) break;
          if (isTransient && attempt + 1 < maxAttempts) {
            await new Promise((r) => setTimeout(r, 900));
            continue;
          }
          if (isTransient) break;
          throw err;
        }
      }
    }
    throw new Error(
      `تم بلوغ حد الحصة المجانية المؤقت (Rate Limit) أثناء تشغيل ${labelAr}. يرجى الانتظار بضع لحظات ثم إعادة المحاولة.`
    );
  };

  const runGeminiBaseline = async (): Promise<BrainCompareSideResult> => {
    const { outputText, elapsedMs, modelUsed } = await runWithRetry(
      'عقل جيميني القياسي',
      baselineInstruction,
      ThinkingLevel.LOW
    );
    const stats = measureTextStats(outputText);
    return {
      brainId: 'gemini-standard',
      brainLabelAr: 'عقل جيميني القياسي',
      modelId: modelUsed,
      thinkingLevel: 'LOW',
      elapsedMs,
      outputText,
      ...stats,
      memoryRulesInjected: 0,
    };
  };

  const runAttiaAdvisor = async (): Promise<BrainCompareSideResult> => {
    const { outputText, elapsedMs, modelUsed } = await runWithRetry(
      'عقل المستشار عطيه الهلباوى المستقبل',
      attiaInstruction,
      ThinkingLevel.HIGH
    );
    const stats = measureTextStats(outputText);
    return {
      brainId: 'attia-advisor',
      brainLabelAr: 'عقل المستشار عطيه الهلباوى المستقبل',
      modelId: modelUsed,
      thinkingLevel: 'HIGH',
      elapsedMs,
      outputText,
      ...stats,
      memoryRulesInjected: injectedCount,
    };
  };

  const geminiStandard = await runGeminiBaseline();
  const attiaAdvisor = await runAttiaAdvisor();

  return {
    prompt: params.prompt,
    comparedAt: new Date().toISOString(),
    geminiStandard,
    attiaAdvisor,
  };
}
