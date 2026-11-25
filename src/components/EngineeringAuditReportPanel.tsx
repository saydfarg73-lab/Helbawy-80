import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  Download,
  FileSearch,
  HardDrive,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import type {
  EngineeringAuditReport,
  FeatureStatus,
  Project,
} from '../types/helbawey';
import { StatusText } from './StatusText';

interface Props {
  projects: Project[];
  activeProjectId?: string;
}

const STATUS_FILTERS: { id: 'ALL' | FeatureStatus; label: string }[] = [
  { id: 'ALL', label: 'الكل' },
  { id: 'TESTED', label: 'TESTED' },
  { id: 'IMPLEMENTED', label: 'IMPLEMENTED' },
  { id: 'PLANNED', label: 'PLANNED' },
  { id: 'FAILED', label: 'FAILED' },
  { id: 'BLOCKED', label: 'BLOCKED' },
];

function formatDiskBytes(bytes: number): string {
  if (bytes === 0) return '0 bytes (غير موجود)';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function EngineeringAuditReportPanel({ projects, activeProjectId }: Props) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    activeProjectId || projects[0]?.id || ''
  );
  const [report, setReport] = useState<EngineeringAuditReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | FeatureStatus>('ALL');
  const [exportingPdf, setExportingPdf] = useState(false);

  const loadAuditReport = useCallback(async (projId: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs = projId ? `?projectId=${encodeURIComponent(projId)}` : '';
      const res = await fetch(`/api/audit-report${qs}`);
      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        throw new Error(errPayload.error || 'تعذر تحميل تقرير التدقيق الهندسي.');
      }
      const json = (await res.json()) as EngineeringAuditReport;
      setReport(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء فحص حالة المنصة.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAuditReport(selectedProjectId);
  }, [selectedProjectId, loadAuditReport]);

  async function handleExportPdf() {
    if (exportingPdf) return;
    setExportingPdf(true);
    setError(null);
    try {
      const qs = selectedProjectId ? `?projectId=${encodeURIComponent(selectedProjectId)}` : '';
      const res = await fetch(`/api/audit-report.pdf${qs}`);
      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        throw new Error(errPayload.error || 'فشل توليد ملف PDF لتقرير التدقيق.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `alhelbawey-engineering-audit-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تصدير التقرير بصيغة PDF.');
    } finally {
      setExportingPdf(false);
    }
  }

  const filteredItems =
    report?.auditItems.filter((item) =>
      statusFilter === 'ALL' ? true : item.status === statusFilter
    ) || [];

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <FileSearch className="w-5 h-5 text-slate-800 dark:text-slate-200 mt-0.5 shrink-0" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                تقرير التدقيق الهندسي الفعلي (Engineering Audit Report)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                فحص حي لملفات الأوزان على القرص، البصمات الرقمية SHA-256، محركات الاستدلال، الحزمة المصدرة، والتراخيص التجارية.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              aria-label="المشروع الخاضع للتدقيق"
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-medium"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => void loadAuditReport(selectedProjectId)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>إعادة الفحص الحي</span>
            </button>

            <button
              type="button"
              onClick={() => void handleExportPdf()}
              disabled={exportingPdf || loading || !report}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold hover:bg-slate-800 dark:hover:bg-slate-200 cursor-pointer disabled:opacity-50"
            >
              {exportingPdf ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>{exportingPdf ? 'جاري التوليد...' : 'تصدير التقرير بصيغة PDF'}</span>
            </button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="p-3 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-800 dark:text-rose-200 flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading && !report && (
          <div className="space-y-3 py-4">
            <div className="h-20 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
            <div className="h-44 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
          </div>
        )}

        {report && (
          <>
            {/* Verdict Banner */}
            <div
              className={`p-4 rounded-xl border flex flex-wrap items-start justify-between gap-4 ${
                report.overallVerdict === 'APPROVED_INDEPENDENT'
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-100'
                  : 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-950 dark:text-rose-100'
              }`}
            >
              <div className="flex items-start gap-3 max-w-4xl">
                {report.overallVerdict === 'APPROVED_INDEPENDENT' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
                )}
                <div className="space-y-1 text-xs">
                  <div className="font-bold">
                    {report.overallVerdict === 'APPROVED_INDEPENDENT'
                      ? 'الحكم الهندسي: معتمد ومستقل بالكامل (APPROVED_INDEPENDENT)'
                      : 'الحكم الهندسي: توقيف الاعتماد النهائي (HOLD_REQUIRES_WEIGHTS_AND_RUNTIME)'}
                  </div>
                  <p className="leading-relaxed opacity-90">{report.executiveSummaryAr}</p>
                </div>
              </div>
              <div className="text-[11px] font-mono tabular-nums opacity-75 shrink-0">
                {report.reportId} · {new Date(report.generatedAt).toLocaleTimeString('ar-EG')}
              </div>
            </div>

            {/* 5-State Breakdown Summary + Filter Buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {(
                [
                  { status: 'TESTED', labelAr: 'مُختبر ومعتمد', accent: 'text-emerald-700 dark:text-emerald-400' },
                  { status: 'IMPLEMENTED', labelAr: 'مُنفّذ برمجياً', accent: 'text-sky-700 dark:text-sky-400' },
                  { status: 'PLANNED', labelAr: 'مُخطط', accent: 'text-slate-700 dark:text-slate-300' },
                  { status: 'FAILED', labelAr: 'فشل الاختبار', accent: 'text-rose-700 dark:text-rose-400' },
                  { status: 'BLOCKED', labelAr: 'مُعلّق / ناقص', accent: 'text-amber-700 dark:text-amber-400' },
                ] as const
              ).map((card) => (
                <button
                  key={card.status}
                  type="button"
                  onClick={() =>
                    setStatusFilter((prev) => (prev === card.status ? 'ALL' : card.status))
                  }
                  className={`p-3 rounded-lg border text-right transition-colors cursor-pointer ${
                    statusFilter === card.status
                      ? 'border-slate-900 dark:border-slate-100 bg-slate-50 dark:bg-slate-800/70'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="text-[11px] font-mono text-slate-500">{card.status}</div>
                  <div className={`text-xl font-bold font-mono tabular-nums mt-0.5 ${card.accent}`}>
                    {report.statusCounts[card.status]}
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                    {card.labelAr}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {report && (
        <>
          {/* Host & Build Diagnostics */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-slate-700 dark:text-slate-300" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                تشخيص المضيف الفعلي ومخرجات القرص
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs pt-1">
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                <div className="text-slate-500">مجلد الأوزان ({report.hostDiagnostics.weightsDirPath})</div>
                <div className="font-mono font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                  {report.hostDiagnostics.weightsDirFilesCount} ملفات
                </div>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                <div className="text-slate-500">محركات الاستدلال في PATH</div>
                <div className="font-mono font-semibold text-slate-900 dark:text-slate-100 mt-1 truncate">
                  {report.hostDiagnostics.binariesDetected.llamaServer ||
                    report.hostDiagnostics.binariesDetected.llamaCli ||
                    report.hostDiagnostics.binariesDetected.ollama ||
                    'غير مثبتة (NOT FOUND)'}
                </div>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                <div className="text-slate-500">تخزين القاعدة ({report.hostDiagnostics.storePath})</div>
                <div className="font-mono font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                  {(report.hostDiagnostics.storeBytes / 1024).toFixed(1)} KB
                </div>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                <div className="text-slate-500">بناء الإنتاج (dist/) وعتاد المضيف</div>
                <div className="font-mono font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                  {report.hostDiagnostics.distBuilt
                    ? `${(report.hostDiagnostics.distBundleJsBytes / 1024).toFixed(0)} KB`
                    : 'غير مبني'}{' '}
                  · {report.hostDiagnostics.totalRamGb} GB RAM
                </div>
              </div>
            </div>
          </section>

          {/* Engineering Audit Checks Table */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                تفاصيل اختبارات وفحوصات التدقيق الهندسي ({filteredItems.length})
              </h3>
              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800">
                {STATUS_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setStatusFilter(f.id)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-mono cursor-pointer transition-colors ${
                      statusFilter === f.id
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
              <table className="w-full text-xs text-right">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-3 py-2.5 font-mono">الرمز</th>
                    <th className="px-3 py-2.5 font-medium">البند والمكوّن</th>
                    <th className="px-3 py-2.5 font-medium">الدليل المرصود فعلياً</th>
                    <th className="px-3 py-2.5 font-medium">النقص / الإجراء المطلوب</th>
                    <th className="px-3 py-2.5 font-medium">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-950/60 align-top">
                      <td className="px-3 py-3 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                        {item.code}
                      </td>
                      <td className="px-3 py-3 min-w-[200px]">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {item.titleAr}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                          {item.categoryAr} · {item.componentRef}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-700 dark:text-slate-300 min-w-[230px] leading-relaxed">
                        {item.evidenceAr}
                      </td>
                      <td className="px-3 py-3 text-slate-600 dark:text-slate-400 min-w-[210px] leading-relaxed">
                        {item.gapOrActionAr}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <StatusText status={item.status} compact />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Model Paths, Disk Sizes, SHA-256 & License Audit Table */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-slate-700 dark:text-slate-300" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  جرد مسارات وأحجام ملفات الأوزان على القرص والبصمات SHA-256 والتراخيص
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  مقارنة حجم الكتالوج النظري مقابل الحجم الفعلي الموجود داخل data/weights/ وفحص متطلبات التوزيع التجاري.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
              <table className="w-full text-xs text-right">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">النموذج</th>
                    <th className="px-3 py-2.5 font-medium">المسار المتوقع على القرص</th>
                    <th className="px-3 py-2.5 font-medium">حجم الكتالوج / الفعلي</th>
                    <th className="px-3 py-2.5 font-medium">SHA-256</th>
                    <th className="px-3 py-2.5 font-medium">الترخيص التجاري</th>
                    <th className="px-3 py-2.5 font-medium">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {report.modelAudits.map((m) => (
                    <tr key={m.modelId} className="hover:bg-slate-50 dark:hover:bg-slate-950/60 align-top">
                      <td className="px-3 py-2.5">
                        <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {m.modelName}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {m.parameters} · {m.format} · {m.quantization}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-slate-700 dark:text-slate-300" dir="ltr">
                        {m.expectedPath}
                      </td>
                      <td className="px-3 py-2.5 font-mono tabular-nums whitespace-nowrap">
                        <div className="text-slate-700 dark:text-slate-300">{m.catalogSizeGb} GB (كتالوج)</div>
                        <div
                          className={`text-[11px] ${
                            m.diskExists
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-rose-700 dark:text-rose-400'
                          }`}
                        >
                          {formatDiskBytes(m.diskBytes)}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px]">
                        <div
                          className={
                            m.sha256Status === 'MATCH_VERIFIED'
                              ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                              : 'text-rose-700 dark:text-rose-400 font-semibold'
                          }
                        >
                          {m.sha256Status}
                        </div>
                        <div className="text-slate-500 truncate max-w-[140px]" title={m.expectedSha256}>
                          {m.expectedSha256.slice(0, 16)}...
                        </div>
                      </td>
                      <td className="px-3 py-2.5 min-w-[200px]">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {m.license}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {m.licenseNotesAr}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <StatusText status={m.status} compact />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="text-[11px] font-mono text-slate-500 break-all pt-1">
              Report Digest (SHA-256): {report.reportDigestSha256}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
