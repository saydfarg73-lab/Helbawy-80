import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileArchive,
  Globe,
  Loader2,
  Pencil,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import type {
  ExportFormat,
  ModelWeightEntry,
  Project,
  VerificationReport,
  WeightIntegrityReport,
} from '../types/helbawey';
import { StatusText } from './StatusText';

interface Props {
  project: Project;
  models: ModelWeightEntry[];
  onProjectUpdated: (updated: Project) => void;
}

const EXPORT_FORMATS: { id: ExportFormat; labelAr: string; descAr: string }[] = [
  { id: 'server', labelAr: 'خادم خاص مستقل (Node/Docker)', descAr: 'خادم Express + SQL + محرك استدلال + أوزان' },
  { id: 'web', labelAr: 'تطبيق ويب مستقل', descAr: 'واجهة الويب + الخادم المحلي والملفات' },
  { id: 'pwa', labelAr: 'تطبيق ويب تقدمي (PWA)', descAr: 'يضم manifest.json و Service Worker للعمل دون اتصال' },
  { id: 'android', labelAr: 'حزمة Android (Capacitor/NNAPI)', descAr: 'تهيئة Android المحلية وتشغيل الأوزان على الجهاز' },
  { id: 'desktop', labelAr: 'سطح مكتب (Win/Linux/macOS)', descAr: 'حزمة تشغيلية مع install.bat و install.sh' },
  { id: 'source', labelAr: 'الكود المصدري الكامل', descAr: 'المشروع الكامل + الاختبارات + الوثائق' },
];

