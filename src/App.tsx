/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect, useState } from 'react';
import {
  BookOpen,
  Bot,
  Boxes,
  BrainCircuit,
  Cpu,
  Database,
  Download,
  Factory,
  GraduationCap,
  Library,
  Menu,
  MessageCircle,
  Moon,
  PackageCheck,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import type {
  AcceptanceTestItem,
  FineTuneJob,
  HelbaweyBootstrap,
  ModelWeightEntry,
  PlatformBrainId,
  PlatformChatMessage,
  Project,
  TrainingDataset,
} from './types/helbawey';
import { AgentsWorkflowsWorkspace } from './components/AgentsWorkflowsWorkspace';
import { AppFactoryWorkspace } from './components/AppFactoryWorkspace';
import { BrainSelectorWorkspace } from './components/BrainSelectorWorkspace';
import { BrainTrainingOfficeWorkspace } from './components/BrainTrainingOfficeWorkspace';
import { DatabaseBackendWorkspace } from './components/DatabaseBackendWorkspace';
import { FineTuneWorkspace } from './components/FineTuneWorkspace';
import { KnowledgeRagWorkspace } from './components/KnowledgeRagWorkspace';
import { LegalMindCenterWorkspace } from './components/LegalMindCenterWorkspace';
import { ModelWeightsWorkspace } from './components/ModelWeightsWorkspace';
import { OwnerConsoleWorkspace } from './components/OwnerConsoleWorkspace';
import { PackagingVerificationWorkspace } from './components/PackagingVerificationWorkspace';
import { PlatformChatWorkspace } from './components/PlatformChatWorkspace';
import { SelfHealingWorkspace } from './components/SelfHealingWorkspace';
import { TrainingLibraryWorkspace } from './components/TrainingLibraryWorkspace';

type NavSectionId =
  | 'factory'
  | 'brain'
  | 'brain-training'
  | 'legal-mind'
  | 'chat'
  | 'database'
  | 'weights'
  | 'rag'
  | 'datasets'
  | 'finetune'
  | 'agents'
  | 'packaging'
  | 'self-healing'
  | 'owner';

const NAV_ITEMS: { id: NavSectionId; labelAr: string; Icon: typeof Factory }[] = [
  { id: 'factory', labelAr: 'مصنع التطبيقات الذكية', Icon: Factory },
  { id: 'brain', labelAr: 'وحدة اختيار العقل', Icon: BrainCircuit },
  { id: 'brain-training', labelAr: 'مكتب تدريب العقل', Icon: GraduationCap },
  { id: 'legal-mind', labelAr: 'العقل القانوني والقضايا', Icon: Scale },
  { id: 'chat', labelAr: 'المحادثة مع المنصة', Icon: MessageCircle },
  { id: 'database', labelAr: 'قواعد البيانات والـ API', Icon: Database },
  { id: 'weights', labelAr: 'إدارة النماذج والأوزان', Icon: Boxes },
  { id: 'rag', labelAr: 'قاعدة المعرفة المحلية', Icon: BookOpen },
  { id: 'datasets', labelAr: 'مكتبة بيانات التدريب', Icon: Library },
  { id: 'finetune', labelAr: 'التخصيص والتدريب LoRA', Icon: Cpu },
  { id: 'agents', labelAr: 'الوكلاء والأتمتة', Icon: Bot },
  { id: 'packaging', labelAr: 'التغليف والتحقق المستقل', Icon: PackageCheck },
  { id: 'self-healing', labelAr: 'الإصلاح الذاتي والمراقبة', Icon: ShieldAlert },
  { id: 'owner', labelAr: 'لوحة المالك والقبول', Icon: ShieldCheck },
];

export default function App() {
  const [data, setData] = useState<HelbaweyBootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState<NavSectionId>('factory');
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [preselectedDatasetId, setPreselectedDatasetId] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const [trainingTargetBrain, setTrainingTargetBrain] = useState<PlatformBrainId>('attia-advisor');

  const handleOpenTrainingOffice = (brainId: PlatformBrainId) => {
    setTrainingTargetBrain(brainId);
    setChatDrawerOpen(false);
    setActiveNav('brain-training');
  };

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  useEffect(() => {
    let active = true;
    fetch('/api/bootstrap')
      .then(async (res) => {
        if (!res.ok) throw new Error('تعذر الاتصال بخادم منصة الهلباوي');
        return (await res.json()) as HelbaweyBootstrap;
      })
      .then((boot) => {
        if (!active) return;
        setData(boot);
        if (boot.projects.length > 0) {
          setActiveProjectId(boot.projects[0].id);
        }
      })
      .catch((err) => {
        if (!active) return;
        setLoadError(err instanceof Error ? err.message : 'خطأ في تحميل المنصة');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const activeProject: Project | undefined =
    data?.projects.find((p) => p.id === activeProjectId) || data?.projects[0];

  const handleProjectUpdated = (updated: Project) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            projects: prev.projects.map((p) => (p.id === updated.id ? updated : p)),
          }
        : prev
    );
  };

  const handleProjectCreated = (created: Project) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            projects: [created, ...prev.projects],
          }
        : prev
    );
    setActiveProjectId(created.id);
  };

  const handleModelsUpdated = (models: ModelWeightEntry[]) => {
    setData((prev) => (prev ? { ...prev, models } : prev));
  };

  const handleJobsUpdated = (fineTuneJobs: FineTuneJob[]) => {
    setData((prev) => (prev ? { ...prev, fineTuneJobs } : prev));
  };

  const handleDatasetsUpdated = (trainingDatasets: TrainingDataset[]) => {
    setData((prev) => (prev ? { ...prev, trainingDatasets } : prev));
  };

  const handleAcceptanceUpdated = (updated: AcceptanceTestItem) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            acceptanceTests: prev.acceptanceTests.map((t) => (t.id === updated.id ? updated : t)),
          }
        : prev
    );
  };

  const handleChatMessagesUpdated = (platformChatHistory: PlatformChatMessage[]) => {
    setData((prev) => (prev ? { ...prev, platformChatHistory } : prev));
  };

  const handleBrainSelected = (activeBrain: PlatformBrainId) => {
    setData((prev) => (prev ? { ...prev, activeBrain } : prev));
  };

  const currentNavItem = NAV_ITEMS.find((n) => n.id === activeNav) || NAV_ITEMS[0];

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar (260px) */}
      <aside className="hidden lg:flex lg:w-64 lg:shrink-0 flex-col border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
          <span className="font-display text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0">
            الهلباوي
          </span>
          <span className="font-mono text-[11px] font-medium text-slate-500">ALHELBAWEY</span>
        </div>

        {/* Active Project Selector */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800">
          <label
            htmlFor="sidebar-project-select"
            className="block text-[11px] font-medium text-slate-500 mb-1.5"
          >
            المشروع النشط
          </label>
          <select
            id="sidebar-project-select"
            value={activeProject?.id || ''}
            onChange={(e) => setActiveProjectId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-2 text-xs font-medium text-slate-900 dark:text-slate-100"
          >
            {(data?.projects || []).map((proj) => (
              <option key={proj.id} value={proj.id}>
                {proj.name}
              </option>
            ))}
          </select>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="التنقل الرئيسي">
          {NAV_ITEMS.map((item) => {
            const Icon = item.Icon;
            const active = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveNav(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.labelAr}</span>
              </button>
            );
          })}
        </nav>

        {/* Quiet Owner Profile Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <img
            src="/src/assets/images/avatar_platform_owner_1795320350345.jpg"
            alt="مالك المنصة"
            referrerPolicy="no-referrer"
            className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
          />
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
              {data?.ownerProfile.name || 'م. طارق الهلباوي'}
            </div>
            <div className="text-[11px] text-slate-500 truncate">
              {data?.ownerProfile.organization || 'مصنع البرمجيات المستقل'}
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-white dark:bg-slate-900 h-full flex flex-col border-l border-slate-200 dark:border-slate-800 z-10">
            <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
              <span className="font-display font-bold text-base">الهلباوي</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.Icon;
                const active = activeNav === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveNav(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium ${
                      active
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.labelAr}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb — Contextual Meta — 1 Primary Action */}
        <header className="h-16 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300"
              aria-label="فتح القائمة"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-xs sm:text-sm min-w-0">
              <span className="font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0">
                منصة الهلباوي
              </span>
              <span className="text-slate-400" aria-hidden="true">
                /
              </span>
              <span className="text-slate-700 dark:text-slate-300 truncate">
                {currentNavItem.labelAr}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              aria-label={darkMode ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي'}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {activeProject && (
              <a
                href={`/api/projects/${activeProject.id}/export?format=${activeProject.exportFormat}`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold hover:bg-slate-800 dark:hover:bg-slate-200 whitespace-nowrap shrink-0 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>تصدير الحزمة المستقلة</span>
              </a>
            )}
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1400px] w-full mx-auto">
          {loading && (
            <div className="space-y-4">
              <div className="h-32 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
              <div className="h-80 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
            </div>
          )}

          {loadError && (
            <div className="p-6 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-sm text-rose-800 dark:text-rose-200">
              {loadError}
            </div>
          )}

          {!loading && !loadError && data && activeProject && (
            <>
              {activeNav === 'factory' && (
                <AppFactoryWorkspace
                  project={activeProject}
                  models={data.models}
                  onProjectUpdated={handleProjectUpdated}
                  onProjectCreated={handleProjectCreated}
                />
              )}

              {activeNav === 'brain' && (
                <BrainSelectorWorkspace
                  activeProject={activeProject}
                  activeBrain={data.activeBrain || 'attia-advisor'}
                  onBrainSelected={handleBrainSelected}
                  onOpenChatWithBrain={(brainId) => {
                    handleBrainSelected(brainId);
                    setActiveNav('chat');
                  }}
                  onOpenTrainingOffice={handleOpenTrainingOffice}
                />
              )}

              {activeNav === 'brain-training' && (
                <BrainTrainingOfficeWorkspace
                  activeProject={activeProject}
                  targetBrainId={trainingTargetBrain || data.activeBrain || 'attia-advisor'}
                  onChangeTargetBrain={(brainId) => setTrainingTargetBrain(brainId)}
                  onBackToBrainSelector={() => setActiveNav('brain')}
                  onOpenSelfHealing={() => setActiveNav('self-healing')}
                  onOpenWeights={() => setActiveNav('weights')}
                />
              )}

              {activeNav === 'legal-mind' && (
                <LegalMindCenterWorkspace
                  onOpenTrainingOffice={handleOpenTrainingOffice}
                  onOpenSelfHealing={() => setActiveNav('self-healing')}
                />
              )}

              {activeNav === 'chat' && (
                <PlatformChatWorkspace
                  activeProject={activeProject}
                  activeBrain={data.activeBrain || 'attia-advisor'}
                  onOpenBrainSelector={() => setActiveNav('brain')}
                  onOpenTrainingOffice={handleOpenTrainingOffice}
                  initialMessages={data.platformChatHistory || []}
                  onMessagesUpdated={handleChatMessagesUpdated}
                  variant="page"
                />
              )}

              {activeNav === 'database' && (
                <DatabaseBackendWorkspace
                  project={activeProject}
                  onProjectUpdated={handleProjectUpdated}
                />
              )}

              {activeNav === 'weights' && (
                <ModelWeightsWorkspace
                  project={activeProject}
                  models={data.models}
                  onProjectUpdated={handleProjectUpdated}
                  onModelsUpdated={handleModelsUpdated}
                />
              )}

              {activeNav === 'rag' && (
                <KnowledgeRagWorkspace
                  project={activeProject}
                  onProjectUpdated={handleProjectUpdated}
                />
              )}

              {activeNav === 'datasets' && (
                <TrainingLibraryWorkspace
                  project={activeProject}
                  datasets={data.trainingDatasets || []}
                  onDatasetsUpdated={handleDatasetsUpdated}
                  onSendToFineTune={(ds) => {
                    setPreselectedDatasetId(ds.id);
                    setActiveNav('finetune');
                  }}
                />
              )}

              {activeNav === 'finetune' && (
                <FineTuneWorkspace
                  project={activeProject}
                  models={data.models}
                  jobs={data.fineTuneJobs}
                  datasets={data.trainingDatasets || []}
                  preselectedDatasetId={preselectedDatasetId}
                  onJobsUpdated={handleJobsUpdated}
                  onOpenTrainingLibrary={() => setActiveNav('datasets')}
                />
              )}

              {activeNav === 'agents' && (
                <AgentsWorkflowsWorkspace
                  project={activeProject}
                  onProjectUpdated={handleProjectUpdated}
                />
              )}

              {activeNav === 'packaging' && (
                <PackagingVerificationWorkspace
                  project={activeProject}
                  models={data.models}
                  onProjectUpdated={handleProjectUpdated}
                />
              )}

              {activeNav === 'self-healing' && (
                <SelfHealingWorkspace activeProject={activeProject} />
              )}

              {activeNav === 'owner' && (
                <OwnerConsoleWorkspace
                  projects={data.projects}
                  models={data.models}
                  auditLogs={data.auditLogs}
                  phases={data.phases}
                  acceptanceTests={data.acceptanceTests}
                  plans={data.plans}
                  onAcceptanceUpdated={handleAcceptanceUpdated}
                  onProjectUpdated={handleProjectUpdated}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Floating Quick Chat Launcher */}
      {!loading && !loadError && data && activeNav !== 'chat' && !chatDrawerOpen && (
        <button
          type="button"
          onClick={() => setChatDrawerOpen(true)}
          aria-label="فتح المحادثة مع المنصة"
          className="fixed bottom-5 left-5 z-40 inline-flex items-center gap-2 px-4 py-3 rounded-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold shadow-lg hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors cursor-pointer"
        >
          <MessageCircle className="w-4 h-4" />
          <span>حوار مع المنصة</span>
        </button>
      )}

      {/* Quick Chat Slide-Over Drawer */}
      {!loading && !loadError && data && activeNav !== 'chat' && chatDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-slate-950/40"
            onClick={() => setChatDrawerOpen(false)}
          />
          <div className="relative z-10 w-full max-w-lg h-full">
            <PlatformChatWorkspace
              activeProject={activeProject}
              activeBrain={data.activeBrain || 'attia-advisor'}
              onOpenBrainSelector={() => {
                setChatDrawerOpen(false);
                setActiveNav('brain');
              }}
              onOpenTrainingOffice={handleOpenTrainingOffice}
              initialMessages={data.platformChatHistory || []}
              onMessagesUpdated={handleChatMessagesUpdated}
              variant="drawer"
              onCloseDrawer={() => setChatDrawerOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
