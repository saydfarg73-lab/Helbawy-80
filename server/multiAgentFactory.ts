import crypto from 'node:crypto';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  AgentStepLog,
  DbTable,
  ModelWeightEntry,
  PageSpec,
  Project,
  RagDocument,
} from '../src/types/helbawey.ts';
import { runIndependenceVerification } from './exporter.ts';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'مفتاح GEMINI_API_KEY غير مضبوط على الخادم. يُرجى تفعيله في إعدادات Secrets لاستخدام التوليد التلقائي بالذكاء الاصطناعي.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function selectBestModelForDevice(
  models: ModelWeightEntry[],
  targetRamGb: number,
  targetOs: string
): ModelWeightEntry {
  const eligible = models.filter(
    (m) => m.commercialRedistribution && m.minRamGb <= targetRamGb && m.parametersBillions >= 0.4
  );
  if (eligible.length === 0) {
    return models[0];
  }
  if (targetOs === 'Android') {
    const androidFit = eligible.find((m) => m.runtimeEngines.includes('Android-NNAPI'));
    if (androidFit) return androidFit;
  }
  // Prefer strongest model that fits comfortably under targetRamGb
  const sorted = [...eligible].sort((a, b) => b.parametersBillions - a.parametersBillions);
  return sorted.find((m) => m.ramRequiredGb <= targetRamGb) || sorted[sorted.length - 1];
}

