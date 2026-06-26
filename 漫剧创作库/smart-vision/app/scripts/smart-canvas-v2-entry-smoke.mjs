import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, '..');

const LONG_SCRIPT = `# 第 3 话：觉醒

林天在林家练武场被林傲天踩在尘土里，体内无限强化系统突然绑定。
系统检测力量 41 点，新手礼包可提升 300 点力量。林天在绝望里激活系统，
气浪震开林傲天，碎石悬浮，地面龟裂。林天从低位缓慢站起，眼瞳泛出金光，
从被羞辱的失败者变成压迫全场的觉醒者。他冷笑着抬头，对林傲天说：
刚才踩得挺爽？现在，换你跪下。

情绪线：绝望 -> 混乱 -> 希望 -> 爆发。
视觉风格：电影感国漫短剧，冷灰练武场，金色系统 HUD，强对比，体积光，碎石气浪。`;

function parseArgs(argv) {
  const args = { baseUrl: '', port: 0, strict: false, json: false };
  for (const arg of argv) {
    if (arg === '--strict') args.strict = true;
    if (arg === '--json') args.json = true;
    if (arg.startsWith('--base-url=')) args.baseUrl = arg.slice('--base-url='.length).replace(/\/+$/, '');
    if (arg.startsWith('--port=')) args.port = Number(arg.slice('--port='.length));
  }
  return args;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(() => port ? resolve(port) : reject(new Error('Unable to allocate a local port.')));
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || payload?.message || `Request failed: ${response.status} ${response.statusText}`);
  }
  return payload;
}

async function waitForBridge(baseUrl, childProcess = null) {
  const deadline = Date.now() + 15000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (childProcess?.exitCode !== null) throw new Error(`Bridge exited before ready with code ${childProcess.exitCode}.`);
    try {
      await fetchJson(`${baseUrl}/api/smart-vision/health`);
      return;
    } catch (error) {
      lastError = error;
      await sleep(250);
    }
  }
  throw new Error(`Bridge did not become ready: ${lastError?.message || 'timeout'}`);
}

async function stopBridge(childProcess) {
  if (!childProcess || childProcess.exitCode !== null) return;
  childProcess.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => childProcess.once('exit', resolve)),
    sleep(3000).then(() => {
      if (childProcess.exitCode === null) childProcess.kill('SIGKILL');
    }),
  ]);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function writeSmokeImage(localPath) {
  await mkdir(path.dirname(localPath), { recursive: true });
  const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64');
  await writeFile(localPath, png1x1);
}

async function writeSmokeText(localPath, content) {
  await mkdir(path.dirname(localPath), { recursive: true });
  await writeFile(localPath, content, 'utf8');
}

function findPipelineRun(snapshot, runId) {
  const runs = snapshot?.pipelineRunRegistry?.runs || [];
  return runs.find((run) => run.id === runId) || null;
}

function findWorkflow(snapshot, workflowId) {
  const workflows = snapshot?.workflowRegistry?.workflows || [];
  return workflows.find((workflow) => workflow.id === workflowId) || null;
}

function pickPreflight(payload) {
  return payload?.preflight || payload;
}

