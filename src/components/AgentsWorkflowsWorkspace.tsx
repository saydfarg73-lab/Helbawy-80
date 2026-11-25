import { useState } from 'react';
import { Bot, GitBranch, Plug, Plus } from 'lucide-react';
import type { Project } from '../types/helbawey';
import { StatusText } from './StatusText';

interface Props {
  project: Project;
  onProjectUpdated: (updated: Project) => void;
}

export function AgentsWorkflowsWorkspace({ project, onProjectUpdated }: Props) {
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentRole, setNewAgentRole] = useState('');

  async function handleAddAgent() {
    if (!newAgentName.trim()) return;
    const updatedAgents = [
      ...project.agents,
      {
        id: `ag-${Date.now()}`,
        nameAr: newAgentName.trim(),
        roleAr: newAgentRole.trim() || 'تنفيذ مهام تحليلية محلية بصلاحيات مقيدة',
        executionMode: 'local-weights' as const,
        allowedTables: project.dbTables.map((t) => t.name),
        requiresApprovalForMutations: true,
        systemPrompt: 'اعمل ضمن النطاق المحدد دون اتصال خارجي.',
        status: 'IMPLEMENTED' as const,
      },
    ];
    const res = await fetch(`/api/projects/${project.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agents: updatedAgents }),
    });
    if (res.ok) {
      setNewAgentName('');
      setNewAgentRole('');
      onProjectUpdated((await res.json()) as Project);
    }
  }

  async function handleToggleIntegration(id: string) {
    const updatedIntegrations = project.integrations.map((int) =>
      int.id === id ? { ...int, enabled: !int.enabled } : int
    );
    const res = await fetch(`/api/projects/${project.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integrations: updatedIntegrations }),
    });
    if (res.ok) {
      onProjectUpdated((await res.json()) as Project);
    }
  }

  return (
    <div className="space-y-6">
      {/* Local AI Agents */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Bot className="w-5 h-5 text-slate-700 dark:text-slate-300" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                وكلاء الذكاء الاصطناعي داخل التطبيق (Local-First Agents)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                ينفذون المهام باستخدام العقل المحلي والأوزان المضمنة مع موافقة بشرية للعمليات الحساسة.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={newAgentName}
              onChange={(e) => setNewAgentName(e.target.value)}
              placeholder="اسم الوكيل الجديد"
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs"
            />
            <input
              type="text"
              value={newAgentRole}
              onChange={(e) => setNewAgentRole(e.target.value)}
              placeholder="مهمة الوكيل"
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={handleAddAgent}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة وكيل</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {project.agents.map((ag) => (
            <div
              key={ag.id}
              className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-slate-50 dark:bg-slate-950 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{ag.nameAr}</span>
                <StatusText status={ag.status} compact />
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">{ag.roleAr}</p>
              <div className="text-[11px] font-mono text-slate-500 pt-1">
                التنفيذ: {ag.executionMode === 'local-weights' ? 'أوزان محلية 100%' : 'سحابي اختياري'} · الجداول المصرحة: {ag.allowedTables.join(', ')} · الموافقة المسبقة: {ag.requiresApprovalForMutations ? 'إلزامية' : 'تلقائية'}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Workflows + Optional External Integrations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-slate-700 dark:text-slate-300" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              أتمتة مسارات العمل (Workflow Builder)
            </h3>
          </div>
          <div className="space-y-3">
            {project.workflows.map((wf) => (
              <div
                key={wf.id}
                className="border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{wf.nameAr}</span>
                  <StatusText status={wf.status} compact />
                </div>
                <div className="text-[11px] text-slate-500">المُشغّل: {wf.trigger}</div>
                <ol className="list-decimal list-inside text-xs text-slate-700 dark:text-slate-300 space-y-0.5">
                  {wf.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Plug className="w-4 h-4 text-slate-700 dark:text-slate-300" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                مركز التكاملات الاختيارية
              </h3>
            </div>
            <span className="text-[11px] text-slate-500">تعطيلها لا يؤثر على العقل اللغوي المحلي</span>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
            {project.integrations.map((int) => (
              <div key={int.id} className="p-3.5 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {int.nameAr}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                    {int.requiresInternet ? 'اختياري عند توفر الإنترنت' : 'محلي'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleIntegration(int.id)}
                  className={`px-3 py-1 rounded-md text-xs font-medium cursor-pointer ${
                    int.enabled
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                      : 'border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {int.enabled ? 'مُفعّل' : 'مُعطّل (محلي)'}
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
