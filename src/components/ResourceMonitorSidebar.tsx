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
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ModelWeightEntry, Project } from '../types/helbawey';

export interface HostTelemetry {
  cpuModel: string;
  cpuCores: number;
  cpuPercent: number;
  totalRamGb: number;
  usedRamGb: number;
  ramPercent: number;
  processRssMb: number;
}

export interface ProjectComputeMetric {
  projectId: string;
  projectName: string;
  targetOs: string;
  targetRamGb: number;
  targetGpuVramGb: number;
  runtimeEngine: string;
  selectedModelId: string;
  selectedModelName: string;
  selectedModelParams: string;
  cpuPercent: number;
  ramUsedGb: number;
  ramPercent: number;
  hasGpu: boolean;
  gpuVramUsedGb: number;
  gpuPercent: number;
  measuredTokensPerSec: number;
  fitVerdict: 'OPTIMAL' | 'TIGHT_FIT' | 'EXCEEDS_DEVICE';
  hostMeetsTargetRam?: boolean;
  telemetryMode?: string;
  recommendedModelId: string;
  recommendedModelName: string;
  recommendedModelRamGb: number;
}

export interface TelemetryPayload {
  sampledAt: string;
  telemetryMode?: string;
  host: HostTelemetry;
  projects: ProjectComputeMetric[];
}

interface TimelinePoint {
  timeLabel: string;
  cpu: number;
  ram: number;
  gpu: number;
  ramUsedGb: number;
  gpuVramUsedGb: number;
}

interface BarDatum {
  projectId: string;
  shortName: string;
  projectName: string;
  selectedModelName: string;
  cpu: number;
  ram: number;
  gpu: number;
  ramDetail: string;
  gpuDetail: string;
  tokensPerSec: number;
  fitVerdict: ProjectComputeMetric['fitVerdict'];
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number;
    color?: string;
    payload?: BarDatum & TimelinePoint;
  }>;
  label?: string;
}

function ResourceBarTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0]?.payload;
  if (!datum) return null;

  return (
    <div
      dir="rtl"
      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 shadow-lg text-[11px] space-y-1.5 min-w-[190px]"
    >
      <div className="font-bold text-slate-900 dark:text-slate-100">{datum.projectName}</div>
      <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
        {datum.selectedModelName} · {datum.tokensPerSec} tok/s
      </div>
      <div className="space-y-1 pt-1 border-t border-slate-100 dark:border-slate-800 font-mono tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <span className="text-emerald-700 dark:text-emerald-400">CPU</span>
          <span className="font-semibold text-slate-900 dark:text-slate-100">{datum.cpu}%</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sky-700 dark:text-sky-400">RAM</span>
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {datum.ram}% ({datum.ramDetail})
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-amber-700 dark:text-amber-400">GPU</span>
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {datum.gpu}% ({datum.gpuDetail})
          </span>
        </div>
      </div>
    </div>
  );
}

function TimelineTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;

  return (
    <div
      dir="rtl"
      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 shadow-lg text-[11px] space-y-1 min-w-[160px]"
    >
      <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
        القراءة: {label}
      </div>
      <div className="space-y-0.5 font-mono tabular-nums">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-3">
            <span style={{ color: entry.color }}>{entry.name}</span>
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {entry.value}%
            </span>
          </div>
        ))}
        {point && (
          <div className="pt-1 mt-1 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-500">
            RAM: {point.ramUsedGb} GB · GPU: {point.gpuVramUsedGb} GB
          </div>
        )}
      </div>
    </div>
  );
}

function getFitStatus(verdict: ProjectComputeMetric['fitVerdict']) {
  if (verdict === 'EXCEEDS_DEVICE') {
    return {
      text: 'يتجاوز قدرة الجهاز',
      colorClass: 'text-rose-700 dark:text-rose-400',
    };
  }
  if (verdict === 'TIGHT_FIT') {
    return {
      text: 'هامش ذاكرة محدود',
      colorClass: 'text-amber-700 dark:text-amber-400',
    };
  }
  return {
    text: 'ملائم للجهاز',
    colorClass: 'text-emerald-700 dark:text-emerald-400',
  };
}

