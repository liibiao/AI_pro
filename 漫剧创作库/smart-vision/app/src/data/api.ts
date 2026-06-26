import { projectSnapshot } from './loadSnapshot';
import type { ArtifactPreview, CanvasOutputRegisterInput, CanvasOutputRegisterResult, CanvasOutputRetryResult, CanvasRunSessionResult, CompiledWorkflowDraft, CreativeStartInput, CreativeStartResult, PipelineRunRegistry, PipelineRunRepairResult, PipelineRunResult, PipelineRunSmokeResult, ProjectSnapshot, ReleasePublishQueueRequeueResult, ReleasePublishQueueRunResult, ReleasePublishQueueSmokeResult, ReleaseRegistryResult, ReleaseRepairResult, ReleaseStatus, SmartVisionRuntimeSmokeResult, SmartVisionTaskPlan, TaskContextPack, TaskPlanPersistResult, WorkflowChainAction, WorkflowChainActionResult, WorkflowChainReplayResult, WorkflowChainRuntime, WorkflowDraft, WorkflowPreflightResponse, WorkflowQueueRunResult, WorkflowRunnerArchiveBucket, WorkflowRunnerArchiveRestoreResult, WorkflowRunnerCompactionResult, WorkflowRunnerRunDetail, WorkflowRunnerRetryResult, WorkflowRunnerStatus, WorkflowRuntimeDiagnostics, WorkflowRuntimeRepairResult, WorkflowSaveResult, WorkflowSelfTestResult, WorkflowTaskQueueRequeueResult, WorkflowTaskQueueRunResult, WorkflowTaskQueueStressResult } from '../types';