async function generateWithFreeTierFailover(
  ai: GoogleGenAI,
  contents: string,
  config: Record<string, unknown>,
  preferredThinking: ThinkingLevel
) {
  const candidates = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as const;
  let lastErr: unknown = null;
  for (const model of candidates) {
    const modelThinking =
      model === 'gemini-3.1-flash-lite'
        ? preferredThinking === ThinkingLevel.HIGH
          ? ThinkingLevel.LOW
          : ThinkingLevel.MINIMAL
        : preferredThinking;
    try {
      return await ai.models.generateContent({
        model,
        contents,
        config: {
          ...config,
          thinkingConfig: { thinkingLevel: modelThinking },
        },
      });
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const retryable =
        msg.includes('429') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('503') ||
        msg.includes('UNAVAILABLE');
      if (!retryable) throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('تعذر الاتصال بنماذج Gemini المجانية المتاحة.');
}

export async function generateProjectWithMultiAgent(
  prompt: string,
  targetRamGb: number,
  targetOs: 'Linux' | 'Windows' | 'macOS' | 'Android',
  models: ModelWeightEntry[]
): Promise<Project> {
  const ai = getGeminiClient();
  const start = Date.now();
  const recommendedModel = selectBestModelForDevice(models, targetRamGb, targetOs);

  const response = await generateWithFreeTierFailover(
    ai,
    `أنت المنسق المركزي لمنصة الهلباوي (ALHELBAWEY AI SOFTWARE FACTORY) وتدير منظومة من 10 وكلاء هندسيين لبناء تطبيق برمجي متكامل ومستقل يعمل بدون إنترنت وبأوزان نماذج محلية.

أمر العميل:
"""
${prompt}
"""

مواصفات الجهاز المستهدف: نظام ${targetOs} · الذاكرة ${targetRamGb} GB RAM.
النموذج المحلي المرشح: ${recommendedModel.name} (${recommendedModel.parameters}, ${recommendedModel.license}).

أنشئ مواصفات تطبيق حقيقية ومكتملة باللغة العربية تتضمن:
1. اسم التطبيق ووصفه وslug إنجليزي نظيف.
2. 2-3 صفحات واجهة مستخدم (pages) مع عناصر widgets مرتبطة بالجداول.
3. 2-3 جداول قاعدة بيانات حقيقية (dbTables) بأعمدة واضحة وصفوف بيانات ابتدائية واقعية.
4. مستندين معرفيين مبدئيين (ragDocuments) لقاعدة المعرفة المحلية.
5. كود مصدر مبدئي نظيف لملفات server.js و src/App.tsx و db/schema.sql.
6. ملخصاً لكل وكيل من الوكلاء (RequirementsAnalyst, SystemArchitect, DatabaseEngineer, FrontendEngineer, BackendEngineer, AIWeightsEngineer, SecurityEngineer, QAEngineer, DebuggerEngineer, PackagingEngineer).`,
    {
      thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          slug: { type: Type.STRING },
          description: { type: Type.STRING },
          pages: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                name: { type: Type.STRING },
                route: { type: Type.STRING },
                layoutType: { type: Type.STRING },
                titleAr: { type: Type.STRING },
                subtitleAr: { type: Type.STRING },
                widgets: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      type: { type: Type.STRING },
                      labelAr: { type: Type.STRING },
                      boundTable: { type: Type.STRING },
                    },
                  },
                },
              },
            },
          },
          dbTables: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                labelAr: { type: Type.STRING },
                columns: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      type: { type: Type.STRING },
                      required: { type: Type.BOOLEAN },
                      labelAr: { type: Type.STRING },
                    },
                  },
                },
                sampleRowsJson: {
                  type: Type.STRING,
                  description: 'JSON array string of 2-3 sample row objects matching the columns.',
                },
              },
            },
          },
          ragDocuments: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                content: { type: Type.STRING },
              },
            },
          },
          serverCode: { type: Type.STRING },
          frontendCode: { type: Type.STRING },
          agentSummaries: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                agentKey: { type: Type.STRING },
                summary: { type: Type.STRING },
              },
            },
          },
        },
      },
    },
    ThinkingLevel.MEDIUM
  );

  const parsed = JSON.parse((response.text ?? '{}').trim()) as {
    name?: string;
    slug?: string;
    description?: string;
    pages?: PageSpec[];
    dbTables?: {
      name: string;
      labelAr: string;
      columns: { name: string; type: string; required: boolean; labelAr: string }[];
      sampleRowsJson?: string;
    }[];
    ragDocuments?: { title: string; content: string }[];
    serverCode?: string;
    frontendCode?: string;
    agentSummaries?: { agentKey: string; summary: string }[];
  };

  const now = new Date().toISOString();
  const safeSlug = (parsed.slug || 'helbawey-app')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'helbawey-app';

  const dbTables: DbTable[] = (parsed.dbTables || []).map((tbl) => {
    let rows: Record<string, string | number | boolean>[] = [];
    try {
      const rawRows = JSON.parse(tbl.sampleRowsJson || '[]');
      if (Array.isArray(rawRows)) {
        rows = rawRows.map((r, i) => ({ id: `row-${i + 1}`, ...r }));
      }
    } catch {
      rows = [];
    }
    return {
      name: tbl.name.replace(/[^a-zA-Z0-9_]/g, '_') || 'records',
      labelAr: tbl.labelAr || tbl.name,
      columns: (tbl.columns || []).map((c) => ({
        name: c.name.replace(/[^a-zA-Z0-9_]/g, '_'),
        type: (['TEXT', 'INTEGER', 'REAL', 'BOOLEAN', 'DATE'].includes(c.type) ? c.type : 'TEXT') as
          | 'TEXT'
          | 'INTEGER'
          | 'REAL'
          | 'BOOLEAN'
          | 'DATE',
        required: Boolean(c.required),
        labelAr: c.labelAr || c.name,
      })),
      rows,
    };
  });

  const ragDocuments: RagDocument[] = (parsed.ragDocuments || []).map((d, idx) => ({
    id: `doc-${idx + 1}-${crypto.randomUUID().slice(0, 6)}`,
    title: d.title,
    format: 'TXT',
    content: d.content,
    chunksCount: 1,
    wordCount: d.content.split(/\s+/).filter(Boolean).length,
    indexedAt: now,
  }));

  const agentDirectory: { key: string; nameAr: string; roleAr: string }[] = [
    { key: 'RequirementsAnalyst', nameAr: 'محلل المتطلبات', roleAr: 'تحليل الأمر وتحديد الوحدات' },
    { key: 'SystemArchitect', nameAr: 'مهندس المعمارية', roleAr: 'تصميم البنية المستقلة' },
    { key: 'DatabaseEngineer', nameAr: 'مهندس قواعد البيانات', roleAr: 'بناء الجداول والمخطط' },
    { key: 'FrontendEngineer', nameAr: 'مهندس الواجهات', roleAr: 'تصميم الصفحات والمكونات' },
    { key: 'BackendEngineer', nameAr: 'مهندس الخلفية والـ API', roleAr: 'تجهيز الخادم والمسارات' },
    { key: 'AIWeightsEngineer', nameAr: 'مهندس الذكاء الاصطناعي والأوزان', roleAr: 'تعيين النموذج والتكميم' },
    { key: 'SecurityEngineer', nameAr: 'مهندس الأمن', roleAr: 'فصل الأسرار وضبط الصلاحيات' },
    { key: 'QAEngineer', nameAr: 'مهندس الاختبارات', roleAr: 'اختبار الاستقلال المحلي' },
    { key: 'DebuggerEngineer', nameAr: 'مهندس إصلاح الأخطاء', roleAr: 'التحقق من السلامة البرمجية' },
    { key: 'PackagingEngineer', nameAr: 'مهندس التغليف والتصدير', roleAr: 'تحضير حزمة التسليم' },
  ];

  const elapsedPerAgent = Math.max(Math.round((Date.now() - start) / 10), 120);
  const agentTrace: AgentStepLog[] = agentDirectory.map((ag) => {
    const found = parsed.agentSummaries?.find((s) => s.agentKey === ag.key);
    return {
      agentKey: ag.key,
      agentNameAr: ag.nameAr,
      roleAr: ag.roleAr,
      status: 'TESTED',
      summary: found?.summary || `تم تنفيذ مهام ${ag.nameAr} بنجاح.`,
      durationMs: elapsedPerAgent,
      artifactsTouched: [],
    };
  });

  const sqlSchema = dbTables
    .map(
      (t) =>
        `CREATE TABLE ${t.name} (id TEXT PRIMARY KEY, ${t.columns.map((c) => `${c.name} ${c.type}`).join(', ')});`
    )
    .join('\n');

  const files: Record<string, string> = {
    'server.js':
      parsed.serverCode ||
      `import express from 'express';\nconst app = express();\napp.get('/api/health', (_, res) => res.json({ ok: true, offline: true }));\napp.listen(4000);`,
    'src/App.tsx':
      parsed.frontendCode ||
      `export default function App() {\n  return "${parsed.name || 'تطبيق الهلباوي المستقل'}";\n}`,
    'db/schema.sql': sqlSchema,
    'ai/model.config.json': JSON.stringify(
      {
        modelId: recommendedModel.id,
        modelName: recommendedModel.name,
        runtimeEngine: recommendedModel.runtimeEngines[0] || 'llama.cpp',
        offlineDefault: true,
      },
      null,
      2
    ),
  };

  const project: Project = {
    id: `proj-${crypto.randomUUID().slice(0, 8)}`,
    name: parsed.name || 'تطبيق مستقل جديد',
    slug: safeSlug,
    description: parsed.description || prompt.slice(0, 160),
    prompt,
    status: 'IMPLEMENTED',
    createdAt: now,
    updatedAt: now,
    currentVersion: 1,
    targetOs,
    targetRamGb,
    targetGpuVramGb: 0,
    selectedModelId: recommendedModel.id,
    runtimeEngine: recommendedModel.runtimeEngines[0] || 'llama.cpp',
    exportFormat: targetOs === 'Android' ? 'android' : 'server',
    authEnabled: true,
    offlineReady: true,
    files,
    pages: (parsed.pages || []).map((p, idx) => ({
      id: p.id || `page-${idx + 1}`,
      name: p.name || `Page${idx + 1}`,
      route: p.route || (idx === 0 ? '/' : `/page-${idx + 1}`),
      layoutType: (['dashboard', 'crud-table', 'chat-rag', 'analytics', 'settings'].includes(p.layoutType)
        ? p.layoutType
        : 'dashboard') as PageSpec['layoutType'],
      titleAr: p.titleAr || `صفحة ${idx + 1}`,
      subtitleAr: p.subtitleAr || '',
      widgets: Array.isArray(p.widgets) ? p.widgets : [],
    })),
    dbTables,
    apiRoutes: [
      { id: 'api-1', method: 'GET', path: '/api/tables', descriptionAr: 'استعراض بيانات الجداول المحلية', authRequired: true, usesLocalAI: false, requiresInternet: false },
      { id: 'api-2', method: 'POST', path: '/api/ai/chat', descriptionAr: 'محادثة العقل اللغوي المحلي', authRequired: true, usesLocalAI: true, requiresInternet: false },
      { id: 'api-3', method: 'POST', path: '/api/ai/rag', descriptionAr: 'البحث الدلالي في المستندات المحلية', authRequired: true, usesLocalAI: true, requiresInternet: false },
    ],
    agents: [
      {
        id: 'ag-main',
        nameAr: 'الوكيل الذكي المحلي للتطبيق',
        roleAr: 'معالجة أوامر المستخدمين وتحليل البيانات محلياً',
        executionMode: 'local-weights',
        allowedTables: dbTables.map((t) => t.name),
        requiresApprovalForMutations: true,
        systemPrompt: `أنت المساعد المحلي لتطبيق ${parsed.name || 'الشركة'}.`,
        status: 'IMPLEMENTED',
      },
    ],
    workflows: [
      {
        id: 'wf-1',
        nameAr: 'تحديث الفهرس المحلي وتلخيص التقارير',
        trigger: 'عند إضافة بيانات جديدة',
        steps: ['قراءة السجل الجديد', 'تحديث ملخص قاعدة المعرفة', 'حفظ النتيجة محلياً'],
        usesExternalIntegration: false,
        status: 'IMPLEMENTED',
      },
    ],
    integrations: [
      { id: 'int-email', nameAr: 'موصل البريد SMTP (اختياري)', category: 'email', enabled: false, requiresInternet: true, optionalOnly: true, endpointUrl: '' },
    ],
    ragDocuments,
    userRoles: [
      { id: 'u-1', name: 'مدير النظام', email: 'admin@local.app', role: 'OWNER', active: true },
    ],
    versions: [],
    agentTrace,
    verificationReport: null,
    deployment: {
      customDomain: `${safeSlug}.local`,
      httpsEnabled: true,
      targetServerType: 'on-prem-docker',
      lastDeployedAt: null,
      status: 'PLANNED',
    },
  };

  project.versions = [
    {
      version: 1,
      timestamp: now,
      noteAr: 'إنشاء المشروع عبر منظومة الوكلاء المتعددة',
      promptUsed: prompt,
      filesSnapshot: { ...project.files },
      pagesSnapshot: JSON.parse(JSON.stringify(project.pages)),
      dbTablesSnapshot: JSON.parse(JSON.stringify(project.dbTables)),
    },
  ];
  project.verificationReport = runIndependenceVerification(project, recommendedModel);
  project.status = project.verificationReport.externalApiCalled ? 'FAILED' : 'TESTED';

  return project;
}

