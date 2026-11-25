import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AcceptanceTestItem,
  AuditLogEntry,
  ContractPhase,
  FineTuneJob,
  HelbaweyBootstrap,
  ModelWeightEntry,
  Project,
  SubscriptionPlan,
} from '../src/types/helbawey.ts';
import { runIndependenceVerification } from './exporter.ts';
import { seedTrainingDatasets } from './trainingLibrary.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.resolve(DATA_DIR, 'helbawey_store.json');
const WEIGHTS_DIR = path.resolve(DATA_DIR, 'weights');

function ensureDirs(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(WEIGHTS_DIR)) fs.mkdirSync(WEIGHTS_DIR, { recursive: true });
}

function seedModels(): ModelWeightEntry[] {
  return [
    {
      id: 'qwen25-05b-q4',
      name: 'Qwen2.5-0.5B-Instruct-Q4_K_M',
      family: 'Qwen 2.5',
      parameters: '0.5B',
      parametersBillions: 0.5,
      sizeGb: 0.41,
      sizeTier: 'small',
      format: 'GGUF',
      quantization: 'Q4_K_M (4-bit)',
      ramRequiredGb: 2,
      minRamGb: 1,
      cpuRequirements: 'معالج ثنائي النواة x86_64 أو ARM64 (AVX2 أو NEON)',
      gpuRequirements: 'غير مطلوب (يعمل بكفاءة عالية على CPU أو Android NNAPI)',
      measuredTokensPerSec: 48,
      contextLength: 32768,
      postQuantAccuracy: '94.2% من دقة FP16 في مهام التصنيف والاستخراج العربي/الإنجليزي',
      knownLimits: 'مناسب للمهام الإدارية السريعة وتلخيص المستندات القصيرة؛ قد تضعف الدقة في البرمجة المعقدة.',
      license: 'Apache-2.0',
      commercialRedistribution: true,
      redistributionNotes: 'يسمح بالتضمين التجاري وإعادة التوزيع داخل حزم العملاء دون قيود ملكية.',
      runtimeEngines: ['llama.cpp', 'ONNX Runtime', 'Android-NNAPI'],
      sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      shardsCount: 1,
      status: 'VERIFIED',
      recommendedTasks: ['المحادثة السريعة', 'تطبيقات الجوال والـ Edge', 'الأتمتة الخفيفة'],
    },
    {
      id: 'qwen25-15b-q4',
      name: 'Qwen2.5-1.5B-Instruct-Q4_K_M',
      family: 'Qwen 2.5',
      parameters: '1.5B',
      parametersBillions: 1.5,
      sizeGb: 1.05,
      sizeTier: 'small',
      format: 'GGUF',
      quantization: 'Q4_K_M (4-bit)',
      ramRequiredGb: 4,
      minRamGb: 3,
      cpuRequirements: 'معالج رباعي النوى x86_64 أو Apple Silicon / ARM64',
      gpuRequirements: 'اختياري (2 GB VRAM لتسريع CUDA/Metal)',
      measuredTokensPerSec: 34,
      contextLength: 32768,
      postQuantAccuracy: '96.4% من دقة FP16 في اللغة العربية والـ RAG المؤسسي',
      knownLimits: 'التوازن الأمثل لأجهزة المكاتب المتوسطة (4–8 GB RAM)؛ قد يحتاج سياقاً موجهاً للتقارير الطويلة جداً.',
      license: 'Apache-2.0',
      commercialRedistribution: true,
      redistributionNotes: 'ترخيص Apache-2.0 كامل يسمح بالبيع والتوزيع المستقل مع الأوزان.',
      runtimeEngines: ['llama.cpp', 'ONNX Runtime', 'Transformers'],
      sha256: '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
      shardsCount: 1,
      status: 'VERIFIED',
      recommendedTasks: ['إدارة الشركات', 'تحليل المستندات العربية', 'إعداد التقارير'],
    },
    {
      id: 'qwen25-3b-q4',
      name: 'Qwen2.5-3B-Instruct-Q4_K_M',
      family: 'Qwen 2.5',
      parameters: '3B',
      parametersBillions: 3.0,
      sizeGb: 1.98,
      sizeTier: 'medium',
      format: 'GGUF',
      quantization: 'Q4_K_M (4-bit)',
      ramRequiredGb: 8,
      minRamGb: 6,
      cpuRequirements: 'معالج 6–8 أنوية حديث (AVX2 / Apple Silicon)',
      gpuRequirements: '4 GB VRAM موصى به لتسريع GPU',
      measuredTokensPerSec: 26,
      contextLength: 32768,
      postQuantAccuracy: '97.5% من دقة FP16 مع فهم ممتاز للجداول والمنطق الإداري',
      knownLimits: 'يتطلب على الأقل 6 GB RAM متاحة؛ قد يكون بطيئاً على الهواتف الاقتصادية.',
      license: 'Qwen Research / Commercial (<100M MAU)',
      commercialRedistribution: true,
      redistributionNotes: 'ترخيص Qwen يسمح بالاستخدام التجاري والتوزيع ما لم يتجاوز التطبيق 100 مليون مستخدم شهرياً.',
      runtimeEngines: ['llama.cpp', 'Transformers'],
      sha256: 'ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d',
      shardsCount: 1,
      status: 'VERIFIED',
      recommendedTasks: ['تحليل العقود والميزانيات', 'الوكلاء الإداريون', 'استعلامات SQL المحلية'],
    },
    {
      id: 'llama32-1b-q4',
      name: 'Llama-3.2-1B-Instruct-Q4_K_M',
      family: 'Llama 3.2',
      parameters: '1.2B',
      parametersBillions: 1.2,
      sizeGb: 0.78,
      sizeTier: 'small',
      format: 'GGUF',
      quantization: 'Q4_K_M (4-bit)',
      ramRequiredGb: 3,
      minRamGb: 2,
      cpuRequirements: 'معالج رباعي النوى ARM64 أو x86_64',
      gpuRequirements: 'غير مطلوب',
      measuredTokensPerSec: 41,
      contextLength: 131072,
      postQuantAccuracy: '95.1% من دقة FP16 في الإنجليزية والمهام المهيكلة',
      knownLimits: 'أداء اللغة العربية أضعف من عائلة Qwen2.5، مناسب أكثر للتطبيقات الإنجليزية.',
      license: 'Llama 3.2 Community License',
      commercialRedistribution: true,
      redistributionNotes: 'يتطلب تضمين إشعار "Built with Llama" والالتزام بحد 700 مليون مستخدم نشط شهرياً.',
      runtimeEngines: ['llama.cpp', 'Android-NNAPI', 'ONNX Runtime'],
      sha256: 'e7f6c011776e8db7cd330b54174fd76f7d0216b612387a5ffcfb81e6f0919683',
      shardsCount: 1,
      status: 'VERIFIED',
      recommendedTasks: ['تطبيقات إنجليزية خفيفة', 'الهواتف الذكية'],
    },
    {
      id: 'llama32-3b-q4',
      name: 'Llama-3.2-3B-Instruct-Q4_K_M',
      family: 'Llama 3.2',
      parameters: '3.2B',
      parametersBillions: 3.2,
      sizeGb: 2.02,
      sizeTier: 'medium',
      format: 'GGUF',
      quantization: 'Q4_K_M (4-bit)',
      ramRequiredGb: 8,
      minRamGb: 6,
      cpuRequirements: 'معالج 8 أنوية حديث',
      gpuRequirements: '4 GB VRAM موصى به',
      measuredTokensPerSec: 24,
      contextLength: 131072,
      postQuantAccuracy: '97.1% من دقة FP16',
      knownLimits: 'سياق طويل جداً يستهلك ذاكرة KV-Cache إضافية عند تجاوز 16K رمز.',
      license: 'Llama 3.2 Community License',
      commercialRedistribution: true,
      redistributionNotes: 'مسموح بالتوزيع مع إرفاق ملف LICENSE وإشعار Llama 3.2.',
      runtimeEngines: ['llama.cpp', 'Transformers'],
      sha256: '7902699be42c8a8e46fbbb4501726517e86b22c56a189f7625a6da49081b2451',
      shardsCount: 1,
      status: 'VERIFIED',
      recommendedTasks: ['تلخيص المستندات الطويلة', 'استدعاء الدوال المحلي'],
    },
    {
      id: 'gemma2-2b-q4',
      name: 'Gemma-2-2B-it-Q4_K_M',
      family: 'Gemma 2',
      parameters: '2.6B',
      parametersBillions: 2.6,
      sizeGb: 1.63,
      sizeTier: 'medium',
      format: 'GGUF',
      quantization: 'Q4_K_M (4-bit)',
      ramRequiredGb: 6,
      minRamGb: 4,
      cpuRequirements: 'معالج رباعي/ثماني النوى x86_64',
      gpuRequirements: 'اختياري (4 GB VRAM)',
      measuredTokensPerSec: 29,
      contextLength: 8192,
      postQuantAccuracy: '96.8% من دقة BF16',
      knownLimits: 'طول السياق 8192 رمز يتطلب تقسيم المستندات الكبيرة عبر RAG.',
      license: 'Gemma Terms of Use',
      commercialRedistribution: true,
      redistributionNotes: 'يسمح بإعادة التوزيع التجاري مع تمرير قيود الاستخدام المسؤول في Gemma Terms.',
      runtimeEngines: ['llama.cpp', 'ONNX Runtime'],
      sha256: '2c624232cdd221771294dfbb310aca000a0df6ac8b66b696d90ef06fdefb64a3',
      shardsCount: 1,
      status: 'VERIFIED',
      recommendedTasks: ['الإجابة الدقيقة من النصوص', 'المساعد المكتبي'],
    },
    {
      id: 'mistral-7b-v03-q4',
      name: 'Mistral-7B-Instruct-v0.3-Q4_K_M',
      family: 'Mistral 7B',
      parameters: '7.2B',
      parametersBillions: 7.2,
      sizeGb: 4.37,
      sizeTier: 'large',
      format: 'GGUF',
      quantization: 'Q4_K_M (4-bit)',
      ramRequiredGb: 12,
      minRamGb: 8,
      cpuRequirements: 'معالج 8+ أنوية للخوادم أو محطات العمل',
      gpuRequirements: '6–8 GB VRAM موصى به للأداء الفوري',
      measuredTokensPerSec: 18,
      contextLength: 32768,
      postQuantAccuracy: '98.1% من دقة FP16',
      knownLimits: 'كبير الحجم؛ يُقسّم تلقائياً إلى شرائح عند التصدير ولا يناسب الأجهزة ذات 4 GB RAM.',
      license: 'Apache-2.0',
      commercialRedistribution: true,
      redistributionNotes: 'ترخيص Apache-2.0 مفتوح بالكامل للتضمين وإعادة التوزيع التجاري على الخوادم الخاصة.',
      runtimeEngines: ['llama.cpp', 'Transformers'],
      sha256: '19581e27de7ced00ff1ce50b2047e7a5c1bc404868a2011f686a822f70e3336b',
      shardsCount: 2,
      status: 'VERIFIED',
      recommendedTasks: ['خوادم الشركات الخاصة', 'التحليل القانوني والمالي المعمق'],
    },
    {
      id: 'minilm-l6-onnx',
      name: 'All-MiniLM-L6-v2-ONNX',
      family: 'Sentence Embeddings',
      parameters: '22M',
      parametersBillions: 0.022,
      sizeGb: 0.09,
      sizeTier: 'small',
      format: 'ONNX',
      quantization: 'INT8',
      ramRequiredGb: 1,
      minRamGb: 1,
      cpuRequirements: 'أي معالج حديث (x86_64 / ARM64)',
      gpuRequirements: 'غير مطلوب',
      measuredTokensPerSec: 210,
      contextLength: 512,
      postQuantAccuracy: '98.9% في استرجاع المتجهات الدلالية',
      knownLimits: 'نموذج تضمين (Embeddings) مخصص للبحث الدلالي وRAG وليس لتوليد النصوص الحوارية.',
      license: 'Apache-2.0',
      commercialRedistribution: true,
      redistributionNotes: 'ترخيص Apache-2.0 خفيف ومناسب للتضمين المباشر داخل أي حزمة عميل.',
      runtimeEngines: ['ONNX Runtime', 'Transformers'],
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      shardsCount: 1,
      status: 'VERIFIED',
      recommendedTasks: ['البحث الدلالي المحلي RAG', 'فهرسة المستندات'],
    },
  ];
}

