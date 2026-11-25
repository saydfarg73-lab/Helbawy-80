export type FeatureStatus = 'PLANNED' | 'IMPLEMENTED' | 'TESTED' | 'FAILED' | 'BLOCKED';

export type RuntimeEngine = 'llama.cpp' | 'ONNX Runtime' | 'Transformers' | 'WebLLM-Local' | 'Android-NNAPI';

export type ExportFormat = 'web' | 'server' | 'pwa' | 'android' | 'desktop' | 'source';

export interface AgentStepLog {
  agentKey: string;
  agentNameAr: string;
  roleAr: string;
  status: FeatureStatus;
  summary: string;
  durationMs: number;
  artifactsTouched: string[];
}

export interface PageSpec {
  id: string;
  name: string;
  route: string;
  layoutType: 'dashboard' | 'crud-table' | 'chat-rag' | 'analytics' | 'settings';
  titleAr: string;
  subtitleAr: string;
  widgets: {
    id: string;
    type: 'kpi' | 'table' | 'chat' | 'doc-analyzer' | 'form' | 'report';
    labelAr: string;
    boundTable?: string;
  }[];
}

export interface DbColumn {
  name: string;
  type: 'TEXT' | 'INTEGER' | 'REAL' | 'BOOLEAN' | 'DATE';
  required: boolean;
  labelAr: string;
}

export interface DbTable {
  name: string;
  labelAr: string;
  columns: DbColumn[];
  rows: Record<string, string | number | boolean>[];
}

export interface ApiRoute {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  descriptionAr: string;
  authRequired: boolean;
  usesLocalAI: boolean;
  requiresInternet: boolean;
}

export interface AgentSpec {
  id: string;
  nameAr: string;
  roleAr: string;
  executionMode: 'local-weights' | 'optional-cloud';
  allowedTables: string[];
  requiresApprovalForMutations: boolean;
  systemPrompt: string;
  status: FeatureStatus;
}

export interface WorkflowSpec {
  id: string;
  nameAr: string;
  trigger: string;
  steps: string[];
  usesExternalIntegration: boolean;
  status: FeatureStatus;
}

export interface IntegrationConfig {
  id: string;
  nameAr: string;
  category: 'email' | 'storage' | 'calendar' | 'payments' | 'messaging' | 'webhook';
  enabled: boolean;
  requiresInternet: boolean;
  optionalOnly: boolean;
  endpointUrl: string;
}

export interface RagDocument {
  id: string;
  title: string;
  format: 'TXT' | 'MD' | 'CSV' | 'PDF-TEXT' | 'DOCX-TEXT';
  content: string;
  chunksCount: number;
  wordCount: number;
  indexedAt: string;
}

export interface RagSearchHit {
  docId: string;
  title: string;
  chunkIndex: number;
  excerpt: string;
  score: number;
}

export interface ProjectVersion {
  version: number;
  timestamp: string;
  noteAr: string;
  promptUsed: string;
  filesSnapshot: Record<string, string>;
  pagesSnapshot: PageSpec[];
  dbTablesSnapshot?: DbTable[];
}

export interface VerificationCheckItem {
  id: string;
  titleAr: string;
  passed: boolean;
  detailsAr: string;
  category: 'weights' | 'integrity' | 'runtime' | 'network' | 'offline' | 'restore';
}

export interface VerificationReport {
  runAt: string;
  weightsPresent: boolean;
  weightsEmbedMode: 'EMBEDDED_FULL_SHARD' | 'LOCAL_MICRO_ENGINE_WITH_SHARD_FETCHER';
  modelLoaded: boolean;
  localInferenceSucceeded: boolean;
  externalApiCalled: boolean;
  externalApiFindings: string[];
  worksOffline: boolean;
  bundleSizeBytes: number;
  bundleSizeLabel: string;
  hardwareRequirementSummary: string;
  functionsRequiringInternet: string[];
  localInferenceLatencyMs: number;
  testPrompt: string;
  testOutput: string;
  checks: VerificationCheckItem[];
  verdict: 'INDEPENDENT_VERIFIED' | 'PARTIAL_NEEDS_SHARD' | 'FAILED';
}

export interface DeploymentConfig {
  customDomain: string;
  httpsEnabled: boolean;
  targetServerType: 'self-hosted-vps' | 'on-prem-docker' | 'edge-workstation' | 'android-apk-bundle';
  lastDeployedAt: string | null;
  status: FeatureStatus;
}

