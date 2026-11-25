import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  BrainTrainingAcceptanceTestResult,
  BrainTrainingCycle,
  BrainTrainingEvalDetail,
  BrainTrainingOfficeSnapshot,
  BrainTrainingReadiness,
  BrainVersionSnapshot,
  HelbaweyBootstrap,
  IroncladMemoryItem,
  PlatformBrainId,
  TrainingCycleStage,
  TrainingDomainGoalId,
  TrainingEngineMode,
} from '../src/types/helbawey.ts';
import { BRAIN_PROFILES } from './brainSelector.ts';
import { buildIroncladMemoryPromptSection, upsertMemoryItemInList } from './ironcladMemory.ts';
import { buildLegalExpertSystemPrompt } from './legalExpertKnowledge.ts';
import { getSelfHealingCenterStatus, recordSelfHealingModuleAlert } from './selfHealingCenter.ts';
import { loadStore, saveStore } from './store.ts';
import { buildSample, recomputeDatasetMetrics } from './trainingLibrary.ts';
import { scanRuntimeAndEngines } from './unifiedWeightsArchive.ts';
import { buildWeightsIntegrityReport } from './weightsIntegrity.ts';

const ROOT_DIR = process.cwd();
const DATA_DIR = path.resolve(ROOT_DIR, 'data');
const BT_DIR = path.resolve(DATA_DIR, 'brain-training');
const BT_CKPT_DIR = path.resolve(BT_DIR, 'checkpoints');
const BT_VERSIONS_DIR = path.resolve(BT_DIR, 'versions');
const BT_STATE_PATH = path.resolve(BT_DIR, 'state.json');

interface PersistedBrainTrainingState {
  activeVersions: Record<PlatformBrainId, string>;
  versions: BrainVersionSnapshot[];
  cycles: BrainTrainingCycle[];
  acceptanceTests: BrainTrainingAcceptanceTestResult[];
}

export interface DomainGoalDefinition {
  id: TrainingDomainGoalId;
  labelAr: string;
  descriptionAr: string;
  benchmarkPrompt: string;
  rubricKeywords: string[];
}

export const TRAINING_DOMAIN_GOALS: DomainGoalDefinition[] = [
  {
    id: 'reasoning-logic',
    labelAr: 'الاستدلال والمنطق',
    descriptionAr: 'تفكيك المبادئ الأولى، كشف المغالطات، والاختبار العكسي للفرضيات.',
    benchmarkPrompt:
      'حلّل باختصار قراراً تقنياً متسرعاً يعتمد على قاعدة بيانات غير مفهرسة: طبّق المبادئ الأولى واذكر الفرضية الأضعف وخطة التحقق العكسي.',
    rubricKeywords: ['المبادئ', 'فرضية', 'مخاطر', 'تحقق', 'بديل', 'قياس', 'فهرس'],
  },
  {
    id: 'science-engineering',
    labelAr: 'العلوم والهندسة',
    descriptionAr: 'هندسة النظم، الأمن السيبراني، التشفير، وتحسين الذاكرة والأداء.',
    benchmarkPrompt:
      'كيف تؤمّن نقل ملفات أوزان ضخمة وخدمة API ذكاء اصطناعي داخل مصنع برمجيات؟ اذكر خطوات SHA-256 وعزل الأسرار والتحقق.',
    rubricKeywords: ['SHA-256', 'أمان', 'خادم', 'ذاكرة', 'تحقق', 'عزل', 'مفاتيح'],
  },
  {
    id: 'legal-analysis',
    labelAr: 'القانون والتحليل القانوني',
    descriptionAr: 'الربط بين القوانين المحلية والدولية والعالمية وصياغة المذكرات والعقود.',
    benchmarkPrompt:
      'أعطِ تكييفاً قانونياً موجزاً لتأخر توريد برمجيات عابر للحدود في عقد يتضمن شرط تحكيم، مع بيان الأنظمة الحاكمة والمخاطر والتوصية.',
    rubricKeywords: ['عقد', 'تحكيم', 'قانون', 'تكييف', 'التزام', 'مخاطر', 'توصية'],
  },
  {
    id: 'economics-finance',
    labelAr: 'الاقتصاد والتحليل المالي',
    descriptionAr: 'تقييم NPV و IRR و TCO وبناء مصفوفة المخاطر والجدوى الاستثمارية.',
    benchmarkPrompt:
      'قارن مالياً بين استئجار بنية سحابية وتشغيل خادم محلي باستخدام NPV و TCO مع تحديد نقطة التعادل ومخاطر السيولة.',
    rubricKeywords: ['NPV', 'TCO', 'تكلفة', 'عائد', 'مخاطر', 'تعادل', 'سيولة'],
  },
  {
    id: 'programming-software',
    labelAr: 'البرمجة وإنشاء البرامج',
    descriptionAr: 'معمارية TypeScript/Node/React، حراسة المسارات، والاختبارات الفعلية.',
    benchmarkPrompt:
      'صمّم باختصار مسار API آمن في Express لقراءة ملفات من مجلد محدد مع منع Path Traversal ومعالجة الأخطاء وكتابة اختبار تحقق.',
    rubricKeywords: ['path', 'Express', 'تحقق', 'خطأ', 'أمان', 'اختبار', 'مسار'],
  },
  {
    id: 'arabic-translation',
    labelAr: 'اللغة العربية والترجمة',
    descriptionAr: 'الترجمة القانونية والتقنية الدقيقة متعددة اللغات وتوحيد المصطلحات.',
    benchmarkPrompt:
      'ترجم المصطلح القانوني والتقني التالي مع توحيد الصياغة العربية: "Indemnification and Force Majeure under SHA-256 integrity verification" ثم قدّم قاعدة معجمية موجزة.',
    rubricKeywords: ['تعويض', 'قوة قاهرة', 'ترجمة', 'مصطلح', 'معجم', 'بصمة', 'صياغة'],
  },
  {
    id: 'general-polymath',
    labelAr: 'المعرفة العامة والربط بين المجالات',
    descriptionAr: 'التركيب عابر التخصصات (هندسي + قانوني + مالي + إداري) بمنهجية الرشاد.',
    benchmarkPrompt:
      'قدّم رؤية متكاملة لإطلاق منصة ذكاء اصطناعي مؤسسية تربط بين الامتثال القانوني والهندسة الآمنة والجدوى المالية وخطة التنفيذ.',
    rubricKeywords: ['هندس', 'قانون', 'مال', 'خطة', 'مخاطر', 'تحقق', 'توصية'],
  },
  {
    id: 'custom',
    labelAr: 'هدف تدريبي مخصص',
    descriptionAr: 'تخصيص مجال أو مهارة محددة يضيفها المستخدم مع بياناتها التدريبية.',
    benchmarkPrompt:
      'حلّل الهدف التدريبي المخصص من المبادئ الأولى، وقدّم خطوات تنفيذ قابلة للقياس والتحقق والمخاطر المحتملة.',
    rubricKeywords: ['هدف', 'خطوات', 'تحقق', 'مخاطر', 'قياس', 'توصية'],
  },
];