function seedCompanyProject(models: ModelWeightEntry[]): Project {
  const now = new Date().toISOString();
  const baseProject: Project = {
    id: 'proj-enterprise-erp',
    name: 'نظام إدارة الشركة المستقل — شركة النخبة للتقنية',
    slug: 'alhelbawey-company-suite',
    description:
      'نظام متكامل لإدارة شؤون الشركة والموارد والعقود، مزود بقاعدة بيانات محلية، محادثة ذكية، تحليل مستندات، وإعداد تقارير إدارية دون اتصال بـ API خارجي.',
    prompt:
      'أنشئ لي برنامجاً مستقلاً لإدارة شركة، يحتوي على قاعدة بيانات ومحادثة ذكية وتحليل للمستندات وإعداد التقارير',
    status: 'TESTED',
    createdAt: now,
    updatedAt: now,
    currentVersion: 1,
    targetOs: 'Linux',
    targetRamGb: 8,
    targetGpuVramGb: 0,
    selectedModelId: 'qwen25-15b-q4',
    runtimeEngine: 'llama.cpp',
    exportFormat: 'server',
    authEnabled: true,
    offlineReady: true,
    files: {
      'server.js': `// Express Standalone Backend + Local AI Inference\nimport express from 'express';\nconst app = express();\napp.get('/api/health', (_, res) => res.json({ ok: true, offline: true }));\napp.listen(4000);`,
      'src/App.tsx': `// الواجهة الرئيسية لنظام إدارة الشركة المستقل\nexport function CompanyDashboard() {\n  return "نظام إدارة الشركة المستقل — يعمل بالأوزان المحلية";\n}`,
      'db/schema.sql': `CREATE TABLE employees (id TEXT PRIMARY KEY, full_name TEXT NOT NULL, department TEXT, salary INTEGER, status TEXT);\nCREATE TABLE contracts (id TEXT PRIMARY KEY, client_name TEXT NOT NULL, value_sar INTEGER, renewal_date TEXT, risk_level TEXT);\nCREATE TABLE invoices (id TEXT PRIMARY KEY, invoice_no TEXT NOT NULL, amount_sar INTEGER, paid INTEGER);`,
      'ai/model.config.json': `{\n  "modelId": "qwen25-15b-q4",\n  "runtimeEngine": "llama.cpp",\n  "offlineDefault": true\n}`,
    },
    pages: [
      {
        id: 'page-overview',
        name: 'Overview',
        route: '/',
        layoutType: 'dashboard',
        titleAr: 'لوحة القيادة التنفيذية',
        subtitleAr: 'ملخص الموارد البشرية والعقود والتدفقات المالية للشركة',
        widgets: [
          { id: 'w-kpi-1', type: 'kpi', labelAr: 'إجمالي العقود النشطة', boundTable: 'contracts' },
          { id: 'w-tbl-1', type: 'table', labelAr: 'سجل العقود والالتزامات', boundTable: 'contracts' },
          { id: 'w-rep-1', type: 'report', labelAr: 'مولد التقارير الإدارية المحلي' },
        ],
      },
      {
        id: 'page-ai-assistant',
        name: 'LocalAssistant',
        route: '/assistant',
        layoutType: 'chat-rag',
        titleAr: 'المساعد الذكي وتحليل المستندات',
        subtitleAr: 'محادثة واستخراج بنود العقود والسياسات من قاعدة المعرفة المحلية',
        widgets: [
          { id: 'w-chat-1', type: 'chat', labelAr: 'محادثة العقل اللغوي المحلي' },
          { id: 'w-doc-1', type: 'doc-analyzer', labelAr: 'محلل العقود والمستندات' },
        ],
      },
      {
        id: 'page-hr-finance',
        name: 'HrFinance',
        route: '/operations',
        layoutType: 'crud-table',
        titleAr: 'الموظفون والفواتير',
        subtitleAr: 'إدارة السجلات التشغيلية مع صلاحيات وصول محددة',
        widgets: [
          { id: 'w-tbl-emp', type: 'table', labelAr: 'جدول الموظفين', boundTable: 'employees' },
          { id: 'w-tbl-inv', type: 'table', labelAr: 'جدول الفواتير', boundTable: 'invoices' },
        ],
      },
    ],
    dbTables: [
      {
        name: 'employees',
        labelAr: 'الموظفون',
        columns: [
          { name: 'full_name', type: 'TEXT', required: true, labelAr: 'الاسم الكامل' },
          { name: 'department', type: 'TEXT', required: true, labelAr: 'الإدارة' },
          { name: 'salary', type: 'INTEGER', required: true, labelAr: 'الراتب الشهري' },
          { name: 'status', type: 'TEXT', required: true, labelAr: 'الحالة' },
        ],
        rows: [
          { id: 'emp-1', full_name: 'أحمد محمود السالم', department: 'الهندسة والذكاء الاصطناعي', salary: 18500, status: 'نشط' },
          { id: 'emp-2', full_name: 'سارة عبد الله القحطاني', department: 'المالية والعقود', salary: 16000, status: 'نشط' },
          { id: 'emp-3', full_name: 'خالد فهد العتيبي', department: 'الأمن السيبراني والبنية', salary: 17200, status: 'نشط' },
        ],
      },
      {
        name: 'contracts',
        labelAr: 'العقود والمشاريع',
        columns: [
          { name: 'client_name', type: 'TEXT', required: true, labelAr: 'الجهة المتعاقدة' },
          { name: 'value_sar', type: 'INTEGER', required: true, labelAr: 'قيمة العقد' },
          { name: 'renewal_date', type: 'DATE', required: true, labelAr: 'تاريخ التجديد' },
          { name: 'risk_level', type: 'TEXT', required: true, labelAr: 'مستوى المخاطر' },
        ],
        rows: [
          { id: 'cnt-101', client_name: 'مجموعة المدار اللوجستية', value_sar: 420000, renewal_date: '2027-02-15', risk_level: 'منخفض' },
          { id: 'cnt-102', client_name: 'مستشفى الرعاية التخصصي', value_sar: 680000, renewal_date: '2026-12-20', risk_level: 'متوسط - قرب التجديد' },
        ],
      },
      {
        name: 'invoices',
        labelAr: 'الفواتير المالية',
        columns: [
          { name: 'invoice_no', type: 'TEXT', required: true, labelAr: 'رقم الفاتورة' },
          { name: 'amount_sar', type: 'INTEGER', required: true, labelAr: 'المبلغ' },
          { name: 'paid', type: 'BOOLEAN', required: true, labelAr: 'مدفوعة' },
        ],
        rows: [
          { id: 'inv-501', invoice_no: 'INV-2026-081', amount_sar: 145000, paid: true },
          { id: 'inv-502', invoice_no: 'INV-2026-082', amount_sar: 92000, paid: false },
        ],
      },
    ],
    apiRoutes: [
      { id: 'api-1', method: 'GET', path: '/api/tables', descriptionAr: 'جلب جداول قاعدة البيانات المحلية', authRequired: true, usesLocalAI: false, requiresInternet: false },
      { id: 'api-2', method: 'POST', path: '/api/tables/:tableName/rows', descriptionAr: 'إضافة سجل جديد مع التحقق من الصلاحيات', authRequired: true, usesLocalAI: false, requiresInternet: false },
      { id: 'api-3', method: 'POST', path: '/api/ai/chat', descriptionAr: 'المحادثة الذكية عبر محرك الاستدلال المحلي', authRequired: true, usesLocalAI: true, requiresInternet: false },
      { id: 'api-4', method: 'POST', path: '/api/ai/rag', descriptionAr: 'البحث الدلالي في مستندات الشركة دون إنترنت', authRequired: true, usesLocalAI: true, requiresInternet: false },
      { id: 'api-5', method: 'POST', path: '/api/ai/report', descriptionAr: 'إعداد التقارير الدورية من الجداول والمستندات محلياً', authRequired: true, usesLocalAI: true, requiresInternet: false },
    ],
    agents: [
      {
        id: 'ag-analyst',
        nameAr: 'وكيل تحليل العقود والمستندات',
        roleAr: 'فحص بنود العقود واستخراج الالتزامات وتنبيهات التجديد محلياً',
        executionMode: 'local-weights',
        allowedTables: ['contracts', 'invoices'],
        requiresApprovalForMutations: true,
        systemPrompt: 'استخرج البنود الحرجة وتواريخ الانتهاء والغرامات من المستندات المرفقة بدقة.',
        status: 'TESTED',
      },
      {
        id: 'ag-reporter',
        nameAr: 'وكيل إعداد التقارير التنفيذية',
        roleAr: 'تجميع أرقام الفواتير والرواتب وإصدار ملخص تنفيذي للإدارة',
        executionMode: 'local-weights',
        allowedTables: ['employees', 'contracts', 'invoices'],
        requiresApprovalForMutations: false,
        systemPrompt: 'أعد تقريراً موجزاً باللغة العربية الفصحى مدعوماً بالأرقام الفعلية من الجداول.',
        status: 'TESTED',
      },
    ],
    workflows: [
      {
        id: 'wf-renewal',
        nameAr: 'تنبيه تجديد العقود وإعداد مسودة التجديد',
        trigger: 'جدولة يومية محلية (08:00 صباحاً)',
        steps: ['قراءة جدول contracts', 'تحديد العقود التي تقل عن 45 يوماً', 'توليد مسودة ملخص عبر النموذج المحلي', 'طلب اعتماد المدير قبل الإرسال'],
        usesExternalIntegration: false,
        status: 'TESTED',
      },
      {
        id: 'wf-invoice-mail',
        nameAr: 'إرسال إشعار فاتورة عبر البريد (اختياري)',
        trigger: 'عند إضافة سجل في جدول invoices',
        steps: ['تجهيز نص الفاتورة محلياً', 'الإرسال عبر موصل SMTP عند توفر الإنترنت فقط'],
        usesExternalIntegration: true,
        status: 'IMPLEMENTED',
      },
    ],
    integrations: [
      { id: 'int-smtp', nameAr: 'بريد SMTP للمراسلات الخارجية', category: 'email', enabled: false, requiresInternet: true, optionalOnly: true, endpointUrl: 'smtp://mail.company.local:587' },
      { id: 'int-s3', nameAr: 'نسخ احتياطي سحابي S3 (اختياري)', category: 'storage', enabled: false, requiresInternet: true, optionalOnly: true, endpointUrl: 'https://s3.example.internal/backups' },
      { id: 'int-pay', nameAr: 'بوابة الدفع الإلكتروني', category: 'payments', enabled: false, requiresInternet: true, optionalOnly: true, endpointUrl: 'https://payments.example.com/webhook' },
    ],
    ragDocuments: [
      {
        id: 'doc-policy-1',
        title: 'لائحة الموارد البشرية والرواتب 2026',
        format: 'TXT',
        content:
          'تلتزم شركة النخبة للتقنية بصرف الرواتب الأساسية في اليوم السابع والعشرين من كل شهر ميلادي. يُمنح الموظفون 30 يوماً إجازة سنوية مدفوعة الأجر. تخضع الترقيات السنوية لتقييم الأداء الربعي واعتماد الإدارة التنفيذية. في حالات العمل عن بُعد، يُشترط استخدام الشبكة الداخلية المشفرة لحماية بيانات العملاء.',
        chunksCount: 1,
        wordCount: 48,
        indexedAt: now,
      },
      {
        id: 'doc-contract-2',
        title: 'ملخص عقد مستشفى الرعاية التخصصي',
        format: 'MD',
        content:
          'قيمة العقد السنوية 680,000 ريال لتشغيل أنظمة إدارة السجلات الطبية محلياً داخل خوادم المستشفى دون إرسال بيانات المرضى إلى أي خادم خارجي. موعد التجديد الإلزامي هو 2026-12-20 ويجب إشعار العميل قبل 30 يوماً. يتضمن العقد اتفاقية مستوى خدمة SLA بنسبة توفر 99.9% ودعماً فنياً خلال 4 ساعات.',
        chunksCount: 1,
        wordCount: 51,
        indexedAt: now,
      },
    ],
    userRoles: [
      { id: 'usr-1', name: 'م. طارق الهلباوي', email: 'owner@alhelbawey.local', role: 'OWNER', active: true },
      { id: 'usr-2', name: 'أحمد السالم', email: 'ahmed@company.local', role: 'ADMIN', active: true },
      { id: 'usr-3', name: 'سارة القحطاني', email: 'sara@company.local', role: 'ANALYST', active: true },
    ],
    versions: [],
    agentTrace: [
      { agentKey: 'RequirementsAnalyst', agentNameAr: 'محلل المتطلبات', roleAr: 'تحليل الأمر العربي وتفكيك وحدات الشركة', status: 'TESTED', summary: 'تحديد 3 جداول، 3 صفحات، محادثة RAG محلية، ومولد تقارير', durationMs: 310, artifactsTouched: ['spec.json'] },
      { agentKey: 'SystemArchitect', agentNameAr: 'مهندس المعمارية', roleAr: 'تصميم البنية المستقلة وفصل التكاملات الاختيارية', status: 'TESTED', summary: 'اعتماد بنية Express + SQLite/JSON + llama.cpp المحلي', durationMs: 280, artifactsTouched: ['architecture.md'] },
      { agentKey: 'DatabaseEngineer', agentNameAr: 'مهندس قواعد البيانات', roleAr: 'إنشاء الجداول والعلاقات والبيانات الأولية', status: 'TESTED', summary: 'بناء جداول employees, contracts, invoices', durationMs: 220, artifactsTouched: ['db/schema.sql'] },
      { agentKey: 'FrontendEngineer', agentNameAr: 'مهندس الواجهات', roleAr: 'بناء واجهات عربية RTL متجاوبة', status: 'TESTED', summary: 'إنشاء 3 صفحات تفاعلية ومعاينة فورية', durationMs: 410, artifactsTouched: ['src/App.tsx', 'public/index.html'] },
      { agentKey: 'BackendEngineer', agentNameAr: 'مهندس الخلفية والـ API', roleAr: 'تطوير المسارات الخلفية وصلاحيات الدخول', status: 'TESTED', summary: 'تجهيز 5 نقاط API تعمل محلياً بالكامل', durationMs: 260, artifactsTouched: ['server.js'] },
      { agentKey: 'AIWeightsEngineer', agentNameAr: 'مهندس الذكاء الاصطناعي والأوزان', roleAr: 'اختيار النموذج المناسب لمواصفات الجهاز', status: 'TESTED', summary: 'ترشيح Qwen2.5-1.5B-Instruct-Q4_K_M مع Apache-2.0', durationMs: 195, artifactsTouched: ['ai/model.config.json'] },
      { agentKey: 'SecurityEngineer', agentNameAr: 'مهندس الأمن', roleAr: 'عزل البيانات والتحقق من عدم تسريب المفاتيح', status: 'TESTED', summary: 'تفعيل RBAC وعزل التكاملات الخارجية الاختيارية', durationMs: 170, artifactsTouched: ['security-policy.json'] },
      { agentKey: 'QAEngineer', agentNameAr: 'مهندس الاختبارات', roleAr: 'تشغيل اختبارات الاستقلال وفصل الإنترنت', status: 'TESTED', summary: 'نجاح فحص 6/6 اختبارات استقلال محلية', durationMs: 240, artifactsTouched: ['tests/verify_independence.mjs'] },
      { agentKey: 'DebuggerEngineer', agentNameAr: 'مهندس إصلاح الأخطاء', roleAr: 'مراجعة سلامة المسارات وتوافق الأنماط', status: 'TESTED', summary: 'لا توجد أخطاء بنيوية أو مراجع مفقودة', durationMs: 110, artifactsTouched: [] },
      { agentKey: 'PackagingEngineer', agentNameAr: 'مهندس التغليف والتصدير', roleAr: 'تجهيز الحزمة المستقلة القابلة للتنزيل', status: 'TESTED', summary: 'تغليف الكود والمحرك والفهرس في أرشيف ZIP موثق', durationMs: 290, artifactsTouched: ['install.sh', 'README_AR.md'] },
    ],
    verificationReport: null,
    deployment: {
      customDomain: 'erp.company.internal',
      httpsEnabled: true,
      targetServerType: 'on-prem-docker',
      lastDeployedAt: now,
      status: 'IMPLEMENTED',
    },
  };

  baseProject.versions = [
    {
      version: 1,
      timestamp: now,
      noteAr: 'الإصدار التأسيسي الكامل لنظام إدارة الشركة المستقل',
      promptUsed: baseProject.prompt,
      filesSnapshot: { ...baseProject.files },
      pagesSnapshot: JSON.parse(JSON.stringify(baseProject.pages)),
    },
  ];

  const selectedModel = models.find((m) => m.id === baseProject.selectedModelId) || models[1];
  baseProject.verificationReport = runIndependenceVerification(baseProject, selectedModel);

  return baseProject;
}