export interface ProjectUserRole {
  id: string;
  name: string;
  email: string;
  role: 'OWNER' | 'ADMIN' | 'ANALYST' | 'VIEWER';
  active: boolean;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string;
  prompt: string;
  status: FeatureStatus;
  createdAt: string;
  updatedAt: string;
  currentVersion: number;
  targetOs: 'Linux' | 'Windows' | 'macOS' | 'Android';
  targetRamGb: number;
  targetGpuVramGb: number;
  selectedModelId: string;
  runtimeEngine: RuntimeEngine;
  exportFormat: ExportFormat;
  authEnabled: boolean;
  offlineReady: boolean;
  files: Record<string, string>;
  pages: PageSpec[];
  dbTables: DbTable[];
  apiRoutes: ApiRoute[];
  agents: AgentSpec[];
  workflows: WorkflowSpec[];
  integrations: IntegrationConfig[];
  ragDocuments: RagDocument[];
  userRoles: ProjectUserRole[];
  versions: ProjectVersion[];
  agentTrace: AgentStepLog[];
  verificationReport: VerificationReport | null;
  deployment: DeploymentConfig;
}

export interface ModelWeightEntry {
  id: string;
  name: string;
  family: string;
  parameters: string;
  parametersBillions: number;
  sizeGb: number;
  sizeTier: 'small' | 'medium' | 'large';
  format: 'GGUF' | 'Safetensors' | 'ONNX';
  quantization: string;
  ramRequiredGb: number;
  minRamGb: number;
  cpuRequirements: string;
  gpuRequirements: string;
  measuredTokensPerSec: number;
  contextLength: number;
  postQuantAccuracy: string;
  knownLimits: string;
  license: string;
  commercialRedistribution: boolean;
  redistributionNotes: string;
  runtimeEngines: RuntimeEngine[];
  sha256: string;
  referenceSha256?: string;
  shardsCount: number;
  status: 'VERIFIED' | 'CUSTOM_UPLOADED' | 'REGISTERED';
  uploadedFileName?: string;
  uploadedFileBytes?: number;
  recommendedTasks: string[];
}

export interface FineTuneSample {
  instruction: string;
  input: string;
  output: string;
}

export interface FineTuneJob {
  id: string;
  name: string;
  projectId: string;
  baseModelId: string;
  method: 'LoRA' | 'QLoRA' | 'Full';
  datasetSamples: FineTuneSample[];
  epochs: number;
  learningRate: string;
  loraRank: number;
  status: FeatureStatus;
  preEvalScore: number;
  postEvalScore: number;
  createdAt: string;
  adapterConfigJson: string;
  trainingScript: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  severity: 'INFO' | 'WARN' | 'SECURITY';
  details: string;
}

export interface ContractPhase {
  id: number;
  titleAr: string;
  deliverablesAr: string;
  durationWeeks: number;
  costUsd: number;
  status: FeatureStatus;
}

export interface AcceptanceTestItem {
  id: number;
  titleAr: string;
  articleRef: string;
  status: FeatureStatus;
  lastRunAt: string | null;
  evidenceSummary: string;
}

export interface SubscriptionPlan {
  id: string;
  nameAr: string;
  audienceAr: string;
  priceMonthlyUsd: number;
  maxProjects: number;
  maxWeightStorageGb: number;
  exportFormats: string;
}

export type TrainingDatasetFormat =
  | 'Alpaca-SFT'
  | 'ChatML'
  | 'ShareGPT'
  | 'DPO-Preference'
  | 'CoT-Reasoning'
  | 'Tool-Calling';

export type TrainingDomain =
  | 'arabic-enterprise'
  | 'reasoning-cot'
  | 'code-fullstack'
  | 'tool-calling'
  | 'alignment-dpo'
  | 'rag-grounding';

export interface TrainingSample {
  id: string;
  instruction: string;
  input: string;
  output: string;
  reasoning?: string;
  rejected?: string;
  language: 'ar' | 'en' | 'ar-en' | 'code';
  difficulty: 'basic' | 'intermediate' | 'expert';
  tokenEstimate: number;
  qualityScore: number;
  source: 'curated' | 'imported' | 'project-synthesized';
}

export interface TrainingDataset {
  id: string;
  name: string;
  slug: string;
  descriptionAr: string;
  domain: TrainingDomain;
  format: TrainingDatasetFormat;
  languages: string[];
  license: string;
  version: string;
  samplesCount: number;
  totalTokensEstimate: number;
  avgQualityScore: number;
  deduplicated: boolean;
  lastCuratedAt: string | null;
  recommendedBaseModels: string[];
  samples: TrainingSample[];
}

