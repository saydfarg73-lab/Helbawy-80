import { useState } from 'react';
import { BookOpen, FileText, Plus, Search, Trash2, Upload } from 'lucide-react';
import type { Project, RagSearchHit } from '../types/helbawey';

interface Props {
  project: Project;
  onProjectUpdated: (updated: Project) => void;
}

export function KnowledgeRagWorkspace({ project, onProjectUpdated }: Props) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [format, setFormat] = useState<'TXT' | 'MD' | 'CSV' | 'PDF-TEXT' | 'DOCX-TEXT'>('TXT');
  const [query, setQuery] = useState('ما هو موعد تجديد عقد مستشفى الرعاية التخصصي؟');
  const [hits, setHits] = useState<RagSearchHit[]>([]);
  const [answer, setAnswer] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  async function handleAddDocument() {
    if (!title.trim() || !content.trim()) return;
    const res = await fetch(`/api/projects/${project.id}/rag/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content, format }),
    });
    if (res.ok) {
      setTitle('');
      setContent('');
      onProjectUpdated((await res.json()) as Project);
    }
  }

  async function handleDeleteDoc(docId: string) {
    const res = await fetch(`/api/projects/${project.id}/rag/documents/${docId}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      onProjectUpdated((await res.json()) as Project);
    }
  }

  function handleFileImport(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setTitle(file.name.replace(/\.[^.]+$/, ''));
      setContent(String(reader.result || ''));
      if (file.name.endsWith('.md')) setFormat('MD');
      else if (file.name.endsWith('.csv')) setFormat('CSV');
      else setFormat('TXT');
    };
    reader.readAsText(file);
  }

  async function handleRunLocalSearch() {
    if (!query.trim()) return;
    const res = await fetch(`/api/projects/${project.id}/rag/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (res.ok) {
      const data = await res.json();
      setHits(data.hits || []);
      setAnswer(data.synthesizedAnswer || '');
      setLatencyMs(data.latencyMs ?? 1);
    }
  }

  return (
    <div className="space-y-6">
      {/* Explicit Separation Notice per Article 11 */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <BookOpen className="w-5 h-5 text-slate-700 dark:text-slate-300 mt-0.5 shrink-0" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                قاعدة المعرفة المحلية والبحث الدلالي (Local RAG Engine)
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-3xl leading-relaxed">
                تتم فهرسة المستندات محلياً بتقنية TF-IDF ومتجهات النصوص العربية والإنجليزية وتصدير الفهرس في{' '}
                <code className="font-mono">rag/knowledge_index.json</code> للعمل دون إنترنت. تنويه تقني: هذه المستندات تمثل بيانات معرفة وفهارس استرجاع، وليست أوزان النموذج اللغوي.
              </p>
            </div>
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-500">
            {project.ragDocuments.length} مستند مفهرس · وضع العمل: Offline Local
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Document Ingestion */}
        <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              استيراد وفهرسة مستند محلي
            </h3>
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer hover:underline">
              <Upload className="w-3.5 h-3.5" />
              <span>استيراد ملف TXT/MD/CSV</span>
              <input
                type="file"
                className="sr-only"
                accept=".txt,.md,.csv,.json"
                onChange={(e) => handleFileImport(e.target.files?.[0])}
              />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="عنوان المستند أو العقد"
              className="col-span-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
            />
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as typeof format)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-2 text-xs font-mono"
            >
              <option value="TXT">TXT</option>
              <option value="MD">MD</option>
              <option value="CSV">CSV</option>
              <option value="PDF-TEXT">PDF-TEXT</option>
              <option value="DOCX-TEXT">DOCX-TEXT</option>
            </select>
          </div>

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            placeholder="ألصق نص المستند، العقد، أو اللائحة لفهرستها محلياً..."
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
          />

          <button
            type="button"
            onClick={handleAddDocument}
            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>فهرسة المستند في القاعدة المحلية</span>
          </button>

          <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-2">
            <div className="text-xs font-semibold text-slate-500">المستندات المفهرسة حالياً</div>
            {project.ragDocuments.map((doc) => (
              <div
                key={doc.id}
                className="flex items-start justify-between gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
              >
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
                    <FileText className="w-3.5 h-3.5 text-slate-500" />
                    <span>{doc.title}</span>
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-500 mt-0.5">
                    {doc.format} · {doc.wordCount} كلمة · {doc.chunksCount} مقاطع
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteDoc(doc.id)}
                  className="text-rose-600 hover:text-rose-800 dark:text-rose-400 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Live Offline Semantic Search */}
        <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              اختبار البحث الدلالي وربط الإجابات بالمصادر (بدون إنترنت)
            </h3>
            {latencyMs !== null && (
              <span className="text-xs font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                زمن التنفيذ المحلي: {latencyMs} ms
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="اكتب سؤالاً للبحث داخل مستندات الشركة..."
              className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
            />
            <button
              type="button"
              onClick={handleRunLocalSearch}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
              <span>بحث محلي</span>
            </button>
          </div>

          {answer && (
            <div className="space-y-3">
              <pre className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed font-sans">
                {answer}
              </pre>

              {hits.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-500">المصادر المرجعية المستخرجة</div>
                  {hits.map((h, i) => (
                    <div
                      key={`${h.docId}-${h.chunkIndex}-${i}`}
                      className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs"
                    >
                      <div className="flex items-center justify-between font-semibold text-slate-900 dark:text-slate-100 mb-1">
                        <span>{h.title}</span>
                        <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                          تطابق {(h.score * 100).toFixed(1)}%
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{h.excerpt}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