const SNAPSHOT_ENDPOINT = '/api/smart-vision/snapshot';
const REVIEW_STATUS_ENDPOINT = '/api/smart-vision/reviews/status';
const TASK_STATUS_ENDPOINT = '/api/smart-vision/tasks/status';
const WORKFLOW_STATUS_ENDPOINT = '/api/smart-vision/workflows/status';
const WORKFLOW_OUTPUT_ENDPOINT = '/api/smart-vision/workflows/outputs';
const WORKFLOW_CANVAS_OUTPUT_ENDPOINT = '/api/smart-vision/workflows/canvas-output';
const WORKFLOW_CANVAS_OUTPUT_RETRY_ENDPOINT = '/api/smart-vision/workflows/canvas-output/retry';
const WORKFLOW_CANVAS_RUN_SESSION_START_ENDPOINT = '/api/smart-vision/workflows/canvas-run-sessions/start';
const WORKFLOW_CANVAS_RUN_SESSION_STATUS_ENDPOINT = '/api/smart-vision/workflows/canvas-run-sessions/status';
const WORKFLOW_CHAIN_ENDPOINT = '/api/smart-vision/workflows/chains';
const WORKFLOW_CHAIN_ACTION_ENDPOINT = '/api/smart-vision/workflows/chains/action';
const WORKFLOW_RUNTIME_DIAGNOSTICS_ENDPOINT = '/api/smart-vision/workflows/runtime/diagnostics';
const WORKFLOW_RUNTIME_REPAIR_ENDPOINT = '/api/smart-vision/workflows/runtime/repair';
const SMART_VISION_RUNTIME_SMOKE_ENDPOINT = '/api/smart-vision/runtime/smoke';
const WORKFLOW_RUNNER_STATUS_ENDPOINT = '/api/smart-vision/workflows/runner/status';
const WORKFLOW_RUNNER_RUNS_ENDPOINT = '/api/smart-vision/workflows/runner/runs';
const WORKFLOW_RUNNER_RETRY_ENDPOINT = '/api/smart-vision/workflows/runner/retry';
const WORKFLOW_RUNNER_COMPACT_ENDPOINT = '/api/smart-vision/workflows/runner/compact';
const WORKFLOW_RUNNER_ARCHIVE_RESTORE_ENDPOINT = '/api/smart-vision/workflows/runner/archive/restore';
const WORKFLOW_CHAIN_REPLAY_ENDPOINT = '/api/smart-vision/workflows/chains/replay';
const WORKFLOW_QUEUE_RUN_ENDPOINT = '/api/smart-vision/workflows/queue/run';
const WORKFLOW_TASK_QUEUE_RUN_ENDPOINT = '/api/smart-vision/workflows/tasks/queue/run';
const WORKFLOW_TASK_QUEUE_REQUEUE_ENDPOINT = '/api/smart-vision/workflows/tasks/queue/requeue';
const WORKFLOW_TASK_QUEUE_STRESS_ENDPOINT = '/api/smart-vision/workflows/tasks/queue/stress';
const WORKFLOW_ARCHIVE_ENDPOINT = '/api/smart-vision/workflows/archive';
const WORKFLOW_RESTORE_ENDPOINT = '/api/smart-vision/workflows/restore';
const ARTIFACT_READ_ENDPOINT = '/api/smart-vision/artifacts/read';
const CONTEXT_PACK_ENDPOINT = '/api/smart-vision/context-pack';
const WORKFLOW_DRAFT_ENDPOINT = '/api/smart-vision/workflow-draft';
const WORKFLOW_DRAFT_PREFLIGHT_ENDPOINT = '/api/smart-vision/workflow-draft/preflight';
const WORKFLOW_TASK_PLAN_ENDPOINT = '/api/smart-vision/workflows/tasks/plan';
const WORKFLOW_TASK_PERSIST_ENDPOINT = '/api/smart-vision/workflows/tasks/persist';
const WORKFLOW_TASK_COMPILE_ENDPOINT = '/api/smart-vision/workflows/tasks/compile';
const WORKFLOW_DRAFT_SAVE_ENDPOINT = '/api/smart-vision/workflow-draft/save';
const WORKFLOW_SELF_TEST_ENDPOINT = '/api/smart-vision/workflows/self-test';
const CREATIVE_START_ENDPOINT = '/api/smart-vision/creative/start';
const PIPELINE_RUNS_ENDPOINT = '/api/smart-vision/pipeline/runs';
const PIPELINE_RUN_CREATE_ENDPOINT = '/api/smart-vision/pipeline/runs/create';
const PIPELINE_RUN_ADVANCE_ENDPOINT = '/api/smart-vision/pipeline/runs/advance';
const PIPELINE_RUN_REPAIR_ENDPOINT = '/api/smart-vision/pipeline/runs/repair';
const PIPELINE_RUN_SMOKE_ENDPOINT = '/api/smart-vision/pipeline/runs/smoke';
const RELEASE_REGISTRY_ENDPOINT = '/api/smart-vision/releases';
const RELEASE_CREATE_ENDPOINT = '/api/smart-vision/releases/create';
const RELEASE_STATUS_ENDPOINT = '/api/smart-vision/releases/status';
const RELEASE_REPAIR_ENDPOINT = '/api/smart-vision/releases/repair';
const RELEASE_PUBLISH_QUEUE_RUN_ENDPOINT = '/api/smart-vision/releases/publish-queue/run';
const RELEASE_PUBLISH_QUEUE_REQUEUE_ENDPOINT = '/api/smart-vision/releases/publish-queue/requeue';
const RELEASE_PUBLISH_QUEUE_SMOKE_ENDPOINT = '/api/smart-vision/releases/publish-queue/smoke';

function normalizeSnapshot(snapshot: ProjectSnapshot): ProjectSnapshot {
  const fallbackCanvasUrl = snapshot.canvasStatus?.url ?? 'http://127.0.0.1:8877/image-studio-canvas.html';

  return {
    ...snapshot,
    projects: snapshot.projects ?? [],
    taskColumns: snapshot.taskColumns ?? [],
    reviews: snapshot.reviews ?? [],
    artifacts: snapshot.artifacts ?? [],
    canvasOutputs: snapshot.canvasOutputs ?? [],
    canvasRunLedger: snapshot.canvasRunLedger ?? {
      version: '0.1.0',
      projectId: 'infinite-awakening-001',
      sessions: [],
      events: [],
      updatedAt: null
    },
    canvasStatus: snapshot.canvasStatus ?? {
      url: fallbackCanvasUrl,
      bridgeBase: 'http://127.0.0.1:5188',
      health: 'unknown',
      modelCount: 0,
      hasVideoModels: false,
      note: '未读取到画布状态，已使用前端兜底配置。',
      workbench: {
        origin: 'http://127.0.0.1:8877',
        health: 'unknown',
        healthOk: false,
        readEndpointReady: false,
        bridgeBaseRewrite: 'unknown'
      }
    },
    workflowRegistry: snapshot.workflowRegistry ?? {
      canvasUrl: fallbackCanvasUrl,
      bridgeBase: 'http://127.0.0.1:5188',
      workflows: [],
      note: '当前快照未包含 Workflow 注册表，已使用前端兼容兜底。'
    },
    pipelineRunRegistry: snapshot.pipelineRunRegistry ?? {
      version: '0.1.0',
      projectId: 'infinite-awakening-001',
      runs: [],
      events: [],
      updatedAt: null
    },
    releaseRegistry: snapshot.releaseRegistry ?? {
      version: '0.1.0',
      projectId: 'infinite-awakening-001',
      releases: [],
      archiveHistory: [],
      note: '当前快照未包含发布包注册表，已使用前端兼容兜底。'
    },
    capabilityPacks: snapshot.capabilityPacks ?? []
  };
}

