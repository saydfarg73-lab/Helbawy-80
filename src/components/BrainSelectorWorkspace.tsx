import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeftRight,
  BrainCircuit,
  Check,
  Copy,
  Download,
  GraduationCap,
  Loader2,
  MessageCircle,
  Sparkles,
} from 'lucide-react';
import type {
  BrainCompareResponse,
  BrainCompareSideResult,
  BrainOptionProfile,
  PlatformBrainId,
  Project,
} from '../types/helbawey';
import { ChatMarkdownContent, downloadBlobFile, stripMarkdownToPlainText } from './ChatMarkdownContent';
import { resilientFetchJson, resilientFetchResponse } from '../utils/resilientFetch';

interface Props {
  activeProject?: Project;
  activeBrain: PlatformBrainId;
  onBrainSelected: (brainId: PlatformBrainId) => void;
  onOpenChatWithBrain: (brainId: PlatformBrainId) => void;
  onOpenTrainingOffice?: (brainId: PlatformBrainId) => void;
}

const COMPARISON_BENCHMARK_PROMPTS = [
  'أمامنا قرار استراتيجي لتوسيع نظام ذكاء اصطناعي مؤسسي عبر 3 دول عربية وأوروبية: حلّل التحدي هندسياً (الأمن والخصوصية)، وقانونياً (PDPL و GDPR و EU AI Act)، ومالياً (NPV و TCO)، وحدّد نقاط الفشل الخفية وخطوة التنفيذ الحاسمة.',
  'شركة مقاولات كبرى واجهت تأخيراً في التوريد بسبب اضطراب شحن دولي في عقد يتضمن شرط تحكيم ICC: ما التكييف القانوني لقوة قاهرة في القانون المصري والسعودي واتفاقية فيينا CISG، وما خطة التفاوض لحماية السيولة المالية؟',
  'عند تصميم محرك بحث ومحادثة مؤسسي على خادم بذاكرة 8 GB RAM بدون GPU: أي معمارية تختار بين التضمين المتجهي وتجزئة النصوص والأمان التشفيري للبيانات؟ واذكر المخاطر الخفية.',
  'قدّم رؤية رشاد قيادية متكاملة حول كيفية بناء ميزة تنافسية مستدامة لمصنع برمجيات ذكية في ظل تسارع النماذج المفتوحة المصدر.',
];

