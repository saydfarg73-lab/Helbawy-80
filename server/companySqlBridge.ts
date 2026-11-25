import type {
  DbTable,
  Project,
  RagDocument,
  RagSearchHit,
} from '../src/types/helbawey.ts';
import {
  normalizeTextForIndex,
  searchLocalRag,
  tokenizeNormalized,
} from './ragEngine.ts';

export interface SqlMatchedTableResult {
  tableName: string;
  labelAr: string;
  matchedRows: Record<string, string | number | boolean>[];
}

export interface ProjectSqlQueryFacts {
  query: string;
  normalizedQuery: string;
  queryTokens: string[];
  matchedTables: SqlMatchedTableResult[];
  matchedDbSummary: string[];
  dbMatchedCount: number;
  tablesUsed: string[];
  aggregates: {
    contractsCount: number;
    totalContractsValueSar: number;
    invoicesCount: number;
    totalInvoicesAmountSar: number;
    unpaidInvoicesCount: number;
    suppliersCount: number;
    avgComplianceRating: number;
    tasksCount: number;
    openTasksCount: number;
    overdueTasksCount: number;
    employeesCount: number;
    totalMonthlyPayrollSar: number;
  };
  joinedFactsText: string;
  dataSourceLabelAr: string;
  lastUpdatedAt: string;
}

const TABLE_SYNONYMS: Record<string, string[]> = {
  contracts: ['عقد', 'عقود', 'عميل', 'عملاء', 'جهه', 'تجديد', 'مخاطر', 'مشاريع', 'مشروع', 'cnt'],
  invoices: ['فاتور', 'فواتير', 'مدفوع', 'دفع', 'سداد', 'مستحق', 'تحصيل', 'مبلغ', 'inv'],
  suppliers: ['مورد', 'موردين', 'توريد', 'التزام', 'تقييم', 'مراجعه', 'sup'],
  tasks: ['مهم', 'مهام', 'متاخر', 'استحقاق', 'اولوي', 'tsk', 'مفتوح'],
  employees: ['موظف', 'موظفين', 'راتب', 'رواتب', 'قسم', 'وظيف', 'تعيين', 'emp'],
};

function rowMatchesTokens(
  row: Record<string, string | number | boolean>,
  queryNorm: string,
  queryTokens: string[]
): number {
  const rawJson = JSON.stringify(row);
  const rowNorm = normalizeTextForIndex(rawJson);
  const rowTokenSet = new Set(tokenizeNormalized(rawJson));
  const idLower = String(row.id || '').toLowerCase();

  let score = 0;

  // Exact ID match (e.g. cnt-102, inv-2)
  if (idLower && queryNorm.includes(normalizeTextForIndex(idLower))) {
    score += 10;
  }

  // Substring match on normalized field values
  for (const val of Object.values(row)) {
    const valNorm = normalizeTextForIndex(String(val ?? ''));
    if (valNorm.length >= 3 && queryNorm.includes(valNorm)) {
      score += 8;
    }
  }

  // Normalized Arabic/English token & stem overlap
  for (const qt of queryTokens) {
    if (rowTokenSet.has(qt)) {
      score += 3;
    } else if (qt.length >= 3 && rowNorm.includes(qt)) {
      score += 1.5;
    }
  }

  return score;
}

