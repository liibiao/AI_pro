export type TaskStatus = 'done' | 'in_progress' | 'waiting_review' | 'blocked' | 'todo';

export type TaskColumn = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  items: string[];
};

export type Episode = {
  id: string;
  title: string;
  status: string;
  storyboardCount: number;
  promptCount: number;
  assetCount: number;
};

export type Project = {
  id: string;
  name: string;
  path: string;
  phase: string;
  currentEpisode: string;
  updatedAt: string;
  hasSmartVisionState: boolean;
  summary: string;
  episodes: Episode[];
};

export type ReviewItem = {
  id: string;
  title: string;
  target: string;
  status: TaskStatus;
  type: string;
  workflowId?: string;
  artifactPath?: string;
};

export type CanvasStatus = {
  url: string;
  bridgeBase?: string;
  health: 'unknown' | 'online' | 'offline';
  modelCount: number;
  hasVideoModels: boolean;
  note: string;
  workbench?: {
    origin?: string;
    health?: 'unknown' | 'online' | 'offline' | string;
    healthOk?: boolean;
    workspaceRoot?: string;
    outputsRoot?: string;
    smartVisionRoot?: string;
    smartVisionOutputsRoot?: string;
    readEndpointReady?: boolean;
    readProbePath?: string;
    readProbeStatus?: number;
    readProbeContentType?: string;
    bridgeBaseRewrite?: 'enabled' | 'missing' | 'unknown' | string;
    checkedAt?: string;
    error?: string;
  };
};

export type ArtifactPreview = {
  path: string;
  name: string;
  extension: string;
  kind: 'text' | 'image' | 'video' | 'unsupported';
  mimeType: string;
  size: number;
  content?: string;
  dataUrl?: string;
  fileUrl?: string;
};

export type CanvasOutputRecord = {
  idempotencyKey?: string;
  status?: 'registered' | 'failed' | 'preview' | 'idempotent' | string;
  error?: string | null;
  workflowId: string;
  workflowPath?: string;
  artifactPath: string;
  reviewId?: string | null;
  nodeId?: string | null;
  nodeType?: string | null;
  mediaType?: string | null;
  outputArtifactHint?: string | null;
  sourcePath?: string | null;
  targetPath?: string | null;
  copied?: boolean;
  exists?: boolean;
  taskId?: string | null;
  updatedAt?: string;
};

export type CanvasOutputMaterialized = {
  artifactPath: string;
  sourcePath?: string;
  targetPath?: string;
  copied?: boolean;
  existedBefore?: boolean;
  exists?: boolean;
  sourceExists?: boolean;
};

export type CanvasOutputRegisterInput = {
  workflowId?: string;
  workflowPath?: string;
  runSessionId?: string;
  artifactPath?: string;
  outputArtifactHint?: string;
  localPath?: string;
  idempotencyKey?: string;
  nodeId?: string;
  nodeType?: string;
  mediaType?: string;
  dryRun?: boolean;
  resetBlocked?: boolean;
};

export type CanvasOutputRegisterResult = {
  dryRun: boolean;
  status: string;
  idempotencyKey?: string;
  idempotent?: boolean;
  workflow?: WorkflowItem;
  registeredWorkflow?: boolean;
  wouldRegisterWorkflow?: boolean;
  artifactPath?: string;
  materialized?: CanvasOutputMaterialized;
  reviewId?: string | null;
  canvasOutputRecord?: CanvasOutputRecord;
  pipelineAttach?: unknown;
  releaseAttach?: unknown;
  canvasRunSessionAttach?: { updated?: boolean; reason?: string; session?: CanvasRunSession };
  snapshot?: ProjectSnapshot;
};

export type CanvasOutputRetryResult = {
  dryRun: boolean;
  status: string;
  retryable?: boolean;
  retried?: boolean;
  idempotencyKey?: string;
  artifactPath?: string;
  reviewId?: string | null;
  failedRecord?: CanvasOutputRecord;
  canvasOutputRecord?: CanvasOutputRecord;
  retryPreview?: unknown;
  snapshot?: ProjectSnapshot;
};

export type CanvasRunSessionStatus = 'opened' | 'running' | 'output_registered' | 'done' | 'failed' | 'cancelled' | string;

