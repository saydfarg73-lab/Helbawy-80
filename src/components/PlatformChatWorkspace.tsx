import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import {
  AlertCircle,
  Bot,
  BrainCircuit,
  Check,
  ChevronDown,
  Copy,
  Database,
  Download,
  FileCode2,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Image as ImageIcon,
  Languages,
  Loader2,
  MessageCircle,
  Mic,
  Paperclip,
  Presentation,
  Printer,
  Scale,
  Send,
  Sparkles,
  Trash2,
  UploadCloud,
  User,
  X,
} from 'lucide-react';
import type {
  ChatAttachmentMeta,
  IroncladMemoryCategory,
  IroncladMemoryItem,
  LegalJurisdictionScope,
  OmniTrainingCurriculumResult,
  PlatformBrainId,
  PlatformChatMessage,
  PlatformChatMode,
  Project,
  TranslationStyle,
} from '../types/helbawey';
import {
  buildPrintableHtmlDocument,
  ChatMarkdownContent,
  downloadBlobFile,
  stripMarkdownToPlainText,
} from './ChatMarkdownContent';
import { IroncladMemoryPanel } from './IroncladMemoryPanel';
import { resilientFetchJson, resilientFetchResponse } from '../utils/resilientFetch';

interface Props {
  activeProject?: Project;
  activeBrain?: PlatformBrainId;
  onOpenBrainSelector?: () => void;
  onOpenTrainingOffice?: (brainId: PlatformBrainId) => void;
  initialMessages: PlatformChatMessage[];
  onMessagesUpdated: (messages: PlatformChatMessage[]) => void;
  variant?: 'page' | 'drawer';
  onCloseDrawer?: () => void;
}

interface PendingAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  base64Data: string;
  kindHint: ChatAttachmentMeta['kind'];
}

const MAX_FILES_PER_MSG = 5;
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB
const MAX_TOTAL_RAW_BYTES = 18 * 1024 * 1024; // ~24 MB base64 JSON, safely below Nginx 32 MB limit

const ACCEPTED_EXTENSIONS =
  '.pdf,.doc,.docx,.xlsx,.xls,.xlsm,.xlsb,.ods,.csv,.tsv,.pptx,.odp,.odt,.rtf,.txt,.md,.markdown,.json,.jsonl,.xml,.yaml,.yml,.html,.htm,.css,.scss,.sql,.ts,.tsx,.js,.jsx,.py,.java,.cs,.go,.rs,.php,.rb,.sh,.log,.ini,.conf,.env,.svg,image/*,audio/*,video/*';

const GENERAL_CONVERSATION_STARTERS = [
  'أهلاً! اشرح لي باختصار وضع مشروعي الحالي وما الخطوة القادمة لتجهيزه.',
  'ما الفرق بين Qwen2.5-1.5B و Gemma-2-2B لجهاز بذاكرة 8 GB RAM بدون GPU؟',
  'يمكنك الآن إرفاق ملف PDF أو Word أو Excel أو صورة هنا لتحليلها بالكامل.',
  'ساعدني في التخطيط لميزة جديدة لإدارة تنبيهات العقود والفواتير.',
];

const LEGAL_CONVERSATION_STARTERS = [
  'أعدّ لي مذكرة استشارة قانونية متكاملة حول عقد توريد دولي ومقارنة أحكامه بين النظام السعودي/المصري واتفاقية فيينا CISG 1980.',
  'حلّل لي مدى تعارض شرط التحكيم الدولي (ICC / نيويورك 1958) مع الاختصاص القضائي المحلي في المنازعات التجارية.',
  'ما التزامات الامتثال القانونية لنظام البرمجيات والبيانات عبر الحدود وفق GDPR ولائحة الذكاء الاصطناعي الأوروبية EU AI Act ونظام PDPL؟',
  'صُغ لي هيكل مذكرة دفاع قانونية منسقة (الوقائع، الدفوع الشكلية، الدفوع الموضوعية، الطلبات) جاهزة للطباعة والتصدير PDF.',
];

const GENERAL_DOC_QUICK_PROMPTS = [
  'لخّص المستندات المرفقة واستخرج أهم النقاط والقرارات.',
  'حلّل البيانات والأرقام والجداول بدقة واكتشف أي ملاحظات أو فجوات.',
  'راجع البنود والمخاطر وقدّم توصيات عملية في جدول منظم.',
  'استخرج الكيانات والتواريخ والمبالغ وحوّلها لخطة عمل واضحة.',
];

const LEGAL_DOC_QUICK_PROMPTS = [
  'حلّل البيانات القانونية المرفقة واربطها بالقوانين المحلية والدولية والعالمية المقارنة في مصفوفة مخاطر.',
  'أعدّ مذكرة استشارة قانونية شاملة مبنية على وقائع وبنود المستندات المرفقة.',
  'افحص الثغرات العقدية والالتزامات والمدد واكتب صياغة بديلة للبنود الحرجة.',
  'صُغ مذكرة دفاع / رد قانوني رسمية مستندة إلى الأسانيد والبينات الواردة في المرفق.',
];

const TRANSLATOR_CONVERSATION_STARTERS = [
  'ترجم النص التالي ترجمة قانونية محلفة إلى اللغة المستهدفة مع الحفاظ على القوة الإلزامية للبنود.',
  'أرفق عقداً أو مستنداً PDF/Word لترجمته كاملاً ووضعه في جدول مقارنة ثنائي اللغة (أصلي | ترجمة).',
  'ترجم هذه الوثيقة إلى الصينية المبسطة والألمانية والفرنسية مع توحيد المصطلحات التجارية والقانونية.',
  'تذكّر دائماً أن تترجم مصطلح "Indemnification" إلى "التعويض والضمان التعاقدي" في جميع جلساتنا القادمة.',
];

const TRANSLATOR_DOC_QUICK_PROMPTS = [
  'ترجم المستندات المرفقة كاملةً إلى اللغة المستهدفة مع حفظ التواريخ والأرقام والجداول بدقة.',
  'أنشئ جدول ترجمة ثنائي اللغة بنداً ببند للمستند المرفق (النص الأصلي | الترجمة المعتمدة).',
  'استخرج أهم المصطلحات القانونية والتقنية من المستند واقترح معجم ترجمة موحد لحفظه في الذاكرة.',
  'لخّص المستند المرفق أولاً ثم ترجمه بالكامل إلى اللغة المستهدفة بصياغة جاهزة للتصدير PDF.',
];

const OMNI_CONVERSATION_STARTERS = [
  'حلّل لي معضلة استراتيجية معقدة تجمع بين البنية التقنية للذكاء الاصطناعي والامتثال القانوني والجدوى المالية في تقرير تنفيذي واحد.',
  'طبّق منهجية المبادئ الأولى ونظرية الألعاب (Game Theory) لتقييم مخاطر قرار استثماري أو تفاوضي عالي الحساسية.',
  'أجرِ تشخيصاً هندسياً وأمنياً (Threat Modeling & Architecture Audit) لبنية برمجية مع خطة تحصين عملية.',
  'أعدّ دراسة متعددة التخصصات (هندسة + قانون دولي + اقتصاد + طب/علم بيانات) حول أي قضية أو مستند أرفقه لك.',
];