export interface ModelTechnicalDossier {
  reportId: string;
  generatedAt: string;
  modelId: string;
  modelName: string;
  family: string;
  parameters: string;
  format: ModelWeightEntry['format'];
  quantization: string;
  contextLength: number;
  shardsCount: number;
  catalogSizeGb: number;
  postQuantAccuracy: string;
  knownLimits: string;
  recommendedTasks: string[];
  integrity: {
    expectedSha256: string;
    diskFileName: string | null;
    diskFilePath: string;
    diskFileExists: boolean;
    diskFileBytes: number;
    actualDiskSha256: string | null;
    sha256MatchStatus: 'MATCH_VERIFIED' | 'MISMATCH' | 'UNVERIFIED_MISSING_ON_DISK';
  };
  licensing: {
    license: string;
    commercialRedistribution: boolean;
    redistributionNotes: string;
  };
  inferenceEngine: {
    activeEngine: RuntimeEngine;
    supportedEngines: RuntimeEngine[];
    loopbackEndpoint: string;
    hostBinariesDetected: {
      llamaServer: string | null;
      llamaCli: string | null;
      ollama: string | null;
    };
    referenceTokensPerSec: number;
    runtimeNotesAr: string;
  };
  hardware: {
    minRamGb: number;
    recommendedRamGb: number;
    cpuRequirements: string;
    gpuRequirements: string;
    ramVsGpuGuidanceAr: string;
    hostSnapshot: {
      cpuCores: number;
      totalRamGb: number;
      usedRamGb: number;
    };
    projectContext: {
      projectId: string;
      projectName: string;
      targetOs: Project['targetOs'];
      targetRamGb: number;
      targetGpuVramGb: number;
      hardwareCompatible: boolean;
      compatibilitySummaryAr: string;
      verificationVerdict: string | null;
    } | null;
  };
  approvalReadiness: {
    status: 'READY_VERIFIED' | 'HOLD_MISSING_WEIGHTS_OR_ENGINE';
    summaryAr: string;
  };
  reportDigestSha256: string;
}

export interface EngineeringAuditItem {
  id: string;
  code: string;
  categoryAr: string;
  titleAr: string;
  status: FeatureStatus;
  componentRef: string;
  evidenceAr: string;
  gapOrActionAr: string;
}

export interface ModelWeightDiskAudit {
  modelId: string;
  modelName: string;
  parameters: string;
  format: ModelWeightEntry['format'];
  quantization: string;
  catalogSizeGb: number;
  expectedPath: string;
  diskExists: boolean;
  diskBytes: number;
  expectedSha256: string;
  actualDiskSha256: string | null;
  sha256Status: 'MATCH_VERIFIED' | 'MISMATCH' | 'PLACEHOLDER_HASH' | 'MISSING_ON_DISK';
  license: string;
  commercialRedistribution: boolean;
  licenseNotesAr: string;
  status: FeatureStatus;
}

export interface EngineeringAuditReport {
  reportId: string;
  generatedAt: string;
  projectId: string | null;
  projectName: string | null;
  overallVerdict: 'APPROVED_INDEPENDENT' | 'HOLD_REQUIRES_WEIGHTS_AND_RUNTIME';
  executiveSummaryAr: string;
  statusCounts: Record<FeatureStatus, number>;
  hostDiagnostics: {
    platform: string;
    arch: string;
    cpuCores: number;
    totalRamGb: number;
    usedRamGb: number;
    weightsDirPath: string;
    weightsDirFilesCount: number;
    storePath: string;
    storeBytes: number;
    distBuilt: boolean;
    distBundleJsBytes: number;
    binariesDetected: {
      llamaServer: string | null;
      llamaCli: string | null;
      ollama: string | null;
    };
  };
  auditItems: EngineeringAuditItem[];
  modelAudits: ModelWeightDiskAudit[];
  reportDigestSha256: string;
}

export interface ChatAttachmentMeta {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  kind: 'pdf' | 'image' | 'word' | 'excel' | 'presentation' | 'text' | 'audio' | 'video' | 'other';
  parseStrategy: 'multimodal-inline' | 'extracted-text';
  storageFileName?: string;
  extractedText?: string;
  summaryNoteAr?: string;
}

export type PlatformChatMode = 'omni-advisor' | 'legal-expert' | 'translator' | 'general';

export type TranslationStyle =
  | 'certified-legal'
  | 'bilingual-table'
  | 'faithful-literal'
  | 'natural-idiomatic';

export type LegalJurisdictionScope =
  | 'global-comparative'
  | 'saudi-gcc'
  | 'egypt-arab'
  | 'international-arbitration'
  | 'eu-us-uk-regulatory';