interface Props {
  projects: Project[];
  models: ModelWeightEntry[];
  onProjectUpdated: (updated: Project) => void;
}

export function ResourceMonitorSidebar({ projects, models, onProjectUpdated }: Props) {
  const [telemetry, setTelemetry] = useState<TelemetryPayload | null>(null);
  const [historyMap, setHistoryMap] = useState<Record<string, TimelinePoint[]>>({});
  const [focusedProjectId, setFocusedProjectId] = useState<string>(projects[0]?.id || '');
  const [livePolling, setLivePolling] = useState(true);
  const [pollIntervalMs, setPollIntervalMs] = useState(2500);
  const [visibleMetrics, setVisibleMetrics] = useState({ cpu: true, ram: true, gpu: true });
  const [applyingProjectId, setApplyingProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
          const next: Record<string, TimelinePoint[]> = { ...prev };
          for (const p of payload.projects) {
            const current = next[p.projectId] || [];
            next[p.projectId] = [
              ...current,
              {
                timeLabel,
                cpu: p.cpuPercent,
                ram: p.ramPercent,
                gpu: p.hasGpu ? p.gpuPercent : 0,
                ramUsedGb: p.ramUsedGb,
                gpuVramUsedGb: p.gpuVramUsedGb,
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

  const barData = useMemo<BarDatum[]>(() => {
    if (!telemetry) return [];
    return telemetry.projects.map((p) => ({
      projectId: p.projectId,
      shortName: p.projectName.length > 14 ? `${p.projectName.slice(0, 14)}…` : p.projectName,
      projectName: p.projectName,
      selectedModelName: p.selectedModelName,
      cpu: p.cpuPercent,
      ram: p.ramPercent,
      gpu: p.hasGpu ? p.gpuPercent : 0,
      ramDetail: `${p.ramUsedGb}/${p.targetRamGb} GB`,
      gpuDetail: p.hasGpu ? `${p.gpuVramUsedGb}/${p.targetGpuVramGb} GB` : 'CPU-Only',
      tokensPerSec: p.measuredTokensPerSec,
      fitVerdict: p.fitVerdict,
    }));
  }, [telemetry]);

  const activeMetric = useMemo(() => {
    if (!telemetry || telemetry.projects.length === 0) return null;
    return (
      telemetry.projects.find((p) => p.projectId === focusedProjectId) || telemetry.projects[0]
    );
  }, [telemetry, focusedProjectId]);

  const timelineData = useMemo<TimelinePoint[]>(() => {
    if (!activeMetric) return [];
    const pts = historyMap[activeMetric.projectId];
    if (pts && pts.length > 0) return pts;
    return [
      {
        timeLabel: '--:--',
        cpu: activeMetric.cpuPercent,
        ram: activeMetric.ramPercent,
        gpu: activeMetric.hasGpu ? activeMetric.gpuPercent : 0,
        ramUsedGb: activeMetric.ramUsedGb,
        gpuVramUsedGb: activeMetric.gpuVramUsedGb,
      },
    ];
  }, [activeMetric, historyMap]);

  async function handleApplyRecommended(projectId: string, recommendedModelId: string) {
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

  return (
    <aside
      aria-label="اللوحة الجانبية لاستهلاك الموارد اللحظي"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800"
    >
      {/* 1. Sidebar Header & Polling Controls */}
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                اللوحة الجانبية: استهلاك الموارد اللحظي
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                CPU و GPU و RAM لكل مشروع نشط عبر Recharts
              </p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-600 dark:text-slate-400 shrink-0">
            <span
              className={`w-2 h-2 rounded-full ${
                livePolling ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
              }`}
            />
            <span>{livePolling ? 'مباشر' : 'متوقف'}</span>
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {telemetry && (
            <div className="space-y-0.5">
              <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                المضيف (حي OS): {telemetry.host.cpuCores} أنوية · CPU {telemetry.host.cpuPercent}% · RAM{' '}
                {telemetry.host.usedRamGb}/{telemetry.host.totalRamGb} GB
              </div>
              {telemetry.telemetryMode === 'ESTIMATED_MODEL_PROFILE_WITH_LIVE_HOST_OS' && (
                <div className="text-[10px] text-amber-700 dark:text-amber-400">
                  قياسات المضيف حية · أحمال المشروع تقديرية لعدم تشغيل محرك أوزان محلي
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <select
              value={pollIntervalMs}
              onChange={(e) => setPollIntervalMs(Number(e.target.value))}
              aria-label="فترة تحديث اللوحة الجانبية"
              className="rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-[11px] font-mono tabular-nums"
            >
              <option value={1000}>1s</option>
              <option value={2500}>2.5s</option>
              <option value={5000}>5s</option>
            </select>

            <button
              type="button"
              onClick={() => setLivePolling((v) => !v)}
              aria-label={livePolling ? 'إيقاف البث المؤقت' : 'استئناف البث'}
              className="p-1.5 rounded-md border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              {livePolling ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={fetchTelemetry}
              aria-label="تحديث القراءات الآن"
              className="p-1.5 rounded-md border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && !telemetry && (
        <div className="p-4 space-y-3">
          <div className="h-44 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
          <div className="h-40 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
        </div>
      )}

      {/* 2. Recharts Interactive BarChart: All Active Projects Comparison */}
      {telemetry && barData.length > 0 && (
        <div className="p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
              مقارنة استهلاك المشاريع النشطة (%)
            </h3>
            <span className="text-[10px] text-slate-400">مرّر المؤشر أو اضغط على مشروع</span>
          </div>

          <div dir="ltr" className="w-full min-w-0 h-[185px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={barData}
                margin={{ top: 8, right: 6, left: -22, bottom: 2 }}
                onClick={(state) => {
                  const idx = typeof state?.activeTooltipIndex === 'number' ? state.activeTooltipIndex : -1;
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
                  content={<ResourceBarTooltip />}
                  cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '4px' }} />
                <Bar
                  dataKey="cpu"
                  name="CPU %"
                  fill="#059669"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={20}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="ram"
                  name="RAM %"
                  fill="#0284c7"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={20}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="gpu"
                  name="GPU %"
                  fill="#d97706"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={20}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 3. Recharts Interactive AreaChart: Live Timeline for Selected Project */}
      {activeMetric && (
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
              المنحنى اللحظي للمشروع المحدد
            </h3>
            <select
              value={activeMetric.projectId}
              onChange={(e) => setFocusedProjectId(e.target.value)}
              aria-label="اختيار المشروع النشط في الرسم الزمني"
              className="max-w-[190px] truncate rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-[11px]"
            >
              {telemetry?.projects.map((p) => (
                <option key={p.projectId} value={p.projectId}>
                  {p.projectName}
                </option>
              ))}
            </select>
          </div>

          {/* Interactive Metric Toggles */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {(
                [
                  { key: 'cpu', label: 'CPU', color: 'bg-emerald-600' },
                  { key: 'ram', label: 'RAM', color: 'bg-sky-600' },
                  { key: 'gpu', label: 'GPU', color: 'bg-amber-600' },
                ] as const
              ).map((m) => {
                const enabled = visibleMetrics[m.key];
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() =>
                      setVisibleMetrics((prev) => {
                        const next = { ...prev, [m.key]: !prev[m.key] };
                        if (!next.cpu && !next.ram && !next.gpu) return prev;
                        return next;
                      })
                    }
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-mono cursor-pointer transition-opacity ${
                      enabled
                        ? 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200'
                        : 'border-slate-200 dark:border-slate-800 text-slate-400 opacity-55'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${m.color}`} />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="text-[11px] font-mono tabular-nums text-slate-500">
              {timelineData.length} عينات
            </div>
          </div>

          <div dir="ltr" className="w-full min-w-0 h-[175px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={timelineData}
                margin={{ top: 6, right: 6, left: -22, bottom: 2 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} vertical={false} />
                <XAxis
                  dataKey="timeLabel"
                  tick={{ fontSize: 9, fill: '#64748b' }}
                  minTickGap={18}
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
                <Tooltip content={<TimelineTooltip />} />
                {visibleMetrics.cpu && (
                  <Area
                    type="monotone"
                    dataKey="cpu"
                    name="CPU"
                    stroke="#059669"
                    fill="#059669"
                    fillOpacity={0.14}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                  />
                )}
                {visibleMetrics.ram && (
                  <Area
                    type="monotone"
                    dataKey="ram"
                    name="RAM"
                    stroke="#0284c7"
                    fill="#0284c7"
                    fillOpacity={0.12}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                  />
                )}
                {visibleMetrics.gpu && (
                  <Area
                    type="monotone"
                    dataKey="gpu"
                    name="GPU"
                    stroke="#d97706"
                    fill="#d97706"
                    fillOpacity={0.12}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 4. Compact Per-Project Live Readings */}
      {telemetry && (
        <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[340px] overflow-y-auto">
          {telemetry.projects.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-500">
              لا توجد مشاريع نشطة لعرض استهلاك مواردها.
            </div>
          ) : (
            telemetry.projects.map((item) => {
              const fit = getFitStatus(item.fitVerdict);
              const isFocused = activeMetric?.projectId === item.projectId;
              const needsChange =
                item.recommendedModelId && item.recommendedModelId !== item.selectedModelId;

              return (
                <div
                  key={item.projectId}
                  onClick={() => setFocusedProjectId(item.projectId)}
                  className={`p-3.5 space-y-2 cursor-pointer transition-colors ${
                    isFocused
                      ? 'bg-slate-50/90 dark:bg-slate-950/70'
                      : 'hover:bg-slate-50/60 dark:hover:bg-slate-950/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                        {item.projectName}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 truncate">
                        {item.selectedModelName} · {item.targetOs} · {item.measuredTokensPerSec} tok/s
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-semibold shrink-0 ${fit.colorClass}`}
                    >
                      {item.fitVerdict === 'OPTIMAL' ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <AlertTriangle className="w-3 h-3" />
                      )}
                      <span>{fit.text}</span>
                    </span>
                  </div>

                  {/* Flat Tabular Metrics Row */}
                  <div className="grid grid-cols-3 gap-2 pt-0.5 text-[11px] font-mono tabular-nums">
                    <div>
                      <div className="inline-flex items-center gap-1 text-slate-500">
                        <Cpu className="w-3 h-3 text-emerald-600" />
                        <span>CPU</span>
                      </div>
                      <div className="font-bold text-slate-900 dark:text-slate-100">
                        {item.cpuPercent}%
                      </div>
                    </div>
                    <div>
                      <div className="inline-flex items-center gap-1 text-slate-500">
                        <HardDrive className="w-3 h-3 text-sky-600" />
                        <span>RAM</span>
                      </div>
                      <div className="font-bold text-slate-900 dark:text-slate-100">
                        {item.ramUsedGb}/{item.targetRamGb}G
                      </div>
                    </div>
                    <div>
                      <div className="inline-flex items-center gap-1 text-slate-500">
                        <Activity className="w-3 h-3 text-amber-600" />
                        <span>GPU</span>
                      </div>
                      <div className="font-bold text-slate-900 dark:text-slate-100">
                        {item.hasGpu ? `${item.gpuVramUsedGb}/${item.targetGpuVramGb}G` : 'CPU-Only'}
                      </div>
                    </div>
                  </div>

                  {item.hostMeetsTargetRam === false && telemetry && (
                    <div className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">
                      تنبيه: ذاكرة المضيف ({telemetry.host.totalRamGb} GB) أقل من مواصفات جهاز العميل ({item.targetRamGb} GB)
                    </div>
                  )}

                  {needsChange && (
                    <div
                      className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-100 dark:border-slate-800/80"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-[11px] text-slate-500 truncate">
                        الأنسب: <strong className="font-mono">{item.recommendedModelName}</strong>
                      </span>
                      <button
                        type="button"
                        disabled={applyingProjectId === item.projectId}
                        onClick={() =>
                          handleApplyRecommended(item.projectId, item.recommendedModelId)
                        }
                        className="px-2.5 py-1 rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-[11px] font-medium shrink-0 cursor-pointer disabled:opacity-50"
                      >
                        {applyingProjectId === item.projectId ? 'تطبيق...' : 'اعتماد'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </aside>
  );
}