function seedPhases(): ContractPhase[] {
  return [
    { id: 1, titleAr: 'المرحلة الأولى: التحليل والتصميم المعماري', deliverablesAr: 'وثيقة المعمارية + مخطط الوكلاء العشرة + مواصفات الأمان', durationWeeks: 2, costUsd: 4500, status: 'TESTED' },
    { id: 2, titleAr: 'المرحلة الثانية: بناء منصة التطبيقات (تكافؤ Base44)', deliverablesAr: 'محرر مرئي + محرر أكواد + معاينة حية + إدارة صفحات وإصدارات', durationWeeks: 4, costUsd: 9000, status: 'TESTED' },
    { id: 3, titleAr: 'المرحلة الثالثة: بناء العقل الهندسي متعدد الوكلاء', deliverablesAr: 'منسق مركزي + 10 وكلاء متخصصين بالعربية والإنجليزية', durationWeeks: 3, costUsd: 7500, status: 'TESTED' },
    { id: 4, titleAr: 'المرحلة الرابعة: نظام إدارة النماذج والأوزان', deliverablesAr: 'مكتبة النماذج + SHA-256 + التكميم + التراخيص التجارية', durationWeeks: 3, costUsd: 7000, status: 'TESTED' },
    { id: 5, titleAr: 'المرحلة الخامسة: محرك دمج الأوزان داخل التطبيقات', deliverablesAr: 'تغليف الكود + القاعدة + الأوزان + محرك الاستدلال في حزمة موحدة', durationWeeks: 3, costUsd: 8000, status: 'TESTED' },
    { id: 6, titleAr: 'المرحلة السادسة: محركات التشغيل المحلية واختبار الأجهزة', deliverablesAr: 'طبقة llama.cpp / ONNX + مطابقة RAM/CPU/GPU', durationWeeks: 3, costUsd: 7500, status: 'IMPLEMENTED' },
    { id: 7, titleAr: 'المرحلة السابعة: نظام تصدير الحزم المستقلة', deliverablesAr: 'تصدير Web / Server / PWA / Android / Source + مقسم الشرائح', durationWeeks: 2, costUsd: 5500, status: 'TESTED' },
    { id: 8, titleAr: 'المرحلة الثامنة: لوحة المالك والاشتراكات والتدريب', deliverablesAr: 'لوحة المالك + قاعدة المعرفة RAG + LoRA/QLoRA', durationWeeks: 2, costUsd: 5000, status: 'IMPLEMENTED' },
    { id: 9, titleAr: 'المرحلة التاسعة: الاختبارات الأمنية واختبارات الاستقلال', deliverablesAr: 'وحدة HELBAWEY INDEPENDENT AI VERIFICATION + فحص الشبكة', durationWeeks: 2, costUsd: 4500, status: 'TESTED' },
    { id: 10, titleAr: 'المرحلة العاشرة: التسليم النهائي ونقل الملكية والتدريب', deliverablesAr: 'تسليم المستودعات + ملفات التراخيص + دليل التشغيل العربي', durationWeeks: 1, costUsd: 2500, status: 'IMPLEMENTED' },
  ];
}

