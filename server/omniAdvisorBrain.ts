import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  BrainVersionSnapshot,
  HelbaweyBootstrap,
  IroncladMemoryItem,
  LegalJurisdictionScope,
  OmniTrainingCurriculumResult,
  Project,
  TrainingDataset,
} from '../src/types/helbawey.ts';
import { upsertMemoryItemInList } from './ironcladMemory.ts';
import { buildLegalExpertSystemPrompt } from './legalExpertKnowledge.ts';
import { loadStore, saveStore } from './store.ts';
import { buildSample, recomputeDatasetMetrics } from './trainingLibrary.ts';

const OMNI_DATASET_ID = 'ds-omni-advisor-polymath';

const MASTER_OMNI_MODULES: {
  title: string;
  domainTag: string;
  content: string;
  instruction: string;
  output: string;
}[] = [
  {
    title: 'منهجية المبادئ الأولى والربط العابر للتخصصات (First-Principles + Synthesis)',
    domainTag: 'reasoning-meta',
    content:
      'تفكيك أي مسألة معقدة إلى حقائق أولية مستقلة، واختبارها بالمنطق الرياضي والواقع الميداني، ثم دمج الهندسة والاقتصاد والقانون والإدارة في قرار واحد متوازن.',
    instruction: 'كيف تحلل مسألة استراتيجية متعددة الأبعاد تجمع بين التقنية والتكلفة والمخاطر القانونية؟',
    output:
      '1) عزل القيود الفيزيائية/الحاسوبية الثابتة. 2) حساب الجدوى الاقتصادية والتكلفة الحدية للمخاطر. 3) التحقق من الامتثال التشريعي. 4) إجراء نقد عكسي للفرضيات قبل اعتماد الخيار التنفيذي.',
  },
  {
    title: 'الهندسة المعمارية للأنظمة الموزعة والأمن السيبراني التطبيقي',
    domainTag: 'engineering-security',
    content:
      'تطبيق Zero-Trust، التحقق التشفيري SHA-256، فصل الأسرار الخادمية، عزل العمليات، وتحسين زمن الاستجابة وذاكرة التشغيل (RAM/VRAM/CPU) بمقاييس حقيقية.',
    instruction: 'ما القواعد الصارمة لتأمين منصة برمجية تعتمد على نماذج ذكاء اصطناعي وملفات ثنائية؟',
    output:
      'فصل مفاتيح API بالكامل في الخادم، فرض التحقق المسبق من بصمة SHA-256 للملفات الثنائية، حراسة المسارات من Path Traversal، وضمان عدم تمرير أسرار العميل عبر المتصفح.',
  },
  {
    title: 'النمذجة الاقتصادية والمالية وتقييم القرارات الاستثمارية',
    domainTag: 'economics-finance',
    content:
      'استخدام صافي القيمة الحالية (NPV)، معدل العائد الداخلي (IRR)، تحليل الحساسية، هامش الأمان، وتكلفة الفرصة البديلة عند مقارنة المشاريع والبدائل.',
    instruction: 'كيف تقارن بين خيارين استثماريين أو تقنيين متنافسين بمخاطر مختلفة؟',
    output:
      'بناء مصفوفة سيناريوهات (متحفظ / أساسي / متفائل) مع احتساب التكلفة الكلية للملكية TCO وفترة الاسترداد وتحديد نقطة التعادل والشرط الحاسم لإيقاف الخسارة.',
  },
  {
    title: 'الاستدلال العلمي والرياضي والإحصاء البايزي',
    domainTag: 'stem-math',
    content:
      'التفريق الصارم بين الارتباط والسببية، تحديث الاحتمالات بالأدلة الجديدة (Bayesian Updating)، وفحص حدود الخطأ التجريبي قبل التعميم.',
    instruction: 'ما الضوابط العلمية لمنع الاستنتاجات المضللة عند قراءة البيانات والتجارب؟',
    output:
      'التحقق من حجم العينة، الكشف عن التحيز الانتقائي (Selection Bias)، الفصل بين القياس المباشر والتقدير النظري، وحساب فاصل الثقة أو هامش الخطأ.',
  },
  {
    title: 'الاستدلال الطبي والحيوي المبني على البراهين (Evidence-Based Medicine)',
    domainTag: 'medicine-bio',
    content:
      'تلخيص البروتوكولات السريرية والتفاعلات الدوائية والفحوصات بدقة علمية حديثة، مع التنبيه الواضح دائماً على أن التقييم السريري النهائي يخص الطبيب المختص.',
    instruction: 'كيف تُصاغ الإجابة عند تحليل تقارير مخبرية أو استفسارات دوائية مرفقة؟',
    output:
      'عرض القيم مقارنة بالنطاق المرجعي الطبيعي، توضيح الأسباب الفسيولوجية المحتملة والتداخلات الدوائية، وتذييل التقرير بتوصية مراجعة الطبيب المختص قبل أي إجراء علاجي.',
  },
  {
    title: 'نظرية الألعاب، التفاوض الاستراتيجي، وفحص المغالطات المنطقية',
    domainTag: 'strategy-logic',
    content:
      'تحليل حوافز الأطراف (Incentive Alignment)، تحديد أفضل بديل للاتفاق التفاوضي (BATNA)، وكشف المغالطات المنطقية والانحيازات المعرفية في الحجج.',
    instruction: 'كيف تقيّم عرض تفاوضي أو نزاع تجاري قبل الجلوس إلى طاولة التفاوض؟',
    output:
      'تحديد مصفوفة حوافز كل طرف، حساب قيمة BATNA لكل جانب، كشف نقاط القوة الخفية، وصياغة حزمة تنازلات متبادلة تضمن توازن ناش (Nash Equilibrium) مستقراً.',
  },
];

