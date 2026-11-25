import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Database,
  Download,
  Filter,
  Layers,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  Project,
  TrainingDataset,
  TrainingDatasetFormat,
  TrainingDomain,
} from '../types/helbawey';

interface Props {
  project: Project;
  datasets: TrainingDataset[];
  onDatasetsUpdated: (datasets: TrainingDataset[]) => void;
  onSendToFineTune: (dataset: TrainingDataset) => void;
}

const DOMAIN_LABELS: Record<TrainingDomain, string> = {
  'arabic-enterprise': 'الأنظمة والعقود العربية',
  'reasoning-cot': 'الاستدلال المنطقي (CoT)',
  'tool-calling': 'استدعاء الدوال والوكلاء',
  'code-fullstack': 'البرمجة الشاملة والكود',
  'alignment-dpo': 'ضبط التفضيل ومنع الهلوسة (DPO)',
  'rag-grounding': 'الاسترجاع الموثق للوثائق (RAG)',
};

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number;
    payload?: { fullName: string; avgQualityScore: number; totalTokensEstimate: number; samplesCount: number };
  }>;
}

function DatasetMetricsTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0]?.payload;
  if (!item) return null;
  return (
    <div
      dir="rtl"
      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 shadow-lg text-[11px] space-y-1 min-w-[190px]"
    >
      <div className="font-bold text-slate-900 dark:text-slate-100">{item.fullName}</div>
      <div className="font-mono tabular-nums space-y-0.5 text-slate-600 dark:text-slate-300">
        <div>جودة البيانات: {item.avgQualityScore}/100</div>
        <div>عدد العينات: {item.samplesCount}</div>
        <div>إجمالي التوكنز: {item.totalTokensEstimate.toLocaleString('en-US')}</div>
      </div>
    </div>
  );
}