export type IroncladMemoryCategory =
  | 'fact-entity'
  | 'legal-case'
  | 'glossary-term'
  | 'document-digest'
  | 'user-rule'
  | 'decision';

export interface IroncladMemoryItem {
  id: string;
  category: IroncladMemoryCategory;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  sourceType: 'auto-extracted' | 'document' | 'user-pinned';
  projectId?: string;
  createdAt: string;
  updatedAt: string;
  lastRecalledAt?: string;
  recallCount: number;
}

export interface PlatformChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  createdAt: string;
  projectId?: string;
  chatMode?: PlatformChatMode;
  brainId?: PlatformBrainId;
  jurisdictionScope?: LegalJurisdictionScope;
  translationTargetLang?: string;
  attachments?: ChatAttachmentMeta[];
}

export interface ForensicComponentRow {
  key: 'weights' | 'tokenizer' | 'inference_engine' | 'training_engine' | 'runtime_files' | 'unified_archive';
  componentAr: string;
  actualFoundAr: string;
  sizeBytes: number;
  sizeLabel: string;
  sha256: string;
  status: 'PASS' | 'PARTIAL' | 'BLOCKED' | 'FAILED';
}

export interface DetectedRuntimeEngineInfo {
  name: string;
  category: 'neural-inference' | 'neural-training' | 'wrapper-rag-only' | 'system-runtime';
  isRealLocalNeuralEngine: boolean;
  installed: boolean;
  version: string | null;
  path: string | null;
  sizeBytes: number;
  sha256: string | null;
  dependencies: string[];
  launchCommand: string | null;
}

export interface RealArchiveVerificationTest {
  id: number;
  titleAr: string;
  status: 'PASS' | 'PARTIAL' | 'BLOCKED' | 'FAILED';
  evidenceAr: string;
}

export interface UnifiedWeightsArchiveStatus {
  existsOnDisk: boolean;
  fileName: string;
  relativeDiskPath: string;
  bytes: number;
  sha256: string | null;
  builtAt: string | null;
  registeredModelsCount: number;
  attachedBinaryShardsCount: number;
  attachedBinaryShardsBytes: number;
  realTokenizersCount: number;
  realNeuralEnginesCount: number;
  fineTuneAdaptersCount: number;
  entriesCount: number;
  overallVerdict: 'PASS' | 'PARTIAL' | 'BLOCKED';
  missingRequirementsAr: string[];
  forensicComponents: ForensicComponentRow[];
  detectedEngines: DetectedRuntimeEngineInfo[];
  verificationTests: RealArchiveVerificationTest[];
  shardDetails: {
    modelId: string;
    modelName: string;
    hasBinaryOnDisk: boolean;
    hasRealTokenizer: boolean;
    hasRealInferenceEngine: boolean;
    offlineRunnable: boolean;
    placeholderHashDetected: boolean;
    fileName: string | null;
    bytes: number;
    sha256: string;
    license: string;
    blockersAr: string[];
  }[];
}

export interface WeightIntegrityRow {
  modelId: string;
  modelName: string;
  format: string;
  quantization: string;
  license: string;
  isSelectedInProject: boolean;
  imported: boolean;
  importedFileName: string | null;
  importedRelativePath: string | null;
  importedBytes: number;
  actualSha256: string | null;
  referenceSha256: string;
  referenceIsPlaceholder: boolean;
  referenceSourceLabel: string;
  matchStatus: 'MATCH_VERIFIED' | 'MISMATCH' | 'MISSING_ON_DISK' | 'UNVERIFIED_PLACEHOLDER_REF';
  mismatchReasonAr: string | null;
}

export interface WeightIntegrityReport {
  checkedAt: string;
  weightsDirectory: string;
  importedCount: number;
  matchedCount: number;
  mismatchCount: number;
  missingCount: number;
  rows: WeightIntegrityRow[];
  unlinkedDiskFiles: {
    fileName: string;
    bytes: number;
    actualSha256: string;
  }[];
}

export interface OmniTrainingCurriculumResult {
  domain: string;
  addedMemoryCount: number;
  addedDatasetSamplesCount: number;
  distilledPrinciples: string[];
  totalMemoryCount: number;
  omniDatasetId: string;
}

export type PlatformBrainId = 'gemini-standard' | 'attia-advisor';

export interface BrainOptionProfile {
  id: PlatformBrainId;
  titleAr: string;
  subtitleAr: string;
  modelId: string;
  thinkingLevel: string;
  methodologyAr: string;
  strengthsAr: string[];
  usesIroncladMemory: boolean;
  usesLegalAndPolymathSynthesis: boolean;
}