export type CanvasRunSession = {
  id: string;
  projectId?: string;
  episodeId?: string;
  pipelineRunId?: string | null;
  stageId?: string | null;
  stageTitle?: string | null;
  workflowId: string;
  workflowPath?: string;
  workflowName?: string;
  workflowType?: string | null;
  status: CanvasRunSessionStatus;
  outputArtifactHints?: string[];
  importUrl?: string;
  editUrl?: string;
  runUrl?: string;
  artifactPath?: string | null;
  reviewId?: string | null;
  idempotencyKey?: string | null;
  note?: string | null;
  source?: string;
  openedAt?: string;
  startedAt?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
  events?: Array<{ id: string; type: string; status?: string; artifactPath?: string | null; reviewId?: string | null; at: string }>;
};

export type CanvasRunLedger = {
  version: string;
  projectId: string;
  sessions: CanvasRunSession[];
  events: Array<{ id: string; sessionId: string; workflowId?: string; pipelineRunId?: string | null; stageId?: string | null; type: string; status?: string; artifactPath?: string | null; reviewId?: string | null; at: string }>;
  updatedAt?: string | null;
};

export type CanvasRunSessionResult = {
  dryRun?: boolean;
  status: string;
  session: CanvasRunSession;
  ledger: CanvasRunLedger;
  snapshot: ProjectSnapshot;
};

export type WorkflowItem = {
  id: string;
  name: string;
  path: string;
  importUrl?: string;
  editUrl?: string;
  runUrl?: string;
  type: string;
  status: TaskStatus;
  note?: string;
  importCheck?: WorkflowImportCheck;
  updatedAt?: string;
  reviewId?: string;
  source?: string;
  version?: number;
  nodeCount?: number;
  connCount?: number;
  executor?: string;
  workflowMode?: string;
  executionCarrier?: string;
  directModelExecution?: boolean;
  executionStrategy?: CanvasExecutionStrategy;
  promptCount?: number;
  referenceImageCount?: number;
  outputArtifacts?: string[];
  generatedAt?: string;
  sourceWorkflowId?: string;
  triggeredByReviewId?: string;
  triggerKind?: string;
  pipelineRunId?: string;
  pipelineStageId?: string;
  sourceArtifactPath?: string;
  chainStage?: string;
  lastOutputReviewId?: string;
  archived?: boolean;
  archivedAt?: string;
  restoredAt?: string;
  statusBeforeArchive?: TaskStatus;
};

export type WorkflowTimelineItem = {
  id: string;
  label: string;
  target?: string;
  status?: TaskStatus | string;
  at?: string;
};

export type WorkflowChainAction =
  | 'import_workflow'
  | 'import_downstream_workflow'
  | 'add_output'
  | 'create_artifact_review'
  | 'approve_artifact_review'
  | 'create_downstream_workflow'
  | 'fix_artifact_output'
  | 'archive_workflow'
  | 'restore_workflow';

export type WorkflowChainItem = {
  workflowId: string;
  workflowType: string;
  workflowStatus: TaskStatus;
  sourceWorkflowId?: string;
  outputCount: number;
  lastOutputReviewId?: string;
  triggeredByReviewId?: string;
  chainStage?: string;
  downstreamWorkflowIds: string[];
  reviewStatus?: TaskStatus;
  sourceArtifactPath?: string;
  nextAction: WorkflowChainAction;
  nextActionLabel: string;
  actionTarget?: string;
  timeline?: WorkflowTimelineItem[];
  closed: boolean;
};

export type WorkflowChainRuntime = {
  chains?: WorkflowChainItem[];
  chain?: WorkflowChainItem;
  workflow?: WorkflowItem;
  downstreamWorkflows?: WorkflowItem[];
  reviews?: ReviewItem[];
  importUrl?: string;
  runtime?: {
    status: string;
    chainCount: number;
    openActionCount: number;
    closedChainCount: number;
    updatedAt: string;
  };
  snapshot: ProjectSnapshot;
};

export type WorkflowChainActionResult = {
  action: WorkflowChainAction;
  result: unknown;
  runtime: WorkflowChainRuntime;
  snapshot: ProjectSnapshot;
};

export type WorkflowRuntimeIssue = {
  level: 'error' | 'warn';
  code: string;
  workflowId?: string;
  reviewId?: string;
  target?: string;
  message?: string;
};

export type WorkflowRuntimeDiagnostics = {
  status: 'ready' | 'degraded';
  checkedAt: string;
  counts: {
    workflowCount: number;
    chainCount: number;
    openChainCount: number;
    reviewCount: number;
    artifactCount: number;
    releaseCount?: number;
    publishedReleaseCount?: number;
    archivedReleaseCount?: number;
    issueCount: number;
  };
  issues: WorkflowRuntimeIssue[];
  nextActions: string[];
  snapshot: ProjectSnapshot;
};

