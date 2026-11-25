import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  HardDrive,
  Pause,
  Play,
  RefreshCw,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ModelWeightEntry, Project } from '../types/helbawey';
import type { ProjectComputeMetric, TelemetryPayload } from './ResourceMonitorSidebar';

interface Props {
  projects: Project[];
  models: ModelWeightEntry[];
  onProjectUpdated: (updated: Project) => void;
}

interface TimelineSample {
  timeLabel: string;
  cpu: number;
  ram: number;
  gpu: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number;
    color?: string;
    payload?: { projectName?: string; selectedModelName?: string; tokensPerSec?: number };
  }>;
  label?: string;
}

function ChartTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const meta = payload[0]?.payload;

  return (
    <div
      dir="rtl"
      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 shadow-lg text-[11px] space-y-1 min-w-[175px]"
    >
      <div className="font-bold text-slate-900 dark:text-slate-100">
        {meta?.projectName || label}
      </div>
      {meta?.selectedModelName && (
        <div className="text-[10px] font-mono text-slate-500">
          {meta.selectedModelName}
          {meta.tokensPerSec ? ` · ${meta.tokensPerSec} tok/s` : ''}
        </div>
      )}
      <div className="space-y-0.5 pt-1 border-t border-slate-100 dark:border-slate-800 font-mono tabular-nums">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-4">
            <span style={{ color: entry.color }}>{entry.name}</span>
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {entry.value}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function getBarColorClass(percent: number): string {
  if (percent >= 85) return 'bg-rose-600 dark:bg-rose-500';
  if (percent >= 68) return 'bg-amber-500 dark:bg-amber-400';
  return 'bg-emerald-600 dark:bg-emerald-500';
}

function getFitLabel(verdict: ProjectComputeMetric['fitVerdict']): {
  text: string;
  colorClass: string;
} {
  if (verdict === 'EXCEEDS_DEVICE') {
    return {
      text: 'يتجاوز قدرة الجهاز — يلزم تصغير النموذج',
      colorClass: 'text-rose-700 dark:text-rose-400',
    };
  }
  if (verdict === 'TIGHT_FIT') {
    return {
      text: 'استهلاك مرتفع — هامش ذاكرة محدود',
      colorClass: 'text-amber-700 dark:text-amber-400',
    };
  }
  return {
    text: 'ملائم تماماً لمواصفات الجهاز',
    colorClass: 'text-emerald-700 dark:text-emerald-400',
  };
}

function MiniSparkline({
  data,
  dataKey,
  stroke,
}: {
  data: TimelineSample[];
  dataKey: 'cpu' | 'ram' | 'gpu';
  stroke: string;
}) {
  return (
    <div dir="ltr" className="w-[116px] h-[34px] shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <YAxis domain={[0, 100]} hide />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={stroke}
            strokeWidth={1.75}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ProjectComputeMonitor({ projects, models, onProjectUpdated }: Props) {
  const [telemetry, setTelemetry] = useState<TelemetryPayload | null>(null);
  const [historyMap, setHistoryMap] = useState<Record<string, TimelineSample[]>>({});
  const [livePolling, setLivePolling] = useState(true);
  const [pollIntervalMs, setPollIntervalMs] = useState<number>(2500);
  const [focusedProjectId, setFocusedProjectId] = useState<string>(projects[0]?.id || '');
  const [loading, setLoading] = useState(true);
  const [applyingProjectId, setApplyingProjectId] = useState<string | null>(null);

  const fetchTelemetry = useCallback(async () => {
    try {
      const res = await fetch('/api/telemetry/compute');
      if (res.ok) {
        const payload = (await res.json()) as TelemetryPayload;
        setTelemetry(payload);
        const timeLabel = new Date(payload.sampledAt).toLocaleTimeString('en-GB', {
          hour12: false,
          minute: '2-digit',
          second: '2-digit',
        });

        setHistoryMap((prev) => {
          const next: Record<string, TimelineSample[]> = { ...prev };
          for (const p of payload.projects) {
            const current = next[p.projectId] || [];
            next[p.projectId] = [
              ...current,
              {
                timeLabel,
                cpu: p.cpuPercent,
                ram: p.ramPercent,
                gpu: p.hasGpu ? p.gpuPercent : 0,
              },
            ].slice(-24);
          }
          return next;
        });

        setFocusedProjectId((curr) =>
          payload.projects.some((p) => p.projectId === curr)
            ? curr
            : payload.projects[0]?.projectId || ''
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTelemetry();
  }, [fetchTelemetry, projects]);

  useEffect(() => {
    if (!livePolling) return;
    const timer = setInterval(fetchTelemetry, pollIntervalMs);
    return () => clearInterval(timer);
  }, [livePolling, pollIntervalMs, fetchTelemetry]);

  const barData = useMemo(() => {
    if (!telemetry) return [];
    return telemetry.projects.map((proj) => ({
      projectId: proj.projectId,
      shortName: proj.projectName.length > 16 ? `${proj.projectName.slice(0, 16)}…` : proj.projectName,
      projectName: proj.projectName,
      selectedModelName: proj.selectedModelName,
      tokensPerSec: proj.measuredTokensPerSec,
      cpu: proj.cpuPercent,
      ram: proj.ramPercent,
      gpu: proj.hasGpu ? proj.gpuPercent : 0,
    }));
  }, [telemetry]);

  async function handleApplyRecommendedModel(projectId: string, recommendedModelId: string) {
    const project = projects.find((p) => p.id === projectId);
    const model = models.find((m) => m.id === recommendedModelId);
    if (!project || !model) return;

    setApplyingProjectId(projectId);
    try {
      const updatedFiles = {
        ...project.files,
        'ai/model.config.json': JSON.stringify(
          {
            modelId: model.id,
            modelName: model.name,
            runtimeEngine: model.runtimeEngines[0] || project.runtimeEngine,
            quantization: model.quantization,
            offlineDefault: true,
          },
          null,
          2
        ),
      };

      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedModelId: model.id,
          runtimeEngine: model.runtimeEngines[0] || project.runtimeEngine,
          files: updatedFiles,
        }),
      });
      if (res.ok) {
        onProjectUpdated((await res.json()) as Project);
        await fetchTelemetry();
      }
    } finally {
      setApplyingProjectId(null);
    }
  }

  const activeMetric =
    telemetry?.projects.find((p) => p.projectId === focusedProjectId) || telemetry?.projects[0];
  const activeHistory: TimelineSample[] = activeMetric
    ? historyMap[activeMetric.projectId] || [
        {
          timeLabel: '--:--',
          cpu: activeMetric.cpuPercent,
          ram: activeMetric.ramPercent,
          gpu: activeMetric.hasGpu ? activeMetric.gpuPercent : 0,
        },
      ]
    : [];

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
      {/* Header & Live Host Summary */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-start gap-2.5">
          <Activity className="w-5 h-5 text-slate-700 dark:text-slate-300 mt-0.5 shrink-0" />
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                تحليل موارد البيئة والرسوم البيانية التفاعلية (Recharts)
              </h2>
              <span className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-600 dark:text-slate-400">
                <span
                  className={`w-2 h-2 rounded-full ${
                    livePolling ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                  }`}
                />
                <span>{livePolling ? 'بث لحظي نشط' : 'متوقف مؤقتاً'}</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              رصد لحظي لاستخدام CPU و GPU و RAM لكل مشروع نشط مع تتبع الذروة وملاءمة الأوزان لأجهزة العملاء.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {telemetry && (
            <div className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400 ml-2">
              المضيف (حي OS): {telemetry.host.cpuCores} أنوية · CPU {telemetry.host.cpuPercent}% · RAM{' '}
              {telemetry.host.usedRamGb}/{telemetry.host.totalRamGb} GB
            </div>
          )}

          <select
            value={pollIntervalMs}
            onChange={(e) => setPollIntervalMs(Number(e.target.value))}
            aria-label="فترة التحديث"
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono tabular-nums"
          >
            <option value={1000}>كل 1 ثانية</option>
            <option value={2500}>كل 2.5 ثانية</option>
            <option value={5000}>كل 5 ثوانٍ</option>
          </select>

          <button
            type="button"
            onClick={() => setLivePolling(!livePolling)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            {livePolling ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{livePolling ? 'إيقاف مؤقت' : 'تشغيل العداد'}</span>
          </button>

          <button
            type="button"
            onClick={fetchTelemetry}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="تحديث القراءات"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>قراءة فورية</span>
          </button>
        </div>
      </div>

      {loading && !telemetry && (
        <div className="space-y-3">
          <div className="h-44 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
        </div>
      )}

      {/* Interactive Recharts Row */}
      {telemetry && telemetry.projects.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Chart 1: Recharts BarChart comparing active projects */}
          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
              مقارنة استهلاك الموارد عبر المشاريع النشطة (%)
            </h3>
            <div dir="ltr" className="w-full min-w-0 h-[210px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={barData}
                  margin={{ top: 8, right: 8, left: -20, bottom: 2 }}
                  onClick={(state) => {
                    const idx =
                      typeof state?.activeTooltipIndex === 'number' ? state.activeTooltipIndex : -1;
                    if (idx >= 0 && barData[idx]) {
                      setFocusedProjectId(barData[idx].projectId);
                    }
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
                  <ReferenceLine y={85} stroke="#e11d48" strokeDasharray="3 3" strokeOpacity={0.65} />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar
                    dataKey="cpu"
                    name="CPU %"
                    fill="#059669"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={22}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="ram"
                    name="RAM %"
                    fill="#0284c7"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={22}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="gpu"
                    name="GPU %"
                    fill="#d97706"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={22}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Recharts AreaChart time-series */}
          {activeMetric && (
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  منحنى الأداء اللحظي عبر الزمن
                </h3>
                <select
                  value={activeMetric.projectId}
                  onChange={(e) => setFocusedProjectId(e.target.value)}
                  className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-[11px]"
                >
                  {telemetry.projects.map((p) => (
                    <option key={p.projectId} value={p.projectId}>
                      {p.projectName}
                    </option>
                  ))}
                </select>
              </div>

              <div dir="ltr" className="w-full min-w-0 h-[210px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={activeHistory}
                    margin={{ top: 8, right: 8, left: -20, bottom: 2 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} vertical={false} />
                    <XAxis
                      dataKey="timeLabel"
                      tick={{ fontSize: 9, fill: '#64748b' }}
                      minTickGap={16}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <ReferenceLine y={85} stroke="#e11d48" strokeDasharray="3 3" strokeOpacity={0.65} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Area
                      type="monotone"
                      dataKey="cpu"
                      name="CPU %"
                      stroke="#059669"
                      fill="#059669"
                      fillOpacity={0.14}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="ram"
                      name="RAM %"
                      stroke="#0284c7"
                      fill="#0284c7"
                      fillOpacity={0.12}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                    {activeMetric.hasGpu && (
                      <Area
                        type="monotone"
                        dataKey="gpu"
                        name="GPU %"
                        stroke="#d97706"
                        fill="#d97706"
                        fillOpacity={0.12}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Per-Project Live Resource Counters & Recharts Sparklines */}
      {telemetry && (
        <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
          {telemetry.projects.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              لا توجد مشاريع نشطة حالياً لعرض استهلاك مواردها.
            </div>
          ) : (
            telemetry.projects.map((item) => {
              const fit = getFitLabel(item.fitVerdict);
              const needsChange =
                item.recommendedModelId && item.recommendedModelId !== item.selectedModelId;
              const hist = historyMap[item.projectId] || [
                {
                  timeLabel: '--:--',
                  cpu: item.cpuPercent,
                  ram: item.ramPercent,
                  gpu: item.gpuPercent,
                },
              ];
              const peakCpu = Math.max(...hist.map((h) => h.cpu), item.cpuPercent);
              const peakRam = Math.max(...hist.map((h) => h.ram), item.ramPercent);

              return (
                <div key={item.projectId} className="p-4 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          {item.projectName}
                        </h3>
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-semibold ${fit.colorClass}`}
                        >
                          {item.fitVerdict === 'OPTIMAL' ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5" />
                          )}
                          <span>{fit.text}</span>
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
                        <span>النموذج: {item.selectedModelName}</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.selectedModelParams}</span>
                        <span aria-hidden="true">·</span>
                        <span>المحرك: {item.runtimeEngine}</span>
                        <span aria-hidden="true">·</span>
                        <span>السرعة: {item.measuredTokensPerSec} tok/s</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          الجهاز: {item.targetOs} ({item.targetRamGb} GB RAM)
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>ذروة CPU: {peakCpu}%</span>
                        <span aria-hidden="true">·</span>
                        <span>ذروة RAM: {peakRam}%</span>
                      </div>
                      {item.hostMeetsTargetRam === false && telemetry && (
                        <div className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                          تباين المواصفات: مواصفات العميل {item.targetRamGb} GB RAM بينما ذاكرة المضيف الفعلية {telemetry.host.totalRamGb} GB RAM فقط (تقدير أحمال المشروع مبني على ملف النموذج).
                        </div>
                      )}
                    </div>

                    {needsChange && (
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-600 dark:text-slate-400">
                          الأنسب للجهاز:{' '}
                          <strong className="font-mono text-slate-900 dark:text-slate-100">
                            {item.recommendedModelName}
                          </strong>
                        </span>
                        <button
                          type="button"
                          disabled={applyingProjectId === item.projectId}
                          onClick={() =>
                            handleApplyRecommendedModel(item.projectId, item.recommendedModelId)
                          }
                          className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium whitespace-nowrap cursor-pointer disabled:opacity-50"
                        >
                          {applyingProjectId === item.projectId
                            ? 'جاري التطبيق...'
                            : 'اعتماد النموذج الأنسب'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 3 Resource Gauges */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 font-medium">
                            <Cpu className="w-3.5 h-3.5" />
                            <span>استهلاك المعالج (CPU)</span>
                          </div>
                          <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                            {item.cpuPercent}%
                          </div>
                        </div>
                        <MiniSparkline data={hist} dataKey="cpu" stroke="#059669" />
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${getBarColorClass(
                            item.cpuPercent
                          )}`}
                          style={{ width: `${item.cpuPercent}%` }}
                        />
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 font-medium">
                            <HardDrive className="w-3.5 h-3.5" />
                            <span>الذاكرة العشوائية (RAM)</span>
                          </div>
                          <div className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
                            {item.ramUsedGb} / {item.targetRamGb} GB ({item.ramPercent}%)
                          </div>
                        </div>
                        <MiniSparkline data={hist} dataKey="ram" stroke="#0284c7" />
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${getBarColorClass(
                            item.ramPercent
                          )}`}
                          style={{ width: `${item.ramPercent}%` }}
                        />
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 font-medium">
                            <Activity className="w-3.5 h-3.5" />
                            <span>ذاكرة الرسوميات (GPU)</span>
                          </div>
                          <div className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
                            {item.hasGpu
                              ? `${item.gpuVramUsedGb} / ${item.targetGpuVramGb} GB (${item.gpuPercent}%)`
                              : 'CPU-Only (0 GB GPU)'}
                          </div>
                        </div>
                        <MiniSparkline
                          data={hist}
                          dataKey="gpu"
                          stroke={item.hasGpu ? '#d97706' : '#94a3b8'}
                        />
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            item.hasGpu
                              ? getBarColorClass(item.gpuPercent)
                              : 'bg-slate-300 dark:bg-slate-700'
                          }`}
                          style={{ width: `${item.hasGpu ? item.gpuPercent : 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {telemetry && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-500">
          <span>
            المعالج الفعلي (OS): {telemetry.host.cpuModel} · العينات: {Object.values(historyMap)[0]?.length || 1}
            {telemetry.telemetryMode === 'ESTIMATED_MODEL_PROFILE_WITH_LIVE_HOST_OS'
              ? ' · أحمال المشروع تقديرية لعدم وجود عملية llama.cpp نشطة'
              : ''}
          </span>
          <span>
            آخر قراءة: {new Date(telemetry.sampledAt).toLocaleTimeString('ar-EG')} · RSS الخادم:{' '}
            {telemetry.host.processRssMb} MB
          </span>
        </div>
      )}
    </section>
  );
}
