import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Briefcase,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FilePlus2,
  FileText,
  GraduationCap,
  Lock,
  Play,
  Plus,
  Scale,
  Search,
  ShieldCheck,
  Users,
  XCircle,
} from 'lucide-react';
import type {
  ContributorRightsEntry,
  LegalCaseRecord,
  LegalDraftMode,
  LegalJurisdictionScope,
  LegalMemoArtifact,
  LegalMindAcceptanceTestResult,
  LegalMindOverviewSnapshot,
  LegalSourceEntry,
  PlatformBrainId,
} from '../types/helbawey';
import { ChatMarkdownContent, downloadBlobFile } from './ChatMarkdownContent';

interface Props {
  onOpenTrainingOffice?: (brainId: PlatformBrainId) => void;
  onOpenSelfHealing?: () => void;
}

type LegalTab = 'cases' | 'sources' | 'roadmap' | 'contributors' | 'tests';

const MODE_OPTIONS: { id: LegalDraftMode; labelAr: string }[] = [
  { id: 'full-analysis', labelAr: 'تحليل شامل + مصفوفة مخاطر' },
  { id: 'defense-memo', labelAr: 'صياغة مذكرة دفاع قضائية' },
  { id: 'claim-statement', labelAr: 'صياغة لائحة دعوى / طلب افتتاحي' },
  { id: 'arbitration-request', labelAr: 'طلب إحالة للتحكيم الدولي' },
  { id: 'contract-audit', labelAr: 'مراجعة عقد وكشف الثغرات' },
];

const JURISDICTION_LABELS: Record<LegalJurisdictionScope, string> = {
  'global-comparative': 'شامل: محلي + دولي + عالمي مقارن',
  'saudi-gcc': 'الأنظمة السعودية والخليجية',
  'egypt-arab': 'القانون المصري والعربي المقارن',
  'international-arbitration': 'القانون الدولي والتحكيم التجاري',
  'eu-us-uk-regulatory': 'التشريعات العالمية (GDPR / AI Act / US-UK)',
};

function verdictBadgeClass(status: string): string {
  switch (status) {
    case 'COMPLETED':
    case 'PASS':
    case 'READY':
      return 'bg-emerald-950/70 text-emerald-300 border-emerald-500/40';
    case 'IN_PROGRESS':
    case 'PENDING':
      return 'bg-amber-950/70 text-amber-300 border-amber-500/40';
    case 'BLOCKED':
    case 'FAIL':
      return 'bg-rose-950/70 text-rose-300 border-rose-500/40';
    default:
      return 'bg-slate-800 text-slate-300 border-slate-700';
  }
}