export async function modifyProjectWithChat(
  project: Project,
  instruction: string,
  modelEntry: ModelWeightEntry
): Promise<{ project: Project; changeSummaryAr: string }> {
  const ai = getGeminiClient();

  const response = await generateWithFreeTierFailover(
    ai,
    `أنت مهندس التطوير التفاعلي في منصة الهلباوي.
المستخدم يطلب تعديلاً على مشروعه الحالي "${project.name}".
احرص على الحفاظ على جميع الأجزاء السليمة وعدم حذف أي صفحة أو جدول إلا إذا طُلب ذلك صراحة.

الوضع الحالي:
- الصفحات: ${JSON.stringify(project.pages.map((p) => ({ id: p.id, titleAr: p.titleAr, route: p.route })))}
- الجداول: ${JSON.stringify(project.dbTables.map((t) => ({ name: t.name, labelAr: t.labelAr, columns: t.columns.map((c) => c.name) })))}

طلب التعديل:
"""
${instruction}
"""

أعد JSON يصف الإضافات أو التعديلات المطلوبة فقط (صفحة جديدة اختيارية، جدول جديد اختياري، أو تحديث لملف src/App.tsx) مع ملخص واضح بالعربية.`,
    {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          changeSummaryAr: { type: Type.STRING },
          addPage: {
            type: Type.OBJECT,
            properties: {
              titleAr: { type: Type.STRING },
              subtitleAr: { type: Type.STRING },
              route: { type: Type.STRING },
              layoutType: { type: Type.STRING },
            },
          },
          addTable: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              labelAr: { type: Type.STRING },
              columnNames: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
          },
          updatedFrontendCode: { type: Type.STRING },
        },
      },
    },
    ThinkingLevel.LOW
  );

  const parsed = JSON.parse((response.text ?? '{}').trim()) as {
    changeSummaryAr?: string;
    addPage?: { titleAr?: string; subtitleAr?: string; route?: string; layoutType?: string };
    addTable?: { name?: string; labelAr?: string; columnNames?: string[] };
    updatedFrontendCode?: string;
  };

  const nextVersion = project.currentVersion + 1;
  const now = new Date().toISOString();
  const nextPages = [...project.pages];
  const nextTables = [...project.dbTables];
  const nextFiles = { ...project.files };

  if (parsed.addPage?.titleAr) {
    nextPages.push({
      id: `page-${nextVersion}`,
      name: `CustomPage${nextVersion}`,
      route: parsed.addPage.route || `/module-${nextVersion}`,
      layoutType: 'dashboard',
      titleAr: parsed.addPage.titleAr,
      subtitleAr: parsed.addPage.subtitleAr || 'تمت إضافتها عبر المحادثة الهندسية',
      widgets: [{ id: `w-${nextVersion}`, type: 'report', labelAr: parsed.addPage.titleAr }],
    });
  }

  if (parsed.addTable?.name) {
    const cleanName = parsed.addTable.name.replace(/[^a-zA-Z0-9_]/g, '_');
    if (cleanName && !nextTables.some((t) => t.name === cleanName)) {
      nextTables.push({
        name: cleanName,
        labelAr: parsed.addTable.labelAr || cleanName,
        columns: (parsed.addTable.columnNames || ['title', 'status']).map((col) => ({
          name: col.replace(/[^a-zA-Z0-9_]/g, '_'),
          type: 'TEXT',
          required: true,
          labelAr: col,
        })),
        rows: [],
      });
    }
  }

  if (parsed.updatedFrontendCode) {
    nextFiles['src/App.tsx'] = parsed.updatedFrontendCode;
  }

  const updatedProject: Project = {
    ...project,
    currentVersion: nextVersion,
    updatedAt: now,
    pages: nextPages,
    dbTables: nextTables,
    files: nextFiles,
    versions: [
      ...project.versions,
      {
        version: nextVersion,
        timestamp: now,
        noteAr: parsed.changeSummaryAr || instruction,
        promptUsed: instruction,
        filesSnapshot: { ...nextFiles },
        pagesSnapshot: JSON.parse(JSON.stringify(nextPages)),
        dbTablesSnapshot: JSON.parse(JSON.stringify(nextTables)),
      },
    ],
  };

  updatedProject.verificationReport = runIndependenceVerification(updatedProject, modelEntry);

  return {
    project: updatedProject,
    changeSummaryAr: parsed.changeSummaryAr || 'تم تطبيق التعديل مع الحفاظ على المكونات السليمة.',
  };
}
