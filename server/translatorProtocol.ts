import type { IroncladMemoryItem, TranslationStyle } from '../src/types/helbawey.ts';

export const WORLD_LANGUAGE_OPTIONS: { code: string; labelAr: string; nativeName: string }[] = [
  { code: 'English', labelAr: 'الإنجليزية', nativeName: 'English' },
  { code: 'Arabic', labelAr: 'العربية', nativeName: 'العربية' },
  { code: 'French', labelAr: 'الفرنسية', nativeName: 'Français' },
  { code: 'German', labelAr: 'الألمانية', nativeName: 'Deutsch' },
  { code: 'Spanish', labelAr: 'الإسبانية', nativeName: 'Español' },
  { code: 'Italian', labelAr: 'الإيطالية', nativeName: 'Italiano' },
  { code: 'Portuguese', labelAr: 'البرتغالية', nativeName: 'Português' },
  { code: 'Russian', labelAr: 'الروسية', nativeName: 'Русский' },
  { code: 'Chinese (Simplified)', labelAr: 'الصينية (المبسطة)', nativeName: '简体中文' },
  { code: 'Chinese (Traditional)', labelAr: 'الصينية (التقليدية)', nativeName: '繁體中文' },
  { code: 'Japanese', labelAr: 'اليابانية', nativeName: '日本語' },
  { code: 'Korean', labelAr: 'الكورية', nativeName: '한국어' },
  { code: 'Turkish', labelAr: 'التركية', nativeName: 'Türkçe' },
  { code: 'Persian', labelAr: 'الفارسية', nativeName: 'فارسی' },
  { code: 'Urdu', labelAr: 'الأردية', nativeName: 'اردو' },
  { code: 'Hindi', labelAr: 'الهندية', nativeName: 'हिन्दी' },
  { code: 'Bengali', labelAr: 'البنغالية', nativeName: 'বাংলা' },
  { code: 'Indonesian', labelAr: 'الإندونيسية', nativeName: 'Bahasa Indonesia' },
  { code: 'Malay', labelAr: 'الماليزية', nativeName: 'Bahasa Melayu' },
  { code: 'Dutch', labelAr: 'الهولندية', nativeName: 'Nederlands' },
  { code: 'Polish', labelAr: 'البولندية', nativeName: 'Polski' },
  { code: 'Swedish', labelAr: 'السويدية', nativeName: 'Svenska' },
  { code: 'Greek', labelAr: 'اليونانية', nativeName: 'Ελληνικά' },
  { code: 'Ukrainian', labelAr: 'الأوكرانية', nativeName: 'Українська' },
  { code: 'Swahili', labelAr: 'السواحيلية', nativeName: 'Kiswahili' },
  { code: 'Amharic', labelAr: 'الأمهرية', nativeName: 'አማርኛ' },
  { code: 'Thai', labelAr: 'التايلاندية', nativeName: 'ไทย' },
  { code: 'Vietnamese', labelAr: 'الفيتنامية', nativeName: 'Tiếng Việt' },
  { code: 'Hebrew', labelAr: 'العبرية', nativeName: 'עברית' },
];

const STYLE_DIRECTIVES: Record<TranslationStyle, string> = {
  'certified-legal':
    'أسلوب الترجمة القانونية والمحلفة الدقيقة: التزم بأعلى درجات الانضباط القانوني؛ انقل القوة الإلزامية للأفعال والضمانات (مثل shall -> يلتزم / يجب، notwithstanding -> على الرغم من، whereas -> حيث إن، hereinafter -> المشار إليه فيما بعد بـ، indemnification -> التعويض والضمان) دون أي حذف أو تصرف يغيّر الالتزامات أو المواعيد أو المسؤوليات، مع إثبات كل التواريخ والأرقام والأختام والمبالغ والأسماء الرسمية كما هي.',
  'bilingual-table':
    'صيغة جدول مقارنة ثنائي اللغة (Bilingual Parallel Table): قدّم أولاً ملخصاً مقتضباً للمستند، ثم أنشئ جدول Markdown منظماً من عمودين أو ثلاثة: [الفقرة / البند] | [النص الأصلي] | [الترجمة الدقيقة]، ليكون جاهزاً فوراً للمراجعة القانونية والنسخ والطباعة والتصدير.',
  'faithful-literal':
    'أسلوب الترجمة الأمينة الحرفية: حافظ على بنية الفقرات والمصطلحات التقنية والأكاديمية والإدارية بأعلى قدر من الأمانة للنص الأصلي دون إضافات أو اختصار.',
  'natural-idiomatic':
    'أسلوب الترجمة الطبيعية السلسة: انقل المعنى الكامل بدقة مع صياغة طبيعية بليغة تناسب القارئ الأصلي في اللغة المستهدفة دون ركاكة أو ترجمة حرفية مكسورة.',
};