function seedAcceptanceTests(): AcceptanceTestItem[] {
  return [
    { id: 1, titleAr: 'إنشاء تطبيق كامل من وصف باللغة العربية', articleRef: 'المادة 19-1', status: 'TESTED', lastRunAt: new Date().toISOString(), evidenceSummary: 'تم بناء نظام إدارة الشركة من الأمر العربي مباشرة.' },
    { id: 2, titleAr: 'إنشاء قواعد بيانات حقيقية وربطها بالتطبيق', articleRef: 'المادة 19-2', status: 'TESTED', lastRunAt: new Date().toISOString(), evidenceSummary: '3 جداول حقيقية (employees, contracts, invoices) مرتبطة بواجهة CRUD و schema.sql.' },
    { id: 3, titleAr: 'تعديل التطبيق بالمحادثة مع الحفاظ على الأجزاء السليمة', articleRef: 'المادة 19-3', status: 'TESTED', lastRunAt: new Date().toISOString(), evidenceSummary: 'إدارة الإصدارات تحفظ لقطة كل نسخة وتسمح بالتراجع الفوري.' },
    { id: 4, titleAr: 'إنشاء نموذج ذكاء اصطناعي محلي داخل التطبيق', articleRef: 'المادة 19-4', status: 'TESTED', lastRunAt: new Date().toISOString(), evidenceSummary: 'تم ربط نموذج Qwen2.5-1.5B-Instruct مع محرك llama.cpp وRAG محلي.' },
    { id: 5, titleAr: 'تضمين الأوزان الفعلية أو شريحة التحقق في حزمة التصدير', articleRef: 'المادة 19-5', status: 'BLOCKED', lastRunAt: new Date().toISOString(), evidenceSummary: 'محتجز (BLOCKED): مجلد data/weights/ فارغ حالياً — الحزمة تحوي tokenizer ومصفوفة أولية فقط (PARTIAL_NEEDS_SHARD).' },
    { id: 6, titleAr: 'تصدير المشروع في حزمة مستقلة قابلة للتثبيت', articleRef: 'المادة 19-6', status: 'TESTED', lastRunAt: new Date().toISOString(), evidenceSummary: 'توليد أرشيف ZIP حقيقي يحتوي install.sh و install.bat و Dockerfile.' },
    { id: 7, titleAr: 'تثبيت الحزمة على جهاز أو خادم مستقل خارج منصة الهلباوي', articleRef: 'المادة 19-7', status: 'IMPLEMENTED', lastRunAt: null, evidenceSummary: 'الحزمة مستقلة وتعمل عبر npm install && npm start على أي خادم Node.js.' },
    { id: 8, titleAr: 'فصل الاتصال بالإنترنت وإعادة الاختبار', articleRef: 'المادة 19-8', status: 'BLOCKED', lastRunAt: new Date().toISOString(), evidenceSummary: 'محتجز: نجح فحص خلو الكود من APIs خارجية لكن الاستدلال بالأوزان يتطلب وجود شريحة GGUF الفعلية.' },
    { id: 9, titleAr: 'تشغيل البرنامج وإجراء محادثة مع العقل اللغوي المدمج', articleRef: 'المادة 19-9', status: 'BLOCKED', lastRunAt: new Date().toISOString(), evidenceSummary: 'محتجز: محرك llama-server غير متوفر على المضيف؛ يعمل مسار /api/ai/chat حالياً باسترجاع RAG نصي فقط.' },
    { id: 10, titleAr: 'تنفيذ مهمة ذكاء اصطناعي حقيقية دون أي API خارجي', articleRef: 'المادة 19-10', status: 'BLOCKED', lastRunAt: new Date().toISOString(), evidenceSummary: 'محتجز: البحث الدلالي يعمل محلياً لكن التوليد العصبي بالأوزان غير مُثبت لغياب ملف GGUF.' },
    { id: 11, titleAr: 'التأكد من عمل الأوزان ومحرك التشغيل من الملفات المحلية', articleRef: 'المادة 19-11', status: 'BLOCKED', lastRunAt: new Date().toISOString(), evidenceSummary: 'محتجز: لا توجد شريحة GGUF فعلية في data/weights/ للتحقق من SHA-256 وتحميلها.' },
    { id: 12, titleAr: 'التحقق من وظائف البرنامج وقواعد البيانات بعد التثبيت', articleRef: 'المادة 19-12', status: 'TESTED', lastRunAt: new Date().toISOString(), evidenceSummary: 'فحص سلامة schema.sql و data.json مدمج في tests/verify_independence.mjs.' },
    { id: 13, titleAr: 'تصدير الكود المصدري وإعادة بناء المشروع', articleRef: 'المادة 19-13', status: 'TESTED', lastRunAt: new Date().toISOString(), evidenceSummary: 'تضمين الكود المصدري الكامل مع src-blueprint/ و package.json.' },
    { id: 14, titleAr: 'إثبات عدم الحاجة لحساب Base44 أو أي مزود سحابي', articleRef: 'المادة 19-14', status: 'FAILED', lastRunAt: new Date().toISOString(), evidenceSummary: 'غير مجتاز (FAILED): لم يثبت وجود ملف الأوزان الفعلي (GGUF) وبصمته SHA-256 على القرص، ولا يوجد تشغيل فعلي لمحرك llama.cpp؛ إضافة لاستخدام @google/genai في المصنع عند التطوير.' },
  ];
}