function readActiveAttiaDirectives(): { version: string; directives: string[] } {
  try {
    const statePath = path.resolve(process.cwd(), 'data', 'brain-training', 'state.json');
    if (!fs.existsSync(statePath)) return { version: 'v1.0.0', directives: [] };
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8')) as {
      activeVersions?: Record<string, string>;
      versions?: BrainVersionSnapshot[];
    };
    const ver = parsed.activeVersions?.['attia-advisor'] || 'v1.0.0';
    const snap = (parsed.versions || []).find(
      (v) => v.brainId === 'attia-advisor' && v.version === ver
    );
    return {
      version: ver,
      directives: snap?.addedPolicyDirectives || [],
    };
  } catch {
    return { version: 'v1.0.0', directives: [] };
  }
}

export function buildOmniAdvisorSystemPrompt(params: {
  activeProject?: Project;
  includePlatformContext: boolean;
  jurisdictionScope: LegalJurisdictionScope;
}): string {
  const legalFoundation = buildLegalExpertSystemPrompt({
    scope: params.jurisdictionScope,
    activeProject: params.activeProject,
    includePlatformContext: params.includePlatformContext,
  });
  const activeVer = readActiveAttiaDirectives();
  const directivesBlock =
    activeVer.directives.length > 0
      ? [
          '',
          `=== ضوابط وتحديثات الإصدار التدريبي المعتمد (${activeVer.version}) ===`,
          ...activeVer.directives.map((d, i) => `${i + 1}. ${d}`),
        ].join('\n')
      : '';

  return [
    `أنت «عقل المستشار عطيه الهلباوى المستقبل» (الإصدار ${activeVer.version} — عقل المستشار الشامل المستقل — ALHELBAWEY FUTURE RASHAD & POLYMATH BRAIN) — عقل استشاري ومعرفي فائق مصمَّم للرشاد القيادي والاستراتيجي واستيعاب والربط بين كافة علوم البشر وتخصصاتها بدقة متناهية ومنهجية علمية صارمة.`,
    '',
    '=== التخصصات الشاملة المُدمجة ===',
    '1. الهندسة والبرمجيات والأمن السيبراني وعلوم الحاسب والذكاء الاصطناعي وتصميم النظم الموزعة والتشفير.',
    '2. الرياضيات البحتة والتطبيقية، الإحصاء البايزي، الفيزياء، الكيمياء، والعلوم الهندسية والتحليل الكمي.',
    '3. العلوم الطبية والحيوية والصيدلانية المبنية على البراهين (مع التنبيه المهني الإلزامي لمراجعة الطبيب المختص في القرارات العلاجية).',
    '4. الاقتصاد الكلي والجزئي، التمويل المؤسسي، المحاسبة، التحليل المالي (NPV/IRR/TCO)، الاستثمار، وسلاسل الإمداد وإدارة المخاطر.',
    '5. القانون المحلي والدولي والعالمي المقارن والتحكيم وصياغة المذكرات والعقود.',
    '6. الفلسفة، المنطق الصوري، نظرية الألعاب، الاستراتيجية القيادية، علم النفس التنظيمي، والتفاوض المتقدم.',
    '7. جميع اللغات العالمية، الترجمة الدقيقة المعتمدة، واستخلاص الحقائق من كافة المستندات (PDF/Word/Excel/Images/Code).',
    '',
    '=== بروتوكول الرشاد والتفكير العميق من 5 خطوات (Al-Rashad Deep Omni-Reasoning Protocol) ===',
    'عند كل سؤال أو تحدٍّ أو مستند:',
    '1. تفكيك المبادئ الأولى (First Principles): جرّد المشكلة من الحشو وحدد القيود والحقائق الثابتة.',
    '2. التركيب عابر التخصصات (Cross-Domain Synthesis): اربط الأثر الهندسي والمالي والقانوني والتشغيلي معاً لا بمعزل.',
    '3. التحقق والاختبار العكسي (Adversarial Self-Critique): اسأل نفسك: أين الثغرة أو الفرضية الأضعف أو الخطر الخفي؟ واذكره بصراحة.',
    '4. الأمانة المعرفية المطلقة: فرّق تماماً بين الحقيقة المقاسة والمثبتة، وبين التقدير التحليلي، ولا تختلق أبداً أي رقم أو مرجع أو حالة نظام غير موجودة (لا تدّعِ أبداً وجود أوزان GGUF على القرص إذا لم تكن مرفوعة).',
    '5. الرشاد والمخرج التنفيذي الحاسم: قدّم رؤية سديدة، حكيمة، منظمة، عميقة، وخطة عمل قابلة للتنفيذ بأرقام وجداول Markdown واضحة جاهزة للنسخ والطباعة والتصدير.',
    directivesBlock,
    '',
    '=== القدرة القانونية الكاملة المدمجة ===',
    legalFoundation,
  ].join('\n');
}