export type WorkflowRuntimeRepairResult = {
  repairedAt: string;
  dryRun?: boolean;
  movedCompletedReviews: number;
  pendingReviews: number;
  repairedProgressCount: number;
  repairedReleaseCount?: number;
  repairedRunnerArchiveCount?: number;
  diagnostics: WorkflowRuntimeDiagnostics;
  snapshot: ProjectSnapshot;
};

export type WorkflowChainReplayResult = {
  workflowId: string;
  replayedAt: string;
  dryRun: boolean;
  actions: Array<{ action: string; status: string; reason?: string }>;
  result?: WorkflowChainActionResult | null;
  snapshot: ProjectSnapshot;
};

export type WorkflowRunnerEvent = {
  id: string;
  runId?: string;
  sourceRunId?: string;
  type: string;
  workflowId?: string;
  releaseId?: string;
  reviewId?: string;
  taskPlanId?: string;
  taskType?: string;
  progressItemId?: string;
  status: string;
  action?: string;
  error?: string;
  at: string;
  requested?: number;
  targetBucket?: string;
  targetItemId?: string;
};

export type ReleasePublishQueueItem = {
  id: string;
  releaseId: string;
  episodeId: string;
  status: 'queued' | 'published' | 'blocked';
  queuedAt: string;
  updatedAt?: string;
  publishedAt?: string;
  reason?: string;
  manifestPath?: string | null;
  artifactPaths: string[];
  retryCount?: number;
  error?: string;
};

export type ReleasePublishRun = {
  id: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  releaseId?: string | null;
  requested: number;
  results: Array<{ releaseId: string; status: string; error?: string }>;
};

export type WorkflowRunnerRun = {
  id: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  requestedLimit?: number;
  requested?: number;
  retryOfRunId?: string;
  results: Array<{ workflowId: string; status: string; action?: string; error?: string }>;
};

export type TaskQueueItem = {
  id: string;
  taskPlanId: string;
  subtaskId: string;
  progressItemId: string;
  title: string;
  taskType: string;
  phase: string;
  ownerRole: string;
  dependsOn: string[];
  status: 'queued' | 'blocked' | 'running' | 'done' | 'failed';
  queueOrder: number;
  queuedAt: string;
  startedAt?: string;
  completedAt?: string;
  requeuedAt?: string;
  updatedAt?: string;
  reportPath?: string;
  previousReportPath?: string;
  retryCount?: number;
  requeueReason?: string;
  error?: string;
};

export type TaskQueueRun = {
  id: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  requestedLimit?: number;
  requested: number;
  taskPlanId?: string | null;
  taskQueueId?: string | null;
  results: Array<{ taskQueueId: string; taskPlanId: string; subtaskId: string; progressItemId: string; status: string; error?: string; reportPath?: string }>;
};

export type WorkflowRunnerArchiveSummary = {
  lastCompactedAt: string | null;
  counts: {
    taskQueueCount: number;
    releasePublishQueueCount: number;
    taskQueueRunCount: number;
    releasePublishRunCount: number;
    eventCount: number;
  };
  recentTaskQueue: TaskQueueItem[];
  recentReleasePublishQueue: ReleasePublishQueueItem[];
  recentTaskQueueRuns: TaskQueueRun[];
  recentReleasePublishRuns: ReleasePublishRun[];
  recentEvents: WorkflowRunnerEvent[];
};

export type WorkflowRunnerStatus = {
  status: 'running' | 'ready' | 'degraded';
  activeRun: WorkflowRunnerRun | null;
  lastRun: WorkflowRunnerRun | null;
  runCount: number;
  taskPlanCount?: number;
  taskQueueCount?: number;
  queuedTaskCount?: number;
  blockedTaskCount?: number;
  doneTaskCount?: number;
  taskQueue?: TaskQueueItem[];
  lastTaskQueueRun?: TaskQueueRun | null;
  releasePublishQueue?: ReleasePublishQueueItem[];
  blockedReleasePublishCount?: number;
  lastReleasePublishRun?: ReleasePublishRun | null;
  archiveSummary?: WorkflowRunnerArchiveSummary;
  recentEvents: WorkflowRunnerEvent[];
  diagnostics: WorkflowRuntimeDiagnostics;
  updatedAt: string;
  snapshot: ProjectSnapshot;
};

export type WorkflowRunnerRunDetail = {
  run: WorkflowRunnerRun;
  events: WorkflowRunnerEvent[];
  runner: WorkflowRunnerStatus;
  snapshot: ProjectSnapshot;
};

export type WorkflowQueueRunResult = {
  runId: string;
  queuedAt: string;
  completedAt: string;
  requested: number;
  results: Array<{ workflowId: string; status: string; action?: string; error?: string; result?: WorkflowChainReplayResult }>;
  runner: WorkflowRunnerStatus;
  snapshot: ProjectSnapshot;
};

