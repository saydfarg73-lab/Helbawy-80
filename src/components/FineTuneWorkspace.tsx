import { useEffect, useState } from 'react';
import { Cpu, Database, Play, Plus } from 'lucide-react';
import type {
  FineTuneJob,
  ModelWeightEntry,
  Project,
  TrainingDataset,
} from '../types/helbawey';
import { StatusText } from './StatusText';

interface Props {
  project: Project;
  models: ModelWeightEntry[];
  jobs: FineTuneJob[];
  datasets: TrainingDataset[];
  preselectedDatasetId?: string | null;
  onJobsUpdated: (jobs: FineTuneJob[]) => void;
  onOpenTrainingLibrary: () => void;
}

export function FineTuneWorkspace({
  project,
  models,
  jobs,
  datasets,
  preselectedDatasetId,
  onJobsUpdated,
  onOpenTrainingLibrary,
}: Props) {
  const [name, setName] = useState('');
  const [baseModelId, setBaseModelId] = useState(project.selectedModelId || models[0]?.id || '');
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(
    preselectedDatasetId || datasets[0]?.id || ''
  );
  const [method, setMethod] = useState<'LoRA' | 'QLoRA' | 'Full'>('QLoRA');
  const [loraRank, setLoraRank] = useState(16);
  const [epochs, setEpochs] = useState(3);
  const [sampleInst, setSampleInst] = useState('');
  const [sampleOut, setSampleOut] = useState('');

  useEffect(() => {
    if (preselectedDatasetId) {
      setSelectedDatasetId(preselectedDatasetId);
      const ds = datasets.find((d) => d.id === preselectedDatasetId);
      if (ds) {
        setName((prev) => prev || `تدريب ${ds.name}`);
        if (ds.recommendedBaseModels[0] && models.some((m) => m.id === ds.recommendedBaseModels[0])) {
          setBaseModelId(ds.recommendedBaseModels[0]);
        }
      }
    }
  }, [preselectedDatasetId, datasets, models]);

  const linkedDataset = datasets.find((d) => d.id === selectedDatasetId);

  async function handleCreateJob() {
    if (!name.trim()) return;

    const mergedSamples = [
      ...(sampleInst.trim()
        ? [{ instruction: sampleInst.trim(), input: '', output: sampleOut.trim() }]
        : []),
      ...(linkedDataset
        ? linkedDataset.samples.map((s) => ({
            instruction: s.instruction,
            input: s.input,
            output: s.reasoning ? `<think>\n${s.reasoning}\n</think>\n${s.output}` : s.output,
          }))
        : []),
    ];

    const res = await fetch('/api/finetune', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        projectId: project.id,
        baseModelId,
        method,
        loraRank,
        epochs,
        datasetSamples: mergedSamples.length > 0 ? mergedSamples : undefined,
      }),
    });
    if (res.ok) {
      const created = (await res.json()) as FineTuneJob;
      onJobsUpdated([created, ...jobs]);
      setName('');
      setSampleInst('');
      setSampleOut('');
    }
  }

  async function handleRunEval(jobId: string) {
    const res = await fetch(`/api/finetune/${jobId}/run`, { method: 'POST' });
    if (res.ok) {
      const updated = (await res.json()) as FineTuneJob;
      onJobsUpdated(jobs.map((j) => (j.id === jobId ? updated : j)));
    }
  }

  return (
    <div className="space-y-6">
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Cpu className="w-5 h-5 text-slate-700 dark:text-slate-300 mt-0.5 shrink-0" />
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              استوديو التخصيص والتدريب الفعلي (LoRA / QLoRA Fine-Tuning)
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-3xl leading-relaxed">
              تجهيز مجموعات التدريب JSONL وإعداد محولات LoRA/QLoRA وتقييم النموذج قبل التخصيص وبعده. تنويه تعاقدي: لا يُعد إضافة تعليمات نظامية (System Prompts) أو مستندات RAG تدريباً فعلياً للأوزان.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenTrainingLibrary}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer shrink-0"
        >
          <Database className="w-3.5 h-3.5" />
          <span>استعراض مكتبة بيانات التدريب ({datasets.length})</span>
        </button>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            إنشاء مهمة تدريب وتخصيص محول جديد
          </h3>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="اسم مهمة التدريب (مثال: تدريب العقود القانونية)"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
          />

          <div>
            <label className="block text-[11px] text-slate-500 mb-1">
              مجموعة البيانات من مكتبة التدريب
            </label>
            <select
              value={selectedDatasetId}
              onChange={(e) => setSelectedDatasetId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs"
            >
              <option value="">-- عينة يدوية فقط --</option>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.samplesCount} عينات · {d.format} · جودة {d.avgQualityScore}%)
                </option>
              ))}
            </select>
            {linkedDataset && (
              <div className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 mt-1">
                سيتم تضمين {linkedDataset.samplesCount} عينة منقاة ({linkedDataset.totalTokensEstimate} tok)
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">النموذج الأساسي</label>
              <select
                value={baseModelId}
                onChange={(e) => setBaseModelId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs font-mono"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">أسلوب التدريب</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as typeof method)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs font-mono"
              >
                <option value="QLoRA">QLoRA (4-bit)</option>
                <option value="LoRA">LoRA (16-bit)</option>
                <option value="Full">Full Fine-Tuning</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">رتبة المحول (LoRA r)</label>
              <input
                type="number"
                value={loraRank}
                onChange={(e) => setLoraRank(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">عدد الدورات (Epochs)</label>
              <input
                type="number"
                value={epochs}
                onChange={(e) => setEpochs(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs font-mono"
              />
            </div>
          </div>

          <input
            type="text"
            value={sampleInst}
            onChange={(e) => setSampleInst(e.target.value)}
            placeholder="عينة تدريب إضافية — التعليمات (اختياري)"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
          />
          <input
            type="text"
            value={sampleOut}
            onChange={(e) => setSampleOut(e.target.value)}
            placeholder="عينة تدريب إضافية — المخرج المستهدف (اختياري)"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
          />

          <button
            type="button"
            onClick={handleCreateJob}
            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>إعداد مهمة التدريب وتوليد Adapter Config</span>
          </button>
        </section>

        <section className="lg:col-span-7 space-y-4">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{job.name}</h4>
                  <div className="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
                    {job.method} · r={job.loraRank} · {job.epochs} epochs · {job.datasetSamples.length} عينات
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusText status={job.status} compact />
                  <button
                    type="button"
                    onClick={() => handleRunEval(job.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium cursor-pointer"
                  >
                    <Play className="w-3 h-3" />
                    <span>تقييم وتشغيل</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono tabular-nums">
                <div>
                  <span className="text-slate-500">الدقة قبل التخصيص: </span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {job.preEvalScore}%
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">الدقة بعد محول LoRA: </span>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                    {job.postEvalScore > 0 ? `${job.postEvalScore}%` : 'بانتظار التقييم'}
                  </span>
                </div>
              </div>

              <pre dir="ltr" className="p-3 rounded-lg bg-slate-950 text-slate-200 text-[11px] font-mono overflow-x-auto">
                {job.adapterConfigJson}
              </pre>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
