import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Code2,
  Eye,
  History,
  LayoutGrid,
  Link2,
  Loader2,
  MessageSquare,
  Play,
  RotateCcw,
  Save,
  Send,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import type {
  ErpAuditExecutionReport,
  LocalBrainForensicsReport,
  ModelWeightEntry,
  Project,
  ProjectBrainChatResponse,
} from '../types/helbawey';
import { resilientFetchJson } from '../utils/resilientFetch';
import { StatusText } from './StatusText';

interface Props {
  project: Project;
  models: ModelWeightEntry[];
  onProjectUpdated: (updated: Project) => void;
  onProjectCreated: (created: Project) => void;
}

type EditorTab = 'preview' | 'visual' | 'code' | 'agents' | 'versions';

export function AppFactoryWorkspace({
  project,
  models,
  onProjectUpdated,
  onProjectCreated,
}: Props) {
  const [activeTab, setActiveTab] = useState<EditorTab>('preview');
  const [newPrompt, setNewPrompt] = useState(
    'أنشئ لي برنامجاً مستقلاً لإدارة شركة، يحتوي على قاعدة بيانات ومحادثة ذكية وتحليل للمستندات وإعداد التقارير'
  );
  const [targetOs, setTargetOs] = useState<'Linux' | 'Windows' | 'macOS' | 'Android'>('Linux');
  const [targetRamGb, setTargetRamGb] = useState(8);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const [chatInstruction, setChatInstruction] = useState('');
  const [modifying, setModifying] = useState(false);
  const [modifyFeedback, setModifyFeedback] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<string>(
    Object.keys(project.files)[0] || 'src/App.tsx'
  );
  const [codeDraft, setCodeDraft] = useState<string>(
    project.files[Object.keys(project.files)[0] || 'src/App.tsx'] || ''
  );
  const [savingCode, setSavingCode] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Honest Local Brain Forensics state
  const [forensics, setForensics] = useState<LocalBrainForensicsReport | null>(null);
  const [forensicsLoading, setForensicsLoading] = useState(false);

  // Live Preview Page Switcher
  const [previewRoute, setPreviewRoute] = useState<string>(project.pages[0]?.route || '/');

  // Live Preview Interactive Brain Chat state (3 explicit modes)
  const [chatMode, setChatMode] = useState<'cloud-free-tier' | 'rag-sql-offline' | 'strict-local'>(
    'cloud-free-tier'
  );
  const [previewQuery, setPreviewQuery] = useState(
    'ما هي حالة عقد مستشفى الرعاية التخصصي ومتى موعد تجديده؟'
  );
  const [previewResult, setPreviewResult] = useState<ProjectBrainChatResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // ERP Audit & Repair Execution state
  const [auditRunning, setAuditRunning] = useState(false);
  const [auditReport, setAuditReport] = useState<ErpAuditExecutionReport | null>(null);

  const selectedModel = models.find((m) => m.id === project.selectedModelId) || models[0];

  useEffect(() => {
    const firstKey = Object.keys(project.files)[0] || 'src/App.tsx';
    if (!project.files[selectedFile]) {
      setSelectedFile(firstKey);
      setCodeDraft(project.files[firstKey] || '');
    } else {
      setCodeDraft(project.files[selectedFile] || '');
    }
  }, [project.id, project.files, selectedFile]);

  useEffect(() => {
    if (project.pages.length > 0 && !project.pages.some((p) => p.route === previewRoute)) {
      setPreviewRoute(project.pages[0].route);
    }
  }, [project.pages, previewRoute]);

  useEffect(() => {
    let cancelled = false;
    setForensicsLoading(true);
    resilientFetchJson<LocalBrainForensicsReport>(
      `/api/projects/${project.id}/local-brain/forensics`
    )
      .then((data) => {
        if (!cancelled) setForensics(data);
      })
      .catch(() => {
        if (!cancelled) setForensics(null);
      })
      .finally(() => {
        if (!cancelled) setForensicsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, project.selectedModelId, project.currentVersion]);

  const handleSelectFile = (path: string) => {
    setSelectedFile(path);
    setCodeDraft(project.files[path] || '');
  };

  async function handleGenerateNewApp() {
    if (!newPrompt.trim()) return;
    setGenerating(true);
    setGenError(null);
    try {
      const created = await resilientFetchJson<Project>('/api/projects/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: newPrompt, targetRamGb, targetOs }),
      });
      onProjectCreated(created);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'حدث خطأ أثناء التوليد');
    } finally {
      setGenerating(false);
    }
  }

  async function handleChatModify() {
    if (!chatInstruction.trim()) return;
    setModifying(true);
    setModifyFeedback(null);
    setActionError(null);
    try {
      const data = await resilientFetchJson<{ project: Project; changeSummaryAr?: string }>(
        `/api/projects/${project.id}/chat-modify`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instruction: chatInstruction }),
        }
      );
      onProjectUpdated(data.project);
      setModifyFeedback(data.changeSummaryAr || 'تم التعديل بنجاح وحفظ الإصدار الجديد.');
      setChatInstruction('');
    } catch (err) {
      setModifyFeedback(err instanceof Error ? err.message : 'حدث خطأ أثناء التعديل');
    } finally {
      setModifying(false);
    }
  }

  async function handleSaveCode() {
    setSavingCode(true);
    setActionError(null);
    try {
      const updatedFiles = { ...project.files, [selectedFile]: codeDraft };
      const updated = await resilientFetchJson<Project>(`/api/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: updatedFiles }),
      });
      onProjectUpdated(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'تعذر حفظ تعديلات الكود.');
    } finally {
      setSavingCode(false);
    }
  }

  async function handleRollback(version: number) {
    setActionError(null);
    try {
      const updated = await resilientFetchJson<Project>(`/api/projects/${project.id}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version }),
      });
      onProjectUpdated(updated);
      setModifyFeedback(`تم التراجع بأمان إلى الإصدار v${version} واستعادة ملفاته وجداوله.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'تعذر استعادة الإصدار.');
    }
  }

  async function handleRunPreviewBrainChat() {
    if (!previewQuery.trim()) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const data = await resilientFetchJson<ProjectBrainChatResponse>(
        `/api/projects/${project.id}/local-brain/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: previewQuery, mode: chatMode }),
        }
      );
      setPreviewResult(data);
      setForensics(data.forensics);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'تعذر تنفيذ اختبار حوار العقل.');
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleRunErpAuditRepair() {
    setAuditRunning(true);
    setActionError(null);
    try {
      const data = await resilientFetchJson<{
        report: ErpAuditExecutionReport;
        project: Project;
      }>(`/api/projects/${project.id}/erp-audit/run`, {
        method: 'POST',
      });
      setAuditReport(data.report);
      setForensics(data.report.forensics);
      onProjectUpdated(data.project);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'تعذر تنفيذ التدقيق والإصلاح.');
    } finally {
      setAuditRunning(false);
    }
  }

  async function handleAddVisualPage() {
    setActionError(null);
    const nextNum = project.pages.length + 1;
    const updatedPages = [
      ...project.pages,
      {
        id: `page-custom-${nextNum}`,
        name: `CustomModule${nextNum}`,
        route: `/module-${nextNum}`,
        layoutType: 'dashboard' as const,
        titleAr: `وحدة تقارير إضافية ${nextNum}`,
        subtitleAr: 'مضافة عبر المحرر المرئي لمتابعة البيانات المحلية',
        widgets: [
          {
            id: `w-${nextNum}`,
            type: 'report' as const,
            labelAr: 'ملخص الأداء المحلي',
            boundTable: project.dbTables[0]?.name,
          },
        ],
      },
    ];
    try {
      const updated = await resilientFetchJson<Project>(`/api/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages: updatedPages }),
      });
      onProjectUpdated(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'تعذر إضافة الصفحة.');
    }
  }

  // Relation lookup helpers for Live Preview
  const empMap = new Map(
    (project.dbTables.find((t) => t.name === 'employees')?.rows || []).map((r) => [
      String(r.id),
      String(r.full_name || r.id),
    ])
  );
  const cntMap = new Map(
    (project.dbTables.find((t) => t.name === 'contracts')?.rows || []).map((r) => [
      String(r.id),
      String(r.client_name || r.id),
    ])
  );
  const supMap = new Map(
    (project.dbTables.find((t) => t.name === 'suppliers')?.rows || []).map((r) => [
      String(r.id),
      String(r.supplier_name || r.id),
    ])
  );

  const tasksTable = project.dbTables.find((t) => t.name === 'tasks');
  const suppliersTable = project.dbTables.find((t) => t.name === 'suppliers');
  const employeesTable = project.dbTables.find((t) => t.name === 'employees');
  const contractsTable = project.dbTables.find((t) => t.name === 'contracts');
  const invoicesTable = project.dbTables.find((t) => t.name === 'invoices');
  const todayIso = new Date().toISOString().slice(0, 10);
  const overdueTasksCount = (tasksTable?.rows || []).filter(
    (r) => String(r.status || '') !== 'مكتملة' && String(r.due_date || '') < todayIso
  ).length;
  const avgComplianceRating =
    suppliersTable && suppliersTable.rows.length > 0
      ? Number(
          (
            suppliersTable.rows.reduce(
              (acc, r) => acc + Number(r.compliance_rating || 0),
              0
            ) / suppliersTable.rows.length
          ).toFixed(2)
        )
      : null;
  const failedChecks = (project.verificationReport?.checks || []).filter((c) => !c.passed);

  return (
    <div className="space-y-6">
      {/* Prompt-to-App Multi-Agent Factory Input */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              إنشاء برنامج مستقل باللغة الطبيعية (Multi-Agent Software Factory)
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              صف النظام المطلوب بالعربية أو الإنجليزية؛ يتولى المنسق المركزي و10 وكلاء بناء الواجهة، القاعدة، الخلفية، وربط الأوزان المحلية.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            <span>النظام المستهدف: {targetOs}</span>
            <span aria-hidden="true">·</span>
            <span>الذاكرة: {targetRamGb} GB RAM</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-8">
            <label htmlFor="factory-prompt" className="sr-only">
              وصف التطبيق المطلوب
            </label>
            <textarea
              id="factory-prompt"
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-400"
              placeholder="مثال: أنشئ لي برنامجاً مستقلاً لإدارة شركة، يحتوي على قاعدة بيانات ومحادثة ذكية وتحليل للمستندات وإعداد التقارير"
            />
          </div>

          <div className="lg:col-span-4 flex flex-col justify-between gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  البيئة المستهدفة
                </label>
                <select
                  value={targetOs}
                  onChange={(e) => setTargetOs(e.target.value as typeof targetOs)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs text-slate-900 dark:text-slate-100"
                >
                  <option value="Linux">Linux Server</option>
                  <option value="Windows">Windows</option>
                  <option value="macOS">macOS</option>
                  <option value="Android">Android</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  ذاكرة الجهاز (GB)
                </label>
                <select
                  value={targetRamGb}
                  onChange={(e) => setTargetRamGb(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100"
                >
                  <option value={2}>2 GB</option>
                  <option value={4}>4 GB</option>
                  <option value={8}>8 GB</option>
                  <option value={16}>16 GB</option>
                  <option value={32}>32 GB</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGenerateNewApp}
              disabled={generating}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-semibold hover:bg-slate-800 dark:hover:bg-slate-200 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              <span>{generating ? 'جاري تشغيل الوكلاء العشرة...' : 'بناء تطبيق مستقل جديد'}</span>
            </button>
          </div>
        </div>

        {genError && (
          <div className="mt-3 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-200">
            {genError}
          </div>
        )}
      </section>

      {/* Active Project Header Strip */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {project.name}
              </h3>
              <StatusText status={project.status} />
              <button
                type="button"
                onClick={handleRunErpAuditRepair}
                disabled={auditRunning}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer disabled:opacity-50"
              >
                {auditRunning ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Wrench className="w-3.5 h-3.5" />
                )}
                <span>
                  {auditRunning
                    ? 'جاري الفحص الشامل والربط...'
                    : 'تشغيل تدقيق النظام الشامل (5 جداول + 4 صفحات + العقل المحلي)'}
                </span>
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1.5 font-mono tabular-nums">
              <span>الإصدار v{project.currentVersion}</span>
              <span aria-hidden="true">·</span>
              <span>النموذج المسجل: {selectedModel?.name}</span>
              <span aria-hidden="true">·</span>
              <span>المحرك: {project.runtimeEngine}</span>
              <span aria-hidden="true">·</span>
              <span>{project.dbTables.length} جداول</span>
              <span aria-hidden="true">·</span>
              <span>{project.pages.length} صفحات</span>
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-x-auto">
            {(
              [
                { id: 'preview', label: 'المعاينة الحية', Icon: Eye },
                { id: 'visual', label: 'المحرر المرئي', Icon: LayoutGrid },
                { id: 'code', label: 'محرر الأكواد', Icon: Code2 },
                { id: 'agents', label: 'مسار الوكلاء (10)', Icon: Bot },
                { id: 'versions', label: 'الإصدارات والتراجع', Icon: History },
              ] as const
            ).map((tab) => {
              const Icon = tab.Icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    active
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Real Root Cause Disclosure Strip for FAILED / BLOCKED checks */}
        {(project.status === 'FAILED' || failedChecks.length > 0) && (
          <div className="mt-4 p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
            <div className="flex items-center gap-2 font-bold">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>
                التشخيص الحقيقي لحالة {project.status} ({failedChecks.length} بنود غير مستوفاة — بتاريخ{' '}
                {project.verificationReport?.runAt
                  ? new Date(project.verificationReport.runAt).toLocaleString('ar-EG')
                  : 'غير مسجل'}
                ):
              </span>
            </div>
            <ul className="list-disc pr-5 space-y-0.5 text-[11px]">
              {failedChecks.map((chk) => (
                <li key={chk.id}>
                  <span className="font-mono font-semibold">{chk.id}:</span> {chk.detailsAr}
                </li>
              ))}
            </ul>
          </div>
        )}

        {actionError && (
          <div className="mt-3 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-200">
            {actionError}
          </div>
        )}

        {/* Audit & Repair Live Execution Report Panel */}
        {auditReport && (
          <div className="mt-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                تقرير التدقيق والإصلاح الهندسي (v{auditReport.previousVersion} → v
                {auditReport.currentVersion}) · تراجع v1 محفوظ:{' '}
                {auditReport.v1RollbackPreserved ? 'نعم' : 'لا'}
              </div>
              <div className="flex items-center gap-3 text-[11px] font-mono">
                <span className="text-emerald-700 dark:text-emerald-400">
                  PASS: {auditReport.summaryCounts.PASS}
                </span>
                <span className="text-amber-700 dark:text-amber-400">
                  BLOCKED: {auditReport.summaryCounts.BLOCKED}
                </span>
                <span className="text-rose-700 dark:text-rose-400">
                  FAIL: {auditReport.summaryCounts.FAIL}
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {auditReport.promotionReasonAr}
            </p>
            <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900">
              {auditReport.tests.map((t) => (
                <div key={t.id} className="p-3 text-xs space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      <span className="font-mono text-slate-500 ml-1.5">{t.id}</span>
                      {t.nameAr}
                    </span>
                    <span
                      className={`font-mono font-bold ${
                        t.verdict === 'PASS'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : t.verdict === 'BLOCKED'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {t.verdict} ({t.durationMs}ms)
                    </span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300">{t.detailsAr}</p>
                  <code className="block font-mono text-[11px] text-slate-500 bg-slate-50 dark:bg-slate-950 px-2 py-1 rounded">
                    {t.evidenceLog}
                  </code>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Workspace Tab Content */}
        <div className="pt-5">
          {activeTab === 'preview' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* Live Simulated Standalone App Viewport */}
              <div className="lg:col-span-8 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-slate-50 dark:bg-slate-950 flex flex-col">
                <div className="bg-slate-900 text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold">
                    {project.name} (v{project.currentVersion})
                  </span>
                  <span className="font-mono text-[11px] text-slate-300">
                    {forensicsLoading
                      ? 'جاري الفحص الجنائي للعقل المحلي...'
                      : forensics?.localBrainReady
                        ? `LOCAL GGUF READY · ${forensics.selectedModelName} · PID ${forensics.llamaServerPid ?? '-'} · RSS ${forensics.llamaServerRssMb ?? '-'} MB`
                        : `LOCAL GGUF: BLOCKED (0 أوزان / لا يوجد llama.cpp) · الحصة المجانية + RAG`}
                  </span>
                </div>

                {/* Live Preview App Pages Switcher */}
                <div className="px-4 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-1.5">
                  {project.pages.map((pg) => (
                    <button
                      key={pg.id}
                      type="button"
                      onClick={() => setPreviewRoute(pg.route)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                        previewRoute === pg.route
                          ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {pg.titleAr} <span className="font-mono text-[10px] opacity-70">{pg.route}</span>
                    </button>
                  ))}
                </div>

                <div className="p-4 space-y-4 flex-1">
                  {/* Honest Local Brain Evidence Banner */}
                  {forensics && forensics.localBrainReady && (
                    <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-950 dark:text-emerald-200 flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                      <div className="space-y-1">
                        <div className="font-bold">
                          العقل المحلي المستقل جاهز ويعمل بدون إنترنت (READY) · {forensics.hardwareCompatibilityAr}
                        </div>
                        <p className="text-[11px] leading-relaxed">{forensics.honestDisclosureAr}</p>
                        {forensics.diskWeightFiles[0] && (
                          <div className="font-mono text-[10px] opacity-85 break-all">
                            {forensics.diskWeightFiles[0].fullPath} ({forensics.diskWeightFiles[0].bytes.toLocaleString('en-US')} bytes) · SHA-256: {forensics.diskWeightFiles[0].sha256}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {forensics && !forensics.localBrainReady && (
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <div className="font-bold">
                          العقل المحلي GGUF غير محمّل على القرص (BLOCKED) — الذاكرة المتاحة: {forensics.hostFreeRamGb} / {forensics.hostTotalRamGb} GB
                        </div>
                        <p className="text-[11px] leading-relaxed">{forensics.honestDisclosureAr}</p>
                        <div className="font-mono text-[10px] opacity-80">
                          المسار المفحوص: {forensics.weightsDirectoryFullPath} (الملفات: {forensics.diskWeightFiles.length}) · llama.cpp: {forensics.llamaCppBinaryPath || 'غير مثبت'}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* KPIs across project tables */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                    {project.dbTables.map((tbl) => (
                      <div
                        key={tbl.name}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3"
                      >
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {tbl.labelAr}
                        </div>
                        <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
                          {tbl.rows.length}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">{tbl.name}</div>
                      </div>
                    ))}
                  </div>

                  {/* Page-Specific Content: /tasks Daily Tasks & Suppliers */}
                  {previewRoute === '/tasks' && (
                    <div className="space-y-4">
                      {tasksTable ? (
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                          <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                              صفحة المهام اليومية المرتبطة (tasks ↔ employees / contracts / suppliers)
                            </span>
                            <span className="text-xs font-mono text-slate-500">
                              {tasksTable.rows.length} مهام · متأخرة: {overdueTasksCount}
                            </span>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs text-right">
                              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500">
                                <tr>
                                  <th className="px-3 py-2">المهمة</th>
                                  <th className="px-3 py-2">الاستحقاق</th>
                                  <th className="px-3 py-2">الأولوية</th>
                                  <th className="px-3 py-2">الحالة</th>
                                  <th className="px-3 py-2">الموظف / العقد / المورد</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                {tasksTable.rows.map((r) => {
                                  const isOverdue =
                                    String(r.status || '') !== 'مكتملة' &&
                                    String(r.due_date || '') < todayIso;
                                  return (
                                    <tr key={String(r.id)}>
                                      <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">
                                        {String(r.title || '')}
                                      </td>
                                      <td className="px-3 py-2 font-mono text-slate-500">
                                        {String(r.due_date || '')}
                                        {isOverdue && (
                                          <span className="mr-1.5 text-[10px] font-bold text-rose-600">
                                            (متأخرة)
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2">{String(r.priority || '')}</td>
                                      <td className="px-3 py-2 font-semibold">{String(r.status || '')}</td>
                                      <td className="px-3 py-2 text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5">
                                        <div className="flex items-center gap-1">
                                          <Link2 className="w-3 h-3 text-emerald-600" />
                                          <span>
                                            {empMap.get(String(r.assignee_employee_id)) ||
                                              String(r.assignee_employee_id || '-')}
                                          </span>
                                        </div>
                                        <div className="text-slate-400">
                                          عقد: {cntMap.get(String(r.contract_id)) || String(r.contract_id || '-')} · مورد:{' '}
                                          {supMap.get(String(r.supplier_id)) || String(r.supplier_id || '-')}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600">
                          جدول tasks غير موجود في هذا الإصدار. اضغط «تشغيل تدقيق النظام الشامل» لإضافته مع حفظ v1.
                        </div>
                      )}

                      {suppliersTable && (
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                          <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                              الموردون وتقييم الالتزام (suppliers)
                            </span>
                            <span className="text-xs font-mono text-slate-500">
                              {suppliersTable.rows.length} موردين · متوسط الالتزام العام:{' '}
                              {avgComplianceRating !== null ? `${avgComplianceRating} / 5` : '—'}
                            </span>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs text-right">
                              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500">
                                <tr>
                                  <th className="px-3 py-2">المورد</th>
                                  <th className="px-3 py-2">تقييم الالتزام</th>
                                  <th className="px-3 py-2">تاريخ آخر مراجعة</th>
                                  <th className="px-3 py-2">العقد المرتبط</th>
                                  <th className="px-3 py-2">الحالة</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                {suppliersTable.rows.map((r) => (
                                  <tr key={String(r.id)}>
                                    <td className="px-3 py-2 font-medium">{String(r.supplier_name || '')}</td>
                                    <td className="px-3 py-2 font-mono font-bold text-emerald-700 dark:text-emerald-400">
                                      {String(r.compliance_rating ?? '')} / 5
                                    </td>
                                    <td className="px-3 py-2 font-mono">{String(r.last_review_date || '')}</td>
                                    <td className="px-3 py-2">
                                      {cntMap.get(String(r.contract_id)) || String(r.contract_id || '-')}
                                    </td>
                                    <td className="px-3 py-2">{String(r.status || '')}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Page-Specific Content: /operations (Employees, Contracts, Invoices) */}
                  {previewRoute === '/operations' && (
                    <div className="space-y-4">
                      {[employeesTable, contractsTable, invoicesTable].filter(Boolean).map((tbl) => (
                        <div
                          key={tbl!.name}
                          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden"
                        >
                          <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                              {tbl!.labelAr} ({tbl!.name})
                            </span>
                            <span className="text-xs font-mono tabular-nums text-slate-500">
                              {tbl!.rows.length} صفوف
                            </span>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs text-right">
                              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500">
                                <tr>
                                  <th className="px-3 py-2 font-mono font-medium">ID</th>
                                  {tbl!.columns.map((col) => (
                                    <th key={col.name} className="px-3 py-2 font-medium">
                                      {col.labelAr}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                {tbl!.rows.map((row, rIdx) => (
                                  <tr key={String(row.id || rIdx)}>
                                    <td className="px-3 py-2 font-mono text-slate-500">
                                      {String(row.id || '')}
                                    </td>
                                    {tbl!.columns.map((col) => (
                                      <td key={col.name} className="px-3 py-2 text-slate-800 dark:text-slate-200">
                                        {String(row[col.name] ?? '')}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Page-Specific Content: /assistant RAG Docs */}
                  {previewRoute === '/assistant' && (
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          فهرس مستندات المعرفة المحلية ({project.ragDocuments.length} وثائق مفهرسة)
                        </span>
                        <span className="text-[11px] font-mono text-slate-500">BM25 / SQL Offline</span>
                      </div>
                      <div className="divide-y divide-slate-200 dark:divide-slate-800">
                        {project.ragDocuments.map((doc) => (
                          <div key={doc.id} className="py-2 text-xs">
                            <div className="font-semibold text-slate-800 dark:text-slate-200">{doc.title}</div>
                            <p className="text-[11px] text-slate-500 line-clamp-2">{doc.content}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Live Brain Chat Test Panel (Separated Sources: Cloud Gemini $0 vs Offline RAG/SQL vs Local GGUF) */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        اختبار محادثة العقل وتحليل البيانات (فصل صريح بين المصادر الثلاثة)
                      </h4>
                      <span className="text-[11px] font-mono text-slate-500">
                        {chatMode === 'cloud-free-tier'
                          ? 'Cloud Gemini Free Tier ($0)'
                          : chatMode === 'rag-sql-offline'
                            ? 'Offline RAG+SQL (No LLM / No Internet)'
                            : 'Offline Local GGUF (llama.cpp)'}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          { id: 'strict-local', label: 'نموذج GGUF المحلي المستقل (llama.cpp)' },
                          { id: 'rag-sql-offline', label: 'الاسترجاع المحلي RAG/SQL (بدون إنترنت)' },
                          { id: 'cloud-free-tier', label: 'Gemini API المجاني ($0)' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setChatMode(opt.id)}
                          className={`px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer border ${
                            chatMode === opt.id
                              ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100'
                              : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewQuery('ما هي حالة عقد مستشفى الرعاية التخصصي ومتى موعد تجديده؟')
                        }
                        className="px-2 py-1 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:bg-slate-100 cursor-pointer"
                      >
                        سؤال موجود: مستشفى الرعاية التخصصي
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewQuery('ما هي قيمة عقد شركة الأفق الدولية ومتى موعد تجديده؟')
                        }
                        className="px-2 py-1 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:bg-slate-100 cursor-pointer"
                      >
                        اختبار منع الاختلاق: كيان غير موجود
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={previewQuery}
                        onChange={(e) => setPreviewQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRunPreviewBrainChat();
                        }}
                        className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                        placeholder="اكتب سؤالاً حقيقياً عن العقود أو المهام أو الموردين..."
                      />
                      <button
                        type="button"
                        onClick={handleRunPreviewBrainChat}
                        disabled={previewLoading}
                        className="px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                      >
                        {previewLoading ? 'جاري التنفيذ...' : 'تشغيل الاختبار'}
                      </button>
                    </div>

                    {previewError && (
                      <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-200">
                        {previewError}
                      </div>
                    )}

                    {previewResult && (
                      <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                          <span className="inline-flex items-center gap-1 font-bold">
                            {previewResult.status === 'PASS' ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                            )}
                            <span>
                              {previewResult.status} · {previewResult.sourceLabelAr}
                            </span>
                          </span>
                          <span className="text-slate-500">
                            {previewResult.engineUsed || previewResult.modelUsed} · {previewResult.latencyMs}ms
                            {previewResult.tokensPerSec !== undefined
                              ? ` · ${previewResult.tokensPerSec} tok/s`
                              : ''}
                            {previewResult.processRssMb !== null && previewResult.processRssMb !== undefined
                              ? ` · RSS ${previewResult.processRssMb} MB`
                              : ''}
                            {' · '}API خارجي: {previewResult.externalApiCalled ? 'نعم ($0)' : 'لا'}
                          </span>
                        </div>
                        {previewResult.answer ? (
                          <pre className="text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed font-sans">
                            {previewResult.answer}
                          </pre>
                        ) : (
                          <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
                            {previewResult.reasonAr}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Live Data Preview Table (Overview `/` fallback) */}
                  {previewRoute === '/' && project.dbTables[0] && (
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          معاينة جدول: {project.dbTables[0].labelAr}
                        </span>
                        <span className="text-xs font-mono tabular-nums text-slate-500">
                          {project.dbTables[0].rows.length} صفوف
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-right">
                          <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500">
                            <tr>
                              {project.dbTables[0].columns.map((col) => (
                                <th key={col.name} className="px-3 py-2 font-medium">
                                  {col.labelAr}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                            {project.dbTables[0].rows.slice(0, 4).map((row, rIdx) => (
                              <tr key={String(row.id || rIdx)}>
                                {project.dbTables[0].columns.map((col) => (
                                  <td key={col.name} className="px-3 py-2 text-slate-800 dark:text-slate-200">
                                    {String(row[col.name] ?? '')}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Conversational Iterative Editor Sidebar */}
              <div className="lg:col-span-4 border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-slate-50 dark:bg-slate-950 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      تطوير التطبيق بالمحادثة
                    </h4>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
                    اطلب إضافة صفحة، جدول قاعدة بيانات، أو تعديل واجهة مع الحفاظ التلقائي على الأجزاء السليمة وإنشاء نسخة قابلة للتراجع.
                  </p>

                  <div className="space-y-2 mb-4">
                    {[
                      'أضف صفحة لمتابعة المهام اليومية وجدول tasks',
                      'أضف جدول الموردين suppliers مع تقييم الالتزام',
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => setChatInstruction(suggestion)}
                        className="w-full text-right text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-slate-400 transition-colors cursor-pointer"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2.5">
                  <textarea
                    value={chatInstruction}
                    onChange={(e) => setChatInstruction(e.target.value)}
                    rows={3}
                    placeholder="اكتب التعديل المطلوب على التطبيق..."
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={handleChatModify}
                    disabled={modifying}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {modifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span>{modifying ? 'جاري التعديل...' : 'تطبيق التعديل وحفظ الإصدار'}</span>
                  </button>
                  {modifyFeedback && (
                    <div className="text-xs p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                      {modifyFeedback}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'visual' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  تحكم في صفحات التطبيق والمكونات المرتبطة بقاعدة البيانات المحلية.
                </p>
                <button
                  type="button"
                  onClick={handleAddVisualPage}
                  className="px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium cursor-pointer"
                >
                  إضافة صفحة جديدة
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {project.pages.map((page) => (
                  <div
                    key={page.id}
                    className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-slate-50 dark:bg-slate-950"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {page.titleAr}
                      </span>
                      <span className="text-xs font-mono text-slate-500">{page.route}</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
                      {page.subtitleAr}
                    </p>
                    <div className="space-y-1.5 border-t border-slate-200 dark:border-slate-800 pt-2.5">
                      {page.widgets.map((w) => (
                        <div
                          key={w.id}
                          className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300"
                        >
                          <span>{w.labelAr}</span>
                          <span className="font-mono text-slate-400">{w.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'code' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-3 border border-slate-200 dark:border-slate-800 rounded-lg p-3 bg-slate-50 dark:bg-slate-950 space-y-1">
                <div className="text-xs font-semibold text-slate-500 px-2 pb-2">ملفات المشروع</div>
                {Object.keys(project.files).map((filePath) => (
                  <button
                    key={filePath}
                    type="button"
                    onClick={() => handleSelectFile(filePath)}
                    className={`w-full text-left font-mono text-xs px-2.5 py-2 rounded-md transition-colors cursor-pointer ${
                      selectedFile === filePath
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800'
                    }`}
                  >
                    {filePath}
                  </button>
                ))}
              </div>
              <div className="lg:col-span-9 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
                    {selectedFile}
                  </span>
                  <button
                    type="button"
                    onClick={handleSaveCode}
                    disabled={savingCode}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{savingCode ? 'جاري الحفظ...' : 'حفظ التعديلات'}</span>
                  </button>
                </div>
                <textarea
                  dir="ltr"
                  value={codeDraft}
                  onChange={(e) => setCodeDraft(e.target.value)}
                  rows={14}
                  className="w-full font-mono text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-950 text-slate-100 p-4 leading-relaxed"
                />
              </div>
            </div>
          )}

          {activeTab === 'agents' && (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
              <table className="w-full text-xs text-right">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">الوكيل الهندسي</th>
                    <th className="px-4 py-2.5 font-medium">الدور والمسؤولية</th>
                    <th className="px-4 py-2.5 font-medium">ملخص التنفيذ</th>
                    <th className="px-4 py-2.5 font-medium">الزمن</th>
                    <th className="px-4 py-2.5 font-medium">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {project.agentTrace.map((ag) => (
                    <tr key={ag.agentKey} className="hover:bg-slate-50 dark:hover:bg-slate-950/60">
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {ag.agentNameAr}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{ag.roleAr}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{ag.summary}</td>
                      <td className="px-4 py-3 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                        {ag.durationMs} ms
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusText status={ag.status} compact />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'versions' && (
            <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
              {project.versions.map((ver) => (
                <div
                  key={ver.version}
                  className="p-4 flex flex-wrap items-center justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      <span className="font-mono">v{ver.version}</span>
                      <span aria-hidden="true">·</span>
                      <span>{ver.noteAr}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                      {new Date(ver.timestamp).toLocaleString('ar-EG')} · {Object.keys(ver.filesSnapshot).length} ملفات
                      {ver.dbTablesSnapshot ? ` · ${ver.dbTablesSnapshot.length} جداول` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRollback(ver.version)}
                    disabled={ver.version === project.currentVersion}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{ver.version === project.currentVersion ? 'الإصدار النشط' : 'استعادة هذا الإصدار'}</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