export function LegalMindCenterWorkspace({
  onOpenTrainingOffice,
  onOpenSelfHealing,
}: Props) {
  const [overview, setOverview] = useState<LegalMindOverviewSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<LegalTab>('cases');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Selected case & memo
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const [selectedMemoId, setSelectedMemoId] = useState<string>('');
  const [draftMode, setDraftMode] = useState<LegalDraftMode>('defense-memo');
  const [extraInstr, setExtraInstr] = useState('');

  // New case form
  const [showNewCaseForm, setShowNewCaseForm] = useState(false);
  const [newCaseTitle, setNewCaseTitle] = useState('');
  const [newCaseParties, setNewCaseParties] = useState('');
  const [newCaseScope, setNewCaseScope] = useState<LegalJurisdictionScope>('global-comparative');
  const [newCaseType, setNewCaseType] = useState<LegalCaseRecord['caseType']>('arbitration');
  const [newCaseClaim, setNewCaseClaim] = useState('');
  const [newCaseDeadline, setNewCaseDeadline] = useState('');
  const [newCaseFacts, setNewCaseFacts] = useState('');
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocContent, setNewDocContent] = useState('');

  // Attach doc to existing case
  const [attachTitle, setAttachTitle] = useState('');
  const [attachContent, setAttachContent] = useState('');

  // Sources offline search + add source
  const [sourceQuery, setSourceQuery] = useState('');
  const [sourceSearchResults, setSourceSearchResults] = useState<{
    hits: { docId: string; title: string; excerpt: string; score: number }[];
  } | null>(null);
  const [showAddSource, setShowAddSource] = useState(false);
  const [srcCode, setSrcCode] = useState('');
  const [srcTitle, setSrcTitle] = useState('');
  const [srcAuth, setSrcAuth] = useState('');
  const [srcText, setSrcText] = useState('');

  // Add contributor rights
  const [contribName, setContribName] = useState('');
  const [contribRole, setContribRole] = useState('');
  const [contribType, setContribType] =
    useState<ContributorRightsEntry['contributionType']>('legal-knowledge');
  const [contribSummary, setContribSummary] = useState('');
  const [contribRights, setContribRights] = useState('');

  const loadOverview = useCallback(async () => {
    try {
      const res = await fetch('/api/legal-mind/overview');
      if (!res.ok) throw new Error('تعذر تحميل مركز العقل القانوني الدولي');
      const data = (await res.json()) as LegalMindOverviewSnapshot;
      setOverview(data);
      if (data.cases.length > 0) {
        setSelectedCaseId((prev) =>
          prev && data.cases.some((c) => c.id === prev) ? prev : data.cases[0].id
        );
      }
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'خطأ في تحميل البيانات',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const activeCase: LegalCaseRecord | undefined =
    overview?.cases.find((c) => c.id === selectedCaseId) || overview?.cases[0];

  const activeMemo: LegalMemoArtifact | undefined =
    activeCase?.memos.find((m) => m.id === selectedMemoId) || activeCase?.memos[0];

  const handleCreateCase = async () => {
    if (!newCaseTitle.trim() || !newCaseFacts.trim()) {
      setBanner({ type: 'err', text: 'أدخل عنوان القضية وملخص الوقائع.' });
      return;
    }
    setBusyKey('create-case');
    setBanner(null);
    try {
      const res = await fetch('/api/legal-mind/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titleAr: newCaseTitle,
          partiesAr: newCaseParties,
          jurisdictionScope: newCaseScope,
          caseType: newCaseType,
          claimValue: newCaseClaim,
          criticalDeadline: newCaseDeadline,
          factsSummaryAr: newCaseFacts,
          initialDocTitle: newDocTitle,
          initialDocContent: newDocContent,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'فشل إنشاء القضية');
      setOverview(json.overview);
      setSelectedCaseId(json.caseRecord.id);
      setShowNewCaseForm(false);
      setNewCaseTitle('');
      setNewCaseFacts('');
      setNewCaseParties('');
      setNewDocTitle('');
      setNewDocContent('');
      setBanner({
        type: 'ok',
        text: `تم فتح ملف القضية ${json.caseRecord.caseNumber} وتوثيقه ببصمة SHA-256.`,
      });
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'تعذر إنشاء القضية',
      });
    } finally {
      setBusyKey(null);
    }
  };

  const handleAttachDoc = async () => {
    if (!activeCase || !attachTitle.trim() || !attachContent.trim()) return;
    setBusyKey('attach-doc');
    setBanner(null);
    try {
      const res = await fetch(`/api/legal-mind/cases/${activeCase.id}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: attachTitle,
          docType: 'evidence',
          content: attachContent,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'تعذر إرفاق المستند');
      setOverview(json.overview);
      setAttachTitle('');
      setAttachContent('');
      setBanner({ type: 'ok', text: 'تم إرفاق المستند وفهرسته محلياً ببصمة SHA-256.' });
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'خطأ في إرفاق المستند',
      });
    } finally {
      setBusyKey(null);
    }
  };

  const handleAnalyzeCase = async () => {
    if (!activeCase) return;
    setBusyKey('analyze');
    setBanner(null);
    try {
      const res = await fetch(`/api/legal-mind/cases/${activeCase.id}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: draftMode,
          extraInstructions: extraInstr,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'تعذر تنفيذ التحليل القانوني');
      setOverview(json.overview);
      setSelectedMemoId(json.memo.id);
      setExtraInstr('');
      setBanner({
        type: 'ok',
        text: `أُنجز التحليل وصياغة المذكرة عبر ${json.memo.brainId}@${json.memo.brainVersion} (${json.memo.modelUsed}) مع ربط ${json.memo.citedSourceCodes.length} مرجع.`,
      });
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'فشل التحليل',
      });
    } finally {
      setBusyKey(null);
    }
  };

  const handleExportMemoPdf = async (memo: LegalMemoArtifact) => {
    setBusyKey(`pdf-${memo.id}`);
    try {
      const res = await fetch(`/api/legal-mind/memos/${memo.id}/export-pdf`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('تعذر تصدير PDF');
      const blob = await res.blob();
      downloadBlobFile(blob, `legal-memo-${memo.id}.pdf`);
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'فشل تصدير PDF',
      });
    } finally {
      setBusyKey(null);
    }
  };

  const handleSearchSources = async () => {
    if (!sourceQuery.trim()) {
      setSourceSearchResults(null);
      return;
    }
    setBusyKey('search-src');
    try {
      const res = await fetch('/api/legal-mind/sources/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sourceQuery, topK: 6 }),
      });
      const json = await res.json();
      setSourceSearchResults(json);
    } finally {
      setBusyKey(null);
    }
  };

  const handleAddSource = async () => {
    if (!srcCode.trim() || !srcTitle.trim() || !srcText.trim()) return;
    setBusyKey('add-src');
    setBanner(null);
    try {
      const res = await fetch('/api/legal-mind/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: srcCode,
          titleAr: srcTitle,
          authority: srcAuth || 'مرجع مضاف',
          keyArticlesSummaryAr: srcText.slice(0, 180),
          fullReferenceText: srcText,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'فشل إضافة المرجع');
      setOverview(json.overview);
      setSrcCode('');
      setSrcTitle('');
      setSrcAuth('');
      setSrcText('');
      setShowAddSource(false);
      setBanner({ type: 'ok', text: `تمت إضافة المرجع ${json.entry.code} وفهرسته محلياً.` });
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'تعذر إضافة المرجع',
      });
    } finally {
      setBusyKey(null);
    }
  };

  const handleAddContributor = async () => {
    if (!contribName.trim() || !contribRole.trim() || !contribRights.trim()) {
      setBanner({ type: 'err', text: 'أكمل اسم المساهم ودوره وبند الحقوق.' });
      return;
    }
    setBusyKey('add-contrib');
    setBanner(null);
    try {
      const res = await fetch('/api/legal-mind/contributors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nameAr: contribName,
          roleAr: contribRole,
          contributionType: contribType,
          contributionSummaryAr: contribSummary || contribRole,
          rightsClauseAr: contribRights,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'فشل تسجيل المساهم');
      setOverview(json.overview);
      setContribName('');
      setContribRole('');
      setContribSummary('');
      setContribRights('');
      setBanner({ type: 'ok', text: `تم توثيق حقوق "${json.entry.nameAr}" في ميثاق المنصة.` });
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'تعذر تسجيل المساهم',
      });
    } finally {
      setBusyKey(null);
    }
  };

  const handleDownloadBundle = () => {
    window.location.href = '/api/legal-mind/delivery-bundle.zip';
  };

  const handleRunTests = async () => {
    setBusyKey('run-tests');
    setBanner(null);
    try {
      const res = await fetch('/api/legal-mind/acceptance-tests/run', {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'تعذر تشغيل الاختبارات');
      setOverview(json.overview);
      const tests = (json.tests || []) as LegalMindAcceptanceTestResult[];
      const passCount = tests.filter((t) => t.verdict === 'PASS').length;
      const blockedCount = tests.filter((t) => t.verdict === 'BLOCKED').length;
      setBanner({
        type: 'ok',
        text: `نتائج اختبارات العقل القانوني: ${passCount} PASS · ${blockedCount} BLOCKED · ${tests.length - passCount - blockedCount} FAIL.`,
      });
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'فشل تشغيل الاختبارات',
      });
    } finally {
      setBusyKey(null);
    }
  };

  if (loading && !overview) {
    return (
      <div className="p-8 text-center text-sm text-slate-400">
        جارٍ تحميل منصة العقل القانوني الدولي وربط المصادر والقضايا...
      </div>
    );
  }

  const bs = overview?.brainStatus;
  const totalMemos = overview?.cases.reduce((acc, c) => acc + c.memos.length, 0) || 0;

  return (
    <div dir="rtl" className="min-h-full bg-slate-950 text-slate-100 p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-l from-slate-900 via-slate-900 to-amber-950/30 border border-amber-500/30 p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
            <Scale className="w-4 h-4" />
            <span>منصة العقل القانوني الدولي — منارة العدالة الناجزة</span>
          </div>
          <h1 className="text-xl md:text-2xl font-extrabold text-white">
            مركز القضايا والمصادر والمذكرات والتسليم المستقل (15 يوماً)
          </h1>
          <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
            متصل فعلياً بـ <strong className="text-amber-300">{bs?.brainTitleAr}</strong> ({bs?.activeVersion})، مع منظومة مراجع قانونية محلية RAG دون إنترنت، إدارة القضايا ببصمات SHA-256، حصة تشغيل مجانية احتياطية، وحزمة تسليم مستقلة.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleDownloadBundle}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer transition whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>تنزيل حزمة التسليم المستقلة (ZIP)</span>
          </button>
          {onOpenTrainingOffice && (
            <button
              type="button"
              onClick={() => onOpenTrainingOffice('attia-advisor')}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-xs font-semibold cursor-pointer transition whitespace-nowrap"
            >
              <GraduationCap className="w-4 h-4" />
              <span>تطوير العقل وتدريبي</span>
            </button>
          )}
          {onOpenSelfHealing && (
            <button
              type="button"
              onClick={onOpenSelfHealing}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold cursor-pointer transition whitespace-nowrap"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>المراقبة والإصلاح الذاتي</span>
            </button>
          )}
        </div>
      </div>

      {/* Status Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>العقل القانوني المتصل</span>
            <Scale className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-sm font-bold text-white truncate">{bs?.brainTitleAr}</div>
          <div className="text-[11px] text-slate-300 font-mono tabular-nums">
            {bs?.activeBrain}@{bs?.activeVersion} · مبادئ={bs?.principlesCount} · ضوابط={bs?.directivesCount}
          </div>
        </div>

        <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>القضايا والمذكرات الموثقة</span>
            <Briefcase className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-lg font-extrabold text-white tabular-nums">
            {overview?.cases.length || 0} قضايا · {totalMemos} مذكرة
          </div>
          <div className="text-[11px] text-slate-400">حفظ ذرّي مع بصمات SHA-256</div>
        </div>

        <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>منظومة المصادر والمراجع</span>
            <BookOpen className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-lg font-extrabold text-white tabular-nums">
            {overview?.sources.length || 0} مرجعاً دولياً وعربياً
          </div>
          <div className="text-[11px] text-emerald-300">بحث دلالي TF-IDF يعمل 100% دون إنترنت</div>
        </div>

        <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>الوضع العصبي المحلي (GGUF)</span>
            <Lock className="w-4 h-4 text-rose-400" />
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded border text-xs font-mono font-bold ${verdictBadgeClass(
                bs?.offlineNeuralVerdict || 'BLOCKED'
              )}`}
            >
              {bs?.offlineNeuralVerdict || 'BLOCKED'}
            </span>
            <span className="text-[11px] text-slate-300 tabular-nums">
              أوزان: {bs?.localGgufWeightsCount || 0} · حصة مجانية: نشطة
            </span>
          </div>
          <div className="text-[11px] text-slate-400 truncate" title={bs?.offlineNeuralReasonAr}>
            الهجين السحابي المجاني يعمل · المحلي بانتظار رفع GGUF
          </div>
        </div>
      </div>

      {banner && (
        <div
          className={`rounded-xl px-4 py-3 text-xs font-medium border flex items-center justify-between gap-3 ${
            banner.type === 'ok'
              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/60 border-rose-500/40 text-rose-200'
          }`}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-xs underline cursor-pointer shrink-0"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        {(
          [
            { id: 'cases', label: 'ملفات القضايا والمذكرات', Icon: Briefcase },
            { id: 'sources', label: 'المصادر والمراجع القانونية', Icon: BookOpen },
            { id: 'roadmap', label: 'خطة الـ 15 يوماً والتسليم', Icon: FileText },
            { id: 'contributors', label: 'المشاركة وحقوق الداعمين', Icon: Users },
            { id: 'tests', label: 'اختبارات الجودة (PASS/BLOCKED)', Icon: ClipboardCheck },
          ] as const
        ).map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer transition whitespace-nowrap ${
              activeTab === id
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* TAB 1: CASES, DOCUMENTS & MEMO DRAFTING */}
      {activeTab === 'cases' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          {/* Cases Sidebar */}
          <div className="xl:col-span-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">ملفات القضايا النشطة</h2>
              <button
                type="button"
                onClick={() => setShowNewCaseForm((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>قضية جديدة</span>
              </button>
            </div>

            {showNewCaseForm && (
              <div className="rounded-xl bg-slate-900 border border-amber-500/40 p-4 space-y-2.5 text-xs">
                <div className="font-bold text-amber-300">فتح ملف قضية قانونية جديدة</div>
                <input
                  value={newCaseTitle}
                  onChange={(e) => setNewCaseTitle(e.target.value)}
                  placeholder="عنوان القضية أو موضوع العقد..."
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-white"
                />
                <input
                  value={newCaseParties}
                  onChange={(e) => setNewCaseParties(e.target.value)}
                  placeholder="الأطراف (المدعي ضد المدعى عليه)..."
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-white"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={newCaseScope}
                    onChange={(e) => setNewCaseScope(e.target.value as LegalJurisdictionScope)}
                    className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-2 text-white"
                  >
                    {Object.entries(JURISDICTION_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <select
                    value={newCaseType}
                    onChange={(e) => setNewCaseType(e.target.value as LegalCaseRecord['caseType'])}
                    className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-2 text-white"
                  >
                    <option value="arbitration">تحكيم دولي</option>
                    <option value="commercial">تجاري</option>
                    <option value="civil">مدني</option>
                    <option value="contract-review">مراجعة عقد</option>
                    <option value="cyber-privacy">بيانات وذكاء اصطناعي</option>
                    <option value="labor">عمالي</option>
                    <option value="administrative">إداري</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={newCaseClaim}
                    onChange={(e) => setNewCaseClaim(e.target.value)}
                    placeholder="القيمة / المطالبة..."
                    className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-white"
                  />
                  <input
                    value={newCaseDeadline}
                    onChange={(e) => setNewCaseDeadline(e.target.value)}
                    placeholder="الموعد النظامي الحرج..."
                    className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-white"
                  />
                </div>
                <textarea
                  rows={3}
                  value={newCaseFacts}
                  onChange={(e) => setNewCaseFacts(e.target.value)}
                  placeholder="ملخص الوقائع والطلبات الأساسية..."
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-white"
                />
                <input
                  value={newDocTitle}
                  onChange={(e) => setNewDocTitle(e.target.value)}
                  placeholder="عنوان مستند مرفق (اختياري)..."
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-white"
                />
                {newDocTitle.trim() && (
                  <textarea
                    rows={2}
                    value={newDocContent}
                    onChange={(e) => setNewDocContent(e.target.value)}
                    placeholder="نص المستند أو البند التعاقدي..."
                    className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-white"
                  />
                )}
                <button
                  type="button"
                  disabled={busyKey === 'create-case'}
                  onClick={handleCreateCase}
                  className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold cursor-pointer disabled:opacity-50"
                >
                  {busyKey === 'create-case' ? 'جارٍ الحفظ والتوثيق...' : 'حفظ ملف القضية'}
                </button>
              </div>
            )}

            <div className="space-y-2">
              {overview?.cases.map((c) => {
                const selected = c.id === activeCase?.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedCaseId(c.id);
                      setSelectedMemoId(c.memos[0]?.id || '');
                    }}
                    className={`w-full text-right rounded-xl p-3.5 border transition cursor-pointer space-y-1.5 ${
                      selected
                        ? 'bg-slate-900 border-amber-500/60 shadow-lg'
                        : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono text-amber-400">
                      <span>{c.caseNumber}</span>
                      <span className="text-slate-400 tabular-nums">
                        {c.documents.length} مستند · {c.memos.length} مذكرة
                      </span>
                    </div>
                    <div className="text-xs font-bold text-white line-clamp-2">{c.titleAr}</div>
                    <div className="text-[11px] text-slate-400 truncate">{c.partiesAr}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Case Workspace */}
          <div className="xl:col-span-8 space-y-4">
            {activeCase ? (
              <>
                <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-mono text-amber-400">
                        {activeCase.caseNumber} · {JURISDICTION_LABELS[activeCase.jurisdictionScope]} ·{' '}
                        <span className="text-slate-400">SHA: {activeCase.sha256.slice(0, 14)}...</span>
                      </div>
                      <h3 className="text-base font-extrabold text-white mt-0.5">{activeCase.titleAr}</h3>
                      <div className="text-xs text-slate-300 mt-1">
                        الأطراف: {activeCase.partiesAr} | المطالبة: {activeCase.claimValue} | الموعد الحرج:{' '}
                        {activeCase.criticalDeadline}
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 bg-slate-950/70 border border-slate-800 rounded-lg p-3 leading-relaxed">
                    {activeCase.factsSummaryAr}
                  </p>

                  {activeCase.linkedSourceCodes.length > 0 && (
                    <div className="text-[11px] text-slate-300">
                      <span className="text-slate-400">المراجع القانونية المرتبطة: </span>
                      <span className="font-mono text-emerald-300">
                        {activeCase.linkedSourceCodes.join(' · ')}
                      </span>
                    </div>
                  )}

                  {/* Attach Document */}
                  <div className="rounded-lg bg-slate-950 border border-slate-800 p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                      <span className="inline-flex items-center gap-1.5">
                        <FilePlus2 className="w-3.5 h-3.5 text-sky-400" />
                        <span>المستندات المرفقة بالقضية ({activeCase.documents.length})</span>
                      </span>
                    </div>
                    {activeCase.documents.map((d) => (
                      <div
                        key={d.id}
                        className="text-[11px] bg-slate-900 border border-slate-800 rounded px-2.5 py-2 flex flex-col gap-1"
                      >
                        <div className="flex items-center justify-between font-semibold text-white">
                          <span>{d.title}</span>
                          <span className="font-mono text-slate-400">
                            {d.charCount} حرف · {d.sha256.slice(0, 10)}...
                          </span>
                        </div>
                        <div className="text-slate-400 line-clamp-2">{d.content}</div>
                      </div>
                    ))}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1">
                      <input
                        value={attachTitle}
                        onChange={(e) => setAttachTitle(e.target.value)}
                        placeholder="عنوان مستند/بند إضافي..."
                        className="rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-xs text-white"
                      />
                      <input
                        value={attachContent}
                        onChange={(e) => setAttachContent(e.target.value)}
                        placeholder="نص المستند أو البينات..."
                        className="rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-xs text-white md:col-span-1"
                      />
                      <button
                        type="button"
                        disabled={busyKey === 'attach-doc' || !attachTitle.trim() || !attachContent.trim()}
                        onClick={handleAttachDoc}
                        className="rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 border border-sky-500/30 text-xs font-bold py-1.5 px-3 cursor-pointer disabled:opacity-40"
                      >
                        {busyKey === 'attach-doc' ? 'جارٍ الإرفاق...' : 'إرفاق وتوثيق SHA-256'}
                      </button>
                    </div>
                  </div>

                  {/* Run Legal Analysis / Memo Drafting */}
                  <div className="rounded-xl bg-amber-950/20 border border-amber-500/30 p-3.5 space-y-2.5">
                    <div className="text-xs font-bold text-amber-300">
                      تشغيل التحليل القانوني وصياغة المذكرات والدفوع عبر العقل المتفق عليه ({bs?.activeVersion})
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                      <select
                        value={draftMode}
                        onChange={(e) => setDraftMode(e.target.value as LegalDraftMode)}
                        className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white"
                      >
                        {MODE_OPTIONS.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.labelAr}
                          </option>
                        ))}
                      </select>
                      <input
                        value={extraInstr}
                        onChange={(e) => setExtraInstr(e.target.value)}
                        placeholder="توجيهات إضافية (مثل: ركّز على عدم القبول لشرط التحكيم)..."
                        className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white"
                      />
                      <button
                        type="button"
                        disabled={busyKey === 'analyze'}
                        onClick={handleAnalyzeCase}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs py-2 px-4 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>{busyKey === 'analyze' ? 'جارٍ التحليل والصياغة...' : 'تحليل وصياغة الآن'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Drafted Memos Output */}
                {activeCase.memos.length > 0 && (
                  <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                      <div className="flex flex-wrap gap-2">
                        {activeCase.memos.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setSelectedMemoId(m.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                              m.id === activeMemo?.id
                                ? 'bg-amber-500 text-slate-950'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {m.titleAr}
                          </button>
                        ))}
                      </div>
                      {activeMemo && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              downloadBlobFile(
                                new Blob([activeMemo.markdownContent], {
                                  type: 'text/markdown;charset=utf-8',
                                }),
                                `${activeCase.caseNumber}-${activeMemo.id}.md`
                              )
                            }
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 cursor-pointer"
                          >
                            تنزيل MD
                          </button>
                          <button
                            type="button"
                            disabled={busyKey === `pdf-${activeMemo.id}`}
                            onClick={() => handleExportMemoPdf(activeMemo)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>تصدير PDF عربي</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {activeMemo && (
                      <div className="space-y-3">
                        <div className="text-[11px] font-mono text-slate-400 flex flex-wrap gap-3">
                          <span>العقل: {activeMemo.brainId}@{activeMemo.brainVersion}</span>
                          <span>النموذج: {activeMemo.modelUsed}</span>
                          <span>الخطورة: {activeMemo.riskLevel}</span>
                          <span>الزمن: {activeMemo.latencyMs}ms</span>
                          <span>SHA-256: {activeMemo.sha256.slice(0, 14)}...</span>
                        </div>
                        {activeMemo.extractedIssues.length > 0 && (
                          <div className="rounded-lg bg-slate-950 border border-slate-800 p-3 space-y-1">
                            <div className="text-xs font-bold text-amber-300">المسائل القانونية المستخرجة:</div>
                            <ul className="list-disc pr-5 text-xs text-slate-300 space-y-1">
                              {activeMemo.extractedIssues.map((iss, idx) => (
                                <li key={idx}>{iss}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <div className="rounded-xl bg-white text-slate-900 p-5 border border-slate-300">
                          <ChatMarkdownContent content={activeMemo.markdownContent} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-xl bg-slate-900 border border-slate-800 p-6 text-center text-xs text-slate-400">
                اختر قضية من القائمة أو أنشئ قضية جديدة.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ORGANIZED LEGAL SOURCES & OFFLINE RAG */}
      {activeTab === 'sources' && (
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <div className="flex flex-1 gap-2">
              <input
                value={sourceQuery}
                onChange={(e) => setSourceQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchSources()}
                placeholder="ابحث محلياً في المعاهدات والأنظمة (مثل: تحكيم نيويورك، القوة القاهرة CISG، حماية البيانات GDPR)..."
                className="flex-1 rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white"
              />
              <button
                type="button"
                onClick={handleSearchSources}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer whitespace-nowrap"
              >
                <Search className="w-3.5 h-3.5" />
                <span>بحث محلي (بدون إنترنت)</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowAddSource((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-xs font-bold cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة مرجع قانوني</span>
            </button>
          </div>

          {showAddSource && (
            <div className="rounded-xl bg-slate-900 border border-amber-500/40 p-4 space-y-2.5 text-xs">
              <div className="font-bold text-amber-300">إدراج مصدر أو تشريع جديد في منظومة المعرفة</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <input
                  value={srcCode}
                  onChange={(e) => setSrcCode(e.target.value)}
                  placeholder="الرمز (مثل: UAE-CIVIL-1985)..."
                  className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-white"
                />
                <input
                  value={srcTitle}
                  onChange={(e) => setSrcTitle(e.target.value)}
                  placeholder="عنوان التشريع أو الاتفاقية..."
                  className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-white"
                />
                <input
                  value={srcAuth}
                  onChange={(e) => setSrcAuth(e.target.value)}
                  placeholder="الجهة المُصدِرة..."
                  className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-white"
                />
              </div>
              <textarea
                rows={3}
                value={srcText}
                onChange={(e) => setSrcText(e.target.value)}
                placeholder="ملخص المواد الأساسية والنص المرجعي المعتمد للاستشهاد..."
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-white"
              />
              <button
                type="button"
                disabled={busyKey === 'add-src'}
                onClick={handleAddSource}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold cursor-pointer"
              >
                حفظ وفهرسة المرجع
              </button>
            </div>
          )}

          {sourceSearchResults && (
            <div className="rounded-xl bg-emerald-950/30 border border-emerald-500/40 p-4 space-y-2">
              <div className="text-xs font-bold text-emerald-300">
                نتائج الاسترجاع الدلالي المحلي (TF-IDF · externalApiCalled: false): {sourceSearchResults.hits.length} فقرات
              </div>
              {sourceSearchResults.hits.map((h, i) => (
                <div key={i} className="rounded-lg bg-slate-950 border border-slate-800 p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between text-amber-300 font-bold">
                    <span>{h.title}</span>
                    <span className="font-mono text-emerald-300">تطابق {(h.score * 100).toFixed(0)}%</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed">{h.excerpt}</p>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {overview?.sources.map((s: LegalSourceEntry) => (
              <div key={s.id} className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-amber-400">{s.code}</span>
                  <span className="text-[11px] text-slate-400">
                    {s.authority} · {s.year}
                  </span>
                </div>
                <div className="text-sm font-bold text-white">{s.titleAr}</div>
                <div className="text-xs text-slate-300 leading-relaxed">{s.keyArticlesSummaryAr}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: 15-DAY DELIVERY ROADMAP & STANDALONE BUNDLE */}
      {activeTab === 'roadmap' && (
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-900 border border-amber-500/30 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-white">خطة التنفيذ والتسليم المرحلية (15 يوماً تقويمياً)</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                ترتبط حالة كل مرحلة بالأدلة الفعلية على الخادم؛ ولا تُوسم أي مرحلة كمكتملة إلا بتحقق نتائجها فعلياً.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownloadBundle}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer shrink-0"
            >
              <Download className="w-4 h-4" />
              <span>تصدير حزمة التسليم الكاملة (ZIP)</span>
            </button>
          </div>

          <div className="space-y-3">
            {overview?.milestones.map((m, idx) => (
              <div key={idx} className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-mono font-bold text-amber-400">{m.dayRange}</span>
                    <span className="text-sm font-bold text-white">{m.titleAr}</span>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded border text-xs font-mono font-bold ${verdictBadgeClass(
                      m.status
                    )}`}
                  >
                    {m.status}
                  </span>
                </div>
                <div className="text-xs text-slate-300">المخرج المطلوب: {m.deliverableAr}</div>
                <div className="text-xs text-emerald-300 font-mono">{m.evidenceAr}</div>
                {m.blockerActionAr && (
                  <div className="rounded-lg bg-rose-950/40 border border-rose-500/40 p-2.5 text-xs text-rose-200 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>العائق والحل العملي: {m.blockerActionAr}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: SHARED OWNERSHIP & CONTRIBUTOR RIGHTS */}
      {activeTab === 'contributors' && (
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-2">
            <h2 className="text-sm font-bold text-amber-300">
              ميثاق الملكية التشاركية وحفظ حقوق الداعمين والمساهمين
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              تقوم منصة العقل القانوني الدولي على الشراكة العادلة وعدم الاحتكار؛ ويُوثَّق هنا كل مساهم ومطور وداعم مع نوع مساهمته وبند حفظ حقه، وتُصدَّر هذه الوثيقة تلقائياً داخل حزمة التسليم.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {overview?.contributors.map((c) => (
              <div key={c.id} className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-white">{c.nameAr}</span>
                  <span className="text-[11px] font-mono text-amber-300">{c.contributionType}</span>
                </div>
                <div className="text-xs font-semibold text-sky-300">{c.roleAr}</div>
                <p className="text-xs text-slate-300">{c.contributionSummaryAr}</p>
                <div className="rounded-lg bg-slate-950 border border-slate-800 p-2.5 text-[11px] text-emerald-300">
                  بند حفظ الحقوق: {c.rightsClauseAr}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl bg-slate-900 border border-amber-500/30 p-4 space-y-2.5 text-xs">
            <div className="font-bold text-amber-300">تسجيل مساهم أو داعم جديد في سجل الحقوق</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <input
                value={contribName}
                onChange={(e) => setContribName(e.target.value)}
                placeholder="اسم المساهم أو الجهة..."
                className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-white"
              />
              <input
                value={contribRole}
                onChange={(e) => setContribRole(e.target.value)}
                placeholder="الدور (مطور / مستشار قانوني / داعم)..."
                className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-white"
              />
              <select
                value={contribType}
                onChange={(e) =>
                  setContribType(e.target.value as ContributorRightsEntry['contributionType'])
                }
                className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-white"
              >
                <option value="legal-knowledge">معرفة وصياغة قانونية</option>
                <option value="engineering">هندسة وبرمجة</option>
                <option value="compute-sponsor">دعم بنية تحتية وتمويل</option>
                <option value="testing-qa">اختبارات وضبط جودة</option>
                <option value="governance">حوكمة وإدارة</option>
              </select>
            </div>
            <input
              value={contribSummary}
              onChange={(e) => setContribSummary(e.target.value)}
              placeholder="وصف المساهمة الفعلية..."
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-white"
            />
            <input
              value={contribRights}
              onChange={(e) => setContribRights(e.target.value)}
              placeholder="بند الحقوق أو النسبة المعتمدة..."
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-white"
            />
            <button
              type="button"
              disabled={busyKey === 'add-contrib'}
              onClick={handleAddContributor}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold cursor-pointer"
            >
              توثيق الحقوق في السجل الرسمي
            </button>
          </div>
        </div>
      )}

      {/* TAB 5: ACCEPTANCE TESTS (PASS / FAIL / BLOCKED) */}
      {activeTab === 'tests' && (
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-white">
                اختبارات التحقق الحقيقية لمنصة العقل القانوني الدولي (8 اختبارات)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                تفحص اتصال العقل الفعلي، المصادر دون إنترنت، حفظ القضايا، التحليل وصياغة المذكرات، التغليف، المراقبة، وحقيقة الأوزان المحلية.
              </p>
            </div>
            <button
              type="button"
              disabled={busyKey === 'run-tests'}
              onClick={handleRunTests}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              <span>{busyKey === 'run-tests' ? 'جارٍ تشغيل الاختبارات...' : 'تشغيل الاختبارات الحية'}</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {(overview?.acceptanceTests || []).length === 0 ? (
              <div className="rounded-xl bg-slate-900 border border-slate-800 p-6 text-center text-xs text-slate-400">
                اضغط على «تشغيل الاختبارات الحية» لإصدار تقرير PASS / FAIL / BLOCKED موثق.
              </div>
            ) : (
              overview?.acceptanceTests.map((t) => (
                <div key={t.id} className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {t.verdict === 'PASS' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : t.verdict === 'BLOCKED' ? (
                        <Lock className="w-4 h-4 text-rose-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400" />
                      )}
                      <span className="text-xs font-bold text-white">
                        #{t.id} — {t.nameAr}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-slate-400 tabular-nums">{t.durationMs}ms</span>
                      <span
                        className={`px-2 py-0.5 rounded border text-xs font-mono font-bold ${verdictBadgeClass(
                          t.verdict
                        )}`}
                      >
                        {t.verdict}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-slate-300">{t.actualResultAr}</div>
                  <div className="text-[11px] font-mono text-slate-400">{t.evidenceAr}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
