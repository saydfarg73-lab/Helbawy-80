import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  ClipboardCheck,
  Database,
  GraduationCap,
  History,
  Layers,
  Lock,
  PauseCircle,
  Play,
  Plus,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import type {
  BrainTrainingAcceptanceTestResult,
  BrainTrainingCycle,
  BrainTrainingOfficeSnapshot,
  BrainVersionSnapshot,
  PlatformBrainId,
  Project,
  TrainingDomainGoalId,
  TrainingEngineMode,
} from '../types/helbawey';

interface GoalDef {
  id: TrainingDomainGoalId;
  labelAr: string;
  descriptionAr: string;
}

interface OfficeApiResponse extends BrainTrainingOfficeSnapshot {
  goals: GoalDef[];
}

interface Props {
  activeProject?: Project;
  targetBrainId: PlatformBrainId;
  onChangeTargetBrain?: (brainId: PlatformBrainId) => void;
  onBackToBrainSelector?: () => void;
  onOpenSelfHealing?: () => void;
  onOpenWeights?: () => void;
}

type OfficeTab = 'pipeline' | 'cycles' | 'versions' | 'acceptance';

function formatShortTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ar-EG', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function cycleStatusClasses(
  status: BrainTrainingCycle['status'] | 'PASS' | 'FAIL' | 'BLOCKED' | 'READY' | 'HEALTHY' | 'DEGRADED'
): string {
  switch (status) {
    case 'COMPLETED_PROMOTED':
    case 'PASS':
    case 'READY':
    case 'HEALTHY':
      return 'bg-emerald-950/70 text-emerald-300 border-emerald-500/40';
    case 'PAUSED_CHECKPOINT':
    case 'RUNNING':
    case 'DEGRADED':
      return 'bg-amber-950/70 text-amber-300 border-amber-500/40';
    case 'REJECTED_REGRESSION':
    case 'BLOCKED':
    case 'FAILED':
    case 'FAIL':
      return 'bg-rose-950/70 text-rose-300 border-rose-500/40';
    default:
      return 'bg-slate-800 text-slate-300 border-slate-700';
  }
}