export interface BrainCompareSideResult {
  brainId: PlatformBrainId;
  brainLabelAr: string;
  modelId: string;
  thinkingLevel: string;
  elapsedMs: number;
  outputText: string;
  charCount: number;
  wordCount: number;
  headingsCount: number;
  memoryRulesInjected: number;
}

export interface BrainCompareResponse {
  prompt: string;
  comparedAt: string;
  geminiStandard: BrainCompareSideResult;
  attiaAdvisor: BrainCompareSideResult;
}

export type PreflightStatus = 'PASS' | 'WARNING' | 'FAIL' | 'BLOCKED' | 'NOT TESTED';
export type SelfHealingSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
export type InterventionTier = 1 | 2 | 3;

export type RepairLifecycleStage =
  | 'DETECT'
  | 'DIAGNOSE'
  | 'PLAN'
  | 'SAFETY CHECK'
  | 'APPLY'
  | 'VERIFY'
  | 'RECOVERED'
  | 'FAILED'
  | 'MANUAL APPROVAL REQUIRED';

export type RootCauseCategory =
  | 'software'
  | 'configuration'
  | 'dependencies'
  | 'connectivity'
  | 'resources'
  | 'permissions'
  | 'external-service'
  | 'corrupted-file-or-model';

export type MonitoredModuleId =
  | 'conversational-brain'
  | 'brain-selector'
  | 'brain-training-office'
  | 'data-factory'
  | 'weights-manager'
  | 'app-builder'
  | 'repair-studio'
  | 'legal-memos'
  | 'legal-mind-center'
  | 'ocr-documents'
  | 'memory-library'
  | 'users-auth'
  | 'export-packaging';

export interface PreflightCheckResult {
  id: string;
  nameAr: string;
  targetModule: string;
  status: PreflightStatus;
  executedAt: string;
  durationMs: number;
  evidence: string;
  errorMessage: string | null;
  severity: SelfHealingSeverity;
  suggestedActionAr: string;
  blocksCriticalLaunch: boolean;
}

export interface PreflightReport {
  runId: string;
  checkedAt: string;
  durationMs: number;
  overallStatus: PreflightStatus;
  summaryCounts: Record<PreflightStatus, number>;
  blockedCriticalModules: string[];
  checks: PreflightCheckResult[];
}

export interface MonitoredModuleHealth {
  id: MonitoredModuleId;
  nameAr: string;
  boundRoutes: string[];
  status: PreflightStatus;
  totalRequests: number;
  error4xxCount: number;
  error5xxCount: number;
  rateLimit429Or503Count: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
  lastStatusCode: number | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  isolated: boolean;
  isolationReasonAr: string | null;
}

export interface RuntimeFailureEvent {
  id: string;
  timestamp: string;
  moduleId: MonitoredModuleId;
  method: string;
  route: string;
  statusCode: number;
  latencyMs: number;
  errorMessage: string;
  transient: boolean;
}

export interface RuntimeTelemetrySnapshot {
  startedAt: string;
  lastProbeAt: string;
  probeCount: number;
  intervalSeconds: number;
  isRunning: boolean;
  host: {
    cpuPercent: number;
    totalRamGb: number;
    freeRamGb: number;
    ramPercent: number;
    processRssMb: number;
    heapUsedMb: number;
    uptimeSeconds: number;
  };
  httpStats: {
    totalRequests: number;
    status4xx: number;
    status5xx: number;
    status429: number;
    status503: number;
    avgLatencyMs: number;
  };
  stuckJobsCount: number;
  modules: MonitoredModuleHealth[];
  recentFailures: RuntimeFailureEvent[];
}

export interface RootCauseDiagnosis {
  id: string;
  timestamp: string;
  failedFunction: string;
  moduleId: MonitoredModuleId;
  relatedFileOrApi: string;
  category: RootCauseCategory;
  transient: boolean;
  severity: SelfHealingSeverity;
  tier: InterventionTier;
  evidence: string;
  priorEventsSummary: string;
  suggestedFixAr: string;
  safeToAutoApply: boolean;
  blockedReasonAr: string | null;
}

export interface RepairRollbackSnapshot {
  snapshotId: string;
  targetType: 'file' | 'store-config' | 'job-state' | 'cache';
  targetPath: string;
  preSha256: string | null;
  postSha256: string | null;
  backupRelativePath: string | null;
  patchDiffSummary: string;
  reversible: boolean;
  rolledBackAt: string | null;
  postRollbackVerified: boolean | null;
}

