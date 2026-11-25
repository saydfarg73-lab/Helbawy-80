import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  History,
  Lock,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Wrench,
  XCircle,
} from 'lucide-react';
import type {
  MonitoredModuleHealth,
  MonitoredModuleId,
  PreflightStatus,
  Project,
  RepairRecord,
  RootCauseDiagnosis,
  SelfHealingAcceptanceTestResult,
  SelfHealingCenterStatus,
  SelfHealingSeverity,
} from '../types/helbawey';

interface Props {
  activeProject: Project;
}

type WorkspaceTab = 'overview' | 'preflight' | 'repairs' | 'alerts' | 'acceptance';

function formatShortTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function statusToneClasses(
  status:
    | PreflightStatus
    | 'HEALTHY'
    | 'DEGRADED'
    | 'RECOVERED'
    | 'FAILED'
    | 'MANUAL APPROVAL REQUIRED'
    | 'REJECTED'
): string {
  switch (status) {
    case 'PASS':
    case 'HEALTHY':
    case 'RECOVERED':
      return 'bg-emerald-950/70 text-emerald-300 border-emerald-500/40';
    case 'WARNING':
    case 'DEGRADED':
    case 'MANUAL APPROVAL REQUIRED':
      return 'bg-amber-950/70 text-amber-300 border-amber-500/40';
    case 'FAIL':
    case 'BLOCKED':
    case 'FAILED':
      return 'bg-rose-950/70 text-rose-300 border-rose-500/40';
    default:
      return 'bg-slate-800 text-slate-300 border-slate-700';
  }
}

function severityToneClasses(severity: SelfHealingSeverity): string {
  switch (severity) {
    case 'CRITICAL':
      return 'bg-rose-950/80 text-rose-300 border-rose-500/50';
    case 'ERROR':
      return 'bg-rose-950/50 text-rose-300 border-rose-500/30';
    case 'WARNING':
      return 'bg-amber-950/60 text-amber-300 border-amber-500/40';
    default:
      return 'bg-slate-800 text-slate-300 border-slate-700';
  }
}

function tierLabelAr(tier: 1 | 2 | 3): string {
  if (tier === 1) return 'المستوى 1 — إصلاح تلقائي آمن';
  if (tier === 2) return 'المستوى 2 — يتطلب موافقة المالك';
  return 'المستوى 3 — محظور تلقائياً';
}

function categoryLabelAr(cat: string): string {
  const map: Record<string, string> = {
    software: 'خطأ برمجي (Software)',
    configuration: 'خطأ إعدادات (Configuration)',
    dependencies: 'نقص اعتماديات (Dependencies)',
    connectivity: 'انقطاع اتصال (Connectivity)',
    resources: 'استنزاف موارد / عالق (Resources)',
    permissions: 'صلاحيات وأمان (Permissions)',
    'external-service': 'توقف خدمة خارجية (External Service)',
    'corrupted-file-or-model': 'تلف ملف / نموذج (Corrupted File)',
  };
  return map[cat] || cat;
}

