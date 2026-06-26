import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, '..');

function parseArgs(argv) {
  const args = {
    baseUrl: null,
    port: null,
    workflowId: 'draft-asset_image_generation-1778298423240',
    artifactPath: null,
    strict: false,
    json: false
  };

  for (const arg of argv) {
    if (arg === '--strict') args.strict = true;
    if (arg === '--json') args.json = true;
    if (arg.startsWith('--base-url=')) args.baseUrl = arg.slice('--base-url='.length).replace(/\/+$/, '');
    if (arg.startsWith('--port=')) args.port = Number(arg.slice('--port='.length));
    if (arg.startsWith('--workflowId=')) args.workflowId = arg.slice('--workflowId='.length) || args.workflowId;
    if (arg.startsWith('--artifactPath=')) args.artifactPath = arg.slice('--artifactPath='.length) || null;
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
      server.close(() => {
        if (!port) reject(new Error('Unable to allocate a local port.'));
        else resolve(port);
      });
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    ...options
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error ?? `Request failed: ${response.status} ${response.statusText}`);
  }

  return payload;
}

async function waitForBridge(baseUrl, childProcess = null) {
  const deadline = Date.now() + 15000;
  let lastError = null;

  while (Date.now() < deadline) {
    if (childProcess && childProcess.exitCode !== null) {
      throw new Error(`Bridge exited before becoming ready with code ${childProcess.exitCode}.`);
    }

    try {
      await fetchJson(`${baseUrl}/api/smart-vision/health`);
      return;
    } catch (error) {
      lastError = error;
      await sleep(250);
    }
  }

  throw new Error(`Bridge did not become ready: ${lastError?.message ?? 'timeout'}`);
}

async function stopBridge(childProcess) {
  if (!childProcess || childProcess.exitCode !== null) return;

  childProcess.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => childProcess.once('exit', resolve)),
    sleep(3000).then(() => {
      if (childProcess.exitCode === null) childProcess.kill('SIGKILL');
    })
  ]);
}

function findWorkflow(snapshot, workflowId) {
  const workflows = snapshot?.workflowRegistry?.workflows ?? [];
  return workflows.find((workflow) => workflow.id === workflowId)
    ?? workflows.find((workflow) => workflow.source === 'canvas-output-idempotency-smoke')
    ?? workflows.find((workflow) => workflow.importCheck?.ok)
    ?? workflows[0]
    ?? null;
}

async function writeSmokeImage(localPath) {
  await mkdir(path.dirname(localPath), { recursive: true });
  const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64');
  await writeFile(localPath, png1x1);
}