export interface RepairRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  issueTitleAr: string;
  moduleId: MonitoredModuleId;
  diagnosis: RootCauseDiagnosis;
  stage: RepairLifecycleStage;
  tier: InterventionTier;
  autoExecuted: boolean;
  approvedByOwner: boolean | null;
  affectedTargets: string[];
  actionTakenAr: string;
  resultStatus: 'RECOVERED' | 'FAILED' | 'MANUAL APPROVAL REQUIRED' | 'REJECTED';
  postRepairVerificationAr: string | null;
  postRepairVerified: boolean;
  rollbackSnapshot: RepairRollbackSnapshot | null;
  stageTimeline: {
    stage: RepairLifecycleStage;
    at: string;
    detailAr: string;
  }[];
}

export interface SelfHealingAlert {
  id: string;
  createdAt: string;
  severity: SelfHealingSeverity;
  sourceModuleId: MonitoredModuleId | 'system';
  titleAr: string;
  evidenceAr: string;
  linkedRecordId: string;
  acknowledged: boolean;
}

export interface SelfHealingAcceptanceTestResult {
  id: number;
  nameAr: string;
  inputsAr: string;
  actionAr: string;
  actualResultAr: string;
  evidenceAr: string;
  verdict: 'PASS' | 'FAIL' | 'BLOCKED';
  durationMs: number;
}

export interface SelfHealingCenterStatus {
  overallHealthVerdict: 'HEALTHY' | 'DEGRADED' | 'BLOCKED';
  lastPreflight: PreflightReport | null;
  telemetry: RuntimeTelemetrySnapshot;
  repairs: RepairRecord[];
  alerts: SelfHealingAlert[];
  acceptanceTests: SelfHealingAcceptanceTestResult[];
  summary: {
    passedChecks: number;
    warningChecks: number;
    failedOrBlockedChecks: number;
    openAlertsCount: number;
    recoveredRepairsCount: number;
    failedRepairsCount: number;
    pendingApprovalCount: number;
    lastVerifiedRepairAt: string | null;
  };
}

export interface HelbaweyBootstrap {
  projects: Project[];
  models: ModelWeightEntry[];
  fineTuneJobs: FineTuneJob[];
  trainingDatasets: TrainingDataset[];
  auditLogs: AuditLogEntry[];
  phases: ContractPhase[];
  acceptanceTests: AcceptanceTestItem[];
  plans: SubscriptionPlan[];
  activeBrain?: PlatformBrainId;
  platformChatHistory?: PlatformChatMessage[];
  platformChatMemory?: IroncladMemoryItem[];
  platformChatMemoryArchiveSummary?: string;
  ownerProfile: {
    name: string;
    email: string;
    organization: string;
  };
}

export type TrainingDomainGoalId =
  | 'reasoning-logic'
  | 'science-engineering'
  | 'legal-analysis'
  | 'economics-finance'
  | 'programming-software'
  | 'arabic-translation'
  | 'general-polymath'
  | 'custom';

export type TrainingEngineMode = 'local-lora' | 'advisor-cognitive-distillation';

export type TrainingCycleStage =
  | 'GOAL_SELECTED'
  | 'DATA_PREPARED'
  | 'PREREQS_CHECKED'
  | 'PRE_EVAL_DONE'
  | 'TRAINING_RUNNING'
  | 'CHECKPOINT_SAVED'
  | 'POST_EVAL_DONE'
  | 'PROMOTED'
  | 'REJECTED_REGRESSION'
  | 'BLOCKED'
  | 'ROLLED_BACK';

export interface BrainVersionSnapshot {
  version: string;
  brainId: PlatformBrainId;
  createdAt: string;
  trainingCycleId: string | null;
  domainGoal: TrainingDomainGoalId;
  summaryAr: string;
  addedPrinciples: string[];
  addedPolicyDirectives: string[];
  linkedDatasetIds: string[];
  linkedModelId: string;
  weightsSha256: string | null;
  snapshotSha256: string;
  preEvalScore: number | null;
  postEvalScore: number | null;
  active: boolean;
}

export interface BrainTrainingReadiness {
  brainId: PlatformBrainId;
  brainTitleAr: string;
  brainSubtitleAr: string;
  currentVersion: string;
  localNeuralModeStatus: 'READY' | 'BLOCKED';
  localNeuralBlockersAr: string[];
  cognitiveModeStatus: 'READY' | 'BLOCKED';
  cognitiveBlockersAr: string[];
  linkedModel: {
    id: string;
    name: string;
    format: string;
    quantization: string;
    license: string;
    importedOnDisk: boolean;
    diskBytes: number;
    actualSha256: string | null;
    referenceSha256: string;
    shaStatus: string;
  } | null;
  detectedEngines: {
    name: string;
    category: string;
    installed: boolean;
    version: string | null;
    path: string | null;
  }[];
  selfHealingStatusVerdict: 'HEALTHY' | 'DEGRADED' | 'BLOCKED';
  ironcladMemoryCount: number;
  approvedDatasets: {
    id: string;
    name: string;
    domain: string;
    samplesCount: number;
    avgQualityScore: number;
    format: string;
  }[];
}

