import crypto from 'node:crypto';
import type {
  Project,
  TrainingDataset,
  TrainingDatasetFormat,
  TrainingSample,
} from '../src/types/helbawey';

export function estimateTokens(text: string): number {
  const cleaned = text.trim();
  if (!cleaned) return 0;
  // Arabic & mixed code/English averages ~3.5 characters per BPE token
  return Math.max(1, Math.ceil(cleaned.length / 3.5));
}

export function scoreTrainingSample(sample: {
  instruction: string;
  input?: string;
  output: string;
  reasoning?: string;
  rejected?: string;
}): number {
  const inst = sample.instruction.trim();
  const out = sample.output.trim();
  const inp = (sample.input || '').trim();
  const reason = (sample.reasoning || '').trim();
  const rejected = (sample.rejected || '').trim();

  if (!inst || !out) return 18;

  let score = 48;
  if (inst.length >= 24) score += 10;
  if (inst.length >= 50) score += 4;
  if (out.length >= 36) score += 12;
  if (out.length >= 90) score += 6;
  if (inp.length >= 12) score += 5;
  if (reason.length >= 30) score += 8;
  if (rejected.length >= 20 && rejected !== out) score += 8;

  // Reward structured technical or numerical grounding
  if (/\d+|[{[\]]|SELECT|CREATE|function|const|```/i.test(out)) {
    score += 5;
  }

  // Penalize trivial boilerplate or placeholder repetitions
  const lowerOut = out.toLowerCase();
  if (
    lowerOut === inst.toLowerCase() ||
    lowerOut.includes('lorem ipsum') ||
    out.length < 10
  ) {
    score -= 28;
  }

  return Math.max(15, Math.min(99, Math.round(score)));
}

export function detectLanguageTag(text: string): TrainingSample['language'] {
  const hasArabic = /[\u0600-\u06FF]/.test(text);
  const hasCode = /(?:function\s|const\s|import\s|SELECT\s|CREATE TABLE|```|\{\s*")/i.test(text);
  const hasLatin = /[A-Za-z]{3,}/.test(text);

  if (hasCode && !hasArabic) return 'code';
  if (hasArabic && hasLatin) return 'ar-en';
  if (hasArabic) return 'ar';
  return 'en';
}

export function buildSample(
  raw: {
    instruction: string;
    input?: string;
    output: string;
    reasoning?: string;
    rejected?: string;
    difficulty?: TrainingSample['difficulty'];
    source?: TrainingSample['source'];
    language?: TrainingSample['language'];
  }
): TrainingSample {
  const instruction = raw.instruction.trim();
  const input = (raw.input || '').trim();
  const output = raw.output.trim();
  const reasoning = raw.reasoning?.trim() || undefined;
  const rejected = raw.rejected?.trim() || undefined;
  const combined = `${instruction}\n${input}\n${reasoning || ''}\n${output}`;
  const tokenEstimate = estimateTokens(combined);
  const qualityScore = scoreTrainingSample({
    instruction,
    input,
    output,
    reasoning,
    rejected,
  });

  const inferredDifficulty: TrainingSample['difficulty'] =
    raw.difficulty ||
    (tokenEstimate >= 120 || Boolean(reasoning) ? 'expert' : tokenEstimate >= 55 ? 'intermediate' : 'basic');

  return {
    id: `smp-${crypto.randomUUID().slice(0, 8)}`,
    instruction,
    input,
    output,
    reasoning,
    rejected,
    language: raw.language || detectLanguageTag(combined),
    difficulty: inferredDifficulty,
    tokenEstimate,
    qualityScore,
    source: raw.source || 'curated',
  };
}

export function recomputeDatasetMetrics(dataset: TrainingDataset): TrainingDataset {
  const samplesCount = dataset.samples.length;
  const totalTokensEstimate = dataset.samples.reduce((sum, s) => sum + s.tokenEstimate, 0);
  const avgQualityScore =
    samplesCount > 0
      ? Number(
          (
            dataset.samples.reduce((sum, s) => sum + s.qualityScore, 0) / samplesCount
          ).toFixed(1)
        )
      : 0;

  return {
    ...dataset,
    samplesCount,
    totalTokensEstimate,
    avgQualityScore,
  };
}

function normalizeForDedup(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordBigrams(text: string): Set<string> {
  const words = normalizeForDedup(text).split(' ').filter(Boolean);
  const set = new Set<string>();
  for (let i = 0; i < words.length; i++) {
    set.add(words[i]);
    if (i + 1 < words.length) {
      set.add(`${words[i]}_${words[i + 1]}`);
    }
  }
  return set;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const item of a) {
    if (b.has(item)) inter++;
  }
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function curateAndDeduplicateDataset(
  dataset: TrainingDataset,
  minQualityScore = 65
): {
  dataset: TrainingDataset;
  report: {
    beforeCount: number;
    afterCount: number;
    duplicatesRemoved: number;
    lowQualityRemoved: number;
  };
} {
  const beforeCount = dataset.samples.length;
  const seenHashes = new Set<string>();
  const keptBigrams: Set<string>[] = [];
  const kept: TrainingSample[] = [];
  let duplicatesRemoved = 0;
  let lowQualityRemoved = 0;

  for (const sample of dataset.samples) {
    const recomputedScore = scoreTrainingSample(sample);
    const updatedSample: TrainingSample = {
      ...sample,
      qualityScore: recomputedScore,
      tokenEstimate: estimateTokens(
        `${sample.instruction}\n${sample.input}\n${sample.reasoning || ''}\n${sample.output}`
      ),
    };

    if (updatedSample.qualityScore < minQualityScore) {
      lowQualityRemoved++;
      continue;
    }

    const normKey = normalizeForDedup(`${sample.instruction} || ${sample.output}`);
    const hash = crypto.createHash('sha1').update(normKey).digest('hex');
    if (seenHashes.has(hash)) {
      duplicatesRemoved++;
      continue;
    }

    const bg = wordBigrams(`${sample.instruction} ${sample.input}`);
    const isNearDuplicate = keptBigrams.some((prevBg) => jaccardSimilarity(bg, prevBg) >= 0.9);
    if (isNearDuplicate) {
      duplicatesRemoved++;
      continue;
    }

    seenHashes.add(hash);
    keptBigrams.push(bg);
    kept.push(updatedSample);
  }

  const nextDataset = recomputeDatasetMetrics({
    ...dataset,
    samples: kept,
    deduplicated: true,
    lastCuratedAt: new Date().toISOString(),
  });

  return {
    dataset: nextDataset,
    report: {
      beforeCount,
      afterCount: kept.length,
      duplicatesRemoved,
      lowQualityRemoved,
    },
  };
}

export function parseJsonlImport(
  rawText: string,
  _formatHint?: TrainingDatasetFormat
): TrainingSample[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const imported: TrainingSample[] = [];

  for (const line of lines) {
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;

      // Case 1: ChatML { messages: [{role, content}] }
      if (Array.isArray(obj.messages)) {
        const msgs = obj.messages as Array<{ role?: string; content?: string }>;
        const sys = msgs.find((m) => m.role === 'system')?.content || '';
        const usr = msgs.find((m) => m.role === 'user')?.content || '';
        const ast = msgs.find((m) => m.role === 'assistant')?.content || '';
        if (usr && ast) {
          imported.push(
            buildSample({
              instruction: usr,
              input: sys,
              output: ast,
              source: 'imported',
            })
          );
          continue;
        }
      }

      // Case 2: ShareGPT { conversations: [{from, value}] }
      if (Array.isArray(obj.conversations)) {
        const convs = obj.conversations as Array<{ from?: string; value?: string }>;
        const human = convs.find((c) => c.from === 'human' || c.from === 'user')?.value || '';
        const gpt = convs.find((c) => c.from === 'gpt' || c.from === 'assistant')?.value || '';
        if (human && gpt) {
          imported.push(
            buildSample({
              instruction: human,
              input: '',
              output: gpt,
              source: 'imported',
            })
          );
          continue;
        }
      }

      // Case 3: DPO { prompt, chosen, rejected }
      if (typeof obj.prompt === 'string' && typeof obj.chosen === 'string') {
        imported.push(
          buildSample({
            instruction: obj.prompt,
            input: '',
            output: obj.chosen,
            rejected: typeof obj.rejected === 'string' ? obj.rejected : undefined,
            source: 'imported',
          })
        );
        continue;
      }

      // Case 4: Alpaca / CoT { instruction, input, output, reasoning }
      const inst = String(obj.instruction || obj.question || obj.prompt || '').trim();
      const out = String(obj.output || obj.response || obj.answer || '').trim();
      if (inst && out) {
        imported.push(
          buildSample({
            instruction: inst,
            input: String(obj.input || obj.context || '').trim(),
            output: out,
            reasoning: typeof obj.reasoning === 'string' ? obj.reasoning : undefined,
            rejected: typeof obj.rejected === 'string' ? obj.rejected : undefined,
            source: 'imported',
          })
        );
      }
    } catch {
      // Allow "instruction | output" plain-text fallback
      if (line.includes('|')) {
        const [inst, ...rest] = line.split('|');
        const out = rest.join('|').trim();
        if (inst.trim() && out) {
          imported.push(
            buildSample({
              instruction: inst.trim(),
              input: '',
              output: out,
              source: 'imported',
            })
          );
        }
      }
    }
  }

  return imported;
}

export function formatDatasetForExport(
  dataset: TrainingDataset,
  targetFormat: 'alpaca' | 'chatml' | 'sharegpt' | 'dpo'
): string {
  return dataset.samples
    .map((s) => {
      const fullAssistant = s.reasoning
        ? `<think>\n${s.reasoning}\n</think>\n${s.output}`
        : s.output;

      if (targetFormat === 'chatml') {
        const messages: Array<{ role: string; content: string }> = [
          {
            role: 'system',
            content: 'أنت مساعد ذكي يعمل محلياً بدقة عالية وبدون اعتماد على واجهات خارجية.',
          },
          {
            role: 'user',
            content: s.input ? `${s.instruction}\n\nالبيانات:\n${s.input}` : s.instruction,
          },
          {
            role: 'assistant',
            content: fullAssistant,
          },
        ];
        return JSON.stringify({ messages, quality_score: s.qualityScore, language: s.language });
      }

      if (targetFormat === 'sharegpt') {
        return JSON.stringify({
          conversations: [
            { from: 'human', value: s.input ? `${s.instruction}\n${s.input}` : s.instruction },
            { from: 'gpt', value: fullAssistant },
          ],
          source: dataset.slug,
        });
      }

      if (targetFormat === 'dpo') {
        return JSON.stringify({
          prompt: s.input ? `${s.instruction}\n\n${s.input}` : s.instruction,
          chosen: fullAssistant,
          rejected:
            s.rejected ||
            'عذراً، سأقوم بتقدير الإجابة دون الرجوع إلى البيانات الفعلية المتوفرة في القاعدة المحلية.',
        });
      }

      // Default: Alpaca SFT
      return JSON.stringify({
        instruction: s.instruction,
        input: s.input,
        output: fullAssistant,
        ...(s.reasoning ? { reasoning: s.reasoning } : {}),
        quality_score: s.qualityScore,
      });
    })
    .join('\n');
}

export function synthesizeSamplesFromProject(project: Project): TrainingSample[] {
  const synthesized: TrainingSample[] = [];

  for (const table of project.dbTables) {
    const colSummary = table.columns.map((c) => `${c.name} (${c.type} - ${c.labelAr})`).join('، ');
    const sampleRows = table.rows.slice(0, 2);

    synthesized.push(
      buildSample({
        instruction: `اكتب استعلام SQL تحليلي آمن لجدول "${table.labelAr}" (${table.name}) يوضح السجلات النشطة مع أسماء الأعمدة المعتمدة.`,
        input: `أعمدة الجدول: ${colSummary}`,
        output: `SELECT ${table.columns.map((c) => c.name).join(', ')} FROM ${table.name} ORDER BY 1 DESC LIMIT 50;`,
        reasoning: `نراجع أولاً بنية الجدول ${table.name} للتأكد من استخدام الأعمدة الحقيقية (${table.columns.map((c) => c.name).join(', ')}) وتجنب SELECT * غير المنضبط.`,
        difficulty: 'intermediate',
        source: 'project-synthesized',
      })
    );

    if (sampleRows.length > 0) {
      synthesized.push(
        buildSample({
          instruction: `حلل البيانات الحالية في جدول "${table.labelAr}" واستخرج ملخصاً تنفيذياً دقيقاً دون اختلاق أرقام.`,
          input: JSON.stringify(sampleRows, null, 0),
          output: `تم فحص ${sampleRows.length} سجل من جدول ${table.labelAr} (${table.name}). إجمالي السجلات المخزنة في الجدول هو ${table.rows.length} سجل.`,
          difficulty: 'basic',
          source: 'project-synthesized',
        })
      );
    }
  }

  for (const doc of project.ragDocuments.slice(0, 3)) {
    const excerpt = doc.content.slice(0, 280).trim();
    if (excerpt) {
      synthesized.push(
        buildSample({
          instruction: `أجب عن استفسار المستخدم استناداً حصرياً إلى وثيقة "${doc.title}" في قاعدة المعرفة المحلية.`,
          input: `المقتطف المرجعي:\n${excerpt}`,
          output: `وفق الوثيقة المرجعية "${doc.title}": ${excerpt}${doc.content.length > 280 ? '...' : ''}`,
          rejected: 'حسب معلوماتي العامة دون الرجوع للوثيقة، قد تختلف السياسات حسب كل حالة.',
          difficulty: 'intermediate',
          source: 'project-synthesized',
        })
      );
    }
  }

  for (const route of project.apiRoutes.slice(0, 2)) {
    synthesized.push(
      buildSample({
        instruction: `ولد استدعاء Tool-Call منظم لتنفيذ نقطة النهاية ${route.method} ${route.path} في مشروع ${project.name}.`,
        input: `الوصف الوظيفي: ${route.descriptionAr} · يتطلب مصادقة: ${route.authRequired ? 'نعم' : 'لا'}`,
        output: JSON.stringify(
          {
            tool: 'local_api_request',
            arguments: {
              method: route.method,
              path: route.path,
              offlineLocalExecution: !route.requiresInternet,
            },
          },
          null,
          2
        ),
        difficulty: 'expert',
        source: 'project-synthesized',
      })
    );
  }

  return synthesized;
}

export function seedTrainingDatasets(): TrainingDataset[] {
  const now = new Date().toISOString();

  const rawDatasets: Omit<
    TrainingDataset,
    'samplesCount' | 'totalTokensEstimate' | 'avgQualityScore'
  >[] = [
    {
      id: 'ds-arabic-enterprise-sft',
      name: 'حزمة المؤسسات والأنظمة العربية (Arabic Enterprise SFT)',
      slug: 'alhelbawey-arabic-enterprise-sft',
      descriptionAr:
        'مجموعة تعليمات متخصصة في تحليل العقود، مراجعة الفواتير، حساب الهوامش المالية، وصياغة التقارير الإدارية باللغة العربية الفصحى الدقيقة.',
      domain: 'arabic-enterprise',
      format: 'Alpaca-SFT',
      languages: ['ar', 'ar-en'],
      license: 'Apache-2.0',
      version: '2.4.0',
      deduplicated: true,
      lastCuratedAt: now,
      recommendedBaseModels: ['qwen25-15b-q4', 'qwen25-3b-q4', 'llama31-8b-q4'],
      samples: [
        buildSample({
          instruction: 'استخرج بنود المخاطر المالية وتاريخ التجديد الإلزامي من نص العقد التالي بصيغة منظمة.',
          input:
            'عقد توريد وصيانة أنظمة مستشفى النور التخصصي بمبلغ إجمالي 840,000 ريال سعودي لمدة 24 شهراً يبدأ في 2026-03-01، مع شرط جزائي 2% عن كل أسبوع تأخير وبحد أقصى 10%، وإشعار عدم تجديد قبل 45 يوماً.',
          output:
            'الجهة: مستشفى النور التخصصي | القيمة: 840,000 ريال | المدة: 24 شهراً | موعد إشعار عدم التجديد: قبل 45 يوماً من 2028-02-29 | السقف الجزائي: 10% (84,000 ريال كحد أقصى).',
          difficulty: 'expert',
        }),
        buildSample({
          instruction: 'احسب صافي التدفق النقدي وهامش الربح التشغيلي مع توصية مالية مختصرة.',
          input: 'المبيعات الشهرية: 420,000 ريال | تكلفة المبيعات: 235,000 ريال | المصاريف التشغيلية: 78,000 ريال.',
          output:
            'مجمل الربح: 185,000 ريال | صافي الربح التشغيلي: 107,000 ريال | هامش الربح التشغيلي: 25.48%. التوصية: الحفاظ على سقف المصاريف التشغيلية دون 20% من الإيرادات.',
          difficulty: 'intermediate',
        }),
        buildSample({
          instruction: 'صغ رداً مهنياً للعميل يؤكد استلام طلب الصيانة وجدولة الزيارة الميدانية.',
          input: 'العميل: شركة المدار اللوجستية | رقم التذكرة: TKT-4091 | الموعد: غداً 10:30 صباحاً.',
          output:
            'السادة شركة المدار اللوجستية، نؤكد استلام طلب الصيانة رقم TKT-4091، وقد تم تأكيد موعد الزيارة الميدانية ليوم غد الساعة 10:30 صباحاً عبر الفريق الفني المختص.',
          difficulty: 'basic',
        }),
      ],
    },
    {
      id: 'ds-arabic-cot-reasoning',
      name: 'مسارات الاستدلال المنطقي والكمي (Arabic CoT Reasoning)',
      slug: 'alhelbawey-cot-reasoning-ar',
      descriptionAr:
        'بيانات تدريب مجهزة بمسارات التفكير التسلسلي (<think>) لتمكين النماذج المدمجة (1.5B–8B) من حل المسائل الحسابية والمنطقية وتخطيط الموارد بدقة عالية.',
      domain: 'reasoning-cot',
      format: 'CoT-Reasoning',
      languages: ['ar', 'ar-en'],
      license: 'MIT',
      version: '3.1.0',
      deduplicated: true,
      lastCuratedAt: now,
      recommendedBaseModels: ['qwen25-3b-q4', 'phi35-mini-q4', 'llama31-8b-q4'],
      samples: [
        buildSample({
          instruction:
            'يتطلب نشر نظام ذكاء اصطناعي محلي لدى عميل يملك خادماً بذاكرة 16 GB RAM تشغيل قاعدة بيانات (1.4 GB) وخادم تطبيقات (0.8 GB) مع إبقاء هامش أمان 20%. ما أقصى حجم RAM متاح لنموذج الذكاء الاصطناعي؟',
          input: 'إجمالي الذاكرة = 16 GB | قاعدة البيانات = 1.4 GB | الخادم = 0.8 GB | هامش الأمان = 20%.',
          reasoning:
            '1) نحسب هامش الأمان 20% من 16 GB = 3.2 GB.\n2) نطرح هامش الأمان من الإجمالي: 16 - 3.2 = 12.8 GB متاحة للعمليات.\n3) نطرح استهلاك قاعدة البيانات والخادم: 12.8 - (1.4 + 0.8) = 10.6 GB.',
          output: 'أقصى ذاكرة آمنة متاحة لتشغيل النموذج هي 10.6 GB RAM، ما يسمح بتشغيل نماذج 7B/8B بتكميم Q4_K_M بأمان.',
          difficulty: 'expert',
        }),
        buildSample({
          instruction:
            'إذا كان خط إنتاج برمجي ينجز 180 طلب تحليل عقود في الساعة بنموذج Qwen2.5-1.5B مقابل 65 طلباً بنموذج 7B، فما الزمن اللازم لمعالجة 540 عقداً على جهاز واحد؟',
          input: 'الكمية: 540 عقداً | معدل 1.5B = 180/ساعة | معدل 7B = 65/ساعة.',
          reasoning:
            'زمن نموذج 1.5B = 540 / 180 = 3.0 ساعات (180 دقيقة).\nزمن نموذج 7B = 540 / 65 = 8.31 ساعات (حوالي 8 ساعات و19 دقيقة).',
          output: 'يحتاج نموذج Qwen2.5-1.5B إلى 3 ساعات بالضبط، بينما يحتاج نموذج 7B إلى 8 ساعات و19 دقيقة تقريباً.',
          difficulty: 'intermediate',
        }),
      ],
    },
    {
      id: 'ds-tool-calling-agents',
      name: 'استدعاء الدوال والوكلاء الموثوق (Structured Tool-Calling)',
      slug: 'alhelbawey-tool-calling-schemas',
      descriptionAr:
        'عينات صارمة لتدريب النماذج المحلية على إخراج JSON مطابق للمخطط (Schema-Strict Function Calling) لاستعلام قواعد البيانات وتنفيذ وكلاء الأتمتة.',
      domain: 'tool-calling',
      format: 'Tool-Calling',
      languages: ['ar', 'code'],
      license: 'Apache-2.0',
      version: '2.0.1',
      deduplicated: true,
      lastCuratedAt: now,
      recommendedBaseModels: ['qwen25-15b-q4', 'qwen25-3b-q4', 'mistral-7b-q4'],
      samples: [
        buildSample({
          instruction: 'حول طلب المستخدم إلى استدعاء أداة JSON صالح للاستعلام عن الفواتير المتأخرة عن السداد.',
          input:
            'الأدوات المتاحة: query_invoices(status: "PAID"|"UNPAID"|"OVERDUE", min_amount: number, limit: number). طلب المستخدم: هات أعلى 10 فواتير متأخرة تتجاوز قيمتها 50 ألف ريال.',
          output: JSON.stringify(
            {
              tool_call: {
                name: 'query_invoices',
                arguments: { status: 'OVERDUE', min_amount: 50000, limit: 10 },
              },
            },
            null,
            2
          ),
          difficulty: 'expert',
        }),
        buildSample({
          instruction: 'نفذ استدعاء أداة للبحث في قاعدة المعرفة المحلية دون اتصال بالإنترنت.',
          input:
            'الأدوات: search_local_rag(query: string, top_k: number). طلب المستخدم: ابحث عن سياسة الاسترجاع والإلغاء في لائحة الموارد البشرية.',
          output: JSON.stringify(
            {
              tool_call: {
                name: 'search_local_rag',
                arguments: { query: 'سياسة الاسترجاع والإلغاء لائحة الموارد البشرية', top_k: 4 },
              },
            },
            null,
            2
          ),
          difficulty: 'intermediate',
        }),
      ],
    },
    {
      id: 'ds-fullstack-ts-sql',
      name: 'هندسة البرمجيات الكاملة (TypeScript, React, Express & SQL)',
      slug: 'alhelbawey-fullstack-code-chatml',
      descriptionAr:
        'حزمة برمجية ثنائية اللغة لتدريب نماذج الكود على بناء مكونات React آمنة، مسارات Express محمية، واستعلامات SQL ممررة المعاملات بدون ثغرات.',
      domain: 'code-fullstack',
      format: 'ChatML',
      languages: ['code', 'ar-en'],
      license: 'MIT',
      version: '2.8.0',
      deduplicated: true,
      lastCuratedAt: now,
      recommendedBaseModels: ['qwen25-3b-q4', 'llama31-8b-q4', 'gemma2-2b-q4'],
      samples: [
        buildSample({
          instruction: 'اكتب مسار Express محمي للتحقق من وجود السجل وتحديثه مع منع ثغرات Path Traversal.',
          input: 'المسار: PUT /api/items/:id | التحقق من صحة الحقول المطلوبة.',
          output: `app.put('/api/items/:id', (req, res) => {\n  const id = String(req.params.id || '').replace(/[^a-zA-Z0-9_-]/g, '');\n  if (!id || !req.body?.name) {\n    return res.status(400).json({ error: 'بيانات غير صالحة' });\n  }\n  const updated = db.updateItem(id, { name: String(req.body.name).trim() });\n  if (!updated) return res.status(404).json({ error: 'غير موجود' });\n  return res.json(updated);\n});`,
          difficulty: 'expert',
          language: 'code',
        }),
        buildSample({
          instruction: 'صمم جدول SQLite لإدارة عقود الصيانة مع قيود السلامة المرجعية والفهارس.',
          input: 'الحقول: معرف العقد، اسم العميل، القيمة، تاريخ الانتهاء، الحالة.',
          output: `CREATE TABLE IF NOT EXISTS maintenance_contracts (\n  id TEXT PRIMARY KEY,\n  client_name TEXT NOT NULL,\n  amount_sar REAL NOT NULL CHECK (amount_sar >= 0),\n  expires_at TEXT NOT NULL,\n  status TEXT NOT NULL DEFAULT 'ACTIVE'\n);\nCREATE INDEX IF NOT EXISTS idx_contracts_status ON maintenance_contracts(status);`,
          difficulty: 'intermediate',
          language: 'code',
        }),
      ],
    },
    {
      id: 'ds-dpo-alignment-arabic',
      name: 'ضبط التفضيل المباشر ومنع الهلوسة (DPO Preference Arabic)',
      slug: 'alhelbawey-dpo-grounding-ar',
      descriptionAr:
        'أزواج تفضيل مباشر (Chosen vs Rejected) لتدريب النماذج على رفض التخمين عندما تكون المعلومة غير موجودة في قاعدة البيانات المحلية.',
      domain: 'alignment-dpo',
      format: 'DPO-Preference',
      languages: ['ar'],
      license: 'Apache-2.0',
      version: '1.9.0',
      deduplicated: true,
      lastCuratedAt: now,
      recommendedBaseModels: ['qwen25-15b-q4', 'gemma2-2b-q4', 'mistral-7b-q4'],
      samples: [
        buildSample({
          instruction: 'كم بلغت نسبة الخصم المعتمدة في عرض شركة الرواد لشهر نوفمبر؟',
          input: 'السياق المتاح: يحتوي سجل العقود على عقد شركة أفق بمبلغ 120,000 ريال فقط، ولا توجد بيانات عن شركة الرواد.',
          output:
            'لا تتوفر في قاعدة البيانات المحلية أي سجلات أو عروض تخص "شركة الرواد" لشهر نوفمبر؛ السجل المتاح حالياً يخص "شركة أفق" فقط.',
          rejected:
            'تبلغ نسبة الخصم المعتمدة لشركة الرواد في شهر نوفمبر 15% حسب العروض الموسمية المعتادة.',
          difficulty: 'expert',
        }),
        buildSample({
          instruction: 'هل يعتمد التطبيق المصدر على الاتصال بالإنترنت لتلخيص الفواتير؟',
          input: 'مواصفات الحزمة: النموذج المدمج Qwen2.5-1.5B-Q4_K_M يعمل عبر llama.cpp محلياً.',
          output:
            'لا، يعمل التلخيص محلياً بالكامل عبر محرك llama.cpp والأوزان المدمجة داخل الحزمة دون الحاجة لأي اتصال خارجي بالإنترنت.',
          rejected:
            'يتطلب التطبيق إرسال ملخصات الفواتير إلى واجهة سحابية خارجية للحصول على أفضل دقة.',
          difficulty: 'intermediate',
        }),
      ],
    },
    {
      id: 'ds-offline-rag-grounding',
      name: 'الاسترجاع الموثق للوثائق العربية (Offline RAG QA)',
      slug: 'alhelbawey-offline-rag-sharegpt',
      descriptionAr:
        'حوارات متعددة الأدوار لتعزيز دقة الإجابة المقتبسة من مستندات السياسات واللوائح الداخلية دون خروج عن النص.',
      domain: 'rag-grounding',
      format: 'ShareGPT',
      languages: ['ar'],
      license: 'Apache-2.0',
      version: '2.1.0',
      deduplicated: true,
      lastCuratedAt: now,
      recommendedBaseModels: ['qwen25-05b-q4', 'qwen25-15b-q4', 'llama32-1b-q4'],
      samples: [
        buildSample({
          instruction: 'ما شروط صرف البدلات الميدانية للمهندسين وفق الفقرة المقتبسة؟',
          input:
            'المادة 14: يُصرف بدل العمل الميداني للمهندسين المكلفين بمهام خارج المقر الرئيسي بنسبة 15% من الراتب الأساسي بشرط إرفاق تقرير الإنجاز الميداني المعتمد خلال 5 أيام عمل.',
          output:
            'وفق المادة 14، يستحق المهندس المكلف بمهام خارج المقر الرئيسي بدلاً بنسبة 15% من الراتب الأساسي، بشرط اعتماد تقرير الإنجاز الميداني وإرفاقه خلال 5 أيام عمل.',
          difficulty: 'basic',
        }),
        buildSample({
          instruction: 'لخص خطوات النسخ الاحتياطي الموصى بها قبل ترقية أوزان النموذج.',
          input:
            'دليل التشغيل المحلي: قبل استبدال ملف GGUF، يجب أخذ نسخة احتياطية من مجلد ./data وملف ./ai/model.config.json والتحقق من تطابق بصمة SHA-256.',
          output:
            'تتضمن خطوات الأمان ثلاث مراحل: نسخ مجلد ./data احتياطياً، حفظ نسخة من ./ai/model.config.json، ومطابقة بصمة SHA-256 قبل التشغيل.',
          difficulty: 'intermediate',
        }),
      ],
    },
  ];

  return rawDatasets.map((ds) => recomputeDatasetMetrics({ ...ds, samplesCount: 0, totalTokensEstimate: 0, avgQualityScore: 0 }));
}