function buildSummary({
  baseUrl,
  episodeId,
  activePack,
  importedFiles,
  creative,
  workflow,
  preflight,
  runSession,
  dryRun,
  writeResult,
  reviewResult,
  storyboardWorkflow,
  storyboardPreflight,
  storyboardRunSession,
  storyboardWriteResult,
  storyboardReviewResult,
  videoWorkflow,
  videoPreflight,
  videoRunSession,
  videoDryRun,
  videoWriteResult,
  videoReviewResult,
  editWorkflow,
  editPreflight,
  editRunSession,
  editDryRun,
  editWriteResult,
  editReviewResult,
  qaWorkflow,
  qaPreflight,
  qaRunSession,
  qaDryRun,
  qaWriteResult,
  qaReviewResult,
  releaseWorkflow,
  releasePreflight,
  releaseRunSession,
  releaseDryRun,
  releaseWriteResult,
  releaseReviewResult,
  finalRun,
  diagnostics
}) {
  const assetStage = finalRun?.stages?.find((stage) => stage.id === 'asset_images');
  const storyboardStage = finalRun?.stages?.find((stage) => stage.id === 'storyboard_images');
  const videoStage = finalRun?.stages?.find((stage) => stage.id === 'videos');
  const editStage = finalRun?.stages?.find((stage) => stage.id === 'edit');
  const qaStage = finalRun?.stages?.find((stage) => stage.id === 'qa');
  const releaseStage = finalRun?.stages?.find((stage) => stage.id === 'release');
  const passed = Boolean(
    activePack?.id
    && importedFiles.length
    && creative.status === 'created'
    && workflow?.id
    && preflight.status === 'passed'
    && runSession?.id
    && dryRun.status === 'preview'
    && ['registered', 'idempotent'].includes(writeResult.status)
    && reviewResult.review?.status === 'done'
    && storyboardWorkflow?.id
    && storyboardPreflight?.status === 'passed'
    && storyboardRunSession?.id
    && ['registered', 'idempotent'].includes(storyboardWriteResult?.status)
    && storyboardReviewResult?.review?.status === 'done'
    && storyboardWorkflow.path?.includes(`/${episodeId}/`)
    && assetStage?.status === 'done'
    && storyboardStage?.status === 'done'
    && videoStage?.workflowId
    && videoWorkflow?.path?.includes(`/${episodeId}/`)
    && videoPreflight?.status === 'passed'
    && videoRunSession?.id
    && videoDryRun?.status === 'preview'
    && ['registered', 'idempotent'].includes(videoWriteResult?.status)
    && videoReviewResult?.review?.status === 'done'
    && videoStage?.status === 'done'
    && editStage?.workflowId
    && editWorkflow?.path?.includes(`/${episodeId}/`)
    && editPreflight?.status === 'passed'
    && editRunSession?.id
    && editDryRun?.status === 'preview'
    && ['registered', 'idempotent'].includes(editWriteResult?.status)
    && editReviewResult?.review?.status === 'done'
    && editStage?.status === 'done'
    && qaStage?.workflowId
    && qaWorkflow?.path?.includes(`/${episodeId}/`)
    && qaPreflight?.status === 'passed'
    && qaRunSession?.id
    && qaDryRun?.status === 'preview'
    && ['registered', 'idempotent'].includes(qaWriteResult?.status)
    && qaReviewResult?.review?.status === 'done'
    && qaStage?.status === 'done'
    && releaseStage?.workflowId
    && releaseWorkflow?.path?.includes(`/${episodeId}/`)
    && releasePreflight?.status === 'passed'
    && releaseRunSession?.id
    && releaseDryRun?.status === 'preview'
    && ['registered', 'idempotent'].includes(releaseWriteResult?.status)
    && releaseReviewResult?.review?.status === 'done'
    && releaseStage?.status === 'done'
    && finalRun?.status === 'done'
    && diagnostics.status === 'ready'
  );

  return {
    status: passed ? 'passed' : 'blocked',
    baseUrl,
    episodeId,
    activeDataPack: {
      id: activePack.id,
      title: activePack.title,
      type: activePack.type
    },
    entry: {
      importedFiles,
      creativeStatus: creative.status,
      shotCount: creative.shotCount,
      assetCount: creative.assetCount,
      pipelineRunId: creative.pipelineRun?.run?.id
    },
    assetWorkflow: {
      id: workflow.id,
      path: workflow.path,
      preflight: preflight.status,
      runSessionId: runSession.id,
      artifactPath: writeResult.artifactPath,
      reviewId: reviewResult.review?.id
    },
    storyboardWorkflow: {
      id: storyboardWorkflow?.id || null,
      path: storyboardWorkflow?.path || null,
      preflight: storyboardPreflight?.status || null,
      runSessionId: storyboardRunSession?.id || null,
      artifactPath: storyboardWriteResult?.artifactPath || null,
      reviewId: storyboardReviewResult?.review?.id || null
    },
    videoWorkflow: {
      id: videoWorkflow?.id || null,
      path: videoWorkflow?.path || null,
      preflight: videoPreflight?.status || null,
      runSessionId: videoRunSession?.id || null,
      artifactPath: videoWriteResult?.artifactPath || null,
      reviewId: videoReviewResult?.review?.id || null
    },
    editWorkflow: {
      id: editWorkflow?.id || null,
      path: editWorkflow?.path || null,
      preflight: editPreflight?.status || null,
      runSessionId: editRunSession?.id || null,
      artifactPath: editWriteResult?.artifactPath || null,
      reviewId: editReviewResult?.review?.id || null
    },
    qaWorkflow: {
      id: qaWorkflow?.id || null,
      path: qaWorkflow?.path || null,
      preflight: qaPreflight?.status || null,
      runSessionId: qaRunSession?.id || null,
      artifactPath: qaWriteResult?.artifactPath || null,
      reviewId: qaReviewResult?.review?.id || null
    },
    releaseWorkflow: {
      id: releaseWorkflow?.id || null,
      path: releaseWorkflow?.path || null,
      preflight: releasePreflight?.status || null,
      runSessionId: releaseRunSession?.id || null,
      artifactPath: releaseWriteResult?.artifactPath || null,
      reviewId: releaseReviewResult?.review?.id || null,
      releaseAttach: releaseWriteResult?.releaseAttach || null
    },
    pipeline: {
      status: finalRun?.status,
      currentStageId: finalRun?.currentStageId,
      assetStageStatus: assetStage?.status,
      storyboardStageStatus: storyboardStage?.status,
      storyboardWorkflowId: storyboardStage?.workflowId || null,
      videoStageStatus: videoStage?.status,
      videoWorkflowId: videoStage?.workflowId || null,
      videoWorkflowPath: videoWorkflow?.path || null,
      editStageStatus: editStage?.status,
      editWorkflowId: editStage?.workflowId || null,
      editWorkflowPath: editWorkflow?.path || null,
      qaStageStatus: qaStage?.status,
      qaWorkflowId: qaStage?.workflowId || null,
      qaWorkflowPath: qaWorkflow?.path || null,
      releaseStageStatus: releaseStage?.status,
      releaseWorkflowId: releaseStage?.workflowId || null,
      releaseWorkflowPath: releaseWorkflow?.path || null
    },
    diagnostics: {
      status: diagnostics.status,
      issueCount: diagnostics.counts?.issueCount ?? diagnostics.issues?.length ?? 0
    }
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const port = args.baseUrl ? null : args.port || await getFreePort();
  const baseUrl = args.baseUrl || `http://127.0.0.1:${port}`;
  const stamp = Date.now();
  const episodeId = `ep-v2-entry-${stamp}`;
  const importId = `smart-canvas-v2-entry-${stamp}`;
  const localAssetPath = path.join('/private/tmp', `sv-smart-canvas-v2-entry-asset-${stamp}.png`);
  const localStoryboardPath = path.join('/private/tmp', `sv-smart-canvas-v2-entry-storyboard-${stamp}.png`);
  const localVideoPath = path.resolve(appRoot, '..', 'outputs/03-视频/ep001/pipeline-video-output-smoke.mp4');
  const localEditPath = path.resolve(appRoot, '..', 'outputs/05-可选输出/审核剪辑发布/edit/ep001/pipeline-edit-output-smoke.mp4');
  const localQaPath = path.join('/private/tmp', `sv-smart-canvas-v2-entry-qa-${stamp}.md`);
  const localReleaseManifestPath = path.join('/private/tmp', `sv-smart-canvas-v2-entry-release-manifest-${stamp}.json`);
  let bridge = null;

  try {
    if (!args.baseUrl) {
      bridge = spawn(process.execPath, ['scripts/bridge-server.mjs'], {
        cwd: appRoot,
        env: { ...process.env, SMART_VISION_BRIDGE_PORT: String(port) },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      bridge.stdout.on('data', (chunk) => {
        if (process.env.SMART_VISION_SMOKE_DEBUG) process.stdout.write(chunk);
      });
      bridge.stderr.on('data', (chunk) => process.stderr.write(chunk));
    }

    await waitForBridge(baseUrl, bridge);
    await writeSmokeImage(localAssetPath);
    await writeSmokeImage(localStoryboardPath);
    assert(existsSync(localVideoPath), `Video smoke source missing: ${localVideoPath}`);
    assert(existsSync(localEditPath), `Edit smoke source missing: ${localEditPath}`);

    const packsPayload = await fetchJson(`${baseUrl}/api/smart-vision/data-packs`);
    const packsData = packsPayload.data || packsPayload;
    const activePack = packsData.activeDataPack || null;
    assert(activePack?.id, 'Active data pack is missing.');

    const importPayload = await fetchJson(`${baseUrl}/api/smart-vision/creative/import`, {
      method: 'POST',
      body: JSON.stringify({
        importId,
        files: [
          { fileName: 'episode-script.md', mimeType: 'text/markdown', text: LONG_SCRIPT },
          {
            fileName: 'style-reference.png',
            mimeType: 'image/png',
            dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
          }
        ]
      }),
    });
    const importedFiles = importPayload.data?.artifactPaths || [];
    assert(importedFiles.length === 2, 'creative/import did not materialize both script and image references.');

    const creativePayload = await fetchJson(`${baseUrl}/api/smart-vision/creative/start`, {
      method: 'POST',
      body: JSON.stringify({
        episodeId,
        scriptText: LONG_SCRIPT,
        importedFiles,
        createPipelineRun: true,
        prepareFirstStage: true,
      }),
    });
    const creative = creativePayload.data || creativePayload;
    assert(creative.status === 'created', 'creative/start did not create real entry outputs.');

    const firstStage = creative.pipelineRun?.run?.stages?.find((stage) => stage.id === 'asset_images') || creative.pipelineRun?.run?.stages?.[0];
    assert(firstStage?.workflowId, 'creative/start did not prepare first asset workflow.');
    const workflow = findWorkflow(creative.snapshot, firstStage.workflowId);
    assert(workflow?.path, 'Prepared asset workflow is missing from snapshot.');

    const preflight = pickPreflight((await fetchJson(`${baseUrl}/api/smart-vision/workflow-draft/preflight`, {
      method: 'POST',
      body: JSON.stringify({ workflowId: workflow.id }),
    })).data);
    assert(preflight.status === 'passed', 'Prepared asset workflow preflight failed.');

    const artifactPath = `01-资产图与提示词/资产图/${episodeId}/smart-canvas-v2-entry-asset.png`;
    const runSession = (await fetchJson(`${baseUrl}/api/smart-vision/workflows/canvas-run-sessions/start`, {
      method: 'POST',
      body: JSON.stringify({
        workflowId: workflow.id,
        workflowPath: workflow.path,
        pipelineRunId: creative.pipelineRun.run.id,
        stageId: firstStage.id,
        outputArtifactHint: artifactPath,
        outputArtifactHints: [artifactPath],
        importUrl: workflow.importUrl,
        editUrl: workflow.editUrl,
        runUrl: workflow.runUrl,
        note: 'Smart Canvas v2 entry smoke 会话，不触发真实模型执行。'
      }),
    })).data.session;
    assert(runSession?.id, 'Canvas RUN session was not created.');

    const outputRequest = {
      workflowId: workflow.id,
      workflowPath: workflow.path,
      runSessionId: runSession.id,
      pipelineRunId: creative.pipelineRun.run.id,
      stageId: firstStage.id,
      localPath: localAssetPath,
      artifactPath,
      outputArtifactHint: artifactPath,
      idempotencyKey: `smart-canvas-v2-entry:${episodeId}:asset_images`,
      nodeId: 'smart-canvas-v2-entry-smoke',
      nodeType: 'singleImage',
      mediaType: 'image',
      resetBlocked: true
    };
    const dryRun = (await fetchJson(`${baseUrl}/api/smart-vision/workflows/canvas-output`, {
      method: 'POST',
      body: JSON.stringify({ ...outputRequest, dryRun: true })
    })).data;
    const writeResult = (await fetchJson(`${baseUrl}/api/smart-vision/workflows/canvas-output`, {
      method: 'POST',
      body: JSON.stringify(outputRequest)
    })).data;
    const reviewId = writeResult.reviewId || writeResult.canvasOutputRecord?.reviewId;
    assert(reviewId, 'canvas-output did not create or return a review.');

    const reviewResult = (await fetchJson(`${baseUrl}/api/smart-vision/reviews/status`, {
      method: 'POST',
      body: JSON.stringify({ reviewId, status: 'done' })
    })).data;
    const afterAssetRun = findPipelineRun(reviewResult.snapshot, creative.pipelineRun.run.id);
    assert(afterAssetRun, 'Pipeline run missing after asset review done.');

    const storyboardStage = afterAssetRun.stages?.find((stage) => stage.id === 'storyboard_images');
    assert(storyboardStage?.workflowId, 'Asset review did not unlock storyboard workflow.');
    const storyboardWorkflow = findWorkflow(reviewResult.snapshot, storyboardStage.workflowId);
    assert(storyboardWorkflow?.path, 'Unlocked storyboard workflow is missing from snapshot.');
    assert(storyboardWorkflow.path.includes(`/${episodeId}/`), 'Unlocked storyboard workflow did not preserve current episode path.');

    const storyboardPreflight = pickPreflight((await fetchJson(`${baseUrl}/api/smart-vision/workflow-draft/preflight`, {
      method: 'POST',
      body: JSON.stringify({ workflowId: storyboardWorkflow.id }),
    })).data);
    assert(storyboardPreflight.status === 'passed', 'Unlocked storyboard workflow preflight failed.');

    const storyboardArtifactPath = `01-资产图与提示词/故事板/storyboard/${episodeId}/smart-canvas-v2-entry-storyboard.png`;
    const storyboardRunSession = (await fetchJson(`${baseUrl}/api/smart-vision/workflows/canvas-run-sessions/start`, {
      method: 'POST',
      body: JSON.stringify({
        workflowId: storyboardWorkflow.id,
        workflowPath: storyboardWorkflow.path,
        pipelineRunId: creative.pipelineRun.run.id,
        stageId: storyboardStage.id,
        outputArtifactHint: storyboardArtifactPath,
        outputArtifactHints: [storyboardArtifactPath],
        importUrl: storyboardWorkflow.importUrl,
        editUrl: storyboardWorkflow.editUrl,
        runUrl: storyboardWorkflow.runUrl,
        note: 'Smart Canvas v2 entry smoke 故事板会话，不触发真实模型执行。'
      }),
    })).data.session;
    assert(storyboardRunSession?.id, 'Storyboard Canvas RUN session was not created.');

    const storyboardOutputRequest = {
      workflowId: storyboardWorkflow.id,
      workflowPath: storyboardWorkflow.path,
      runSessionId: storyboardRunSession.id,
      pipelineRunId: creative.pipelineRun.run.id,
      stageId: storyboardStage.id,
      localPath: localStoryboardPath,
      artifactPath: storyboardArtifactPath,
      outputArtifactHint: storyboardArtifactPath,
      idempotencyKey: `smart-canvas-v2-entry:${episodeId}:storyboard_images`,
      nodeId: 'smart-canvas-v2-entry-storyboard-smoke',
      nodeType: 'singleImage',
      mediaType: 'image',
      resetBlocked: true
    };
    const storyboardDryRun = (await fetchJson(`${baseUrl}/api/smart-vision/workflows/canvas-output`, {
      method: 'POST',
      body: JSON.stringify({ ...storyboardOutputRequest, dryRun: true })
    })).data;
    const storyboardWriteResult = (await fetchJson(`${baseUrl}/api/smart-vision/workflows/canvas-output`, {
      method: 'POST',
      body: JSON.stringify(storyboardOutputRequest)
    })).data;
    const storyboardReviewId = storyboardWriteResult.reviewId || storyboardWriteResult.canvasOutputRecord?.reviewId;
    assert(storyboardReviewId, 'storyboard canvas-output did not create or return a review.');

    const storyboardReviewResult = (await fetchJson(`${baseUrl}/api/smart-vision/reviews/status`, {
      method: 'POST',
      body: JSON.stringify({ reviewId: storyboardReviewId, status: 'done' })
    })).data;
    const finalRun = findPipelineRun(storyboardReviewResult.snapshot, creative.pipelineRun.run.id);
    assert(finalRun, 'Pipeline run missing after storyboard review done.');
    const videoStage = finalRun.stages?.find((stage) => stage.id === 'videos');
    assert(videoStage?.workflowId, 'Storyboard review did not unlock video workflow.');
    const videoWorkflow = findWorkflow(storyboardReviewResult.snapshot, videoStage.workflowId);
    assert(videoWorkflow?.path?.includes(`/${episodeId}/`), 'Unlocked video workflow did not preserve current episode path.');

    const videoPreflight = pickPreflight((await fetchJson(`${baseUrl}/api/smart-vision/workflow-draft/preflight`, {
      method: 'POST',
      body: JSON.stringify({ workflowId: videoWorkflow.id }),
    })).data);
    assert(videoPreflight.status === 'passed', 'Unlocked video workflow preflight failed.');

    const videoArtifactPath = `03-视频/${episodeId}/smart-canvas-v2-entry-video.mp4`;
    const videoRunSession = (await fetchJson(`${baseUrl}/api/smart-vision/workflows/canvas-run-sessions/start`, {
      method: 'POST',
      body: JSON.stringify({
        workflowId: videoWorkflow.id,
        workflowPath: videoWorkflow.path,
        pipelineRunId: creative.pipelineRun.run.id,
        stageId: videoStage.id,
        outputArtifactHint: videoArtifactPath,
        outputArtifactHints: [videoArtifactPath],
        importUrl: videoWorkflow.importUrl,
        editUrl: videoWorkflow.editUrl,
        runUrl: videoWorkflow.runUrl,
        note: 'Smart Canvas v2 entry smoke 视频会话，不触发真实模型执行。'
      }),
    })).data.session;
    assert(videoRunSession?.id, 'Video Canvas RUN session was not created.');

    const videoOutputRequest = {
      workflowId: videoWorkflow.id,
      workflowPath: videoWorkflow.path,
      runSessionId: videoRunSession.id,
      pipelineRunId: creative.pipelineRun.run.id,
      stageId: videoStage.id,
      localPath: localVideoPath,
      artifactPath: videoArtifactPath,
      outputArtifactHint: videoArtifactPath,
      idempotencyKey: `smart-canvas-v2-entry:${episodeId}:videos`,
      nodeId: 'smart-canvas-v2-entry-video-smoke',
      nodeType: 'seedanceVideo',
      mediaType: 'video',
      resetBlocked: true
    };
    const videoDryRun = (await fetchJson(`${baseUrl}/api/smart-vision/workflows/canvas-output`, {
      method: 'POST',
      body: JSON.stringify({ ...videoOutputRequest, dryRun: true })
    })).data;
    const videoWriteResult = (await fetchJson(`${baseUrl}/api/smart-vision/workflows/canvas-output`, {
      method: 'POST',
      body: JSON.stringify(videoOutputRequest)
    })).data;
    const videoReviewId = videoWriteResult.reviewId || videoWriteResult.canvasOutputRecord?.reviewId;
    assert(videoReviewId, 'video canvas-output did not create or return a review.');

    const videoReviewResult = (await fetchJson(`${baseUrl}/api/smart-vision/reviews/status`, {
      method: 'POST',
      body: JSON.stringify({ reviewId: videoReviewId, status: 'done' })
    })).data;
    const afterVideoRun = findPipelineRun(videoReviewResult.snapshot, creative.pipelineRun.run.id);
    assert(afterVideoRun, 'Pipeline run missing after video review done.');
    const editStage = afterVideoRun.stages?.find((stage) => stage.id === 'edit');
    assert(editStage?.workflowId, 'Video review did not unlock edit workflow.');
    const editWorkflow = findWorkflow(videoReviewResult.snapshot, editStage.workflowId);
    assert(editWorkflow?.path?.includes(`/${episodeId}/`), 'Unlocked edit workflow did not preserve current episode path.');

    const editPreflight = pickPreflight((await fetchJson(`${baseUrl}/api/smart-vision/workflow-draft/preflight`, {
      method: 'POST',
      body: JSON.stringify({ workflowId: editWorkflow.id }),
    })).data);
    assert(editPreflight.status === 'passed', 'Unlocked edit workflow preflight failed.');

    const editArtifactPath = `05-可选输出/审核剪辑发布/edit/${episodeId}/smart-canvas-v2-entry-edit.mp4`;
    const editRunSession = (await fetchJson(`${baseUrl}/api/smart-vision/workflows/canvas-run-sessions/start`, {
      method: 'POST',
      body: JSON.stringify({
        workflowId: editWorkflow.id,
        workflowPath: editWorkflow.path,
        pipelineRunId: creative.pipelineRun.run.id,
        stageId: editStage.id,
        outputArtifactHint: editArtifactPath,
        outputArtifactHints: [editArtifactPath],
        importUrl: editWorkflow.importUrl,
        editUrl: editWorkflow.editUrl,
        runUrl: editWorkflow.runUrl,
        note: 'Smart Canvas v2 entry smoke 剪辑会话，不触发真实模型执行。'
      }),
    })).data.session;
    assert(editRunSession?.id, 'Edit Canvas RUN session was not created.');

    const editOutputRequest = {
      workflowId: editWorkflow.id,
      workflowPath: editWorkflow.path,
      runSessionId: editRunSession.id,
      pipelineRunId: creative.pipelineRun.run.id,
      stageId: editStage.id,
      localPath: localEditPath,
      artifactPath: editArtifactPath,
      outputArtifactHint: editArtifactPath,
      idempotencyKey: `smart-canvas-v2-entry:${episodeId}:edit`,
      nodeId: 'smart-canvas-v2-entry-edit-smoke',
      nodeType: 'videoEditor',
      mediaType: 'video',
      resetBlocked: true
    };
    const editDryRun = (await fetchJson(`${baseUrl}/api/smart-vision/workflows/canvas-output`, {
      method: 'POST',
      body: JSON.stringify({ ...editOutputRequest, dryRun: true })
    })).data;
    const editWriteResult = (await fetchJson(`${baseUrl}/api/smart-vision/workflows/canvas-output`, {
      method: 'POST',
      body: JSON.stringify(editOutputRequest)
    })).data;
    const editReviewId = editWriteResult.reviewId || editWriteResult.canvasOutputRecord?.reviewId;
    assert(editReviewId, 'edit canvas-output did not create or return a review.');

    const editReviewResult = (await fetchJson(`${baseUrl}/api/smart-vision/reviews/status`, {
      method: 'POST',
      body: JSON.stringify({ reviewId: editReviewId, status: 'done' })
    })).data;
    const afterEditRun = findPipelineRun(editReviewResult.snapshot, creative.pipelineRun.run.id);
    assert(afterEditRun, 'Pipeline run missing after edit review done.');
    const qaStage = afterEditRun.stages?.find((stage) => stage.id === 'qa');
    assert(qaStage?.workflowId, 'Edit review did not unlock QA workflow.');
    const qaWorkflow = findWorkflow(editReviewResult.snapshot, qaStage.workflowId);
    assert(qaWorkflow?.path?.includes(`/${episodeId}/`), 'Unlocked QA workflow did not preserve current episode path.');

    const qaPreflight = pickPreflight((await fetchJson(`${baseUrl}/api/smart-vision/workflow-draft/preflight`, {
      method: 'POST',
      body: JSON.stringify({ workflowId: qaWorkflow.id }),
    })).data);
    assert(qaPreflight.status === 'passed', 'Unlocked QA workflow preflight failed.');

    const qaArtifactPath = `05-可选输出/审核剪辑发布/review/${episodeId}/smart-canvas-v2-entry-qa-report.md`;
    await writeSmokeText(localQaPath, [
      `# ${episodeId} QA 报告`,
      '',
      '- 剧本输入、资产图、故事板图、视频与剪辑产物均已完成回写。',
      '- 本 smoke 只验证平台状态闭环，不触发真实模型执行。',
      `- 视频产物：${videoArtifactPath}`,
      `- 剪辑产物：${editArtifactPath}`
    ].join('\n'));
    const qaRunSession = (await fetchJson(`${baseUrl}/api/smart-vision/workflows/canvas-run-sessions/start`, {
      method: 'POST',
      body: JSON.stringify({
        workflowId: qaWorkflow.id,
        workflowPath: qaWorkflow.path,
        pipelineRunId: creative.pipelineRun.run.id,
        stageId: qaStage.id,
        outputArtifactHint: qaArtifactPath,
        outputArtifactHints: [qaArtifactPath],
        importUrl: qaWorkflow.importUrl,
        editUrl: qaWorkflow.editUrl,
        runUrl: qaWorkflow.runUrl,
        note: 'Smart Canvas v2 entry smoke QA 会话，不触发真实模型执行。'
      }),
    })).data.session;
    assert(qaRunSession?.id, 'QA Canvas RUN session was not created.');

    const qaOutputRequest = {
      workflowId: qaWorkflow.id,
      workflowPath: qaWorkflow.path,
      runSessionId: qaRunSession.id,
      pipelineRunId: creative.pipelineRun.run.id,
      stageId: qaStage.id,
      localPath: localQaPath,
      artifactPath: qaArtifactPath,
      outputArtifactHint: qaArtifactPath,
      idempotencyKey: `smart-canvas-v2-entry:${episodeId}:qa`,
      nodeId: 'smart-canvas-v2-entry-qa-smoke',
      nodeType: 'contextPack',
      mediaType: 'document',
      resetBlocked: true
    };
    const qaDryRun = (await fetchJson(`${baseUrl}/api/smart-vision/workflows/canvas-output`, {
      method: 'POST',
      body: JSON.stringify({ ...qaOutputRequest, dryRun: true })
    })).data;
    const qaWriteResult = (await fetchJson(`${baseUrl}/api/smart-vision/workflows/canvas-output`, {
      method: 'POST',
      body: JSON.stringify(qaOutputRequest)
    })).data;
    const qaReviewId = qaWriteResult.reviewId || qaWriteResult.canvasOutputRecord?.reviewId;
    assert(qaReviewId, 'qa canvas-output did not create or return a review.');

    const qaReviewResult = (await fetchJson(`${baseUrl}/api/smart-vision/reviews/status`, {
      method: 'POST',
      body: JSON.stringify({ reviewId: qaReviewId, status: 'done' })
    })).data;
    const afterQaRun = findPipelineRun(qaReviewResult.snapshot, creative.pipelineRun.run.id);
    assert(afterQaRun, 'Pipeline run missing after QA review done.');
    const releaseStage = afterQaRun.stages?.find((stage) => stage.id === 'release');
    assert(releaseStage?.workflowId, 'QA review did not unlock release workflow.');
    const releaseWorkflow = findWorkflow(qaReviewResult.snapshot, releaseStage.workflowId);
    assert(releaseWorkflow?.path?.includes(`/${episodeId}/`), 'Unlocked release workflow did not preserve current episode path.');

    const releasePreflight = pickPreflight((await fetchJson(`${baseUrl}/api/smart-vision/workflow-draft/preflight`, {
      method: 'POST',
      body: JSON.stringify({ workflowId: releaseWorkflow.id }),
    })).data);
    assert(releasePreflight.status === 'passed', 'Unlocked release workflow preflight failed.');

    const releaseArtifactPath = `05-可选输出/审核剪辑发布/release/${episodeId}/smart-canvas-v2-entry-release-manifest.json`;
    await writeSmokeText(localReleaseManifestPath, JSON.stringify({
      version: '0.1.0',
      episodeId,
      source: 'smart-canvas-v2-entry-smoke',
      artifactPaths: [
        videoArtifactPath,
        editArtifactPath,
        qaArtifactPath
      ],
      workflowIds: {
        asset: workflow.id,
        storyboard: storyboardWorkflow.id,
        video: videoWorkflow.id,
        edit: editWorkflow.id,
        qa: qaWorkflow.id,
        release: releaseWorkflow.id
      },
      generatedAt: new Date().toISOString()
    }, null, 2));
    const releaseRunSession = (await fetchJson(`${baseUrl}/api/smart-vision/workflows/canvas-run-sessions/start`, {
      method: 'POST',
      body: JSON.stringify({
        workflowId: releaseWorkflow.id,
        workflowPath: releaseWorkflow.path,
        pipelineRunId: creative.pipelineRun.run.id,
        stageId: releaseStage.id,
        outputArtifactHint: releaseArtifactPath,
        outputArtifactHints: [releaseArtifactPath],
        importUrl: releaseWorkflow.importUrl,
        editUrl: releaseWorkflow.editUrl,
        runUrl: releaseWorkflow.runUrl,
        note: 'Smart Canvas v2 entry smoke Release 会话，不触发真实模型执行。'
      }),
    })).data.session;
    assert(releaseRunSession?.id, 'Release Canvas RUN session was not created.');

    const releaseOutputRequest = {
      workflowId: releaseWorkflow.id,
      workflowPath: releaseWorkflow.path,
      runSessionId: releaseRunSession.id,
      pipelineRunId: creative.pipelineRun.run.id,
      stageId: releaseStage.id,
      localPath: localReleaseManifestPath,
      artifactPath: releaseArtifactPath,
      outputArtifactHint: releaseArtifactPath,
      idempotencyKey: `smart-canvas-v2-entry:${episodeId}:release`,
      nodeId: 'smart-canvas-v2-entry-release-smoke',
      nodeType: 'contextPack',
      mediaType: 'document',
      resetBlocked: true
    };
    const releaseDryRun = (await fetchJson(`${baseUrl}/api/smart-vision/workflows/canvas-output`, {
      method: 'POST',
      body: JSON.stringify({ ...releaseOutputRequest, dryRun: true })
    })).data;
    const releaseWriteResult = (await fetchJson(`${baseUrl}/api/smart-vision/workflows/canvas-output`, {
      method: 'POST',
      body: JSON.stringify(releaseOutputRequest)
    })).data;
    const releaseReviewId = releaseWriteResult.reviewId || releaseWriteResult.canvasOutputRecord?.reviewId;
    assert(releaseReviewId, 'release canvas-output did not create or return a review.');
    assert(releaseWriteResult.releaseAttach?.releaseId, 'release canvas-output did not attach manifest to release package.');
    assert(releaseWriteResult.releaseAttach?.manifestPath === releaseArtifactPath, 'release manifest was not attached to release package.');

    const releaseReviewResult = (await fetchJson(`${baseUrl}/api/smart-vision/reviews/status`, {
      method: 'POST',
      body: JSON.stringify({ reviewId: releaseReviewId, status: 'done' })
    })).data;
    const afterReleaseRun = findPipelineRun(releaseReviewResult.snapshot, creative.pipelineRun.run.id);
    assert(afterReleaseRun, 'Pipeline run missing after release review done.');
    assert(afterReleaseRun.status === 'done', 'Pipeline run did not complete after release review done.');

    const diagnostics = (await fetchJson(`${baseUrl}/api/smart-vision/workflows/runtime/diagnostics`)).data;
    const summary = buildSummary({
      baseUrl,
      episodeId,
      activePack,
      importedFiles,
      creative,
      workflow,
      preflight,
      runSession,
      dryRun,
      writeResult,
      reviewResult,
      storyboardWorkflow,
      storyboardPreflight,
      storyboardRunSession,
      storyboardDryRun,
      storyboardWriteResult,
      storyboardReviewResult,
      videoWorkflow,
      videoPreflight,
      videoRunSession,
      videoDryRun,
      videoWriteResult,
      videoReviewResult,
      editWorkflow,
      editPreflight,
      editRunSession,
      editDryRun,
      editWriteResult,
      editReviewResult,
      qaWorkflow,
      qaPreflight,
      qaRunSession,
      qaDryRun,
      qaWriteResult,
      qaReviewResult,
      releaseWorkflow,
      releasePreflight,
      releaseRunSession,
      releaseDryRun,
      releaseWriteResult,
      releaseReviewResult,
      finalRun: afterReleaseRun,
      diagnostics
    });

    console.log(JSON.stringify(args.json ? { creative, workflow, preflight, runSession, dryRun, writeResult, reviewResult, storyboardWorkflow, storyboardPreflight, storyboardRunSession, storyboardDryRun, storyboardWriteResult, storyboardReviewResult, videoWorkflow, videoPreflight, videoRunSession, videoDryRun, videoWriteResult, videoReviewResult, editWorkflow, editPreflight, editRunSession, editDryRun, editWriteResult, editReviewResult, qaWorkflow, qaPreflight, qaRunSession, qaDryRun, qaWriteResult, qaReviewResult, releaseWorkflow, releasePreflight, releaseRunSession, releaseDryRun, releaseWriteResult, releaseReviewResult, diagnostics } : summary, null, 2));

    if (args.strict && summary.status !== 'passed') process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    if (args.strict) process.exitCode = 1;
    else throw error;
  } finally {
    if (existsSync(localAssetPath)) await rm(localAssetPath, { force: true });
    if (existsSync(localStoryboardPath)) await rm(localStoryboardPath, { force: true });
    if (existsSync(localQaPath)) await rm(localQaPath, { force: true });
    if (existsSync(localReleaseManifestPath)) await rm(localReleaseManifestPath, { force: true });
    await stopBridge(bridge);
  }
}

main();
