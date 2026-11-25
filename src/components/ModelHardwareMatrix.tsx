import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  FileText,
  Lock,
  Save,
  Scale,
  Search,
  ShieldBan,
  X,
} from 'lucide-react';
import type { ModelWeightEntry, Project } from '../types/helbawey';
import { ModelTechnicalReportModal } from './ModelTechnicalReportModal';

export interface HardwareValidationAlert {
  severity: 'error' | 'warning';
  title: string;
  details: string;
  projectId?: string;
  recommendedModelId?: string;
  recommendedModelName?: string;
}

interface Props {
  projects: Project[];
  models: ModelWeightEntry[];
  onProjectUpdated: (updated: Project) => void;
  onValidationAlert?: (alert: HardwareValidationAlert | null) => void;
}

type CompatibilityStatus =
  | 'COMPATIBLE_OPTIMAL'
  | 'COMPATIBLE_CPU_ONLY'
  | 'COMPATIBLE_TIGHT'
  | 'BLOCKED_EXCEEDS';

function parseGpuVramRequiredGb(gpuRequirements: string): number {
  const match = gpuRequirements.match(/(\d+(?:\.\d+)?)\s*GB/i);
  return match ? Number(match[1]) : 0;
}

function evaluateModelAgainstDevice(
  model: ModelWeightEntry,
  effectiveRamGb: number,
  effectiveGpuVramGb: number,
  effectiveOs: Project['targetOs']
) {
  const gpuReqGb = parseGpuVramRequiredGb(model.gpuRequirements);
  const ramDeltaGb = Number((effectiveRamGb - model.ramRequiredGb).toFixed(1));
  const minRamFits = effectiveRamGb >= model.minRamGb;
  const recRamFits = effectiveRamGb >= model.ramRequiredGb;
  const gpuFits = gpuReqGb === 0 || effectiveGpuVramGb >= gpuReqGb;
  const vramAndRamDeficit =
    gpuReqGb > 0 && effectiveGpuVramGb < gpuReqGb && effectiveRamGb < model.ramRequiredGb;
  const osFits =
    effectiveOs !== 'Android' || model.runtimeEngines.includes('Android-NNAPI');

  let status: CompatibilityStatus = 'COMPATIBLE_OPTIMAL';
  let statusLabel = 'متوافق تماماً';
  let reason = `يترك هامش ${Math.max(0, ramDeltaGb)} GB RAM`;

  if (!minRamFits) {
    status = 'BLOCKED_EXCEEDS';
    statusLabel = 'غير متوافق — يتجاوز RAM الجهاز';
    reason = `يتطلب ${model.minRamGb} GB كحد أدنى (المتاح ${effectiveRamGb} GB)`;
  } else if (!osFits) {
    status = 'BLOCKED_EXCEEDS';
    statusLabel = 'غير متوافق — قيود Android';
    reason = 'النموذج لا يدعم محرك Android-NNAPI';
  } else if (vramAndRamDeficit) {
    status = 'BLOCKED_EXCEEDS';
    statusLabel = 'غير متوافق — عجز GPU و RAM';
    reason = `يتطلب ${gpuReqGb} GB VRAM أو ${model.ramRequiredGb} GB RAM للتشغيل البديل (المتاح ${effectiveRamGb} GB RAM · ${effectiveGpuVramGb} GB VRAM)`;
  } else if (!model.commercialRedistribution) {
    status = 'BLOCKED_EXCEEDS';
    statusLabel = 'محجوب — قيد الترخيص';
    reason = `الترخيص (${model.license}) لا يسمح بإعادة التوزيع التجاري`;
  } else if (!recRamFits) {
    status = 'COMPATIBLE_TIGHT';
    statusLabel = 'تحذير — توافق بالحد الأدنى';
    reason = `المتاح ${effectiveRamGb} GB أقل من الموصى (${model.ramRequiredGb} GB)`;
  } else if (!gpuFits) {
    status = 'COMPATIBLE_CPU_ONLY';
    statusLabel = 'تحذير — وضع CPU فقط';
    reason = `لا يتوفر ${gpuReqGb} GB VRAM؛ سيعمل على المعالج بسرعة أقل`;
  }

  const ramLoadPct = Math.min(
    140,
    Math.round((model.ramRequiredGb / Math.max(effectiveRamGb, 1)) * 100)
  );
  const vramLoadPct =
    gpuReqGb > 0
      ? Math.min(140, Math.round((gpuReqGb / Math.max(effectiveGpuVramGb || 0.1, 0.1)) * 100))
      : 0;

  return {
    gpuReqGb,
    ramDeltaGb,
    gpuFits,
    ramLoadPct,
    vramLoadPct,
    status,
    statusLabel,
    reason,
  };
}