export type WorkflowTaskQueueRunResult = {
  runId: string;
  queuedAt: string;
  completedAt: string;
  requested: number;
  results: Array<{ taskQueueId: string; taskPlanId: string; subtaskId: string; progressItemId: string; status: string; error?: string; reportPath?: string }>;
  runner: WorkflowRunnerStatus;
  snapshot: ProjectSnapshot;
};

export type WorkflowTaskQueueRequeueResult = {
  requeuedAt: string;
  requested: number;
  requeuedItems: TaskQueueItem[];
  runner: WorkflowRunnerStatus;
  snapshot: ProjectSnapshot;
};

export type WorkflowTaskQueueStressResult = {
  smokedAt: string;
  dryRun: boolean;
  status: 'passed' | 'blocked';
  requestedPlanCount: number;
  requestedTaskTypes: string[];
  copies: number;
  totalSubtasks: number;
  completedSubtasks: number;
  blockedPlanCount: number;
  plans: Array<{
    taskType: string;
    taskId: string;
    subtaskCount: number;
    dependencyCount: number;
    blocked: boolean;
    taskQueueSmoke: {
      status: string;
      requested: number;
      completed: number;
      results: Array<{ subtaskId: string; status: string; dependencyCount: number; inputMissingCount: number; outputConcreteCount: number }>;
      unresolved: Array<{ subtaskId: string; status: string; waitingFor: string[] }>;
    };
  }>;
  runner: WorkflowRunnerStatus;
  snapshot: ProjectSnapshot;
};

export type WorkflowRunnerRetryResult = WorkflowQueueRunResult & {
  retryOfRunId: string;
};

export type WorkflowRunnerCompactionResult = {
  compactedAt: string;
  dryRun: boolean;
  before: {
    taskQueueCount: number;
    releasePublishQueueCount: number;
    taskQueueRunCount: number;
    releasePublishRunCount: number;
    eventCount: number;
  };
  archived: {
    taskQueueCount: number;
    releasePublishQueueCount: number;
    taskQueueRunCount: number;
    releasePublishRunCount: number;
    eventCount: number;
  };
  after: {
    taskQueueCount: number;
    releasePublishQueueCount: number;
    taskQueueRunCount: number;
    releasePublishRunCount: number;
    eventCount: number;
  };
  limits: {
    keepCompletedTaskItems: number;
    keepPublishedReleaseItems: number;
    keepRuns: number;
    keepEvents: number;
  };
  runner: WorkflowRunnerStatus;
  snapshot: ProjectSnapshot;
};

export type WorkflowRunnerArchiveBucket = 'taskQueue' | 'releasePublishQueue' | 'taskQueueRuns' | 'releasePublishRuns' | 'events';

export type WorkflowRunnerArchiveRestoreResult = {
  restoredAt: string;
  bucket: WorkflowRunnerArchiveBucket;
  itemId: string;
  status: 'restored' | 'skipped_duplicate';
  requested: number;
  restoredCount: number;
  duplicateCount: number;
  results: Array<{ itemId: string; status: 'restored' | 'skipped_duplicate' }>;
  restoredItem: TaskQueueItem | ReleasePublishQueueItem | TaskQueueRun | ReleasePublishRun | WorkflowRunnerEvent;
  restoredItems: Array<TaskQueueItem | ReleasePublishQueueItem | TaskQueueRun | ReleasePublishRun | WorkflowRunnerEvent>;
  archiveSummary: WorkflowRunnerArchiveSummary;
  runner: WorkflowRunnerStatus;
  snapshot: ProjectSnapshot;
};

export type ReleasePublishQueueRunResult = {
  runId: string;
  dryRun?: boolean;
  queuedAt: string;
  completedAt: string;
  requested: number;
  results: Array<{ releaseId: string; status: string; dryRun?: boolean; error?: string; publishGate?: ReleasePublishGate; result?: ReleaseRegistryResult }>;
  runner: WorkflowRunnerStatus;
  snapshot: ProjectSnapshot;
};

export type ReleasePublishQueueRequeueResult = {
  requeuedAt: string;
  requested: number;
  requeuedItems: ReleasePublishQueueItem[];
  runner: WorkflowRunnerStatus;
  snapshot: ProjectSnapshot;
};