async function postStatus(endpoint: string, body: Record<string, string>): Promise<ProjectSnapshot> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: { snapshot?: ProjectSnapshot } };

  if (!payload.ok || !payload.data?.snapshot) {
    throw new Error('Invalid bridge response');
  }

  return normalizeSnapshot(payload.data.snapshot);
}

export async function updateReviewStatus(reviewId: string, status: string): Promise<ProjectSnapshot> {
  return postStatus(REVIEW_STATUS_ENDPOINT, { reviewId, status });
}

export async function updateTaskStatus(taskId: string, status: string): Promise<ProjectSnapshot> {
  return postStatus(TASK_STATUS_ENDPOINT, { taskId, status });
}

export async function updateWorkflowStatus(workflowId: string, status: string): Promise<ProjectSnapshot> {
  return postStatus(WORKFLOW_STATUS_ENDPOINT, { workflowId, status });
}

export async function addWorkflowOutput(workflowId: string, artifactPath: string, resetBlocked = false): Promise<ProjectSnapshot> {
  return postStatus(WORKFLOW_OUTPUT_ENDPOINT, { workflowId, artifactPath, resetBlocked: String(resetBlocked) });
}

export async function registerCanvasWorkflowOutput(input: CanvasOutputRegisterInput = {}): Promise<CanvasOutputRegisterResult> {
  const response = await fetch(WORKFLOW_CANVAS_OUTPUT_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: CanvasOutputRegisterResult; error?: string };

  if (!payload.ok || !payload.data?.status) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return {
    ...payload.data,
    snapshot: payload.data.snapshot ? normalizeSnapshot(payload.data.snapshot) : undefined
  };
}

function normalizeCanvasRunSessionResult(result: CanvasRunSessionResult): CanvasRunSessionResult {
  return {
    ...result,
    ledger: result.ledger ?? {
      version: '0.1.0',
      projectId: 'infinite-awakening-001',
      sessions: result.session ? [result.session] : [],
      events: [],
      updatedAt: null
    },
    snapshot: result.snapshot ? normalizeSnapshot(result.snapshot) : normalizeSnapshot(projectSnapshot)
  };
}

export async function startCanvasRunSession(input: { workflowId?: string; workflowPath?: string; pipelineRunId?: string | null; stageId?: string | null; outputArtifactHint?: string; artifactPath?: string; outputArtifactHints?: string[]; importUrl?: string; editUrl?: string; runUrl?: string; note?: string; dryRun?: boolean } = {}): Promise<CanvasRunSessionResult> {
  const response = await fetch(WORKFLOW_CANVAS_RUN_SESSION_START_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: CanvasRunSessionResult; error?: string };

  if (!payload.ok || !payload.data?.session) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return normalizeCanvasRunSessionResult(payload.data);
}

export async function updateCanvasRunSessionStatus(input: { sessionId: string; status: string; note?: string }): Promise<CanvasRunSessionResult> {
  const response = await fetch(WORKFLOW_CANVAS_RUN_SESSION_STATUS_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: CanvasRunSessionResult; error?: string };

  if (!payload.ok || !payload.data?.session) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return normalizeCanvasRunSessionResult(payload.data);
}

export async function retryCanvasWorkflowOutput(input: { idempotencyKey?: string; artifactPath?: string; workflowId?: string; nodeId?: string; localPath?: string; dryRun?: boolean; resetBlocked?: boolean } = {}): Promise<CanvasOutputRetryResult> {
  const response = await fetch(WORKFLOW_CANVAS_OUTPUT_RETRY_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: CanvasOutputRetryResult; error?: string };

  if (!payload.ok || !payload.data?.status) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return {
    ...payload.data,
    snapshot: payload.data.snapshot ? normalizeSnapshot(payload.data.snapshot) : undefined
  };
}