export function BrainSelectorWorkspace({
  activeProject,
  activeBrain,
  onBrainSelected,
  onOpenChatWithBrain,
  onOpenTrainingOffice,
}: Props) {
  const [profiles, setProfiles] = useState<BrainOptionProfile[]>([]);
  const [memoryCount, setMemoryCount] = useState(0);
  const [datasetSamplesCount, setDatasetSamplesCount] = useState(0);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [switchingId, setSwitchingId] = useState<PlatformBrainId | null>(null);

  const [prompt, setPrompt] = useState(COMPARISON_BENCHMARK_PROMPTS[0]);
  const [includeContext, setIncludeContext] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [compareResult, setCompareResult] = useState<BrainCompareResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    resilientFetchJson<{
      activeBrain: PlatformBrainId;
      profiles: BrainOptionProfile[];
      memoryCount: number;
      datasetSamplesCount: number;
    }>('/api/brain/config')
      .then((cfg) => {
        if (!active) return;
        setProfiles(Array.isArray(cfg.profiles) ? cfg.profiles : []);
        setMemoryCount(cfg.memoryCount || 0);
        setDatasetSamplesCount(cfg.datasetSamplesCount || 0);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'تعذر تحميل إعدادات العقل.');
      })
      .finally(() => {
        if (active) setLoadingConfig(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleActivateBrain(brainId: PlatformBrainId, openChatAfter = false) {
    if (switchingId) return;
    setSwitchingId(brainId);
    setError(null);
    try {
      await resilientFetchJson<{ activeBrain?: PlatformBrainId }>('/api/brain/select', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brainId }),
      });
      onBrainSelected(brainId);
      if (openChatAfter) {
        onOpenChatWithBrain(brainId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ اختيار العقل.');
    } finally {
      setSwitchingId(null);
    }
  }

  async function handleRunComparison() {
    const trimmed = prompt.trim();
    if (!trimmed || comparing) return;
    setComparing(true);
    setError(null);
    try {
      const payload = await resilientFetchJson<BrainCompareResponse>('/api/brain/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeoutMs: 110000,
        body: JSON.stringify({
          prompt: trimmed,
          projectId: activeProject?.id,
          includeContext,
        }),
      });
      setCompareResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إتمام المقارنة بين العقلين.');
    } finally {
      setComparing(false);
    }
  }

  function handleCopyText(key: string, text: string) {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1600);
  }

  async function handleExportSidePdf(side: BrainCompareSideResult, originalPrompt: string) {
    setExportingPdf(side.brainId);
    setError(null);
    try {
      const bodyMd = `### السؤال / المعضلة المطروحة\n\n${originalPrompt}\n\n---\n\n### مخرج ${side.brainLabelAr}\n\n${side.outputText}`;
      const res = await resilientFetchResponse('/api/platform-chat/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `مقارنة العقول — ${side.brainLabelAr}`,
          content: bodyMd,
          createdAt: compareResult?.comparedAt,
          projectName: activeProject?.name,
        }),
      });
      if (!res.ok) {
        const p = await res.json().catch(() => ({}));
        throw new Error(p.error || 'تعذر تصدير ملف PDF.');
      }
      const blob = await res.blob();
      downloadBlobFile(blob, `brain-${side.brainId}-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تصدير PDF.');
    } finally {
      setExportingPdf(null);
    }
  }

  const orderedProfiles =
    profiles.length > 0
      ? profiles
      : [
          {
            id: 'attia-advisor' as PlatformBrainId,
            titleAr: 'عقل المستشار عطيه الهلباوى المستقبل',
            subtitleAr: 'عقل الرشاد والتحليل الشامل عابر التخصصات والذاكرة الحديدية',
            modelId: 'gemini-4-hydrogen',
            thinkingLevel: 'HIGH',
            methodologyAr:
              'المبادئ الأولى + التركيب بين 7 تخصصات + الفحص العكسي + الذاكرة الحديدية الدائمة.',
            strengthsAr: [],
            usesIroncladMemory: true,
            usesLegalAndPolymathSynthesis: true,
          },
          {
            id: 'gemini-standard' as PlatformBrainId,
            titleAr: 'عقل جيميني القياسي',
            subtitleAr: 'النموذج المرجعي المباشر للاستجابات العامة السريعة والمقارنة الموضوعية',
            modelId: 'gemini-4-hydrogen',
            thinkingLevel: 'LOW',
            methodologyAr: 'استجابة مباشرة دون مناهج التقطير أو الذاكرة الحديدية.',
            strengthsAr: [],
            usesIroncladMemory: false,
            usesLegalAndPolymathSynthesis: false,
          },
        ];

  return (
    <div className="space-y-6">
      {/* Workspace Header */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>توجيه الذكاء المركزي للمنصة</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                قواعد الذاكرة الحديدية: {memoryCount}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                عينات منهج الرشاد SFT: {datasetSamplesCount}
              </span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              وحدة اختيار العقل — مقارنة وتفعيل العقل الاستشاري مقابل عقل جيميني
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              اختر العقل الذي تقود به محادثات المنصة وتحليلاتها: <strong>عقل المستشار عطيه الهلباوى المستقبل</strong>{' '}
              (بمنهجية الرشاد الشاملة والذاكرة الحديدية والاستدلال العميق)، أو <strong>عقل جيميني القياسي</strong>{' '}
              (كنقطة أساس سريعة)، مع إمكانية تشغيل مقارنة حية متزامنة لنفس السؤال حتى يتجلى الفارق عملياً.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onOpenTrainingOffice && (
              <button
                type="button"
                onClick={() => onOpenTrainingOffice(activeBrain)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                <GraduationCap className="w-4 h-4 shrink-0" />
                <span>تطوير العقل وتدريبي</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenChatWithBrain(activeBrain)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold hover:bg-slate-800 dark:hover:bg-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <MessageCircle className="w-3.5 h-3.5 shrink-0" />
              <span>فتح المحادثة بالعقل النشط</span>
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-xs text-rose-800 dark:text-rose-200 flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Dual Brain Selection Cards */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        {loadingConfig && profiles.length === 0 ? (
          <>
            <div className="h-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
            <div className="h-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
          </>
        ) : (
          orderedProfiles.map((profile) => {
            const isSelected = activeBrain === profile.id;
            const isAttia = profile.id === 'attia-advisor';
            const isBusy = switchingId === profile.id;

            return (
              <div
                key={profile.id}
                className={`rounded-xl border p-5 flex flex-col justify-between gap-5 transition-colors ${
                  isSelected
                    ? isAttia
                      ? 'border-emerald-600 dark:border-emerald-500 bg-white dark:bg-slate-900'
                      : 'border-slate-900 dark:border-slate-100 bg-white dark:bg-slate-900'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                }`}
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="font-mono">{profile.modelId}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">Thinking: {profile.thinkingLevel}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {isSelected ? 'العقل النشط حالياً' : 'متاح للتفعيل'}
                        </span>
                      </div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        {isAttia ? (
                          <BrainCircuit className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                        ) : (
                          <Sparkles className="w-4 h-4 text-slate-600 dark:text-slate-300 shrink-0" />
                        )}
                        <span>{profile.titleAr}</span>
                      </h2>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        {profile.subtitleAr}
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed pt-3 border-t border-slate-100 dark:border-slate-800">
                    {profile.methodologyAr}
                  </p>

                  {profile.strengthsAr.length > 0 && (
                    <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                      {profile.strengthsAr.map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <span className="text-slate-400 select-none">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={Boolean(switchingId)}
                    onClick={() => void handleActivateBrain(profile.id, false)}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 transition-colors ${
                      isSelected
                        ? isAttia
                          ? 'bg-emerald-700 text-white'
                          : 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                        : 'border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {isBusy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    ) : isSelected ? (
                      <Check className="w-3.5 h-3.5 shrink-0" />
                    ) : null}
                    <span>
                      {isSelected ? 'مُفعّل الآن كعقل المنصة' : `اختيار وتفعيل ${profile.titleAr}`}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={Boolean(switchingId)}
                    onClick={() => void handleActivateBrain(profile.id, true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>تفعيل وبدء المحادثة</span>
                  </button>

                  {onOpenTrainingOffice && (
                    <button
                      type="button"
                      onClick={() => onOpenTrainingOffice(profile.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                    >
                      <GraduationCap className="w-3.5 h-3.5 shrink-0" />
                      <span>تطوير العقل وتدريبي</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* Live Side-by-Side Brain Comparison Lab */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-slate-700 dark:text-slate-300 shrink-0" />
              <span>مختبر المقارنة الحية — ليتجلى الفارق عملياً</span>
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              أرسل نفس السؤال أو المعضلة في التوقيت نفسه إلى <strong>عقل المستشار عطيه الهلباوى المستقبل</strong>{' '}
              وإلى <strong>عقل جيميني القياسي</strong> وقارن العمق، التأصيل، التنسيق، وزمن الاستجابة الفعلي.
            </p>
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none whitespace-nowrap">
            <input
              type="checkbox"
              checked={includeContext}
              onChange={(e) => setIncludeContext(e.target.checked)}
              className="rounded border-slate-300"
            />
            <span>تضمين سياق المشروع النشط ({activeProject?.name || 'الافتراضي'})</span>
          </label>
        </div>

        {/* Benchmark Quick Prompts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {COMPARISON_BENCHMARK_PROMPTS.map((sample, idx) => (
            <button
              key={sample}
              type="button"
              disabled={comparing}
              onClick={() => setPrompt(sample)}
              className={`p-3 rounded-lg border text-right text-xs leading-relaxed transition-colors cursor-pointer disabled:opacity-50 ${
                prompt.trim() === sample
                  ? 'border-slate-900 dark:border-slate-100 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-medium'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-600'
              }`}
            >
              <span className="font-mono text-[11px] text-slate-400 ml-1.5">0{idx + 1}.</span>
              {sample}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            disabled={comparing}
            placeholder="اكتب أي مسألة هندسية أو قانونية أو اقتصادية أو استراتيجية للمقارنة بين العقلين..."
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-400"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              يُستدعى العقلان على الخادم تباعاً عبر <code className="font-mono">@google/genai</code>{' '}
              لقياس زمن واستدلال كل عقل بدقة دون نصوص مصطنعة.
            </span>

            <button
              type="button"
              disabled={comparing || !prompt.trim()}
              onClick={() => void handleRunComparison()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 transition-colors"
            >
              {comparing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span>جاري تشغيل العقلين للمقارنة...</span>
                </>
              ) : (
                <>
                  <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
                  <span>تشغيل المقارنة الحية (عقل المستشار مقابل جيميني)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Live Side-by-Side Comparison Output */}
        {compareResult && (
          <div className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
              <span>
                نتيجة المقارنة الحية بتاريخ{' '}
                <span className="font-mono tabular-nums">
                  {new Date(compareResult.comparedAt).toLocaleString('ar-EG')}
                </span>
              </span>
              <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums text-[11px]">
                <span>
                  عقل المستشار: {compareResult.attiaAdvisor.wordCount} كلمة /{' '}
                  {compareResult.attiaAdvisor.elapsedMs} ms
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  عقل جيميني: {compareResult.geminiStandard.wordCount} كلمة /{' '}
                  {compareResult.geminiStandard.elapsedMs} ms
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
              {[compareResult.attiaAdvisor, compareResult.geminiStandard].map((side) => {
                const isAttia = side.brainId === 'attia-advisor';
                return (
                  <div
                    key={side.brainId}
                    className={`rounded-xl border p-4 flex flex-col justify-between gap-4 ${
                      isAttia
                        ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/15'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="pb-3 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                            {isAttia ? (
                              <BrainCircuit className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                            ) : (
                              <Sparkles className="w-4 h-4 text-slate-600 dark:text-slate-400 shrink-0" />
                            )}
                            <span>{side.brainLabelAr}</span>
                          </h3>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 font-mono tabular-nums">
                            <span>Thinking: {side.thinkingLevel}</span>
                            <span aria-hidden="true">·</span>
                            <span>{side.elapsedMs} ms</span>
                            <span aria-hidden="true">·</span>
                            <span>{side.wordCount} كلمة</span>
                            <span aria-hidden="true">·</span>
                            <span>{side.headingsCount} عناوين</span>
                            <span aria-hidden="true">·</span>
                            <span>ذاكرة مسترجعة: {side.memoryRulesInjected}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              handleCopyText(side.brainId, stripMarkdownToPlainText(side.outputText))
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            {copiedKey === side.brainId ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                            <span>{copiedKey === side.brainId ? 'تم النسخ' : 'نسخ'}</span>
                          </button>

                          <button
                            type="button"
                            disabled={exportingPdf === side.brainId}
                            onClick={() => void handleExportSidePdf(side, compareResult.prompt)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                          >
                            {exportingPdf === side.brainId ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Download className="w-3 h-3" />
                            )}
                            <span>PDF</span>
                          </button>
                        </div>
                      </div>

                      <div className="text-xs leading-relaxed text-slate-800 dark:text-slate-200 max-h-[540px] overflow-y-auto pl-1">
                        <ChatMarkdownContent content={side.outputText} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Architectural Comparison Table */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
          جدول الفروق المعمارية بين العقلين داخل المنصة
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <th className="py-2.5 px-3 font-semibold">المحور الهندسي</th>
                <th className="py-2.5 px-3 font-semibold">عقل المستشار عطيه الهلباوى المستقبل</th>
                <th className="py-2.5 px-3 font-semibold">عقل جيميني القياسي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-950/60">
                <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200">
                  عمق الاستدلال والتفكير
                </td>
                <td className="py-2.5 px-3 text-emerald-800 dark:text-emerald-300 font-medium">
                  ThinkingLevel.HIGH + تفكيك المبادئ الأولى + اختبار الفرضيات العكسي
                </td>
                <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                  ThinkingLevel.LOW · استجابة قياسية سريعة ومباشرة
                </td>
              </tr>
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-950/60">
                <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200">
                  الذاكرة الحديدية المستمرة
                </td>
                <td className="py-2.5 px-3 text-slate-800 dark:text-slate-200">
                  استرجاع ذكي للقواعد المثبتة، المنهج الموسوعي، والسوابق across الجلسات
                </td>
                <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                  غير مفعّلة (سياق محادثة قياسي فقط دون قواعد ذاكرة متخصصة)
                </td>
              </tr>
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-950/60">
                <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200">
                  التركيب القانوني والاقتصادي والهندسي
                </td>
                <td className="py-2.5 px-3 text-slate-800 dark:text-slate-200">
                  يدمج الأنظمة المحلية والدولية (CISG/ICC/GDPR/AI Act) مع الأثر المالي والأمني
                </td>
                <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                  تحليل عام دون إلزام بالربط المتزامن بين التخصصات
                </td>
              </tr>
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-950/60">
                <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200">
                  صياغة الرشاد والقرار التنفيذي
                </td>
                <td className="py-2.5 px-3 text-slate-800 dark:text-slate-200">
                  توصيات مرقمة ومصفوفة مخاطر وبدائل عملية جاهزة للطباعة والتصدير PDF/Word
                </td>
                <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                  ملخص إرشادي عام مختصر
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