export type ReleasePublishQueueSmokeResult = {
  smokedAt: string;
  dryRun: boolean;
  release: { id: string; title: string; status: ReleaseStatus; episodeId: string };
  publishGate: ReleasePublishGate;
  steps: Array<{ id: string; status: string; queueItem?: ReleasePublishQueueItem; result?: { releaseId: string; status: string; dryRun: boolean; error?: string } }>;
  runner: WorkflowRunnerStatus;
  snapshot: ProjectSnapshot;
};

export type SmartVisionRuntimeSmokeResult = {
  smokedAt: string;
  dryRun: boolean;
  taskType: string;
  status: string;
  steps: Array<{ id: string; status: string; summary: string }>;
  pipelinePlan?: {
    pipelineId: string;
    canonicalSequence: string[];
    stages: Array<{ id: string; taskType: string; title: string; workflowMode: string; nextTaskType?: string | null }>;
  };
  pipelineRunSmoke?: {
    status: string;
    runId: string;
    steps: Array<{ id: string; status: string; summary?: string }>;
    canvasWorkflows: Array<{ stageId: string; workflowPath: string; workflowMode?: string; outputArtifact?: string }>;
  };
  contextPackSummary: {
    methodologyCount: number;
    skillCount: number;
    templateCount: number;
    referenceCount: number;
    missingReferenceCount: number;
    parsedAt: string;
  };
  taskPlan: { taskId: string; subtaskCount: number; dependencyCount: number; blocked: boolean };
  canvasWorkflow?: { workflowPath: string; workflowMode: string; editUrl: string; runUrl: string; promptCount: number; referenceImageCount: number; preflight?: WorkflowPreflightResult };
  taskQueueSmoke: { status: string; requested: number; completed: number; results: Array<{ subtaskId: string; status: string; dependencyCount: number; inputMissingCount: number; outputConcreteCount: number }>; unresolved: Array<{ subtaskId: string; status: string; waitingFor: string[] }> };
  releaseSmoke: { release: { id: string; title: string; status: ReleaseStatus; episodeId: string }; steps: ReleasePublishQueueSmokeResult['steps']; canPublish: boolean; blockerCount: number };
  diagnostics: { status: string; issueCount: number; nextActions: string[] };
  runner: WorkflowRunnerStatus;
  snapshot: ProjectSnapshot;
};

export type PipelineStageStatus = 'queued' | 'workflow_ready' | 'waiting_output' | 'waiting_review' | 'done' | 'blocked';