export interface BrainTrainingEvalDetail {
  evaluatedAt: string;
  mode: 'live-llm' | 'local-runtime' | 'rubric-audit';
  modelUsed: string;
  prompt: string;
  responsePreview: string;
  responseCharCount: number;
  latencyMs: number;
  criteriaMatched: number;
  criteriaTotal: number;
  score: number;
  errorsDetected: string[];
}

export interface BrainTrainingCycle {
  id: string;
  brainId: PlatformBrainId;
  brainVersionBefore: string;
  brainVersionAfter: string | null;
  engineMode: TrainingEngineMode;
  domainGoal: TrainingDomainGoalId;
  customGoalAr: string;
  datasetId: string;
  linkedModelId: string;
  config: {
    epochs: number;
    batchSize: number;
    learningRate: string;
    loraRank: number;
    maxSteps: number;
    preserveIroncladMemory: boolean;
  };
  stage: TrainingCycleStage;
  status:
    | 'RUNNING'
    | 'PAUSED_CHECKPOINT'
    | 'COMPLETED_PROMOTED'
    | 'REJECTED_REGRESSION'
    | 'BLOCKED'
    | 'FAILED';
  completedSteps: number;
  totalSteps: number;
  checkpointPath: string | null;
  checkpointSha256: string | null;
  canResume: boolean;
  preEval: BrainTrainingEvalDetail | null;
  postEval: BrainTrainingEvalDetail | null;
  stagedPrinciples: string[];
  stagedDirectives: string[];
  logs: {
    at: string;
    stage: TrainingCycleStage;
    messageAr: string;
  }[];
  blockersAr: string[];
  createdAt: string;
  updatedAt: string;
}

export interface BrainTrainingAcceptanceTestResult {
  id: number;
  nameAr: string;
  actionAr: string;
  actualResultAr: string;
  evidenceAr: string;
  verdict: 'PASS' | 'FAIL' | 'BLOCKED';
  durationMs: number;
}

export interface BrainTrainingOfficeSnapshot {
  readiness: BrainTrainingReadiness;
  versions: BrainVersionSnapshot[];
  cycles: BrainTrainingCycle[];
  acceptanceTests: BrainTrainingAcceptanceTestResult[];
}

export type LegalDraftMode =
  | 'full-analysis'
  | 'defense-memo'
  | 'claim-statement'
  | 'arbitration-request'
  | 'contract-audit';

export interface LegalSourceEntry {
  id: string;
  code: string;
  titleAr: string;
  titleEn: string;
  category: 'international-treaty' | 'arbitration-rules' | 'saudi-gcc' | 'egypt-arab' | 'global-regulatory' | 'custom';
  jurisdiction: LegalJurisdictionScope;
  year: string;
  authority: string;
  keyArticlesSummaryAr: string;
  fullReferenceText: string;
  verifiedPrimary: boolean;
  addedAt: string;
}

export interface LegalCaseDocument {
  id: string;
  title: string;
  docType: 'contract' | 'pleading' | 'evidence' | 'judgment' | 'correspondence' | 'statute';
  content: string;
  charCount: number;
  sha256: string;
  addedAt: string;
}

export interface LegalMemoArtifact {
  id: string;
  caseId: string;
  mode: LegalDraftMode;
  titleAr: string;
  brainId: PlatformBrainId;
  brainVersion: string;
  modelUsed: string;
  executionMode: 'live-llm' | 'offline-rag-only';
  extractedIssues: string[];
  citedSourceCodes: string[];
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  markdownContent: string;
  latencyMs: number;
  sha256: string;
  filePathRel: string;
  createdAt: string;
}

export interface LegalCaseRecord {
  id: string;
  caseNumber: string;
  titleAr: string;
  caseType: 'commercial' | 'arbitration' | 'civil' | 'labor' | 'cyber-privacy' | 'administrative' | 'contract-review';
  jurisdictionScope: LegalJurisdictionScope;
  partiesAr: string;
  claimValue: string;
  criticalDeadline: string;
  factsSummaryAr: string;
  confidentiality: 'restricted' | 'confidential' | 'internal';
  status: 'open' | 'analyzed' | 'memo-drafted' | 'archived';
  extractedIssues: string[];
  linkedSourceCodes: string[];
  documents: LegalCaseDocument[];
  memos: LegalMemoArtifact[];
  sha256: string;
  createdAt: string;
  updatedAt: string;
}

