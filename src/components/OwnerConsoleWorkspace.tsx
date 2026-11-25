import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Cpu,
  FileSearch,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Scale,
  ShieldAlert,
  ShieldBan,
  ShieldCheck,
  X,
} from 'lucide-react';
import type {
  AcceptanceTestItem,
  AuditLogEntry,
  ContractPhase,
  ModelWeightEntry,
  Project,
  SubscriptionPlan,
} from '../types/helbawey';
import { EngineeringAuditReportPanel } from './EngineeringAuditReportPanel';
import { type HardwareValidationAlert, ModelHardwareMatrix } from './ModelHardwareMatrix';
import { ProjectComputeMonitor } from './ProjectComputeMonitor';
import { ResourceMonitorSidebar } from './ResourceMonitorSidebar';
import { StatusText } from './StatusText';

interface DeviceHardwareSpec {
  ramGb: number;
  gpuVramGb: number;
  os: Project['targetOs'];
  sourceLabel: string;
}

function parseGpuVramRequiredGb(gpuRequirements: string): number {
  const match = gpuRequirements.match(/(\d+(?:\.\d+)?)\s*GB/i);
  return match ? Number(match[1]) : 0;
}

function readProjectHardwareSpec(project: Project): DeviceHardwareSpec {
  const profileRaw = project.files?.['ai/hardware.profile.json'];
  if (typeof profileRaw === 'string' && profileRaw.trim()) {
    try {
      const parsed = JSON.parse(profileRaw) as Partial<{
        targetRamGb: number;
        targetGpuVramGb: number;
        targetOs: Project['targetOs'];
      }>;
      if (typeof parsed.targetRamGb === 'number' && parsed.targetRamGb > 0) {
        return {
          ramGb: parsed.targetRamGb,
          gpuVramGb:
            typeof parsed.targetGpuVramGb === 'number'
              ? parsed.targetGpuVramGb
              : project.targetGpuVramGb,
          os: parsed.targetOs || project.targetOs,
          sourceLabel: 'ai/hardware.profile.json',
        };
      }
    } catch {
      // Fall back to project target specs if JSON is malformed
    }
  }
  return {
    ramGb: project.targetRamGb,
    gpuVramGb: project.targetGpuVramGb,
    os: project.targetOs,
    sourceLabel: 'ملف مواصفات المشروع',
  };
}

interface Props {
  projects: Project[];
  models: ModelWeightEntry[];
  auditLogs: AuditLogEntry[];
  phases: ContractPhase[];
  acceptanceTests: AcceptanceTestItem[];
  plans: SubscriptionPlan[];
  onAcceptanceUpdated: (updated: AcceptanceTestItem) => void;
  onProjectUpdated: (updated: Project) => void;
}