export async function fetchWorkflowChainRuntime(workflowId?: string): Promise<WorkflowChainRuntime> {
  const query = workflowId ? `?workflowId=${encodeURIComponent(workflowId)}` : '';
  const response = await fetch(`${WORKFLOW_CHAIN_ENDPOINT}${query}`, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: WorkflowChainRuntime; error?: string };

  if (!payload.ok || !payload.data?.snapshot) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return {
    ...payload.data,
    snapshot: normalizeSnapshot(payload.data.snapshot)
  };
}

export async function executeWorkflowChainAction(input: {
  workflowId: string;
  action?: WorkflowChainAction;
  artifactPath?: string;
  status?: string;
}): Promise<WorkflowChainActionResult> {
  const response = await fetch(WORKFLOW_CHAIN_ACTION_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: WorkflowChainActionResult; error?: string };

  if (!payload.ok || !payload.data?.snapshot) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return {
    ...payload.data,
    snapshot: normalizeSnapshot(payload.data.snapshot),
    runtime: {
      ...payload.data.runtime,
      snapshot: normalizeSnapshot(payload.data.runtime.snapshot)
    }
  };
}

export async function fetchWorkflowRuntimeDiagnostics(): Promise<WorkflowRuntimeDiagnostics> {
  const response = await fetch(WORKFLOW_RUNTIME_DIAGNOSTICS_ENDPOINT, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: WorkflowRuntimeDiagnostics; error?: string };

  if (!payload.ok || !payload.data?.snapshot) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return {
    ...payload.data,
    snapshot: normalizeSnapshot(payload.data.snapshot)
  };
}

export async function repairWorkflowRuntimeState(input: { dryRun?: boolean } = {}): Promise<WorkflowRuntimeRepairResult> {
  const response = await fetch(WORKFLOW_RUNTIME_REPAIR_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: WorkflowRuntimeRepairResult; error?: string };

  if (!payload.ok || !payload.data?.snapshot) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return {
    ...payload.data,
    snapshot: normalizeSnapshot(payload.data.snapshot),
    diagnostics: {
      ...payload.data.diagnostics,
      snapshot: normalizeSnapshot(payload.data.diagnostics.snapshot)
    }
  };
}

export async function runSmartVisionRuntimeSmoke(input: { taskType?: string; releaseId?: string | null } = {}): Promise<SmartVisionRuntimeSmokeResult> {
  const response = await fetch(SMART_VISION_RUNTIME_SMOKE_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: SmartVisionRuntimeSmokeResult; error?: string };

  if (!payload.ok || !payload.data?.snapshot) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return {
    ...payload.data,
    snapshot: normalizeSnapshot(payload.data.snapshot),
    runner: {
      ...payload.data.runner,
      snapshot: normalizeSnapshot(payload.data.runner.snapshot),
      diagnostics: {
        ...payload.data.runner.diagnostics,
        snapshot: normalizeSnapshot(payload.data.runner.diagnostics.snapshot)
      }
    }
  };
}

export async function fetchWorkflowRunnerStatus(): Promise<WorkflowRunnerStatus> {
  const response = await fetch(WORKFLOW_RUNNER_STATUS_ENDPOINT, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: WorkflowRunnerStatus; error?: string };

  if (!payload.ok || !payload.data?.snapshot) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return {
    ...payload.data,
    snapshot: normalizeSnapshot(payload.data.snapshot),
    diagnostics: {
      ...payload.data.diagnostics,
      snapshot: normalizeSnapshot(payload.data.diagnostics.snapshot)
    }
  };
}

export async function fetchWorkflowRunnerRun(runId: string): Promise<WorkflowRunnerRunDetail> {
  const response = await fetch(`${WORKFLOW_RUNNER_RUNS_ENDPOINT}?runId=${encodeURIComponent(runId)}`, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: WorkflowRunnerRunDetail; error?: string };

  if (!payload.ok || !payload.data?.snapshot) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return {
    ...payload.data,
    snapshot: normalizeSnapshot(payload.data.snapshot),
    runner: {
      ...payload.data.runner,
      snapshot: normalizeSnapshot(payload.data.runner.snapshot),
      diagnostics: {
        ...payload.data.runner.diagnostics,
        snapshot: normalizeSnapshot(payload.data.runner.diagnostics.snapshot)
      }
    }
  };
}