function summarize({ baseUrl, workflow, artifactPath, localPath, runSession, dryRun, writeResult, artifactPreview, diagnostics }) {
  const outputRegistered = writeResult.status === 'registered' || writeResult.status === 'idempotent';
  const sessionAttached = writeResult.canvasRunSessionAttach?.updated === true;
  return {
    status: outputRegistered && sessionAttached ? 'passed' : 'blocked',
    baseUrl,
    workflow: {
      id: workflow.id,
      path: workflow.path,
      status: workflow.status,
      type: workflow.type
    },
    localPath,
    artifactPath,
    runSession: runSession ? {
      id: runSession.id,
      status: runSession.status,
      workflowId: runSession.workflowId
    } : null,
    steps: [
      {
        id: 'canvas_run_session',
        status: runSession?.id ? 'passed' : 'blocked',
        summary: runSession ? `${runSession.status} · ${runSession.id}` : 'missing session'
      },
      {
        id: 'canvas_output_preview',
        status: dryRun.status === 'preview' ? 'passed' : 'blocked',
        summary: `${dryRun.status} · ${dryRun.artifactPath ?? artifactPath}`
      },
      {
        id: 'canvas_output_register',
        status: outputRegistered ? 'passed' : 'blocked',
        summary: `${writeResult.status} · ${writeResult.reviewId ?? writeResult.canvasOutputRecord?.reviewId ?? 'review pending'}`
      },
      {
        id: 'canvas_run_session_attach',
        status: sessionAttached ? 'passed' : 'blocked',
        summary: writeResult.canvasRunSessionAttach?.session ? `${writeResult.canvasRunSessionAttach.session.status} · ${writeResult.canvasRunSessionAttach.session.id}` : (writeResult.canvasRunSessionAttach?.reason ?? 'not attached')
      },
      {
        id: 'artifact_read',
        status: artifactPreview?.path ? 'passed' : 'blocked',
        summary: `${artifactPreview?.kind ?? 'unknown'} · ${artifactPreview?.size ?? 0} bytes`
      },
      {
        id: 'diagnostics',
        status: diagnostics.status === 'ready' ? 'passed' : 'blocked',
        summary: `${diagnostics.status} · ${diagnostics.counts?.issueCount ?? diagnostics.issues?.length ?? 0} issues`
      }
    ],
    result: {
      idempotencyKey: writeResult.idempotencyKey,
      status: writeResult.status,
      reviewId: writeResult.reviewId ?? writeResult.canvasOutputRecord?.reviewId ?? null,
      canvasRunSessionAttach: writeResult.canvasRunSessionAttach ?? null,
      materialized: writeResult.materialized
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
  const baseUrl = args.baseUrl ?? `http://127.0.0.1:${port}`;
  let bridge = null;
  const stamp = Date.now();
  const localPath = path.join('/private/tmp', `sv-canvas-output-register-smoke-${stamp}.png`);

  try {
    if (!args.baseUrl) {
      bridge = spawn(process.execPath, ['scripts/bridge-server.mjs'], {
        cwd: appRoot,
        env: { ...process.env, SMART_VISION_BRIDGE_PORT: String(port) },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      bridge.stdout.on('data', (chunk) => {
        if (process.env.SMART_VISION_SMOKE_DEBUG) process.stdout.write(chunk);
      });
      bridge.stderr.on('data', (chunk) => process.stderr.write(chunk));
    }

    await waitForBridge(baseUrl, bridge);
    await writeSmokeImage(localPath);

    const snapshotPayload = await fetchJson(`${baseUrl}/api/smart-vision/snapshot`);
    const workflow = findWorkflow(snapshotPayload.data, args.workflowId);
    if (!workflow?.id) throw new Error('No workflow available for canvas-output smoke.');

    const artifactPath = args.artifactPath ?? `01-资产图与提示词/画布回写/canvas-output-register-smoke-${stamp}.png`;
    const runSession = (await fetchJson(`${baseUrl}/api/smart-vision/workflows/canvas-run-sessions/start`, {
      method: 'POST',
      body: JSON.stringify({
        workflowId: workflow.id,
        workflowPath: workflow.path,
        outputArtifactHint: artifactPath,
        outputArtifactHints: [artifactPath],
        importUrl: workflow.importUrl,
        editUrl: workflow.editUrl,
        runUrl: workflow.runUrl,
        note: 'canvas-output smoke 会话，不触发真实模型执行。'
      })
    })).data.session;
    const request = {
      workflowId: workflow.id,
      workflowPath: workflow.path,
      runSessionId: runSession.id,
      localPath,
      artifactPath,
      outputArtifactHint: artifactPath,
      idempotencyKey: `canvas-output-register-smoke:${stamp}`,
      nodeId: 'canvas-output-register-smoke',
      nodeType: 'singleImage',
      mediaType: 'image',
      resetBlocked: true
    };

    const dryRun = (await fetchJson(`${baseUrl}/api/smart-vision/workflows/canvas-output`, {
      method: 'POST',
      body: JSON.stringify({ ...request, dryRun: true })
    })).data;
    const writeResult = (await fetchJson(`${baseUrl}/api/smart-vision/workflows/canvas-output`, {
      method: 'POST',
      body: JSON.stringify(request)
    })).data;
    const finalArtifactPath = writeResult.artifactPath ?? artifactPath;
    const artifactPreview = (await fetchJson(`${baseUrl}/api/smart-vision/artifacts/read?path=${encodeURIComponent(finalArtifactPath)}`)).data;
    const diagnostics = (await fetchJson(`${baseUrl}/api/smart-vision/workflows/runtime/diagnostics`)).data;
    const output = summarize({ baseUrl, workflow, artifactPath: finalArtifactPath, localPath, runSession, dryRun, writeResult, artifactPreview, diagnostics });

    console.log(JSON.stringify(args.json ? { dryRun, writeResult, artifactPreview, diagnostics } : output, null, 2));

    if (args.strict && (output.status !== 'passed' || output.diagnostics.status !== 'ready' || output.diagnostics.issueCount !== 0)) {
      process.exitCode = 1;
    }
  } finally {
    if (existsSync(localPath)) await rm(localPath, { force: true });
    await stopBridge(bridge);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