export type PipelineRunStage = {
  id: string;
  index: number;
  taskType: string;
  title: string;
  workflowMode: string;
  phaseGate: string;
  previousStageId?: string | null;
  nextStageId?: string | null;
  taskPlanId?: string | null;
  status: PipelineStageStatus;
  blockers: Array<{ code: string; message?: string; stageId?: string; reviewId?: string }>;
  workflowId?: string | null;
  workflowPath?: string | null;
  artifactPaths: string[];
  reviewIds: string[];
  requiredInputArtifacts: string[];
  outputArtifacts: string[];
  gate?: {
    status: string;
    blockers: Array<{ code: string; message?: string; stageId?: string; reviewId?: string }>;
    passedAt?: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type PipelineRun = {
  id: string;
  pipelinePlanId: string;
  projectId: string;
  episodeId: string;
  title: string;
  status: 'queued' | 'running' | 'done' | 'blocked' | 'failed';
  currentStageId?: string | null;
  canonicalSequence: string[];
  stages: PipelineRunStage[];
  events?: Array<{ id: string; type: string; status?: string; stageId?: string; taskType?: string; workflowId?: string; artifactPath?: string; reviewId?: string; at: string }>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type PipelineRunRegistry = {
  version: string;
  projectId: string;
  runs: PipelineRun[];
  events: Array<{ id: string; pipelineRunId: string; type: string; status?: string; stageId?: string; taskType?: string; workflowId?: string; artifactPath?: string; reviewId?: string; at: string }>;
  updatedAt?: string | null;
};

export type PipelineRunResult = {
  dryRun?: boolean;
  run: PipelineRun;
  stage?: PipelineRunStage;
  steps?: Array<{ id: string; status: string; workflowId?: string; workflowPath?: string; blockers?: Array<{ code: string; message?: string }> }>;
  pipelinePlan?: {
    pipelineId: string;
    canonicalSequence: string[];
    stages: Array<{ id: string; taskType: string; title: string; workflowMode: string; nextTaskType?: string | null }>;
  };
  registry: PipelineRunRegistry;
  snapshot: ProjectSnapshot;
};

export type PipelineRunRepairResult = {
  dryRun: boolean;
  repairedAt: string;
  requestedRunId?: string | null;
  requestedStageId?: string | null;
  repairCount: number;
  repairs: Array<{ code: string; runId?: string; stageId?: string; workflowId?: string | null; workflowPath?: string | null; reviewCount?: number; artifactCount?: number; message?: string }>;
  registry: PipelineRunRegistry;
  diagnostics: WorkflowRuntimeDiagnostics;
  snapshot: ProjectSnapshot;
};

export type PipelineRunSmokeResult = {
  smokedAt: string;
  dryRun: boolean;
  status: string;
  run: PipelineRun;
  pipelinePlan: {
    pipelineId: string;
    canonicalSequence: string[];
    stages: Array<{ id: string; taskType: string; title: string; workflowMode: string; nextTaskType?: string | null }>;
  };
  steps: Array<{ id: string; status: string; summary?: string; workflowId?: string; artifacts?: number; reviews?: number }>;
  canvasWorkflows: Array<{ stageId: string; workflowPath: string; workflowMode?: string; outputArtifact?: string }>;
  diagnostics: { status: string; issueCount: number; nextActions: string[] };
  snapshot: ProjectSnapshot;
};

export type CreativeAssetCard = {
  id: string;
  type: 'character' | 'scene' | 'prop' | string;
  typeLabel: string;
  name: string;
  sourceShots: string[];
  usage: string;
  visualPrompt: string;
  referencePolicy: string;
};

export type CreativeStoryboardShot = {
  shotId: string;
  episodeId: string;
  title: string;
  segment: string;
  durationSeconds: number;
  sourceExcerpt: string;
  scene: string;
  characters: string[];
  props: string[];
  action: string;
  camera: string;
  audio: string;
  assetIds: string[];
  imagePrompt: string;
  videoPrompt: string;
};

export type CreativeStartInput = {
  projectId?: string;
  episodeId?: string;
  scriptText?: string;
  script?: string;
  importedFiles?: string[];
  createPipelineRun?: boolean;
  prepareFirstStage?: boolean;
  dryRun?: boolean;
};

export type CreativeStartResult = {
  dryRun: boolean;
  projectId: string;
  episodeId: string;
  planId: string;
  status: 'preview' | 'created' | string;
  importedFiles: string[];
  scriptLength: number;
  shotCount: number;
  assetCount: number;
  artifactPaths: {
    scriptArtifactPath: string;
    scriptIngestArtifactPath: string;
    storyboardArtifactPath: string;
    storyboardJsonArtifactPath: string;
    assetCardsArtifactPath: string;
    assetCardsJsonArtifactPath: string;
    assetIndexArtifactPath: string;
    seedancePromptArtifactPath: string;
    creativePlanArtifactPath: string;
  };
  storyboard: {
    clipCount: number;
    totalDurationSeconds: number;
    shots: CreativeStoryboardShot[];
  };
  assets: CreativeAssetCard[];
  pipelineRun?: PipelineRunResult | null;
  snapshot: ProjectSnapshot;
};

export type WorkflowRegistry = {
  canvasUrl: string;
  bridgeBase?: string;
  workflows: WorkflowItem[];
  note: string;
  updatedAt?: string;
  chains?: WorkflowChainItem[];
};

export type ReleaseStatus = 'draft' | 'ready_for_review' | 'approved' | 'published' | 'archived' | 'restored';

export type ReleasePublishGateBlocker = {
  code: string;
  message: string;
  target?: string;
  reviewId?: string;
};

export type ReleasePublishGate = {
  canPublish: boolean;
  checkedAt: string;
  blockers: ReleasePublishGateBlocker[];
};

export type ReleasePackage = {
  id: string;
  title: string;
  episodeId: string;
  status: ReleaseStatus;
  artifactPaths: string[];
  sourceWorkflowIds?: string[];
  reviewId?: string;
  manifestPath?: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  publishedAt?: string;
  archivedAt?: string;
  restoredAt?: string;
  history?: Array<{ status: ReleaseStatus; at: string; note?: string }>;
  publishGate?: ReleasePublishGate;
};

export type ReleaseRegistry = {
  version: string;
  projectId: string;
  releases: ReleasePackage[];
  archiveHistory?: Array<{ releaseId: string; episodeId?: string; archivedAt: string; manifestPath?: string | null; artifactPaths: string[] }>;
  publishHistory?: Array<{ releaseId: string; episodeId: string; title: string; publishedAt: string; source?: string; manifestPath?: string | null; artifactPaths: string[] }>;
  restoreHistory?: Array<{ releaseId: string; episodeId: string; restoredAt: string; manifestPath?: string | null; artifactPaths: string[] }>;
  note?: string;
  updatedAt?: string;
};

export type ReleaseRegistryResult = {
  registry: ReleaseRegistry;
  release?: ReleasePackage;
  review?: ReviewItem;
  snapshot: ProjectSnapshot;
};

export type ReleaseRepairResult = ReleaseRegistryResult & {
  release: ReleasePackage;
  repairedAt: string;
  repairs: Array<{ code: string; message: string }>;
  beforeGate: ReleasePublishGate;
  afterGate: ReleasePublishGate;
  diagnostics: WorkflowRuntimeDiagnostics;
};

export type CapabilityPackItem = {
  id: string;
  title: string;
  taskTypes: string[];
  documents?: string[];
  files?: string[];
};

export type CapabilityPack = {
  packId: string;
  title: string;
  note: string;
  items: CapabilityPackItem[];
};

export type ParsedReference = {
  path: string;
  sourceKind: string;
  exists: boolean;
  extension?: string;
  format?: string;
  size?: number;
  headings: string[];
  excerpt: string;
  jsonKeys?: string[];
  parsedAt: string;
  error?: string;
};

export type ReferenceIssue = {
  path: string;
  sourceKind: string;
  error: string;
};

export type DataPackSummary = {
  methodologyCount: number;
  skillCount: number;
  templateCount: number;
  referenceCount: number;
  missingReferenceCount: number;
  parsedAt: string;
};

export type TaskContextPack = {
  taskType: string;
  title: string;
  methodologyPackId: string;
  skillPackId: string;
  templatePackId: string;
  aliases?: string[];
  docs: string[];
  skills: string[];
  agents: string[];
  templates: string[];
  inputArtifacts: string[];
  workflowHints: string[];
  selectedCapabilityItems?: {
    methodologies: Array<{ id: string; title: string; taskTypes: string[] }>;
    skills: Array<{ id: string; title: string; taskTypes: string[] }>;
    templates: Array<{ id: string; title: string; taskTypes: string[] }>;
  };
  parsedReferences?: ParsedReference[];
  referenceIssues: ReferenceIssue[];
  dataPackSummary: DataPackSummary;
  phaseGateItems: string[];
  redlines: string[];
  memoryPolicy: string;
  generatedAt: string;
};

export type SmartVisionSubtask = {
  id: string;
  title: string;
  ownerRole: string;
  dependsOn: string[];
  inputArtifacts: string[];
  outputArtifacts: string[];
  acceptanceCriteria: string[];
  status: string;
};

export type SmartVisionWorkflowTask = {
  taskId: string;
  projectId: string;
  episodeId: string;
  title: string;
  taskType: string;
  phase: string;
  agentRole: string;
  requiredDocs: string[];
  requiredSkills: string[];
  requiredAgents: string[];
  requiredTemplates: string[];
  inputArtifacts: string[];
  outputArtifacts: string[];
  canvasWorkflowRequired: boolean;
  canvasAdapter?: {
    executor: string;
    workflowMode: string;
    source: string;
    executionCarrier?: string;
    directModelExecution?: boolean;
    strategy?: CanvasExecutionStrategy;
    required: boolean;
  };
  humanReviewRequired: boolean;
  phaseGate: string;
  productionPipeline?: {
    canonicalSequence: string[];
    currentStage: string;
    currentTaskType: string;
    previousTaskType?: string | null;
    nextTaskType?: string | null;
    requiredInputs: string[];
    produces: string[];
    stageId?: string;
    stageTitle?: string;
    consumes?: string[];
  };
  phaseGateItems: string[];
  redlines: string[];
  memoryPolicy: string;
  dataPackSummary?: DataPackSummary;
  referenceIssues?: ReferenceIssue[];
  subtasks?: SmartVisionSubtask[];
  orchestration?: {
    executionOrder: string[];
    dependencyCount: number;
    blocked: boolean;
    reviewRequired: boolean;
    generatedFrom: {
      docs: string[];
      skills: string[];
      templates: string[];
    };
  };
  generatedAt: string;
};

export type SmartVisionTaskPlan = SmartVisionWorkflowTask;

export type WorkflowDraft = {
  schema: 'mjb-workflow-v1';
  id: string;
  name: string;
  taskType: string;
  path: string;
  importUrl: string;
  editUrl?: string;
  runUrl?: string;
  canvasExecution?: {
    executor: string;
    adapter: string;
    executionCarrier?: string;
    directModelExecution?: boolean;
    modelInvocation?: string;
    strategy?: CanvasExecutionStrategy;
    workflowMode: string;
    status: string;
    workflowPath: string;
    importUrl: string;
    editUrl: string;
    runUrl: string;
    bridgeBase: string;
    promptCount: number;
    referenceImageCount: number;
    prompts: Array<{ path: string; sourceKind: string; score?: number; exists: boolean; excerpt: string; headings: string[]; error?: string }>;
    referenceImages: Array<{ name: string; role: string; artifactPath: string; localPath: string; localUrl: string; uploadMode: string }>;
    outputArtifacts: string[];
    actions: Array<{ id: string; label: string; url: string }>;
    generatedAt: string;
  };
  contextPack: TaskContextPack;
  canvas: {
    nodes: unknown[];
    conns: unknown[];
    view: Record<string, unknown>;
    next: number;
    muted: unknown[];
  };
  generatedAt: string;
};

export type CanvasExecutionStrategy = {
  mode: string;
  carrier: string;
  executor: string;
  workflowMode: string;
  pipelineStage?: string;
  pipelineTaskType?: string;
  consumes?: string[];
  produces?: string[];
  directModelExecution: boolean;
  modelInvocation: string;
  defaultAction: string;
  allowedActions: string[];
  gates: string[];
  note?: string;
};

export type WorkflowImportCheck = {
  ok: boolean;
  path: string;
  importUrl: string;
  editUrl?: string;
  runUrl?: string;
  canvasExecutionOk?: boolean | null;
  fileExists: boolean;
  schema: string | null;
  nodeCount: number;
  connCount: number;
  checkedAt: string;
  issues: string[];
  warnings?: string[];
  preflight?: WorkflowPreflightResult;
};

export type WorkflowPreflightIssue = {
  level: 'error' | 'warn';
  code: string;
  target: string;
  message: string;
  section?: string;
  [key: string]: unknown;
};

export type WorkflowPreflightSection = {
  id: string;
  title: string;
  status: 'passed' | 'warn' | 'failed';
  errorCount: number;
  warnCount: number;
  issues: WorkflowPreflightIssue[];
};

export type WorkflowPreflightResult = {
  ok: boolean;
  status: 'passed' | 'warn' | 'failed';
  checkedAt: string;
  workflowId: string | null;
  taskType: string;
  workflowMode: string;
  path: string;
  fileExists: boolean;
  nodeCount: number;
  connCount: number;
  promptCount: number;
  referenceImageCount: number;
  outputHintCount: number;
  outputArtifactCount: number;
  errorCount: number;
  warnCount: number;
  sections: WorkflowPreflightSection[];
  issues: WorkflowPreflightIssue[];
};

export type WorkflowPreflightResponse = {
  workflowDraft: WorkflowDraft;
  preflight: WorkflowPreflightResult;
  importCheck: WorkflowImportCheck;
};

export type CompiledWorkflowDraft = {
  taskPlan: SmartVisionTaskPlan;
  workflowDraft: WorkflowDraft;
  importUrl: string;
  path?: string;
  persisted?: boolean;
  importCheck?: WorkflowImportCheck;
  generatedAt: string;
};

export type TaskPlanPersistResult = {
  taskPlan: SmartVisionTaskPlan;
  persistedAt: string;
  progressItems: Array<TaskColumn & {
    taskPlanId: string;
    subtaskId: string;
    ownerRole: string;
    dependsOn: string[];
    inputArtifacts: string[];
    outputArtifacts: string[];
    acceptanceCriteria: string[];
  }>;
  queuedTasks: TaskQueueItem[];
  runner: WorkflowRunnerStatus;
  snapshot: ProjectSnapshot;
};

export type WorkflowSaveResult = {
  workflowDraft: WorkflowDraft;
  workflow: WorkflowItem;
  registry: WorkflowRegistry;
  importCheck?: WorkflowImportCheck;
  snapshot: ProjectSnapshot;
};

export type WorkflowSelfTestResult = {
  status: 'passed' | 'failed';
  sourceWorkflowId: string;
  artifactPath: string;
  artifactReviewId: string;
  approvedReviewId: string;
  nextWorkflowId: string | null;
  nextWorkflowPath: string | null;
  chainStage: string | null;
  checkedAt: string;
  snapshot: ProjectSnapshot;
};

export type ProjectSnapshot = {
  projects: Project[];
  taskColumns: TaskColumn[];
  reviews: ReviewItem[];
  artifacts: string[];
  canvasOutputs?: CanvasOutputRecord[];
  canvasRunLedger?: CanvasRunLedger;
  canvasStatus: CanvasStatus;
  workflowRegistry: WorkflowRegistry;
  pipelineRunRegistry?: PipelineRunRegistry;
  releaseRegistry?: ReleaseRegistry;
  capabilityPacks: CapabilityPack[];
};