const OMNI_DOC_QUICK_PROMPTS = [
  'حلّل المستندات المرفقة بعقل متعدد التخصصات: هندسي + قانوني + مالي + استراتيجي واكتشف الفجوات المخفية.',
  'طبّق اختبار النقد المضاد (Red-Teaming) على بنود وأرقام المرفق، واستخرج المخاطر الحرجة وخطة التحصين.',
  'حوّل محتوى المستند المرفق إلى مصفوفة قرارات تنفيذية مدعومة بالأدلة والفرضيات والبدائل.',
  'استخلص القواعد والنماذج الذهنية الجوهرية من المرفق واحفظها كمعرفة دائمة في الذاكرة الحديدية.',
];

const JURISDICTION_OPTIONS: { id: LegalJurisdictionScope; label: string }[] = [
  { id: 'global-comparative', label: 'شامل: محلي + دولي + عالمي مقارن' },
  { id: 'saudi-gcc', label: 'الأنظمة السعودية والخليجية' },
  { id: 'egypt-arab', label: 'القانون المصري والعربي المقارن' },
  { id: 'international-arbitration', label: 'القانون الدولي والتحكيم التجاري' },
  { id: 'eu-us-uk-regulatory', label: 'التشريعات العالمية (GDPR / EU AI Act / US-UK)' },
];

const WORLD_LANGUAGES_UI: { code: string; label: string }[] = [
  { code: 'English', label: 'الإنجليزية (English)' },
  { code: 'Arabic', label: 'العربية (Arabic)' },
  { code: 'French', label: 'الفرنسية (Français)' },
  { code: 'German', label: 'الألمانية (Deutsch)' },
  { code: 'Spanish', label: 'الإسبانية (Español)' },
  { code: 'Italian', label: 'الإيطالية (Italiano)' },
  { code: 'Portuguese', label: 'البرتغالية (Português)' },
  { code: 'Russian', label: 'الروسية (Русский)' },
  { code: 'Chinese (Simplified)', label: 'الصينية المبسطة (简体中文)' },
  { code: 'Chinese (Traditional)', label: 'الصينية التقليدية (繁體中文)' },
  { code: 'Japanese', label: 'اليابانية (日本語)' },
  { code: 'Korean', label: 'الكورية (한국어)' },
  { code: 'Turkish', label: 'التركية (Türkçe)' },
  { code: 'Persian', label: 'الفارسية (فارسی)' },
  { code: 'Urdu', label: 'الأردية (اردو)' },
  { code: 'Hindi', label: 'الهندية (हिन्दी)' },
  { code: 'Indonesian', label: 'الإندونيسية (Bahasa Indonesia)' },
  { code: 'Malay', label: 'الماليزية (Bahasa Melayu)' },
  { code: 'Dutch', label: 'الهولندية (Nederlands)' },
  { code: 'Polish', label: 'البولندية (Polski)' },
  { code: 'Swedish', label: 'السويدية (Svenska)' },
  { code: 'Greek', label: 'اليونانية (Ελληνικά)' },
  { code: 'Ukrainian', label: 'الأوكرانية (Українська)' },
  { code: 'Swahili', label: 'السواحيلية (Kiswahili)' },
  { code: 'Thai', label: 'التايلاندية (ไทย)' },
  { code: 'Vietnamese', label: 'الفيتنامية (Tiếng Việt)' },
  { code: '__custom__', label: 'لغة عالمية أخرى (تحديد يدوي)...' },
];

const TRANSLATION_STYLE_OPTIONS: { id: TranslationStyle; label: string }[] = [
  { id: 'certified-legal', label: 'ترجمة قانونية محلفة دقيقة' },
  { id: 'bilingual-table', label: 'جدول مزدوج (أصلي | ترجمة)' },
  { id: 'faithful-literal', label: 'ترجمة حرفية أمينة' },
  { id: 'natural-idiomatic', label: 'صياغة طبيعية سلسة' },
];

function inferKindFromFile(name: string, mimeType: string): ChatAttachmentMeta['kind'] {
  const lower = name.toLowerCase();
  const mime = mimeType.toLowerCase();
  if (lower.endsWith('.pdf') || mime === 'application/pdf') return 'pdf';
  if (
    /\.(png|jpe?g|webp|gif|heic|heif)$/i.test(lower) ||
    (mime.startsWith('image/') && !lower.endsWith('.svg'))
  ) {
    return 'image';
  }
  if (/\.(docx?|odt)$/i.test(lower) || mime.includes('wordprocessingml') || mime === 'application/msword') {
    return 'word';
  }
  if (
    /\.(xlsx?|xlsm|xlsb|ods|csv|tsv)$/i.test(lower) ||
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    mime === 'text/csv'
  ) {
    return 'excel';
  }
  if (/\.(pptx?|odp)$/i.test(lower) || mime.includes('presentationml')) return 'presentation';
  if (mime.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|aac|flac)$/i.test(lower)) return 'audio';
  if (mime.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(lower)) return 'video';
  if (/\.(txt|md|json|jsonl|xml|yaml|yml|html|htm|sql|ts|tsx|js|jsx|py|java|cs|go|php|log|rtf|svg)$/i.test(lower)) {
    return 'text';
  }
  return 'other';
}

function AttachmentKindIcon({ kind }: { kind: ChatAttachmentMeta['kind'] }) {
  switch (kind) {
    case 'excel':
      return <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />;
    case 'image':
      return <ImageIcon className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />;
    case 'presentation':
      return <Presentation className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />;
    case 'audio':
    case 'video':
      return <Mic className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 shrink-0" />;
    case 'text':
      return <FileCode2 className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300 shrink-0" />;
    default:
      return <FileText className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error(`تعذر قراءة الملف "${file.name}".`));
    reader.readAsDataURL(file);
  });
}

function findPreviousAttachments(messages: PlatformChatMessage[], assistantIndex: number): string[] {
  for (let idx = assistantIndex - 1; idx >= 0; idx--) {
    const m = messages[idx];
    if (m.role === 'user') {
      return (m.attachments || []).map((a) => a.name);
    }
  }
  return [];
}

