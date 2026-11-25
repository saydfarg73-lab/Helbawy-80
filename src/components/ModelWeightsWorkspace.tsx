import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Check,
  Cpu,
  Download,
  FileText,
  HardDrive,
  Plus,
  ShieldCheck,
  Smartphone,
  Upload,
} from 'lucide-react';
import type {
  ModelWeightEntry,
  Project,
  RuntimeEngine,
  UnifiedWeightsArchiveStatus,
} from '../types/helbawey';
import {
  ModelTechnicalReportModal,
  downloadModelTechnicalPdf,
} from './ModelTechnicalReportModal';

interface Props {
  project: Project;
  models: ModelWeightEntry[];
  onProjectUpdated: (updated: Project) => void;
  onModelsUpdated: (models: ModelWeightEntry[]) => void;
}

export function ModelWeightsWorkspace({
  project,
  models,
  onProjectUpdated,
  onModelsUpdated,
}: Props) {
  const [sizeFilter, setSizeFilter] = useState<'all' | 'small' | 'medium' | 'large'>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newParams, setNewParams] = useState('1.5B');
  const [newSizeGb, setNewSizeGb] = useState(1.1);
  const [newRamGb, setNewRamGb] = useState(4);
  const [newLicense, setNewLicense] = useState('Apache-2.0');
  const [newCommercial, setNewCommercial] = useState(true);
  const [uploadingModelId, setUploadingModelId] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [reportModalModelId, setReportModalModelId] = useState<string | null>(null);
  const [exportingPdfModelId, setExportingPdfModelId] = useState<string | null>(null);
  const [unifiedArchive, setUnifiedArchive] = useState<UnifiedWeightsArchiveStatus | null>(null);
  const [buildingUnified, setBuildingUnified] = useState(false);
  const [showForensicAudit, setShowForensicAudit] = useState(true);

  async function refreshUnifiedArchiveStatus(verifyExtract = false) {
    try {
      const res = await fetch(
        `/api/models/unified-archive/status${verifyExtract ? '?verifyExtract=1' : ''}`
      );
      if (res.ok) {
        setUnifiedArchive((await res.json()) as UnifiedWeightsArchiveStatus);
      }
    } catch {
      // Ignore transient status fetch failure
    }
  }

  useEffect(() => {
    void refreshUnifiedArchiveStatus(true);
  }, [models.length]);

  async function handleBuildUnifiedArchive() {
    setBuildingUnified(true);
    setUploadNotice(null);
    try {
      const res = await fetch('/api/models/unified-archive/build', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذر تخزين ملف اوزان المنصه.');
      const status = data as UnifiedWeightsArchiveStatus;
      setUnifiedArchive(status);
      setUploadNotice(
        `تم تخزين جميع أوزان وإعدادات المنصة في ملف واحد باسم "${status.fileName}" (${(status.bytes / 1024).toFixed(1)} KB) على المسار ${status.relativeDiskPath}.`
      );
    } catch (err) {
      setUploadNotice(err instanceof Error ? err.message : 'فشل تخزين ملف اوزان المنصه.');
    } finally {
      setBuildingUnified(false);
    }
  }

  function formatBytesReadable(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  async function handleExportPdf(modelId: string) {
    setExportingPdfModelId(modelId);
    try {
      await downloadModelTechnicalPdf(modelId, project.id);
    } catch (err) {
      setUploadNotice(err instanceof Error ? err.message : 'تعذر تصدير التقرير الفني PDF.');
    } finally {
      setExportingPdfModelId(null);
    }
  }

  const filteredModels = models.filter((m) =>
    sizeFilter === 'all' ? true : m.sizeTier === sizeFilter
  );

  async function handleAssignModel(model: ModelWeightEntry) {
    if (model.minRamGb > project.targetRamGb) return;
    if (!model.commercialRedistribution) return;

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

    const res = await fetch(`/api/projects/${project.id}`, {
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
    }
  }

  async function handleUpdateHardware(ramGb: number, gpuVramGb: number, runtime: RuntimeEngine) {
    const res = await fetch(`/api/projects/${project.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetRamGb: ramGb,
        targetGpuVramGb: gpuVramGb,
        runtimeEngine: runtime,
      }),
    });
    if (res.ok) {
      onProjectUpdated((await res.json()) as Project);
    }
  }

  async function handleRegisterModel() {
    if (!newName.trim()) return;
    const res = await fetch('/api/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newName.trim(),
        parameters: newParams,
        parametersBillions: parseFloat(newParams) || 1.5,
        sizeGb: newSizeGb,
        sizeTier: newSizeGb <= 1.5 ? 'small' : newSizeGb <= 3.5 ? 'medium' : 'large',
        ramRequiredGb: newRamGb,
        minRamGb: Math.max(1, Math.floor(newRamGb * 0.75)),
        license: newLicense,
        commercialRedistribution: newCommercial,
      }),
    });
    if (res.ok) {
      const created = (await res.json()) as ModelWeightEntry;
      onModelsUpdated([created, ...models]);
      setNewName('');
      setShowAddForm(false);
    }
  }

  async function handleUploadWeightShard(modelId: string, file: File | undefined) {
    if (!file) return;
    if (file.size > 28 * 1024 * 1024) {
      setUploadNotice(
        'حجم الملف يتجاوز حد الرفع المباشر عبر المتصفح (28 MB). للملفات متعددة الجيجابايت استخدم أداة تقسيم الشرائح أو سكريبت التحقق المرفق في الحزمة.'
      );
      return;
    }
    setUploadingModelId(modelId);
    setUploadNotice(null);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const resultStr = String(reader.result || '');
        const base64Data = resultStr.includes(',') ? resultStr.split(',')[1] : resultStr;
        const res = await fetch(`/api/models/${modelId}/upload-weight`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, base64Data }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'فشل رفع الملف');
        onModelsUpdated(models.map((m) => (m.id === modelId ? (data as ModelWeightEntry) : m)));
        setUploadNotice(`تم إرفاق ملف الأوزان "${file.name}" والتحقق من بصمته الرقمية SHA-256 بنجاح.`);
        void refreshUnifiedArchiveStatus();
      } catch (err) {
        setUploadNotice(err instanceof Error ? err.message : 'تعذر رفع ملف الأوزان');
      } finally {
        setUploadingModelId(null);
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-6">
      {/* Hardware Compatibility & Runtime Selector */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-8 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                منظومة الهلباوي لإدارة النماذج والأوزان (HELBAWEY MODEL WEIGHTS MANAGEMENT SYSTEM)
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                تطابق المنصة قدرات جهاز العميل مع حجم الأوزان والتكميم والترخيص التجاري لمنع تصدير نماذج لا تعمل على الجهاز المستهدف.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  الذاكرة المتاحة بجهاز العميل (RAM)
                </label>
                <select
                  value={project.targetRamGb}
                  onChange={(e) =>
                    handleUpdateHardware(
                      Number(e.target.value),
                      project.targetGpuVramGb,
                      project.runtimeEngine
                    )
                  }
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono tabular-nums"
                >
                  <option value={2}>2 GB RAM (أجهزة محدودة / جوال)</option>
                  <option value={4}>4 GB RAM (حاسوب مكتبي قياسي)</option>
                  <option value={8}>8 GB RAM (محطة عمل متوسطة)</option>
                  <option value={16}>16 GB RAM (خادم شركة متوسط)</option>
                  <option value={32}>32 GB RAM (خادم مؤسسي متقدم)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  مسرّع الرسوميات (GPU VRAM)
                </label>
                <select
                  value={project.targetGpuVramGb}
                  onChange={(e) =>
                    handleUpdateHardware(
                      project.targetRamGb,
                      Number(e.target.value),
                      project.runtimeEngine
                    )
                  }
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono tabular-nums"
                >
                  <option value={0}>CPU فقط (0 GB VRAM)</option>
                  <option value={4}>4 GB VRAM (GPU)</option>
                  <option value={8}>8 GB VRAM (GPU)</option>
                  <option value={16}>16+ GB VRAM (GPU)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  محرك الاستدلال المحلي المعتمد
                </label>
                <select
                  value={project.runtimeEngine}
                  onChange={(e) =>
                    handleUpdateHardware(
                      project.targetRamGb,
                      project.targetGpuVramGb,
                      e.target.value as RuntimeEngine
                    )
                  }
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono"
                >
                  <option value="llama.cpp">llama.cpp (CPU/CUDA/Metal)</option>
                  <option value="ONNX Runtime">ONNX Runtime</option>
                  <option value="Transformers">Transformers Local</option>
                  <option value="Android-NNAPI">Android-NNAPI</option>
                </select>
              </div>
            </div>
          </div>

          <div className="lg:col-span-4">
            <div className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 aspect-video relative">
              <img
                src="/src/assets/images/factory_hardware_rack_1795320349900.jpg"
                alt="وحدة الحوسبة المحلية المستقلة لمنصة الهلباوي"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Unified Single-File Weights Archive ("اوزان المنصه.zip") & Phone Download */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <div className="flex items-center gap-2">
              <Archive className="w-4 h-4 text-slate-700 dark:text-slate-300 shrink-0" />
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                تخزين جميع أوزان المنصة في ملف واحد: <span className="font-mono">اوزان المنصه.zip</span>
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              يجمع كافة ملفات وإعدادات النماذج المسجلة، وشرائح الأوزان الثنائية المرفقة على القرص، ومحولات LoRA/QLoRA، وبصمات SHA-256 في حزمة واحدة جاهزة للتخزين الدائم أو التنزيل المباشر إلى مجلد داونلود الهاتف.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleBuildUnifiedArchive}
              disabled={buildingUnified}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <HardDrive className="w-3.5 h-3.5 shrink-0" />
              <span>
                {buildingUnified
                  ? 'جاري التخزين...'
                  : unifiedArchive?.existsOnDisk
                    ? 'تحديث وتخزين ملف اوزان المنصه'
                    : 'تخزين في ملف اوزان المنصه'}
              </span>
            </button>

            <a
              href="/api/models/unified-archive/download?rebuild=1"
              download="اوزان المنصه.zip"
              onClick={() => {
                setTimeout(() => void refreshUnifiedArchiveStatus(), 900);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold hover:bg-slate-800 dark:hover:bg-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Smartphone className="w-3.5 h-3.5 shrink-0" />
              <span>تصدير إلى داونلود الهاتف (اوزان المنصه.zip)</span>
            </a>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div className="text-[11px] text-slate-500">حالة الملف الموحد</div>
            <div
              className={`text-xs font-bold mt-1 ${
                unifiedArchive?.existsOnDisk
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-amber-700 dark:text-amber-400'
              }`}
            >
              {unifiedArchive?.existsOnDisk ? 'محفوظ على القرص وجاهز' : 'جاهز للتخزين والتصدير'}
            </div>
            <div className="text-[11px] font-mono text-slate-500 mt-0.5 truncate">
              {unifiedArchive?.relativeDiskPath || 'data/unified-weights/اوزان المنصه.zip'}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div className="text-[11px] text-slate-500">النماذج والشرائح الثنائية</div>
            <div className="text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
              {unifiedArchive?.registeredModelsCount ?? models.length} نموذج ·{' '}
              {unifiedArchive?.attachedBinaryShardsCount ?? 0} شريحة مرفقة
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500 mt-0.5">
              حجم الشرائح: {formatBytesReadable(unifiedArchive?.attachedBinaryShardsBytes ?? 0)}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div className="text-[11px] text-slate-500">حجم الأرشيف الموحد</div>
            <div className="text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
              {unifiedArchive?.existsOnDisk ? formatBytesReadable(unifiedArchive.bytes) : 'لم يُبنَ بعد'}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500 mt-0.5">
              {unifiedArchive?.entriesCount
                ? `${unifiedArchive.entriesCount} ملف داخلي · ${unifiedArchive.fineTuneAdaptersCount} محول LoRA`
                : `${unifiedArchive?.fineTuneAdaptersCount ?? 0} محول LoRA جاهز للضم`}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div className="text-[11px] text-slate-500">بصمة الأرشيف (SHA-256)</div>
            <div className="text-[11px] font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1 break-all">
              {unifiedArchive?.sha256 ? `${unifiedArchive.sha256.slice(0, 24)}...` : 'تُحسب عند التخزين'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {unifiedArchive?.builtAt
                ? `آخر تحديث: ${new Date(unifiedArchive.builtAt).toLocaleTimeString('ar-EG')}`
                : 'لم يُحفظ على القرص بعد'}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">الحكم الهندسي للاستقلال:</span>
            <span
              className={`font-mono font-bold ${
                unifiedArchive?.overallVerdict === 'PASS'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : unifiedArchive?.overallVerdict === 'PARTIAL'
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-rose-700 dark:text-rose-400'
              }`}
            >
              {unifiedArchive?.overallVerdict || 'BLOCKED'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowForensicAudit((v) => !v)}
            className="text-xs font-medium text-slate-700 dark:text-slate-300 underline underline-offset-4 cursor-pointer whitespace-nowrap shrink-0"
          >
            {showForensicAudit
              ? 'إخفاء جدول الجرد والاختبارات السبعة'
              : 'عرض جدول الجرد الهندسي والاختبارات السبعة'}
          </button>
        </div>

        <div
          className={`p-3 rounded-lg border text-xs ${
            unifiedArchive?.overallVerdict === 'PASS'
              ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200'
              : 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200'
          }`}
        >
          {unifiedArchive?.overallVerdict === 'PASS' ? (
            <span>
              <strong>PASS:</strong> أوزان ومحركات تشغيل حقيقية متوفرة وتم إثبات الاستخراج والتوليد المحلي المستقل داخل{' '}
              <code className="font-mono">اوزان المنصه.zip</code>.
            </span>
          ) : (
            <div className="space-y-1">
              <div>
                <strong>{unifiedArchive?.overallVerdict || 'BLOCKED'}:</strong>{' '}
                الأرشيف <code className="font-mono">اوزان المنصه.zip</code> يوثق كافة المكونات الحقيقية المتوفرة حالياً، ولكن التشغيل العصبي المستقل محتجز للنواقص التالية:
              </div>
              {unifiedArchive?.missingRequirementsAr?.length ? (
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  {unifiedArchive.missingRequirementsAr.map((reqText, i) => (
                    <li key={i}>{reqText}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </div>

        {showForensicAudit && unifiedArchive && (
          <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
              <table className="w-full text-right text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                    <th className="py-2.5 px-3 font-semibold whitespace-nowrap">المكوّن</th>
                    <th className="py-2.5 px-3 font-semibold">الموجود فعليًا</th>
                    <th className="py-2.5 px-3 font-semibold whitespace-nowrap">الحجم</th>
                    <th className="py-2.5 px-3 font-semibold">SHA-256</th>
                    <th className="py-2.5 px-3 font-semibold whitespace-nowrap">حالة التحقق</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {unifiedArchive.forensicComponents.map((row) => (
                    <tr key={row.key} className="bg-white dark:bg-slate-900">
                      <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {row.componentAr}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 leading-relaxed">
                        {row.actualFoundAr}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {row.sizeLabel}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 break-all max-w-[220px]">
                        {row.sha256}
                      </td>
                      <td
                        className={`py-2.5 px-3 font-mono font-bold whitespace-nowrap ${
                          row.status === 'PASS'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : row.status === 'PARTIAL'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-rose-700 dark:text-rose-400'
                        }`}
                      >
                        {row.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                نتائج الاختبارات الحقيقية السبعة قبل الاعتماد:
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                {unifiedArchive.verificationTests.map((t) => (
                  <div
                    key={t.id}
                    className="p-2.5 bg-white dark:bg-slate-900 flex flex-wrap items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-0.5 max-w-3xl">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        <span className="font-mono tabular-nums text-slate-500">{t.id}. </span>
                        {t.titleAr}
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-400">
                        {t.evidenceAr}
                      </div>
                    </div>
                    <span
                      className={`font-mono font-bold text-xs whitespace-nowrap shrink-0 ${
                        t.status === 'PASS'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : t.status === 'PARTIAL'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Model Library Filters & Registration */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {(
              [
                { id: 'all', label: `كل النماذج (${models.length})` },
                { id: 'small', label: 'صغيرة (CPU/Edge)' },
                { id: 'medium', label: 'متوسطة (8GB+)' },
                { id: 'large', label: 'كبيرة (خوادم)' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSizeFilter(f.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer ${
                  sizeFilter === f.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleExportPdf(project.selectedModelId)}
              disabled={exportingPdfModelId === project.selectedModelId}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium hover:bg-slate-800 dark:hover:bg-slate-200 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>
                {exportingPdfModelId === project.selectedModelId
                  ? 'جاري توليد PDF...'
                  : 'تصدير تقرير النموذج المعتمد (PDF)'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowAddForm(!showAddForm)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>استيراد / تسجيل نموذج مفتوح الأوزان</span>
            </button>
          </div>
        </div>

        {uploadNotice && (
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300">
            {uploadNotice}
          </div>
        )}

        {showAddForm && (
          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-6 gap-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="اسم النموذج (مثال: Qwen2.5-Coder-1.5B-Q4)"
              className="sm:col-span-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs"
            />
            <input
              type="text"
              value={newParams}
              onChange={(e) => setNewParams(e.target.value)}
              placeholder="المعاملات (1.5B)"
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-mono"
            />
            <input
              type="number"
              step="0.1"
              value={newSizeGb}
              onChange={(e) => setNewSizeGb(Number(e.target.value))}
              placeholder="الحجم GB"
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-mono"
            />
            <input
              type="text"
              value={newLicense}
              onChange={(e) => setNewLicense(e.target.value)}
              placeholder="الترخيص (Apache-2.0)"
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs"
            />
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-xs text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={newCommercial}
                  onChange={(e) => setNewCommercial(e.target.checked)}
                />
                <span>توزيع تجاري</span>
              </label>
              <button
                type="button"
                onClick={handleRegisterModel}
                className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium cursor-pointer"
              >
                حفظ
              </button>
            </div>
          </div>
        )}

        {/* Models Catalog */}
        <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
          {filteredModels.map((model) => {
            const isSelected = project.selectedModelId === model.id;
            const hardwareFits = project.targetRamGb >= model.minRamGb;
            return (
              <div
                key={model.id}
                className={`p-4 transition-colors ${
                  isSelected ? 'bg-slate-50 dark:bg-slate-950/70' : 'bg-white dark:bg-slate-900'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1.5 max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="text-sm font-bold font-mono text-slate-900 dark:text-slate-100">
                        {model.name}
                      </h3>
                      <span className="text-xs text-slate-500 font-mono tabular-nums">
                        {model.parameters} · {model.sizeGb} GB · {model.format} · {model.quantization}
                      </span>
                      {model.uploadedFileName && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>شريحة مرفقة ({model.uploadedFileName})</span>
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-xs">
                      <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                        <HardDrive className="w-3.5 h-3.5 shrink-0" />
                        <span className="font-mono tabular-nums">
                          الذاكرة: {model.minRamGb}–{model.ramRequiredGb} GB
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                        <Cpu className="w-3.5 h-3.5 shrink-0" />
                        <span className="font-mono tabular-nums">
                          السرعة: {model.measuredTokensPerSec} tok/s
                        </span>
                      </div>
                      <div className="text-slate-600 dark:text-slate-400 font-mono tabular-nums">
                        السياق: {model.contextLength.toLocaleString('en-US')}
                      </div>
                      <div
                        className={`font-medium ${
                          model.commercialRedistribution
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-rose-700 dark:text-rose-400'
                        }`}
                      >
                        الترخيص: {model.license}
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      <strong className="text-slate-800 dark:text-slate-200">الدقة والقيود:</strong>{' '}
                      {model.postQuantAccuracy} — {model.knownLimits}
                    </p>
                    <div className="text-[11px] font-mono text-slate-500 break-all">
                      SHA-256: {model.sha256} · {model.redistributionNotes}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {!hardwareFits && (
                      <div className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>يتجاوز ذاكرة الجهاز ({project.targetRamGb} GB)</span>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setReportModalModelId(model.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>التقرير الفني</span>
                      </button>

                      <button
                        type="button"
                        disabled={exportingPdfModelId === model.id}
                        onClick={() => handleExportPdf(model.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{exportingPdfModelId === model.id ? 'توليد...' : 'PDF'}</span>
                      </button>

                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        <span>
                          {uploadingModelId === model.id ? 'جاري الرفع...' : 'إرفاق شريحة وزن محلية'}
                        </span>
                        <input
                          type="file"
                          className="sr-only"
                          accept=".gguf,.bin,.onnx,.safetensors,.json"
                          onChange={(e) => handleUploadWeightShard(model.id, e.target.files?.[0])}
                        />
                      </label>

                      <button
                        type="button"
                        disabled={!hardwareFits || !model.commercialRedistribution || isSelected}
                        onClick={() => handleAssignModel(model)}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-emerald-700 text-white'
                            : 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                        <span>{isSelected ? 'النموذج المعتمد للتصدير' : 'اعتماد في الحزمة'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {reportModalModelId && (
        <ModelTechnicalReportModal
          modelId={reportModalModelId}
          projectId={project.id}
          onClose={() => setReportModalModelId(null)}
        />
      )}
    </div>
  );
}