export function filterTableRowsNormalized(
  rows: Record<string, string | number | boolean>[],
  rawQuery: string
): Record<string, string | number | boolean>[] {
  const clean = rawQuery.trim();
  if (!clean) return rows;
  const queryNorm = normalizeTextForIndex(clean);
  const queryTokens = Array.from(new Set(tokenizeNormalized(clean)));
  const scored = rows
    .map((r) => ({ row: r, score: rowMatchesTokens(r, queryNorm, queryTokens) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.map((s) => s.row);
}

function formatCompactRow(
  table: DbTable,
  row: Record<string, string | number | boolean>
): string {
  const colLabelMap = new Map(table.columns.map((c) => [c.name, c.labelAr]));
  const parts = Object.entries(row).map(([k, v]) => {
    const label = colLabelMap.get(k);
    return label ? `${k}(${label})=${v}` : `${k}=${v}`;
  });
  return `{ ${parts.join(' | ')} }`;
}

export function queryProjectSqlFacts(
  project: Project,
  query: string
): ProjectSqlQueryFacts {
  const cleanQuery = query.trim();
  const normalizedQuery = normalizeTextForIndex(cleanQuery);
  const queryTokens = Array.from(new Set(tokenizeNormalized(cleanQuery)));
  const todayIso = new Date().toISOString().slice(0, 10);

  const contractsRows = project.dbTables.find((t) => t.name === 'contracts')?.rows || [];
  const invoicesRows = project.dbTables.find((t) => t.name === 'invoices')?.rows || [];
  const suppliersRows = project.dbTables.find((t) => t.name === 'suppliers')?.rows || [];
  const tasksRows = project.dbTables.find((t) => t.name === 'tasks')?.rows || [];
  const employeesRows = project.dbTables.find((t) => t.name === 'employees')?.rows || [];

  const aggregates = {
    contractsCount: contractsRows.length,
    totalContractsValueSar: contractsRows.reduce((s, r) => s + Number(r.value_sar || 0), 0),
    invoicesCount: invoicesRows.length,
    totalInvoicesAmountSar: invoicesRows.reduce((s, r) => s + Number(r.amount_sar || 0), 0),
    unpaidInvoicesCount: invoicesRows.filter((r) => !r.paid).length,
    suppliersCount: suppliersRows.length,
    avgComplianceRating:
      suppliersRows.length > 0
        ? Number(
            (
              suppliersRows.reduce((s, r) => s + Number(r.compliance_rating || 0), 0) /
              suppliersRows.length
            ).toFixed(2)
          )
        : 0,
    tasksCount: tasksRows.length,
    openTasksCount: tasksRows.filter((r) => String(r.status || '') !== 'مكتملة').length,
    overdueTasksCount: tasksRows.filter(
      (r) => Boolean(r.due_date) && String(r.due_date) < todayIso && String(r.status || '') !== 'مكتملة'
    ).length,
    employeesCount: employeesRows.length,
    totalMonthlyPayrollSar: employeesRows.reduce(
      (s, r) => s + Number(r.monthly_salary_sar || 0),
      0
    ),
  };

  const matchedTables: SqlMatchedTableResult[] = [];
  const matchedByTableMap = new Map<string, Map<string, Record<string, string | number | boolean>>>();
  const ensureTableBucket = (tableName: string) => {
    if (!matchedByTableMap.has(tableName)) {
      matchedByTableMap.set(tableName, new Map());
    }
    return matchedByTableMap.get(tableName)!;
  };

  // Step 1: Score every row across every table via normalized tokens/stems
  for (const tbl of project.dbTables) {
    const scored = tbl.rows
      .map((r) => ({ row: r, score: rowMatchesTokens(r, normalizedQuery, queryTokens) }))
      .filter((x) => x.score >= 2.5)
      .sort((a, b) => b.score - a.score);

    const syns = TABLE_SYNONYMS[tbl.name] || [];
    const tableMentioned =
      normalizedQuery.includes(normalizeTextForIndex(tbl.name)) ||
      normalizedQuery.includes(normalizeTextForIndex(tbl.labelAr)) ||
      syns.some((syn) => queryTokens.some((qt) => qt.includes(syn) || syn.includes(qt)));

    const picked =
      scored.length > 0
        ? scored.slice(0, 5).map((x) => x.row)
        : tableMentioned
          ? tbl.rows.slice(0, 5)
          : [];

    if (picked.length > 0) {
      const bucket = ensureTableBucket(tbl.name);
      for (const r of picked) {
        bucket.set(String(r.id), r);
      }
    }
  }

  // Step 2: Relational Foreign-Key Join expansion (contracts <-> invoices / suppliers / tasks / employees)
  const matchedContractIds = new Set(
    Array.from(matchedByTableMap.get('contracts')?.keys() || [])
  );
  if (matchedContractIds.size > 0) {
    for (const relTblName of ['invoices', 'suppliers', 'tasks']) {
      const tbl = project.dbTables.find((t) => t.name === relTblName);
      if (!tbl) continue;
      for (const row of tbl.rows) {
        if (matchedContractIds.has(String(row.contract_id || ''))) {
          ensureTableBucket(relTblName).set(String(row.id), row);
        }
      }
    }
  }

  const empMap = new Map(employeesRows.map((e) => [String(e.id), e]));
  for (const tRow of Array.from(matchedByTableMap.get('tasks')?.values() || [])) {
    const emp = empMap.get(String(tRow.assignee_employee_id || ''));
    if (emp) {
      ensureTableBucket('employees').set(String(emp.id), emp);
    }
  }

  const matchedDbSummary: string[] = [];
  let dbMatchedCount = 0;
  const tablesUsed: string[] = [];

  for (const tbl of project.dbTables) {
    const bucket = matchedByTableMap.get(tbl.name);
    if (!bucket || bucket.size === 0) continue;
    const rows = Array.from(bucket.values());
    dbMatchedCount += rows.length;
    tablesUsed.push(tbl.name);
    matchedTables.push({
      tableName: tbl.name,
      labelAr: tbl.labelAr,
      matchedRows: rows,
    });
    matchedDbSummary.push(
      `- ${tbl.labelAr} (${tbl.name}): ${rows.map((r) => formatCompactRow(tbl, r)).join(' || ')}`
    );
  }

  const aggregateLine = `إجماليات SQL الحية: العقود=${aggregates.contractsCount} (إجمالي ${aggregates.totalContractsValueSar} SAR) | الفواتير=${aggregates.invoicesCount} (إجمالي ${aggregates.totalInvoicesAmountSar} SAR، غير مدفوعة=${aggregates.unpaidInvoicesCount}) | الموردون=${aggregates.suppliersCount} (متوسط الالتزام=${aggregates.avgComplianceRating}/5) | المهام=${aggregates.tasksCount} (مفتوحة/جارية=${aggregates.openTasksCount}، متأخرة=${aggregates.overdueTasksCount}) | الموظفون=${aggregates.employeesCount}`;

  const lastUpdatedAt = project.updatedAt || new Date().toISOString();
  const dataSourceLabelAr =
    tablesUsed.length > 0
      ? `قاعدة بيانات الشركة المحلية (${project.id} · الجداول: ${tablesUsed.join(', ')})`
      : `قاعدة بيانات الشركة المحلية (${project.id} · إجمالي الجداول: ${project.dbTables.length})`;

  const joinedFactsText = [
    `[مصدر البيانات: ${dataSourceLabelAr} | آخر تحديث: ${lastUpdatedAt}]`,
    aggregateLine,
    matchedDbSummary.length > 0
      ? `سجلات SQL المسترجعة والمرتبطة:\n${matchedDbSummary.join('\n')}`
      : 'سجلات الجداول الأساسية:\n' +
        project.dbTables
          .map((t) => `- ${t.name}: ${t.rows.map((r) => formatCompactRow(t, r)).join(' | ')}`)
          .join('\n'),
  ]
    .join('\n\n')
    .slice(0, 2600);

  return {
    query: cleanQuery,
    normalizedQuery,
    queryTokens,
    matchedTables,
    matchedDbSummary,
    dbMatchedCount,
    tablesUsed,
    aggregates,
    joinedFactsText,
    dataSourceLabelAr,
    lastUpdatedAt,
  };
}

export function buildVirtualSqlRagDocuments(project: Project): RagDocument[] {
  const virtualDocs: RagDocument[] = [];
  for (const tbl of project.dbTables) {
    const colLabelMap = new Map(tbl.columns.map((c) => [c.name, c.labelAr]));
    const syns = (TABLE_SYNONYMS[tbl.name] || []).slice(0, 6).join(' ');
    for (const row of tbl.rows) {
      const primaryTitleField =
        row.client_name ||
        row.supplier_name ||
        row.title ||
        row.full_name ||
        row.invoice_number ||
        row.id;
      const fieldsDesc = Object.entries(row)
        .map(([k, v]) => `${colLabelMap.get(k) || k}: ${v}`)
        .join(' | ');
      const content = `سجل SQL من جدول ${tbl.labelAr} (${tbl.name}) — المعرف ${row.id}. ${fieldsDesc}. كلمات مفتاحية: ${syns}`;
      virtualDocs.push({
        id: `sql:${tbl.name}:${String(row.id)}`,
        title: `سجل ${tbl.labelAr}: ${String(primaryTitleField)} (${String(row.id)})`,
        format: 'TXT',
        content,
        chunksCount: 1,
        wordCount: content.split(/\s+/).length,
        indexedAt: project.updatedAt || new Date().toISOString(),
      });
    }
  }
  return virtualDocs;
}

export function searchProjectKnowledgeAndTables(
  project: Project,
  query: string,
  topK = 5
): {
  hits: RagSearchHit[];
  ragDocsHitsCount: number;
  sqlDocsHitsCount: number;
} {
  const virtualSqlDocs = buildVirtualSqlRagDocuments(project);
  const combined = [...project.ragDocuments, ...virtualSqlDocs];
  const hits = searchLocalRag(combined, query, topK);
  const ragDocsHitsCount = hits.filter((h) => !h.docId.startsWith('sql:')).length;
  const sqlDocsHitsCount = hits.filter((h) => h.docId.startsWith('sql:')).length;
  return { hits, ragDocsHitsCount, sqlDocsHitsCount };
}
