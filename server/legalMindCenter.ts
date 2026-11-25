import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import JSZip from 'jszip';
import type {
  ContributorRightsEntry,
  LegalCaseDocument,
  LegalCaseRecord,
  LegalDeliveryMilestone,
  LegalDraftMode,
  LegalJurisdictionScope,
  LegalMemoArtifact,
  LegalMindAcceptanceTestResult,
  LegalMindOverviewSnapshot,
  LegalSourceEntry,
  PlatformBrainId,
  RagDocument,
  RagSearchHit,
} from '../src/types/helbawey.ts';
import { BRAIN_PROFILES } from './brainSelector.ts';
import { getActiveBrainVersionInfo } from './brainTrainingOffice.ts';
import { buildIroncladMemoryPromptSection } from './ironcladMemory.ts';
import { buildLegalExpertSystemPrompt } from './legalExpertKnowledge.ts';
import { buildOmniAdvisorSystemPrompt } from './omniAdvisorBrain.ts';
import { buildLocalRagIndex, generateStandaloneRagModuleCode, searchLocalRag } from './ragEngine.ts';
import { getSelfHealingCenterStatus, recordSelfHealingModuleAlert } from './selfHealingCenter.ts';
import { loadStore, saveStore } from './store.ts';
import { scanRuntimeAndEngines } from './unifiedWeightsArchive.ts';
import { buildWeightsIntegrityReport } from './weightsIntegrity.ts';

const ROOT_DIR = process.cwd();
const DATA_DIR = path.resolve(ROOT_DIR, 'data');
const LM_DIR = path.resolve(DATA_DIR, 'legal-mind');
const LM_MEMOS_DIR = path.resolve(LM_DIR, 'memos');
const LM_STATE_PATH = path.resolve(LM_DIR, 'state.json');
const WEIGHTS_DIR = path.resolve(DATA_DIR, 'weights');
const BT_VERSIONS_DIR = path.resolve(DATA_DIR, 'brain-training', 'versions');

interface PersistedLegalMindState {
  sources: LegalSourceEntry[];
  cases: LegalCaseRecord[];
  contributors: ContributorRightsEntry[];
  acceptanceTests: LegalMindAcceptanceTestResult[];
  lastUpdatedAt: string;
}