export function TrainingLibraryWorkspace({
  project,
  datasets,
  onDatasetsUpdated,
  onSendToFineTune,
}: Props) {
  const [selectedId, setSelectedId] = useState<string>(datasets[0]?.id || '');
  const [domainFilter, setDomainFilter] = useState<TrainingDomain | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sampleSearch, setSampleSearch] = useState('');

  // Create Dataset / Import JSONL state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newDomain, setNewDomain] = useState<TrainingDomain>('arabic-enterprise');
  const [newFormat, setNewFormat] = useState<TrainingDatasetFormat>('Alpaca-SFT');
  const [newRawJsonl, setNewRawJsonl] = useState('');

  // Add / Import samples into selected dataset
  const [showImportSamples, setShowImportSamples] = useState(false);
  const [importMode, setImportMode] = useState<'single' | 'jsonl'>('single');
  const [impInst, setImpInst] = useState('');
  const [impInput, setImpInput] = useState('');
  const [impOutput, setImpOutput] = useState('');
  const [impReasoning, setImpReasoning] = useState('');
  const [impRejected, setImpRejected] = useState('');
  const [impJsonl, setImpJsonl] = useState('');

  // Curation & Synthesis state
  const [minQualityThreshold, setMinQualityThreshold] = useState(65);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const filteredDatasets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return datasets.filter((d) => {
      if (domainFilter !== 'all' && d.domain !== domainFilter) return false;
      if (!q) return true;
      return (
        d.name.toLowerCase().includes(q) ||
        d.descriptionAr.toLowerCase().includes(q) ||
        d.format.toLowerCase().includes(q)
      );
    });
  }, [datasets, domainFilter, searchQuery]);

  const activeDataset =
    datasets.find((d) => d.id === selectedId) || filteredDatasets[0] || datasets[0];

  const filteredSamples = useMemo(() => {
    if (!activeDataset) return [];
    const q = sampleSearch.trim().toLowerCase();
    if (!q) return activeDataset.samples;
    return activeDataset.samples.filter(
      (s) =>
        s.instruction.toLowerCase().includes(q) ||
        s.input.toLowerCase().includes(q) ||
        s.output.toLowerCase().includes(q)
    );
  }, [activeDataset, sampleSearch]);

  const totalSamplesAll = datasets.reduce((sum, d) => sum + d.samplesCount, 0);
  const totalTokensAll = datasets.reduce((sum, d) => sum + d.totalTokensEstimate, 0);
  const avgCorpusQuality =
    datasets.length > 0
      ? Number(
          (datasets.reduce((sum, d) => sum + d.avgQualityScore, 0) / datasets.length).toFixed(1)
        )
      : 0;

  const chartData = useMemo(
    () =>
      datasets.map((d) => ({
        id: d.id,
        shortName: d.slug.replace('alhelbawey-', '').slice(0, 14),
        fullName: d.name,
        avgQualityScore: d.avgQualityScore,
        totalTokensEstimate: d.totalTokensEstimate,
        samplesCount: d.samplesCount,
      })),
    [datasets]
  );

  async function handleCreateDataset() {
    if (!newName.trim()) return;
    setBusyAction('create');
    setActionNotice(null);
    try {
      const res = await fetch('/api/datasets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          descriptionAr: newDesc.trim(),
          domain: newDomain,
          format: newFormat,
          rawJsonl: newRawJsonl,
        }),
      });
      if (res.ok) {
        const created = (await res.json()) as TrainingDataset;
        onDatasetsUpdated([created, ...datasets]);
        setSelectedId(created.id);
        setNewName('');
        setNewDesc('');
        setNewRawJsonl('');
        setShowCreateForm(false);
        setActionNotice(`تم إنشاء مجموعة "${created.name}" (${created.samplesCount} عينات).`);
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function handleAddSamples() {
    if (!activeDataset) return;
    setBusyAction('import');
    setActionNotice(null);
    try {
      const payload =
        importMode === 'jsonl'
          ? { rawJsonl: impJsonl }
          : {
              instruction: impInst,
              input: impInput,
              output: impOutput,
              reasoning: impReasoning,
              rejected: impRejected,
            };

      const res = await fetch(`/api/datasets/${activeDataset.id}/samples`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionNotice(data.error || 'تعذر إضافة العينات');
        return;
      }
      const updated = data.dataset as TrainingDataset;
      onDatasetsUpdated(datasets.map((d) => (d.id === updated.id ? updated : d)));
      setImpInst('');
      setImpInput('');
      setImpOutput('');
      setImpReasoning('');
      setImpRejected('');
      setImpJsonl('');
      setShowImportSamples(false);
      setActionNotice(`تمت إضافة ${data.addedCount} عينة تدريب وتقييم جودتها تلقائياً.`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCurateDataset() {
    if (!activeDataset) return;
    setBusyAction('curate');
    setActionNotice(null);
    try {
      const res = await fetch(`/api/datasets/${activeDataset.id}/curate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minQualityScore: minQualityThreshold }),
      });
      if (res.ok) {
        const result = (await res.json()) as {
          dataset: TrainingDataset;
          report: {
            beforeCount: number;
            afterCount: number;
            duplicatesRemoved: number;
            lowQualityRemoved: number;
          };
        };
        onDatasetsUpdated(
          datasets.map((d) => (d.id === result.dataset.id ? result.dataset : d))
        );
        setActionNotice(
          `اكتملت تنقية البيانات: ${result.report.beforeCount} -> ${result.report.afterCount} عينة (حُذف ${result.report.duplicatesRemoved} مكرر و ${result.report.lowQualityRemoved} دون حد الجودة ${minQualityThreshold}).`
        );
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSynthesizeFromProject() {
    if (!activeDataset) return;
    setBusyAction('synthesize');
    setActionNotice(null);
    try {
      const res = await fetch(`/api/datasets/${activeDataset.id}/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id }),
      });
      if (res.ok) {
        const data = (await res.json()) as { dataset: TrainingDataset; addedCount: number };
        onDatasetsUpdated(
          datasets.map((d) => (d.id === data.dataset.id ? data.dataset : d))
        );
        setActionNotice(
          `تم توليد ${data.addedCount} عينة تدريب مؤصلة من جداول ووثائق ومسارات مشروع "${project.name}".`
        );
      }
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">مجموعات التدريب المعتمدة</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
            {datasets.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">SFT · CoT · Tool-Call · DPO</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">إجمالي عينات التدريب المنقاة</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
            {totalSamplesAll}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">جاهزة للتصدير والتدريب المحلي</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">حجم الرموز المقدر (Tokens)</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
            {totalTokensAll.toLocaleString('en-US')}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">عربي · إنجليزي · برمجة</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">متوسط جودة المكتبة</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-1">
            {avgCorpusQuality}%
          </div>
          <div className="text-[11px] text-slate-500 mt-1">بعد فحص التكرار والبنية</div>
        </div>
      </section>

      {/* Main Header & Recharts Corpus Quality Overview */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Database className="w-5 h-5 text-slate-700 dark:text-slate-300 mt-0.5 shrink-0" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                مكتبة بيانات التدريب المتقدمة (ALHELBAWEY Training Data Library)
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-3xl leading-relaxed">
                منظومة متكاملة لإعداد وتنقية بيانات تدريب النماذج اللغوية محلياً: تدعم التنسيقات القياسية (Alpaca, ChatML, ShareGPT, DPO, CoT Reasoning, Tool-Calling)، إزالة التكرار الدلالي، التوليد المباشر من جداول ووثائق المشاريع، والتصدير بصيغة JSONL جاهزة لـ LoRA/QLoRA.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowCreateForm((v) => !v)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{showCreateForm ? 'إغلاق النموذج' : 'مجموعة بيانات جديدة / استيراد JSONL'}</span>
          </button>
        </div>

        {/* Create Dataset Drawer */}
        {showCreateForm && (
          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
              إنشاء مجموعة بيانات تدريب مخصصة
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="اسم المجموعة (مثال: بيانات العقود الطبية)"
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
              />
              <select
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value as TrainingDomain)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
              >
                {Object.entries(DOMAIN_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                value={newFormat}
                onChange={(e) => setNewFormat(e.target.value as TrainingDatasetFormat)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono"
              >
                <option value="Alpaca-SFT">Alpaca-SFT</option>
                <option value="ChatML">ChatML</option>
                <option value="ShareGPT">ShareGPT</option>
                <option value="CoT-Reasoning">CoT-Reasoning</option>
                <option value="Tool-Calling">Tool-Calling</option>
                <option value="DPO-Preference">DPO-Preference</option>
              </select>
            </div>
            <input
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="وصف مختصر لهدف التدريب والمجال..."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
            />
            <textarea
              rows={3}
              dir="ltr"
              value={newRawJsonl}
              onChange={(e) => setNewRawJsonl(e.target.value)}
              placeholder='اختياري: الصق أسطر JSONL بصيغة {"instruction":"...","input":"...","output":"..."} أو ChatML أو DPO'
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono"
            />
            <div className="flex justify-end">
              <button
                type="button"
                disabled={busyAction === 'create' || !newName.trim()}
                onClick={handleCreateDataset}
                className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {busyAction === 'create' ? 'جاري الحفظ...' : 'حفظ وإضافة للمكتبة'}
              </button>
            </div>
          </div>
        )}

        {/* Recharts Quality Overview BarChart */}
        {chartData.length > 0 && (
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-900 dark:text-slate-100">
                مؤشر جودة المجموعات عبر المكتبة (من 100)
              </span>
              <span className="text-slate-500">اضغط على أي عمود لاختيار المجموعة</span>
            </div>
            <div dir="ltr" className="w-full min-w-0 h-[165px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 8, right: 8, left: -20, bottom: 2 }}
                  onClick={(state) => {
                    const idx =
                      typeof state?.activeTooltipIndex === 'number' ? state.activeTooltipIndex : -1;
                    if (idx >= 0 && chartData[idx]) setSelectedId(chartData[idx].id);
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} vertical={false} />
                  <XAxis
                    dataKey="shortName"
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={<DatasetMetricsTooltip />}
                    cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
                  />
                  <Bar
                    dataKey="avgQualityScore"
                    name="متوسط الجودة"
                    fill="#059669"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={28}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </section>

      {actionNotice && (
        <div
          role="status"
          className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Split Layout: Left Dataset Catalog (4 cols) + Right Active Dataset Workbench (8 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Catalog */}
        <section className="xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
          <div className="p-4 space-y-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث في مجموعات التدريب..."
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pr-8 pl-3 py-1.5 text-xs"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                value={domainFilter}
                onChange={(e) => setDomainFilter(e.target.value as TrainingDomain | 'all')}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs"
              >
                <option value="all">جميع المجالات ({datasets.length})</option>
                {Object.entries(DOMAIN_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[600px] overflow-y-auto">
            {filteredDatasets.map((ds) => {
              const selected = activeDataset?.id === ds.id;
              return (
                <button
                  key={ds.id}
                  type="button"
                  onClick={() => setSelectedId(ds.id)}
                  className={`w-full text-right p-4 space-y-1.5 transition-colors cursor-pointer ${
                    selected
                      ? 'bg-slate-100/90 dark:bg-slate-800/70'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-950/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      {ds.name}
                    </div>
                    <span className="font-mono text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                      {ds.avgQualityScore}%
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 line-clamp-2">{ds.descriptionAr}</div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400 pt-0.5">
                    <span>{ds.format}</span>
                    <span aria-hidden="true">·</span>
                    <span>{ds.samplesCount} عينات</span>
                    <span aria-hidden="true">·</span>
                    <span>{ds.totalTokensEstimate} tok</span>
                    <span aria-hidden="true">·</span>
                    <span>{ds.license}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Right Active Dataset Workbench */}
        {activeDataset && (
          <section className="xl:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
            {/* Dataset Header & Primary Actions */}
            <div className="p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      {activeDataset.name}
                    </h3>
                    <span className="text-[11px] font-mono text-slate-500">
                      v{activeDataset.version} · {activeDataset.format} · {activeDataset.license}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    {activeDataset.descriptionAr}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onSendToFineTune(activeDataset)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>إرسال للتدريب (LoRA / QLoRA)</span>
                </button>
              </div>

              {/* Pipeline Action Bar: Curate/Dedup + Synthesize from Project + Import + Export JSONL */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-xs">
                    <span className="text-slate-500 text-[11px]">حد الجودة:</span>
                    <select
                      value={minQualityThreshold}
                      onChange={(e) => setMinQualityThreshold(Number(e.target.value))}
                      className="bg-transparent font-mono font-semibold outline-none"
                    >
                      <option value={50}>50+</option>
                      <option value={65}>65+</option>
                      <option value={75}>75+</option>
                      <option value={85}>85+</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    disabled={busyAction === 'curate'}
                    onClick={handleCurateDataset}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{busyAction === 'curate' ? 'جاري التنقية...' : 'تنقية وإزالة التكرار'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={busyAction === 'synthesize'}
                    onClick={handleSynthesizeFromProject}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>
                      {busyAction === 'synthesize'
                        ? 'جاري التوليد...'
                        : `توليد من مشروع "${project.name}"`}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowImportSamples((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>إضافة / استيراد عينات</span>
                  </button>
                </div>

                {/* Multi-format JSONL Export */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-slate-500 ml-1">تصدير JSONL:</span>
                  {(['alpaca', 'chatml', 'sharegpt', 'dpo'] as const).map((fmt) => (
                    <a
                      key={fmt}
                      href={`/api/datasets/${activeDataset.id}/export?format=${fmt}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-[11px] font-mono hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Download className="w-3 h-3" />
                      <span>{fmt}</span>
                    </a>
                  ))}
                </div>
              </div>

              {/* Import Samples Form */}
              {showImportSamples && (
                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">إضافة عينات إلى {activeDataset.name}</span>
                    <div className="flex items-center gap-1 p-0.5 bg-slate-200 dark:bg-slate-800 rounded-md text-[11px]">
                      <button
                        type="button"
                        onClick={() => setImportMode('single')}
                        className={`px-2.5 py-1 rounded cursor-pointer ${
                          importMode === 'single'
                            ? 'bg-white dark:bg-slate-900 font-semibold'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        عينة منظمة
                      </button>
                      <button
                        type="button"
                        onClick={() => setImportMode('jsonl')}
                        className={`px-2.5 py-1 rounded cursor-pointer ${
                          importMode === 'jsonl'
                            ? 'bg-white dark:bg-slate-900 font-semibold'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        استيراد JSONL دفعة واحدة
                      </button>
                    </div>
                  </div>

                  {importMode === 'single' ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={impInst}
                        onChange={(e) => setImpInst(e.target.value)}
                        placeholder="التعليمات / السؤال (Instruction)"
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
                      />
                      <input
                        type="text"
                        value={impInput}
                        onChange={(e) => setImpInput(e.target.value)}
                        placeholder="السياق أو المدخلات (Input — اختياري)"
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
                      />
                      <textarea
                        rows={2}
                        value={impOutput}
                        onChange={(e) => setImpOutput(e.target.value)}
                        placeholder="المخرج المستهدف عالي الجودة (Output / Chosen)"
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
                      />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={impReasoning}
                          onChange={(e) => setImpReasoning(e.target.value)}
                          placeholder="مسار التفكير CoT <think> (اختياري)"
                          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
                        />
                        <input
                          type="text"
                          value={impRejected}
                          onChange={(e) => setImpRejected(e.target.value)}
                          placeholder="الإجابة المرفوضة DPO Rejected (اختياري)"
                          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
                        />
                      </div>
                    </div>
                  ) : (
                    <textarea
                      rows={4}
                      dir="ltr"
                      value={impJsonl}
                      onChange={(e) => setImpJsonl(e.target.value)}
                      placeholder='{"instruction": "...", "input": "...", "output": "..."}\n{"messages": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}'
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono"
                    />
                  )}

                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={busyAction === 'import'}
                      onClick={handleAddSamples}
                      className="px-4 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
                    >
                      {busyAction === 'import' ? 'جاري الاستيراد...' : 'اعتماد وحفظ العينات'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Samples Search Bar */}
            <div className="px-5 py-3 bg-slate-50 dark:bg-slate-950/60 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
                <Layers className="w-3.5 h-3.5" />
                <span>
                  {filteredSamples.length} / {activeDataset.samplesCount} عينة
                </span>
                <span aria-hidden="true">·</span>
                <span>{activeDataset.totalTokensEstimate.toLocaleString('en-US')} tokens</span>
                <span aria-hidden="true">·</span>
                <span>
                  {activeDataset.deduplicated ? 'منقى من التكرار' : 'يحتاج فحص تنقية'}
                </span>
              </div>

              <div className="relative min-w-[220px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2 pointer-events-none" />
                <input
                  type="text"
                  value={sampleSearch}
                  onChange={(e) => setSampleSearch(e.target.value)}
                  placeholder="تصفية داخل العينات..."
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pr-8 pl-2.5 py-1 text-xs"
                />
              </div>
            </div>

            {/* Samples List */}
            <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[540px] overflow-y-auto">
              {filteredSamples.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  لا توجد عينات مطابقة للبحث. يمكنك توليد عينات من مشروعك أو استيراد ملف JSONL.
                </div>
              ) : (
                filteredSamples.map((s) => (
                  <div key={s.id} className="p-4 space-y-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-slate-500">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {s.language.toUpperCase()}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{s.difficulty}</span>
                        <span aria-hidden="true">·</span>
                        <span>{s.tokenEstimate} tok</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {s.source === 'project-synthesized'
                            ? 'مولّد من المشروع'
                            : s.source === 'imported'
                              ? 'مستورد'
                              : 'محرر ومعتمد'}
                        </span>
                      </div>

                      <span
                        className={`font-mono tabular-nums text-[11px] font-bold ${
                          s.qualityScore >= 80
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : s.qualityScore >= 65
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-rose-700 dark:text-rose-400'
                        }`}
                      >
                        جودة {s.qualityScore}/100
                      </span>
                    </div>

                    <div>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        التعليمات:{' '}
                      </span>
                      <span className="text-slate-900 dark:text-slate-100">{s.instruction}</span>
                    </div>

                    {s.input && (
                      <div className="p-2.5 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 font-mono whitespace-pre-wrap">
                        {s.input}
                      </div>
                    )}

                    {s.reasoning && (
                      <div className="p-2.5 rounded-md bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 text-[11px] text-amber-900 dark:text-amber-200 whitespace-pre-wrap">
                        <span className="font-bold">مسار التفكير (CoT): </span>
                        {s.reasoning}
                      </div>
                    )}

                    <div className="p-2.5 rounded-md bg-emerald-50/45 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/60 text-[11px] text-slate-900 dark:text-slate-100 whitespace-pre-wrap">
                      <span className="font-bold text-emerald-800 dark:text-emerald-400">
                        {s.rejected ? 'المخرج المفضل (Chosen): ' : 'المخرج المستهدف: '}
                      </span>
                      {s.output}
                    </div>

                    {s.rejected && (
                      <div className="p-2.5 rounded-md bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/60 text-[11px] text-rose-900 dark:text-rose-200 whitespace-pre-wrap">
                        <span className="font-bold">المخرج المرفوض (DPO Rejected): </span>
                        {s.rejected}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
