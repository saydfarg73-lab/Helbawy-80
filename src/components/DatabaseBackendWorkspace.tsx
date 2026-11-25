import { useEffect, useState } from 'react';
import {
  Check,
  Database,
  KeyRound,
  Link2,
  Pencil,
  Plus,
  Search,
  Server,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type { Project, ProjectUserRole } from '../types/helbawey';
import { resilientFetchJson } from '../utils/resilientFetch';

interface Props {
  project: Project;
  onProjectUpdated: (updated: Project) => void;
}

interface JoinedDbRow extends Record<string, unknown> {
  id?: string;
  _relations?: {
    employeeName?: string;
    contractClient?: string;
    supplierName?: string;
  };
}

interface RowsQueryResponse {
  tableName: string;
  labelAr: string;
  count: number;
  rows: Record<string, string | number | boolean>[];
  joinedRows: JoinedDbRow[];
}

export function DatabaseBackendWorkspace({ project, onProjectUpdated }: Props) {
  const [selectedTableName, setSelectedTableName] = useState<string>(
    project.dbTables[0]?.name || ''
  );
  const [newRowValues, setNewRowValues] = useState<Record<string, string>>({});
  const [newTableName, setNewTableName] = useState('');
  const [newTableLabel, setNewTableLabel] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<ProjectUserRole['role']>('ANALYST');

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [joinedRows, setJoinedRows] = useState<JoinedDbRow[] | null>(null);
  const [querying, setQuerying] = useState(false);

  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [dbError, setDbError] = useState<string | null>(null);
  const [dbNotice, setDbNotice] = useState<string | null>(null);

  const activeTable =
    project.dbTables.find((t) => t.name === selectedTableName) || project.dbTables[0];

  const employeesRows = project.dbTables.find((t) => t.name === 'employees')?.rows || [];
  const contractsRows = project.dbTables.find((t) => t.name === 'contracts')?.rows || [];
  const suppliersRows = project.dbTables.find((t) => t.name === 'suppliers')?.rows || [];
  const tasksRows = project.dbTables.find((t) => t.name === 'tasks')?.rows || [];
  const invoicesRows = project.dbTables.find((t) => t.name === 'invoices')?.rows || [];

  const todayIso = new Date().toISOString().slice(0, 10);
  const avgComplianceRating =
    suppliersRows.length > 0
      ? (
          suppliersRows.reduce((acc, s) => acc + Number(s.compliance_rating || 0), 0) /
          suppliersRows.length
        ).toFixed(2)
      : '0.00';
  const overdueTasksCount = tasksRows.filter(
    (t) => Boolean(t.due_date) && String(t.due_date) < todayIso && String(t.status || '') !== 'مكتملة'
  ).length;
  const totalContractsSar = contractsRows.reduce((acc, c) => acc + Number(c.value_sar || 0), 0);
  const totalInvoicesSar = invoicesRows.reduce((acc, i) => acc + Number(i.amount_sar || 0), 0);

  useEffect(() => {
    if (project.dbTables.length > 0 && !project.dbTables.some((t) => t.name === selectedTableName)) {
      setSelectedTableName(project.dbTables[0].name);
    }
  }, [project.dbTables, selectedTableName]);

  useEffect(() => {
    setEditingRowId(null);
    setEditValues({});
    setJoinedRows(null);
    setOverdueOnly(false);
    setDbError(null);
  }, [selectedTableName, project.id]);

  async function runServerFilterQuery(
    qOverride?: string,
    statusOverride?: string,
    overdueOverride?: boolean
  ) {
    if (!activeTable) return;
    setQuerying(true);
    setDbError(null);
    try {
      const params = new URLSearchParams();
      const qVal = (qOverride !== undefined ? qOverride : searchQuery).trim();
      const sVal = (statusOverride !== undefined ? statusOverride : statusFilter).trim();
      const ovVal = overdueOverride !== undefined ? overdueOverride : overdueOnly;
      if (qVal) params.set('q', qVal);
      if (sVal) params.set('status', sVal);
      if (ovVal) params.set('overdue', 'true');
      const data = await resilientFetchJson<RowsQueryResponse>(
        `/api/projects/${project.id}/db/${activeTable.name}/rows?${params.toString()}`
      );
      setJoinedRows(data.joinedRows);
    } catch (err) {
      setDbError(err instanceof Error ? err.message : 'تعذر تنفيذ الاستعلام على القاعدة.');
    } finally {
      setQuerying(false);
    }
  }

  function resolveRelationBadge(colName: string, rawVal: unknown, rowJoined?: JoinedDbRow): string | null {
    const val = String(rawVal || '').trim();
    if (!val || val === '-') return null;
    if (colName === 'assignee_employee_id') {
      const fromJoined = rowJoined?._relations?.employeeName;
      if (fromJoined && fromJoined !== val) return fromJoined;
      const found = employeesRows.find((r) => String(r.id) === val);
      return found ? String(found.full_name || found.name || val) : null;
    }
    if (colName === 'contract_id') {
      const fromJoined = rowJoined?._relations?.contractClient;
      if (fromJoined && fromJoined !== val) return fromJoined;
      const found = contractsRows.find((r) => String(r.id) === val);
      return found ? String(found.client_name || found.title || val) : null;
    }
    if (colName === 'supplier_id') {
      const fromJoined = rowJoined?._relations?.supplierName;
      if (fromJoined && fromJoined !== val) return fromJoined;
      const found = suppliersRows.find((r) => String(r.id) === val);
      return found ? String(found.supplier_name || val) : null;
    }
    return null;
  }

  function renderFkOptions(colName: string): { id: string; label: string }[] | null {
    if (colName === 'assignee_employee_id' && employeesRows.length > 0) {
      return employeesRows.map((r) => ({
        id: String(r.id),
        label: `${String(r.full_name || r.id)} (${String(r.id)})`,
      }));
    }
    if (colName === 'contract_id' && contractsRows.length > 0) {
      return contractsRows.map((r) => ({
        id: String(r.id),
        label: `${String(r.client_name || r.id)} (${String(r.id)})`,
      }));
    }
    if (colName === 'supplier_id' && suppliersRows.length > 0) {
      return suppliersRows.map((r) => ({
        id: String(r.id),
        label: `${String(r.supplier_name || r.id)} (${String(r.id)})`,
      }));
    }
    return null;
  }

  async function handleInsertRow() {
    if (!activeTable) return;
    setDbError(null);
    setDbNotice(null);
    const payload: Record<string, string | number | boolean> = {};
    for (const col of activeTable.columns) {
      const raw = newRowValues[col.name] || '';
      if (col.type === 'INTEGER' || col.type === 'REAL') {
        payload[col.name] = Number(raw || 0);
      } else if (col.type === 'BOOLEAN') {
        payload[col.name] = raw === 'true' || raw === '1' || raw === 'نعم';
      } else {
        payload[col.name] = raw || '-';
      }
    }

    try {
      const updated = await resilientFetchJson<Project>(
        `/api/projects/${project.id}/db/${activeTable.name}/rows`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      setNewRowValues({});
      setJoinedRows(null);
      setDbNotice(`تمت إضافة السجل بنجاح إلى جدول ${activeTable.labelAr}.`);
      onProjectUpdated(updated);
    } catch (err) {
      setDbError(err instanceof Error ? err.message : 'تعذر إضافة السجل.');
    }
  }

  function startEditRow(row: Record<string, unknown>) {
    if (!activeTable) return;
    const draft: Record<string, string> = {};
    for (const col of activeTable.columns) {
      draft[col.name] = String(row[col.name] ?? '');
    }
    setEditingRowId(String(row.id));
    setEditValues(draft);
    setDbError(null);
  }

  async function handleSaveEditRow(rowId: string) {
    if (!activeTable) return;
    setDbError(null);
    setDbNotice(null);
    const payload: Record<string, string | number | boolean> = {};
    for (const col of activeTable.columns) {
      const raw = editValues[col.name] ?? '';
      if (col.type === 'INTEGER' || col.type === 'REAL') {
        payload[col.name] = Number(raw || 0);
      } else if (col.type === 'BOOLEAN') {
        payload[col.name] = raw === 'true' || raw === '1' || raw === 'نعم';
      } else {
        payload[col.name] = raw;
      }
    }

    try {
      const updated = await resilientFetchJson<Project>(
        `/api/projects/${project.id}/db/${activeTable.name}/rows/${encodeURIComponent(rowId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      setEditingRowId(null);
      setEditValues({});
      setJoinedRows(null);
      setDbNotice(`تم تحديث السجل (${rowId}) بنجاح وحفظه على القرص.`);
      onProjectUpdated(updated);
    } catch (err) {
      setDbError(err instanceof Error ? err.message : 'تعذر تعديل السجل.');
    }
  }

  async function handleDeleteRow(rowId: string) {
    if (!activeTable) return;
    setDbError(null);
    setDbNotice(null);
    try {
      const updated = await resilientFetchJson<Project>(
        `/api/projects/${project.id}/db/${activeTable.name}/rows/${encodeURIComponent(rowId)}`,
        { method: 'DELETE' }
      );
      setJoinedRows(null);
      setDbNotice(`تم حذف السجل (${rowId}) من جدول ${activeTable.labelAr}.`);
      onProjectUpdated(updated);
    } catch (err) {
      setDbError(err instanceof Error ? err.message : 'تعذر حذف السجل.');
    }
  }

  async function handleCreateTable() {
    const clean = newTableName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!clean || project.dbTables.some((t) => t.name === clean)) return;
    setDbError(null);

    const updatedTables = [
      ...project.dbTables,
      {
        name: clean,
        labelAr: newTableLabel.trim() || clean,
        columns: [
          { name: 'title', type: 'TEXT' as const, required: true, labelAr: 'العنوان' },
          { name: 'status', type: 'TEXT' as const, required: true, labelAr: 'الحالة' },
          { name: 'amount', type: 'INTEGER' as const, required: false, labelAr: 'القيمة' },
        ],
        rows: [],
      },
    ];

    try {
      const updated = await resilientFetchJson<Project>(`/api/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dbTables: updatedTables }),
      });
      onProjectUpdated(updated);
      setSelectedTableName(clean);
      setNewTableName('');
      setNewTableLabel('');
      setDbNotice(`تم إنشاء جدول ${clean} وحفظه.`);
    } catch (err) {
      setDbError(err instanceof Error ? err.message : 'تعذر إنشاء الجدول.');
    }
  }

  async function handleAddUserRole() {
    if (!newUserEmail.trim() || !newUserName.trim()) return;
    setDbError(null);
    const updatedRoles: ProjectUserRole[] = [
      ...project.userRoles,
      {
        id: `usr-${Date.now()}`,
        name: newUserName.trim(),
        email: newUserEmail.trim(),
        role: newUserRole,
        active: true,
      },
    ];
    try {
      const updated = await resilientFetchJson<Project>(`/api/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userRoles: updatedRoles }),
      });
      setNewUserEmail('');
      setNewUserName('');
      onProjectUpdated(updated);
    } catch (err) {
      setDbError(err instanceof Error ? err.message : 'تعذر إضافة المستخدم.');
    }
  }

  const displayedRows: JoinedDbRow[] = joinedRows
    ? joinedRows
    : (activeTable?.rows || []).map((r) => ({ ...r }));

  return (
    <div className="space-y-6">
      {/* Database Tables & Live CRUD */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-2.5">
            <Database className="w-5 h-5 text-slate-700 dark:text-slate-300" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                قواعد البيانات الحقيقية والمخططات والعلاقات المحلية
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                إضافة واستعلام وتصفية وتعديل وربط علائقي مباشر مع حفظ فوري في JSON و schema.sql.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newTableName}
              onChange={(e) => setNewTableName(e.target.value)}
              placeholder="اسم الجدول (إنجليزي)"
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono"
            />
            <input
              type="text"
              value={newTableLabel}
              onChange={(e) => setNewTableLabel(e.target.value)}
              placeholder="الاسم بالعربية"
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={handleCreateTable}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إنشاء جدول</span>
            </button>
          </div>
        </div>

        {/* Table Switcher */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit mb-4">
          {project.dbTables.map((tbl) => (
            <button
              key={tbl.name}
              type="button"
              onClick={() => setSelectedTableName(tbl.name)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer ${
                activeTable?.name === tbl.name
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {tbl.labelAr} ({tbl.rows.length})
            </button>
          ))}
        </div>

        {dbError && (
          <div className="mb-3 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-200">
            {dbError}
          </div>
        )}
        {dbNotice && (
          <div className="mb-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-200">
            {dbNotice}
          </div>
        )}

        {activeTable && (
          <div className="space-y-4">
            {/* Computed Summary Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div className="text-slate-500">متوسط تقييم الموردين</div>
                <div className="font-mono font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">
                  {avgComplianceRating} / 5
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div className="text-slate-500">المهام المتأخرة</div>
                <div className="font-mono font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                  {overdueTasksCount}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div className="text-slate-500">إجمالي العقود</div>
                <div className="font-mono font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                  {totalContractsSar.toLocaleString('en-US')} SAR
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div className="text-slate-500">إجمالي الفواتير</div>
                <div className="font-mono font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                  {totalInvoicesSar.toLocaleString('en-US')} SAR
                </div>
              </div>
            </div>

            {/* Query & Filter Bar */}
            <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                <Search className="w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`استعلام وبحث في ${activeTable.labelAr}...`}
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs"
                />
              </div>
              <input
                type="text"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                placeholder="تصفية بالحالة (مثال: مفتوحة / معتمد)"
                className="w-56 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs"
              />
              {activeTable.name === 'tasks' && (
                <button
                  type="button"
                  onClick={() => {
                    const next = !overdueOnly;
                    setOverdueOnly(next);
                    void runServerFilterQuery(undefined, undefined, next);
                  }}
                  className={`px-3 py-1.5 rounded-md border text-xs font-medium cursor-pointer ${
                    overdueOnly
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  المهام المتأخرة فقط ({overdueTasksCount})
                </button>
              )}
              <button
                type="button"
                onClick={() => runServerFilterQuery()}
                disabled={querying}
                className="px-3 py-1.5 rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium cursor-pointer"
              >
                {querying ? 'جاري الاستعلام...' : 'استعلام وربط'}
              </button>
              {joinedRows && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('');
                    setOverdueOnly(false);
                    setJoinedRows(null);
                  }}
                  className="px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  عرض الكل
                </button>
              )}
            </div>

            {/* Insert New Row Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              {activeTable.columns.map((col) => {
                const fkOptions = renderFkOptions(col.name);
                return (
                  <div key={col.name}>
                    <label className="block text-[11px] text-slate-500 mb-1">
                      {col.labelAr} ({col.type})
                    </label>
                    {fkOptions ? (
                      <select
                        value={newRowValues[col.name] || ''}
                        onChange={(e) =>
                          setNewRowValues((prev) => ({ ...prev, [col.name]: e.target.value }))
                        }
                        className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs"
                      >
                        <option value="">— اختر مرتبطاً —</option>
                        {fkOptions.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={
                          col.type === 'INTEGER' || col.type === 'REAL'
                            ? 'number'
                            : col.type === 'DATE'
                              ? 'date'
                              : 'text'
                        }
                        step={col.type === 'REAL' ? '0.1' : undefined}
                        value={newRowValues[col.name] || ''}
                        onChange={(e) =>
                          setNewRowValues((prev) => ({ ...prev, [col.name]: e.target.value }))
                        }
                        className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs"
                      />
                    )}
                  </div>
                );
              })}
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleInsertRow}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة سجل</span>
                </button>
              </div>
            </div>

            {/* Rows Table */}
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
              <table className="w-full text-xs text-right">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-3 py-2.5 font-mono">ID</th>
                    {activeTable.columns.map((col) => (
                      <th key={col.name} className="px-3 py-2.5 font-medium">
                        {col.labelAr}
                      </th>
                    ))}
                    <th className="px-3 py-2.5 text-left">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {displayedRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={activeTable.columns.length + 2}
                        className="px-4 py-6 text-center text-slate-500"
                      >
                        لا توجد صفوف مطابقة في هذا الجدول.
                      </td>
                    </tr>
                  ) : (
                    displayedRows.map((row) => {
                      const rowId = String(row.id);
                      const isEditing = editingRowId === rowId;
                      return (
                        <tr key={rowId} className="hover:bg-slate-50 dark:hover:bg-slate-950/60">
                          <td className="px-3 py-2.5 font-mono text-slate-400">{rowId}</td>
                          {activeTable.columns.map((col) => {
                            if (isEditing) {
                              const fkOptions = renderFkOptions(col.name);
                              return (
                                <td key={col.name} className="px-2 py-2">
                                  {fkOptions ? (
                                    <select
                                      value={editValues[col.name] || ''}
                                      onChange={(e) =>
                                        setEditValues((prev) => ({
                                          ...prev,
                                          [col.name]: e.target.value,
                                        }))
                                      }
                                      className="w-full min-w-[140px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs"
                                    >
                                      <option value="-">— غير محدد —</option>
                                      {fkOptions.map((opt) => (
                                        <option key={opt.id} value={opt.id}>
                                          {opt.label}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      type={
                                        col.type === 'INTEGER' || col.type === 'REAL'
                                          ? 'number'
                                          : col.type === 'DATE'
                                            ? 'date'
                                            : 'text'
                                      }
                                      step={col.type === 'REAL' ? '0.1' : undefined}
                                      value={editValues[col.name] ?? ''}
                                      onChange={(e) =>
                                        setEditValues((prev) => ({
                                          ...prev,
                                          [col.name]: e.target.value,
                                        }))
                                      }
                                      className="w-full min-w-[110px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs"
                                    />
                                  )}
                                </td>
                              );
                            }

                            const relBadge = resolveRelationBadge(col.name, row[col.name], row);
                            return (
                              <td
                                key={col.name}
                                className={`px-3 py-2.5 ${
                                  col.type === 'INTEGER' || col.type === 'REAL'
                                    ? 'font-mono tabular-nums'
                                    : ''
                                }`}
                              >
                                {typeof row[col.name] === 'boolean' ? (
                                  row[col.name] ? 'نعم' : 'لا'
                                ) : relBadge ? (
                                  <div className="space-y-0.5">
                                    <div className="inline-flex items-center gap-1 font-medium text-slate-900 dark:text-slate-100">
                                      <Link2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                      <span>{relBadge}</span>
                                    </div>
                                    <div className="font-mono text-[10px] text-slate-400">
                                      {String(row[col.name] ?? '')}
                                    </div>
                                  </div>
                                ) : (
                                  String(row[col.name] ?? '')
                                )}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2.5 text-left whitespace-nowrap">
                            {isEditing ? (
                              <div className="inline-flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleSaveEditRow(rowId)}
                                  className="text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 cursor-pointer"
                                  title="حفظ التعديل"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingRowId(null)}
                                  className="text-slate-500 hover:text-slate-800 cursor-pointer"
                                  title="إلغاء"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-2.5">
                                <button
                                  type="button"
                                  onClick={() => startEditRow(row)}
                                  className="text-slate-600 hover:text-slate-900 dark:text-slate-300 cursor-pointer"
                                  title="تعديل السجل"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRow(rowId)}
                                  className="text-rose-600 hover:text-rose-800 dark:text-rose-400 cursor-pointer"
                                  title="حذف السجل"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Backend API Routes + RBAC Permissions Split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Server className="w-4 h-4 text-slate-700 dark:text-slate-300" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              واجهات Backend والـ API المستقلة
            </h3>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {project.apiRoutes.map((route) => (
              <div key={route.id} className="py-3 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {route.method}
                    </span>
                    <code className="font-mono text-xs text-slate-600 dark:text-slate-400" dir="ltr">
                      {route.path}
                    </code>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    {route.descriptionAr}
                  </p>
                </div>
                <div className="text-left text-[11px] font-mono text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                  {route.requiresInternet ? 'يتطلب اتصالاً' : 'يعمل محلياً'}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-700 dark:text-slate-300" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                المستخدمون والصلاحيات وعزل البيانات (RBAC)
              </h3>
            </div>
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <KeyRound className="w-3.5 h-3.5" />
              <span>محمي محلياً</span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
            <input
              type="text"
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              placeholder="الاسم"
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs"
            />
            <input
              type="email"
              value={newUserEmail}
              onChange={(e) => setNewUserEmail(e.target.value)}
              placeholder="البريد الداخلي"
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs"
            />
            <div className="flex gap-1.5">
              <select
                value={newUserRole}
                onChange={(e) => setNewUserRole(e.target.value as ProjectUserRole['role'])}
                className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs font-mono"
              >
                <option value="ADMIN">ADMIN</option>
                <option value="ANALYST">ANALYST</option>
                <option value="VIEWER">VIEWER</option>
              </select>
              <button
                type="button"
                onClick={handleAddUserRole}
                className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium cursor-pointer"
              >
                إضافة
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {project.userRoles.map((u) => (
              <div key={u.id} className="py-2.5 flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{u.name}</span>
                  <span className="text-slate-500 mx-2">·</span>
                  <span className="font-mono text-slate-500">{u.email}</span>
                </div>
                <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                  {u.role}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