export async function retryWorkflowRunnerFailures(input: {
  runId: string;
  artifactPathByWorkflowId?: Record<string, string>;
}): Promise<WorkflowRunnerRetryResult> {
  const response = await fetch(WORKFLOW_RUNNER_RETRY_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: WorkflowRunnerRetryResult; error?: string };

  if (!payload.ok || !payload.data?.snapshot) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return {
    ...payload.data,
    snapshot: normalizeSnapshot(payload.data.snapshot)
  };
}

export async function compactWorkflowRunnerLedger(input: {
  keepCompletedTaskItems?: number;
  keepPublishedReleaseItems?: number;
  keepRuns?: number;
  keepEvents?: number;
  dryRun?: boolean;
} = {}): Promise<WorkflowRunnerCompactionResult> {
  const response = await fetch(WORKFLOW_RUNNER_COMPACT_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: WorkflowRunnerCompactionResult; error?: string };

  if (!payload.ok || !payload.data?.snapshot) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return {
    ...payload.data,
    snapshot: normalizeSnapshot(payload.data.snapshot),
    runner: {
      ...payload.data.runner,
      snapshot: normalizeSnapshot(payload.data.runner.snapshot),
      diagnostics: {
        ...payload.data.runner.diagnostics,
        snapshot: normalizeSnapshot(payload.data.runner.diagnostics.snapshot)
      }
    }
  };
}

export async function restoreWorkflowRunnerArchiveItem(input: {
  bucket: WorkflowRunnerArchiveBucket;
  itemId?: string;
  itemIds?: string[];
  restoreAll?: boolean;
}): Promise<WorkflowRunnerArchiveRestoreResult> {
  const response = await fetch(WORKFLOW_RUNNER_ARCHIVE_RESTORE_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: WorkflowRunnerArchiveRestoreResult; error?: string };

  if (!payload.ok || !payload.data?.snapshot) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return {
    ...payload.data,
    snapshot: normalizeSnapshot(payload.data.snapshot),
    runner: {
      ...payload.data.runner,
      snapshot: normalizeSnapshot(payload.data.runner.snapshot),
      diagnostics: {
        ...payload.data.runner.diagnostics,
        snapshot: normalizeSnapshot(payload.data.runner.diagnostics.snapshot)
      }
    }
  };
}

export async function replayWorkflowChain(input: {
  workflowId: string;
  action?: WorkflowChainAction;
  artifactPath?: string;
  status?: string;
}): Promise<WorkflowChainReplayResult> {
  const response = await fetch(WORKFLOW_CHAIN_REPLAY_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: WorkflowChainReplayResult; error?: string };

  if (!payload.ok || !payload.data?.snapshot) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return {
    ...payload.data,
    snapshot: normalizeSnapshot(payload.data.snapshot)
  };
}

export async function runWorkflowQueue(input: {
  limit?: number;
  artifactPathByWorkflowId?: Record<string, string>;
} = {}): Promise<WorkflowQueueRunResult> {
  const response = await fetch(WORKFLOW_QUEUE_RUN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: WorkflowQueueRunResult; error?: string };

  if (!payload.ok || !payload.data?.snapshot) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return {
    ...payload.data,
    snapshot: normalizeSnapshot(payload.data.snapshot)
  };
}

export async function runWorkflowTaskQueue(input: {
  limit?: number;
  taskPlanId?: string | null;
  taskQueueId?: string | null;
  strictInputs?: boolean;
} = {}): Promise<WorkflowTaskQueueRunResult> {
  const response = await fetch(WORKFLOW_TASK_QUEUE_RUN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: WorkflowTaskQueueRunResult; error?: string };

  if (!payload.ok || !payload.data?.snapshot) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return {
    ...payload.data,
    snapshot: normalizeSnapshot(payload.data.snapshot),
    runner: {
      ...payload.data.runner,
      snapshot: normalizeSnapshot(payload.data.runner.snapshot),
      diagnostics: {
        ...payload.data.runner.diagnostics,
        snapshot: normalizeSnapshot(payload.data.runner.diagnostics.snapshot)
      }
    }
  };
}