export function OwnerConsoleWorkspace({
  projects,
  models,
  auditLogs,
  phases,
  acceptanceTests,
  plans,
  onAcceptanceUpdated,
  onProjectUpdated,
}: Props) {
  const [activeTab, setActiveTab] = useState<
    'hardware' | 'resources' | 'acceptance' | 'audit-report' | 'governance'
  >('hardware');
  const [showSidebar, setShowSidebar] = useState(true);
  const [runningTestId, setRunningTestId] = useState<number | null>(null);
  const [validationAlert, setValidationAlert] = useState<HardwareValidationAlert | null>(null);

  const [guardProjectId, setGuardProjectId] = useState<string>(projects[0]?.id || '');
  const [guardModelId, setGuardModelId] = useState<string>(
    projects[0]?.selectedModelId || models[0]?.id || ''
  );
  const [allocatingGuard, setAllocatingGuard] = useState(false);

  const guardProject = projects.find((p) => p.id === guardProjectId) || projects[0];
  const guardSpec = guardProject ? readProjectHardwareSpec(guardProject) : null;

  const testedCount = acceptanceTests.filter((t) => t.status === 'TESTED').length;
  const totalContractValue = phases.reduce((acc, p) => acc + p.costUsd, 0);
  const totalWeeks = phases.reduce((acc, p) => acc + p.durationWeeks, 0);

  // Automatic verification scanning all active projects against their target device spec profile (RAM/VRAM)
  const hardwareMismatches = useMemo(() => {
    return projects
      .map((proj) => {
        const model = models.find((m) => m.id === proj.selectedModelId);
        if (!model) return null;
        const spec = readProjectHardwareSpec(proj);
        const gpuReqGb = parseGpuVramRequiredGb(model.gpuRequirements);
        const ramDeficit = spec.ramGb < model.minRamGb;
        const vramDeficit =
          gpuReqGb > 0 && spec.gpuVramGb < gpuReqGb && spec.ramGb < model.ramRequiredGb;

        if (!ramDeficit && !vramDeficit) return null;
        return {
          projectId: proj.id,
          projectName: proj.name,
          modelName: model.name,
          requiredRam: `${model.minRamGb}–${model.ramRequiredGb} GB RAM`,
          requiredVram: gpuReqGb > 0 ? `${gpuReqGb} GB VRAM` : '0 GB VRAM',
          deviceSpecs: `${spec.ramGb} GB RAM · ${spec.gpuVramGb} GB VRAM`,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [projects, models]);

  function findBestCompatibleModel(spec: DeviceHardwareSpec): ModelWeightEntry | undefined {
    return [...models]
      .filter(
        (m) =>
          m.commercialRedistribution &&
          m.parametersBillions >= 0.4 &&
          m.minRamGb <= spec.ramGb &&
          (parseGpuVramRequiredGb(m.gpuRequirements) === 0 ||
            spec.gpuVramGb >= parseGpuVramRequiredGb(m.gpuRequirements) ||
            spec.ramGb >= m.ramRequiredGb) &&
          (spec.os !== 'Android' || m.runtimeEngines.includes('Android-NNAPI'))
      )
      .sort((a, b) => b.parametersBillions - a.parametersBillions)[0];
  }

  async function attemptModelAllocation(
    project: Project,
    model: ModelWeightEntry
  ): Promise<boolean> {
    const spec = readProjectHardwareSpec(project);
    const gpuReqGb = parseGpuVramRequiredGb(model.gpuRequirements);
    const ramDeficit = spec.ramGb < model.minRamGb;
    const vramAndRamDeficit =
      gpuReqGb > 0 && spec.gpuVramGb < gpuReqGb && spec.ramGb < model.ramRequiredGb;
    const osIncompatible =
      spec.os === 'Android' && !model.runtimeEngines.includes('Android-NNAPI');

    if (ramDeficit || vramAndRamDeficit || osIncompatible || !model.commercialRedistribution) {
      const reasons: string[] = [];
      if (ramDeficit) {
        const deficitGb = Number((model.minRamGb - spec.ramGb).toFixed(1));
        reasons.push(
          `يتطلب النموذج ${model.minRamGb} GB RAM كحد أدنى (${model.ramRequiredGb} GB موصى) بينما المتاح في ملف مواصفات الجهاز (${spec.sourceLabel}) هو ${spec.ramGb} GB RAM فقط (عجز ${deficitGb} GB)`
        );
      }
      if (vramAndRamDeficit) {
        const vramDeficitGb = Number((gpuReqGb - spec.gpuVramGb).toFixed(1));
        reasons.push(
          `يتطلب ${gpuReqGb} GB GPU VRAM أو ${model.ramRequiredGb} GB RAM للتشغيل البديل، والمتاح فعلياً ${spec.gpuVramGb} GB VRAM و ${spec.ramGb} GB RAM (عجز ${vramDeficitGb} GB VRAM)`
        );
      }
      if (osIncompatible) {
        reasons.push(`النموذج لا يدعم التشغيل على نظام ${spec.os} عبر محرك Android-NNAPI`);
      }
      if (!model.commercialRedistribution) {
        reasons.push(`الترخيص (${model.license}) لا يسمح بإعادة التوزيع التجاري`);
      }

      const bestAlt = findBestCompatibleModel(spec);
      setValidationAlert({
        severity: 'error',
        title: `تحذير حرج: تم منع تخصيص ${model.name} لمشروع "${project.name}" لتجاوز الذاكرة المتاحة`,
        details: reasons.join(' · '),
        projectId: project.id,
        recommendedModelId: bestAlt?.id,
        recommendedModelName: bestAlt?.name,
      });
      return false;
    }

    setAllocatingGuard(true);
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
        'ai/hardware.profile.json': JSON.stringify(
          {
            targetOs: spec.os,
            targetRamGb: spec.ramGb,
            targetGpuVramGb: spec.gpuVramGb,
            verifiedModelId: model.id,
            verifiedAt: new Date().toISOString(),
          },
          null,
          2
        ),
      };

      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedModelId: model.id,
          runtimeEngine: model.runtimeEngines[0] || project.runtimeEngine,
          targetRamGb: spec.ramGb,
          targetGpuVramGb: spec.gpuVramGb,
          targetOs: spec.os,
          files: updatedFiles,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        const bestAlt = findBestCompatibleModel(spec);
        setValidationAlert({
          severity: 'error',
          title: `تم رفض تخصيص النموذج ${model.name} لمشروع "${project.name}"`,
          details: payload.error || 'متطلبات الذاكرة تتجاوز قدرة الجهاز المستهدف.',
          projectId: project.id,
          recommendedModelId: bestAlt?.id,
          recommendedModelName: bestAlt?.name,
        });
        return false;
      }

      onProjectUpdated(payload as Project);

      if (gpuReqGb > 0 && spec.gpuVramGb < gpuReqGb) {
        setValidationAlert({
          severity: 'warning',
          title: `تم تخصيص ${model.name} مع تحذير التشغيل على المعالج (CPU Fallback)`,
          details: `الجهاز لا يحتوي على ${gpuReqGb} GB VRAM المطلوبة (المتاح ${spec.gpuVramGb} GB)، لذا سيعمل النموذج عبر CPU مستهلكاً من ذاكرة النظام (${spec.ramGb} GB RAM).`,
          projectId: project.id,
        });
      } else {
        setValidationAlert(null);
      }
      return true;
    } finally {
      setAllocatingGuard(false);
    }
  }

  async function handleRunAcceptanceTest(id: number) {
    setRunningTestId(id);
    try {
      const res = await fetch(`/api/acceptance/${id}/run`, { method: 'POST' });
      if (res.ok) {
        onAcceptanceUpdated((await res.json()) as AcceptanceTestItem);
      }
    } finally {
      setRunningTestId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Executive KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">المشاريع المستقلة المبنية</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
            {projects.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">تصدير ZIP كامل + قاعدة محلية</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">النماذج المفتوحة المعتمدة</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
            {models.filter((m) => m.commercialRedistribution).length} / {models.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">تراخيص تسمح بإعادة التوزيع</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">اجتياز اختبارات القبول الإلزامية</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-1">
            {testedCount} / {acceptanceTests.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">وفق بنود المادة التاسعة عشرة</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">تقدير العرض التنفيذي والمراحل</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
            ${totalContractValue.toLocaleString('en-US')}
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-500 mt-1">
            10 مراحل · {totalWeeks} أسبوع عمل
          </div>
        </div>
      </section>

      {/* Direct Model Allocation Guardrail Strip (Automatic RAM/VRAM Spec Verification) */}
      {guardProject && guardSpec && (
        <section
          aria-label="بوابة التحقق التلقائي لتخصيص النماذج"
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap items-end gap-3 flex-1 min-w-0">
              <div className="min-w-[200px] flex-1">
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  المشروع المستهدف ({guardSpec.sourceLabel}: {guardSpec.ramGb} GB RAM ·{' '}
                  {guardSpec.gpuVramGb} GB VRAM)
                </label>
                <select
                  value={guardProject.id}
                  onChange={(e) => {
                    const nextProj = projects.find((p) => p.id === e.target.value);
                    setGuardProjectId(e.target.value);
                    if (nextProj) setGuardModelId(nextProj.selectedModelId);
                  }}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-medium"
                >
                  {projects.map((p) => {
                    const s = readProjectHardwareSpec(p);
                    return (
                      <option key={p.id} value={p.id}>
                        {p.name} — ({s.ramGb} GB RAM · {s.gpuVramGb} GB VRAM · {s.os})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="min-w-[240px] flex-1">
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  النموذج اللغوي المطلوب تخصيصه للمشروع
                </label>
                <select
                  value={guardModelId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setGuardModelId(nextId);
                    const targetModel = models.find((m) => m.id === nextId);
                    if (targetModel && guardProject) {
                      void attemptModelAllocation(guardProject, targetModel);
                    }
                  }}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} (يتطلب {m.minRamGb}–{m.ramRequiredGb} GB RAM · {m.gpuRequirements})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              disabled={allocatingGuard}
              onClick={() => {
                const targetModel = models.find((m) => m.id === guardModelId);
                if (targetModel && guardProject) {
                  void attemptModelAllocation(guardProject, targetModel);
                }
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span>{allocatingGuard ? 'جاري التحقق والتخصيص...' : 'تخصيص والتحقق من الذاكرة'}</span>
            </button>
          </div>
        </section>
      )}

      {/* Automatic Hardware Guardrail Visual Alert (RAM/VRAM) */}
      {(hardwareMismatches.length > 0 || validationAlert) && (
        <div
          role="alert"
          className={`p-4 rounded-xl border flex flex-wrap items-start justify-between gap-4 ${
            hardwareMismatches.length > 0 || validationAlert?.severity === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-100'
              : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-100'
          }`}
        >
          <div className="flex items-start gap-3">
            {hardwareMismatches.length > 0 || validationAlert?.severity === 'error' ? (
              <ShieldBan className="w-5 h-5 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            )}
            <div className="space-y-1 text-xs">
              {hardwareMismatches.length > 0 && !validationAlert ? (
                <>
                  <div className="font-bold">
                    تنبيه التحقق التلقائي: تم رصد {hardwareMismatches.length} مشروع يتجاوز فيه النموذج قدرة الجهاز (RAM/VRAM)
                  </div>
                  <div className="opacity-90">
                    {hardwareMismatches.map((m) => (
                      <div key={m.projectId} className="font-mono">
                        {m.projectName}: النموذج {m.modelName} يتطلب ({m.requiredRam}
                        {m.requiredVram !== '0 GB VRAM' ? ` / ${m.requiredVram}` : ''}) مقابل جهاز ({m.deviceSpecs})
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="font-bold">{validationAlert?.title}</div>
                  <div className="opacity-90">{validationAlert?.details}</div>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {validationAlert?.recommendedModelId && validationAlert.projectId && (
              <button
                type="button"
                onClick={() => {
                  const p = projects.find((item) => item.id === validationAlert.projectId);
                  const m = models.find((item) => item.id === validationAlert.recommendedModelId);
                  if (p && m) {
                    setGuardModelId(m.id);
                    void attemptModelAllocation(p, m);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium cursor-pointer"
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>اعتماد البديل المتوافق ({validationAlert.recommendedModelName})</span>
              </button>
            )}
            {activeTab !== 'hardware' && (
              <button
                type="button"
                onClick={() => setActiveTab('hardware')}
                className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium cursor-pointer"
              >
                مراجعة مصفوفة التوافق
              </button>
            )}
            {validationAlert && hardwareMismatches.length === 0 && (
              <button
                type="button"
                onClick={() => setValidationAlert(null)}
                aria-label="إغلاق التنبيه"
                className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Owner Console Main + Side Panel Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className={showSidebar ? 'lg:col-span-8 min-w-0 space-y-6' : 'lg:col-span-12 min-w-0 space-y-6'}>
          {/* Owner Console Segmented Tabs + Side Panel Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg w-fit">
              {(
                [
                  { id: 'hardware', label: 'مقارنة النماذج وقدرات الأجهزة', Icon: Scale },
                  { id: 'resources', label: 'تفصيل الحوسبة والعتاد (Recharts)', Icon: Activity },
                  { id: 'acceptance', label: `اختبارات القبول (${testedCount}/${acceptanceTests.length})`, Icon: ClipboardCheck },
                  { id: 'audit-report', label: 'تقرير التدقيق الهندسي', Icon: FileSearch },
                  { id: 'governance', label: 'المراحل والباقات وسجلات الأمان', Icon: Layers },
                ] as const
              ).map((tab) => {
                const Icon = tab.Icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      active
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setShowSidebar((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer shrink-0"
            >
              {showSidebar ? (
                <>
                  <PanelLeftClose className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>إخفاء اللوحة الجانبية</span>
                </>
              ) : (
                <>
                  <PanelLeftOpen className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>إظهار اللوحة الجانبية للموارد</span>
                </>
              )}
            </button>
          </div>

          {/* Tab 1: Live Compute Resource Monitor + Recharts */}
          {activeTab === 'resources' && (
            <ProjectComputeMonitor
              projects={projects}
              models={models}
              onProjectUpdated={onProjectUpdated}
            />
          )}

      {/* Tab 2: Interactive Model Requirements (RAM/GPU) vs Target Hardware Matrix */}
      {activeTab === 'hardware' && (
        <ModelHardwareMatrix
          projects={projects}
          models={models}
          onProjectUpdated={onProjectUpdated}
          onValidationAlert={setValidationAlert}
        />
      )}

      {/* Tab 3: 14 Mandatory Acceptance Tests (Article 19 & 22) */}
      {activeTab === 'acceptance' && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <ClipboardCheck className="w-5 h-5 text-slate-700 dark:text-slate-300" />
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              مصفوفة اختبارات القبول الإلزامية ومعيار النجاح النهائي (المادتان 19 و 22)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              توثيق حالة كل اختبار وفق التصنيف الصريح: PLANNED — IMPLEMENTED — TESTED — FAILED — BLOCKED.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
          <table className="w-full text-xs text-right">
            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-3 py-2.5 font-mono">#</th>
                <th className="px-3 py-2.5 font-medium">الاختبار الإلزامي</th>
                <th className="px-3 py-2.5 font-medium">الدليل والنتيجة الفعلية</th>
                <th className="px-3 py-2.5 font-medium">الحالة</th>
                <th className="px-3 py-2.5 text-left">تنفيذ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {acceptanceTests.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-950/60">
                  <td className="px-3 py-2.5 font-mono tabular-nums text-slate-500">{t.id}</td>
                  <td className="px-3 py-2.5 font-semibold text-slate-900 dark:text-slate-100">
                    {t.titleAr}
                    <div className="text-[11px] font-normal text-slate-500">{t.articleRef}</div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">{t.evidenceSummary}</td>
                  <td className="px-3 py-2.5">
                    <StatusText status={t.status} compact />
                  </td>
                  <td className="px-3 py-2.5 text-left">
                    <button
                      type="button"
                      onClick={() => handleRunAcceptanceTest(t.id)}
                      disabled={runningTestId === t.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-700 text-[11px] font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Play className="w-3 h-3" />
                      <span>{runningTestId === t.id ? 'جاري الفحص' : 'فحص'}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {/* Tab 4: Live Engineering Audit Report + PDF Export */}
      {activeTab === 'audit-report' && (
        <EngineeringAuditReportPanel projects={projects} activeProjectId={guardProject?.id} />
      )}

      {/* Tab 5: Implementation Phases (Article 18 & 20) + Subscriptions (Article 16) + Audit */}
      {activeTab === 'governance' && (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-slate-700 dark:text-slate-300" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              مراحل التنفيذ والمخرجات والتكلفة (المادتان 18 و 20)
            </h3>
          </div>
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-3 py-2 font-medium">المرحلة</th>
                  <th className="px-3 py-2 font-medium">المدة</th>
                  <th className="px-3 py-2 font-medium">التكلفة</th>
                  <th className="px-3 py-2 font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {phases.map((ph) => (
                  <tr key={ph.id}>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{ph.titleAr}</div>
                      <div className="text-[11px] text-slate-500">{ph.deliverablesAr}</div>
                    </td>
                    <td className="px-3 py-2.5 font-mono tabular-nums whitespace-nowrap">
                      {ph.durationWeeks} أسابيع
                    </td>
                    <td className="px-3 py-2.5 font-mono tabular-nums whitespace-nowrap">
                      ${ph.costUsd.toLocaleString('en-US')}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <StatusText status={ph.status} compact />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="lg:col-span-5 space-y-6">
          {/* Subscription Plans */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              باقات واشتراكات المنصة (لوحة المالك)
            </h3>
            <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
              {plans.map((pl) => (
                <div key={pl.id} className="p-3.5 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100">{pl.nameAr}</div>
                    <div className="text-[11px] text-slate-500">{pl.audienceAr}</div>
                    <div className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400 mt-1">
                      {pl.maxProjects} مشروع · {pl.maxWeightStorageGb} GB أوزان · {pl.exportFormats}
                    </div>
                  </div>
                  <div className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 whitespace-nowrap">
                    ${pl.priceMonthlyUsd}/mo
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Security Audit Trail */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-slate-700 dark:text-slate-300" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                سجلات الأمان والتدقيق (Security Audit Trail)
              </h3>
            </div>
            <div className="max-h-60 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
              {auditLogs.slice(0, 12).map((log) => (
                <div key={log.id} className="p-3 text-xs space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {log.action}
                    </span>
                    <span className="font-mono tabular-nums text-[11px] text-slate-400">
                      {new Date(log.timestamp).toLocaleTimeString('ar-EG')}
                    </span>
                  </div>
                  <div className="text-slate-600 dark:text-slate-400">{log.details}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>ملكية الكود والأوزان والمستودعات محفوظة بالكامل للجهة المالكة (المادة 17).</span>
            </div>
          </div>
        </section>
      </div>
      )}
        </div>

        {/* Persistent Side Panel: Live Compute Resource Charts (Recharts) */}
        {showSidebar && (
          <div className="lg:col-span-4 min-w-0 lg:sticky lg:top-4">
            <ResourceMonitorSidebar
              projects={projects}
              models={models}
              onProjectUpdated={onProjectUpdated}
            />
          </div>
        )}
      </div>
    </div>
  );
}