function ensureDirs(): void {
  for (const d of [DATA_DIR, BT_DIR, BT_CKPT_DIR, BT_VERSIONS_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

function sha256Hex(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function sha256FileIfExists(filePath: string): string | null {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
  return sha256Hex(fs.readFileSync(filePath));
}

function computeSnapshotSha(
  snap: Pick<
    BrainVersionSnapshot,
    | 'version'
    | 'brainId'
    | 'createdAt'
    | 'trainingCycleId'
    | 'domainGoal'
    | 'summaryAr'
    | 'addedPrinciples'
    | 'addedPolicyDirectives'
    | 'linkedDatasetIds'
    | 'linkedModelId'
    | 'weightsSha256'
  >
): string {
  return sha256Hex(
    JSON.stringify({
      version: snap.version,
      brainId: snap.brainId,
      createdAt: snap.createdAt,
      trainingCycleId: snap.trainingCycleId,
      domainGoal: snap.domainGoal,
      summaryAr: snap.summaryAr,
      addedPrinciples: snap.addedPrinciples,
      addedPolicyDirectives: snap.addedPolicyDirectives,
      linkedDatasetIds: snap.linkedDatasetIds,
      linkedModelId: snap.linkedModelId,
      weightsSha256: snap.weightsSha256,
    })
  );
}

function writeSnapshotFile(snap: BrainVersionSnapshot): void {
  ensureDirs();
  const safeName = `${snap.brainId}-${snap.version}.snapshot.json`.replace(/[^a-zA-Z0-9._-]/g, '_');
  const full = path.resolve(BT_VERSIONS_DIR, safeName);
  if (!full.startsWith(BT_VERSIONS_DIR + path.sep)) {
    throw new Error('مسار حفظ إصدار العقل غير مصرح به.');
  }
  fs.writeFileSync(full, JSON.stringify(snap, null, 2), 'utf8');
}

function createInitialState(): PersistedBrainTrainingState {
  const now = new Date().toISOString();
  const baseAttiaNoSha: Omit<BrainVersionSnapshot, 'snapshotSha256'> = {
    version: 'v1.0.0',
    brainId: 'attia-advisor',
    createdAt: now,
    trainingCycleId: null,
    domainGoal: 'general-polymath',
    summaryAr: 'الإصدار التأسيسي لعقل المستشار عطيه الهلباوى المستقبل — منهج الرشاد والذاكرة الحديدية.',
    addedPrinciples: [
      'تفكيك المبادئ الأولى والتركيب عابر التخصصات (7 مجالات كبرى).',
      'الأمانة المعرفية المطلقة وعدم الادعاء بوجود أوزان محلية غير مرفوعة.',
    ],
    addedPolicyDirectives: [
      'الالتزام ببروتوكول الرشاد من 5 خطوات وتضمين مصفوفة مخاطر وتوصية حاسمة.',
    ],
    linkedDatasetIds: ['ds-omni-advisor-polymath'],
    linkedModelId: 'qwen25-15b-q4',
    weightsSha256: null,
    preEvalScore: null,
    postEvalScore: null,
    active: true,
  };
  const attiaV1: BrainVersionSnapshot = {
    ...baseAttiaNoSha,
    snapshotSha256: computeSnapshotSha(baseAttiaNoSha),
  };

  const baseGeminiNoSha: Omit<BrainVersionSnapshot, 'snapshotSha256'> = {
    version: 'v1.0.0',
    brainId: 'gemini-standard',
    createdAt: now,
    trainingCycleId: null,
    domainGoal: 'general-polymath',
    summaryAr: 'الإصدار المرجعي القياسي لعقل جيميني للمقارنة الموضوعية.',
    addedPrinciples: ['الاستجابة القياسية المباشرة دون حقن مناهج الرشاد.'],
    addedPolicyDirectives: [],
    linkedDatasetIds: [],
    linkedModelId: 'gemini-4-hydrogen',
    weightsSha256: null,
    preEvalScore: null,
    postEvalScore: null,
    active: true,
  };
  const geminiV1: BrainVersionSnapshot = {
    ...baseGeminiNoSha,
    snapshotSha256: computeSnapshotSha(baseGeminiNoSha),
  };

  writeSnapshotFile(attiaV1);
  writeSnapshotFile(geminiV1);

  return {
    activeVersions: {
      'attia-advisor': 'v1.0.0',
      'gemini-standard': 'v1.0.0',
    },
    versions: [attiaV1, geminiV1],
    cycles: [],
    acceptanceTests: [],
  };
}

function loadState(): PersistedBrainTrainingState {
  ensureDirs();
  if (!fs.existsSync(BT_STATE_PATH)) {
    const init = createInitialState();
    saveState(init);
    return init;
  }
  try {
    const raw = fs.readFileSync(BT_STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<PersistedBrainTrainingState>;
    if (!parsed.versions || !Array.isArray(parsed.versions) || parsed.versions.length === 0) {
      const init = createInitialState();
      saveState(init);
      return init;
    }
    return {
      activeVersions: parsed.activeVersions || {
        'attia-advisor': 'v1.0.0',
        'gemini-standard': 'v1.0.0',
      },
      versions: parsed.versions,
      cycles: Array.isArray(parsed.cycles) ? parsed.cycles : [],
      acceptanceTests: Array.isArray(parsed.acceptanceTests) ? parsed.acceptanceTests : [],
    };
  } catch {
    const fallback = createInitialState();
    saveState(fallback);
    return fallback;
  }
}

function saveState(state: PersistedBrainTrainingState): void {
  ensureDirs();
  const trimmed: PersistedBrainTrainingState = {
    ...state,
    cycles: state.cycles.slice(0, 60),
    versions: state.versions.slice(0, 60),
  };
  const tmpPath = path.resolve(BT_DIR, `state.${process.pid}.tmp.json`);
  fs.writeFileSync(tmpPath, JSON.stringify(trimmed, null, 2), 'utf8');
  fs.renameSync(tmpPath, BT_STATE_PATH);
}

function appendAuditLog(
  action: string,
  target: string,
  severity: 'INFO' | 'WARN' | 'SECURITY',
  details: string
): void {
  try {
    const store = loadStore();
    store.auditLogs.unshift({
      id: `aud-${crypto.randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      actor: 'مكتب التدريب الاحترافي للعقل',
      action,
      target,
      severity,
      details,
    });
    store.auditLogs = store.auditLogs.slice(0, 120);
    saveStore(store);
  } catch {
    // avoid secondary error if store unavailable
  }
}

export function getActiveBrainVersionInfo(brainId: PlatformBrainId): {
  version: string;
  directives: string[];
  principles: string[];
} {
  const st = loadState();
  const activeVer = st.activeVersions[brainId] || 'v1.0.0';
  const snap = st.versions.find((v) => v.brainId === brainId && v.version === activeVer);
  return {
    version: activeVer,
    directives: snap?.addedPolicyDirectives || [],
    principles: snap?.addedPrinciples || [],
  };
}

function nextUniqueSemverForBrain(
  brainId: PlatformBrainId,
  baseVersion: string,
  existingVersions: BrainVersionSnapshot[]
): string {
  const m = baseVersion.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  const major = m ? Number(m[1]) : 1;
  let maxMinor = m ? Number(m[2]) : 0;
  for (const v of existingVersions) {
    if (v.brainId !== brainId) continue;
    const vm = v.version.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
    if (vm && Number(vm[1]) === major) {
      maxMinor = Math.max(maxMinor, Number(vm[2]));
    }
  }
  return `v${major}.${maxMinor + 1}.0`;
}

export function getBrainTrainingReadiness(
  brainId: PlatformBrainId = 'attia-advisor',
  projectId?: string
): BrainTrainingReadiness {
  const store = loadStore();
  const state = loadState();
  const profile = BRAIN_PROFILES.find((p) => p.id === brainId) || BRAIN_PROFILES[0];
  const currentVersion = state.activeVersions[brainId] || 'v1.0.0';

  const integrity = buildWeightsIntegrityReport(store, projectId);
  const project =
    (projectId ? store.projects.find((p) => p.id === projectId) : undefined) || store.projects[0];
  const selectedRow =
    integrity.rows.find((r) => r.modelId === project?.selectedModelId) ||
    integrity.rows.find((r) => r.imported) ||
    integrity.rows[0] ||
    null;

  const engines = scanRuntimeAndEngines();
  const hasTorch = engines.some((e) => e.name === 'python:torch' && e.installed);
  const hasPeft = engines.some((e) => e.name === 'python:peft' && e.installed);
  const hasLlama = engines.some(
    (e) => (e.name === 'llama-server' || e.name === 'llama-cli') && e.installed
  );

  const localBlockers: string[] = [];
  if (integrity.importedCount === 0) {
    localBlockers.push('لا توجد ملفات أوزان عصبية (.gguf / .safetensors) مستوردة على القرص في data/weights/.');
  }
  if (integrity.mismatchCount > 0) {
    localBlockers.push(`رُصد ${integrity.mismatchCount} تعارض في بصمة SHA-256 لملفات الأوزان على القرص.`);
  }
  if (!hasTorch || !hasPeft) {
    localBlockers.push('حزم التدريب العصبي المحلية (python3: torch + peft / transformers) غير مثبتة في هذه البيئة.');
  }
  if (!hasLlama && integrity.importedCount === 0) {
    localBlockers.push('محرك الاستدلال المحلي (llama-server / llama-cli) غير مثبت لتقييم الأوزان المحلية دون إنترنت.');
  }

  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 8);
  const hasGenAiPkg = fs.existsSync(path.resolve(ROOT_DIR, 'node_modules/@google/genai'));
  const cognitiveBlockers: string[] = [];
  if (!hasGeminiKey) {
    cognitiveBlockers.push('مفتاح GEMINI_API_KEY غير مضبوط في متغيرات البيئة لتشغيل التقطير والتقييم الحقيقي.');
  }
  if (!hasGenAiPkg) {
    cognitiveBlockers.push('مكتبة @google/genai غير مثبتة في node_modules.');
  }
  if (integrity.mismatchCount > 0) {
    cognitiveBlockers.push('تعارض SHA-256 في الأوزان المسجلة يمنع الترقية قبل الفحص.');
  }
  if ((store.trainingDatasets || []).length === 0) {
    cognitiveBlockers.push('لا توجد مجموعات بيانات تدريبية معتمدة في مكتبة التدريب.');
  }

  const shStatus = getSelfHealingCenterStatus();

  return {
    brainId,
    brainTitleAr: profile.titleAr,
    brainSubtitleAr: profile.subtitleAr,
    currentVersion,
    localNeuralModeStatus: localBlockers.length === 0 ? 'READY' : 'BLOCKED',
    localNeuralBlockersAr: localBlockers,
    cognitiveModeStatus: cognitiveBlockers.length === 0 ? 'READY' : 'BLOCKED',
    cognitiveBlockersAr: cognitiveBlockers,
    linkedModel: selectedRow
      ? {
          id: selectedRow.modelId,
          name: selectedRow.modelName,
          format: selectedRow.format,
          quantization: selectedRow.quantization,
          license: selectedRow.license,
          importedOnDisk: selectedRow.imported,
          diskBytes: selectedRow.importedBytes,
          actualSha256: selectedRow.actualSha256,
          referenceSha256: selectedRow.referenceSha256,
          shaStatus: selectedRow.matchStatus,
        }
      : null,
    detectedEngines: engines.map((e) => ({
      name: e.name,
      category: e.category,
      installed: e.installed,
      version: e.version,
      path: e.path,
    })),
    selfHealingStatusVerdict: shStatus.overallHealthVerdict,
    ironcladMemoryCount: (store.platformChatMemory || []).length,
    approvedDatasets: (store.trainingDatasets || []).map((d) => ({
      id: d.id,
      name: d.name,
      domain: d.domain,
      samplesCount: d.samplesCount,
      avgQualityScore: d.avgQualityScore,
      format: d.format,
    })),
  };
}

export function getBrainTrainingOfficeSnapshot(
  brainId: PlatformBrainId = 'attia-advisor',
  projectId?: string
): BrainTrainingOfficeSnapshot {
  const state = loadState();
  const readiness = getBrainTrainingReadiness(brainId, projectId);
  return {
    readiness,
    versions: state.versions.filter((v) => v.brainId === brainId),
    cycles: state.cycles.filter((c) => c.brainId === brainId),
    acceptanceTests: state.acceptanceTests,
  };
}

export function addDomainTrainingSamples(params: {
  datasetId: string;
  samples: { instruction: string; input?: string; reasoning?: string; output: string }[];
}): { datasetId: string; addedCount: number; totalSamplesCount: number } {
  const store = loadStore();
  const idx = store.trainingDatasets.findIndex((d) => d.id === params.datasetId);
  if (idx === -1) {
    throw new Error('مجموعة البيانات التدريبية المستهدفة غير موجودة.');
  }
  const ds = store.trainingDatasets[idx];
  let addedCount = 0;
  for (const s of params.samples) {
    if (!s.instruction?.trim() || !s.output?.trim()) continue;
    ds.samples.unshift(
      buildSample({
        instruction: s.instruction.trim(),
        input: (s.input || '').trim(),
        reasoning: (s.reasoning || '').trim() || undefined,
        output: s.output.trim(),
        language: 'ar',
        difficulty: 'expert',
        source: 'curated',
      })
    );
    addedCount += 1;
  }
  const updated = recomputeDatasetMetrics(ds);
  store.trainingDatasets[idx] = updated;
  saveStore(store);

  appendAuditLog(
    'TRAINING_DATA_ADDED',
    updated.name,
    'INFO',
    `أُضيف ${addedCount} عينة تدريب مخصصة إلى ${updated.id} (الإجمالي: ${updated.samplesCount}).`
  );

  return {
    datasetId: updated.id,
    addedCount,
    totalSamplesCount: updated.samplesCount,
  };
}

function scoreResponseAgainstRubric(params: {
  prompt: string;
  responseText: string;
  rubricKeywords: string[];
  latencyMs: number;
  modelUsed: string;
  mode: BrainTrainingEvalDetail['mode'];
}): BrainTrainingEvalDetail {
  const text = params.responseText.trim();
  const lower = text.toLowerCase();
  const errorsDetected: string[] = [];

  if (!text || text.length < 40) {
    errorsDetected.push('المخرج قصير جداً أو فارغ ولا يكفي للإجابة المهنية (< 40 حرفاً).');
  }
  if (/^(error:|exception:|traceback\b|undefined response)/i.test(text) || lower.includes('undefined response')) {
    errorsDetected.push('ظهرت إشارات خطأ جوهري في مخرج التقييم.');
  }

  let matched = 0;
  for (const kw of params.rubricKeywords) {
    if (lower.includes(kw.toLowerCase())) {
      matched += 1;
    }
  }
  const keywordRatio = params.rubricKeywords.length > 0 ? matched / params.rubricKeywords.length : 0;

  // Structure score from real formatting signals (headings, bullet points/numbering, length coverage)
  const hasHeadingsOrNumbers = /(^|\n)\s*(#{1,4}\s|\d+[.)]|[-*]\s)/m.test(text);
  const lengthScore = Math.min(25, Math.round((text.length / 450) * 25));
  const structureScore = hasHeadingsOrNumbers ? 15 : 4;
  const keywordScore = Math.round(keywordRatio * 60);
  const penalty = errorsDetected.length * 30;
  const rawScore = Math.max(0, Math.min(100, keywordScore + lengthScore + structureScore - penalty));

  return {
    evaluatedAt: new Date().toISOString(),
    mode: params.mode,
    modelUsed: params.modelUsed,
    prompt: params.prompt,
    responsePreview: text.slice(0, 600),
    responseCharCount: text.length,
    latencyMs: params.latencyMs,
    criteriaMatched: matched,
    criteriaTotal: params.rubricKeywords.length,
    score: Number(rawScore.toFixed(1)),
    errorsDetected,
  };
}

const FREE_TIER_CLOUD_MODELS = ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'] as const;
const modelCooldownUntil = new Map<string, number>();

async function generateWithCloudModelFallback(params: {
  ai: GoogleGenAI;
  contents: string;
  systemInstruction: string;
  thinkingLevel: ThinkingLevel;
  responseMimeType?: string;
  responseSchema?: Record<string, unknown>;
  preferModel?: (typeof FREE_TIER_CLOUD_MODELS)[number];
}): Promise<{ text: string; modelUsed: string; latencyMs: number }> {
  const ordered = params.preferModel
    ? [params.preferModel, ...FREE_TIER_CLOUD_MODELS.filter((m) => m !== params.preferModel)]
    : [...FREE_TIER_CLOUD_MODELS];

  const now = Date.now();
  const activeCandidates = ordered.filter((m) => (modelCooldownUntil.get(m) || 0) <= now);
  const candidates = activeCandidates.length > 0 ? activeCandidates : ordered;

  const modelErrors: string[] = [];
  for (const model of candidates) {
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const t0 = Date.now();
      try {
        const resp = await params.ai.models.generateContent({
          model,
          contents: params.contents,
          config: {
            systemInstruction: params.systemInstruction,
            thinkingConfig: {
              thinkingLevel:
                model === 'gemini-3.1-flash-lite'
                  ? ThinkingLevel.MINIMAL
                  : params.thinkingLevel,
            },
            ...(params.responseMimeType ? { responseMimeType: params.responseMimeType } : {}),
            ...(params.responseSchema ? { responseSchema: params.responseSchema } : {}),
          },
        });
        return {
          text: (resp.text || '').trim(),
          modelUsed: model,
          latencyMs: Math.max(1, Date.now() - t0),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isQuota =
          msg.includes('429') ||
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('Quota exceeded');
        const isTransient = msg.includes('503') || msg.includes('UNAVAILABLE');
        if (isQuota) {
          modelErrors.push(`${model}: 429/QUOTA`);
          modelCooldownUntil.set(model, Date.now() + 15 * 60 * 1000);
          break;
        }
        if (isTransient && attempt + 1 < maxAttempts) {
          await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
          continue;
        }
        if (isTransient) {
          modelErrors.push(`${model}: 503/UNAVAILABLE`);
          break;
        }
        throw new Error(`تعذر إتمام الاتصال السحابي عبر ${model}: ${msg}`);
      }
    }
  }
  throw new Error(`تعذر إتمام التقييم السحابي الحقيقي [${modelErrors.join(' | ')}].`);
}

async function runLiveBrainEval(params: {
  store: HelbaweyBootstrap;
  brainId: PlatformBrainId;
  domainGoal: DomainGoalDefinition;
  customGoalAr: string;
  extraPrinciples: string[];
  extraDirectives: string[];
}): Promise<BrainTrainingEvalDetail> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY غير مضبوط لتشغيل التقييم الحقيقي.');
  }
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: { 'User-Agent': 'aistudio-build' },
    },
  });

  const prompt =
    params.domainGoal.id === 'custom' && params.customGoalAr
      ? `في مجال "${params.customGoalAr}": ${params.domainGoal.benchmarkPrompt}`
      : params.domainGoal.benchmarkPrompt;

  const { sectionText: memSection } = buildIroncladMemoryPromptSection({
    store: params.store,
    query: prompt,
    activeProjectId: params.store.projects[0]?.id,
  });

  const systemParts: string[] = [];
  if (params.brainId === 'attia-advisor') {
    systemParts.push(
      buildLegalExpertSystemPrompt({
        scope: 'global-comparative',
        activeProject: params.store.projects[0],
        includePlatformContext: false,
      })
    );
    if (memSection) systemParts.push(memSection);
  } else {
    systemParts.push('أنت نموذج جيميني القياسي. أجب بدقة وإيجاز منظم.');
  }

  if (params.extraPrinciples.length > 0 || params.extraDirectives.length > 0) {
    systemParts.push(
      '=== المعرفة والضوابط المطوّرة في هذه الدورة ===\n' +
        [...params.extraPrinciples, ...params.extraDirectives].map((p, i) => `${i + 1}. ${p}`).join('\n')
    );
  }

  const out = await generateWithCloudModelFallback({
    ai,
    contents: prompt,
    systemInstruction: systemParts.join('\n\n'),
    thinkingLevel: params.brainId === 'attia-advisor' ? ThinkingLevel.MEDIUM : ThinkingLevel.LOW,
  });

  return scoreResponseAgainstRubric({
    prompt,
    responseText: out.text,
    rubricKeywords: params.domainGoal.rubricKeywords,
    latencyMs: out.latencyMs,
    modelUsed: out.modelUsed,
    mode: 'live-llm',
  });
}

async function distillKnowledgeBatchWithGemini(params: {
  goal: DomainGoalDefinition;
  customGoalAr: string;
  samplesSlice: { instruction: string; input: string; output: string }[];
}): Promise<{ principles: string[]; directives: string[] }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY مفقود أثناء تنفيذ التقطير المعرفي.');
  }
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: { 'User-Agent': 'aistudio-build' },
    },
  });

  const goalName = params.customGoalAr || params.goal.labelAr;
  const samplesText = params.samplesSlice
    .slice(0, 6)
    .map((s, i) => `عينة ${i + 1}: س=${s.instruction.slice(0, 180)} | ج=${s.output.slice(0, 240)}`)
    .join('\n');

  const out = await generateWithCloudModelFallback({
    ai,
    preferModel: 'gemini-3.1-flash-lite',
    contents: `المجال المستهدف: ${goalName}\n\nعينات التدريب الفعلية:\n${samplesText}\n\nاستخلص قاعدتين تنفيذيتين دقيقتين ومبدأين معرفيين لرفع كفاءة الاستدلال والالتزام بمصطلحات المجال (${params.goal.rubricKeywords.join('، ')}).`,
    systemInstruction:
      'أنت مدرب معرفي هندسي تستخلص قواعد استدلال وتدقيق دقيقة بصيغة JSON فقط دون حشو.',
    thinkingLevel: ThinkingLevel.LOW,
    responseMimeType: 'application/json',
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        principles: { type: Type.ARRAY, items: { type: Type.STRING } },
        directives: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
    },
  });

  const parsed = JSON.parse(out.text || '{}') as {
    principles?: string[];
    directives?: string[];
  };
  return {
    principles: (parsed.principles || []).filter(Boolean).slice(0, 3),
    directives: (parsed.directives || []).filter(Boolean).slice(0, 3),
  };
}

function writeCycleCheckpoint(cycle: BrainTrainingCycle): { pathRel: string; sha256: string } {
  ensureDirs();
  const fileName = `${cycle.id}.ckpt.json`.replace(/[^a-zA-Z0-9._-]/g, '_');
  const fullPath = path.resolve(BT_CKPT_DIR, fileName);
  if (!fullPath.startsWith(BT_CKPT_DIR + path.sep)) {
    throw new Error('مسار حفظ Checkpoint غير مسموح به.');
  }
  const payload = JSON.stringify(
    {
      cycleId: cycle.id,
      brainId: cycle.brainId,
      brainVersionBefore: cycle.brainVersionBefore,
      domainGoal: cycle.domainGoal,
      datasetId: cycle.datasetId,
      completedSteps: cycle.completedSteps,
      totalSteps: cycle.totalSteps,
      stagedPrinciples: cycle.stagedPrinciples,
      stagedDirectives: cycle.stagedDirectives,
      preEval: cycle.preEval,
      savedAt: new Date().toISOString(),
    },
    null,
    2
  );
  fs.writeFileSync(fullPath, payload, 'utf8');
  const sha = sha256Hex(payload);
  fs.writeFileSync(`${fullPath}.sha256`, sha, 'utf8');
  return {
    pathRel: path.relative(ROOT_DIR, fullPath),
    sha256: sha,
  };
}

function finalizeCandidateAndPromote(params: {
  state: PersistedBrainTrainingState;
  cycle: BrainTrainingCycle;
  postEval: BrainTrainingEvalDetail;
  goal: DomainGoalDefinition;
}): BrainTrainingCycle {
  const { state, cycle, postEval, goal } = params;
  const preScore = cycle.preEval?.score ?? 0;
  cycle.postEval = postEval;
  cycle.logs.push({
    at: new Date().toISOString(),
    stage: 'POST_EVAL_DONE',
    messageAr: `اكتمل التقييم البعدي: الدرجة قبل=${preScore}% · الدرجة بعد=${postEval.score}% (${postEval.criteriaMatched}/${postEval.criteriaTotal} معيار · ${postEval.latencyMs}ms).`,
  });

  // Strict regression / quality gate: REJECT if degraded or critical errors detected
  if (postEval.score < preScore || postEval.errorsDetected.length > 0) {
    cycle.stage = 'REJECTED_REGRESSION';
    cycle.status = 'REJECTED_REGRESSION';
    cycle.canResume = false;
    cycle.brainVersionAfter = null;
    const reason =
      postEval.errorsDetected.length > 0
        ? `رُفض الاعتماد بسبب أخطاء جوهرية: ${postEval.errorsDetected.join('؛ ')}`
        : `رُفض الاعتماد التلقائي لتراجع الجودة (${postEval.score}% < ${preScore}%). تم الإبقاء على الإصدار ${cycle.brainVersionBefore} دون تغيير.`;
    cycle.blockersAr = [reason];
    cycle.logs.push({
      at: new Date().toISOString(),
      stage: 'REJECTED_REGRESSION',
      messageAr: reason,
    });
    cycle.updatedAt = new Date().toISOString();

    recordSelfHealingModuleAlert({
      severity: 'WARNING',
      sourceModuleId: 'brain-training-office',
      titleAr: `رفض ترقية العقل لتراجع الجودة (${cycle.brainId})`,
      evidenceAr: reason,
      linkedRecordId: cycle.id,
    });
    appendAuditLog('BRAIN_TRAINING_REJECTED_REGRESSION', cycle.id, 'WARN', reason);
    return cycle;
  }

  // Quality verified >= preScore -> Promote to new BrainVersionSnapshot
  const nextVersion = nextUniqueSemverForBrain(
    cycle.brainId,
    cycle.brainVersionBefore,
    state.versions
  );
  const store = loadStore();
  let memory: IroncladMemoryItem[] = Array.isArray(store.platformChatMemory)
    ? [...store.platformChatMemory]
    : [];

  for (const p of cycle.stagedPrinciples) {
    memory = upsertMemoryItemInList(memory, {
      category: 'user-rule',
      title: `[تطوير ${nextVersion} · ${goal.labelAr}] ${p.slice(0, 80)}`,
      content: p,
      tags: ['omni-brain', 'brain-training', goal.id, nextVersion],
      pinned: true,
      sourceType: 'user-pinned',
      projectId: store.projects[0]?.id,
    });
  }
  store.platformChatMemory = memory;
  saveStore(store);

  // Deactivate previous snapshot for this brain without deleting it!
  for (const v of state.versions) {
    if (v.brainId === cycle.brainId) v.active = false;
  }

  const prevSnapshot = state.versions.find(
    (v) => v.brainId === cycle.brainId && v.version === cycle.brainVersionBefore
  );

  const weightsReport = buildWeightsIntegrityReport(store);
  const linkedRow = weightsReport.rows.find((r) => r.modelId === cycle.linkedModelId);

  const newSnapNoSha: Omit<BrainVersionSnapshot, 'snapshotSha256'> = {
    version: nextVersion,
    brainId: cycle.brainId,
    createdAt: new Date().toISOString(),
    trainingCycleId: cycle.id,
    domainGoal: cycle.domainGoal,
    summaryAr: `ترقية موثقة في مجال "${cycle.customGoalAr || goal.labelAr}" (${preScore}% -> ${postEval.score}%).`,
    addedPrinciples: [...(prevSnapshot?.addedPrinciples || []), ...cycle.stagedPrinciples].slice(-16),
    addedPolicyDirectives: [
      ...(prevSnapshot?.addedPolicyDirectives || []),
      ...cycle.stagedDirectives,
    ].slice(-16),
    linkedDatasetIds: Array.from(
      new Set([...(prevSnapshot?.linkedDatasetIds || []), cycle.datasetId].filter(Boolean))
    ),
    linkedModelId: cycle.linkedModelId,
    weightsSha256: linkedRow?.actualSha256 || null,
    preEvalScore: preScore,
    postEvalScore: postEval.score,
    active: true,
  };
  const newSnap: BrainVersionSnapshot = {
    ...newSnapNoSha,
    snapshotSha256: computeSnapshotSha(newSnapNoSha),
  };

  state.versions.unshift(newSnap);
  state.activeVersions[cycle.brainId] = nextVersion;
  writeSnapshotFile(newSnap);

  cycle.brainVersionAfter = nextVersion;
  cycle.stage = 'PROMOTED';
  cycle.status = 'COMPLETED_PROMOTED';
  cycle.canResume = false;
  cycle.logs.push({
    at: new Date().toISOString(),
    stage: 'PROMOTED',
    messageAr: `تم اعتماد الإصدار الجديد ${nextVersion} رسمياً وحفظ بصمة اللقطة (${newSnap.snapshotSha256.slice(0, 12)}...) مع صون الذاكرة الحديدية (${memory.length} سجل).`,
  });
  cycle.updatedAt = new Date().toISOString();

  appendAuditLog(
    'BRAIN_VERSION_PROMOTED',
    `${cycle.brainId}@${nextVersion}`,
    'INFO',
    `ترقية ناجحة من ${cycle.brainVersionBefore} إلى ${nextVersion}: التقييم ${preScore}% -> ${postEval.score}%.`
  );

  return cycle;
}

export async function startBrainTrainingCycle(params: {
  brainId?: PlatformBrainId;
  engineMode?: TrainingEngineMode;
  domainGoal?: TrainingDomainGoalId;
  customGoalAr?: string;
  datasetId?: string;
  linkedModelId?: string;
  epochs?: number;
  batchSize?: number;
  learningRate?: string;
  loraRank?: number;
  pauseAfterCheckpoint?: boolean;
  injectRegressionCandidateForTest?: boolean;
  baselinePreEval?: BrainTrainingEvalDetail | null;
}): Promise<BrainTrainingCycle> {
  const brainId: PlatformBrainId =
    params.brainId === 'gemini-standard' ? 'gemini-standard' : 'attia-advisor';
  const engineMode: TrainingEngineMode =
    params.engineMode === 'local-lora' ? 'local-lora' : 'advisor-cognitive-distillation';
  const domainGoalId: TrainingDomainGoalId =
    TRAINING_DOMAIN_GOALS.some((g) => g.id === params.domainGoal)
      ? (params.domainGoal as TrainingDomainGoalId)
      : 'general-polymath';
  const goalDef = TRAINING_DOMAIN_GOALS.find((g) => g.id === domainGoalId)!;

  const store = loadStore();
  const state = loadState();
  const readiness = getBrainTrainingReadiness(brainId);
  const dataset =
    store.trainingDatasets.find((d) => d.id === params.datasetId) ||
    store.trainingDatasets.find((d) => d.id === 'ds-omni-advisor-polymath') ||
    store.trainingDatasets[0];
  const linkedModelId =
    params.linkedModelId ||
    readiness.linkedModel?.id ||
    store.projects[0]?.selectedModelId ||
    'qwen25-15b-q4';

  const now = new Date().toISOString();
  const totalSteps = 2;
  const cycle: BrainTrainingCycle = {
    id: `btc-${crypto.randomUUID().slice(0, 8)}`,
    brainId,
    brainVersionBefore: readiness.currentVersion,
    brainVersionAfter: null,
    engineMode,
    domainGoal: domainGoalId,
    customGoalAr: (params.customGoalAr || '').trim(),
    datasetId: dataset?.id || '',
    linkedModelId,
    config: {
      epochs: Math.max(1, Math.min(10, Number(params.epochs || 2))),
      batchSize: Math.max(1, Math.min(32, Number(params.batchSize || 4))),
      learningRate: params.learningRate || '2e-4',
      loraRank: Math.max(4, Math.min(64, Number(params.loraRank || 16))),
      maxSteps: totalSteps,
      preserveIroncladMemory: true,
    },
    stage: 'GOAL_SELECTED',
    status: 'RUNNING',
    completedSteps: 0,
    totalSteps,
    checkpointPath: null,
    checkpointSha256: null,
    canResume: false,
    preEval: null,
    postEval: null,
    stagedPrinciples: [],
    stagedDirectives: [],
    logs: [
      {
        at: now,
        stage: 'GOAL_SELECTED',
        messageAr: `اختيار هدف التطوير: ${params.customGoalAr?.trim() || goalDef.labelAr} على ${readiness.brainTitleAr} (${readiness.currentVersion}).`,
      },
      {
        at: now,
        stage: 'DATA_PREPARED',
        messageAr: dataset
          ? `تجهيز مجموعة البيانات "${dataset.name}" (${dataset.samplesCount} عينة · جودة ${dataset.avgQualityScore}%).`
          : 'لم يتم العثور على مجموعة بيانات معتمدة.',
      },
    ],
    blockersAr: [],
    createdAt: now,
    updatedAt: now,
  };

  // Prerequisite / Engine / Weights Gate
  const blockers =
    engineMode === 'local-lora'
      ? readiness.localNeuralBlockersAr
      : readiness.cognitiveBlockersAr;

  if (!dataset || dataset.samplesCount === 0) {
    blockers.push('مجموعة البيانات التدريبية فارغة أو غير موجودة.');
  }

  if (blockers.length > 0) {
    cycle.stage = 'BLOCKED';
    cycle.status = 'BLOCKED';
    cycle.blockersAr = [...blockers];
    cycle.logs.push({
      at: new Date().toISOString(),
      stage: 'BLOCKED',
      messageAr: `توقفت الدورة عند فحص المتطلبات (BLOCKED): ${blockers.join(' | ')}`,
    });
    cycle.updatedAt = new Date().toISOString();
    state.cycles.unshift(cycle);
    saveState(state);

    recordSelfHealingModuleAlert({
      severity: 'WARNING',
      sourceModuleId: 'brain-training-office',
      titleAr: `إيقاف دورة تدريب (${engineMode}) لعدم توفر الأوزان أو المحرك`,
      evidenceAr: blockers.join(' — '),
      linkedRecordId: cycle.id,
    });
    appendAuditLog('BRAIN_TRAINING_BLOCKED', cycle.id, 'WARN', blockers.join(' | '));
    return cycle;
  }

  cycle.logs.push({
    at: new Date().toISOString(),
    stage: 'PREREQS_CHECKED',
    messageAr: `نجح فحص الجاهزية: @google/genai متاح · تعارضات SHA-256 = 0 · الذاكرة الحديدية = ${readiness.ironcladMemoryCount} سجل.`,
  });

  try {
    // 1. Pre-Training Evaluation
    const prevSnap = state.versions.find(
      (v) => v.brainId === brainId && v.version === readiness.currentVersion
    );
    const preEval =
      params.injectRegressionCandidateForTest && params.baselinePreEval
        ? params.baselinePreEval
        : await runLiveBrainEval({
            store,
            brainId,
            domainGoal: goalDef,
            customGoalAr: cycle.customGoalAr,
            extraPrinciples: prevSnap?.addedPrinciples || [],
            extraDirectives: prevSnap?.addedPolicyDirectives || [],
          });
    cycle.preEval = preEval;
    cycle.stage = 'PRE_EVAL_DONE';
    cycle.logs.push({
      at: new Date().toISOString(),
      stage: 'PRE_EVAL_DONE',
      messageAr: `اكتمل اختبار المستوى الحالي (Pre-Eval): ${preEval.score}% (${preEval.criteriaMatched}/${preEval.criteriaTotal} معيار · ${preEval.latencyMs}ms).`,
    });

    if (params.injectRegressionCandidateForTest) {
      cycle.completedSteps = totalSteps;
      const degradedPost = scoreResponseAgainstRubric({
        prompt: preEval.prompt,
        responseText: 'Error: corrupted response output.',
        rubricKeywords: goalDef.rubricKeywords,
        latencyMs: 12,
        modelUsed: 'regression-gate-candidate',
        mode: 'rubric-audit',
      });
      finalizeCandidateAndPromote({ state, cycle, postEval: degradedPost, goal: goalDef });
      state.cycles.unshift(cycle);
      saveState(state);
      return cycle;
    }

    // 2. Real Training Step 1 -> Distill Batch 1 + Save Checkpoint
    const distilled1 = await distillKnowledgeBatchWithGemini({
      goal: goalDef,
      customGoalAr: cycle.customGoalAr,
      samplesSlice: dataset.samples.slice(0, 4),
    });
    cycle.stagedPrinciples.push(...distilled1.principles);
    cycle.stagedDirectives.push(...distilled1.directives);
    cycle.completedSteps = 1;
    cycle.stage = 'CHECKPOINT_SAVED';

    const ckpt = writeCycleCheckpoint(cycle);
    cycle.checkpointPath = ckpt.pathRel;
    cycle.checkpointSha256 = ckpt.sha256;
    cycle.logs.push({
      at: new Date().toISOString(),
      stage: 'CHECKPOINT_SAVED',
      messageAr: `حفظ Checkpoint (الخطوة 1/${totalSteps}) في ${ckpt.pathRel} ببصمة SHA-256: ${ckpt.sha256.slice(0, 14)}...`,
    });

    if (params.pauseAfterCheckpoint) {
      cycle.status = 'PAUSED_CHECKPOINT';
      cycle.canResume = true;
      cycle.updatedAt = new Date().toISOString();
      state.cycles.unshift(cycle);
      saveState(state);
      appendAuditLog(
        'BRAIN_TRAINING_CHECKPOINT_PAUSED',
        cycle.id,
        'INFO',
        `حُفظت نقطة استئناف عند الخطوة 1/${totalSteps} (${ckpt.sha256.slice(0, 12)}).`
      );
      return cycle;
    }

    // 3. Training Step 2 + Post-Eval + Promote/Reject

    // Step 2 distillation on remaining samples
    const secondSlice = dataset.samples.slice(4, 8);
    if (secondSlice.length > 0) {
      const distilled2 = await distillKnowledgeBatchWithGemini({
        goal: goalDef,
        customGoalAr: cycle.customGoalAr,
        samplesSlice: secondSlice,
      });
      cycle.stagedPrinciples.push(...distilled2.principles);
      cycle.stagedDirectives.push(...distilled2.directives);
    }
    cycle.completedSteps = totalSteps;
    const ckpt2 = writeCycleCheckpoint(cycle);
    cycle.checkpointPath = ckpt2.pathRel;
    cycle.checkpointSha256 = ckpt2.sha256;

    const postEval = await runLiveBrainEval({
      store,
      brainId,
      domainGoal: goalDef,
      customGoalAr: cycle.customGoalAr,
      extraPrinciples: [...(prevSnap?.addedPrinciples || []), ...cycle.stagedPrinciples],
      extraDirectives: [...(prevSnap?.addedPolicyDirectives || []), ...cycle.stagedDirectives],
    });
    finalizeCandidateAndPromote({ state, cycle, postEval, goal: goalDef });
    state.cycles.unshift(cycle);
    saveState(state);
    return cycle;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'فشل غير متوقع أثناء دورة التدريب.';
    cycle.status = 'FAILED';
    cycle.blockersAr = [msg];
    cycle.logs.push({
      at: new Date().toISOString(),
      stage: cycle.stage,
      messageAr: `فشلت الدورة التدريبية: ${msg}`,
    });
    cycle.updatedAt = new Date().toISOString();
    state.cycles.unshift(cycle);
    saveState(state);

    recordSelfHealingModuleAlert({
      severity: 'ERROR',
      sourceModuleId: 'brain-training-office',
      titleAr: `إخفاق دورة تدريب العقل (${cycle.id})`,
      evidenceAr: msg,
      linkedRecordId: cycle.id,
    });
    return cycle;
  }
}

export async function resumeBrainTrainingCycle(cycleId: string): Promise<BrainTrainingCycle> {
  const state = loadState();
  const idx = state.cycles.findIndex((c) => c.id === cycleId);
  if (idx === -1) {
    throw new Error('دورة التدريب غير موجودة.');
  }
  const cycle = state.cycles[idx];
  if (!cycle.canResume || cycle.status !== 'PAUSED_CHECKPOINT') {
    throw new Error('هذه الدورة ليست في حالة Checkpoint قابلة للاستئناف.');
  }
  if (!cycle.checkpointPath || !cycle.checkpointSha256) {
    throw new Error('لا يوجد ملف Checkpoint مسجل لهذه الدورة.');
  }

  const fullCkpt = path.resolve(ROOT_DIR, cycle.checkpointPath);
  if (!fullCkpt.startsWith(BT_CKPT_DIR + path.sep) || !fs.existsSync(fullCkpt)) {
    throw new Error('ملف Checkpoint مفقود على القرص.');
  }
  const actualSha = sha256FileIfExists(fullCkpt);
  if (actualSha !== cycle.checkpointSha256) {
    recordSelfHealingModuleAlert({
      severity: 'CRITICAL',
      sourceModuleId: 'brain-training-office',
      titleAr: `تعارض SHA-256 في ملف Checkpoint للدورة ${cycle.id}`,
      evidenceAr: `المتوقع=${cycle.checkpointSha256} · الفعلي=${actualSha}`,
      linkedRecordId: cycle.id,
    });
    throw new Error('فشل التحقق من بصمة SHA-256 لملف Checkpoint — تم رفض الاستئناف حمايةً لسلامة العقل.');
  }

  const store = loadStore();
  const goalDef =
    TRAINING_DOMAIN_GOALS.find((g) => g.id === cycle.domainGoal) || TRAINING_DOMAIN_GOALS[0];
  const dataset =
    store.trainingDatasets.find((d) => d.id === cycle.datasetId) || store.trainingDatasets[0];

  cycle.status = 'RUNNING';
  cycle.stage = 'TRAINING_RUNNING';
  cycle.logs.push({
    at: new Date().toISOString(),
    stage: 'TRAINING_RUNNING',
    messageAr: `استئناف التدريب من Checkpoint موثق (SHA-256: ${actualSha.slice(0, 12)}...) من الخطوة ${cycle.completedSteps}/${cycle.totalSteps}.`,
  });

  try {
    const secondSlice = dataset ? dataset.samples.slice(4, 8) : [];
    if (secondSlice.length > 0) {
      const distilled2 = await distillKnowledgeBatchWithGemini({
        goal: goalDef,
        customGoalAr: cycle.customGoalAr,
        samplesSlice: secondSlice,
      });
      cycle.stagedPrinciples.push(...distilled2.principles);
      cycle.stagedDirectives.push(...distilled2.directives);
    }
    cycle.completedSteps = cycle.totalSteps;
    const ckpt2 = writeCycleCheckpoint(cycle);
    cycle.checkpointPath = ckpt2.pathRel;
    cycle.checkpointSha256 = ckpt2.sha256;

    const prevSnap = state.versions.find(
      (v) => v.brainId === cycle.brainId && v.version === cycle.brainVersionBefore
    );
    const postEval = await runLiveBrainEval({
      store,
      brainId: cycle.brainId,
      domainGoal: goalDef,
      customGoalAr: cycle.customGoalAr,
      extraPrinciples: [...(prevSnap?.addedPrinciples || []), ...cycle.stagedPrinciples],
      extraDirectives: [...(prevSnap?.addedPolicyDirectives || []), ...cycle.stagedDirectives],
    });

    finalizeCandidateAndPromote({ state, cycle, postEval, goal: goalDef });
    state.cycles[idx] = cycle;
    saveState(state);
    return cycle;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'فشل غير متوقع أثناء استئناف Checkpoint.';
    cycle.status = 'FAILED';
    cycle.canResume = true;
    cycle.blockersAr = [msg];
    cycle.logs.push({
      at: new Date().toISOString(),
      stage: cycle.stage,
      messageAr: `تعذر إتمام الاستئناف من Checkpoint: ${msg}`,
    });
    cycle.updatedAt = new Date().toISOString();
    state.cycles[idx] = cycle;
    saveState(state);
    recordSelfHealingModuleAlert({
      severity: 'ERROR',
      sourceModuleId: 'brain-training-office',
      titleAr: `تعذر إتمام استئناف تدريب العقل (${cycle.id})`,
      evidenceAr: msg,
      linkedRecordId: cycle.id,
    });
    return cycle;
  }
}

export function rollbackBrainVersion(
  brainId: PlatformBrainId,
  targetVersion: string
): BrainVersionSnapshot {
  const state = loadState();
  const target = state.versions.find(
    (v) => v.brainId === brainId && v.version === targetVersion
  );
  if (!target) {
    throw new Error(`الإصدار ${targetVersion} غير موجود في سجل إصدارات هذا العقل.`);
  }
  const { snapshotSha256: _ignored, active: _active, preEvalScore: _pre, postEvalScore: _post, ...rest } =
    target;
  const recomputed = computeSnapshotSha(rest);
  if (recomputed !== target.snapshotSha256) {
    throw new Error('تعذر التراجع: بصمة SHA-256 للقطة الإصدار غير مطابقة.');
  }

  for (const v of state.versions) {
    if (v.brainId === brainId) {
      v.active = v.version === targetVersion;
    }
  }
  state.activeVersions[brainId] = targetVersion;
  saveState(state);

  appendAuditLog(
    'BRAIN_VERSION_ROLLED_BACK',
    `${brainId}@${targetVersion}`,
    'INFO',
    `تم التراجع الآمن لإصدار العقل ${brainId} إلى ${targetVersion} دون المساس بالذاكرة الحديدية.`
  );

  return target;
}

export async function runBrainTrainingAcceptanceSuite(): Promise<
  BrainTrainingAcceptanceTestResult[]
> {
  const results: BrainTrainingAcceptanceTestResult[] = [];
  const storeBefore = loadStore();
  const stateBefore = loadState();
  const prevActiveAttiaVersion = stateBefore.activeVersions['attia-advisor'] || 'v1.0.0';
  const memCountBefore = (storeBefore.platformChatMemory || []).length;
  const projectsBefore = storeBefore.projects.length;

  // Test 1: Button & Route reachability for target brain
  {
    const t0 = Date.now();
    const res = await fetch('http://127.0.0.1:3000/api/brain-training/office?brainId=attia-advisor').catch(
      () => null
    );
    const json = res && res.ok ? ((await res.json()) as BrainTrainingOfficeSnapshot) : null;
    const pass = Boolean(res?.ok && json?.readiness.brainId === 'attia-advisor');
    results.push({
      id: 1,
      nameAr: 'الضغط على زر «تطوير العقل وتدريبي» يفتح مكتب العقل الصحيح',
      actionAr: 'طلب GET /api/brain-training/office?brainId=attia-advisor',
      actualResultAr: pass
        ? `فُتح مكتب التدريب مرتبطاً بـ "${json?.readiness.brainTitleAr}"`
        : 'فشل فتح مكتب العقل الصحيح.',
      evidenceAr: `status=${res?.status || 'null'} · brainId=${json?.readiness.brainId || 'none'}`,
      verdict: pass ? 'PASS' : 'FAIL',
      durationMs: Math.max(1, Date.now() - t0),
    });
  }

  // Test 2: Reads brain identity and live version
  {
    const t0 = Date.now();
    const snap = getBrainTrainingOfficeSnapshot('attia-advisor');
    const pass =
      snap.readiness.brainTitleAr.includes('عطيه') &&
      /^v\d+\.\d+\.\d+$/.test(snap.readiness.currentVersion) &&
      snap.versions.some((v) => v.version === snap.readiness.currentVersion && v.active);
    results.push({
      id: 2,
      nameAr: 'مكتب التدريب يقرأ هوية العقل وإصداره الفعلي',
      actionAr: 'قراءة الهوية والإصدار النشط من state.json و BRAIN_PROFILES',
      actualResultAr: `العقل: ${snap.readiness.brainTitleAr} · الإصدار النشط: ${snap.readiness.currentVersion}`,
      evidenceAr: `versions=${snap.versions.map((v) => v.version).join(', ')}`,
      verdict: pass ? 'PASS' : 'FAIL',
      durationMs: Math.max(1, Date.now() - t0),
    });
  }

  // Test 3: Checks weights & training engine availability before training (honest BLOCKED on local-lora)
  {
    const t0 = Date.now();
    const blockedRun = await startBrainTrainingCycle({
      brainId: 'attia-advisor',
      engineMode: 'local-lora',
      domainGoal: 'legal-analysis',
    });
    const pass =
      blockedRun.status === 'BLOCKED' &&
      blockedRun.completedSteps === 0 &&
      blockedRun.blockersAr.length > 0;
    results.push({
      id: 3,
      nameAr: 'التحقق من وجود الأوزان والمحرك قبل بدء التدريب (منع التزييف عند غيابها)',
      actionAr: 'محاولة تشغيل تدريب local-lora والتحقق من بوابة الجاهزية',
      actualResultAr: `status=${blockedRun.status} · completedSteps=${blockedRun.completedSteps} · الأسباب=${blockedRun.blockersAr.length}`,
      evidenceAr: blockedRun.blockersAr[0] || '',
      verdict: pass ? 'PASS' : 'FAIL',
      durationMs: Math.max(1, Date.now() - t0),
    });
  }

  // Test 4 & 5 & 6: Real training start with checkpoint pause -> real resume -> pre & post eval
  let pausedCycle: BrainTrainingCycle | null = null;
  let resumedCycle: BrainTrainingCycle | null = null;
  {
    const t0 = Date.now();
    pausedCycle = await startBrainTrainingCycle({
      brainId: 'attia-advisor',
      engineMode: 'advisor-cognitive-distillation',
      domainGoal: 'reasoning-logic',
      pauseAfterCheckpoint: true,
    });
    const pass4 =
      pausedCycle.status === 'PAUSED_CHECKPOINT' &&
      pausedCycle.completedSteps === 1 &&
      Boolean(pausedCycle.checkpointPath && pausedCycle.checkpointSha256);
    results.push({
      id: 4,
      nameAr: 'بدء دورة تدريبية حقيقية عند توفر المتطلبات',
      actionAr: 'تشغيل advisor-cognitive-distillation على مجال الاستدلال والمنطق',
      actualResultAr: `status=${pausedCycle.status} · steps=${pausedCycle.completedSteps}/${pausedCycle.totalSteps} · preEval=${pausedCycle.preEval?.score ?? 'null'}%`,
      evidenceAr: `cycleId=${pausedCycle.id} · preEvalLatency=${pausedCycle.preEval?.latencyMs ?? 0}ms`,
      verdict: pass4 ? 'PASS' : pausedCycle.status === 'BLOCKED' ? 'BLOCKED' : 'FAIL',
      durationMs: Math.max(1, Date.now() - t0),
    });

    const t1 = Date.now();
    let pass5 = false;
    let pass6 = false;
    if (pass4 && pausedCycle.checkpointPath) {
      const ckptFull = path.resolve(ROOT_DIR, pausedCycle.checkpointPath);
      const ckptExists = fs.existsSync(ckptFull);
      resumedCycle = await resumeBrainTrainingCycle(pausedCycle.id);
      pass5 =
        ckptExists &&
        resumedCycle.completedSteps === resumedCycle.totalSteps &&
        (resumedCycle.status === 'COMPLETED_PROMOTED' ||
          resumedCycle.status === 'REJECTED_REGRESSION');
      pass6 =
        Boolean(resumedCycle.preEval && resumedCycle.postEval) &&
        typeof resumedCycle.preEval?.score === 'number' &&
        typeof resumedCycle.postEval?.score === 'number';
    }
    results.push({
      id: 5,
      nameAr: 'حفظ checkpoint واستكمال التدريب منه',
      actionAr: 'التحقق من ملف .ckpt.json و SHA-256 ثم استكمال الدورة عبر resumeBrainTrainingCycle()',
      actualResultAr: resumedCycle
        ? `تم الاستئناف: steps=${resumedCycle.completedSteps}/${resumedCycle.totalSteps} · status=${resumedCycle.status}`
        : 'تعذر الاستئناف لفشل الخطوة السابقة.',
      evidenceAr: `ckpt=${pausedCycle.checkpointPath || 'none'} · sha=${pausedCycle.checkpointSha256?.slice(0, 12) || 'none'}`,
      verdict: pass5 ? 'PASS' : 'FAIL',
      durationMs: Math.max(1, Date.now() - t1),
    });

    results.push({
      id: 6,
      nameAr: 'إجراء تقييم قبل التدريب وبعده (Pre-Eval & Post-Eval)',
      actionAr: 'مقارنة ناتج ومعدل استيفاء المعايير قبل وبعد التطوير',
      actualResultAr: resumedCycle?.postEval
        ? `قبل: ${resumedCycle.preEval?.score}% (${resumedCycle.preEval?.criteriaMatched}/${resumedCycle.preEval?.criteriaTotal}) -> بعد: ${resumedCycle.postEval.score}% (${resumedCycle.postEval.criteriaMatched}/${resumedCycle.postEval.criteriaTotal})`
        : 'لم يكتمل التقييم البعدي.',
      evidenceAr: `model=${resumedCycle?.postEval?.modelUsed || 'none'} · chars=${resumedCycle?.postEval?.responseCharCount || 0}`,
      verdict: pass6 ? 'PASS' : 'FAIL',
      durationMs: Math.max(1, Date.now() - t1),
    });
  }

  // Test 7: Reject degraded-quality candidate
  {
    const t0 = Date.now();
    const versionBeforeGate = loadState().activeVersions['attia-advisor'];
    const regCycle = await startBrainTrainingCycle({
      brainId: 'attia-advisor',
      engineMode: 'advisor-cognitive-distillation',
      domainGoal: 'legal-analysis',
      injectRegressionCandidateForTest: true,
      baselinePreEval: pausedCycle?.preEval || null,
    });
    const versionAfterGate = loadState().activeVersions['attia-advisor'];
    const pass =
      regCycle.status === 'REJECTED_REGRESSION' &&
      regCycle.brainVersionAfter === null &&
      versionAfterGate === versionBeforeGate;
    results.push({
      id: 7,
      nameAr: 'رفض اعتماد إصدار متراجع الجودة',
      actionAr: 'تقييم مخرج متدهور الجودة عبر بوابة الترقية والتحقق من رفض الاعتماد',
      actualResultAr: `status=${regCycle.status} · pre=${regCycle.preEval?.score}% -> post=${regCycle.postEval?.score}% · بقي الإصدار=${versionAfterGate}`,
      evidenceAr: regCycle.blockersAr[0] || regCycle.id,
      verdict: pass ? 'PASS' : 'FAIL',
      durationMs: Math.max(1, Date.now() - t0),
    });
  }

  // Test 8: Cycle history persisted & linked to brain version
  {
    const t0 = Date.now();
    const stateNow = loadState();
    const storeNow = loadStore();
    const hasLinkedCycle =
      stateNow.cycles.length >= 3 &&
      stateNow.cycles.some((c) => c.brainId === 'attia-advisor' && Boolean(c.brainVersionBefore));
    const hasAudit = storeNow.auditLogs.some((a) => a.actor === 'مكتب التدريب الاحترافي للعقل');
    results.push({
      id: 8,
      nameAr: 'حفظ سجل التدريب وربطه بإصدار العقل',
      actionAr: 'فحص state.json و store.auditLogs للربط بين الدورات والإصدارات',
      actualResultAr: `دورات مسجلة=${stateNow.cycles.length} · إصدار نشط=${stateNow.activeVersions['attia-advisor']} · سجل تدقيق=${hasAudit}`,
      evidenceAr: `lastCycle=${stateNow.cycles[0]?.id || 'none'}`,
      verdict: hasLinkedCycle && hasAudit ? 'PASS' : 'FAIL',
      durationMs: Math.max(1, Date.now() - t0),
    });
  }

  // Test 9: Weights & SHA-256 fingerprint integrity + rollback preservation
  {
    const t0 = Date.now();
    const weights = buildWeightsIntegrityReport(loadStore());
    const stateNow = loadState();
    const allVersionsValidSha = stateNow.versions.every((v) => {
      const { snapshotSha256: _s, active: _a, preEvalScore: _p, postEvalScore: _q, ...rest } = v;
      return computeSnapshotSha(rest) === v.snapshotSha256;
    });
    // Roll back to pre-test version if test promoted a new one, preserving original active state cleanly
    if (stateNow.activeVersions['attia-advisor'] !== prevActiveAttiaVersion) {
      rollbackBrainVersion('attia-advisor', prevActiveAttiaVersion);
    }
    const storeAfter = loadStore();
    const memoryPreserved = (storeAfter.platformChatMemory || []).length >= memCountBefore;
    const projectsPreserved = storeAfter.projects.length === projectsBefore;
    const pass =
      weights.mismatchCount === 0 &&
      allVersionsValidSha &&
      memoryPreserved &&
      projectsPreserved;
    results.push({
      id: 9,
      nameAr: 'التحقق من سلامة الأوزان والبصمات وصون الذاكرة',
      actionAr: 'فحص SHA-256 لجميع لقطات الإصدارات والأوزان واسترجاع الإصدار المرجعي',
      actualResultAr: `weightMismatch=${weights.mismatchCount} · allSnapShaOk=${allVersionsValidSha} · memory=${(storeAfter.platformChatMemory || []).length} (>=${memCountBefore})`,
      evidenceAr: `activeAfterRollback=${loadState().activeVersions['attia-advisor']}`,
      verdict: pass ? 'PASS' : 'FAIL',
      durationMs: Math.max(1, Date.now() - t0),
    });
  }

  // Test 10: End-to-end HTTP flow from UI route to training engine & telemetry binding
  {
    const t0 = Date.now();
    const officeRes = await fetch('http://127.0.0.1:3000/api/brain-training/office?brainId=attia-advisor');
    const shRes = await fetch('http://127.0.0.1:3000/api/self-healing/status');
    const officeJson = officeRes.ok ? ((await officeRes.json()) as BrainTrainingOfficeSnapshot) : null;
    const shJson = shRes.ok ? ((await shRes.json()) as { telemetry?: { modules?: { id: string; totalRequests: number }[] } }) : null;
    const btMod = shJson?.telemetry?.modules?.find((m) => m.id === 'brain-training-office');
    const pass =
      Boolean(officeRes.ok && officeJson?.readiness && officeJson?.cycles.length) &&
      (btMod?.totalRequests || 0) > 0;
    results.push({
      id: 10,
      nameAr: 'اختبار المسار كاملاً من الواجهة إلى محرك التدريب والمراقبة والعودة بنتائج حقيقية',
      actionAr: 'استدعاء مسارات مكتب التدريب عبر HTTP والتحقق من تسجيلها في المراقبة الحية',
      actualResultAr: `officeHTTP=${officeRes.status} · cycles=${officeJson?.cycles.length ?? 0} · selfHealingMonitoredRequests=${btMod?.totalRequests ?? 0}`,
      evidenceAr: `module=brain-training-office · currentVersion=${officeJson?.readiness.currentVersion || 'none'}`,
      verdict: pass ? 'PASS' : 'FAIL',
      durationMs: Math.max(1, Date.now() - t0),
    });
  }

  const finalState = loadState();
  finalState.acceptanceTests = results;
  saveState(finalState);

  return results;
}