function ensureOmniDataset(store: HelbaweyBootstrap): TrainingDataset {
  let ds = store.trainingDatasets.find((d) => d.id === OMNI_DATASET_ID);
  if (!ds) {
    ds = recomputeDatasetMetrics({
      id: OMNI_DATASET_ID,
      name: 'منهج عقل المستشار الشامل المستقل (Omni-Advisor Polymath SFT)',
      slug: 'omni-advisor-polymath',
      descriptionAr:
        'مجموعة بيانات تدريب وذاكرة حديدية متعددة التخصصات (هندسة، رياضيات، طب، اقتصاد، قانون، منطق واستراتيجية) لتدريب وتطوير عقل المستشار المستقل.',
      domain: 'reasoning-cot',
      format: 'CoT-Reasoning',
      languages: ['ar', 'en', 'ar-en', 'code'],
      license: 'Apache-2.0',
      version: '1.0.0',
      samplesCount: 0,
      totalTokensEstimate: 0,
      avgQualityScore: 0,
      deduplicated: true,
      lastCuratedAt: new Date().toISOString(),
      recommendedBaseModels: ['qwen25-15b-q4', 'qwen25-3b-q4', 'mistral-7b-v03-q4'],
      samples: [],
    });
    store.trainingDatasets.unshift(ds);
  }
  return ds;
}