export async function requeueWorkflowTaskQueueItem(input: {
  taskQueueId?: string | null;
  progressItemId?: string | null;
  taskPlanId?: string | null;
  subtaskId?: string | null;
  resetDependents?: boolean;
  reason?: string;
} = {}): Promise<WorkflowTaskQueueRequeueResult> {
  const response = await fetch(WORKFLOW_TASK_QUEUE_REQUEUE_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: WorkflowTaskQueueRequeueResult; error?: string };

  if (!payload.ok || !payload.data?.snapshot) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return {
    ...payload.data,
    snapshot: normalizeSnapshot(payload.data.snapshot),
    runner: {
      ...payload.data.runner,
      snapshot: normalizeSnapshot(payload.data.runner.snapshot),
      diagnostics: {
        ...payload.data.runner.diagnostics,
        snapshot: normalizeSnapshot(payload.data.runner.diagnostics.snapshot)
      }
    }
  };
}

export async function runWorkflowTaskQueueStress(input: {
  taskTypes?: string[];
  copies?: number;
} = {}): Promise<WorkflowTaskQueueStressResult> {
  const response = await fetch(WORKFLOW_TASK_QUEUE_STRESS_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: WorkflowTaskQueueStressResult; error?: string };

  if (!payload.ok || !payload.data?.snapshot) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return {
    ...payload.data,
    snapshot: normalizeSnapshot(payload.data.snapshot),
    runner: {
      ...payload.data.runner,
      snapshot: normalizeSnapshot(payload.data.runner.snapshot),
      diagnostics: {
        ...payload.data.runner.diagnostics,
        snapshot: normalizeSnapshot(payload.data.runner.diagnostics.snapshot)
      }
    }
  };
}

export async function runWorkflowSelfTest(taskType: string): Promise<WorkflowSelfTestResult> {
  const response = await fetch(WORKFLOW_SELF_TEST_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ taskType })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: WorkflowSelfTestResult; error?: string };

  if (!payload.ok || !payload.data?.snapshot) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return {
    ...payload.data,
    snapshot: normalizeSnapshot(payload.data.snapshot)
  };
}

function normalizePipelineRunResult(result: PipelineRunResult): PipelineRunResult {
  return {
    ...result,
    snapshot: normalizeSnapshot(result.snapshot)
  };
}

export async function fetchPipelineRuns(): Promise<{ registry: PipelineRunRegistry; snapshot: ProjectSnapshot }> {
  const response = await fetch(PIPELINE_RUNS_ENDPOINT, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: { registry: PipelineRunRegistry; snapshot: ProjectSnapshot }; error?: string };

  if (!payload.ok || !payload.data?.snapshot) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return {
    ...payload.data,
    snapshot: normalizeSnapshot(payload.data.snapshot)
  };
}

export async function startCreativeProduction(input: CreativeStartInput): Promise<CreativeStartResult> {
  const response = await fetch(CREATIVE_START_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: CreativeStartResult; error?: string };

  if (!payload.ok || !payload.data?.snapshot) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return {
    ...payload.data,
    pipelineRun: payload.data.pipelineRun ? normalizePipelineRunResult(payload.data.pipelineRun) : payload.data.pipelineRun,
    snapshot: normalizeSnapshot(payload.data.snapshot)
  };
}

export async function createPipelineRun(input: { episodeId?: string; dryRun?: boolean; prepareFirstStage?: boolean } = {}): Promise<PipelineRunResult> {
  const response = await fetch(PIPELINE_RUN_CREATE_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: PipelineRunResult; error?: string };

  if (!payload.ok || !payload.data?.snapshot) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return normalizePipelineRunResult(payload.data);
}

export async function advancePipelineRun(input: { runId?: string; stageId?: string; dryRun?: boolean } = {}): Promise<PipelineRunResult> {
  const response = await fetch(PIPELINE_RUN_ADVANCE_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: PipelineRunResult; error?: string };

  if (!payload.ok || !payload.data?.snapshot) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return normalizePipelineRunResult(payload.data);
}

export async function repairPipelineRun(input: { runId?: string; stageId?: string; dryRun?: boolean; rebuildMissingWorkflow?: boolean } = {}): Promise<PipelineRunRepairResult> {
  const response = await fetch(PIPELINE_RUN_REPAIR_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: PipelineRunRepairResult; error?: string };

  if (!payload.ok || !payload.data?.snapshot) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return {
    ...payload.data,
    snapshot: normalizeSnapshot(payload.data.snapshot)
  };
}

export async function runPipelineRunSmoke(input: { episodeId?: string; releaseId?: string | null } = {}): Promise<PipelineRunSmokeResult> {
  const response = await fetch(PIPELINE_RUN_SMOKE_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: PipelineRunSmokeResult; error?: string };

  if (!payload.ok || !payload.data?.snapshot) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return {
    ...payload.data,
    snapshot: normalizeSnapshot(payload.data.snapshot)
  };
}