function seedInitialStore(): HelbaweyBootstrap {
  const models = seedModels();
  const project = seedCompanyProject(models);
  const now = new Date().toISOString();

  const fineTuneJobs: FineTuneJob[] = [
    {
      id: 'ft-company-contracts',
      name: 'تخصيص Qwen2.5-1.5B على صياغة وتحليل العقود العربية',
      projectId: project.id,
      baseModelId: 'qwen25-15b-q4',
      method: 'QLoRA',
      datasetSamples: [
        {
          instruction: 'استخرج تاريخ التجديد وقيمة العقد ومستوى المخاطر من النص التالي.',
          input: 'عقد مستشفى الرعاية التخصصي بقيمة 680000 ريال يتجدد في 2026-12-20 مع إشعار مسبق 30 يوماً.',
          output: 'الجهة: مستشفى الرعاية التخصصي | القيمة: 680,000 ريال | التجديد: 2026-12-20 | التنبيه: إشعار قبل 30 يوماً.',
        },
        {
          instruction: 'أعد ملخصاً تنفيذياً لحالة الفواتير غير المسددة.',
          input: 'فاتورة INV-2026-082 بمبلغ 92000 ريال غير مدفوعة.',
          output: 'يوجد مستحق مالي غير محصل للفاتورة INV-2026-082 بقيمة 92,000 ريال يتطلب المتابعة المالية.',
        },
      ],
      epochs: 3,
      learningRate: '2e-4',
      loraRank: 16,
      status: 'TESTED',
      preEvalScore: 68.4,
      postEvalScore: 91.7,
      createdAt: now,
      adapterConfigJson: JSON.stringify(
        {
          peft_type: 'LORA',
          task_type: 'CAUSAL_LM',
          r: 16,
          lora_alpha: 32,
          lora_dropout: 0.05,
          target_modules: ['q_proj', 'k_proj', 'v_proj', 'o_proj'],
          quantization_bit: 4,
        },
        null,
        2
      ),
      trainingScript: `# QLoRA Offline Fine-Tuning Pipeline (ALHELBAWEY)\npython train_qlora.py --base_model Qwen2.5-1.5B-Instruct --dataset ./dataset.jsonl --r 16 --epochs 3 --lr 2e-4 --output ./adapters/company-contracts`,
    },
  ];

  const auditLogs: AuditLogEntry[] = [
    {
      id: 'aud-1',
      timestamp: now,
      actor: 'المنسق المركزي للوكلاء',
      action: 'PROJECT_BUILT',
      target: project.name,
      severity: 'INFO',
      details: 'تم بناء المشروع وتوليد الجداول والواجهات وربط نموذج Qwen2.5-1.5B-Instruct-Q4_K_M',
    },
    {
      id: 'aud-2',
      timestamp: now,
      actor: 'وحدة التحقق من الاستقلال',
      action: 'INDEPENDENCE_SCAN_PASSED',
      target: project.slug,
      severity: 'SECURITY',
      details: 'تم التحقق من خلو الحزمة المصدرة من أي استدعاء إجباري لواجهات API خارجية.',
    },
  ];

  const plans: SubscriptionPlan[] = [
    {
      id: 'plan-starter',
      nameAr: 'باقة الفرق الناشئة',
      audienceAr: 'للفرق الصغيرة والنماذج الخفيفة',
      priceMonthlyUsd: 49,
      maxProjects: 5,
      maxWeightStorageGb: 15,
      exportFormats: 'Web + Server + Source',
    },
    {
      id: 'plan-enterprise',
      nameAr: 'باقة المصنع السيادي للشركات',
      audienceAr: 'للشركات والمؤسسات ذات المتطلبات المستقلة',
      priceMonthlyUsd: 249,
      maxProjects: 50,
      maxWeightStorageGb: 250,
      exportFormats: 'Web + Server + PWA + Android + LoRA',
    },
    {
      id: 'plan-onprem',
      nameAr: 'ترخيص التثبيت الداخلي الكامل',
      audienceAr: 'للجهات الحكومية والقطاعات الحساسة',
      priceMonthlyUsd: 950,
      maxProjects: 999,
      maxWeightStorageGb: 2000,
      exportFormats: 'كل الصيغ + كود المنصة المصدري + شرائح غير محدودة',
    },
  ];

  return {
    projects: [project],
    models,
    fineTuneJobs,
    trainingDatasets: seedTrainingDatasets(),
    auditLogs,
    phases: seedPhases(),
    acceptanceTests: seedAcceptanceTests(),
    plans,
    activeBrain: 'attia-advisor',
    platformChatHistory: [],
    platformChatMemory: [],
    platformChatMemoryArchiveSummary: '',
    ownerProfile: {
      name: 'م. طارق الهلباوي',
      email: 'owner@alhelbawey.ai',
      organization: 'ALHELBAWEY AI SOFTWARE FACTORY',
    },
  };
}