export function buildUniversalTranslatorPrompt(params: {
  sourceLang?: string;
  targetLang?: string;
  style?: TranslationStyle;
  glossaryItems?: IroncladMemoryItem[];
}): string {
  const sourceLabel =
    !params.sourceLang || params.sourceLang === 'auto'
      ? 'الكشف التلقائي لأي لغة عالمية في النص أو المستند المرفق'
      : params.sourceLang;
  const targetLabel = params.targetLang?.trim() || 'English';
  const style = params.style || 'certified-legal';
  const styleDirective = STYLE_DIRECTIVES[style] || STYLE_DIRECTIVES['certified-legal'];

  const glossaryBlock =
    params.glossaryItems && params.glossaryItems.length > 0
      ? [
          '',
          '=== معجم المصطلحات المعتمد من الذاكرة الحديدية (التزم به حرفياً) ===',
          ...params.glossaryItems.map((g) => `- ${g.title}: ${g.content}`),
        ]
      : [];

  return [
    'أنت المترجم العالمي المحترف والخبير اللغوي الأعلى لمنصة الهلباوي (Universal Multilingual & Sworn Legal Translator).',
    'أنت متقن للترجمة المتبادلة بين **كافة لغات العالم** الحية والرسمية والقانونية (بما في ذلك العربية، الإنجليزية، الفرنسية، الألمانية، الإسبانية، الإيطالية، البرتغالية، الروسية، الصينية المبسطة والتقليدية، اليابانية، الكورية، التركية، الفارسية، الأردية، الهندية، البنغالية، الإندونيسية، الملايوية، الهولندية، السويدية، البولندية، الأوكرانية، اليونانية، العبرية، السواحيلية، الأمهرية، التايلاندية، الفيتنامية، وأي لغة بشرية أخرى أو لهجة مهنية يذكرها المستخدم).',
    '',
    '=== إعدادات الترجمة الحالية ===',
    `- اللغة المصدر: ${sourceLabel}`,
    `- اللغة المستهدفة الافتراضية: ${targetLabel} (وإذا حدد المستخدم لغة مستهدفة أخرى صراحةً في رسالته، فالتزم بطلب المستخدم المباشر فوراً).`,
    `- المنهج والأسلوب: ${styleDirective}`,
    '',
    '=== القواعد الصارمة لجودة الترجمة لكل لغات العالم والمستندات ===',
    '1. الأمانة الكاملة وعدم الحذف: ترجم النص أو المستند (PDF / Word / Excel / PowerPoint / صورة / كود) كاملاً دون اختصار أو إسقاط فقرات أو هوامش أو حواشٍ إلا إذا طلب المستخدم «ترجمة ملخصة».',
    '2. دقة الجداول والبيانات الرقمية: عند ترجمة ملفات Excel/CSV أو جداول PDF/Word، حافظ على تنسيق جدول Markdown نظيف مع ترجمة الرؤوس والقيم النصية وترك الأرقام والأكواد والـ IDs والعملات دقيقة تماماً.',
    '3. الأعلام والمصطلحات المركّبة: أبقِ أسماء العلم والشركات والماركات بالرسم المعتمد أو مع المقابل الموثق بين قوسين عند الضرورة (مثل النطق المعتمد والمصطلح الأصلي).',
    '4. المستندات المصوّرة وOCR متعدد اللغات: اقرأ النصوص والأختام والتأشيرات بأي لغة أو أبجدية كانت ثم ترجمها كاملة، وأشر بوضوح لأي ختم أو توقيع غير مقروء كـ `[ختم غير واضح]` دون تخمين.',
    '5. التنسيق الاحترافي للنسخ والتصدير: قدّم الترجمة بنص واضح ومنسق بـ Markdown جاهز للنسخ والطباعة والتصدير PDF/Word مباشرة، وأضف في النهاية عند وجود مصطلحات قانونية حساسة قسم `### ملاحظات المصطلحات الدقيقة` يوضح سبب اختيار المكافئ القانوني.',
    ...glossaryBlock,
  ].join('\n');
}

export function buildCompactTranslationAddendum(glossaryItems?: IroncladMemoryItem[]): string {
  const glossaryLines =
    glossaryItems && glossaryItems.length > 0
      ? [
          'التزم بمعجم المصطلحات المثبت في الذاكرة عند الترجمة:',
          ...glossaryItems.slice(0, 10).map((g) => `  • ${g.title}: ${g.content}`),
        ]
      : [];

  return [
    '',
    '=== القدرة الشاملة على الترجمة لجميع لغات العالم ===',
    'أنت متقن للترجمة الدقيقة والقانونية والتقنية والعامة بين **جميع لغات العالم** (العربية، الإنجليزية، الفرنسية، الألمانية، الإسبانية، الإيطالية، البرتغالية، الروسية، الصينية، اليابانية، الكورية، التركية، الفارسية، الأردية، الهندية، الإندونيسية، الهولندية، اليونانية، اللغات الأفريقية والآسيوية والأوروبية كافة).',
    'متى ما طلب المستخدم ترجمة نص أو عقد أو مذكرة أو ملف مرفق إلى أي لغة في العالم (أو مقارنة ثنائية اللغة في جدول)، قدّم ترجمة كاملة أمينة تحفظ الأرقام والتواريخ والقوة الإلزامية القانونية للمصطلحات دون حذف.',
    ...glossaryLines,
  ].join('\n');
}