export async function archiveWorkflow(workflowId: string): Promise<ProjectSnapshot> {
  return postStatus(WORKFLOW_ARCHIVE_ENDPOINT, { workflowId });
}

export async function restoreWorkflow(workflowId: string): Promise<ProjectSnapshot> {
  return postStatus(WORKFLOW_RESTORE_ENDPOINT, { workflowId });
}

function normalizeReleaseRegistryResult(result: ReleaseRegistryResult): ReleaseRegistryResult {
  return {
    ...result,
    snapshot: normalizeSnapshot(result.snapshot)
  };
}

export async function fetchReleaseRegistry(): Promise<ReleaseRegistryResult> {
  const response = await fetch(RELEASE_REGISTRY_ENDPOINT, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: ReleaseRegistryResult; error?: string };

  if (!payload.ok || !payload.data?.snapshot) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return normalizeReleaseRegistryResult(payload.data);
}

export async function createReleasePackage(input: { episodeId?: string; title?: string; artifactPaths?: string[]; sourceWorkflowIds?: string[]; status?: ReleaseStatus } = {}): Promise<ReleaseRegistryResult> {
  const response = await fetch(RELEASE_CREATE_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: ReleaseRegistryResult; error?: string };

  if (!payload.ok || !payload.data?.snapshot) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return normalizeReleaseRegistryResult(payload.data);
}

export async function updateReleasePackageStatus(input: { releaseId: string; status: ReleaseStatus; note?: string }): Promise<ReleaseRegistryResult> {
  const response = await fetch(RELEASE_STATUS_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: ReleaseRegistryResult; error?: string };

  if (!payload.ok || !payload.data?.snapshot) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return normalizeReleaseRegistryResult(payload.data);
}

export async function repairReleasePackage(input: { releaseId: string }): Promise<ReleaseRepairResult> {
  const response = await fetch(RELEASE_REPAIR_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: ReleaseRepairResult; error?: string };

  if (!payload.ok || !payload.data?.snapshot) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return {
    ...payload.data,
    snapshot: normalizeSnapshot(payload.data.snapshot),
    diagnostics: {
      ...payload.data.diagnostics,
      snapshot: normalizeSnapshot(payload.data.diagnostics.snapshot)
    }
  };
}

export async function runReleasePublishQueue(input: { limit?: number; releaseId?: string | null; dryRun?: boolean } = {}): Promise<ReleasePublishQueueRunResult> {
  const response = await fetch(RELEASE_PUBLISH_QUEUE_RUN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: ReleasePublishQueueRunResult; error?: string };

  if (!payload.ok || !payload.data?.snapshot) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return {
    ...payload.data,
    snapshot: normalizeSnapshot(payload.data.snapshot),
    runner: {
      ...payload.data.runner,
      snapshot: normalizeSnapshot(payload.data.runner.snapshot),
      diagnostics: {
        ...payload.data.runner.diagnostics,
        snapshot: normalizeSnapshot(payload.data.runner.diagnostics.snapshot)
      }
    }
  };
}

export async function requeueReleasePublishFailures(input: { releaseId?: string | null; reason?: string } = {}): Promise<ReleasePublishQueueRequeueResult> {
  const response = await fetch(RELEASE_PUBLISH_QUEUE_REQUEUE_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: ReleasePublishQueueRequeueResult; error?: string };

  if (!payload.ok || !payload.data?.snapshot) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return {
    ...payload.data,
    snapshot: normalizeSnapshot(payload.data.snapshot),
    runner: {
      ...payload.data.runner,
      snapshot: normalizeSnapshot(payload.data.runner.snapshot),
      diagnostics: {
        ...payload.data.runner.diagnostics,
        snapshot: normalizeSnapshot(payload.data.runner.diagnostics.snapshot)
      }
    }
  };
}

export async function runReleasePublishQueueSmoke(input: { releaseId?: string | null } = {}): Promise<ReleasePublishQueueSmokeResult> {
  const response = await fetch(RELEASE_PUBLISH_QUEUE_SMOKE_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: ReleasePublishQueueSmokeResult; error?: string };

  if (!payload.ok || !payload.data?.snapshot) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return {
    ...payload.data,
    snapshot: normalizeSnapshot(payload.data.snapshot),
    runner: {
      ...payload.data.runner,
      snapshot: normalizeSnapshot(payload.data.runner.snapshot),
      diagnostics: {
        ...payload.data.runner.diagnostics,
        snapshot: normalizeSnapshot(payload.data.runner.diagnostics.snapshot)
      }
    }
  };
}