export async function trainOmniAdvisorBrain(params: {
  mode: 'seed-master' | 'custom-domain';
  domain?: string;
  content?: string;
  projectId?: string;
}): Promise<OmniTrainingCurriculumResult> {
  const store = loadStore();
  let memory: IroncladMemoryItem[] = Array.isArray(store.platformChatMemory)
    ? [...store.platformChatMemory]
    : [];
  const dataset = ensureOmniDataset(store);

  const distilledPrinciples: string[] = [];
  let addedMemoryCount = 0;
  let addedDatasetSamplesCount = 0;

  if (params.mode === 'seed-master') {
    for (const mod of MASTER_OMNI_MODULES) {
      memory = upsertMemoryItemInList(memory, {
        category: 'user-rule',
        title: mod.title,
        content: mod.content,
        tags: ['omni-brain', mod.domainTag],
        pinned: true,
        sourceType: 'user-pinned',
        projectId: params.projectId,
      });
      addedMemoryCount += 1;
      distilledPrinciples.push(mod.title);

      const existsSample = dataset.samples.some((s) => s.instruction === mod.instruction);
      if (!existsSample) {
        dataset.samples.unshift(
          buildSample({
            instruction: mod.instruction,
            input: `النطاق التخصصي: ${mod.domainTag}`,
            output: mod.output,
            reasoning: mod.content,
            language: 'ar',
            difficulty: 'expert',
            source: 'curated',
          })
        );
        addedDatasetSamplesCount += 1;
      }
    }
  } else {
    const domain = (params.domain || 'المعرفة العامة المتقدمة').trim();
    const rawContent = (params.content || '').trim();
    const apiKey = process.env.GEMINI_API_KEY;

    let distilled: {
      principles?: { title: string; rule: string }[];
      samples?: { instruction: string; input: string; reasoning: string; output: string }[];
    } | null = null;

    if (apiKey) {
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });

        const promptText = [
          `المجال المستهدف للتدريب والتعمق: ${domain}`,
          rawContent
            ? `المادة المعرفية المرجعية المرفقة من المستخدم:\n${rawContent.slice(0, 6000)}`
            : 'قم بتوليد خلاصة علمية وهندسية متقدمة لهذا المجال من المبادئ الأولى.',
          'استخرج 3 إلى 4 مبادئ/قوانين أساسية دقيقة جداً للحفظ في الذاكرة الحديدية، و2 عينة تدريب SFT احترافية تتضمن التفكير التحليلي ثم الإجابة الحاسمة.',
        ].join('\n\n');

        const resp = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: promptText,
          config: {
            systemInstruction:
              'أنت مدرب معرفي خبير تبني مناهج استدلال عميقة ودقيقة دون اختلاق أو مبالغة تسويقية. التزم بصيغة JSON المطلوبة.',
            thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                principles: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      rule: { type: Type.STRING },
                    },
                  },
                },
                samples: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      instruction: { type: Type.STRING },
                      input: { type: Type.STRING },
                      reasoning: { type: Type.STRING },
                      output: { type: Type.STRING },
                    },
                  },
                },
              },
            },
          },
        });
        distilled = JSON.parse((resp.text || '{}').trim());
      } catch {
        distilled = null;
      }
    }

    if (distilled?.principles?.length) {
      for (const p of distilled.principles.slice(0, 5)) {
        if (!p.title || !p.rule) continue;
        memory = upsertMemoryItemInList(memory, {
          category: 'user-rule',
          title: `[${domain}] ${p.title}`.slice(0, 120),
          content: p.rule,
          tags: ['omni-brain', domain],
          pinned: true,
          sourceType: 'user-pinned',
          projectId: params.projectId,
        });
        distilledPrinciples.push(p.title);
        addedMemoryCount += 1;
      }
    } else {
      const ruleBody =
        rawContent ||
        `تطبيق التفكير من المبادئ الأولى والتحقق الكمي/العلمي الصارم في مجال ${domain}.`;
      memory = upsertMemoryItemInList(memory, {
        category: 'user-rule',
        title: `منهج معرفي متخصص: ${domain}`,
        content: ruleBody.slice(0, 850),
        tags: ['omni-brain', domain],
        pinned: true,
        sourceType: 'user-pinned',
        projectId: params.projectId,
      });
      distilledPrinciples.push(`منهج معرفي متخصص: ${domain}`);
      addedMemoryCount += 1;
    }

    if (distilled?.samples?.length) {
      for (const s of distilled.samples.slice(0, 3)) {
        if (!s.instruction || !s.output) continue;
        dataset.samples.unshift(
          buildSample({
            instruction: s.instruction,
            input: s.input || `المجال: ${domain}`,
            reasoning: s.reasoning,
            output: s.output,
            language: 'ar',
            difficulty: 'expert',
            source: 'curated',
          })
        );
        addedDatasetSamplesCount += 1;
      }
    } else if (rawContent) {
      dataset.samples.unshift(
        buildSample({
          instruction: `حلّل واستخرج القواعد التطبيقية الأساسية في مجال ${domain}`,
          input: rawContent.slice(0, 600),
          reasoning: `استخلاص المبادئ الأولى والربط التطبيقي في ${domain}`,
          output: rawContent.slice(0, 900),
          language: 'ar',
          difficulty: 'expert',
          source: 'imported',
        })
      );
      addedDatasetSamplesCount += 1;
    }
  }

  const updatedDs = recomputeDatasetMetrics(dataset);
  const dsIdx = store.trainingDatasets.findIndex((d) => d.id === updatedDs.id);
  if (dsIdx >= 0) {
    store.trainingDatasets[dsIdx] = updatedDs;
  }

  store.platformChatMemory = memory;
  saveStore(store);

  return {
    domain: params.mode === 'seed-master' ? 'المنهج الشامل (6 تخصصات كبرى)' : params.domain || 'مخصص',
    addedMemoryCount,
    addedDatasetSamplesCount,
    distilledPrinciples,
    totalMemoryCount: memory.length,
    omniDatasetId: updatedDs.id,
  };
}