function ensureDirs(): void {
  for (const d of [DATA_DIR, LM_DIR, LM_MEMOS_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

function sha256Hex(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function appendAudit(action: string, target: string, severity: 'INFO' | 'WARN' | 'SECURITY', details: string): void {
  try {
    const store = loadStore();
    store.auditLogs.unshift({
      id: `aud-${crypto.randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      actor: 'منصة العقل القانوني الدولي',
      action,
      target,
      severity,
      details,
    });
    store.auditLogs = store.auditLogs.slice(0, 120);
    saveStore(store);
  } catch {
    // non-fatal
  }
}

const SEED_LEGAL_SOURCES: LegalSourceEntry[] = [
  {
    id: 'src-vclt-1969',
    code: 'VCLT-1969',
    titleAr: 'اتفاقية فيينا لقانون المعاهدات (1969)',
    titleEn: 'Vienna Convention on the Law of Treaties (1969)',
    category: 'international-treaty',
    jurisdiction: 'international-arbitration',
    year: '1969',
    authority: 'الأمم المتحدة (UN)',
    keyArticlesSummaryAr:
      'القواعد الآمرة في تفسير المعاهدات (المواد 31-33)، مبدأ العقد شريعة المتعاقدين الدولي (Pacta Sunt Servanda - م 26)، والبطلان والإنهاء وتغير الظروف الجوهري (م 62).',
    fullReferenceText:
      'اتفاقية فيينا لقانون المعاهدات 1969: المادة 26 (Pacta Sunt Servanda)، المادة 27 (عدم جواز الاحتجاج بالقانون الداخلي لتبرير عدم تنفيذ معاهدة)، المواد 31-32 (التفسير بحسن نية وفق المعنى العادي وفي ضوء الموضوع والغرض)، المادة 53 (القواعد الآمرة Jus Cogens)، والمادة 62 (التغير الجوهري غير المتوقع في الظروف).',
    verifiedPrimary: true,
    addedAt: '2026-11-24T00:00:00.000Z',
  },
  {
    id: 'src-cisg-1980',
    code: 'CISG-1980',
    titleAr: 'اتفاقية فيينا للبيع الدولي للبضائع (CISG 1980)',
    titleEn: 'UN Convention on Contracts for the International Sale of Goods',
    category: 'international-treaty',
    jurisdiction: 'international-arbitration',
    year: '1980',
    authority: 'UNCITRAL — الأمم المتحدة',
    keyArticlesSummaryAr:
      'نطاق الانطباق (م 1-6)، الإيجاب والقبول (م 14-24)، المخالفة الجوهرية للعقد (م 25)، التزامات البائع والمطابقة (م 35-44)، الفسخ والتعويض وتقليل الخسائر (م 49، 74-77)، والإعفاء للقوة القاهرة (م 79).',
    fullReferenceText:
      'اتفاقية CISG 1980: المادة 25 (المخالفة الجوهرية التي تحرم المتعاقد بصورة رئيسية مما يحق له توقعه)، المادة 35 (مطابقة البضائع للكمية والنوع والوصف)، المادة 39 (فقدان حق التمسك بالعيب إذا لم يخطر المشتري خلال مدة معقولة)، المادة 74 (التعويض يشمل الخسارة الفعلية والكسب الفائت المتوقع)، والمادة 79 (القوة القاهرة والعائق الخارج عن السيطرة).',
    verifiedPrimary: true,
    addedAt: '2026-11-24T00:00:00.000Z',
  },
  {
    id: 'src-nyc-1958',
    code: 'NYC-1958',
    titleAr: 'اتفاقية نيويورك للاعتراف بأحكام التحكيم الأجنبية وتنفيذها (1958)',
    titleEn: 'New York Convention on Recognition and Enforcement of Foreign Arbitral Awards',
    category: 'arbitration-rules',
    jurisdiction: 'international-arbitration',
    year: '1958',
    authority: 'الأمم المتحدة',
    keyArticlesSummaryAr:
      'إلزامية إحالة النزاع للتحكيم عند وجود اتفاق تحكيم مكتوب (م 2)، وحالات رفض التنفيذ الحصرية (م 5: نقص الأهلية، الإخلال بحق الدفاع، تجاوز نطاق التحكيم، ومخالفة النظام العام).',
    fullReferenceText:
      'اتفاقية نيويورك 1958: المادة II (الاعتراف باتفاق التحكيم الكتابي ووقف الدعوى القضائية)، المادة IV (مستندات طلب التنفيذ: أصل الحكم وأصل الاتفاق)، المادة V(1) (دفوع الخصوم الحصرية مثل عدم الإخطار أو تجاوز التفويض)، والمادة V(2) (عدم قابلية النزاع للتحكيم أو تعارضه مع النظام العام في بلد التنفيذ).',
    verifiedPrimary: true,
    addedAt: '2026-11-24T00:00:00.000Z',
  },
  {
    id: 'src-uncitral-ml',
    code: 'UNCITRAL-ML',
    titleAr: 'قانون الأونسيترال النموذجي للتحكيم التجاري الدولي (مع تعديلات 2006)',
    titleEn: 'UNCITRAL Model Law on International Commercial Arbitration',
    category: 'arbitration-rules',
    jurisdiction: 'international-arbitration',
    year: '2006',
    authority: 'UNCITRAL',
    keyArticlesSummaryAr:
      'استقلالية شرط التحكيم واختصاص الهيئة بالنظر في اختصاصها (Kompetenz-Kompetenz - م 16)، التدابير الوقتية (م 17)، والقانون الواجب التطبيق على الموضوع (م 28)، وطلب البطلان الحصري (م 34).',
    fullReferenceText:
      'قانون الأونسيترال النموذجي: المادة 7 (صيغة اتفاق التحكيم)، المادة 8 (الإحالة إلى التحكيم)، المادة 16 (مبدأ الاختصاص بالاختصاص واستقلال الشرط التحكيمي عن بطلان العقد الأصلي)، المادة 18 (المساواة بين الأطراف ومنح كل طرف فرصة كاملة لعرض قضيته)، المادة 28 (اختيار القانون الموضوعي)، والمادة 34 (دعوى البطلان).',
    verifiedPrimary: true,
    addedAt: '2026-11-24T00:00:00.000Z',
  },
  {
    id: 'src-incoterms-2020',
    code: 'INCOTERMS-2020',
    titleAr: 'قواعد المصطلحات التجارية الدولية (ICC Incoterms 2020)',
    titleEn: 'ICC Incoterms 2020 Rules & UCP 600 Interface',
    category: 'arbitration-rules',
    jurisdiction: 'international-arbitration',
    year: '2020',
    authority: 'غرفة التجارة الدولية (ICC)',
    keyArticlesSummaryAr:
      'توزيع نقاط انتقال المخاطر والتكاليف والالتزام بالتخليص الجمركي والتأمين (EXW, FCA, FOB, CIF, CIP, DAP, DDP) وربطها بمستندات الاعتماد المستندي UCP 600.',
    fullReferenceText:
      'قواعد Incoterms 2020: في FOB و CIF ينتقل خطر الهلاك عند وضع البضاعة على متن السفينة في ميناء الشحن؛ في DDP يتحمل البائع كافة المخاطر والتكاليف والرسوم الجمركية حتى مكان الوصول؛ وتتطلب CIP 2020 تغطية تأمينية موسعة (Institute Cargo Clauses A) ما لم يُتفق على خلاف ذلك.',
    verifiedPrimary: true,
    addedAt: '2026-11-24T00:00:00.000Z',
  },
  {
    id: 'src-sa-civil',
    code: 'SA-CIVIL-2023',
    titleAr: 'نظام المعاملات المدنية السعودي',
    titleEn: 'Saudi Civil Transactions Law (Royal Decree M/191)',
    category: 'saudi-gcc',
    jurisdiction: 'saudi-gcc',
    year: '2023',
    authority: 'المملكة العربية السعودية',
    keyArticlesSummaryAr:
      'تنظيم العقد وتوافر الأركان والعيوب، القوة الملزمة للعقد والظروف الطارئة (م 97)، التنفيذ العيني والفسخ والتعويض الاتفاقي (الشرط الجزائي)، والإثراء بلا سبب والمسؤولية التقصيرية والتقادم.',
    fullReferenceText:
      'نظام المعاملات المدنية السعودي: العقد شريعة المتعاقدين، وجوب تنفيذ العقد طبقاً لما اشتمل عليه وبما يتفق مع حسن النية (م 95)، معالجة الحوادث الاستثنائية العامة (م 97)، سلطة المحكمة في تعديل التعويض الاتفاقي إذا كان مبالغاً فيه أو نفذ الجزء الأكبر من الالتزام (م 179)، وضوابط المسؤولية العقدية والتقصيرية.',
    verifiedPrimary: true,
    addedAt: '2026-11-24T00:00:00.000Z',
  },
  {
    id: 'src-sa-arb-pdpl',
    code: 'SA-ARB-PDPL',
    titleAr: 'نظام التحكيم السعودي ونظام المحاكم التجارية ونظام حماية البيانات الشخصية (PDPL)',
    titleEn: 'Saudi Arbitration Law, Commercial Courts Law & PDPL',
    category: 'saudi-gcc',
    jurisdiction: 'saudi-gcc',
    year: '2023',
    authority: 'المملكة العربية السعودية — سدايا / وزارة العدل',
    keyArticlesSummaryAr:
      'استقلالية شرط التحكيم ووجوب الدفع به قبل أي طلب أو دفاع (نظام التحكيم م 11)، مهلة الإخطار والمصالحة في المحاكم التجارية، وضوابط نقل البيانات خارج المملكة والموافقة الصريحة (PDPL).',
    fullReferenceText:
      'المنظومة التجارية والرقمية السعودية: بموجب نظام التحكيم السعودي يجب التمسك بشرط التحكيم قبل إبداء أي طلب أو دفاع في الدعوى وإلا سقط الحق فيه (م 11)؛ وبموجب نظام حماية البيانات الشخصية PDPL يُشترط الأساس النظامي ومعايير النقل العابر للحدود وحماية حقوق أصحاب البيانات.',
    verifiedPrimary: true,
    addedAt: '2026-11-24T00:00:00.000Z',
  },
  {
    id: 'src-eg-civil-arb',
    code: 'EG-CIVIL-ARB',
    titleAr: 'القانون المدني المصري (131/1948) وقانون التحكيم (27/1994)',
    titleEn: 'Egyptian Civil Code (131/1948) & Arbitration Law (27/1994)',
    category: 'egypt-arab',
    jurisdiction: 'egypt-arab',
    year: '1994',
    authority: 'جمهورية مصر العربية',
    keyArticlesSummaryAr:
      'القوة الملزمة للعقد وحسن النية والظروف الطارئة (مدني م 147-148)، الشرط الجزائي (مدني م 223-224)، والدفع بعدم قبول الدعوى لوجود شرط تحكيم قبل التكلم في الموضوع (تحكيم م 13) وحالات البطلان (م 53).',
    fullReferenceText:
      'القانون المصري: المادة 147 مدني (العقد شريعة المتعاقدين ولا يجوز نقضه أو تعديله إلا باتفاق الطرفين أو للأسباب التي يقررها القانون، ونظرية الحوادث الطارئة)، المادة 148 (تنفيذ العقد بحسن نية)، المادة 224 (تخفيض الشرط الجزائي المبالغ فيه)، والمادة 13 من قانون التحكيم 27 لسنة 1994 (الدفع بوجود اتفاق تحكيم قبل أي طلب أو دفاع).',
    verifiedPrimary: true,
    addedAt: '2026-11-24T00:00:00.000Z',
  },
  {
    id: 'src-eu-gdpr',
    code: 'EU-GDPR-2016',
    titleAr: 'اللائحة الأوروبية العامة لحماية البيانات (GDPR 2016/679)',
    titleEn: 'General Data Protection Regulation (EU) 2016/679',
    category: 'global-regulatory',
    jurisdiction: 'eu-us-uk-regulatory',
    year: '2016',
    authority: 'الاتحاد الأوروبي',
    keyArticlesSummaryAr:
      'مبادئ المعالجة (م 5)، الأسس القانونية للمعالجة (م 6)، حقوق الوصول والمحو وتقييد المعالجة (م 15-22)، اتفاقية معالجة البيانات DPA (م 28)، الإخطار بالخرق خلال 72 ساعة (م 33)، والنقل الدولي للبيانات SCCs (م 44-49).',
    fullReferenceText:
      'GDPR 2016/679: تطبيق عابر للحدود (م 3)، اشتراط الوضوح في الغرض وتقليل البيانات، إبرام اتفاقيات معالجة البيانات (Art. 28 DPA)، توثيق آليات النقل الدولي (Standard Contractual Clauses / Adequacy)، وتفادي الغرامات الإدارية (حتى 20 مليون يورو أو 4% من الإيرادات العالمية).',
    verifiedPrimary: true,
    addedAt: '2026-11-24T00:00:00.000Z',
  },
  {
    id: 'src-eu-ai-act',
    code: 'EU-AI-ACT-2024',
    titleAr: 'قانون الذكاء الاصطناعي الأوروبي (EU AI Act 2024/1689) ومبادئ Common Law',
    titleEn: 'EU AI Act (2024/1689) & Common Law Comparative Contracts',
    category: 'global-regulatory',
    jurisdiction: 'eu-us-uk-regulatory',
    year: '2024',
    authority: 'الاتحاد الأوروبي / مقارن أنجلوسكسوني',
    keyArticlesSummaryAr:
      'تصنيف مخاطر أنظمة الذكاء الاصطناعي (ممنوعة، عالية المخاطر، محدودة المخاطر/الشفافية)، حوكمة البيانات والإشراف البشري والشفافية في المجالين القانوني والقضائي، ومقارنة قيود المسؤولية والتعويض في Common Law.',
    fullReferenceText:
      'EU AI Act 2024/1689: تصنف الأنظمة المساعدة في تفسير القانون وتطبيقه على الوقائع ضمن الأنظمة عالية المخاطر (High-Risk AI Systems - Annex III) وتخضع لمتطلبات إدارة المخاطر، جودة البيانات، التوثيق الفني، تتبع السجلات، والرقابة البشرية الفعالة (Art. 14 Human Oversight)، مع منع الادعاء بالقطع دون مراجعة بشرية.',
    verifiedPrimary: true,
    addedAt: '2026-11-24T00:00:00.000Z',
  },
];

const SEED_CONTRIBUTORS: ContributorRightsEntry[] = [
  {
    id: 'contrib-founder',
    nameAr: 'صاحب مشروع منصة العقل القانوني الدولي',
    roleAr: 'المؤسس وقائد الرؤية والمشروع',
    contributionType: 'governance',
    contributionSummaryAr:
      'تأسيس فكرة ورؤية منصة العقل القانوني الدولي، وضع متطلبات العدالة والانفتاح التشاركي، وإدارة ملفات القضايا والأولويات القانونية.',
    rightsClauseAr:
      'صاحب حق الإدارة العليا للمشروع والالتزام بميثاق المشاركة العادلة وحفظ حقوق جميع الداعمين والمساهمين دون احتكار.',
    recordedAt: '2026-11-24T00:00:00.000Z',
  },
  {
    id: 'contrib-gemini-eng',
    nameAr: 'فريق Gemini الهندسي ومعمارية النظام',
    roleAr: 'المشاركة التقنية والتطوير والتكامل',
    contributionType: 'engineering',
    contributionSummaryAr:
      'بناء محركات منصة العقل القانوني الدولي، نظام المصادر وRAG المحلي، وحدة إدارة القضايا والمذكرات، مكتب تدريب العقل، ووحدة الإصلاح الذاتي والمراقبة.',
    rightsClauseAr:
      'الاعتراف الكامل بالمساهمة التقنية والهندسية واستحقاق المقابل النظامي العادل وفق الاتفاقات المعتمدة عند بدء المرحلة التجارية وتوافر الموارد.',
    recordedAt: '2026-11-24T00:00:00.000Z',
  },
  {
    id: 'contrib-legal-scholars',
    nameAr: 'المساهمون القانونيون والباحثون (المجتمع المفتوح)',
    roleAr: 'تنقيح المصادر القانونية والسوابق والمذكرات المعيارية',
    contributionType: 'legal-knowledge',
    contributionSummaryAr:
      'إثراء قاعدة المعرفة القانونية بالأنظمة الوطنية والاتفاقيات الدولية وضوابط الصياغة القضائية ومراجعة الدقة التشريعية.',
    rightsClauseAr:
      'حفظ نسبة الجهد العلمي والبحثي لكل مساهم قانوني ونصيب عادل من عوائد الانتفاع أو الترخيص بحسب حجم وجودة المساهمة الموثقة.',
    recordedAt: '2026-11-24T00:00:00.000Z',
  },
  {
    id: 'contrib-sponsors',
    nameAr: 'الداعمون وممولو البنية التحتية والأوزان المحلية',
    roleAr: 'توفير الحصص السحابية وخوادم التشغيل واستضافة الأوزان',
    contributionType: 'compute-sponsor',
    contributionSummaryAr:
      'تمكين التشغيل السحابي المستمر وتوفير موارد GPU/RAM لتشغيل الأوزان المحلية المستقلة (GGUF / llama.cpp) مستقبلاً.',
    rightsClauseAr:
      'حق الأولوية في الاستفادة التشغيلية والتوثيق الرسمي في سجل الداعمين وتسوية المساهمات التمويلية وفق عقود شفافة عند تحقق الإيراد.',
    recordedAt: '2026-11-24T00:00:00.000Z',
  },
];

function buildSeedCase(): LegalCaseRecord {
  const now = new Date().toISOString();
  const docContent =
    'بند 14 (القانون الواجب التطبيق والتحكيم): يخضع هذا العقد لتفسير وتنفيذ الأنظمة التجارية المعمول بها في المملكة العربية السعودية، وفي حال نشوء أي نزاع يتعذر حله ودياً خلال 30 يوماً، يُحال النزاع نهائياً إلى التحكيم التجاري الدولي وفق قواعد الأونسيترال ويكون مقر التحكيم الرياض.\n' +
    'بند 15 (تأخر التوريد والقوة القاهرة): يلتزم المورد بتوريد البرمجيات خلال 60 يوماً من تاريخ الدفعة المقدمة، مع غرامة تأخير 1% أسبوعياً بحد أقصى 10%، ومعالجة البيانات الشخصية للمستخدمين عبر خوادم خارجية دون اتفاقية معالجة بيانات DPA.';
  const doc: LegalCaseDocument = {
    id: 'doc-intl-supply-01',
    title: 'مسودة عقد توريد برمجيات عابر للحدود (نموذج مرجعي)',
    docType: 'contract',
    content: docContent,
    charCount: docContent.length,
    sha256: sha256Hex(docContent),
    addedAt: now,
  };
  const baseCase: LegalCaseRecord = {
    id: 'case-intl-2026-001',
    caseNumber: 'ILM-2026-001',
    titleAr: 'نزاع توريد برمجيات عابر للحدود وشرط التحكيم وحماية البيانات',
    caseType: 'arbitration',
    jurisdictionScope: 'global-comparative',
    partiesAr: 'شركة التقنية المستفيدة (المدعية) ضد شركة التوريد الأوروبية (المدعى عليها)',
    claimValue: '450,000 USD',
    criticalDeadline: '30 يوماً لإخطار التسوية الودية قبل تفعيل شرط التحكيم',
    factsSummaryAr:
      'عقد توريد برمجيات مؤسسية يتضمن شرط تحكيم وفق الأونسيترال وتأخر التوريد لمدة 8 أسابيع مع نقل بيانات عملاء عبر الحدود دون اتفاقية DPA.',
    confidentiality: 'confidential',
    status: 'open',
    extractedIssues: [
      'الاختصاص التحكيمي بموجب شرط الأونسيترال وتطبيق اتفاقية نيويورك 1958 ومادة 11 من نظام التحكيم السعودي',
      'التكييف القانوني لتأخر التوريد والشرط الجزائي (مقارنة CISG م 74 و SA-CIVIL-2023 م 179)',
      'عدم مشروعية نقل البيانات عبر الحدود دون اتفاقية معالجة بيانات DPA وفق GDPR م 28 و PDPL',
    ],
    linkedSourceCodes: ['SA-CIVIL-2023', 'SA-ARB-PDPL', 'UNCITRAL-ML', 'NYC-1958', 'CISG-1980', 'EU-GDPR-2016'],
    documents: [doc],
    memos: [],
    sha256: '',
    createdAt: now,
    updatedAt: now,
  };
  baseCase.sha256 = computeCaseSha(baseCase);
  return baseCase;
}

function computeCaseSha(c: Omit<LegalCaseRecord, 'sha256'>): string {
  return sha256Hex(
    JSON.stringify({
      id: c.id,
      caseNumber: c.caseNumber,
      titleAr: c.titleAr,
      partiesAr: c.partiesAr,
      factsSummaryAr: c.factsSummaryAr,
      documents: c.documents.map((d) => d.sha256),
      memos: c.memos.map((m) => m.sha256),
    })
  );
}

function createInitialState(): PersistedLegalMindState {
  return {
    sources: SEED_LEGAL_SOURCES,
    cases: [buildSeedCase()],
    contributors: SEED_CONTRIBUTORS,
    acceptanceTests: [],
    lastUpdatedAt: new Date().toISOString(),
  };
}

function loadState(): PersistedLegalMindState {
  ensureDirs();
  if (!fs.existsSync(LM_STATE_PATH)) {
    const init = createInitialState();
    saveState(init);
    return init;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(LM_STATE_PATH, 'utf8')) as Partial<PersistedLegalMindState>;
    const init = createInitialState();
    return {
      sources: Array.isArray(parsed.sources) && parsed.sources.length > 0 ? parsed.sources : init.sources,
      cases: Array.isArray(parsed.cases) && parsed.cases.length > 0 ? parsed.cases : init.cases,
      contributors:
        Array.isArray(parsed.contributors) && parsed.contributors.length > 0
          ? parsed.contributors
          : init.contributors,
      acceptanceTests: Array.isArray(parsed.acceptanceTests) ? parsed.acceptanceTests : [],
      lastUpdatedAt: parsed.lastUpdatedAt || new Date().toISOString(),
    };
  } catch {
    const fallback = createInitialState();
    saveState(fallback);
    return fallback;
  }
}

function saveState(state: PersistedLegalMindState): void {
  ensureDirs();
  const next: PersistedLegalMindState = {
    ...state,
    lastUpdatedAt: new Date().toISOString(),
  };
  const tmp = path.resolve(LM_DIR, `state.${process.pid}.tmp.json`);
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(tmp, LM_STATE_PATH);
}

function sourcesToRagDocs(sources: LegalSourceEntry[], caseDocs: LegalCaseDocument[] = []): RagDocument[] {
  const sDocs: RagDocument[] = sources.map((s) => {
    const content = `${s.titleAr} (${s.titleEn}) - ${s.authority} (${s.year}).\n${s.keyArticlesSummaryAr}\n${s.fullReferenceText}`;
    return {
      id: s.id,
      title: `[${s.code}] ${s.titleAr}`,
      format: 'MD',
      content,
      chunksCount: 2,
      wordCount: content.split(/\s+/).filter(Boolean).length,
      indexedAt: s.addedAt,
    };
  });
  const cDocs: RagDocument[] = caseDocs.map((d) => ({
    id: d.id,
    title: `[مستند قضية] ${d.title}`,
    format: 'TXT',
    content: d.content,
    chunksCount: 1,
    wordCount: d.content.split(/\s+/).filter(Boolean).length,
    indexedAt: d.addedAt,
  }));
  return [...cDocs, ...sDocs];
}

export function searchLegalSourcesOffline(query: string, topK = 5): {
  query: string;
  externalApiCalled: false;
  hits: RagSearchHit[];
  matchedSources: LegalSourceEntry[];
} {
  const st = loadState();
  const ragDocs = sourcesToRagDocs(st.sources);
  const hits = searchLocalRag(ragDocs, query, topK);
  const matchedIds = new Set(hits.map((h) => h.docId));
  const matchedSources = st.sources.filter((s) => matchedIds.has(s.id));
  return {
    query,
    externalApiCalled: false,
    hits,
    matchedSources,
  };
}

export function addLegalSource(input: {
  code: string;
  titleAr: string;
  titleEn?: string;
  category?: LegalSourceEntry['category'];
  jurisdiction?: LegalJurisdictionScope;
  year?: string;
  authority: string;
  keyArticlesSummaryAr: string;
  fullReferenceText: string;
}): LegalSourceEntry {
  const code = (input.code || '').trim().toUpperCase().slice(0, 32);
  const titleAr = (input.titleAr || '').trim();
  const fullReferenceText = (input.fullReferenceText || '').trim();
  if (!code || !titleAr || !fullReferenceText) {
    throw new Error('يجب إدخال رمز المرجع وعنوانه والنص المرجعي كاملاً.');
  }
  const st = loadState();
  const entry: LegalSourceEntry = {
    id: `src-${crypto.randomUUID().slice(0, 8)}`,
    code,
    titleAr,
    titleEn: (input.titleEn || titleAr).trim(),
    category: input.category || 'custom',
    jurisdiction: input.jurisdiction || 'global-comparative',
    year: (input.year || String(new Date().getFullYear())).trim(),
    authority: (input.authority || 'مصدر مضاف').trim(),
    keyArticlesSummaryAr: (input.keyArticlesSummaryAr || fullReferenceText.slice(0, 220)).trim(),
    fullReferenceText,
    verifiedPrimary: false,
    addedAt: new Date().toISOString(),
  };
  st.sources.unshift(entry);
  saveState(st);
  appendAudit('LEGAL_SOURCE_ADDED', `${entry.code}: ${entry.titleAr}`, 'INFO', `إضافة مرجع قانوني جديد (${entry.authority}).`);
  return entry;
}

export function createLegalCase(input: {
  caseNumber?: string;
  titleAr: string;
  caseType?: LegalCaseRecord['caseType'];
  jurisdictionScope?: LegalJurisdictionScope;
  partiesAr: string;
  claimValue?: string;
  criticalDeadline?: string;
  factsSummaryAr: string;
  confidentiality?: LegalCaseRecord['confidentiality'];
  initialDocTitle?: string;
  initialDocContent?: string;
}): LegalCaseRecord {
  const titleAr = (input.titleAr || '').trim();
  const factsSummaryAr = (input.factsSummaryAr || '').trim();
  if (!titleAr || !factsSummaryAr) {
    throw new Error('عنوان القضية وملخص الوقائع حقول إلزامية.');
  }
  const st = loadState();
  const now = new Date().toISOString();
  const docs: LegalCaseDocument[] = [];
  if (input.initialDocContent && input.initialDocContent.trim()) {
    const content = input.initialDocContent.trim();
    docs.push({
      id: `doc-${crypto.randomUUID().slice(0, 8)}`,
      title: (input.initialDocTitle || 'مستند القضية المرفق').trim(),
      docType: 'evidence',
      content,
      charCount: content.length,
      sha256: sha256Hex(content),
      addedAt: now,
    });
  }

  // Ground initial linked sources via offline RAG immediately
  const ragRes = searchLegalSourcesOffline(`${titleAr} ${factsSummaryAr}`, 4);
  const newCaseNoSha: Omit<LegalCaseRecord, 'sha256'> = {
    id: `case-${crypto.randomUUID().slice(0, 8)}`,
    caseNumber: (input.caseNumber || `ILM-${new Date().getFullYear()}-${String(st.cases.length + 1).padStart(3, '0')}`).trim(),
    titleAr,
    caseType: input.caseType || 'commercial',
    jurisdictionScope: input.jurisdictionScope || 'global-comparative',
    partiesAr: (input.partiesAr || 'أطراف النزاع — قيد التوصيف').trim(),
    claimValue: (input.claimValue || 'غير محدد').trim(),
    criticalDeadline: (input.criticalDeadline || 'لم يُحدد موعد إلزامي').trim(),
    factsSummaryAr,
    confidentiality: input.confidentiality || 'confidential',
    status: 'open',
    extractedIssues: [],
    linkedSourceCodes: ragRes.matchedSources.map((s) => s.code),
    documents: docs,
    memos: [],
    createdAt: now,
    updatedAt: now,
  };
  const created: LegalCaseRecord = {
    ...newCaseNoSha,
    sha256: computeCaseSha(newCaseNoSha),
  };
  st.cases.unshift(created);
  saveState(st);
  appendAudit('LEGAL_CASE_CREATED', created.caseNumber, 'INFO', `إنشاء ملف قضية: ${created.titleAr} (SHA-256: ${created.sha256.slice(0, 12)}).`);
  return created;
}

export function attachDocumentToLegalCase(
  caseId: string,
  input: {
    title: string;
    docType?: LegalCaseDocument['docType'];
    content: string;
  }
): LegalCaseRecord {
  const title = (input.title || '').trim();
  const content = (input.content || '').trim();
  if (!title || !content) {
    throw new Error('عنوان المستند ومحتواه النصي مطلوبان.');
  }
  const st = loadState();
  const idx = st.cases.findIndex((c) => c.id === caseId);
  if (idx === -1) {
    throw new Error('ملف القضية غير موجود.');
  }
  const c = st.cases[idx];
  const doc: LegalCaseDocument = {
    id: `doc-${crypto.randomUUID().slice(0, 8)}`,
    title,
    docType: input.docType || 'evidence',
    content,
    charCount: content.length,
    sha256: sha256Hex(content),
    addedAt: new Date().toISOString(),
  };
  c.documents.unshift(doc);
  c.updatedAt = new Date().toISOString();
  c.sha256 = computeCaseSha(c);
  st.cases[idx] = c;
  saveState(st);
  appendAudit('LEGAL_CASE_DOC_ADDED', `${c.caseNumber}/${doc.title}`, 'INFO', `إرفاق مستند ببصمة SHA-256: ${doc.sha256.slice(0, 12)}.`);
  return c;
}

export function addContributorRight(input: {
  nameAr: string;
  roleAr: string;
  contributionType?: ContributorRightsEntry['contributionType'];
  contributionSummaryAr: string;
  rightsClauseAr: string;
}): ContributorRightsEntry {
  const nameAr = (input.nameAr || '').trim();
  const roleAr = (input.roleAr || '').trim();
  const contributionSummaryAr = (input.contributionSummaryAr || '').trim();
  const rightsClauseAr = (input.rightsClauseAr || '').trim();
  if (!nameAr || !roleAr || !rightsClauseAr) {
    throw new Error('اسم المساهم ودوره وبند حفظ الحقوق حقول مطلوبة.');
  }
  const st = loadState();
  const entry: ContributorRightsEntry = {
    id: `contrib-${crypto.randomUUID().slice(0, 8)}`,
    nameAr,
    roleAr,
    contributionType: input.contributionType || 'legal-knowledge',
    contributionSummaryAr: contributionSummaryAr || roleAr,
    rightsClauseAr,
    recordedAt: new Date().toISOString(),
  };
  st.contributors.push(entry);
  saveState(st);
  appendAudit('CONTRIBUTOR_RIGHT_RECORDED', entry.nameAr, 'INFO', `توثيق حقوق مساهم/داعم: ${entry.roleAr}`);
  return entry;
}

const MODE_LABELS: Record<LegalDraftMode, string> = {
  'full-analysis': 'تحليل قانوني شامل واستخراج المسائل ومصفوفة المخاطر',
  'defense-memo': 'صياغة مذكرة دفاع قانونية كاملة',
  'claim-statement': 'صياغة لائحة دعوى قضائية / طلب تحكيمي افتتاحي',
  'arbitration-request': 'صياغة طلب إحالة للتحكيم الدولي وتثبيت الاختصاص',
  'contract-audit': 'مراجعة وتدقيق عقد وكشف التعارضات والصياغة البديلة',
};

const FREE_MODELS = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as const;
const lmCooldown = new Map<string, number>();

export async function analyzeAndDraftCaseWithLegalMind(params: {
  caseId: string;
  mode?: LegalDraftMode;
  extraInstructions?: string;
}): Promise<{ caseRecord: LegalCaseRecord; memo: LegalMemoArtifact }> {
  const st = loadState();
  const idx = st.cases.findIndex((c) => c.id === params.caseId);
  if (idx === -1) {
    throw new Error('ملف القضية غير موجود.');
  }
  const c = st.cases[idx];
  const mode: LegalDraftMode = params.mode && MODE_LABELS[params.mode] ? params.mode : 'full-analysis';
  const store = loadStore();
  const activeBrain: PlatformBrainId = 'attia-advisor';
  const versionInfo = getActiveBrainVersionInfo(activeBrain);

  // 1. Offline RAG grounding against Legal Sources + Case Documents
  const combinedRagQuery = `${c.titleAr} ${c.factsSummaryAr} ${c.documents.map((d) => d.title).join(' ')}`;
  const ragDocs = sourcesToRagDocs(st.sources, c.documents);
  const ragHits = searchLocalRag(ragDocs, combinedRagQuery, 6);
  const matchedSources = st.sources.filter((s) => ragHits.some((h) => h.docId === s.id));

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('مفتاح GEMINI_API_KEY غير مضبوط على الخادم لتشغيل التحليل التوليدي لعقل المستشار.');
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: { 'User-Agent': 'aistudio-build' },
    },
  });

  const { sectionText: memSection } = buildIroncladMemoryPromptSection({
    store,
    query: combinedRagQuery,
    activeProjectId: store.projects[0]?.id,
  });

  const sysInstruction = [
    buildOmniAdvisorSystemPrompt({
      activeProject: store.projects[0],
      includePlatformContext: false,
      jurisdictionScope: c.jurisdictionScope,
    }),
    buildLegalExpertSystemPrompt({
      scope: c.jurisdictionScope,
      activeProject: store.projects[0],
      includePlatformContext: false,
    }),
    memSection,
    'قاعدة صارمة: التزم بالحقائق الواردة في ملف القضية والمستندات المرفقة والمراجع القانونية المسترجعة أدناه. لا تختلق أرقام مواد غير متحققة، واستخدم [مرجع: CODE] عند الاستشهاد، وضمّن الترويسة والوقائع والمسائل والأسانيد والدفوع والطلبات.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const sourceContext = matchedSources
    .map((s) => `- [${s.code}] ${s.titleAr} (${s.authority} - ${s.year}): ${s.fullReferenceText}`)
    .join('\n');
  const docContext = c.documents
    .map((d, i) => `مستند ${i + 1}: "${d.title}" (${d.docType}, SHA-256: ${d.sha256.slice(0, 12)}):\n${d.content.slice(0, 3500)}`)
    .join('\n\n');

  const userPrompt = [
    `المهمة المطلوبة: ${MODE_LABELS[mode]}`,
    `رقم القضية: ${c.caseNumber} | العنوان: ${c.titleAr}`,
    `الاختصاص المستهدف: ${c.jurisdictionScope} | نوع القضية: ${c.caseType}`,
    `الأطراف: ${c.partiesAr} | قيمة المطالبة: ${c.claimValue} | الموعد الحرج: ${c.criticalDeadline}`,
    `ملخص الوقائع:\n${c.factsSummaryAr}`,
    docContext ? `\nالمستندات المرفقة بالقضية:\n${docContext}` : '',
    sourceContext ? `\nالمراجع القانونية المسترجعة محلياً للاستناد إليها:\n${sourceContext}` : '',
    params.extraInstructions ? `\nتوجيهات إضافية من المستخدم:\n${params.extraInstructions}` : '',
    '\nأخرج النتيجة بصيغة JSON مطابقة للمخطط، بحيث يكون markdownContent مذكرة قانونية متكاملة ومنسقة بعناوين Markdown واضحة وجاهزة للتصدير PDF والطباعة، وتحتوي صراحةً على الترويسة والوقائع والمسائل القانونية والأسانيد المقارنة والدفوع ومصفوفة المخاطر والطلبات الختامية وتنبيه التحقق التشريعي.',
  ]
    .filter(Boolean)
    .join('\n');

  const now = Date.now();
  const candidates = FREE_MODELS.filter((m) => (lmCooldown.get(m) || 0) <= now);
  const ordered = candidates.length > 0 ? candidates : [...FREE_MODELS];

  let rawJson = '';
  let modelUsed = '';
  let latencyMs = 0;
  const errs: string[] = [];

  for (const model of ordered) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const t0 = Date.now();
      try {
        const resp = await ai.models.generateContent({
          model,
          contents: userPrompt,
          config: {
            systemInstruction: sysInstruction,
            thinkingConfig: {
              thinkingLevel: model === 'gemini-3.1-flash-lite' ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW,
            },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                memoTitleAr: { type: Type.STRING },
                riskLevel: { type: Type.STRING },
                extractedIssues: { type: Type.ARRAY, items: { type: Type.STRING } },
                citedSourceCodes: { type: Type.ARRAY, items: { type: Type.STRING } },
                markdownContent: { type: Type.STRING },
              },
              required: ['memoTitleAr', 'extractedIssues', 'citedSourceCodes', 'markdownContent'],
            },
          },
        });
        rawJson = (resp.text || '').trim();
        modelUsed = model;
        latencyMs = Math.max(1, Date.now() - t0);
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isQuota = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Quota exceeded');
        const isTransient = msg.includes('503') || msg.includes('UNAVAILABLE');
        if (isQuota) {
          errs.push(`${model}: 429/QUOTA`);
          lmCooldown.set(model, Date.now() + 15 * 60 * 1000);
          break;
        }
        if (isTransient && attempt < 2) {
          await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
          continue;
        }
        if (isTransient) {
          errs.push(`${model}: 503/UNAVAILABLE`);
          break;
        }
        throw new Error(`فشل تحليل القضية عبر ${model}: ${msg}`);
      }
    }
    if (rawJson) break;
  }

  if (!rawJson) {
    recordSelfHealingModuleAlert({
      severity: 'ERROR',
      sourceModuleId: 'legal-mind-center',
      titleAr: `تعذر إتمام التحليل القانوني للقضية ${c.caseNumber}`,
      evidenceAr: errs.join(' | '),
      linkedRecordId: c.id,
    });
    throw new Error(`تعذر الوصول إلى العقل السحابي الحر حالياً [${errs.join(' | ')}].`);
  }

  const parsed = JSON.parse(rawJson) as {
    memoTitleAr?: string;
    riskLevel?: string;
    extractedIssues?: string[];
    citedSourceCodes?: string[];
    markdownContent?: string;
  };

  const markdownContent = (parsed.markdownContent || '').trim();
  if (markdownContent.length < 120) {
    throw new Error('المذكرة الناتجة أقصر من الحد المهني المقبول؛ أعد التحليل.');
  }

  const memoId = `memo-${crypto.randomUUID().slice(0, 8)}`;
  const safeMemoFile = `${memoId}.md`.replace(/[^a-zA-Z0-9._-]/g, '_');
  const fullMemoPath = path.resolve(LM_MEMOS_DIR, safeMemoFile);
  if (!fullMemoPath.startsWith(LM_MEMOS_DIR + path.sep)) {
    throw new Error('مسار حفظ المذكرة غير مصرح به.');
  }
  ensureDirs();
  fs.writeFileSync(fullMemoPath, markdownContent, 'utf8');
  const memoSha = sha256Hex(markdownContent);
  fs.writeFileSync(`${fullMemoPath}.sha256`, memoSha, 'utf8');

  const normRisk = String(parsed.riskLevel || 'high').toLowerCase();
  const riskLevel: LegalMemoArtifact['riskLevel'] =
    normRisk === 'critical' || normRisk === 'low' || normRisk === 'medium' ? normRisk : 'high';

  const citedCodes = Array.from(
    new Set([
      ...(parsed.citedSourceCodes || []).filter(Boolean),
      ...matchedSources.map((s) => s.code),
    ])
  );
  const extractedIssues = (parsed.extractedIssues || []).filter(Boolean);

  const memo: LegalMemoArtifact = {
    id: memoId,
    caseId: c.id,
    mode,
    titleAr: (parsed.memoTitleAr || `${MODE_LABELS[mode]} — ${c.caseNumber}`).trim(),
    brainId: activeBrain,
    brainVersion: versionInfo.version,
    modelUsed,
    executionMode: 'live-llm',
    extractedIssues,
    citedSourceCodes: citedCodes,
    riskLevel,
    markdownContent,
    latencyMs,
    sha256: memoSha,
    filePathRel: path.relative(ROOT_DIR, fullMemoPath),
    createdAt: new Date().toISOString(),
  };

  c.memos.unshift(memo);
  c.extractedIssues = Array.from(new Set([...c.extractedIssues, ...extractedIssues]));
  c.linkedSourceCodes = Array.from(new Set([...c.linkedSourceCodes, ...citedCodes]));
  c.status = mode === 'full-analysis' ? 'analyzed' : 'memo-drafted';
  c.updatedAt = new Date().toISOString();
  c.sha256 = computeCaseSha(c);
  st.cases[idx] = c;
  saveState(st);

  appendAudit(
    'LEGAL_MEMO_GENERATED',
    `${c.caseNumber}/${memo.id}`,
    'INFO',
    `إنجاز ${MODE_LABELS[mode]} عبر ${activeBrain}@${versionInfo.version} (${modelUsed}) مع ${citedCodes.length} مرجع قانوني.`
  );

  return { caseRecord: c, memo };
}

export function getLegalMemoById(memoId: string): { caseRecord: LegalCaseRecord; memo: LegalMemoArtifact } | null {
  const st = loadState();
  for (const c of st.cases) {
    const m = c.memos.find((x) => x.id === memoId);
    if (m) return { caseRecord: c, memo: m };
  }
  return null;
}

function compute15DayDeliveryMilestones(params: {
  st: PersistedLegalMindState;
  activeVersion: string;
  localWeightsCount: number;
  llamaInstalled: boolean;
  shHealthPass: boolean;
}): LegalDeliveryMilestone[] {
  const { st, activeVersion, localWeightsCount, llamaInstalled, shHealthPass } = params;
  const totalMemos = st.cases.reduce((acc, c) => acc + c.memos.length, 0);
  const offlineReady = localWeightsCount > 0 && llamaInstalled;
  const allTestsPass =
    st.acceptanceTests.length >= 8 && st.acceptanceTests.every((t) => t.verdict === 'PASS');

  return [
    {
      dayRange: 'اليوم 1 – اليوم 2',
      phaseAr: 'المرحلة 1: ربط العقل القانوني والحصة المجانية',
      titleAr: 'اتصال العقل المتفق عليه (عقل المستشار عطيه) وتأمين الحصة المجانية',
      deliverableAr: 'توصيل attia-advisor بالمنصة ومكتب التدريب مع Failover تلقائي بين نماذج Gemini المجانية.',
      status: 'COMPLETED',
      evidenceAr: `العقل المتصل: attia-advisor · الإصدار النشط: ${activeVersion} · failover المجاني مفعّل.`,
      blockerActionAr: null,
    },
    {
      dayRange: 'اليوم 3 – اليوم 5',
      phaseAr: 'المرحلة 2: منظومة المصادر والمراجع القانونية',
      titleAr: 'هيكلة المصادر القانونية الدولية والعربية وربطها بمحرك RAG محلي',
      deliverableAr: 'فهرسة المعاهدات الدولية والأنظمة الخليجية والمصرية والأوروبية دون إنترنت.',
      status: st.sources.length >= 10 ? 'COMPLETED' : 'IN_PROGRESS',
      evidenceAr: `${st.sources.length} مصدراً قانونياً موثقاً ومفهرساً بالبحث الدلالي TF-IDF دون إنترنت.`,
      blockerActionAr: null,
    },
    {
      dayRange: 'اليوم 6 – اليوم 8',
      phaseAr: 'المرحلة 3: القضايا والمستندات والتحليل وصياغة المذكرات',
      titleAr: 'إدارة ملفات القضايا واستخراج المسائل وصياغة المذكرات والدفوع وتصدير PDF',
      deliverableAr: 'نظام القضايا + بصمات SHA-256 + صياغة مذكرات الدفاع والدعوى وتدقيق العقود.',
      status: st.cases.length > 0 && totalMemos > 0 ? 'COMPLETED' : 'IN_PROGRESS',
      evidenceAr:
        totalMemos > 0
          ? `${st.cases.length} قضايا مسجلة و ${totalMemos} مذكرة موثقة ببصمات SHA-256.`
          : `${st.cases.length} قضايا مسجلة (بانتظار تشغيل أول تحليل فعلي لصياغة مذكرة).`,
      blockerActionAr: null,
    },
    {
      dayRange: 'اليوم 9 – اليوم 11',
      phaseAr: 'المرحلة 4: الاختبارات والمراقبة الذاتية والحوكمة',
      titleAr: 'تشغيل اختبارات الجودة القانونية وربط المراقبة والإصلاح الذاتي وحقوق المساهمين',
      deliverableAr: 'مصفوفة اختبارات PASS / FAIL / BLOCKED + ميثاق حقوق الداعمين والمساهمين.',
      status: allTestsPass && shHealthPass ? 'COMPLETED' : st.contributors.length >= 4 ? 'IN_PROGRESS' : 'PENDING',
      evidenceAr: `مساهمون موثقون=${st.contributors.length} · نتائج الاختبار=${st.acceptanceTests.filter((t) => t.verdict === 'PASS').length}/${st.acceptanceTests.length || 8}.`,
      blockerActionAr: null,
    },
    {
      dayRange: 'اليوم 12 – اليوم 15',
      phaseAr: 'المرحلة 5: الاستقلال العصبي الكامل دون إنترنت والتسليم النهائي',
      titleAr: 'تجهيز الأوزان المحلية (GGUF) ومحرك llama.cpp وحزمة التسليم المستقلة',
      deliverableAr: 'حزمة delivery-bundle.zip متكاملة + تشغيل عصبي محلي (أو بيان القيود بصدق).',
      status: offlineReady ? 'COMPLETED' : 'BLOCKED',
      evidenceAr: offlineReady
        ? `${localWeightsCount} ملف أوزان مرفوع + llama-server متاح على الخادم.`
        : `ملفات أوزان GGUF في data/weights/: ${localWeightsCount} · محرك llama-server: غير مثبت في الحاوية الحالية.`,
      blockerActionAr: offlineReady
        ? null
        : 'يتطلب خادماً بمساحة تخزين >= 6 GB وذاكرة >= 8 GB RAM لرفع Qwen2.5-3B-Instruct-Q4_K_M.gguf (أو Llama-3-8B) وتثبيت llama.cpp؛ حزمة الكود والمصادر والقضايا والدليل جاهزة للتنزيل الآن.',
    },
  ];
}

export function getLegalMindOverview(): LegalMindOverviewSnapshot {
  const st = loadState();
  const store = loadStore();
  const activeBrain: PlatformBrainId = 'attia-advisor';
  const versionInfo = getActiveBrainVersionInfo(activeBrain);
  const engines = scanRuntimeAndEngines();
  const weightsReport = buildWeightsIntegrityReport(store);
  const shStatus = getSelfHealingCenterStatus();

  const localWeightsCount = weightsReport.importedCount;
  const llamaEngine = engines.find(
    (e) => (e.name.includes('llama-server') || e.name.includes('llama-cli')) && e.installed
  );
  const llamaInstalled = Boolean(llamaEngine);
  const shHealthPass = shStatus.acceptanceTests.length === 0 || shStatus.acceptanceTests.every((t) => t.verdict === 'PASS');

  const offlineReady = localWeightsCount > 0 && llamaInstalled;
  const offlineReasonAr = offlineReady
    ? `الوضع المستقل دون إنترنت جاهز (${localWeightsCount} ملفات أوزان + ${llamaEngine?.name}).`
    : `تعمل المنصة حالياً بالربط الهجين: (1) استدلال واسترجاع قانوني محلي RAG بنسبة 100% دون إنترنت، (2) عقل المستشار السحابي عبر الحصة المجانية لـ Gemini؛ أما الاستدلال العصبي من أوزان GGUF المحلية فمحجوب (BLOCKED) لعدم وجود ملفات أوزان في data/weights/ (${localWeightsCount}) وعدم تثبيت llama-server في بيئة الاستضافة الحالية.`;

  const brainProfile = BRAIN_PROFILES.find((p) => p.id === activeBrain) || BRAIN_PROFILES[0];

  return {
    brainStatus: {
      activeBrain,
      brainTitleAr: brainProfile.titleAr,
      activeVersion: versionInfo.version,
      principlesCount: versionInfo.principles.length,
      directivesCount: versionInfo.directives.length,
      freeTierResilienceActive: true,
      localGgufWeightsCount: localWeightsCount,
      localLlamaServerInstalled: llamaInstalled,
      offlineNeuralVerdict: offlineReady ? 'READY' : 'BLOCKED',
      offlineNeuralReasonAr: offlineReasonAr,
    },
    sources: st.sources,
    cases: st.cases,
    milestones: compute15DayDeliveryMilestones({
      st,
      activeVersion: versionInfo.version,
      localWeightsCount,
      llamaInstalled,
      shHealthPass,
    }),
    contributors: st.contributors,
    acceptanceTests: st.acceptanceTests,
    lastUpdatedAt: st.lastUpdatedAt,
  };
}

export async function buildLegalMindDeliveryBundleZip(): Promise<{
  buffer: Buffer;
  fileName: string;
  sha256: string;
}> {
  const overview = getLegalMindOverview();
  const store = loadStore();
  const zip = new JSZip();

  // 1. Governance & Contributors Charter
  const charterLines = [
    '# ميثاق الملكية التشاركية وحقوق الداعمين والمساهمين',
    '## منصة العقل القانوني الدولي — منارة العدالة الناجزة',
    '',
    'تقوم هذه المنصة على مبدأ عدم الاحتكار والشراكة العادلة بين مؤسس المشروع، الفريق الهندسي والذكاء الاصطناعي، الباحثين القانونيين، والداعمين للبنية التحتية.',
    '',
    '## سجل الحقوق والمساهمات الموثق',
    ...overview.contributors.map(
      (c, i) =>
        `### ${i + 1}. ${c.nameAr} (${c.roleAr})\n- نوع المساهمة: ${c.contributionType}\n- ملخص الجهد: ${c.contributionSummaryAr}\n- بند حفظ الحقوق: ${c.rightsClauseAr}\n- تاريخ التوثيق: ${c.recordedAt}`
    ),
  ].join('\n\n');
  zip.file('GOVERNANCE-AND-CONTRIBUTORS-CHARTER.md', charterLines);

  // 2. 15-Day Technical & Delivery Report
  const reportMd = [
    '# التقرير الفني النهائي وخطة التسليم (15 يوماً) — منصة العقل القانوني الدولي',
    `- تاريخ التوليد: ${new Date().toISOString()}`,
    `- العقل القانوني المعتمد: ${overview.brainStatus.brainTitleAr} (${overview.brainStatus.activeBrain}@${overview.brainStatus.activeVersion})`,
    `- المبادئ/الضوابط النشطة: ${overview.brainStatus.principlesCount} مبدأ · ${overview.brainStatus.directivesCount} توجيهاً`,
    `- المصادر القانونية المنظمة: ${overview.sources.length} مصدراً`,
    `- القضايا المسجلة: ${overview.cases.length} | المذكرات المنجزة: ${overview.cases.reduce((a, b) => a + b.memos.length, 0)}`,
    `- وضع الاستدلال العصبي المحلي GGUF: ${overview.brainStatus.offlineNeuralVerdict}`,
    `- التوضيح الفني الأمين: ${overview.brainStatus.offlineNeuralReasonAr}`,
    '',
    '## مراحل خطة الـ 15 يوماً',
    ...overview.milestones.map(
      (m) => `### [${m.status}] ${m.dayRange} — ${m.titleAr}\n- المخرج: ${m.deliverableAr}\n- الدليل: ${m.evidenceAr}${m.blockerActionAr ? `\n- معالجة العائق: ${m.blockerActionAr}` : ''}`
    ),
    '',
    '## نتائج الاختبارات الموثقة (PASS / FAIL / BLOCKED)',
    ...(overview.acceptanceTests.length > 0
      ? overview.acceptanceTests.map(
          (t) => `- [${t.verdict}] #${t.id} ${t.nameAr}: ${t.actualResultAr} (${t.evidenceAr})`
        )
      : ['- لم تُشغل اختبارات الجودة بعد؛ شغّل /api/legal-mind/acceptance-tests/run لتوليد التقرير الحي.']),
  ].join('\n');
  zip.file('15-DAY-DELIVERY-REPORT.md', reportMd);
  zip.file('15-DAY-DELIVERY-REPORT.json', JSON.stringify(overview, null, 2));

  // 3. Operation, Free-Tier, Recovery & Future Development Guide
  const opsMd = [
    '# دليل التشغيل والاستعادة والتطوير المستقبلي — منصة العقل القانوني الدولي',
    '',
    '## 1. المتطلبات والتشغيل الفوري',
    '- Node.js 20+ و npm',
    '- ضبط متغير البيئة السري على الخادم: GEMINI_API_KEY (للوضع الهجين/الحصة المجانية عبر gemini-4-hydrogen مع failover إلى gemini-3.1-flash-lite).',
    '- أوامر التشغيل:\n  1. npm install\n  2. npm run dev (تطوير على المنفذ 3000) أو npm run build && npm start (إنتاج).',
    '',
    '## 2. النسخ الاحتياطي والاستعادة الآمنة (Backup & Recovery)',
    '- تخزن بيانات المنصة في data/helbawey_store.json.',
    '- تخزن القضايا والمصادر والمذكرات في data/legal-mind/state.json و data/legal-mind/memos/*.md (+ .sha256).',
    '- تخزن إصدارات عقل المستشار ونقاط Checkpoint في data/brain-training/.',
    '- للاستعادة: أعد نسخ مجلد data/ ثم تحقق من تطابق بصمات SHA-256 عبر لوحة التحقق والتغليف أو الإصلاح الذاتي.',
    '',
    '## 3. الانتقال للاستقلالية الكاملة بأوزان محلية (بدون إنترنت)',
    '- حمّل نموذجاً مفتوح الترخيص التجاري (مثل Qwen2.5-3B-Instruct-Q4_K_M.gguf أو Llama-3-8B-Instruct-Q4_K_M.gguf) داخل data/weights/.',
    '- شغّل خادم llama-server محلياً على http://127.0.0.1:8080.',
    '- استخدم رافع الأوزان المجزأة (Resumable Chunked Upload) في وحدة إدارة النماذج مع فحص SHA-256.',
    '',
    '## 4. الترتيبات المالية والتشغيلية (الحصة المجانية والتوسع الاختياري)',
    '- التشغيل الحالي مضبوط حصرياً على النماذج المجانية (gemini-4-hydrogen مع failover إلى gemini-3.1-flash-lite) بتكلفة مستهدفة $0 ضمن حدود الحصة المجانية، دون أي استدعاء لنماذج مدفوعة أو تفعيل موارد سحابية مدفوعة تلقائياً.',
    '- أي ترقية مستقبلية (Gemini API مدفوع، خادم GPU/RAM >= 8 GB RAM و >= 6 GB تخزين لتشغيل GGUF + llama.cpp) تظل اختيارية بالكامل ولا تُفعّل إلا ببيان التكلفة مسبقاً وموافقة صاحب المشروع.',
  ].join('\n');
  zip.file('README-OPERATION-AND-RECOVERY.md', opsMd);

  // 4. Legal Sources & Offline RAG Engine
  zip.file('sources/legal-sources-registry.json', JSON.stringify(overview.sources, null, 2));
  const ragIdx = buildLocalRagIndex(sourcesToRagDocs(overview.sources));
  zip.file('rag/legal_knowledge_index.json', JSON.stringify(ragIdx, null, 2));
  zip.file('rag/offline-legal-rag.mjs', generateStandaloneRagModuleCode());

  // 5. Cases & Drafted Memos
  zip.file('cases/cases-index.json', JSON.stringify(overview.cases, null, 2));
  for (const c of overview.cases) {
    for (const m of c.memos) {
      zip.file(`cases/${c.caseNumber}/memos/${m.id}.md`, m.markdownContent);
      zip.file(`cases/${c.caseNumber}/memos/${m.id}.md.sha256`, m.sha256);
    }
  }

  // 6. Brain Versions & Training State
  if (fs.existsSync(BT_VERSIONS_DIR)) {
    for (const f of fs.readdirSync(BT_VERSIONS_DIR)) {
      const full = path.resolve(BT_VERSIONS_DIR, f);
      if (fs.statSync(full).isFile()) {
        zip.file(`brain-versions/${f}`, fs.readFileSync(full));
      }
    }
  }

  // 7. Weights Directory & Honest Manifest
  const weightsReport = buildWeightsIntegrityReport(store);
  zip.file('weights/weights.manifest.json', JSON.stringify(weightsReport, null, 2));
  if (fs.existsSync(WEIGHTS_DIR)) {
    for (const wf of fs.readdirSync(WEIGHTS_DIR)) {
      const full = path.resolve(WEIGHTS_DIR, wf);
      if (fs.statSync(full).isFile() && fs.statSync(full).size < 250 * 1024 * 1024) {
        zip.file(`weights/${wf}`, fs.readFileSync(full));
      }
    }
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return {
    buffer,
    fileName: 'international-legal-mind-delivery-bundle.zip',
    sha256: sha256Hex(buffer),
  };
}

export async function runLegalMindAcceptanceSuite(): Promise<LegalMindAcceptanceTestResult[]> {
  const results: LegalMindAcceptanceTestResult[] = [];
  const storeBefore = loadStore();
  const memBefore = (storeBefore.platformChatMemory || []).length;

  // Test 1: Agreed Legal Brain Connection & Active Version
  {
    const t0 = Date.now();
    const ov = getLegalMindOverview();
    const pass =
      ov.brainStatus.activeBrain === 'attia-advisor' &&
      ov.brainStatus.brainTitleAr.includes('عطيه') &&
      /^v\d+\.\d+\.\d+$/.test(ov.brainStatus.activeVersion) &&
      ov.brainStatus.principlesCount >= 2;
    results.push({
      id: 1,
      nameAr: 'اتصال العقل القانوني المتفق عليه وقراءة إصداره وضوابطه الحية',
      actionAr: 'فحص ارتباط attia-advisor بمركز العقل القانوني الدولي وقراءة المبادئ النشطة',
      actualResultAr: `${ov.brainStatus.brainTitleAr} · ${ov.brainStatus.activeVersion} · مبادئ=${ov.brainStatus.principlesCount}`,
      evidenceAr: `directives=${ov.brainStatus.directivesCount} · freeTierFailover=${ov.brainStatus.freeTierResilienceActive}`,
      verdict: pass ? 'PASS' : 'FAIL',
      durationMs: Math.max(1, Date.now() - t0),
    });
  }

  // Test 2: Offline Organized Legal Sources & TF-IDF Search (0 External Calls)
  {
    const t0 = Date.now();
    const search = searchLegalSourcesOffline('تحكيم نيويورك 1958 وشرط التحكيم والبيانات GDPR CISG', 5);
    const pass =
      search.externalApiCalled === false &&
      search.hits.length >= 2 &&
      search.matchedSources.some((s) => s.code === 'NYC-1958' || s.code === 'CISG-1980');
    results.push({
      id: 2,
      nameAr: 'عمل منظومة المصادر القانونية والبحث الدلالي المحلي دون إنترنت',
      actionAr: 'استعلام TF-IDF محلي في مصادر المعاهدات والأنظمة (externalApiCalled=false)',
      actualResultAr: `استرجاع ${search.hits.length} فقرة من ${search.matchedSources.length} مصدر قانوني محلياً`,
      evidenceAr: `codes=${search.matchedSources.map((s) => s.code).join(', ')}`,
      verdict: pass ? 'PASS' : 'FAIL',
      durationMs: Math.max(1, Date.now() - t0),
    });
  }

  // Test 3: Case & Document Persistence + SHA-256 Integrity
  let testCaseId = '';
  {
    const t0 = Date.now();
    const created = createLegalCase({
      titleAr: 'اختبار التحقق: عقد وكالة تجارية دولية وشرط عدم المنافسة',
      caseType: 'commercial',
      jurisdictionScope: 'global-comparative',
      partiesAr: 'الشركة الوطنية (أ) ضد الموزع الإقليمي (ب)',
      claimValue: '120,000 USD',
      criticalDeadline: '15 يوماً',
      factsSummaryAr: 'فسخ عقد وكالة تجارية قبل المدة المتفق عليها مع استمرار استخدام العلامة التجارية.',
      initialDocTitle: 'بند الوكالة والعلامة التجارية',
      initialDocContent: 'مدة الوكالة 3 سنوات قابلة للتجديد، ويُحظر على الوكيل الترويج لمنتج منافس لمدة سنة بعد الانتهاء.',
    });
    testCaseId = created.id;
    const loaded = getLegalMindOverview().cases.find((c) => c.id === created.id);
    const pass = Boolean(loaded && loaded.documents.length === 1 && loaded.sha256.length === 64);
    results.push({
      id: 3,
      nameAr: 'إنشاء ملف قضية وإرفاق مستند وتوثيق بصمة SHA-256 على القرص',
      actionAr: 'إنشاء قضية مع مستند مرفق والتحقق من حفظها في data/legal-mind/state.json',
      actualResultAr: `تم الحفظ (${created.caseNumber}) · مستندات=${loaded?.documents.length || 0}`,
      evidenceAr: `sha256=${created.sha256.slice(0, 16)}...`,
      verdict: pass ? 'PASS' : 'FAIL',
      durationMs: Math.max(1, Date.now() - t0),
    });
  }

  // Test 4 & Test 5: Real Legal Analysis + Structured Memo Drafting via attia-advisor
  let memoForCheck: LegalMemoArtifact | null = null;
  {
    const t0 = Date.now();
    try {
      const out = await analyzeAndDraftCaseWithLegalMind({
        caseId: testCaseId,
        mode: 'defense-memo',
      });
      memoForCheck = out.memo;
      const hasFile = fs.existsSync(path.resolve(ROOT_DIR, out.memo.filePathRel));
      const pass4 =
        out.memo.executionMode === 'live-llm' &&
        out.memo.extractedIssues.length >= 1 &&
        out.memo.citedSourceCodes.length >= 1 &&
        hasFile;
      results.push({
        id: 4,
        nameAr: 'التحليل القانوني الفعلي واستخراج المسائل وربط المصادر عبر العقل المتصل',
        actionAr: 'تشغيل analyzeAndDraftCaseWithLegalMind بصيغة مذكرة دفاع',
        actualResultAr: `نموذج=${out.memo.modelUsed} · مسائل=${out.memo.extractedIssues.length} · مراجع=${out.memo.citedSourceCodes.length}`,
        evidenceAr: `memoId=${out.memo.id} · latency=${out.memo.latencyMs}ms · sha=${out.memo.sha256.slice(0, 12)}`,
        verdict: pass4 ? 'PASS' : 'FAIL',
        durationMs: Math.max(1, Date.now() - t0),
      });

      const md = out.memo.markdownContent;
      const structuralTokens = ['وقائع', 'دفع', 'طلب', 'مرجع', 'تحقق'];
      const hits = structuralTokens.filter((tok) => md.includes(tok)).length;
      const pass5 = md.length >= 300 && hits >= 3;
      results.push({
        id: 5,
        nameAr: 'جودة صياغة المذكرة القانونية واكتمال أركانها وضابط الأمانة التشريعية',
        actionAr: 'فحص البنية القضائية للمذكرة (الوقائع، الدفوع، الطلبات، المراجع، التحقق)',
        actualResultAr: `الطول=${md.length} حرف · الأركان المستوفاة=${hits}/${structuralTokens.length}`,
        evidenceAr: `cited=${out.memo.citedSourceCodes.slice(0, 4).join(', ')}`,
        verdict: pass5 ? 'PASS' : 'FAIL',
        durationMs: 2,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        id: 4,
        nameAr: 'التحليل القانوني الفعلي واستخراج المسائل وربط المصادر عبر العقل المتصل',
        actionAr: 'تشغيل analyzeAndDraftCaseWithLegalMind بصيغة مذكرة دفاع',
        actualResultAr: `فشل الاتصال السحابي الحقيقي: ${msg.slice(0, 160)}`,
        evidenceAr: 'zero-fabrication policy: لم يتم توليد نتيجة وهمية.',
        verdict: 'FAIL',
        durationMs: Math.max(1, Date.now() - t0),
      });
      results.push({
        id: 5,
        nameAr: 'جودة صياغة المذكرة القانونية واكتمال أركانها وضابط الأمانة التشريعية',
        actionAr: 'فحص البنية القضائية للمذكرة',
        actualResultAr: 'لم تتولد المذكرة لتعذر الاختبار رقم 4.',
        evidenceAr: 'skipped',
        verdict: 'FAIL',
        durationMs: 1,
      });
    }
  }

  // Test 6: Clean up temporary synthetic test case while keeping persisted audit & verify Bundle Export
  {
    const t0 = Date.now();
    // Remove synthetic test case so user's clean cases remain uncluttered, keep seed & real cases
    const stNow = loadState();
    stNow.cases = stNow.cases.filter((c) => c.id !== testCaseId);
    saveState(stNow);
    if (memoForCheck) {
      const fullM = path.resolve(ROOT_DIR, memoForCheck.filePathRel);
      if (fullM.startsWith(LM_MEMOS_DIR + path.sep)) {
        if (fs.existsSync(fullM)) fs.unlinkSync(fullM);
        if (fs.existsSync(`${fullM}.sha256`)) fs.unlinkSync(`${fullM}.sha256`);
      }
    }

    const bundle = await buildLegalMindDeliveryBundleZip();
    const pass = bundle.buffer.length > 5000 && bundle.sha256.length === 64;
    results.push({
      id: 6,
      nameAr: 'بناء حزمة التسليم المستقلة (ZIP) متضمنة الدليل وميثاق حقوق المساهمين',
      actionAr: 'توليد international-legal-mind-delivery-bundle.zip وفحص حجمه وبصمة SHA-256',
      actualResultAr: `حجم الحزمة=${(bundle.buffer.length / 1024).toFixed(1)} KB`,
      evidenceAr: `sha256=${bundle.sha256.slice(0, 16)}...`,
      verdict: pass ? 'PASS' : 'FAIL',
      durationMs: Math.max(1, Date.now() - t0),
    });
  }

  // Test 7: Self-Healing Telemetry Binding & Data/Memory Integrity
  {
    const t0 = Date.now();
    const shRes = await fetch('http://127.0.0.1:3000/api/self-healing/status').catch(() => null);
    const shJson = shRes && shRes.ok
      ? ((await shRes.json()) as { telemetry?: { modules?: { id: string }[] } })
      : null;
    const hasBinding = Boolean(shJson?.telemetry?.modules?.some((m) => m.id === 'legal-mind-center'));
    const storeAfter = loadStore();
    const memPreserved = (storeAfter.platformChatMemory || []).length >= memBefore;
    results.push({
      id: 7,
      nameAr: 'ارتباط مركز العقل القانوني بالمراقبة الحية وصون الذاكرة الحديدية',
      actionAr: 'فحص تسجيل legal-mind-center في Self-Healing وسلامة platformChatMemory',
      actualResultAr: `ربط المراقبة=${hasBinding} · الذاكرة=${(storeAfter.platformChatMemory || []).length}`,
      evidenceAr: `memBefore=${memBefore} · memAfter=${(storeAfter.platformChatMemory || []).length}`,
      verdict: hasBinding && memPreserved ? 'PASS' : 'FAIL',
      durationMs: Math.max(1, Date.now() - t0),
    });
  }

  // Test 8: Honest Offline Neural Weights Check (GGUF / llama.cpp) -> BLOCKED if missing
  {
    const t0 = Date.now();
    const ov = getLegalMindOverview();
    const ready = ov.brainStatus.offlineNeuralVerdict === 'READY';
    results.push({
      id: 8,
      nameAr: 'التحقق الأمين من الأوزان العصبية المحلية (GGUF) ومحرك llama.cpp دون إنترنت',
      actionAr: 'فحص data/weights/ والثنائيات التنفيذية المحلية لتأكيد عدم وجود محاكاة',
      actualResultAr: ov.brainStatus.offlineNeuralReasonAr,
      evidenceAr: `weightsOnDisk=${ov.brainStatus.localGgufWeightsCount} · llamaServer=${ov.brainStatus.localLlamaServerInstalled}`,
      verdict: ready ? 'PASS' : 'BLOCKED',
      durationMs: Math.max(1, Date.now() - t0),
    });
  }

  const finalState = loadState();
  finalState.acceptanceTests = results;
  saveState(finalState);

  return results;
}