export function SelfHealingWorkspace({ activeProject }: Props) {
  const [statusData, setStatusData] = useState<SelfHealingCenterStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [bannerMsg, setBannerMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');

  // Root-Cause Analyzer manual test form state
  const [diagModule, setDiagModule] = useState<MonitoredModuleId>('brain-selector');
  const [diagFn, setDiagFn] = useState('compareBrainsLive');
  const [diagTarget, setDiagTarget] = useState('/api/brain/compare');
  const [diagError, setDiagError] = useState('503 UNAVAILABLE upstream rate spike');
  const [diagCode, setDiagCode] = useState<number>(503);
  const [diagResult, setDiagResult] = useState<RootCauseDiagnosis | null>(null);

  const fetchStatus = useCallback(async (quiet = false) => {
    try {
      const res = await fetch('/api/self-healing/status');
      if (!res.ok) throw new Error('تعذر جلب حالة مركز الإصلاح الذاتي.');
      const json = (await res.json()) as SelfHealingCenterStatus;
      setStatusData(json);
    } catch (err) {
      if (!quiet) {
        setBannerMsg({
          type: 'err',
          text: err instanceof Error ? err.message : 'فشل الاتصال بمركز الإصلاح الذاتي',
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus(false);
    const id = window.setInterval(() => {
      void fetchStatus(true);
    }, 15000);
    return () => window.clearInterval(id);
  }, [fetchStatus]);

  const runPostAction = async (
    key: string,
    url: string,
    body?: Record<string, unknown>,
    successMsg?: string
  ) => {
    setBusyAction(key);
    setBannerMsg(null);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || 'تعذر إتمام الإجراء.');
      }
      if (json.status) {
        setStatusData(json.status as SelfHealingCenterStatus);
      } else {
        await fetchStatus(true);
      }
      if (successMsg) {
        setBannerMsg({ type: 'ok', text: successMsg });
      }
    } catch (err) {
      setBannerMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'حدث خطأ غير متوقع.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleDiagnoseSubmit = async () => {
    setBusyAction('diagnose');
    setBannerMsg(null);
    try {
      const res = await fetch('/api/self-healing/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          failedFunction: diagFn,
          moduleId: diagModule,
          relatedFileOrApi: diagTarget,
          errorMessage: diagError,
          statusCode: Number(diagCode) || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'فشل تشغيل التشخيص.');
      setDiagResult(json.diagnosis as RootCauseDiagnosis);
    } catch (err) {
      setBannerMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'تعذر تحليل السبب الجذري.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleIsolate = (mod: MonitoredModuleHealth) => {
    if (mod.isolated) {
      void runPostAction(
        `unisolate-${mod.id}`,
        '/api/self-healing/repairs/trigger',
        {
          actionType: 'unisolate-module',
          moduleId: mod.id,
          issueTitleAr: `طلب فك العزل عن وحدة ${mod.nameAr}`,
          targetPath: mod.id,
        },
        `تم إنشاء طلب فك عزل وحدة "${mod.nameAr}" في سجل الموافقات (المستوى 2). انتقل لتبويب الإصلاح للاعتماد.`
      );
      setActiveTab('repairs');
    } else {
      void runPostAction(
        `isolate-${mod.id}`,
        '/api/self-healing/repairs/trigger',
        {
          actionType: 'isolate-module',
          moduleId: mod.id,
          issueTitleAr: `عزل وقائي للوحدة ${mod.nameAr}`,
          targetPath: mod.id,
        },
        `تم تفعيل العزل الوقائي لوحدة "${mod.nameAr}" (المستوى 1).`
      );
    }
  };

  if (loading && !statusData) {
    return (
      <div className="rounded-2xl bg-slate-950 border border-amber-500/30 p-8 text-slate-200 space-y-4">
        <div className="h-8 w-72 bg-slate-900 rounded-lg animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-slate-900 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const telemetry = statusData?.telemetry;
  const preflight = statusData?.lastPreflight;
  const summary = statusData?.summary;
  const verdict = statusData?.overallHealthVerdict || 'DEGRADED';

  const verdictLabelAr =
    verdict === 'HEALTHY'
      ? 'سليم ومتحقق بالكامل (HEALTHY)'
      : verdict === 'BLOCKED'
        ? 'متوقف على فحوصات حرجة (BLOCKED)'
        : 'يعمل مع تحذيرات أو نواقص حقيقية (DEGRADED)';

  const tabs: { id: WorkspaceTab; label: string; count?: number }[] = [
    { id: 'overview', label: 'النظرة العامة والمراقبة الحية', count: telemetry?.modules.length },
    { id: 'preflight', label: 'الفحص الشامل قبل التشغيل', count: preflight?.checks.length },
    { id: 'repairs', label: 'التشخيص والإصلاح و Rollback', count: statusData?.repairs.length },
    { id: 'alerts', label: 'التنبيهات الحية', count: summary?.openAlertsCount },
    { id: 'acceptance', label: 'اختبارات القبول الـ 12', count: statusData?.acceptanceTests.length },
  ];

  return (
    <div
      dir="rtl"
      className="rounded-2xl bg-slate-950 text-slate-100 border border-amber-500/30 shadow-2xl overflow-hidden"
    >
      {/* Command Center Top Header */}
      <div className="px-6 py-5 border-b border-amber-500/25 bg-gradient-to-l from-slate-900 via-slate-950 to-slate-900 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-400/40 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5 text-amber-400" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-extrabold text-amber-300 tracking-tight">
                مركز الإصلاح الذاتي والمراقبة المستمرة
              </h1>
              <p className="text-[11px] font-mono text-amber-500/80 uppercase tracking-wider">
                HELBAWEY SELF-HEALING &amp; AUTONOMOUS SYSTEM REPAIR CENTER · {activeProject.name}
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
            فحص ما قبل التشغيل، مراقبة حية لـ 11 وحدة مرتبطة فعلياً بمسارات الخادم، تحليل الأسباب الجذرية،
            وتدخل آمن متدرج (3 مستويات) مع بصمة SHA-256 وRollback قابل للتحقق دون تزييف للنجاح.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() =>
              void runPostAction(
                'preflight',
                '/api/self-healing/preflight',
                undefined,
                'اكتمل الفحص الشامل لما قبل التشغيل (15 فحصاً فعلياً).'
              )
            }
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <ClipboardCheck className="w-4 h-4 shrink-0" />
            <span>{busyAction === 'preflight' ? 'جارٍ الفحص...' : 'تشغيل الفحص الشامل'}</span>
          </button>

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() =>
              void runPostAction(
                'probe',
                '/api/self-healing/probe',
                undefined,
                'تم تنفيذ نبضة مراقبة حية وتحديث النسخة الموثقة للمخزن.'
              )
            }
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-amber-500/35 text-amber-300 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 shrink-0 ${busyAction === 'probe' ? 'animate-spin' : ''}`} />
            <span>نبضة مراقبة الآن</span>
          </button>

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => {
              setActiveTab('acceptance');
              void runPostAction(
                'acceptance',
                '/api/self-healing/acceptance-tests/run',
                undefined,
                'اكتمل تشغيل اختبارات القبول الـ 12 الإلزامية على المسارات والبيئة الفعلية.'
              );
            }}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-100 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors disabled:opacity-50"
          >
            <Play className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{busyAction === 'acceptance' ? 'جارٍ الاختبار...' : 'اختبارات القبول الـ 12'}</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {bannerMsg && (
        <div
          className={`px-6 py-3 border-b text-xs font-medium flex items-center justify-between gap-4 ${
            bannerMsg.type === 'ok'
              ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-200'
              : 'bg-rose-950/70 border-rose-500/40 text-rose-200'
          }`}
        >
          <span>{bannerMsg.text}</span>
          <button
            type="button"
            onClick={() => setBannerMsg(null)}
            className="text-slate-300 hover:text-white text-xs cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* Critical Launch Blocker Warning (Honest, never hidden) */}
      {preflight && preflight.blockedCriticalModules.length > 0 && (
        <div className="px-6 py-3 bg-rose-950/80 border-b border-rose-500/40 flex items-start gap-3 text-xs text-rose-200">
          <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-rose-300">حظر إطلاق حرج: </span>
            {preflight.blockedCriticalModules.join(' — ')}
          </div>
        </div>
      )}

      {/* Main KPI Grid */}
      <div className="p-6 border-b border-slate-800/80 bg-slate-950/90 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Honest Overall Health Card */}
          <div className="rounded-xl bg-slate-900/90 border border-amber-500/30 p-4 flex flex-col justify-between gap-2">
            <div className="text-[11px] font-medium text-slate-400">الحالة العامة الفعلية للمنصة</div>
            <div className="flex items-center justify-between gap-2">
              <span
                className={`px-2.5 py-1 rounded-md border text-xs font-bold font-mono ${statusToneClasses(verdict)}`}
              >
                {verdict}
              </span>
              <span className="text-[11px] text-slate-300 truncate">{verdictLabelAr}</span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono tabular-nums">
              آخر فحص: {formatShortTime(preflight?.checkedAt)}
            </div>
          </div>

          <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-4 flex flex-col justify-between gap-2">
            <div className="text-[11px] font-medium text-slate-400">نتائج الفحص الشامل (15 فحص)</div>
            <div className="flex items-baseline gap-4 tabular-nums">
              <div>
                <span className="text-2xl font-extrabold text-emerald-400">
                  {summary?.passedChecks ?? 0}
                </span>
                <span className="text-[11px] text-slate-400 mr-1">ناجح</span>
              </div>
              <div>
                <span className="text-xl font-bold text-amber-400">
                  {summary?.warningChecks ?? 0}
                </span>
                <span className="text-[11px] text-slate-400 mr-1">تحذير</span>
              </div>
              <div>
                <span className="text-xl font-bold text-rose-400">
                  {summary?.failedOrBlockedChecks ?? 0}
                </span>
                <span className="text-[11px] text-slate-400 mr-1">فشل/محجوب</span>
              </div>
            </div>
            <div className="text-[11px] text-slate-400 font-mono tabular-nums">
              المدة: {preflight?.durationMs ?? 0} ms
            </div>
          </div>

          <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-4 flex flex-col justify-between gap-2">
            <div className="text-[11px] font-medium text-slate-400">سجل الإصلاحات والتحقق</div>
            <div className="flex items-baseline gap-4 tabular-nums">
              <div>
                <span className="text-2xl font-extrabold text-emerald-400">
                  {summary?.recoveredRepairsCount ?? 0}
                </span>
                <span className="text-[11px] text-slate-400 mr-1">متعافٍ</span>
              </div>
              <div>
                <span className="text-xl font-bold text-amber-400">
                  {summary?.pendingApprovalCount ?? 0}
                </span>
                <span className="text-[11px] text-slate-400 mr-1">بانتظار موافقة</span>
              </div>
              <div>
                <span className="text-xl font-bold text-rose-400">
                  {summary?.failedRepairsCount ?? 0}
                </span>
                <span className="text-[11px] text-slate-400 mr-1">فاشل</span>
              </div>
            </div>
            <div className="text-[11px] text-slate-400 font-mono tabular-nums">
              آخر إصلاح موثق: {formatShortTime(summary?.lastVerifiedRepairAt)}
            </div>
          </div>

          <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-4 flex flex-col justify-between gap-2">
            <div className="text-[11px] font-medium text-slate-400">نبضات المراقبة والتنبيهات</div>
            <div className="flex items-baseline gap-4 tabular-nums">
              <div>
                <span className="text-2xl font-extrabold text-amber-300">
                  {telemetry?.probeCount ?? 0}
                </span>
                <span className="text-[11px] text-slate-400 mr-1">نبضة</span>
              </div>
              <div>
                <span className="text-xl font-bold text-rose-400">
                  {summary?.openAlertsCount ?? 0}
                </span>
                <span className="text-[11px] text-slate-400 mr-1">تنبيه مفتوح</span>
              </div>
            </div>
            <div className="text-[11px] text-slate-400 font-mono tabular-nums">
              {telemetry?.isRunning ? `دوري كل ${telemetry.intervalSeconds}ث` : 'متوقف'} · آخر نبضة:{' '}
              {formatShortTime(telemetry?.lastProbeAt)}
            </div>
          </div>
        </div>

        {/* Tier-1 Auto-Safe Quick Intervention Toolbar */}
        <div className="rounded-xl bg-slate-900/60 border border-amber-500/20 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-amber-300 font-semibold">
            <Wrench className="w-4 h-4 shrink-0" />
            <span>تدخلات آمنة فورية (المستوى 1 — تتحقق بعد التنفيذ ولا تمس بيانات العملاء):</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() =>
                void runPostAction(
                  'clean-tmp',
                  '/api/self-healing/repairs/trigger',
                  {
                    actionType: 'clean-orphan-temp-files',
                    moduleId: 'export-packaging',
                    issueTitleAr: 'تنظيف يدوي للملفات المؤقتة اليتيمة (.tmp)',
                  },
                  'تم تنفيذ التنظيف الآمن والتحقق من خلو مسارات التخزين من ملفات .tmp.'
                )
              }
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              تنظيف الملفات المؤقتة
            </button>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() =>
                void runPostAction(
                  'rebuild-cache',
                  '/api/self-healing/repairs/trigger',
                  {
                    actionType: 'rebuild-cache-manifest',
                    moduleId: 'data-factory',
                    issueTitleAr: 'إعادة بناء فهرس Cache التشغيلي (runtime-manifest.json)',
                  },
                  'أُعيد بناء ملف runtime-manifest.json والتحقق من بصمة SHA-256.'
                )
              }
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              إعادة بناء فهرس Cache
            </button>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() =>
                void runPostAction(
                  'unstick-jobs',
                  '/api/self-healing/repairs/trigger',
                  {
                    actionType: 'unstick-finetune-jobs',
                    moduleId: 'data-factory',
                    issueTitleAr: 'تحرير مهام التدريب الخلفية العالقة (RUNNING)',
                  },
                  'تم فحص المهام الخلفية ومعالجة أي مهمة عالقة مع حفظ نسخة تراجع.'
                )
              }
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              تحرير المهام العالقة
            </button>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() =>
                void runPostAction(
                  'reprobe-api',
                  '/api/self-healing/repairs/trigger',
                  {
                    actionType: 'reprobe-local-api',
                    moduleId: 'users-auth',
                    issueTitleAr: 'إعادة فحص استجابة الخادم الداخلي /api/bootstrap',
                  },
                  'تم التحقق الفعلي من استجابة الخادم الداخلي.'
                )
              }
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              إعادة فحص API المحلي
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
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

      {/* Tab Panels */}
      <div className="p-6">
        {/* TAB 1: Overview & Live 11-Module Monitoring */}
        {activeTab === 'overview' && telemetry && (
          <div className="space-y-6">
            {/* Live Telemetry Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <div className="rounded-xl bg-slate-900 border border-slate-800 p-3.5">
                <div className="text-[11px] text-slate-400">معالج المضيف CPU</div>
                <div className="text-lg font-bold font-mono text-amber-300 tabular-nums mt-1">
                  {telemetry.host.cpuPercent}%
                </div>
              </div>
              <div className="rounded-xl bg-slate-900 border border-slate-800 p-3.5">
                <div className="text-[11px] text-slate-400">الذاكرة المستخدمة</div>
                <div className="text-lg font-bold font-mono text-slate-100 tabular-nums mt-1">
                  {telemetry.host.ramPercent}%
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  حر {telemetry.host.freeRamGb} / {telemetry.host.totalRamGb} GB
                </div>
              </div>
              <div className="rounded-xl bg-slate-900 border border-slate-800 p-3.5">
                <div className="text-[11px] text-slate-400">ذاكرة الخادم RSS</div>
                <div className="text-lg font-bold font-mono text-slate-100 tabular-nums mt-1">
                  {telemetry.host.processRssMb} MB
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  Heap {telemetry.host.heapUsedMb} MB
                </div>
              </div>
              <div className="rounded-xl bg-slate-900 border border-slate-800 p-3.5">
                <div className="text-[11px] text-slate-400">الطلبات المراقبة</div>
                <div className="text-lg font-bold font-mono text-emerald-300 tabular-nums mt-1">
                  {telemetry.httpStats.totalRequests}
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  متوسط {telemetry.httpStats.avgLatencyMs} ms
                </div>
              </div>
              <div className="rounded-xl bg-slate-900 border border-slate-800 p-3.5">
                <div className="text-[11px] text-slate-400">أخطاء 4xx / 5xx</div>
                <div className="text-lg font-bold font-mono text-rose-300 tabular-nums mt-1">
                  {telemetry.httpStats.status4xx} / {telemetry.httpStats.status5xx}
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  429: {telemetry.httpStats.status429} · 503: {telemetry.httpStats.status503}
                </div>
              </div>
              <div className="rounded-xl bg-slate-900 border border-slate-800 p-3.5">
                <div className="text-[11px] text-slate-400">مهام عالقة / التشغيل</div>
                <div className="text-lg font-bold font-mono text-amber-300 tabular-nums mt-1">
                  {telemetry.stuckJobsCount}
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  تشغيل: {telemetry.host.uptimeSeconds}s
                </div>
              </div>
            </div>

            {/* 11 Bound Modules Table */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-amber-400" />
                  <h2 className="text-sm font-bold text-slate-100">
                    الوحدات الـ 11 المربوطة فعلياً بوسيط المراقبة الحية (Express Runtime Middleware)
                  </h2>
                </div>
                <span className="text-[11px] text-slate-400 font-mono">
                  لا تُعرض أي وحدة غير مربوطة بمسار فعلي
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold">الوحدة</th>
                      <th className="py-2.5 px-3 font-semibold">المسارات المربوطة فعلياً</th>
                      <th className="py-2.5 px-3 font-semibold">الحالة</th>
                      <th className="py-2.5 px-3 font-semibold">الطلبات</th>
                      <th className="py-2.5 px-3 font-semibold">4xx / 5xx</th>
                      <th className="py-2.5 px-3 font-semibold">الاستجابة (avg/max)</th>
                      <th className="py-2.5 px-3 font-semibold">آخر خطأ مرصود</th>
                      <th className="py-2.5 px-3 font-semibold">عزل / تحكم</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {telemetry.modules.map((mod) => (
                      <tr key={mod.id} className="hover:bg-slate-800/30">
                        <td className="py-3 px-3 font-semibold text-slate-100 whitespace-nowrap">
                          {mod.nameAr}
                          <div className="text-[10px] font-mono text-slate-500">{mod.id}</div>
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] text-slate-300">
                          {mod.boundRoutes.join(' ، ')}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded border text-[11px] font-mono font-bold ${statusToneClasses(mod.status)}`}
                          >
                            {mod.isolated ? 'ISOLATED' : mod.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono tabular-nums text-slate-200">
                          {mod.totalRequests}
                        </td>
                        <td className="py-3 px-3 font-mono tabular-nums text-slate-300">
                          {mod.error4xxCount} / {mod.error5xxCount}
                        </td>
                        <td className="py-3 px-3 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                          {mod.avgLatencyMs} / {mod.maxLatencyMs} ms
                        </td>
                        <td className="py-3 px-3 text-[11px] text-slate-400 max-w-xs truncate">
                          {mod.lastError || '—'}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <button
                            type="button"
                            disabled={busyAction !== null}
                            onClick={() => handleToggleIsolate(mod)}
                            className={`px-2.5 py-1 rounded border text-[11px] font-semibold cursor-pointer whitespace-nowrap ${
                              mod.isolated
                                ? 'bg-amber-500 text-slate-950 border-amber-400'
                                : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
                            }`}
                          >
                            {mod.isolated ? 'فك العزل (موافقة)' : 'عزل وقائي'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent Runtime Failure Log */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
              <h3 className="text-xs font-bold text-amber-300">
                سجل الإخفاقات الحية المرصودة أثناء التشغيل ({telemetry.recentFailures.length})
              </h3>
              {telemetry.recentFailures.length === 0 ? (
                <p className="text-xs text-slate-400">
                  لم تُسجل إخفاقات HTTP &gt;= 400 في نافذة التشغيل الحالية حتى الآن.
                </p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {telemetry.recentFailures.map((ev) => (
                    <div
                      key={ev.id}
                      className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2 font-mono">
                        <span className="text-rose-400 font-bold">{ev.statusCode}</span>
                        <span className="text-slate-300">
                          {ev.method} {ev.route}
                        </span>
                        <span className="text-slate-500">({ev.moduleId})</span>
                      </div>
                      <div className="text-slate-300 text-[11px] truncate max-w-xl">
                        {ev.errorMessage}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 tabular-nums">
                        {ev.transient ? 'مؤقت' : 'ثابت'} · {ev.latencyMs}ms ·{' '}
                        {formatShortTime(ev.timestamp)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: Preflight Inspection */}
        {activeTab === 'preflight' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-amber-300">
                  نتائج الفحص الشامل قبل التشغيل (Preflight Inspection)
                </h2>
                <p className="text-xs text-slate-400 font-mono">
                  رقم التشغيل: {preflight?.runId || '—'} · المدة: {preflight?.durationMs ?? 0} ms ·
                  التوقيت: {preflight?.checkedAt || '—'}
                </p>
              </div>
              <span
                className={`px-3 py-1 rounded-md border text-xs font-bold font-mono ${statusToneClasses(preflight?.overallStatus || 'NOT TESTED')}`}
              >
                النتيجة الكلية: {preflight?.overallStatus || 'NOT TESTED'}
              </span>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/70 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold">الفحص</th>
                      <th className="py-2.5 px-3 font-semibold">الوحدة المستهدفة</th>
                      <th className="py-2.5 px-3 font-semibold">النتيجة</th>
                      <th className="py-2.5 px-3 font-semibold">الخطورة</th>
                      <th className="py-2.5 px-3 font-semibold">المدة</th>
                      <th className="py-2.5 px-3 font-semibold">الدليل الفعلي / الخطأ</th>
                      <th className="py-2.5 px-3 font-semibold">الإجراء المقترح</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {(preflight?.checks || []).map((chk) => (
                      <tr key={chk.id} className="hover:bg-slate-800/30 align-top">
                        <td className="py-3 px-3 font-semibold text-slate-100">
                          {chk.nameAr}
                          {chk.blocksCriticalLaunch && (
                            <div className="text-[10px] text-rose-400 font-bold mt-0.5">
                              يمنع الإطلاق الحرج عند الفشل
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-300 whitespace-nowrap">
                          {chk.targetModule}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded border text-[11px] font-mono font-bold ${statusToneClasses(chk.status)}`}
                          >
                            {chk.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded border text-[11px] font-mono ${severityToneClasses(chk.severity)}`}
                          >
                            {chk.severity}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                          {chk.durationMs} ms
                        </td>
                        <td className="py-3 px-3 text-[11px] text-slate-300 max-w-md space-y-1">
                          <div>{chk.evidence}</div>
                          {chk.errorMessage && (
                            <div className="text-rose-300 font-medium">{chk.errorMessage}</div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-[11px] text-amber-200/90 max-w-xs">
                          {chk.suggestedActionAr}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Diagnosis, Repairs, 3-Tier Approvals & Rollback */}
        {activeTab === 'repairs' && (
          <div className="space-y-6">
            {/* Root-Cause Diagnostic & Tier-2/Tier-3 Guardrail Sandbox */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                  <Terminal className="w-4 h-4" />
                  <span>محرك تحليل السبب الجذري (Root Cause Analyzer)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <select
                    value={diagModule}
                    onChange={(e) => setDiagModule(e.target.value as MonitoredModuleId)}
                    className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100"
                  >
                    {(telemetry?.modules || []).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nameAr}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={diagFn}
                    onChange={(e) => setDiagFn(e.target.value)}
                    placeholder="اسم الدالة الفاشلة"
                    className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 font-mono"
                  />
                  <input
                    type="text"
                    value={diagTarget}
                    onChange={(e) => setDiagTarget(e.target.value)}
                    placeholder="المسار أو الملف المرتبط"
                    className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 font-mono"
                  />
                  <input
                    type="number"
                    value={diagCode}
                    onChange={(e) => setDiagCode(Number(e.target.value))}
                    placeholder="رمز HTTP (مثال 503)"
                    className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 font-mono"
                  />
                </div>
                <input
                  type="text"
                  value={diagError}
                  onChange={(e) => setDiagError(e.target.value)}
                  placeholder="نص الخطأ الفعلي"
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 font-mono"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() => void handleDiagnoseSubmit()}
                    className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer disabled:opacity-50"
                  >
                    تشخيص السبب الجذري
                  </button>
                </div>

                {diagResult && (
                  <div className="rounded-lg bg-slate-950 border border-amber-500/30 p-3 text-xs space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-amber-300">
                        {categoryLabelAr(diagResult.category)}
                      </span>
                      <span className="font-mono text-[11px] text-slate-300">
                        {tierLabelAr(diagResult.tier)} · {diagResult.transient ? 'مؤقت' : 'ثابت'}
                      </span>
                    </div>
                    <div className="text-slate-200">{diagResult.suggestedFixAr}</div>
                    <div className="text-[11px] text-slate-400">{diagResult.priorEventsSummary}</div>
                    {diagResult.blockedReasonAr && (
                      <div className="text-[11px] text-rose-300 font-semibold">
                        {diagResult.blockedReasonAr}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                  <Lock className="w-4 h-4" />
                  <span>بوابات الأمان والتدخل المتدرج (المستوى 2 و 3 و Rollback)</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  الإصلاحات من المستوى 2 تتوقف تلقائياً عند <span className="font-mono text-amber-300">MANUAL APPROVAL REQUIRED</span> مع
                  حفظ نسخة احتياطية وبصمة SHA-256 قبل التطبيق. أما إجراءات المستوى 3 فتُحظر تلقائياً لحماية
                  الأسرار والبيانات والأوزان الأصلية.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() =>
                      void runPostAction(
                        'tier2-sandbox',
                        '/api/self-healing/repairs/trigger',
                        {
                          actionType: 'patch-sandbox-config',
                          moduleId: 'data-factory',
                          issueTitleAr: 'تعديل إعداد تشغيل محدود في ملف runtime-config.json (المستوى 2)',
                          targetPath: 'runtime-config.json',
                          patchContent: JSON.stringify(
                            { mode: 'hardened', updatedAt: new Date().toISOString() },
                            null,
                            2
                          ),
                        },
                        'أُنشئت خطة تعديل المستوى 2 وهي بانتظار اعتمادك أدناه قبل أي تعديل.'
                      )
                    }
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-amber-500/35 text-xs text-amber-200 font-semibold cursor-pointer disabled:opacity-50"
                  >
                    إنشاء خطة المستوى 2 (بانتظار الموافقة)
                  </button>
                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() =>
                      void runPostAction(
                        'tier3-block',
                        '/api/self-healing/repairs/trigger',
                        {
                          actionType: 'forbidden-tier3-test',
                          moduleId: 'weights-manager',
                          issueTitleAr: 'اختبار محاولة تعديل .env أو الأوزان الأصلية (المستوى 3)',
                          targetPath: '.env / data/weights',
                          errorContext: 'attempt to modify-secrets and overwrite-weights',
                        },
                        'نجحت بوابة الحماية في منع الإجراء الخطر من المستوى 3 وتسجيله دون مساس بالملفات.'
                      )
                    }
                    className="px-3 py-2 rounded-lg bg-rose-950/70 hover:bg-rose-900/70 border border-rose-500/40 text-xs text-rose-200 font-semibold cursor-pointer disabled:opacity-50"
                  >
                    اختبار حظر المستوى 3 الخطر
                  </button>
                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() =>
                      void runPostAction(
                        'fail-honest',
                        '/api/self-healing/repairs/trigger',
                        {
                          actionType: 'impossible-target-test',
                          moduleId: 'data-factory',
                          issueTitleAr: 'اختبار الصدق عند فشل الاستعادة التلقائية',
                        },
                        'تم إثبات حالة FAILED بصدق بعد فشل اختبار التحقق ما بعد الإصلاح.'
                      )
                    }
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 font-semibold cursor-pointer disabled:opacity-50"
                  >
                    اختبار إظهار FAILED بصدق
                  </button>
                </div>
              </div>
            </div>

            {/* Repairs History & Lifecycle List */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-200">
                سجل عمليات الإصلاح الذاتي ودورة الحياة ({statusData?.repairs.length || 0})
              </h3>
              {(statusData?.repairs || []).length === 0 ? (
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-xs text-slate-400">
                  لا توجد عمليات إصلاح مسجلة بعد. شغّل فحصاً أو أحد إجراءات الإصلاح أعلاه.
                </div>
              ) : (
                <div className="space-y-3">
                  {(statusData?.repairs || []).map((rep: RepairRecord) => (
                    <div
                      key={rep.id}
                      className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded border text-[11px] font-mono font-bold ${statusToneClasses(rep.resultStatus)}`}
                            >
                              {rep.resultStatus}
                            </span>
                            <span className="text-xs font-bold text-slate-100">{rep.issueTitleAr}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {rep.id} · {tierLabelAr(rep.tier)} · السبب:{' '}
                            {categoryLabelAr(rep.diagnosis.category)} · الوحدة: {rep.moduleId}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {rep.tier === 2 && rep.resultStatus === 'MANUAL APPROVAL REQUIRED' && (
                            <>
                              <button
                                type="button"
                                disabled={busyAction !== null}
                                onClick={() =>
                                  void runPostAction(
                                    `approve-${rep.id}`,
                                    `/api/self-healing/repairs/${rep.id}/approve`,
                                    undefined,
                                    `تم اعتماد وتنفيذ الإصلاح ${rep.id} وإعادة التحقق منه.`
                                  )
                                }
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer disabled:opacity-50"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>اعتماد وتنفيذ</span>
                              </button>
                              <button
                                type="button"
                                disabled={busyAction !== null}
                                onClick={() =>
                                  void runPostAction(
                                    `reject-${rep.id}`,
                                    `/api/self-healing/repairs/${rep.id}/reject`,
                                    undefined,
                                    `تم رفض الخطة ${rep.id} وبقيت الحالة الأصلية دون تعديل.`
                                  )
                                }
                                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 cursor-pointer disabled:opacity-50"
                              >
                                رفض
                              </button>
                            </>
                          )}

                          {rep.rollbackSnapshot?.reversible &&
                            !rep.rollbackSnapshot.rolledBackAt &&
                            rep.resultStatus === 'RECOVERED' && (
                              <button
                                type="button"
                                disabled={busyAction !== null}
                                onClick={() =>
                                  void runPostAction(
                                    `rollback-${rep.id}`,
                                    `/api/self-healing/repairs/${rep.id}/rollback`,
                                    undefined,
                                    `تم تنفيذ التراجع الآمن Rollback للسجل ${rep.id} والتحقق من تطابق SHA-256.`
                                  )
                                }
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-amber-500/40 text-amber-300 text-xs font-semibold cursor-pointer disabled:opacity-50"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>تراجع آمن Rollback</span>
                              </button>
                            )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="rounded-lg bg-slate-950 border border-slate-800 p-3 space-y-1">
                          <div className="text-[11px] text-slate-400">الإجراء المنفذ / الموقف</div>
                          <div className="text-slate-200">{rep.actionTakenAr}</div>
                          <div className="text-[11px] text-slate-400 mt-1">
                            الأهداف: <span className="font-mono">{rep.affectedTargets.join(' ، ')}</span>
                          </div>
                        </div>
                        <div className="rounded-lg bg-slate-950 border border-slate-800 p-3 space-y-1">
                          <div className="text-[11px] text-slate-400">التحقق بعد الإصلاح (Post-Verify)</div>
                          <div
                            className={
                              rep.postRepairVerified ? 'text-emerald-300' : 'text-amber-200'
                            }
                          >
                            {rep.postRepairVerificationAr || 'لم يُنفذ التعديل بعد.'}
                          </div>
                          {rep.rollbackSnapshot && (
                            <div className="text-[10px] font-mono text-slate-400 pt-1 break-all">
                              pre-SHA: {rep.rollbackSnapshot.preSha256?.slice(0, 16) || 'null'} ·
                              post-SHA: {rep.rollbackSnapshot.postSha256?.slice(0, 16) || 'null'}
                              {rep.rollbackSnapshot.rolledBackAt && (
                                <span className="text-emerald-400 font-bold">
                                  {' '}
                                  · RolledBack ({rep.rollbackSnapshot.postRollbackVerified ? 'SHA Verified' : 'Failed'})
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 7-Stage Timeline */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {rep.stageTimeline.map((st, idx) => (
                          <div
                            key={`${rep.id}-st-${idx}`}
                            title={st.detailAr}
                            className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-[10px] font-mono text-slate-300"
                          >
                            <span className="text-amber-400 font-bold">{st.stage}</span>
                            <span className="text-slate-500"> ({formatShortTime(st.at)})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: Live Alerts */}
        {activeTab === 'alerts' && (
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-amber-300">
              مركز التنبيهات الحية المرتبطة بأدلة الفحص ({statusData?.alerts.length || 0})
            </h2>
            {(statusData?.alerts || []).length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-xs text-slate-400">
                لا توجد تنبيهات مسجلة حالياً.
              </div>
            ) : (
              <div className="space-y-2.5">
                {(statusData?.alerts || []).map((al) => (
                  <div
                    key={al.id}
                    className={`rounded-xl border p-4 flex flex-wrap items-start justify-between gap-3 ${
                      al.acknowledged
                        ? 'bg-slate-900/40 border-slate-800 opacity-75'
                        : 'bg-slate-900 border-amber-500/30'
                    }`}
                  >
                    <div className="space-y-1 max-w-3xl">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded border text-[11px] font-mono font-bold ${severityToneClasses(al.severity)}`}
                        >
                          {al.severity}
                        </span>
                        <span className="text-xs font-bold text-slate-100">{al.titleAr}</span>
                      </div>
                      <p className="text-xs text-slate-300 font-mono break-words">{al.evidenceAr}</p>
                      <div className="text-[11px] text-slate-500 font-mono">
                        المصدر: {al.sourceModuleId} · المرجع: {al.linkedRecordId} ·{' '}
                        {formatShortTime(al.createdAt)}
                      </div>
                    </div>

                    {!al.acknowledged ? (
                      <button
                        type="button"
                        disabled={busyAction !== null}
                        onClick={() =>
                          void runPostAction(
                            `ack-${al.id}`,
                            `/api/self-healing/alerts/${al.id}/ack`,
                            undefined,
                            'تم تأكيد استلام التنبيه.'
                          )
                        }
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 whitespace-nowrap cursor-pointer"
                      >
                        تأكيد الاستلام
                      </button>
                    ) : (
                      <span className="text-[11px] font-mono text-emerald-400">تم الاستلام</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: Mandatory 12 Acceptance Tests */}
        {activeTab === 'acceptance' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-amber-300">
                  سجل اختبارات القبول الـ 12 الإلزامية (Real Acceptance Verification)
                </h2>
                <p className="text-xs text-slate-400">
                  يُنفذ كل اختبار فعلياً على مسارات الخادم وسجل التدقيق وملفات الـ Sandbox دون المساس ببيانات المنصة.
                </p>
              </div>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() =>
                  void runPostAction(
                    'acceptance-tab',
                    '/api/self-healing/acceptance-tests/run',
                    undefined,
                    'اكتمل تشغيل اختبارات القبول الـ 12.'
                  )
                }
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{busyAction === 'acceptance-tab' ? 'جارٍ التشغيل...' : 'إعادة تشغيل الاختبارات الـ 12'}</span>
              </button>
            </div>

            {(statusData?.acceptanceTests || []).length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-xs text-slate-300 flex items-center justify-between gap-4">
                <span>لم تُشغّل اختبارات القبول الـ 12 في هذه الدورة بعد.</span>
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
                        <th className="py-2.5 px-3 font-semibold">المدخلات</th>
                        <th className="py-2.5 px-3 font-semibold">الإجراء المنفذ</th>
                        <th className="py-2.5 px-3 font-semibold">النتيجة الفعلية</th>
                        <th className="py-2.5 px-3 font-semibold">الدليل</th>
                        <th className="py-2.5 px-3 font-semibold">المدة</th>
                        <th className="py-2.5 px-3 font-semibold">الحكم</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {statusData?.acceptanceTests.map((t: SelfHealingAcceptanceTestResult) => (
                        <tr key={t.id} className="hover:bg-slate-800/30 align-top">
                          <td className="py-3 px-3 font-mono text-amber-300 font-bold tabular-nums">
                            {t.id}
                          </td>
                          <td className="py-3 px-3 font-semibold text-slate-100">{t.nameAr}</td>
                          <td className="py-3 px-3 font-mono text-[11px] text-slate-300 max-w-[180px] break-words">
                            {t.inputsAr}
                          </td>
                          <td className="py-3 px-3 text-[11px] text-slate-300 max-w-xs">
                            {t.actionAr}
                          </td>
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
                              className={`px-2 py-0.5 rounded border text-[11px] font-mono font-bold ${statusToneClasses(t.verdict)}`}
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

      {/* Honest Disclaimer Footer */}
      <div className="px-6 py-3 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>
            قاعدة النزاهة الهندسية: لا تُعرض حالة HEALTHY أو RECOVERED إلا بعد اختبار فعلي يثبتها، ولا تُنفذ تعديلات المستوى 3 تلقائياً.
          </span>
        </div>
        <span className="font-mono text-slate-500">ALHELBAWEY SELF-HEALING ENGINE v1.0</span>
      </div>
    </div>
  );
}
