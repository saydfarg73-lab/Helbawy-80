import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  FileText,
  HardDrive,
  Loader2,
  Scale,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { ModelTechnicalDossier } from '../types/helbawey';

interface Props {
  modelId: string;
  projectId?: string;
  onClose: () => void;
}

export async function downloadModelTechnicalPdf(modelId: string, projectId?: string): Promise<void> {
  const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  const res = await fetch(`/api/models/${encodeURIComponent(modelId)}/technical-report.pdf${qs}`);
  if (!res.ok) {
    throw new Error('تعذر توليد ملف التقرير الفني PDF.');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${modelId}-technical-report.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ModelTechnicalReportModal({ modelId, projectId, onClose }: Props) {
  const [dossier, setDossier] = useState<ModelTechnicalDossier | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
    fetch(`/api/models/${encodeURIComponent(modelId)}/technical-report${qs}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('تعذر تحميل بيانات التقرير الفني.');
        return (await res.json()) as ModelTechnicalDossier;
      })
      .then((data) => {
        if (active) setDossier(data);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'خطأ غير متوقع');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [modelId, projectId]);

  async function handleDownloadPdf() {
    setDownloading(true);
    setError(null);
    try {
      await downloadModelTechnicalPdf(modelId, projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تنزيل ملف PDF');
    } finally {
      setDownloading(false);
    }
  }

  function handleCopy(key: string, value: string) {
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="معاينة التقرير الفني الشامل للنموذج"
    >
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950">
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-slate-700 dark:text-slate-300 shrink-0" />
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                التقرير الفني الشامل للنموذج (PDF Technical Dossier)
              </h2>
              {dossier && (
                <div className="text-[11px] font-mono text-slate-500">
                  {dossier.reportId} · {dossier.modelName}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!dossier || downloading}
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold hover:bg-slate-800 dark:hover:bg-slate-200 cursor-pointer disabled:opacity-50"
            >
              {downloading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>{downloading ? 'جاري التوليد...' : 'تحميل التقرير بصيغة PDF'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق المعاينة"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {loading && (
            <div className="py-12 flex items-center justify-center gap-2 text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>جاري تجميع بيانات الفحص والتشفير والرخصة...</span>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200">
              {error}
            </div>
          )}

          {dossier && (
            <>
              {/* Readiness Alert */}
              <div
                className={`p-3.5 rounded-lg border flex items-start gap-2.5 ${
                  dossier.approvalReadiness.status === 'READY_VERIFIED'
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                    : 'bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                }`}
              >
                {dossier.approvalReadiness.status === 'READY_VERIFIED' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5">
                  <div className="font-bold font-mono">{dossier.approvalReadiness.status}</div>
                  <div>{dossier.approvalReadiness.summaryAr}</div>
                </div>
              </div>

              {/* Section 1: Identity & Specs */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 font-bold text-slate-900 dark:text-slate-100">
                  1. الهوية الفنية ومواصفات المعمارية
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4">
                  <div>
                    <div className="text-slate-500">العائلة والمعاملات</div>
                    <div className="font-mono font-semibold mt-0.5">
                      {dossier.family} · {dossier.parameters}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">الصيغة والتكميم</div>
                    <div className="font-mono font-semibold mt-0.5">
                      {dossier.format} · {dossier.quantization}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">طول السياق والشرائح</div>
                    <div className="font-mono font-semibold mt-0.5">
                      {dossier.contextLength.toLocaleString('en-US')} · {dossier.shardsCount} shard
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">الحجم المرجعي بالسجل</div>
                    <div className="font-mono font-semibold mt-0.5">{dossier.catalogSizeGb} GB</div>
                  </div>
                </div>
                <div className="px-4 pb-4 space-y-1 text-slate-600 dark:text-slate-400">
                  <div>
                    <strong className="text-slate-800 dark:text-slate-200">الدقة:</strong>{' '}
                    {dossier.postQuantAccuracy}
                  </div>
                  <div>
                    <strong className="text-slate-800 dark:text-slate-200">القيود:</strong>{' '}
                    {dossier.knownLimits}
                  </div>
                </div>
              </div>

              {/* Section 2: Cryptographic Integrity & SHA-256 */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-bold text-slate-900 dark:text-slate-100">
                    <ShieldCheck className="w-4 h-4" />
                    <span>2. التحقق التشفيري وبصمة SHA-256</span>
                  </span>
                  <span
                    className={`font-mono font-bold ${
                      dossier.integrity.sha256MatchStatus === 'MATCH_VERIFIED'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-rose-700 dark:text-rose-400'
                    }`}
                  >
                    {dossier.integrity.sha256MatchStatus}
                  </span>
                </div>
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="text-slate-500">مسار القرص المفحوص</div>
                      <div className="font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                        {dossier.integrity.diskFilePath}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">الحجم الفعلي على القرص</div>
                      <div className="font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                        {dossier.integrity.diskFileExists
                          ? `${dossier.integrity.diskFileBytes.toLocaleString('en-US')} bytes`
                          : '0 bytes (غير موجود على القرص)'}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-500 font-medium">
                        SHA-256 المتوقع في السجل:
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy('expected', dossier.integrity.expectedSha256)}
                        className="inline-flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-400 hover:text-slate-900 cursor-pointer"
                      >
                        {copiedKey === 'expected' ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>{copiedKey === 'expected' ? 'تم النسخ' : 'نسخ'}</span>
                      </button>
                    </div>
                    <div
                      dir="ltr"
                      className="p-2.5 rounded bg-slate-100 dark:bg-slate-950 font-mono text-[11px] break-all"
                    >
                      {dossier.integrity.expectedSha256}
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-500 font-medium mb-1">
                      SHA-256 المحسوب فعلياً من القرص:
                    </div>
                    <div
                      dir="ltr"
                      className={`p-2.5 rounded font-mono text-[11px] break-all ${
                        dossier.integrity.actualDiskSha256
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
                          : 'bg-rose-50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200'
                      }`}
                    >
                      {dossier.integrity.actualDiskSha256 ||
                        'NULL — لم يُحسب لعدم وجود ملف أوزان داخل data/weights/'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 3 & 4: License & Inference Engine */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center gap-1.5 font-bold text-slate-900 dark:text-slate-100">
                    <Scale className="w-4 h-4" />
                    <span>3. الرخصة وإعادة التوزيع</span>
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">نسخة الرخصة:</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                        {dossier.licensing.license}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">التوزيع التجاري:</span>
                      <span
                        className={`font-semibold ${
                          dossier.licensing.commercialRedistribution
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-rose-700 dark:text-rose-400'
                        }`}
                      >
                        {dossier.licensing.commercialRedistribution ? 'مسموح' : 'مقيد'}
                      </span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-400 pt-1">
                      {dossier.licensing.redistributionNotes}
                    </p>
                  </div>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center gap-1.5 font-bold text-slate-900 dark:text-slate-100">
                    <Cpu className="w-4 h-4" />
                    <span>4. تفاصيل محرك الاستدلال</span>
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">المحرك المعتمد:</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                        {dossier.inferenceEngine.activeEngine}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">المحركات المدعومة:</span>
                      <span className="font-mono text-slate-700 dark:text-slate-300">
                        {dossier.inferenceEngine.supportedEngines.join(', ')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">المنفذ المحلي:</span>
                      <span dir="ltr" className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                        {dossier.inferenceEngine.loopbackEndpoint}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400 pt-1">
                      ثنائيات المضيف: llama-server=
                      {dossier.inferenceEngine.hostBinariesDetected.llamaServer || 'غير مثبت'} ·
                      llama-cli=
                      {dossier.inferenceEngine.hostBinariesDetected.llamaCli || 'غير مثبت'}
                    </div>
                    <p className="text-slate-600 dark:text-slate-400">
                      {dossier.inferenceEngine.runtimeNotesAr}
                    </p>
                  </div>
                </div>
              </div>

              {/* Section 5: Hardware & Host */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center gap-1.5 font-bold text-slate-900 dark:text-slate-100">
                  <HardDrive className="w-4 h-4" />
                  <span>5. متطلبات العتاد ومطابقة المشروع والمضيف</span>
                </div>
                <div className="p-4 space-y-2 text-slate-600 dark:text-slate-400">
                  <div>
                    <strong className="text-slate-800 dark:text-slate-200">RAM النظام:</strong>{' '}
                    {dossier.hardware.minRamGb} GB حد أدنى / {dossier.hardware.recommendedRamGb} GB
                    موصى به — <strong className="text-slate-800 dark:text-slate-200">GPU:</strong>{' '}
                    {dossier.hardware.gpuRequirements}
                  </div>
                  <div>{dossier.hardware.ramVsGpuGuidanceAr}</div>
                  {dossier.hardware.projectContext && (
                    <div className="pt-1 font-medium text-slate-800 dark:text-slate-200">
                      تقييم المشروع ({dossier.hardware.projectContext.projectName}):{' '}
                      {dossier.hardware.projectContext.compatibilitySummaryAr}
                    </div>
                  )}
                  <div className="text-[11px] font-mono text-slate-500">
                    Host Snapshot: {dossier.hardware.hostSnapshot.cpuCores} cores ·{' '}
                    {dossier.hardware.hostSnapshot.usedRamGb}/
                    {dossier.hardware.hostSnapshot.totalRamGb} GB RAM · Report SHA-256:{' '}
                    {dossier.reportDigestSha256.slice(0, 16)}...
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