export function BrainTrainingOfficeWorkspace({
  activeProject,
  targetBrainId,
  onChangeTargetBrain,
  onBackToBrainSelector,
  onOpenSelfHealing,
  onOpenWeights,
}: Props) {
  const [office, setOffice] = useState<OfficeApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<OfficeTab>('pipeline');

  // Training Cycle Configuration
  const [engineMode, setEngineMode] = useState<TrainingEngineMode>('advisor-cognitive-distillation');
  const [domainGoal, setDomainGoal] = useState<TrainingDomainGoalId>('reasoning-logic');
  const [customGoalAr, setCustomGoalAr] = useState('');
  const [datasetId, setDatasetId] = useState('');
  const [epochs, setEpochs] = useState(2);
  const [batchSize, setBatchSize] = useState(4);
  const [learningRate, setLearningRate] = useState('2e-4');
  const [loraRank, setLoraRank] = useState(16);
  const [pauseAfterCheckpoint, setPauseAfterCheckpoint] = useState(false);

  // Add custom training sample inline
  const [showAddSample, setShowAddSample] = useState(false);
  const [newInstruction, setNewInstruction] = useState('');
  const [newReasoning, setNewReasoning] = useState('');
  const [newOutput, setNewOutput] = useState('');

  const loadOffice = useCallback(async () => {
    try {
      const q = new URLSearchParams({
        brainId: targetBrainId,
        ...(activeProject?.id ? { projectId: activeProject.id } : {}),
      });
      const res = await fetch(`/api/brain-training/office?${q.toString()}`);
      if (!res.ok) throw new Error('تعذر تحميل مكتب التدريب الاحترافي للعقل.');
      const data = (await res.json()) as OfficeApiResponse;
      setOffice(data);
      setDatasetId((prev) => {
        if (prev && data.readiness.approvedDatasets.some((d) => d.id === prev)) return prev;
        return (
          data.readiness.approvedDatasets.find((d) => d.id === 'ds-omni-advisor-polymath')?.id ||
          data.readiness.approvedDatasets[0]?.id ||
          ''
        );
      });
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'فشل الاتصال بمكتب التدريب.',
      });
    } finally {
      setLoading(false);
    }
  }, [targetBrainId, activeProject?.id]);

  useEffect(() => {
    setLoading(true);
    void loadOffice();
  }, [loadOffice]);

  async function handleStartCycle() {
    if (busyKey) return;
    setBusyKey('start');
    setBanner(null);
    try {
      const res = await fetch('/api/brain-training/cycles/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brainId: targetBrainId,
          engineMode,
          domainGoal,
          customGoalAr,
          datasetId,
          linkedModelId: office?.readiness.linkedModel?.id,
          epochs,
          batchSize,
          learningRate,
          loraRank,
          pauseAfterCheckpoint,
        }),
      });
      const payload = (await res.json()) as {
        cycle?: BrainTrainingCycle;
        office?: OfficeApiResponse;
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error || 'تعذر بدء الدورة التدريبية.');
      if (payload.office) setOffice(payload.office);

      if (payload.cycle?.status === 'BLOCKED') {
        setBanner({
          type: 'err',
          text: `تم إيقاف التدريب بصدق (BLOCKED): ${payload.cycle.blockersAr.join(' — ')}`,
        });
      } else if (payload.cycle?.status === 'REJECTED_REGRESSION') {
        setBanner({
          type: 'err',
          text: `تم رفض ترقية الإصدار لحماية جودة العقل: ${payload.cycle.blockersAr[0] || ''}`,
        });
      } else if (payload.cycle?.status === 'PAUSED_CHECKPOINT') {
        setBanner({
          type: 'ok',
          text: `حُفظت نقطة Checkpoint عند الخطوة ${payload.cycle.completedSteps}/${payload.cycle.totalSteps} بنجاح. يمكنك الاستكمال الآن من سجل الدورات.`,
        });
        setActiveTab('cycles');
      } else if (payload.cycle?.status === 'COMPLETED_PROMOTED') {
        setBanner({
          type: 'ok',
          text: `اكتمل التدريب والتقييم الفعلي بنجاح وتم اعتماد الإصدار ${payload.cycle.brainVersionAfter}!`,
        });
        setActiveTab('cycles');
      }
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'حدث خطأ أثناء تشغيل التدريب.',
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleResumeCycle(cycleId: string) {
    if (busyKey) return;
    setBusyKey(`resume-${cycleId}`);
    setBanner(null);
    try {
      const res = await fetch(`/api/brain-training/cycles/${cycleId}/resume`, {
        method: 'POST',
      });
      const payload = (await res.json()) as {
        cycle?: BrainTrainingCycle;
        office?: OfficeApiResponse;
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error || 'تعذر استئناف الدورة.');
      if (payload.office) setOffice(payload.office);
      setBanner({
        type: payload.cycle?.status === 'COMPLETED_PROMOTED' ? 'ok' : 'err',
        text:
          payload.cycle?.status === 'COMPLETED_PROMOTED'
            ? `تم الاستئناف من Checkpoint والتحقق والترقية إلى ${payload.cycle.brainVersionAfter}.`
            : payload.cycle?.blockersAr[0] || `انتهت الدورة بحالة ${payload.cycle?.status}.`,
      });
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'فشل الاستئناف.',
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleRollbackVersion(version: string) {
    if (busyKey) return;
    setBusyKey(`rollback-${version}`);
    setBanner(null);
    try {
      const res = await fetch(`/api/brain-training/versions/${encodeURIComponent(version)}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brainId: targetBrainId }),
      });
      const payload = (await res.json()) as {
        office?: OfficeApiResponse;
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error || 'تعذر التراجع إلى الإصدار المحدد.');
      if (payload.office) setOffice(payload.office);
      setBanner({
        type: 'ok',
        text: `تم الرجوع الآمن إلى الإصدار ${version} بعد التحقق من بصمة SHA-256 مع بقاء الذاكرة الحديدية مصونة.`,
      });
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'فشل التراجع.',
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleAddTrainingSample() {
    if (!datasetId || !newInstruction.trim() || !newOutput.trim() || busyKey) return;
    setBusyKey('add-sample');
    setBanner(null);
    try {
      const res = await fetch('/api/brain-training/samples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brainId: targetBrainId,
          datasetId,
          samples: [
            {
              instruction: newInstruction.trim(),
              reasoning: newReasoning.trim(),
              output: newOutput.trim(),
            },
          ],
        }),
      });
      const payload = (await res.json()) as {
        result?: { addedCount: number; totalSamplesCount: number };
        office?: OfficeApiResponse;
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error || 'تعذر إضافة عينة التدريب.');
      if (payload.office) setOffice(payload.office);
      setNewInstruction('');
      setNewReasoning('');
      setNewOutput('');
      setShowAddSample(false);
      setBanner({
        type: 'ok',
        text: `تمت إضافة العينة إلى مجموعة التدريب (الإجمالي الآن: ${payload.result?.totalSamplesCount || 0} عينة).`,
      });
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'تعذر حفظ العينة.',
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleRunAcceptanceTests() {
    if (busyKey) return;
    setBusyKey('acceptance');
    setBanner(null);
    setActiveTab('acceptance');
    try {
      const res = await fetch('/api/brain-training/acceptance-tests/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brainId: targetBrainId }),
      });
      const payload = (await res.json()) as {
        tests?: BrainTrainingAcceptanceTestResult[];
        office?: OfficeApiResponse;
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error || 'فشل تشغيل اختبارات القبول.');
      if (payload.office) setOffice(payload.office);
      const passCount = (payload.tests || []).filter((t) => t.verdict === 'PASS').length;
      setBanner({
        type: passCount === 10 ? 'ok' : 'err',
        text: `اكتملت اختبارات القبول الـ 10: اجتاز ${passCount} من أصل ${(payload.tests || []).length}.`,
      });
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'تعذر تشغيل الاختبارات.',
      });
    } finally {
      setBusyKey(null);
    }
  }

  if (loading && !office) {
    return (
      <div className="rounded-2xl bg-slate-950 border border-amber-500/30 p-8 space-y-4">
        <div className="h-8 w-80 bg-slate-900 rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-slate-900 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const readiness = office?.readiness;
  const activeEngineStatus =
    engineMode === 'local-lora'
      ? readiness?.localNeuralModeStatus || 'BLOCKED'
      : readiness?.cognitiveModeStatus || 'BLOCKED';
  const activeBlockers =
    engineMode === 'local-lora'
      ? readiness?.localNeuralBlockersAr || []
      : readiness?.cognitiveBlockersAr || [];

  const latestCycle = office?.cycles[0] || null;
  const pausedCyclesCount = (office?.cycles || []).filter(
    (c) => c.status === 'PAUSED_CHECKPOINT'
  ).length;

  const tabs: { id: OfficeTab; label: string; count?: number }[] = [
    { id: 'pipeline', label: 'دورة التدريب والتطوير الحقيقية' },
    { id: 'cycles', label: 'سجل الدورات ونقاط Checkpoint', count: office?.cycles.length },
    { id: 'versions', label: 'إصدارات العقل والتراجع الآمن', count: office?.versions.length },
    { id: 'acceptance', label: 'اختبارات القبول الـ 10', count: office?.acceptanceTests.length },
  ];

  return (
    <div
      dir="rtl"
      className="rounded-2xl bg-slate-950 text-slate-100 border border-amber-500/30 shadow-2xl overflow-hidden"
    >
      {/* Golden Helbawey Command Header */}
      <div className="px-6 py-5 border-b border-amber-500/25 bg-gradient-to-l from-slate-900 via-slate-950 to-slate-900 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-400/40 flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5 text-amber-400" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-extrabold text-amber-300 tracking-tight truncate">
                مكتب التدريب والتطوير الاحترافي للعقل
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                <span className="font-semibold text-white">{readiness?.brainTitleAr}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-amber-400">
                  الإصدار النشط: {readiness?.currentVersion || 'v1.0.0'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-slate-400">{readiness?.brainId}</span>
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
            ربط مباشر بين عقل المستشار عطيه، إدارة الأوزان، ووحدة الإصلاح الذاتي: فحص الجاهزية والبصمات SHA-256،
            تقييم ما قبل التدريب، حفظ Checkpoints قابلة للاستئناف، ومنع ترقية أي إصدار متراجع الجودة.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onChangeTargetBrain && (
            <select
              aria-label="العقل المستهدف بالتدريب"
              value={targetBrainId}
              onChange={(e) => onChangeTargetBrain(e.target.value as PlatformBrainId)}
              className="rounded-lg bg-slate-900 border border-amber-500/35 px-3 py-2 text-xs font-semibold text-amber-200 cursor-pointer"
            >
              <option value="attia-advisor">عقل المستشار عطيه الهلباوى المستقبل</option>
              <option value="gemini-standard">عقل جيميني القياسي</option>
            </select>
          )}

          {onBackToBrainSelector && (
            <button
              type="button"
              onClick={onBackToBrainSelector}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>العودة للعقول</span>
            </button>
          )}

          <button
            type="button"
            disabled={busyKey !== null}
            onClick={() => void handleRunAcceptanceTests()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <ClipboardCheck className="w-4 h-4 shrink-0" />
            <span>{busyKey === 'acceptance' ? 'جارٍ الاختبار...' : 'تشغيل اختبارات القبول الـ 10'}</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {banner && (
        <div
          role="alert"
          className={`px-6 py-3 border-b text-xs font-medium flex items-center justify-between gap-4 ${
            banner.type === 'ok'
              ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-200'
              : 'bg-rose-950/70 border-rose-500/40 text-rose-200'
          }`}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-slate-300 hover:text-white cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* 4 Connected Pillars Readiness Strip */}
      <div className="p-6 border-b border-slate-800 bg-slate-950 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. Brain Identity & Version */}
        <div className="rounded-xl bg-slate-900/90 border border-amber-500/30 p-4 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>العقل النشط وإصداره</span>
            <BrainCircuit className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-base font-extrabold text-amber-300 font-mono tabular-nums">
            {readiness?.currentVersion || 'v1.0.0'}
          </div>
          <div className="text-[11px] text-slate-300 truncate">
            الذاكرة الحديدية: {readiness?.ironcladMemoryCount ?? 0} قاعدة مصونة
          </div>
        </div>

        {/* 2. Weights & Integrity Link */}
        <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-4 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>النموذج والأوزان الفعلية</span>
            <Layers className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xs font-bold text-slate-100 truncate">
            {readiness?.linkedModel?.name || 'غير محدد'}
          </div>
          <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
            <span
              className={
                readiness?.linkedModel?.importedOnDisk ? 'text-emerald-300' : 'text-rose-300'
              }
            >
              {readiness?.linkedModel?.importedOnDisk
                ? `${readiness.linkedModel.diskBytes} B (على القرص)`
                : 'MISSING_ON_DISK (0 أوزان)'}
            </span>
            {onOpenWeights && (
              <button
                type="button"
                onClick={onOpenWeights}
                className="text-amber-400 hover:underline cursor-pointer"
              >
                إدارة الأوزان
              </button>
            )}
          </div>
        </div>

        {/* 3. Engine Readiness */}
        <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-4 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>الجاهزية التدريبية للمحركات</span>
            <ShieldCheck className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
            <span
              className={`px-2 py-0.5 rounded border font-bold ${cycleStatusClasses(
                readiness?.cognitiveModeStatus || 'BLOCKED'
              )}`}
            >
              التطوير المعرفي: {readiness?.cognitiveModeStatus}
            </span>
            <span
              className={`px-2 py-0.5 rounded border font-bold ${cycleStatusClasses(
                readiness?.localNeuralModeStatus || 'BLOCKED'
              )}`}
            >
              LoRA المحلي: {readiness?.localNeuralModeStatus}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 truncate">
            محرك السحابة: @google/genai · محلي: torch/peft غير مثبت
          </div>
        </div>

        {/* 4. Self-Healing Link */}
        <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-4 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>ربط الإصلاح الذاتي والمراقبة</span>
            <ShieldAlert className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span
              className={`px-2 py-0.5 rounded border text-xs font-mono font-bold ${cycleStatusClasses(
                readiness?.selfHealingStatusVerdict || 'BLOCKED'
              )}`}
            >
              {readiness?.selfHealingStatusVerdict || 'DEGRADED'}
            </span>
            <span className="text-[11px] font-mono text-slate-300 tabular-nums">
              Checkpoints معلقة: {pausedCyclesCount}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400">مراقب /api/brain-training/*</span>
            {onOpenSelfHealing && (
              <button
                type="button"
                onClick={onOpenSelfHealing}
                className="text-amber-400 hover:underline cursor-pointer"
              >
                فتح المراقبة
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Office Tabs */}
      <div className="px-6 pt-3 border-b border-slate-800 bg-slate-900/50 flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-2 ${
                active
                  ? 'border-amber-400 text-amber-300 bg-slate-950/60 rounded-t-lg'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 tabular-nums">
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Body */}
      <div className="p-6">
        {/* TAB 1: Real Training Pipeline & Controls */}
        {activeTab === 'pipeline' && (
          <div className="space-y-6">
            {/* 8-Step Pipeline Bar */}
            <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-4">
              <div className="text-xs font-bold text-amber-300 mb-3">
                مسار دورة التطوير الحقيقية (8 مراحل موثقة)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-[11px]">
                {[
                  { k: 'GOAL_SELECTED', label: '1. اختيار الهدف' },
                  { k: 'DATA_PREPARED', label: '2. تجهيز البيانات' },
                  { k: 'PREREQS_CHECKED', label: '3. فحص الأوزان والمحرك' },
                  { k: 'PRE_EVAL_DONE', label: '4. تقييم المستوى الحالي' },
                  { k: 'TRAINING_RUNNING', label: '5. بدء التدريب' },
                  { k: 'CHECKPOINT_SAVED', label: '6. حفظ Checkpoint' },
                  { k: 'POST_EVAL_DONE', label: '7. تقييم التحسن' },
                  { k: 'PROMOTED', label: '8. اعتماد الإصدار' },
                ].map((step) => {
                  const reached = latestCycle?.logs.some((l) => l.stage === step.k);
                  return (
                    <div
                      key={step.k}
                      className={`rounded-lg border px-2.5 py-2 text-center font-medium ${
                        reached
                          ? 'border-amber-500/40 bg-amber-950/30 text-amber-200'
                          : 'border-slate-800 bg-slate-950 text-slate-400'
                      }`}
                    >
                      {step.label}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Goal, Dataset, Engine & Hyperparameters */}
              <div className="lg:col-span-7 space-y-5">
                {/* 1. Domain Goals */}
                <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-3">
                  <h2 className="text-sm font-bold text-amber-300">
                    أولاً: اختيار وتخصيص هدف التطوير المعرفي
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {(office?.goals || []).map((goal) => {
                      const selected = domainGoal === goal.id;
                      return (
                        <button
                          key={goal.id}
                          type="button"
                          onClick={() => setDomainGoal(goal.id)}
                          className={`rounded-lg border p-3 text-right transition-colors cursor-pointer ${
                            selected
                              ? 'border-amber-400 bg-amber-950/30 text-amber-100'
                              : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div className="text-xs font-bold">{goal.labelAr}</div>
                          <div className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                            {goal.descriptionAr}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {domainGoal === 'custom' && (
                    <input
                      type="text"
                      value={customGoalAr}
                      onChange={(e) => setCustomGoalAr(e.target.value)}
                      placeholder="اكتب الهدف التدريبي المخصص بدقة (مثال: تحليل عقود الفيديك FIDIC وهندسة المشاريع)"
                      className="w-full rounded-lg bg-slate-950 border border-amber-500/40 px-3 py-2 text-xs text-slate-100"
                    />
                  )}
                </div>

                {/* 2. Dataset & Inline New Data Addition */}
                <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-bold text-amber-300 flex items-center gap-2">
                      <Database className="w-4 h-4" />
                      <span>ثانياً: مصادر البيانات التدريبية المعتمدة</span>
                    </h2>
                    <button
                      type="button"
                      onClick={() => setShowAddSample((v) => !v)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-amber-500/35 text-xs text-amber-200 font-semibold cursor-pointer whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة بيانات تدريبية جديدة</span>
                    </button>
                  </div>

                  <select
                    value={datasetId}
                    onChange={(e) => setDatasetId(e.target.value)}
                    className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2.5 text-xs text-slate-100"
                  >
                    {(readiness?.approvedDatasets || []).map((ds) => (
                      <option key={ds.id} value={ds.id}>
                        {ds.name} ({ds.samplesCount} عينات · {ds.format} · جودة {ds.avgQualityScore}%)
                      </option>
                    ))}
                  </select>

                  {showAddSample && (
                    <div className="rounded-lg bg-slate-950 border border-amber-500/30 p-3.5 space-y-2.5">
                      <div className="text-xs font-bold text-amber-300">
                        إدخال عينة تدريب جديدة (SFT + Reasoning) داخل المجموعة المختارة
                      </div>
                      <input
                        type="text"
                        value={newInstruction}
                        onChange={(e) => setNewInstruction(e.target.value)}
                        placeholder="السؤال أو التعليمة التدريبية (Instruction)"
                        className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-slate-100"
                      />
                      <input
                        type="text"
                        value={newReasoning}
                        onChange={(e) => setNewReasoning(e.target.value)}
                        placeholder="خطوات التحليل والاستدلال (اختياري)"
                        className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-slate-100"
                      />
                      <textarea
                        rows={2}
                        value={newOutput}
                        onChange={(e) => setNewOutput(e.target.value)}
                        placeholder="الإجابة المرجعية المعتمدة (Target Output)"
                        className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-slate-100"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowAddSample(false)}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-300 cursor-pointer"
                        >
                          إلغاء
                        </button>
                        <button
                          type="button"
                          disabled={busyKey !== null || !newInstruction.trim() || !newOutput.trim()}
                          onClick={() => void handleAddTrainingSample()}
                          className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer disabled:opacity-50"
                        >
                          حفظ العينة في المجموعة
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Engine Mode & Parameters */}
                <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-4">
                  <h2 className="text-sm font-bold text-amber-300">
                    ثالثاً: محرك التدريب الفعلي وإعدادات الدورة
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setEngineMode('advisor-cognitive-distillation')}
                      className={`rounded-lg border p-3.5 text-right cursor-pointer transition-colors ${
                        engineMode === 'advisor-cognitive-distillation'
                          ? 'border-amber-400 bg-amber-950/30'
                          : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-100">
                          محرك التقطير والتقييم السحابي
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded border text-[10px] font-mono font-bold ${cycleStatusClasses(
                            readiness?.cognitiveModeStatus || 'BLOCKED'
                          )}`}
                        >
                          {readiness?.cognitiveModeStatus}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        تدريب حقيقي لمنهج الرشاد عبر @google/genai + تقييم قبلي وبعدي + ترقية إصدار موثقة.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEngineMode('local-lora')}
                      className={`rounded-lg border p-3.5 text-right cursor-pointer transition-colors ${
                        engineMode === 'local-lora'
                          ? 'border-amber-400 bg-amber-950/30'
                          : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-100">
                          تدريب الأوزان المحلية (LoRA / QLoRA)
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded border text-[10px] font-mono font-bold ${cycleStatusClasses(
                            readiness?.localNeuralModeStatus || 'BLOCKED'
                          )}`}
                        >
                          {readiness?.localNeuralModeStatus}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        تدريب أوزان محلية عبر PyTorch/PEFT + ملفات GGUF/Safetensors محققة بالـ SHA-256.
                      </p>
                    </button>
                  </div>

                  {/* Honest Blockers Box */}
                  {activeBlockers.length > 0 && (
                    <div className="rounded-lg bg-rose-950/60 border border-rose-500/40 p-3.5 space-y-1.5 text-xs text-rose-200">
                      <div className="flex items-center gap-2 font-bold text-rose-300">
                        <Lock className="w-4 h-4 shrink-0" />
                        <span>الحالة BLOCKED — متطلبات ناقصة يجب توفرها قبل التشغيل الفعلي:</span>
                      </div>
                      <ul className="list-disc pr-5 space-y-1 text-[11px]">
                        {activeBlockers.map((b) => (
                          <li key={b}>{b}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">الدورات (Epochs)</label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={epochs}
                        onChange={(e) => setEpochs(Number(e.target.value))}
                        className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 font-mono text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">حجم الدفعة (Batch)</label>
                      <input
                        type="number"
                        min={1}
                        max={32}
                        value={batchSize}
                        onChange={(e) => setBatchSize(Number(e.target.value))}
                        className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 font-mono text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">معدل التعلم (LR)</label>
                      <input
                        type="text"
                        value={learningRate}
                        onChange={(e) => setLearningRate(e.target.value)}
                        className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 font-mono text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">رتبة المحول (LoRA r)</label>
                      <input
                        type="number"
                        min={4}
                        max={64}
                        value={loraRank}
                        onChange={(e) => setLoraRank(Number(e.target.value))}
                        className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 font-mono text-slate-100"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={pauseAfterCheckpoint}
                      onChange={(e) => setPauseAfterCheckpoint(e.target.checked)}
                      className="rounded border-slate-600"
                    />
                    <span>
                      إيقاف مؤقت بعد حفظ نقطة <span className="font-mono text-amber-300">Checkpoint</span> (للمراجعة والاستئناف لاحقاً)
                    </span>
                  </label>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
                    <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>
                        يتم فحص الأوزان وحفظ Checkpoint وتقييم التحسن قبل اعتماد أي ترقية.
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={busyKey !== null}
                      onClick={() => void handleStartCycle()}
                      className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 transition-colors ${
                        activeEngineStatus === 'READY'
                          ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                          : 'bg-rose-950 hover:bg-rose-900 border border-rose-500/40 text-rose-200'
                      }`}
                    >
                      <Play className="w-4 h-4 shrink-0" />
                      <span>
                        {busyKey === 'start'
                          ? 'جارٍ تنفيذ الدورة والتقييم...'
                          : activeEngineStatus === 'READY'
                            ? 'بدء دورة تدريبية حقيقية'
                            : 'فحص وتشغيل (سيظهر BLOCKED لغياب المتطلبات)'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: Latest Pre/Post Eval & Checkpoint Status */}
              <div className="lg:col-span-5 space-y-5">
                <div className="rounded-xl bg-slate-900 border border-amber-500/25 p-5 space-y-4">
                  <h2 className="text-sm font-bold text-amber-300">
                    نتائج التقييم قبل التدريب وبعده (آخر دورة)
                  </h2>

                  {!latestCycle ? (
                    <div className="rounded-lg bg-slate-950 border border-slate-800 p-5 text-xs text-slate-400">
                      لم تبدأ دورة تدريبية لهذا العقل بعد. اختر مجال التطوير ثم اضغط «بدء دورة تدريبية حقيقية».
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-mono text-slate-400">{latestCycle.id}</span>
                        <span
                          className={`px-2 py-0.5 rounded border font-mono font-bold text-[11px] ${cycleStatusClasses(
                            latestCycle.status
                          )}`}
                        >
                          {latestCycle.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg bg-slate-950 border border-slate-800 p-3 space-y-1">
                          <div className="text-[11px] text-slate-400">قبل التدريب (Pre-Eval)</div>
                          <div className="text-2xl font-extrabold font-mono text-slate-100 tabular-nums">
                            {latestCycle.preEval ? `${latestCycle.preEval.score}%` : '—'}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400">
                            {latestCycle.preEval
                              ? `${latestCycle.preEval.criteriaMatched}/${latestCycle.preEval.criteriaTotal} معيار · ${latestCycle.preEval.latencyMs}ms`
                              : 'لم يُنفذ'}
                          </div>
                        </div>

                        <div className="rounded-lg bg-slate-950 border border-slate-800 p-3 space-y-1">
                          <div className="text-[11px] text-slate-400">بعد التدريب (Post-Eval)</div>
                          <div
                            className={`text-2xl font-extrabold font-mono tabular-nums ${
                              latestCycle.status === 'REJECTED_REGRESSION'
                                ? 'text-rose-400'
                                : latestCycle.postEval
                                  ? 'text-emerald-400'
                                  : 'text-slate-400'
                            }`}
                          >
                            {latestCycle.postEval ? `${latestCycle.postEval.score}%` : '—'}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400">
                            {latestCycle.postEval
                              ? `${latestCycle.postEval.criteriaMatched}/${latestCycle.postEval.criteriaTotal} معيار · ${latestCycle.postEval.latencyMs}ms`
                              : latestCycle.status === 'PAUSED_CHECKPOINT'
                                ? 'متوقف عند Checkpoint'
                                : 'غير مكتمل'}
                          </div>
                        </div>
                      </div>

                      {latestCycle.canResume && latestCycle.status === 'PAUSED_CHECKPOINT' && (
                        <button
                          type="button"
                          disabled={busyKey !== null}
                          onClick={() => void handleResumeCycle(latestCycle.id)}
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer disabled:opacity-50"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>استكمال التدريب من Checkpoint الآن</span>
                        </button>
                      )}

                      <div className="rounded-lg bg-slate-950 border border-slate-800 p-3 space-y-1.5 text-[11px]">
                        <div className="text-amber-300 font-semibold">سجل مراحل الدورة الحقيقي:</div>
                        {latestCycle.logs.map((lg, idx) => (
                          <div key={`${latestCycle.id}-lg-${idx}`} className="text-slate-300">
                            <span className="font-mono text-amber-400">{lg.stage}: </span>
                            <span>{lg.messageAr}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Detected Engines Snapshot */}
                <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-2.5">
                  <div className="text-xs font-bold text-slate-200">
                    جرد المحركات المتاحة على الخادم (دون اختلاق)
                  </div>
                  <div className="space-y-1.5 text-[11px] font-mono max-h-44 overflow-y-auto">
                    {(readiness?.detectedEngines || []).slice(0, 8).map((eng) => (
                      <div
                        key={eng.name}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800"
                      >
                        <span className="text-slate-200">{eng.name}</span>
                        <span className={eng.installed ? 'text-emerald-400' : 'text-slate-500'}>
                          {eng.installed ? eng.version || 'مثبت' : 'غير مثبت'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Cycles & Resumable Checkpoints */}
        {activeTab === 'cycles' && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-amber-300">
              سجل دورات التدريب ونقاط Checkpoint ({office?.cycles.length || 0})
            </h2>
            {(office?.cycles || []).length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-xs text-slate-400">
                لا توجد دورات تدريبية مسجلة حتى الآن.
              </div>
            ) : (
              <div className="space-y-3">
                {(office?.cycles || []).map((cycle) => (
                  <div
                    key={cycle.id}
                    className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded border text-[11px] font-mono font-bold ${cycleStatusClasses(
                              cycle.status
                            )}`}
                          >
                            {cycle.status}
                          </span>
                          <span className="text-xs font-bold text-slate-100">
                            {cycle.customGoalAr ||
                              office?.goals.find((g) => g.id === cycle.domainGoal)?.labelAr ||
                              cycle.domainGoal}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-400">
                          {cycle.id} · {cycle.engineMode} · الإصدار: {cycle.brainVersionBefore}
                          {cycle.brainVersionAfter ? ` -> ${cycle.brainVersionAfter}` : ''} · الخطوات:{' '}
                          {cycle.completedSteps}/{cycle.totalSteps} · {formatShortTime(cycle.createdAt)}
                        </div>
                      </div>

                      {cycle.canResume && cycle.status === 'PAUSED_CHECKPOINT' && (
                        <button
                          type="button"
                          disabled={busyKey !== null}
                          onClick={() => void handleResumeCycle(cycle.id)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer disabled:opacity-50"
                        >
                          <PauseCircle className="w-3.5 h-3.5" />
                          <span>استكمال من Checkpoint</span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
                      <div className="rounded-lg bg-slate-950 border border-slate-800 p-3">
                        <div className="text-[11px] text-slate-400">التقييم القبلي / البعدي</div>
                        <div className="font-mono text-slate-100 mt-1 tabular-nums">
                          قبل: {cycle.preEval ? `${cycle.preEval.score}%` : '—'} · بعد:{' '}
                          {cycle.postEval ? `${cycle.postEval.score}%` : '—'}
                        </div>
                      </div>
                      <div className="rounded-lg bg-slate-950 border border-slate-800 p-3 md:col-span-2">
                        <div className="text-[11px] text-slate-400">ملف Checkpoint وبصمة SHA-256</div>
                        <div className="font-mono text-[11px] text-amber-200/90 mt-1 break-all">
                          {cycle.checkpointPath || 'لا يوجد'} ·{' '}
                          {cycle.checkpointSha256 ? `SHA: ${cycle.checkpointSha256}` : ''}
                        </div>
                      </div>
                    </div>

                    {cycle.blockersAr.length > 0 && (
                      <div className="rounded-lg bg-rose-950/50 border border-rose-500/30 p-2.5 text-xs text-rose-200 flex items-start gap-2">
                        <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        <span>{cycle.blockersAr.join(' — ')}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Version History & Safe Rollback */}
        {activeTab === 'versions' && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-amber-300">
              سجل إصدارات العقل الموثقة بالـ SHA-256 وإمكانية التراجع الآمن
            </h2>
            <div className="space-y-3">
              {(office?.versions || []).map((ver: BrainVersionSnapshot) => (
                <div
                  key={`${ver.brainId}-${ver.version}`}
                  className={`rounded-xl border p-4 space-y-2.5 ${
                    ver.active
                      ? 'bg-slate-900 border-amber-500/45'
                      : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-extrabold text-amber-300">
                        {ver.version}
                      </span>
                      {ver.active && (
                        <span className="px-2 py-0.5 rounded border border-emerald-500/40 bg-emerald-950/60 text-emerald-300 text-[11px] font-bold">
                          الإصدار النشط حالياً
                        </span>
                      )}
                      <span className="text-xs text-slate-300">{ver.summaryAr}</span>
                    </div>

                    {!ver.active && (
                      <button
                        type="button"
                        disabled={busyKey !== null}
                        onClick={() => void handleRollbackVersion(ver.version)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-amber-500/40 text-amber-300 text-xs font-semibold cursor-pointer disabled:opacity-50"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>الرجوع لهذا الإصدار</span>
                      </button>
                    )}
                  </div>

                  <div className="text-[11px] font-mono text-slate-400 break-all">
                    Snapshot SHA-256: {ver.snapshotSha256} · {formatShortTime(ver.createdAt)}
                    {ver.preEvalScore !== null && ver.postEvalScore !== null
                      ? ` · Pre: ${ver.preEvalScore}% -> Post: ${ver.postEvalScore}%`
                      : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: 10 Mandatory Acceptance Tests */}
        {activeTab === 'acceptance' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-amber-300">
                  اختبارات القبول الـ 10 لربط العقل بمكتب التدريب الاحترافي
                </h2>
                <p className="text-xs text-slate-400">
                  اختبار فعلي عبر المسارات الحقيقية، فحص الأوزان والمحركات، حفظ checkpoint واستئنافه،
                  التقييم قبل/بعد، رفض الترقية المتراجعة، والتراجع الآمن دون فقدان الذاكرة.
                </p>
              </div>
              <button
                type="button"
                disabled={busyKey !== null}
                onClick={() => void handleRunAcceptanceTests()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{busyKey === 'acceptance' ? 'جارٍ التشغيل...' : 'تشغيل الاختبارات الـ 10'}</span>
              </button>
            </div>

            {(office?.acceptanceTests || []).length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-xs text-slate-300 flex items-center justify-between">
                <span>لم تُشغّل اختبارات القبول الـ 10 بعد.</span>
                <History className="w-4 h-4 text-amber-400" />
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3 font-semibold">#</th>
                        <th className="py-2.5 px-3 font-semibold">الاختبار</th>
                        <th className="py-2.5 px-3 font-semibold">الإجراء</th>
                        <th className="py-2.5 px-3 font-semibold">النتيجة الفعلية</th>
                        <th className="py-2.5 px-3 font-semibold">الدليل</th>
                        <th className="py-2.5 px-3 font-semibold">المدة</th>
                        <th className="py-2.5 px-3 font-semibold">الحكم</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {(office?.acceptanceTests || []).map((t) => (
                        <tr key={t.id} className="hover:bg-slate-800/30 align-top">
                          <td className="py-3 px-3 font-mono text-amber-300 font-bold tabular-nums">
                            {t.id}
                          </td>
                          <td className="py-3 px-3 font-semibold text-slate-100">{t.nameAr}</td>
                          <td className="py-3 px-3 text-[11px] text-slate-300 max-w-xs">{t.actionAr}</td>
                          <td className="py-3 px-3 text-[11px] text-slate-200 max-w-xs">
                            {t.actualResultAr}
                          </td>
                          <td className="py-3 px-3 font-mono text-[11px] text-amber-200/80 max-w-xs break-words">
                            {t.evidenceAr}
                          </td>
                          <td className="py-3 px-3 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                            {t.durationMs} ms
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded border text-[11px] font-mono font-bold ${cycleStatusClasses(
                                t.verdict
                              )}`}
                            >
                              {t.verdict}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