export function PlatformChatWorkspace({
  activeProject,
  activeBrain = 'attia-advisor',
  onOpenBrainSelector,
  onOpenTrainingOffice,
  initialMessages,
  onMessagesUpdated,
  variant = 'page',
  onCloseDrawer,
}: Props) {
  const [messages, setMessages] = useState<PlatformChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [pendingFiles, setPendingFiles] = useState<PendingAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [chatMode, setChatMode] = useState<PlatformChatMode>(
    activeBrain === 'gemini-standard' ? 'general' : 'omni-advisor'
  );
  const [jurisdictionScope, setJurisdictionScope] =
    useState<LegalJurisdictionScope>('global-comparative');
  const [translationSourceLang, setTranslationSourceLang] = useState<string>('auto');
  const [translationTargetLang, setTranslationTargetLang] = useState<string>('English');
  const [customTargetLang, setCustomTargetLang] = useState<string>('');
  const [translationStyle, setTranslationStyle] = useState<TranslationStyle>('certified-legal');
  const [includeContext, setIncludeContext] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [exportMenuId, setExportMenuId] = useState<string | null>(null);
  const [exportingKey, setExportingKey] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryItems, setMemoryItems] = useState<IroncladMemoryItem[]>([]);
  const [archiveSummary, setArchiveSummary] = useState('');
  const [historyCount, setHistoryCount] = useState(initialMessages.length);

  const [omniTrainOpen, setOmniTrainOpen] = useState(false);
  const [omniDomainInput, setOmniDomainInput] = useState('');
  const [omniContentInput, setOmniContentInput] = useState('');
  const [trainingOmni, setTrainingOmni] = useState(false);
  const [omniTrainNotice, setOmniTrainNotice] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);

  async function loadIroncladMemory() {
    setMemoryLoading(true);
    try {
      const res = await fetch('/api/platform-chat/memory');
      if (res.ok) {
        const data = (await res.json()) as {
          items?: IroncladMemoryItem[];
          archiveSummary?: string;
          historyCount?: number;
        };
        setMemoryItems(Array.isArray(data.items) ? data.items : []);
        setArchiveSummary(data.archiveSummary || '');
        if (typeof data.historyCount === 'number') setHistoryCount(data.historyCount);
      }
    } finally {
      setMemoryLoading(false);
    }
  }

  useEffect(() => {
    void loadIroncladMemory();
  }, []);

  useEffect(() => {
    setMessages(initialMessages);
    setHistoryCount(initialMessages.length);
  }, [initialMessages]);

  useEffect(() => {
    if (activeBrain === 'gemini-standard') {
      setChatMode('general');
    } else if (chatMode === 'general') {
      setChatMode('omni-advisor');
    }
  }, [activeBrain]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, streaming]);

  const effectiveTargetLang =
    translationTargetLang === '__custom__'
      ? customTargetLang.trim() || 'English'
      : translationTargetLang;

  async function addFilesToPending(fileList: FileList | File[]) {
    const incoming = Array.from(fileList);
    if (incoming.length === 0) return;

    setError(null);
    const availableSlots = MAX_FILES_PER_MSG - pendingFiles.length;
    if (availableSlots <= 0) {
      setError(`الحد الأقصى للمرفقات في الرسالة الواحدة هو ${MAX_FILES_PER_MSG} ملفات.`);
      return;
    }

    const accepted = incoming.slice(0, availableSlots);
    const nextPending: PendingAttachment[] = [];

    let runningBytes = pendingFiles.reduce((acc, f) => acc + f.sizeBytes, 0);
    for (const file of accepted) {
      if (file.size > MAX_FILE_BYTES) {
        setError(`الملف "${file.name}" يتجاوز الحد المسموح (15 MB للملف الواحد).`);
        continue;
      }
      if (file.size === 0) {
        setError(`الملف "${file.name}" فارغ (0 بايت).`);
        continue;
      }
      if (runningBytes + file.size > MAX_TOTAL_RAW_BYTES) {
        setError('الحجم الإجمالي للمرفقات في الرسالة الواحدة يتجاوز 18 MB (حد الخادم السحابي الآمن). يرجى تقليل حجم أو عدد الملفات.');
        continue;
      }
      try {
        const base64Data = await readFileAsBase64(file);
        runningBytes += file.size;
        nextPending.push({
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          base64Data,
          kindHint: inferKindFromFile(file.name, file.type || ''),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : `تعذر قراءة الملف "${file.name}".`);
      }
    }

    if (incoming.length > availableSlots) {
      setError(`تم قبول أول ${availableSlots} ملفات فقط لأن الحد الأقصى هو ${MAX_FILES_PER_MSG} مرفقات.`);
    }

    if (nextPending.length > 0) {
      setPendingFiles((prev) => [...prev, ...nextPending]);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer?.files?.length) {
      void addFilesToPending(e.dataTransfer.files);
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.files;
    if (items && items.length > 0) {
      e.preventDefault();
      void addFilesToPending(items);
    }
  }

  async function handleSend(textOverride?: string) {
    const rawPrompt = (textOverride ?? input).trim();
    if ((!rawPrompt && pendingFiles.length === 0) || streaming) return;

    const filesToSend = [...pendingFiles];
    const displayPrompt =
      rawPrompt ||
      `يرجى قراءة وفهم وتحليل المستندات المرفقة (${filesToSend.map((f) => f.name).join('، ')}) بدقة.`;

    setError(null);
    if (!textOverride) setInput('');
    setPendingFiles([]);
    setExportMenuId(null);

    const optimisticAttachments: ChatAttachmentMeta[] = filesToSend.map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      kind: f.kindHint,
      parseStrategy:
        f.kindHint === 'pdf' || f.kindHint === 'image' || f.kindHint === 'audio' || f.kindHint === 'video'
          ? 'multimodal-inline'
          : 'extracted-text',
      summaryNoteAr: 'جاري القراءة والتحليل...',
    }));

    const optimisticUser: PlatformChatMessage = {
      id: `tmp-u-${Date.now()}`,
      role: 'user',
      content: displayPrompt,
      createdAt: new Date().toISOString(),
      projectId: activeProject?.id,
      chatMode,
      brainId: activeBrain,
      jurisdictionScope:
        chatMode === 'legal-expert' || chatMode === 'omni-advisor' ? jurisdictionScope : undefined,
      translationTargetLang: chatMode === 'translator' ? effectiveTargetLang : undefined,
      attachments: optimisticAttachments.length > 0 ? optimisticAttachments : undefined,
    };

    const baseMessages = [...messages, optimisticUser];
    setMessages(baseMessages);
    setStreaming(true);
    setStreamingText('');

    try {
      const res = await resilientFetchResponse('/api/platform-chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeoutMs: 120000,
        retries: 1,
        body: JSON.stringify({
          message: rawPrompt,
          projectId: activeProject?.id,
          includeContext,
          chatMode,
          brainId: activeBrain,
          jurisdictionScope,
          translationSourceLang,
          translationTargetLang: effectiveTargetLang,
          translationStyle,
          attachments: filesToSend.map((f) => ({
            name: f.name,
            mimeType: f.mimeType,
            sizeBytes: f.sizeBytes,
            base64Data: f.base64Data,
          })),
        }),
      });

      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        throw new Error(errPayload.error || `تعذر بدء المحادثة مع الخادم (HTTP ${res.status}).`);
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('تعذر قراءة تدفق الاستجابة من الخادم.');
      }

      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let assembled = '';
      let finalUserMsg = optimisticUser;
      let finalAssistantMsg: PlatformChatMessage | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr) continue;

          const evt = JSON.parse(jsonStr) as {
            type: 'delta' | 'done' | 'error';
            text?: string;
            error?: string;
            userMessage?: PlatformChatMessage;
            assistantMessage?: PlatformChatMessage;
          };

          if (evt.type === 'delta' && evt.text) {
            assembled += evt.text;
            setStreamingText(assembled);
          } else if (evt.type === 'error') {
            throw new Error(evt.error || 'حدث خطأ أثناء توليد الرد.');
          } else if (evt.type === 'done') {
            if (evt.userMessage) finalUserMsg = evt.userMessage;
            if (evt.assistantMessage) finalAssistantMsg = evt.assistantMessage;
          }
        }
      }

      const completedAssistant: PlatformChatMessage = finalAssistantMsg || {
        id: `msg-${Date.now()}`,
        role: 'model',
        content: assembled.trim(),
        createdAt: new Date().toISOString(),
        projectId: activeProject?.id,
      };

      const nextList = [...messages, finalUserMsg, completedAssistant];
      setMessages(nextList);
      onMessagesUpdated(nextList);
      setStreamingText('');
      // Refresh Ironclad Memory immediately and once more after background LLM extraction settles
      void loadIroncladMemory();
      setTimeout(() => {
        void loadIroncladMemory();
      }, 2400);
    } catch (err) {
      setMessages(messages);
      if (!textOverride) setInput(rawPrompt);
      setPendingFiles(filesToSend);
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء المحادثة.');
    } finally {
      setStreaming(false);
      setStreamingText('');
    }
  }

  async function handleClearHistory() {
    if (streaming || clearing) return;
    setClearing(true);
    setError(null);
    setExportMenuId(null);
    try {
      const res = await fetch('/api/platform-chat/history', { method: 'DELETE' });
      if (res.ok) {
        setMessages([]);
        onMessagesUpdated([]);
        void loadIroncladMemory();
      }
    } finally {
      setClearing(false);
    }
  }

  async function handleAddMemoryItem(payload: {
    category: IroncladMemoryCategory;
    title: string;
    content: string;
    pinned: boolean;
  }) {
    const res = await fetch('/api/platform-chat/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, projectId: activeProject?.id }),
    });
    if (res.ok) {
      const data = (await res.json()) as { items?: IroncladMemoryItem[] };
      if (Array.isArray(data.items)) setMemoryItems(data.items);
    }
  }

  async function handleTogglePinMemory(id: string, nextPinned: boolean) {
    const res = await fetch(`/api/platform-chat/memory/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: nextPinned }),
    });
    if (res.ok) {
      const data = (await res.json()) as { items?: IroncladMemoryItem[] };
      if (Array.isArray(data.items)) setMemoryItems(data.items);
    }
  }

  async function handleDeleteMemoryItem(id: string) {
    const res = await fetch(`/api/platform-chat/memory/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      const data = (await res.json()) as { items?: IroncladMemoryItem[] };
      if (Array.isArray(data.items)) setMemoryItems(data.items);
    }
  }

  async function handleClearAllMemory() {
    const res = await fetch('/api/platform-chat/memory', { method: 'DELETE' });
    if (res.ok) {
      setMemoryItems([]);
      setArchiveSummary('');
    }
  }

  async function handleTrainOmniBrain(mode: 'seed-master' | 'custom-domain') {
    if (trainingOmni) return;
    if (mode === 'custom-domain' && !omniDomainInput.trim() && !omniContentInput.trim()) {
      setError('أدخل اسم التخصص أو النص المعرفي المطلوب تقطيره وتدريب المستشار عليه.');
      return;
    }

    setTrainingOmni(true);
    setError(null);
    setOmniTrainNotice(null);
    try {
      const payload = await resilientFetchJson<OmniTrainingCurriculumResult & { error?: string }>(
        '/api/platform-chat/train-omni',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode,
            domain: omniDomainInput.trim(),
            content: omniContentInput.trim(),
            projectId: activeProject?.id,
          }),
        }
      );
      setOmniTrainNotice(
        `تم تدريب وتحديث مجال «${payload.domain}» بنجاح (قواعد مضافة/محدّثة بالذاكرة الحديدية: +${payload.addedMemoryCount} · إجمالي الذاكرة: ${payload.totalMemoryCount} · عينات SFT في ${payload.omniDatasetId}: +${payload.addedDatasetSamplesCount})`
      );
      if (mode === 'custom-domain') {
        setOmniDomainInput('');
        setOmniContentInput('');
      }
      setChatMode('omni-advisor');
      void loadIroncladMemory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تنفيذ التدريب.');
    } finally {
      setTrainingOmni(false);
    }
  }

  function handleCopy(key: string, text: string) {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1600);
  }

  function handlePrintDocument(params: {
    title: string;
    content: string;
    createdAt?: string;
    attachmentNames?: string[];
  }) {
    const iframe = printFrameRef.current;
    if (!iframe) return;
    const html = buildPrintableHtmlDocument({
      title: params.title,
      content: params.content,
      createdAt: params.createdAt,
      projectName: activeProject?.name,
      attachmentNames: params.attachmentNames,
    });
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        setError('تعذر فتح نافذة الطباعة من المتصفح.');
      }
    };
    iframe.srcdoc = html;
  }

  async function handleExportReply(params: {
    id: string;
    format: 'pdf' | 'doc' | 'md' | 'txt';
    title: string;
    content: string;
    createdAt?: string;
    attachmentNames?: string[];
  }) {
    const busyKey = `${params.id}-${params.format}`;
    setExportingKey(busyKey);
    setExportMenuId(null);
    setError(null);

    const slugDate = (params.createdAt || new Date().toISOString()).slice(0, 10);
    try {
      if (params.format === 'pdf') {
        const res = await fetch('/api/platform-chat/export-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: params.title,
            content: params.content,
            createdAt: params.createdAt,
            projectName: activeProject?.name,
            attachmentNames: params.attachmentNames,
          }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.error || 'فشل توليد ملف PDF.');
        }
        const blob = await res.blob();
        downloadBlobFile(blob, `helbawey-reply-${slugDate}.pdf`);
      } else if (params.format === 'doc') {
        const docHtml = buildPrintableHtmlDocument({
          title: params.title,
          content: params.content,
          createdAt: params.createdAt,
          projectName: activeProject?.name,
          attachmentNames: params.attachmentNames,
          forWord: true,
        });
        downloadBlobFile(
          new Blob(['\uFEFF', docHtml], { type: 'application/msword;charset=utf-8' }),
          `helbawey-reply-${slugDate}.doc`
        );
      } else if (params.format === 'md') {
        const header = `# ${params.title}\n\n${
          activeProject ? `- **المشروع:** ${activeProject.name}\n` : ''
        }${
          params.attachmentNames?.length
            ? `- **المستندات المرفقة:** ${params.attachmentNames.join('، ')}\n`
            : ''
        }- **التاريخ:** ${new Date(params.createdAt || Date.now()).toLocaleString('ar-EG')}\n\n---\n\n`;
        downloadBlobFile(
          new Blob(['\uFEFF', header + params.content], { type: 'text/markdown;charset=utf-8' }),
          `helbawey-reply-${slugDate}.md`
        );
      } else {
        const plain = stripMarkdownToPlainText(params.content);
        downloadBlobFile(
          new Blob(['\uFEFF', plain], { type: 'text/plain;charset=utf-8' }),
          `helbawey-reply-${slugDate}.txt`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تصدير الملف.');
    } finally {
      setExportingKey(null);
    }
  }

  function buildFullTranscriptMarkdown(): string {
    return messages
      .map((m) => {
        const speaker = m.role === 'user' ? 'المستخدم' : 'منصة الهلباوي';
        const time = new Date(m.createdAt).toLocaleString('ar-EG');
        const attLine =
          m.attachments && m.attachments.length > 0
            ? `\n*المرفقات:* ${m.attachments.map((a) => `${a.name} (${a.summaryNoteAr || a.kind})`).join('، ')}\n`
            : '';
        return `## ${speaker} (${time})${attLine}\n\n${m.content}`;
      })
      .join('\n\n---\n\n');
  }

  const isDrawer = variant === 'drawer';

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setIsDragging(false);
        }
      }}
      onDrop={handleDrop}
      className={`relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden ${
        isDrawer
          ? 'h-full rounded-none sm:rounded-l-2xl shadow-2xl'
          : 'rounded-xl h-[calc(100vh-11.5rem)] min-h-[560px]'
      }`}
    >
      {/* Hidden iframe for iFrame-safe printing */}
      <iframe
        ref={printFrameRef}
        title="طباعة رد المنصة"
        className="hidden"
        aria-hidden="true"
      />

      {/* Drag & Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-30 bg-slate-900/75 backdrop-blur-xs flex flex-col items-center justify-center gap-3 text-white p-6 text-center pointer-events-none">
          <div className="w-14 h-14 rounded-2xl bg-white/15 border border-white/30 flex items-center justify-center">
            <UploadCloud className="w-7 h-7" />
          </div>
          <p className="text-sm font-bold">أفلت المستندات هنا لقراءتها وتحليلها فوراً</p>
          <p className="text-xs text-slate-200 max-w-md">
            يدعم PDF، Word (.docx)، Excel (.xlsx/.csv)، PowerPoint (.pptx)، الصور الممسوحة، JSON، XML، والملفات النصية والبرمجية
          </p>
        </div>
      )}

      {/* Header */}
      <div className="px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 flex items-center justify-center shrink-0">
              {chatMode === 'omni-advisor' ? (
                <BrainCircuit className="w-4 h-4" />
              ) : chatMode === 'legal-expert' ? (
                <Scale className="w-4 h-4" />
              ) : chatMode === 'translator' ? (
                <Languages className="w-4 h-4" />
              ) : (
                <MessageCircle className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                {chatMode === 'omni-advisor'
                  ? 'عقل المستشار المستقل الشامل (Polymath Brain) — موسوعة العلوم والقانون والهندسة'
                  : chatMode === 'legal-expert'
                    ? 'المستشار والخبير القانوني — القوانين المحلية والدولية والعالمية'
                    : chatMode === 'translator'
                      ? 'المترجم العالمي المعتمد — ترجمة كافة لغات العالم والمستندات'
                      : 'محاورة منصة الهلباوي — قراءة وتحليل المستندات'}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {chatMode === 'omni-advisor'
                  ? 'تفكير عميق من المبادئ الأولى · ربط 7 مجالات كبرى (هندسة، قانون، اقتصاد، طب، علوم، منطق، ترجمة) · تدريب وتقطير مستمر'
                  : chatMode === 'legal-expert'
                    ? 'تحليل البيانات والعقود · الربط التشريعي · الاستشارات والمذكرات · ذاكرة حديدية دائمة'
                    : chatMode === 'translator'
                      ? `ترجمة دقيقة إلى ${effectiveTargetLang} وكافة لغات العالم مع حفظ المعجم في الذاكرة الحديدية`
                      : includeContext && activeProject
                        ? `متصل بسياق: ${activeProject.name} · يدعم PDF / Word / Excel / الصور / الكود`
                        : 'حوار حر وتحليل شامل لكافة أنواع المستندات المرفقة'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {onOpenBrainSelector && (
              <button
                type="button"
                onClick={onOpenBrainSelector}
                title="تبديل العقل أو مقارنة عقل جيميني بعقل المستشار عطيه الهلباوى المستقبل"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                  activeBrain === 'attia-advisor'
                    ? 'border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                    : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <BrainCircuit className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {activeBrain === 'attia-advisor'
                    ? 'العقل: المستشار عطيه المستقبل'
                    : 'العقل: جيميني القياسي'}
                </span>
              </button>
            )}

            {onOpenTrainingOffice && (
              <button
                type="button"
                onClick={() => onOpenTrainingOffice(activeBrain)}
                title="فتح مكتب التدريب والتطوير الاحترافي المرتبط بالعقل النشط"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-bold cursor-pointer whitespace-nowrap shrink-0 transition-colors"
              >
                <GraduationCap className="w-3.5 h-3.5 shrink-0" />
                <span>تطوير العقل وتدريبي</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setOmniTrainOpen((v) => !v)}
              title="تدريب عقل المستشار المستقل على المنهج الموسوعي أو مجال جديد وحفظه في الذاكرة ومكتبة التدريب"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                omniTrainOpen
                  ? 'border-emerald-700 bg-emerald-700 text-white dark:border-emerald-500 dark:bg-emerald-500 dark:text-slate-950'
                  : 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5 shrink-0" />
              <span>تدريب العقل الشامل</span>
            </button>

            <button
              type="button"
              onClick={() => setMemoryOpen((v) => !v)}
              title="فتح لوحة الذاكرة الحديدية الدائمة للمحاور"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                memoryOpen
                  ? 'border-slate-900 dark:border-slate-100 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Database className="w-3.5 h-3.5 shrink-0" />
              <span>الذاكرة الحديدية</span>
              <span className="font-mono tabular-nums opacity-80">({memoryItems.length})</span>
            </button>

            <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 cursor-pointer select-none px-2 py-1 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 whitespace-nowrap shrink-0">
              <input
                type="checkbox"
                checked={includeContext}
                onChange={(e) => setIncludeContext(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span>سياق المشروع</span>
            </label>

            {messages.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    handlePrintDocument({
                      title:
                        chatMode === 'omni-advisor'
                          ? 'تقرير المستشار المستقل الشامل — منصة الهلباوي'
                          : chatMode === 'legal-expert'
                            ? 'ملف الاستشارات والمذكرات القانونية — منصة الهلباوي'
                            : chatMode === 'translator'
                              ? 'وثيقة الترجمة المعتمدة — منصة الهلباوي'
                              : 'سجل المحاورة الكامل — منصة الهلباوي',
                      content: buildFullTranscriptMarkdown(),
                    })
                  }
                  disabled={streaming}
                  title="طباعة كامل المحادثة"
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">طباعة الكل</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void handleExportReply({
                      id: 'full-chat',
                      format: 'pdf',
                      title:
                        chatMode === 'omni-advisor'
                          ? 'سجل تحليلات المستشار المستقل الشامل — منصة الهلباوي'
                          : chatMode === 'legal-expert'
                            ? 'سجل الاستشارات والمذكرات القانونية — منصة الهلباوي'
                            : chatMode === 'translator'
                              ? 'وثيقة الترجمة المعتمدة — منصة الهلباوي'
                              : 'سجل المحاورة والتحليل الكامل — منصة الهلباوي',
                      content: buildFullTranscriptMarkdown(),
                    })
                  }
                  disabled={streaming || exportingKey === 'full-chat-pdf'}
                  title="تصدير كامل المحادثة PDF"
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  {exportingKey === 'full-chat-pdf' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden sm:inline">تصدير PDF</span>
                </button>

                <button
                  type="button"
                  onClick={handleClearHistory}
                  disabled={clearing || streaming}
                  title="تفريغ ساحة الحوار الحالية مع بقاء الذاكرة الحديدية محفوظة"
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>محادثة جديدة</span>
                </button>
              </>
            )}

            {isDrawer && onCloseDrawer && (
              <button
                type="button"
                onClick={onCloseDrawer}
                aria-label="إغلاق المحادثة"
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Mode & Specialization Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-200/70 dark:border-slate-800/70">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setChatMode('omni-advisor')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                chatMode === 'omni-advisor'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <BrainCircuit className="w-3.5 h-3.5 shrink-0" />
              <span>المستشار الشامل المستقل</span>
            </button>
            <button
              type="button"
              onClick={() => setChatMode('legal-expert')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                chatMode === 'legal-expert'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Scale className="w-3.5 h-3.5 shrink-0" />
              <span>الخبير القانوني</span>
            </button>
            <button
              type="button"
              onClick={() => setChatMode('translator')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                chatMode === 'translator'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Languages className="w-3.5 h-3.5 shrink-0" />
              <span>المترجم العالمي</span>
            </button>
            <button
              type="button"
              onClick={() => setChatMode('general')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                chatMode === 'general'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <MessageCircle className="w-3.5 h-3.5 shrink-0" />
              <span>حوار المنصة العام</span>
            </button>
          </div>

          {(chatMode === 'omni-advisor' || chatMode === 'legal-expert') && (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] text-slate-500 whitespace-nowrap hidden sm:inline">
                الاختصاص القانوني المرجعي:
              </span>
              <select
                value={jurisdictionScope}
                onChange={(e) => setJurisdictionScope(e.target.value as LegalJurisdictionScope)}
                aria-label="الاختصاص القانوني المرجعي"
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-slate-800 dark:text-slate-200 max-w-[270px]"
              >
                {JURISDICTION_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {chatMode === 'translator' && (
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              <select
                value={translationSourceLang}
                onChange={(e) => setTranslationSourceLang(e.target.value)}
                aria-label="اللغة المصدر"
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1 text-[11px] font-medium text-slate-800 dark:text-slate-200"
              >
                <option value="auto">المصدر: كشف تلقائي</option>
                {WORLD_LANGUAGES_UI.filter((l) => l.code !== '__custom__').map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    من: {lang.label}
                  </option>
                ))}
              </select>

              <span className="text-[11px] text-slate-400">←</span>

              <select
                value={translationTargetLang}
                onChange={(e) => setTranslationTargetLang(e.target.value)}
                aria-label="اللغة المستهدفة للترجمة"
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1 text-[11px] font-medium text-slate-800 dark:text-slate-200"
              >
                {WORLD_LANGUAGES_UI.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    إلى: {lang.label}
                  </option>
                ))}
              </select>

              {translationTargetLang === '__custom__' && (
                <input
                  type="text"
                  value={customTargetLang}
                  onChange={(e) => setCustomTargetLang(e.target.value)}
                  placeholder="اكتب أي لغة عالمية..."
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-[11px] w-36"
                />
              )}

              <select
                value={translationStyle}
                onChange={(e) => setTranslationStyle(e.target.value as TranslationStyle)}
                aria-label="أسلوب الترجمة"
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1 text-[11px] font-medium text-slate-800 dark:text-slate-200"
              >
                {TRANSLATION_STYLE_OPTIONS.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Collapsible Omni-Advisor Curriculum Training Panel */}
      {omniTrainOpen && (
        <div className="border-b border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 px-4 sm:px-5 py-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  مركز تدريب وتقطير «عقل المستشار المستقل الشامل»
                </h3>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  يربط التدريب بين تثبيت القواعد الذهنية في الذاكرة الحديدية وحفظ أمثلة Chain-of-Thought في مكتبة التدريب
                  SFT.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={trainingOmni}
                onClick={() => void handleTrainOmniBrain('seed-master')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-semibold cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {trainingOmni ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>تلقيم المنهج الموسوعي الشامل (6 تخصصات كبرى)</span>
              </button>
              <button
                type="button"
                onClick={() => setOmniTrainOpen(false)}
                aria-label="إغلاق لوحة تدريب العقل الشامل"
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-white dark:hover:bg-slate-900 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input
              type="text"
              value={omniDomainInput}
              onChange={(e) => setOmniDomainInput(e.target.value)}
              placeholder="اسم التخصص أو المجال المراد تدريبه (مثال: الطاقة المتجددة / الجراحة العصبية / الهندسة المالية)..."
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
            />
            <input
              type="text"
              value={omniContentInput}
              onChange={(e) => setOmniContentInput(e.target.value)}
              placeholder="أدخل قاعدة، منهجاً، وثيقة مرجعية، أو مبدأً علمياً ليقطّره المستشار ويحفظه..."
              className="md:col-span-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              ملاحظة: يحدّث هذا المسار عقل الحوار والذاكرة الحديدية ومجموعة تدريب{' '}
              <code className="font-mono">ds-omni-advisor-polymath</code> (التدريب السحابي المرجعي دون أوزان GGUF محلية
              على القرص).
            </span>
            <button
              type="button"
              disabled={trainingOmni || (!omniDomainInput.trim() && !omniContentInput.trim())}
              onClick={() => void handleTrainOmniBrain('custom-domain')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-[11px] font-semibold cursor-pointer disabled:opacity-45 whitespace-nowrap shrink-0"
            >
              {trainingOmni ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <BrainCircuit className="w-3.5 h-3.5" />
              )}
              <span>تدريب وحفظ التخصص المخصص</span>
            </button>
          </div>

          {omniTrainNotice && (
            <div className="p-2.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-900 text-[11px] text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{omniTrainNotice}</span>
            </div>
          )}
        </div>
      )}

      {/* Collapsible Ironclad Persistent Memory Vault */}
      {memoryOpen && (
        <IroncladMemoryPanel
          items={memoryItems}
          archiveSummary={archiveSummary}
          historyCount={historyCount}
          loading={memoryLoading}
          onAddItem={handleAddMemoryItem}
          onTogglePin={handleTogglePinMemory}
          onDeleteItem={handleDeleteMemoryItem}
          onClearAllMemory={handleClearAllMemory}
          onClose={() => setMemoryOpen(false)}
        />
      )}

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
        {messages.length === 0 && !streaming && (
          <div className="max-w-2xl mx-auto py-6 text-center space-y-5">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
              {chatMode === 'omni-advisor' ? (
                <BrainCircuit className="w-5 h-5" />
              ) : chatMode === 'legal-expert' ? (
                <Scale className="w-5 h-5" />
              ) : chatMode === 'translator' ? (
                <Languages className="w-5 h-5" />
              ) : (
                <Sparkles className="w-5 h-5" />
              )}
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {chatMode === 'omni-advisor'
                  ? 'عقل المستشار المستقل الشامل — جاهز للاستدلال متعدد التخصصات وحل أعقد المسائل'
                  : chatMode === 'legal-expert'
                    ? 'المستشار القانوني الذكي — جاهز للاستشارات، المذكرات، وتحليل البيانات القانونية'
                    : chatMode === 'translator'
                      ? 'المترجم العالمي المعتمد — ترجمة فورية لكل لغات العالم والمستندات'
                      : 'أهلاً بك! تحاور مع المنصة وأرفق أي مستند لقراءته وتحليله'}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {chatMode === 'omni-advisor'
                  ? 'يجمع بين الهندسة والأمن السيبراني، العلوم والرياضيات، الاقتصاد ونظرية الألعاب، القانون العالمي والمحلي، الطب المبني على الأدلة، والترجمة الكونية؛ ويعمل ببروتوكول التفكير العميق من المبادئ الأولى والنقد المضاد مع ذاكرة حديدية دائمة.'
                  : chatMode === 'legal-expert'
                    ? 'اربط وقائعك أو عقودك ومستنداتك (PDF / Word / Excel / صور) بالقوانين المحلية والعربية والقانون الدولي والتشريعات العالمية المقارنة، مع ذاكرة حديدية دائمة لا تنسى التفاصيل.'
                    : chatMode === 'translator'
                      ? 'ترجم النصوص والعقود والملفات المرفقة من وإلى جميع لغات العالم بدقة قانونية وتقنية عالية، مع حفظ معجمك المعتمد تلقائياً في الذاكرة الحديدية الدائمة.'
                      : 'أرفق ملفات PDF أو Word أو جداول Excel/CSV أو عروض PowerPoint أو الصور الممسوحة أو ملفات الكود وJSON، وسيقوم العقل التحليلي بقراءتها وإعداد مخرجات قابلة للنسخ والطباعة والتصدير.'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-right">
              {(chatMode === 'omni-advisor'
                ? OMNI_CONVERSATION_STARTERS
                : chatMode === 'legal-expert'
                  ? LEGAL_CONVERSATION_STARTERS
                  : chatMode === 'translator'
                    ? TRANSLATOR_CONVERSATION_STARTERS
                    : GENERAL_CONVERSATION_STARTERS
              ).map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => void handleSend(starter)}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-slate-400 dark:hover:border-slate-600 text-xs text-slate-700 dark:text-slate-300 transition-colors cursor-pointer text-right leading-relaxed"
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, msgIdx) => {
          const isUser = msg.role === 'user';
          const linkedAttachments = isUser ? [] : findPreviousAttachments(messages, msgIdx);
          const replyTitle =
            linkedAttachments.length > 0
              ? msg.chatMode === 'omni-advisor'
                ? `دراسة المستشار الشامل للمستندات: ${linkedAttachments.join('، ')}`
                : msg.chatMode === 'legal-expert'
                  ? `دراسة ومذكرة قانونية للمستندات: ${linkedAttachments.join('، ')}`
                  : msg.chatMode === 'translator'
                    ? `ترجمة معتمدة للمستندات: ${linkedAttachments.join('، ')}`
                    : `تحليل المستندات: ${linkedAttachments.join('، ')}`
              : msg.chatMode === 'omni-advisor'
                ? 'رأي استشاري شامل متعدد التخصصات — منصة الهلباوي'
                : msg.chatMode === 'legal-expert'
                  ? 'استشارة ومذكرة قانونية — منصة الهلباوي'
                  : msg.chatMode === 'translator'
                    ? 'ترجمة معتمدة — منصة الهلباوي'
                    : 'مخرجات محاورة منصة الهلباوي';

          return (
            <div
              key={msg.id}
              className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                  isUser
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                    : 'bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                }`}
              >
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              <div
                className={`max-w-[88%] sm:max-w-[84%] rounded-2xl px-4 py-3 text-xs leading-relaxed space-y-2.5 ${
                  isUser
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-tr-sm'
                    : 'bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-sm'
                }`}
              >
                {/* Attachments inside User Message */}
                {isUser && msg.attachments && msg.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pb-1">
                    {msg.attachments.map((att) => (
                      <div
                        key={att.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 dark:bg-slate-900/10 border border-white/20 dark:border-slate-900/20 text-[11px]"
                      >
                        <AttachmentKindIcon kind={att.kind} />
                        <span className="font-medium max-w-[180px] truncate">{att.name}</span>
                        <span className="opacity-75 text-[10px]">
                          ({att.summaryNoteAr || formatFileSize(att.sizeBytes)})
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Body */}
                {isUser ? (
                  <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                ) : (
                  <ChatMarkdownContent content={msg.content} />
                )}

                {/* Footer & Copy / Print / Export Toolbar */}
                <div
                  className={`pt-1.5 border-t flex flex-wrap items-center justify-between gap-2 text-[10px] ${
                    isUser
                      ? 'border-white/15 dark:border-slate-900/15 text-slate-300 dark:text-slate-600'
                      : 'border-slate-200/80 dark:border-slate-800 text-slate-500'
                  }`}
                >
                  <span className="font-mono tabular-nums">
                    {new Date(msg.createdAt).toLocaleTimeString('ar-EG', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>

                  {!isUser && (
                    <div className="flex flex-wrap items-center gap-1.5 relative">
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(`${msg.id}-plain`, stripMarkdownToPlainText(msg.content))
                        }
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-400 dark:hover:border-slate-600 text-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        {copiedKey === `${msg.id}-plain` ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span>تم نسخ النص</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>نسخ النص</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopy(`${msg.id}-md`, msg.content)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-400 dark:hover:border-slate-600 text-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        {copiedKey === `${msg.id}-md` ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span>تم نسخ MD</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Markdown</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handlePrintDocument({
                            title: replyTitle,
                            content: msg.content,
                            createdAt: msg.createdAt,
                            attachmentNames: linkedAttachments,
                          })
                        }
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-400 dark:hover:border-slate-600 text-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        <Printer className="w-3 h-3" />
                        <span>طباعة</span>
                      </button>

                      <div className="relative">
                        <button
                          type="button"
                          onClick={() =>
                            setExportMenuId((prev) => (prev === msg.id ? null : msg.id))
                          }
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-semibold hover:opacity-90 cursor-pointer"
                        >
                          {exportingKey?.startsWith(`${msg.id}-`) ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Download className="w-3 h-3" />
                          )}
                          <span>تصدير</span>
                          <ChevronDown className="w-3 h-3" />
                        </button>

                        {exportMenuId === msg.id && (
                          <div className="absolute left-0 bottom-8 z-20 w-40 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl py-1 text-[11px]">
                            <button
                              type="button"
                              onClick={() =>
                                void handleExportReply({
                                  id: msg.id,
                                  format: 'pdf',
                                  title: replyTitle,
                                  content: msg.content,
                                  createdAt: msg.createdAt,
                                  attachmentNames: linkedAttachments,
                                })
                              }
                              className="w-full text-right px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 flex items-center justify-between cursor-pointer"
                            >
                              <span>تصدير PDF</span>
                              <span className="font-mono text-[10px] text-rose-600">.pdf</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void handleExportReply({
                                  id: msg.id,
                                  format: 'doc',
                                  title: replyTitle,
                                  content: msg.content,
                                  createdAt: msg.createdAt,
                                  attachmentNames: linkedAttachments,
                                })
                              }
                              className="w-full text-right px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 flex items-center justify-between cursor-pointer"
                            >
                              <span>تصدير Word</span>
                              <span className="font-mono text-[10px] text-sky-600">.doc</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void handleExportReply({
                                  id: msg.id,
                                  format: 'md',
                                  title: replyTitle,
                                  content: msg.content,
                                  createdAt: msg.createdAt,
                                  attachmentNames: linkedAttachments,
                                })
                              }
                              className="w-full text-right px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 flex items-center justify-between cursor-pointer"
                            >
                              <span>تصدير Markdown</span>
                              <span className="font-mono text-[10px] text-slate-500">.md</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void handleExportReply({
                                  id: msg.id,
                                  format: 'txt',
                                  title: replyTitle,
                                  content: msg.content,
                                  createdAt: msg.createdAt,
                                  attachmentNames: linkedAttachments,
                                })
                              }
                              className="w-full text-right px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 flex items-center justify-between cursor-pointer"
                            >
                              <span>تصدير نص عادي</span>
                              <span className="font-mono text-[10px] text-slate-500">.txt</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Active Streaming Assistant Bubble */}
        {streaming && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300">
              <Bot className="w-4 h-4" />
            </div>
            <div className="max-w-[84%] rounded-2xl rounded-tl-sm px-4 py-3 text-xs leading-relaxed bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
              {streamingText ? (
                <ChatMarkdownContent content={streamingText} />
              ) : (
                <div className="inline-flex items-center gap-2 text-slate-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>يقرأ ويحلل المحتوى الآن...</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Error Notice */}
      {error && (
        <div
          role="alert"
          className="mx-4 mb-2 p-3 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-800 dark:text-rose-200 flex items-start justify-between gap-2"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="p-0.5 text-rose-600 dark:text-rose-300 cursor-pointer"
            aria-label="إغلاق التنبيه"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Pending Attachments Strip + Analytical Quick Prompts */}
      {pendingFiles.length > 0 && (
        <div className="px-3.5 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {pendingFiles.map((file) => (
              <div
                key={file.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] text-slate-800 dark:text-slate-200"
              >
                <AttachmentKindIcon kind={file.kindHint} />
                <span className="font-medium max-w-[170px] truncate">{file.name}</span>
                <span className="text-[10px] text-slate-500 tabular-nums">
                  ({formatFileSize(file.sizeBytes)})
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPendingFiles((prev) => prev.filter((item) => item.id !== file.id))
                  }
                  aria-label={`إزالة ${file.name}`}
                  className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(chatMode === 'omni-advisor'
              ? OMNI_DOC_QUICK_PROMPTS
              : chatMode === 'legal-expert'
                ? LEGAL_DOC_QUICK_PROMPTS
                : chatMode === 'translator'
                  ? TRANSLATOR_DOC_QUICK_PROMPTS
                  : GENERAL_DOC_QUICK_PROMPTS
            ).map((qPrompt) => (
              <button
                key={qPrompt}
                type="button"
                disabled={streaming}
                onClick={() => void handleSend(qPrompt)}
                className="px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900 hover:border-emerald-400 text-[11px] text-emerald-800 dark:text-emerald-300 cursor-pointer disabled:opacity-50"
              >
                {qPrompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
        className="p-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-end gap-2"
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS}
          onChange={(e) => {
            if (e.target.files?.length) {
              void addFilesToPending(e.target.files);
              e.target.value = '';
            }
          }}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={streaming || pendingFiles.length >= MAX_FILES_PER_MSG}
          title="إرفاق مستندات (PDF, Word, Excel, CSV, PowerPoint, صور, JSON, كود...)"
          aria-label="إرفاق مستندات"
          className="h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer disabled:opacity-45 shrink-0"
        >
          <Paperclip className="w-4 h-4" />
          <span className="hidden sm:inline">إرفاق مستند</span>
        </button>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          rows={2}
          disabled={streaming}
          placeholder={
            chatMode === 'omni-advisor'
              ? 'اسأل المستشار المستقل الشامل في أي علم أو معضلة هندسية/قانونية/مالية/طبية/استراتيجية أو أرفق ملفاً...'
              : chatMode === 'legal-expert'
                ? 'اطلب استشارة قانونية، صياغة مذكرة أو لائحة، أو أرفق عقداً/مستنداً للربط بالقوانين المحلية والدولية والعالمية...'
                : chatMode === 'translator'
                  ? `الصق النص أو أرفق أي مستند لترجمته فوراً إلى ${effectiveTargetLang} أو أي لغة عالمية أخرى...`
                  : 'اكتب رسالتك أو اسحب وأفلت أي مستند هنا (PDF, Word, Excel, صور, كود)...'
          }
          className="flex-1 resize-none rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-400 disabled:opacity-60"
        />

        <button
          type="submit"
          disabled={streaming || (!input.trim() && pendingFiles.length === 0)}
          aria-label="إرسال الرسالة"
          className="h-10 px-4 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-slate-800 dark:hover:bg-slate-200 cursor-pointer disabled:opacity-45 shrink-0"
        >
          {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          <span>إرسال</span>
        </button>
      </form>
    </div>
  );
}