export function PackagingVerificationWorkspace({ project, models, onProjectUpdated }: Props) {
  const [verifying, setVerifying] = useState(false);
  const [manifestFiles, setManifestFiles] = useState<{ path: string; bytes: number }[]>([]);
  const [bundleMode, setBundleMode] = useState<string>('');
  const [customDomain, setCustomDomain] = useState(project.deployment.customDomain);
  const [integrityReport, setIntegrityReport] = useState<WeightIntegrityReport | null>(null);
  const [loadingIntegrity, setLoadingIntegrity] = useState(false);
  const [integrityFilter, setIntegrityFilter] = useState<'all' | 'imported' | 'alerts'>('all');
  const [editingRefModelId, setEditingRefModelId] = useState<string | null>(null);
  const [refHashDraft, setRefHashDraft] = useState('');
  const [refHashError, setRefHashError] = useState<string | null>(null);
  const [savingRefHash, setSavingRefHash] = useState(false);
  const [expandedHashModelId, setExpandedHashModelId] = useState<string | null>(null);
  const [copiedHashKey, setCopiedHashKey] = useState<string | null>(null);

  const selectedModel = models.find((m) => m.id === project.selectedModelId) || models[0];
  const report: VerificationReport | null = project.verificationReport;

  async function refreshIntegrityReport() {
    setLoadingIntegrity(true);
    try {
      const res = await fetch(
        `/api/packaging/weights-integrity?projectId=${encodeURIComponent(project.id)}`
      );
      if (res.ok) {
        setIntegrityReport((await res.json()) as WeightIntegrityReport);
      }
    } catch {
      // Ignore transient integrity fetch error
    } finally {
      setLoadingIntegrity(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetch(`/api/projects/${project.id}/manifest-preview`)
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        setManifestFiles(data.fileList || []);
        setBundleMode(data.weightsEmbedMode || '');
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [project.id, project.exportFormat, project.selectedModelId, project.currentVersion]);

  useEffect(() => {
    void refreshIntegrityReport();
  }, [project.id, project.selectedModelId, models]);

  async function handleSaveReferenceHash(modelId: string) {
    setRefHashError(null);
    const cleaned = refHashDraft.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(cleaned)) {
      setRefHashError('يجب أن يتكون الهاش المرجعي من 64 حرفاً سداسياً عشرياً (0-9, a-f).');
      return;
    }
    setSavingRefHash(true);
    try {
      const res = await fetch(`/api/models/${modelId}/reference-sha256`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referenceSha256: cleaned, projectId: project.id }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || 'تعذر حفظ الهاش المرجعي.');
      }
      if (payload.integrityReport) {
        setIntegrityReport(payload.integrityReport as WeightIntegrityReport);
      }
      setEditingRefModelId(null);
      setRefHashDraft('');
    } catch (err) {
      setRefHashError(err instanceof Error ? err.message : 'تعذر حفظ الهاش المرجعي.');
    } finally {
      setSavingRefHash(false);
    }
  }

  function handleCopyHash(key: string, val: string) {
    navigator.clipboard?.writeText(val).catch(() => {});
    setCopiedHashKey(key);
    setTimeout(() => setCopiedHashKey(null), 1500);
  }

  async function handleSelectFormat(format: ExportFormat) {
    const res = await fetch(`/api/projects/${project.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exportFormat: format }),
    });
    if (res.ok) {
      onProjectUpdated((await res.json()) as Project);
    }
  }

  async function handleRunVerification() {
    setVerifying(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/verify`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        onProjectUpdated(data.project as Project);
      }
    } finally {
      setVerifying(false);
    }
  }

  async function handleSaveDeployment() {
    const res = await fetch(`/api/projects/${project.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deployment: {
          ...project.deployment,
          customDomain,
          lastDeployedAt: new Date().toISOString(),
          status: 'TESTED',
        },
      }),
    });
    if (res.ok) {
      onProjectUpdated((await res.json()) as Project);
    }
  }

  return (
    <div className="space-y-6">
      {/* Packaging & Export Format Control */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <FileArchive className="w-5 h-5 text-slate-700 dark:text-slate-300 mt-0.5 shrink-0" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                محرك دمج الأوزان وتغليف الحزمة المستقلة (HELBAWEY WEIGHT PACKAGING & EMBEDDING ENGINE)
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                يغلف الحزمة الكاملة: الكود المصدري + الواجهات + Backend + قاعدة البيانات + ملفات النموذج و{selectedModel?.name} + محرك {project.runtimeEngine} + اختبارات الاستقلال.
              </p>
            </div>
          </div>

          <a
            href={`/api/projects/${project.id}/export?format=${project.exportFormat}`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold hover:bg-slate-800 dark:hover:bg-slate-200 whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>تحميل الحزمة المستقلة (.zip)</span>
          </a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {EXPORT_FORMATS.map((fmt) => {
            const active = project.exportFormat === fmt.id;
            return (
              <button
                key={fmt.id}
                type="button"
                onClick={() => handleSelectFormat(fmt.id)}
                className={`text-right p-3.5 rounded-lg border transition-colors cursor-pointer ${
                  active
                    ? 'border-slate-900 dark:border-slate-100 bg-slate-50 dark:bg-slate-950'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-400'
                }`}
              >
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100">{fmt.labelAr}</div>
                <div className="text-[11px] text-slate-500 mt-1">{fmt.descAr}</div>
              </button>
            );
          })}
        </div>

        {/* Bundle Contents Manifest */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              محتويات حزمة التصدير الفعلية ({manifestFiles.length} ملف)
            </span>
            <span className="font-mono text-slate-500">
              وضع الأوزان: {bundleMode === 'EMBEDDED_FULL_SHARD' ? 'شريحة وزن كاملة مضمنة' : 'محرك محلي + مصفوفة تضمين + محقق الشرائح'}
            </span>
          </div>
          <div className="max-h-56 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
            {manifestFiles.map((f) => (
              <div key={f.path} className="px-4 py-2 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-800 dark:text-slate-200" dir="ltr">
                  {f.path}
                </span>
                <span className="text-slate-500 tabular-nums">
                  {(f.bytes / 1024).toFixed(1)} KB
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Interactive Weights SHA-256 Actual vs Reference Verification Matrix */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-slate-700 dark:text-slate-300 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                التحقق التفاعلي من بصمة SHA-256 لملفات الأوزان المستوردة مقابل المرجع المعلن
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                يحسب الهاش الفعلي مباشرة من الملفات المستوردة على القرص ويقارنه بالهاش المرجعي المعلن من مصدر النموذج مع تنبيه بصري فوري عند أي اختلاف.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void refreshIntegrityReport()}
            disabled={loadingIntegrity}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingIntegrity ? 'animate-spin' : ''}`} />
            <span>{loadingIntegrity ? 'جاري الفحص...' : 'إعادة فحص البصمات من القرص'}</span>
          </button>
        </div>

        {integrityReport && integrityReport.mismatchCount > 0 && (
          <div className="p-3.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-900 dark:text-rose-200 flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>
              <strong>تحذير أمني:</strong> تم رصد{' '}
              <span className="font-mono font-bold tabular-nums">{integrityReport.mismatchCount}</span>{' '}
              ملف أوزان مستورد لا يطابق هاش SHA-256 المرجعي المعلن من مصدر النموذج — لا تعتمد التصدير قبل استبدال الملف أو التحقق من مصدره.
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg">
            {(
              [
                { id: 'all', label: `كل النماذج (${integrityReport?.rows.length ?? models.length})` },
                { id: 'imported', label: `المستوردة فعلياً (${integrityReport?.importedCount ?? 0})` },
                {
                  id: 'alerts',
                  label: `تحذيرات وعدم تطابق (${
                    (integrityReport?.mismatchCount ?? 0) +
                    (integrityReport?.rows.filter((r) => r.matchStatus === 'UNVERIFIED_PLACEHOLDER_REF').length ?? 0)
                  })`,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setIntegrityFilter(tab.id)}
                className={`px-3 py-1 rounded-md text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                  integrityFilter === tab.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {integrityReport && (
            <div className="text-[11px] font-mono tabular-nums text-slate-500">
              متطابق: {integrityReport.matchedCount} · غير متطابق: {integrityReport.mismatchCount} · غير مستورد:{' '}
              {integrityReport.missingCount}
            </div>
          )}
        </div>

        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
          <table className="w-full text-right text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                <th className="py-2.5 px-3 font-semibold whitespace-nowrap">النموذج وملف الأوزان المستورد</th>
                <th className="py-2.5 px-3 font-semibold whitespace-nowrap">هاش SHA-256 الفعلي (من القرص)</th>
                <th className="py-2.5 px-3 font-semibold">
                  مقارنة تفاعلية مع الهاش المرجعي المعلن من المصدر
                </th>
                <th className="py-2.5 px-3 font-semibold whitespace-nowrap">حالة المطابقة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {(integrityReport?.rows || [])
                .filter((row) => {
                  if (integrityFilter === 'imported') return row.imported;
                  if (integrityFilter === 'alerts') {
                    return (
                      row.matchStatus === 'MISMATCH' ||
                      row.matchStatus === 'UNVERIFIED_PLACEHOLDER_REF'
                    );
                  }
                  return true;
                })
                .map((row) => {
                  const isMismatch = row.matchStatus === 'MISMATCH';
                  const isVerified = row.matchStatus === 'MATCH_VERIFIED';
                  const isPlaceholder = row.matchStatus === 'UNVERIFIED_PLACEHOLDER_REF';
                  const isEditing = editingRefModelId === row.modelId;
                  const isExpanded = expandedHashModelId === row.modelId;

                  return (
                    <tr
                      key={row.modelId}
                      className={
                        isMismatch
                          ? 'bg-rose-50/60 dark:bg-rose-950/25'
                          : row.isSelectedInProject
                            ? 'bg-slate-50/70 dark:bg-slate-950/50'
                            : 'bg-white dark:bg-slate-900'
                      }
                    >
                      <td className="py-3 px-3 align-top">
                        <div className="font-mono font-bold text-slate-900 dark:text-slate-100">
                          {row.modelName}
                          {row.isSelectedInProject && (
                            <span className="mr-1.5 text-[10px] font-sans font-semibold text-emerald-700 dark:text-emerald-400">
                              (المعتمد)
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                          {row.imported && row.importedFileName
                            ? `${row.importedFileName} (${(row.importedBytes / 1024).toFixed(1)} KB)`
                            : 'لم يُستورد ملف أوزان فعلي بعد'}
                        </div>
                      </td>

                      <td className="py-3 px-3 align-top">
                        {row.actualSha256 ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <code
                                dir="ltr"
                                className={`font-mono text-[11px] tabular-nums ${
                                  isMismatch
                                    ? 'text-rose-700 dark:text-rose-300 font-bold'
                                    : 'text-slate-800 dark:text-slate-200'
                                }`}
                              >
                                {row.actualSha256.slice(0, 18)}...{row.actualSha256.slice(-8)}
                              </code>
                              <button
                                type="button"
                                onClick={() => handleCopyHash(`actual-${row.modelId}`, row.actualSha256!)}
                                title="نسخ هاش SHA-256 الفعلي كاملاً"
                                className="p-1 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
                              >
                                {copiedHashKey === `actual-${row.modelId}` ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono" dir="ltr">
                              {row.importedRelativePath}
                            </div>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-mono">
                            — لا يوجد ملف على القرص —
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3 align-top space-y-2 min-w-[290px]">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="space-y-0.5">
                            <div className="text-[10px] text-slate-500">{row.referenceSourceLabel}</div>
                            <div className="flex items-center gap-1.5">
                              <code
                                dir="ltr"
                                className="font-mono text-[11px] tabular-nums text-slate-700 dark:text-slate-300"
                              >
                                {row.referenceSha256
                                  ? `${row.referenceSha256.slice(0, 18)}...${row.referenceSha256.slice(-8)}`
                                  : 'غير محدد'}
                              </code>
                              {row.referenceSha256 && (
                                <button
                                  type="button"
                                  onClick={() => handleCopyHash(`ref-${row.modelId}`, row.referenceSha256)}
                                  title="نسخ الهاش المرجعي كاملاً"
                                  className="p-1 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
                                >
                                  {copiedHashKey === `ref-${row.modelId}` ? (
                                    <Check className="w-3 h-3 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedHashModelId(isExpanded ? null : row.modelId)
                              }
                              className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-[11px] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              {isExpanded ? 'إخفاء المقارنة' : 'مقارنة تفصيلية'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingRefModelId(isEditing ? null : row.modelId);
                                setRefHashDraft(row.referenceSha256 || '');
                                setRefHashError(null);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-[11px] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>تعيين مرجعي</span>
                            </button>
                          </div>
                        </div>

                        {isMismatch && (
                          <div className="p-2 rounded border border-rose-300 dark:border-rose-800 bg-rose-100/70 dark:bg-rose-950/60 text-[11px] text-rose-900 dark:text-rose-200 flex items-start gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
                            <span>{row.mismatchReasonAr}</span>
                          </div>
                        )}

                        {!isMismatch && isPlaceholder && (
                          <div className="p-2 rounded border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-[11px] text-amber-900 dark:text-amber-200">
                            تنبيه: الهاش المرجعي الحالي قيمة اختبارية بالكتالوج — أدخل الهاش الرسمي المعلن من مصدر النموذج للمطابقة الفعلية.
                          </div>
                        )}

                        {isExpanded && (
                          <div
                            dir="ltr"
                            className="p-2.5 rounded bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-[10px] space-y-1 break-all"
                          >
                            <div>
                              <span className="text-slate-500">ACTUAL:    </span>
                              <span
                                className={
                                  isMismatch
                                    ? 'text-rose-700 dark:text-rose-300 font-bold'
                                    : 'text-slate-800 dark:text-slate-200'
                                }
                              >
                                {row.actualSha256 || '(MISSING_ON_DISK)'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500">REFERENCE: </span>
                              <span className="text-slate-800 dark:text-slate-200">
                                {row.referenceSha256 || '(UNSET)'}
                              </span>
                            </div>
                          </div>
                        )}

                        {isEditing && (
                          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 space-y-2">
                            <input
                              type="text"
                              value={refHashDraft}
                              onChange={(e) => setRefHashDraft(e.target.value)}
                              dir="ltr"
                              placeholder="ألصق هاش SHA-256 المرجعي الرسمي (64 خانة hex)..."
                              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-[11px] font-mono"
                            />
                            {refHashError && (
                              <div className="text-[11px] text-rose-600 dark:text-rose-400">
                                {refHashError}
                              </div>
                            )}
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingRefModelId(null);
                                  setRefHashError(null);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 text-[11px] cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                                <span>إلغاء</span>
                              </button>
                              <button
                                type="button"
                                disabled={savingRefHash}
                                onClick={() => void handleSaveReferenceHash(row.modelId)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                              >
                                <Check className="w-3 h-3" />
                                <span>{savingRefHash ? 'حفظ...' : 'حفظ ومقارنة'}</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3 align-top whitespace-nowrap">
                        {isVerified ? (
                          <span className="inline-flex items-center gap-1 font-mono font-bold text-[11px] text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>MATCH_VERIFIED</span>
                          </span>
                        ) : isMismatch ? (
                          <span className="inline-flex items-center gap-1 font-mono font-bold text-[11px] text-rose-700 dark:text-rose-400">
                            <XCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>MISMATCH (تحذير)</span>
                          </span>
                        ) : isPlaceholder ? (
                          <span className="inline-flex items-center gap-1 font-mono font-bold text-[11px] text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>PLACEHOLDER_REF</span>
                          </span>
                        ) : (
                          <span className="font-mono text-[11px] text-slate-500">MISSING_ON_DISK</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Mandatory Independence Verification Unit (Article 10) */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-700 dark:text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                وحدة التحقق الإلزامية من استقلال الذكاء الاصطناعي (HELBAWEY INDEPENDENT AI VERIFICATION)
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                تختبر وجود الأوزان، سلامة SHA-256، الاستدلال المحلي مع فصل الإنترنت، وعدم استدعاء Gemini أو OpenAI أو Claude.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRunVerification}
            disabled={verifying}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold cursor-pointer disabled:opacity-50"
          >
            {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            <span>{verifying ? 'جاري الفحص المخبري...' : 'تشغيل اختبار الاستقلال الآن'}</span>
          </button>
        </div>

        {report && (
          <div className="space-y-4">
            {report.verdict !== 'INDEPENDENT_VERIFIED' && (
              <div className="p-3.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-900 dark:text-rose-200 flex flex-wrap items-center justify-between gap-2">
                <span>
                  الاعتماد النهائي موقوف ({report.verdict}): الحزمة غير مكتملة الاستقلال بعد لعدم وجود ملف الأوزان الفعلي (GGUF) ومحقق البصمة SHA-256 واختبار التوليد العصبي الحقيقي.
                </span>
                <span className="font-mono font-bold">HOLD / BLOCKED</span>
              </div>
            )}

            {/* Key Verification Matrix */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div className="text-[11px] text-slate-500">هل الأوزان الفعلية موجودة؟</div>
                <div
                  className={`text-sm font-bold mt-1 ${
                    report.weightsPresent
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-rose-700 dark:text-rose-400'
                  }`}
                >
                  {report.weightsPresent ? 'نعم — موثقة بالبصمة' : 'لا — مفقودة على القرص'}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div className="text-[11px] text-slate-500">هل تم استدعاء API خارجي؟</div>
                <div
                  className={`text-sm font-bold mt-1 ${
                    report.externalApiCalled
                      ? 'text-rose-700 dark:text-rose-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {report.externalApiCalled ? 'نعم (مرفوض)' : 'لا في الحزمة (0 استدعاءات)'}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div className="text-[11px] text-slate-500">هل يعمل البرنامج دون إنترنت؟</div>
                <div
                  className={`text-sm font-bold mt-1 ${
                    report.worksOffline
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-rose-700 dark:text-rose-400'
                  }`}
                >
                  {report.worksOffline ? 'نعم — مستقل محلياً' : 'لا — ينقصه ملف الأوزان'}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div className="text-[11px] text-slate-500">حجم الحزمة وزمن الفحص</div>
                <div className="text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
                  {report.bundleSizeLabel} · {report.localInferenceLatencyMs}ms
                </div>
              </div>
            </div>

            {/* 6 Checks Breakdown */}
            <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
              {report.checks.map((chk) => (
                <div key={chk.id} className="p-3.5 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-2.5">
                    {chk.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
                    )}
                    <div>
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {chk.titleAr}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                        {chk.detailsAr}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-mono font-semibold whitespace-nowrap ${
                      chk.passed
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-rose-700 dark:text-rose-400'
                    }`}
                  >
                    {chk.passed ? 'PASS' : 'FAIL'}
                  </span>
                </div>
              ))}
            </div>

            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                مخرجات اختبار المحادثة المحلية الفعلي:
              </div>
              <div className="text-slate-600 dark:text-slate-400">السؤال الاختباري: {report.testPrompt}</div>
              <div className="text-slate-800 dark:text-slate-200">{report.testOutput}</div>
              <div className="text-slate-500 font-mono">
                متطلبات الجهاز: {report.hardwareRequirementSummary} · الوظائف المحتاجة للإنترنت:{' '}
                {report.functionsRequiringInternet.join('، ')}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Independent Deployment & Custom Domains (Article 15) */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Globe className="w-5 h-5 text-slate-700 dark:text-slate-300" />
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                النشر وربط النطاقات على خادم مستقل (Independent Hosting)
              </h3>
              <p className="text-xs text-slate-500">
                البرامج قابلة للتشغيل على أي خادم خاص أو شبكة داخلية دون الارتباط بخادم منصة الهلباوي.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={customDomain}
              onChange={(e) => setCustomDomain(e.target.value)}
              dir="ltr"
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs font-mono"
            />
            <StatusText status={project.deployment.status} compact />
            <button
              type="button"
              onClick={handleSaveDeployment}
              className="px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium cursor-pointer"
            >
              تحديث إعداد النشر
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