export interface LegalDeliveryMilestone {
  dayRange: string;
  phaseAr: string;
  titleAr: string;
  deliverableAr: string;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING' | 'BLOCKED';
  evidenceAr: string;
  blockerActionAr: string | null;
}

export interface ContributorRightsEntry {
  id: string;
  nameAr: string;
  roleAr: string;
  contributionType: 'engineering' | 'legal-knowledge' | 'compute-sponsor' | 'testing-qa' | 'governance';
  contributionSummaryAr: string;
  rightsClauseAr: string;
  recordedAt: string;
}

export interface LegalMindAcceptanceTestResult {
  id: number;
  nameAr: string;
  actionAr: string;
  actualResultAr: string;
  evidenceAr: string;
  verdict: 'PASS' | 'FAIL' | 'BLOCKED';
  durationMs: number;
}

export interface LegalMindOverviewSnapshot {
  brainStatus: {
    activeBrain: PlatformBrainId;
    brainTitleAr: string;
    activeVersion: string;
    principlesCount: number;
    directivesCount: number;
    freeTierResilienceActive: boolean;
    localGgufWeightsCount: number;
    localLlamaServerInstalled: boolean;
    offlineNeuralVerdict: 'READY' | 'BLOCKED';
    offlineNeuralReasonAr: string;
  };
  sources: LegalSourceEntry[];
  cases: LegalCaseRecord[];
  milestones: LegalDeliveryMilestone[];
  contributors: ContributorRightsEntry[];
  acceptanceTests: LegalMindAcceptanceTestResult[];
  lastUpdatedAt: string;
}

export interface LocalDiskWeightEvidence {
  fileName: string;
  fullPath: string;
  bytes: number;
  sha256: string;
}

export interface LocalBrainForensicsReport {
  checkedAt: string;
  weightsDirectoryFullPath: string;
  diskWeightFiles: LocalDiskWeightEvidence[];
  selectedModelId: string;
  selectedModelName: string;
  selectedModelFormat: string;
  selectedModelReferenceSha256: string;
  llamaCppInstalled: boolean;
  llamaCppBinaryPath: string | null;
  llamaCppVersion?: string | null;
  llamaServerProcessRunning: boolean;
  llamaServerPid?: number | null;
  llamaServerRssMb?: number | null;
  llamaServerEndpointProbed: string;
  llamaServerReachable: boolean;
  hostTotalRamGb: number;
  hostFreeRamGb: number;
  hardwareCompatibilityAr?: string;
  localBrainReady: boolean;
  offlineNeuralVerdict: 'READY' | 'BLOCKED';
  honestDisclosureAr: string;
  cloudFallbackAvailable: boolean;
  cloudFallbackDescriptionAr: string;
}

export interface ProjectBrainChatResponse {
  mode: 'strict-local' | 'rag-sql-offline' | 'cloud-free-tier';
  status: 'PASS' | 'BLOCKED' | 'FAIL';
  sourceLabelAr: string;
  modelUsed: string;
  engineUsed?: string;
  externalApiCalled: boolean;
  answer: string | null;
  reasonAr: string;
  latencyMs: number;
  tokensGenerated?: number;
  tokensPerSec?: number;
  processRssMb?: number | null;
  hostFreeRamGb?: number | null;
  ragHitsCount: number;
  dbMatchedCount: number;
  forensics: LocalBrainForensicsReport;
}

export interface ErpAuditTestItem {
  id: string;
  category: 'local-brain' | 'database-crud' | 'relations' | 'chat-repair' | 'versioning';
  nameAr: string;
  verdict: 'PASS' | 'FAIL' | 'BLOCKED';
  detailsAr: string;
  evidenceLog: string;
  durationMs: number;
}

export interface ErpAuditExecutionReport {
  runAt: string;
  projectId: string;
  projectName: string;
  previousVersion: number;
  currentVersion: number;
  v1RollbackPreserved: boolean;
  versionPromoted: boolean;
  promotionReasonAr: string;
  previousFailedRootCauseAr: string;
  forensics: LocalBrainForensicsReport;
  tests: ErpAuditTestItem[];
  summaryCounts: {
    PASS: number;
    FAIL: number;
    BLOCKED: number;
  };
}