export function ModelHardwareMatrix({
  projects,
  models,
  onProjectUpdated,
  onValidationAlert,
}: Props) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || '');
  const selectedProject = projects.find((p) => p.id === selectedProjectId) || projects[0];

  const [useCustomProfile, setUseCustomProfile] = useState(false);
  const [customRamGb, setCustomRamGb] = useState<number>(selectedProject?.targetRamGb || 8);
  const [customGpuVramGb, setCustomGpuVramGb] = useState<number>(
    selectedProject?.targetGpuVramGb || 0
  );
  const [customOs, setCustomOs] = useState<'Linux' | 'Windows' | 'macOS' | 'Android'>(
    selectedProject?.targetOs || 'Linux'
  );

  const [filterMode, setFilterMode] = useState<'all' | 'compatible' | 'blocked'>('all');
  const [viewMode, setViewMode] = useState<'single' | 'all-projects'>('single');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'ram' | 'params' | 'speed'>('ram');
  const [sortAsc, setSortAsc] = useState(true);
  const [assigningModelId, setAssigningModelId] = useState<string | null>(null);
  const [savingDeviceSpecs, setSavingDeviceSpecs] = useState(false);
  const [allocationAlert, setAllocationAlert] = useState<HardwareValidationAlert | null>(null);
  const [reportModalModelId, setReportModalModelId] = useState<string | null>(null);

  const effectiveRamGb = useCustomProfile ? customRamGb : selectedProject?.targetRamGb || 8;
  const effectiveGpuVramGb = useCustomProfile
    ? customGpuVramGb
    : selectedProject?.targetGpuVramGb || 0;
  const effectiveOs = useCustomProfile ? customOs : selectedProject?.targetOs || 'Linux';

  const allEvaluations = useMemo(() => {
    return models.map((model) => ({
      model,
      ...evaluateModelAgainstDevice(model, effectiveRamGb, effectiveGpuVramGb, effectiveOs),
    }));
  }, [models, effectiveRamGb, effectiveGpuVramGb, effectiveOs]);

  const evaluatedRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const rows = allEvaluations
      .filter(({ model }) =>
        q
          ? model.name.toLowerCase().includes(q) ||
            model.family.toLowerCase().includes(q) ||
            model.license.toLowerCase().includes(q)
          : true
      )
      .filter((r) => {
        if (filterMode === 'compatible') return r.status !== 'BLOCKED_EXCEEDS';
        if (filterMode === 'blocked') return r.status === 'BLOCKED_EXCEEDS';
        return true;
      });

    rows.sort((a, b) => {
      let diff = 0;
      if (sortBy === 'ram') diff = a.model.ramRequiredGb - b.model.ramRequiredGb;
      else if (sortBy === 'params')
        diff = a.model.parametersBillions - b.model.parametersBillions;
      else diff = a.model.measuredTokensPerSec - b.model.measuredTokensPerSec;
      return sortAsc ? diff : -diff;
    });

    return rows;
  }, [allEvaluations, searchQuery, filterMode, sortBy, sortAsc]);

  const compatibleCount = allEvaluations.filter((r) => r.status !== 'BLOCKED_EXCEEDS').length;
  const blockedCount = allEvaluations.filter((r) => r.status === 'BLOCKED_EXCEEDS').length;

  function toggleSort(column: 'ram' | 'params' | 'speed') {
    if (sortBy === column) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(column);
      setSortAsc(column !== 'speed');
    }
  }

  // Automatically trigger visual alert when effective device specs fall below current project's model
  useEffect(() => {
    if (!selectedProject) return;
    const activeEval = allEvaluations.find((r) => r.model.id === selectedProject.selectedModelId);
    if (!activeEval) return;

    if (activeEval.status === 'BLOCKED_EXCEEDS') {
      const alertObj: HardwareValidationAlert = {
        severity: 'error',
        title: `تنبيه حرج: النموذج المخصص حالياً (${activeEval.model.name}) غير متوافق مع مواصفات الجهاز`,
        details: `${activeEval.reason} — يمنع تخصيص أو تصدير هذا النموذج قبل اختيار وزن متوافق أو ترقية الجهاز.`,
        projectId: selectedProject.id,
      };
      setAllocationAlert(alertObj);
      onValidationAlert?.(alertObj);
    } else if (activeEval.status === 'COMPATIBLE_TIGHT' || activeEval.status === 'COMPATIBLE_CPU_ONLY') {
      const alertObj: HardwareValidationAlert = {
        severity: 'warning',
        title: `ملاحظة تشغيل للنموذج (${activeEval.model.name})`,
        details: activeEval.reason,
        projectId: selectedProject.id,
      };
      setAllocationAlert(alertObj);
      onValidationAlert?.(alertObj);
    } else {
      setAllocationAlert(null);
      onValidationAlert?.(null);
    }
  }, [allEvaluations, selectedProject, onValidationAlert]);

  async function handleSaveDeviceSpecs() {
    if (!selectedProject) return;
    setSavingDeviceSpecs(true);
    try {
      const updatedFiles = {
        ...selectedProject.files,
        'ai/hardware.profile.json': JSON.stringify(
          {
            targetOs: effectiveOs,
            targetRamGb: effectiveRamGb,
            targetGpuVramGb: effectiveGpuVramGb,
            updatedAt: new Date().toISOString(),
          },
          null,
          2
        ),
      };
      const res = await fetch(`/api/projects/${selectedProject.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetRamGb: effectiveRamGb,
          targetGpuVramGb: effectiveGpuVramGb,
          targetOs: effectiveOs,
          files: updatedFiles,
        }),
      });
      if (res.ok) {
        onProjectUpdated((await res.json()) as Project);
        setUseCustomProfile(false);
      }
    } finally {
      setSavingDeviceSpecs(false);
    }
  }

  async function handleAssignModelToProject(
    model: ModelWeightEntry,
    targetProjectOverride?: Project
  ) {
    const targetProject = targetProjectOverride || selectedProject;
    if (!targetProject) return;

    const targetRam = targetProjectOverride ? targetProjectOverride.targetRamGb : effectiveRamGb;
    const targetVram = targetProjectOverride
      ? targetProjectOverride.targetGpuVramGb
      : effectiveGpuVramGb;
    const targetOs = targetProjectOverride ? targetProjectOverride.targetOs : effectiveOs;

    const evalResult = evaluateModelAgainstDevice(model, targetRam, targetVram, targetOs);

    if (evalResult.status === 'BLOCKED_EXCEEDS') {
      const bestCompatible = models
        .filter(
          (m) =>
            evaluateModelAgainstDevice(m, targetRam, targetVram, targetOs).status !==
            'BLOCKED_EXCEEDS'
        )
        .sort((a, b) => b.parametersBillions - a.parametersBillions)[0];

      const alertObj: HardwareValidationAlert = {
        severity: 'error',
        title: `تحذير: تم منع تخصيص النموذج ${model.name} لمشروع "${targetProject.name}"`,
        details: evalResult.reason,
        projectId: targetProject.id,
        recommendedModelId: bestCompatible?.id,
        recommendedModelName: bestCompatible?.name,
      };
      setAllocationAlert(alertObj);
      onValidationAlert?.(alertObj);
      return;
    }

    setAssigningModelId(model.id);
    try {
      const updatedFiles = {
        ...targetProject.files,
        'ai/model.config.json': JSON.stringify(
          {
            modelId: model.id,
            modelName: model.name,
            runtimeEngine: model.runtimeEngines[0] || targetProject.runtimeEngine,
            quantization: model.quantization,
            offlineDefault: true,
          },
          null,
          2
        ),
        'ai/hardware.profile.json': JSON.stringify(
          {
            targetOs,
            targetRamGb: targetRam,
            targetGpuVramGb: targetVram,
            verifiedModelId: model.id,
            verifiedAt: new Date().toISOString(),
          },
          null,
          2
        ),
      };

      const res = await fetch(`/api/projects/${targetProject.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedModelId: model.id,
          runtimeEngine: model.runtimeEngines[0] || targetProject.runtimeEngine,
          targetRamGb: targetRam,
          targetGpuVramGb: targetVram,
          targetOs,
          files: updatedFiles,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        const alertObj: HardwareValidationAlert = {
          severity: 'error',
          title: `تم رفض تخصيص النموذج ${model.name} من الخادم`,
          details: payload.error || 'تتجاوز متطلبات النموذج قدرة الجهاز المستهدف.',
          projectId: targetProject.id,
        };
        setAllocationAlert(alertObj);
        onValidationAlert?.(alertObj);
        return;
      }

      setUseCustomProfile(false);

      if (evalResult.gpuReqGb > 0 && targetVram < evalResult.gpuReqGb) {
        const warnObj: HardwareValidationAlert = {
          severity: 'warning',
          title: `تم تخصيص ${model.name} مع تشغيل بديل على المعالج (CPU Fallback)`,
          details: `الجهاز لا يملك ${evalResult.gpuReqGb} GB VRAM المطلوبة لتسريع GPU؛ سيعمل النموذج عبر CPU باستخدام ذاكرة النظام (${targetRam} GB RAM).`,
          projectId: targetProject.id,
        };
        setAllocationAlert(warnObj);
        onValidationAlert?.(warnObj);
      } else {
        setAllocationAlert(null);
        onValidationAlert?.(null);
      }

      onProjectUpdated(payload as Project);
    } finally {
      setAssigningModelId(null);
    }
  }

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-start gap-2.5">
          <Scale className="w-5 h-5 text-slate-700 dark:text-slate-300 mt-0.5 shrink-0" />
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              جدول مطابقة مواصفات الأجهزة المستهدفة مع متطلبات النماذج (RAM / GPU)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              يميز الأوزان غير المتوافقة باللون التحذيري ويمنع تخصيص أي نموذج يتجاوز RAM أو VRAM أو نظام تشغيل جهاز المشروع.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
          <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
            {compatibleCount} متوافق
          </span>
          <span aria-hidden="true">·</span>
          <span className="text-rose-700 dark:text-rose-400 font-semibold">
            {blockedCount} غير متوافق (محجوب)
          </span>
        </div>
      </div>

      {/* Inline Visual Guardrail Alert Banner */}
      {allocationAlert && (
        <div
          role="alert"
          className={`p-4 rounded-lg border flex items-start justify-between gap-4 ${
            allocationAlert.severity === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-100'
              : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-100'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {allocationAlert.severity === 'error' ? (
              <ShieldBan className="w-4 h-4 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            )}
            <div className="space-y-1 text-xs">
              <div className="font-bold">{allocationAlert.title}</div>
              <div className="opacity-90">{allocationAlert.details}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setAllocationAlert(null);
              onValidationAlert?.(null);
            }}
            aria-label="إغلاق التنبيه"
            className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Interactive Device Profile & Filters Toolbar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
        <div className="lg:col-span-4">
          <label className="block text-[11px] font-medium text-slate-500 mb-1">
            المشروع المستهدف للمطابقة والتخصيص
          </label>
          <select
            value={selectedProject?.id || ''}
            onChange={(e) => {
              const p = projects.find((item) => item.id === e.target.value);
              setSelectedProjectId(e.target.value);
              setUseCustomProfile(false);
              if (p) {
                setCustomRamGb(p.targetRamGb);
                setCustomGpuVramGb(p.targetGpuVramGb);
                setCustomOs(p.targetOs);
              }
            }}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.targetOs} · {p.targetRamGb} GB RAM · {p.targetGpuVramGb} GB VRAM)
              </option>
            ))}
          </select>
        </div>

        <div className="lg:col-span-5 grid grid-cols-3 gap-2">
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              RAM الجهاز (GB)
            </label>
            <select
              value={effectiveRamGb}
              onChange={(e) => {
                setUseCustomProfile(true);
                setCustomRamGb(Number(e.target.value));
              }}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-xs font-mono tabular-nums"
            >
              <option value={2}>2 GB RAM</option>
              <option value={4}>4 GB RAM</option>
              <option value={6}>6 GB RAM</option>
              <option value={8}>8 GB RAM</option>
              <option value={12}>12 GB RAM</option>
              <option value={16}>16 GB RAM</option>
              <option value={32}>32 GB RAM</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              GPU VRAM (GB)
            </label>
            <select
              value={effectiveGpuVramGb}
              onChange={(e) => {
                setUseCustomProfile(true);
                setCustomGpuVramGb(Number(e.target.value));
              }}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-xs font-mono tabular-nums"
            >
              <option value={0}>0 GB (CPU فقط)</option>
              <option value={2}>2 GB VRAM</option>
              <option value={4}>4 GB VRAM</option>
              <option value={8}>8 GB VRAM</option>
              <option value={16}>16 GB VRAM</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              النظام المستهدف
            </label>
            <select
              value={effectiveOs}
              onChange={(e) => {
                setUseCustomProfile(true);
                setCustomOs(e.target.value as typeof customOs);
              }}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-xs font-mono"
            >
              <option value="Linux">Linux</option>
              <option value="Windows">Windows</option>
              <option value="macOS">macOS</option>
              <option value="Android">Android</option>
            </select>
          </div>
        </div>

        <div className="lg:col-span-3 flex flex-col justify-end gap-1">
          <div className="flex items-center gap-1.5 relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="تصفية باسم النموذج أو الترخيص..."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pr-8 pl-3 py-2 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Filter Tabs + View Switcher + Save/Reset Profile */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {(
              [
                { id: 'all', label: `كل النماذج (${allEvaluations.length})` },
                { id: 'compatible', label: `المتوافقة (${compatibleCount})` },
                { id: 'blocked', label: `غير المتوافقة (${blockedCount})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterMode(tab.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer ${
                  filterMode === tab.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode('single')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer ${
                viewMode === 'single'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              مقارنة المشروع المحدد
            </button>
            <button
              type="button"
              onClick={() => setViewMode('all-projects')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer ${
                viewMode === 'all-projects'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              مقارنة كل المشاريع ({projects.length})
            </button>
          </div>
        </div>

        {useCustomProfile && selectedProject && viewMode === 'single' && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={savingDeviceSpecs}
              onClick={handleSaveDeviceSpecs}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingDeviceSpecs ? 'جاري الحفظ...' : 'اعتماد مواصفات الجهاز للمشروع'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setUseCustomProfile(false);
                setCustomRamGb(selectedProject.targetRamGb);
                setCustomGpuVramGb(selectedProject.targetGpuVramGb);
                setCustomOs(selectedProject.targetOs);
              }}
              className="text-xs font-medium text-slate-600 dark:text-slate-400 hover:underline cursor-pointer"
            >
              إرجاع للمواصفات المحفوظة ({selectedProject.targetRamGb} GB RAM)
            </button>
          </div>
        )}
      </div>

      {/* Cross-Project Interactive Matrix (All Projects x All Models) */}
      {viewMode === 'all-projects' ? (
        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
          <table className="w-full text-xs text-right">
            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-3 py-2.5 font-medium min-w-[210px]">النموذج ومتطلباته</th>
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">RAM / VRAM المطلوبة</th>
                {projects.map((proj) => (
                  <th key={proj.id} className="px-3 py-2.5 font-medium min-w-[185px]">
                    <div className="font-bold text-slate-900 dark:text-slate-100 truncate max-w-[190px]">
                      {proj.name}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                      الجهاز: {proj.targetRamGb}G RAM · {proj.targetGpuVramGb}G VRAM · {proj.targetOs}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {models.map((model) => {
                const gpuReqGb = parseGpuVramRequiredGb(model.gpuRequirements);
                return (
                  <tr key={model.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-950/40">
                    <td className="px-3 py-3">
                      <div className="font-mono font-bold text-slate-900 dark:text-slate-100">
                        {model.name}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {model.parameters} · {model.sizeGb} GB · {model.license}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono tabular-nums whitespace-nowrap">
                      <div className="text-slate-900 dark:text-slate-100">
                        {model.minRamGb}–{model.ramRequiredGb} GB RAM
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {gpuReqGb > 0 ? `${gpuReqGb} GB VRAM (اختياري/مسرع)` : '0 GB VRAM (CPU)'}
                      </div>
                    </td>
                    {projects.map((proj) => {
                      const ev = evaluateModelAgainstDevice(
                        model,
                        proj.targetRamGb,
                        proj.targetGpuVramGb,
                        proj.targetOs
                      );
                      const isAssigned = proj.selectedModelId === model.id;
                      const isBlocked = ev.status === 'BLOCKED_EXCEEDS';
                      const isWarn =
                        ev.status === 'COMPATIBLE_TIGHT' || ev.status === 'COMPATIBLE_CPU_ONLY';

                      return (
                        <td
                          key={proj.id}
                          className={`px-3 py-2.5 align-top border-r border-slate-100 dark:border-slate-800/80 ${
                            isBlocked
                              ? 'bg-rose-50/80 dark:bg-rose-950/30'
                              : isWarn
                                ? 'bg-amber-50/60 dark:bg-amber-950/20'
                                : isAssigned
                                  ? 'bg-emerald-50/60 dark:bg-emerald-950/25'
                                  : ''
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProjectId(proj.id);
                              setUseCustomProfile(false);
                              void handleAssignModelToProject(model, proj);
                            }}
                            className="w-full text-right space-y-1 cursor-pointer group"
                          >
                            <div
                              className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                                isBlocked
                                  ? 'text-rose-700 dark:text-rose-400'
                                  : isWarn
                                    ? 'text-amber-700 dark:text-amber-400'
                                    : 'text-emerald-700 dark:text-emerald-400'
                              }`}
                            >
                              {isBlocked ? (
                                <ShieldBan className="w-3.5 h-3.5 shrink-0" />
                              ) : isWarn ? (
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              )}
                              <span>
                                {isBlocked
                                  ? 'غير متوافق'
                                  : isWarn
                                    ? 'تحذير توافق'
                                    : isAssigned
                                      ? 'معتمد ومثالي'
                                      : 'متوافق'}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                              {ev.reason}
                            </div>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
      /* Interactive Comparison Table */
      <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
        <table className="w-full text-xs text-right">
          <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="px-3 py-2.5 font-medium">النموذج والصيغة</th>
              <th className="px-3 py-2.5 font-medium">
                <button
                  type="button"
                  onClick={() => toggleSort('params')}
                  className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer"
                >
                  <span>المعاملات / الحجم</span>
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="px-3 py-2.5 font-medium">
                <button
                  type="button"
                  onClick={() => toggleSort('ram')}
                  className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer"
                >
                  <span>متطلب RAM مقابل الجهاز</span>
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="px-3 py-2.5 font-medium">متطلب GPU VRAM مقابل الجهاز</th>
              <th className="px-3 py-2.5 font-medium">
                <button
                  type="button"
                  onClick={() => toggleSort('speed')}
                  className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer"
                >
                  <span>السرعة</span>
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="px-3 py-2.5 font-medium">نتيجة المطابقة</th>
              <th className="px-3 py-2.5 text-left font-medium">التخصيص</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {evaluatedRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                  لا توجد نماذج مطابقة لخيارات التصفية الحالية.
                </td>
              </tr>
            ) : (
              evaluatedRows.map(
                ({
                  model,
                  gpuReqGb,
                  ramDeltaGb,
                  gpuFits,
                  ramLoadPct,
                  vramLoadPct,
                  status,
                  statusLabel,
                  reason,
                }) => {
                  const isCurrentModel = selectedProject?.selectedModelId === model.id;
                  const isBlocked = status === 'BLOCKED_EXCEEDS';
                  const isWarning =
                    status === 'COMPATIBLE_TIGHT' || status === 'COMPATIBLE_CPU_ONLY';

                  return (
                    <tr
                      key={model.id}
                      className={`transition-colors ${
                        isBlocked
                          ? 'bg-rose-50/75 dark:bg-rose-950/25 hover:bg-rose-100/70 dark:hover:bg-rose-950/40'
                          : isWarning
                            ? 'bg-amber-50/45 dark:bg-amber-950/15 hover:bg-amber-50/80 dark:hover:bg-amber-950/25'
                            : isCurrentModel
                              ? 'bg-emerald-50/35 dark:bg-emerald-950/15'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-950/50'
                      }`}
                    >
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`font-mono font-bold ${
                              isBlocked
                                ? 'text-rose-900 dark:text-rose-200'
                                : 'text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {model.name}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {model.format} · {model.quantization} · {model.license}
                        </div>
                      </td>

                      <td className="px-3 py-3 font-mono tabular-nums whitespace-nowrap">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {model.parameters}
                        </div>
                        <div className="text-[11px] text-slate-500">{model.sizeGb} GB</div>
                      </td>

                      <td className="px-3 py-3 font-mono tabular-nums whitespace-nowrap min-w-[165px]">
                        <div className="text-slate-900 dark:text-slate-100">
                          {model.minRamGb}–{model.ramRequiredGb} GB /{' '}
                          <span className="font-semibold">{effectiveRamGb} GB</span>
                        </div>
                        <div className="mt-1 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              isBlocked
                                ? 'bg-rose-600 dark:bg-rose-500'
                                : ramDeltaGb < 0
                                  ? 'bg-amber-500 dark:bg-amber-400'
                                  : 'bg-emerald-600 dark:bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(100, ramLoadPct)}%` }}
                          />
                        </div>
                        <div
                          className={`text-[11px] mt-0.5 ${
                            ramDeltaGb >= 0
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-rose-700 dark:text-rose-400 font-semibold'
                          }`}
                        >
                          {ramDeltaGb >= 0 ? `+${ramDeltaGb} GB فائض` : `${ramDeltaGb} GB عجز`}
                        </div>
                      </td>

                      <td className="px-3 py-3 font-mono tabular-nums whitespace-nowrap min-w-[165px]">
                        <div className="text-slate-900 dark:text-slate-100">
                          {gpuReqGb > 0 ? `${gpuReqGb} GB مطلوب` : '0 GB (CPU)'} /{' '}
                          <span className="font-semibold">{effectiveGpuVramGb} GB</span>
                        </div>
                        {gpuReqGb > 0 && (
                          <div className="mt-1 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                gpuFits
                                  ? 'bg-emerald-600 dark:bg-emerald-500'
                                  : isBlocked
                                    ? 'bg-rose-600 dark:bg-rose-500'
                                    : 'bg-amber-500 dark:bg-amber-400'
                              }`}
                              style={{ width: `${Math.min(100, vramLoadPct)}%` }}
                            />
                          </div>
                        )}
                        <div
                          className={`text-[11px] mt-0.5 ${
                            gpuFits
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : isBlocked
                                ? 'text-rose-700 dark:text-rose-400 font-semibold'
                                : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {gpuReqGb === 0
                            ? 'لا يتطلب GPU'
                            : gpuFits
                              ? 'تسريع GPU متاح'
                              : isBlocked
                                ? 'VRAM غير كافية والذاكرة عاجزة'
                                : 'تسريع GPU غير متاح (CPU بديل)'}
                        </div>
                      </td>

                      <td className="px-3 py-3 font-mono tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-300">
                        {model.measuredTokensPerSec} tok/s
                      </td>

                      <td className="px-3 py-3">
                        <div
                          className={`inline-flex items-center gap-1.5 font-semibold whitespace-nowrap ${
                            isBlocked
                              ? 'text-rose-700 dark:text-rose-400'
                              : isWarning
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {isBlocked ? (
                            <ShieldBan className="w-3.5 h-3.5 shrink-0" />
                          ) : isWarning ? (
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span>{statusLabel}</span>
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                          {reason}
                        </div>
                      </td>

                      <td className="px-3 py-3 text-left whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setReportModalModelId(model.id)}
                            title="عرض وتحميل التقرير الفني PDF (SHA-256 والرخصة والمحرك)"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-mono cursor-pointer transition-colors"
                          >
                            <FileText className="w-3 h-3 shrink-0" />
                            <span>PDF</span>
                          </button>

                          {isCurrentModel && !useCustomProfile ? (
                            <span
                              className={`text-xs font-semibold ${
                                isBlocked
                                  ? 'text-rose-700 dark:text-rose-400'
                                  : 'text-emerald-700 dark:text-emerald-400'
                              }`}
                            >
                              {isBlocked ? 'مخصص حالياً (غير متوافق!)' : 'مخصص حالياً'}
                            </span>
                          ) : isBlocked ? (
                            <button
                              type="button"
                              onClick={() => handleAssignModelToProject(model)}
                              title={reason}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 bg-rose-100/80 dark:bg-rose-950/50 hover:bg-rose-200/70 dark:hover:bg-rose-950/80 text-[11px] font-semibold whitespace-nowrap cursor-pointer transition-colors"
                            >
                              <Lock className="w-3 h-3 shrink-0" />
                              <span>تخصيص محجوب</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={assigningModelId === model.id}
                              onClick={() => handleAssignModelToProject(model)}
                              className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 text-[11px] font-medium whitespace-nowrap cursor-pointer transition-colors disabled:opacity-50"
                            >
                              {assigningModelId === model.id ? 'جاري الحفظ...' : 'تخصيص للجهاز'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                }
              )
            )}
          </tbody>
        </table>
      </div>
      )}

      {reportModalModelId && (
        <ModelTechnicalReportModal
          modelId={reportModalModelId}
          projectId={selectedProject?.id}
          onClose={() => setReportModalModelId(null)}
        />
      )}
    </section>
  );
}