export async function fetchArtifactPreview(path: string): Promise<ArtifactPreview> {
  const response = await fetch(`${ARTIFACT_READ_ENDPOINT}?path=${encodeURIComponent(path)}`, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: ArtifactPreview; error?: string };

  if (!payload.ok || !payload.data) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return payload.data;
}

export async function fetchTaskContextPack(taskType: string): Promise<TaskContextPack> {
  const response = await fetch(`${CONTEXT_PACK_ENDPOINT}?taskType=${encodeURIComponent(taskType)}`, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: TaskContextPack; error?: string };

  if (!payload.ok || !payload.data) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return payload.data;
}

export async function fetchWorkflowDraft(taskType: string): Promise<WorkflowDraft> {
  const response = await fetch(`${WORKFLOW_DRAFT_ENDPOINT}?taskType=${encodeURIComponent(taskType)}`, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: WorkflowDraft; error?: string };

  if (!payload.ok || !payload.data) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return payload.data;
}

export async function createWorkflowTaskPlan(input: Partial<SmartVisionTaskPlan> & { taskType?: string } = {}): Promise<SmartVisionTaskPlan> {
  const response = await fetch(WORKFLOW_TASK_PLAN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: SmartVisionTaskPlan; error?: string };

  if (!payload.ok || !payload.data) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return payload.data;
}

export async function persistWorkflowTaskPlan(input: Partial<SmartVisionTaskPlan> & { taskType?: string; taskPlan?: SmartVisionTaskPlan } = {}): Promise<TaskPlanPersistResult> {
  const response = await fetch(WORKFLOW_TASK_PERSIST_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: TaskPlanPersistResult; error?: string };

  if (!payload.ok || !payload.data?.snapshot) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return {
    ...payload.data,
    snapshot: normalizeSnapshot(payload.data.snapshot),
    runner: {
      ...payload.data.runner,
      snapshot: normalizeSnapshot(payload.data.runner.snapshot),
      diagnostics: {
        ...payload.data.runner.diagnostics,
        snapshot: normalizeSnapshot(payload.data.runner.diagnostics.snapshot)
      }
    }
  };
}

export async function compileWorkflowTask(input: Partial<SmartVisionTaskPlan> & { taskType?: string; taskPlan?: SmartVisionTaskPlan } = {}): Promise<CompiledWorkflowDraft> {
  const response = await fetch(WORKFLOW_TASK_COMPILE_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: CompiledWorkflowDraft; error?: string };

  if (!payload.ok || !payload.data?.workflowDraft || !payload.data?.taskPlan) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return payload.data;
}

export async function preflightWorkflowDraft(input: { taskType?: string; taskPlan?: SmartVisionTaskPlan; workflowDraft?: WorkflowDraft; workflowId?: string; workflowPath?: string; requireFile?: boolean } = {}): Promise<WorkflowPreflightResponse> {
  const response = await fetch(WORKFLOW_DRAFT_PREFLIGHT_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: WorkflowPreflightResponse; error?: string };

  if (!payload.ok || !payload.data?.preflight || !payload.data?.workflowDraft) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return payload.data;
}

export async function saveWorkflowDraft(taskType: string, workflowDraft?: WorkflowDraft): Promise<WorkflowSaveResult> {
  const response = await fetch(WORKFLOW_DRAFT_SAVE_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ taskType, workflowDraft })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: WorkflowSaveResult; error?: string };

  if (!payload.ok || !payload.data?.snapshot || !payload.data?.workflowDraft) {
    throw new Error(payload.error ?? 'Invalid bridge response');
  }

  return {
    ...payload.data,
    snapshot: normalizeSnapshot(payload.data.snapshot)
  };
}

export async function fetchProjectSnapshot(): Promise<ProjectSnapshot> {
  try {
    const response = await fetch(SNAPSHOT_ENDPOINT, { cache: 'no-store' });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json() as { ok?: boolean; data?: ProjectSnapshot };

    if (!payload.ok || !payload.data) {
      throw new Error('Invalid bridge response');
    }

    return normalizeSnapshot(payload.data);
  } catch (error) {
    console.warn('Smart Vision bridge unavailable, fallback to bundled snapshot.', error);
    return normalizeSnapshot(projectSnapshot);
  }
}