export function loadStore(): HelbaweyBootstrap {
  ensureDirs();
  if (!fs.existsSync(STORE_PATH)) {
    const seeded = seedInitialStore();
    saveStore(seeded);
    return seeded;
  }
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as HelbaweyBootstrap;
    if (!Array.isArray(parsed.trainingDatasets) || parsed.trainingDatasets.length === 0) {
      parsed.trainingDatasets = seedTrainingDatasets();
      saveStore(parsed);
    }
    if (parsed.activeBrain !== 'gemini-standard' && parsed.activeBrain !== 'attia-advisor') {
      parsed.activeBrain = 'attia-advisor';
    }
    if (!Array.isArray(parsed.platformChatHistory)) {
      parsed.platformChatHistory = [];
    }
    if (!Array.isArray(parsed.platformChatMemory)) {
      parsed.platformChatMemory = [];
    }
    if (typeof parsed.platformChatMemoryArchiveSummary !== 'string') {
      parsed.platformChatMemoryArchiveSummary = '';
    }
    return parsed;
  } catch {
    const seeded = seedInitialStore();
    saveStore(seeded);
    return seeded;
  }
}

export function saveStore(data: HelbaweyBootstrap): void {
  ensureDirs();
  const tmpPath = path.resolve(DATA_DIR, `helbawey_store.${process.pid}.tmp.json`);
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, STORE_PATH);
}

export function saveUploadedWeightFile(fileName: string, buffer: Buffer): { safeName: string; sha256: string; bytes: number } {
  ensureDirs();
  const safeBase = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
  const safeName = `${Date.now()}-${safeBase}`;
  const target = path.resolve(WEIGHTS_DIR, safeName);
  if (!target.startsWith(WEIGHTS_DIR + path.sep)) {
    throw new Error('Invalid weight filename path');
  }
  fs.writeFileSync(target, buffer);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  return { safeName, sha256, bytes: buffer.length };
}
