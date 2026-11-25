import { useState } from 'react';
import {
  BookmarkCheck,
  Database,
  Loader2,
  Pin,
  PinOff,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type { IroncladMemoryCategory, IroncladMemoryItem } from '../types/helbawey';

interface Props {
  items: IroncladMemoryItem[];
  archiveSummary: string;
  historyCount: number;
  loading: boolean;
  onAddItem: (payload: {
    category: IroncladMemoryCategory;
    title: string;
    content: string;
    pinned: boolean;
  }) => Promise<void>;
  onTogglePin: (id: string, nextPinned: boolean) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onClearAllMemory: () => Promise<void>;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<IroncladMemoryCategory, string> = {
  'user-rule': 'قاعدة مثبتة',
  'glossary-term': 'معجم ترجمة',
  'legal-case': 'قضية / عقد',
  'fact-entity': 'حقيقة / كيان',
  'document-digest': 'مستند مؤرشف',
  decision: 'قرار معتمد',
};

export function IroncladMemoryPanel({
  items,
  archiveSummary,
  historyCount,
  loading,
  onAddItem,
  onTogglePin,
  onDeleteItem,
  onClearAllMemory,
  onClose,
}: Props) {
  const [category, setCategory] = useState<IroncladMemoryCategory>('user-rule');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [filterCat, setFilterCat] = useState<'ALL' | IroncladMemoryCategory>('ALL');
  const [confirmClear, setConfirmClear] = useState(false);

  const filteredItems = items.filter((item) =>
    filterCat === 'ALL' ? true : item.category === filterCat
  );

  async function handleAddSubmit() {
    if (!title.trim() || !content.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onAddItem({
        category,
        title: title.trim(),
        content: content.trim(),
        pinned: true,
      });
      setTitle('');
      setContent('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/90 px-4 sm:px-5 py-4 space-y-4 max-h-[58%] overflow-y-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Database className="w-4 h-4 text-slate-800 dark:text-slate-200 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
              الذاكرة الحديدية الدائمة للمحاور (تبقى محفوظة عبر الجلسات وإعادة التشغيل)
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              {items.length} سجل دائم · {items.filter((i) => i.pinned).length} مثبت إلزامياً ·{' '}
              {historyCount} رسالة نشطة محفوظة
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {items.length > 0 && !confirmClear && (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[11px] text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer whitespace-nowrap shrink-0"
            >
              مسح الذاكرة الدائمة
            </button>
          )}
          {confirmClear && (
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={async () => {
                  await onClearAllMemory();
                  setConfirmClear(false);
                }}
                className="px-2.5 py-1 rounded-md bg-rose-700 text-white text-[11px] font-medium cursor-pointer whitespace-nowrap shrink-0"
              >
                تأكيد المسح النهائي
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-800 text-[11px] cursor-pointer whitespace-nowrap shrink-0"
              >
                إلغاء
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق لوحة الذاكرة الحديدية"
            className="p-1 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Add Permanent Rule / Legal Case Fact / Glossary Term */}
      <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2.5">
        <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
          <BookmarkCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>تثبيت حقيقة أو قاعدة أو مصطلح ترجمة في الذاكرة الحديدية يدوياً</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as IroncladMemoryCategory)}
            aria-label="تصنيف الذاكرة"
            className="sm:col-span-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-[11px]"
          >
            <option value="user-rule">قاعدة مثبتة دائماً</option>
            <option value="glossary-term">معجم ترجمة معتمد</option>
            <option value="legal-case">وقائع قضية / عقد</option>
            <option value="fact-entity">حقيقة / طرف / كيان</option>
            <option value="decision">قرار معتمد</option>
          </select>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              category === 'glossary-term'
                ? 'المصطلح الأصلي (مثال: Indemnification)'
                : 'العنوان المختصر (مثال: مقر التحكيم المعتمد)'
            }
            className="sm:col-span-4 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-[11px]"
          />
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              category === 'glossary-term'
                ? 'المقابل المعتمد (مثال: التعويض والضمان التعاقدي)'
                : 'التفصيل الدائم الذي يتذكره المحاور دائماً...'
            }
            className="sm:col-span-4 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-[11px]"
          />
          <button
            type="button"
            onClick={() => void handleAddSubmit()}
            disabled={submitting || !title.trim() || !content.trim()}
            className="sm:col-span-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-[11px] font-medium cursor-pointer disabled:opacity-45 whitespace-nowrap"
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            <span className="sm:hidden">حفظ</span>
          </button>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap items-center gap-1">
        {(
          [
            { id: 'ALL', label: `الكل (${items.length})` },
            { id: 'user-rule', label: 'قواعد مثبتة' },
            { id: 'glossary-term', label: 'معجم الترجمة' },
            { id: 'legal-case', label: 'قضايا وعقود' },
            { id: 'document-digest', label: 'ملخصات المستندات' },
            { id: 'fact-entity', label: 'حقائق وكيانات' },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilterCat(f.id)}
            className={`px-2.5 py-1 rounded-md text-[11px] whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              filterCat === f.id
                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Stored Memory List */}
      {loading ? (
        <div className="py-4 text-center text-xs text-slate-500">جاري تحميل الذاكرة الحديدية...</div>
      ) : filteredItems.length === 0 ? (
        <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-500">
          لا توجد سجلات في هذا التصنيف بعد. يُستخرج المحتوى المهم والمستندات المرفقة تلقائياً بعد كل حوار، أو يمكنك تثبيت قاعدة يدوياً أعلاه.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-start justify-between gap-2"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {CATEGORY_LABELS[item.category] || item.category}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {new Date(item.updatedAt).toLocaleDateString('ar-EG')}
                  </span>
                  {item.pinned && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                        مثبت إلزامياً
                      </span>
                    </>
                  )}
                </div>
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                  {item.title}
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-3">
                  {item.content}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => void onTogglePin(item.id, !item.pinned)}
                  title={item.pinned ? 'إلغاء التثبيت' : 'تثبيت إلزامي'}
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  {item.pinned ? (
                    <PinOff className="w-3.5 h-3.5 text-amber-600" />
                  ) : (
                    <Pin className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void onDeleteItem(item.id)}
                  title="حذف من الذاكرة"
                  className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {archiveSummary && (
        <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
          <div className="font-semibold text-slate-800 dark:text-slate-200">
            أرشيف الحوارات السابقة المضغوط:
          </div>
          <div className="whitespace-pre-line leading-relaxed max-h-20 overflow-y-auto">
            {archiveSummary}
          </div>
        </div>
      )}
    </div>
  );
}
