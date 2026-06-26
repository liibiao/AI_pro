import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, '..');

function parseArgs(argv) {
  const args = {
    taskType: 'asset_image_generation',
    releaseId: null,
    baseUrl: null,
    port: null,
    json: false,
    strict: false,
    anomaly: false
  };

  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    if (arg === '--strict') args.strict = true;
    if (arg === '--anomaly') args.anomaly = true;
    if (arg.startsWith('--taskType=')) args.taskType = arg.slice('--taskType='.length);
    if (arg.startsWith('--releaseId=')) args.releaseId = arg.slice('--releaseId='.length) || null;
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
    if (childProcess?.exitCode !== null) {
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

function summarizeRuntimeSmoke(result, baseUrl) {
  return {
    status: result.status,
    dryRun: result.dryRun,
    baseUrl,
    taskType: result.taskType,
    smokedAt: result.smokedAt,
    steps: (result.steps ?? []).map((step) => ({
      id: step.id,
      status: step.status,
      summary: step.summary
    })),
    contextPack: result.contextPackSummary,
    pipelinePlan: result.pipelinePlan,
    taskPlan: result.taskPlan,
    taskQueueSmoke: {
      status: result.taskQueueSmoke?.status,
      completed: result.taskQueueSmoke?.completed,
      requested: result.taskQueueSmoke?.requested,
      unresolved: result.taskQueueSmoke?.unresolved ?? []
    },
    releaseSmoke: result.releaseSmoke,
    diagnostics: result.diagnostics
  };
}

function summarizeAnomalySmoke(result, baseUrl) {
  return {
    status: result.status,
    dryRun: result.dryRun,
    baseUrl,
    smokedAt: result.smokedAt,
    release: result.release,
    scenarios: (result.scenarios ?? []).map((scenario) => ({
      id: scenario.id,
      status: scenario.status,
      expectedBlockers: scenario.expectedBlockers ?? [],
      blockerCodes: scenario.blockerCodes ?? [],
      expectedSignals: scenario.expectedSignals ?? [],
      observedSignals: scenario.observedSignals ?? [],
      missingExpected: scenario.missingExpected ?? [],
      dryRun: scenario.dryRun,
      requested: scenario.requested,
      completed: scenario.completed,
      unresolvedCount: scenario.unresolvedCount,
      repairedCount: scenario.repairedCount,
      referenceIssueCount: scenario.referenceIssueCount,
      blockedSubtaskCount: scenario.blockedSubtaskCount
    })),
    failed: result.failed ?? [],
    diagnostics: {
      status: result.diagnostics?.status,
      issueCount: result.diagnostics?.counts?.issueCount ?? result.diagnostics?.issues?.length ?? 0
    }
  };
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const port = args.baseUrl ? null : args.port || await getFreePort();
  const baseUrl = args.baseUrl ?? `http://127.0.0.1:${port}`;
  let bridge = null;

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

    const endpoint = args.anomaly ? '/api/smart-vision/runtime/anomaly-smoke' : '/api/smart-vision/runtime/smoke';
    const payload = await fetchJson(`${baseUrl}${endpoint}`, {
      method: 'POST',
      body: JSON.stringify({
        taskType: args.taskType,
        releaseId: args.releaseId
      })
    });
    const result = payload.data;
    const summary = args.anomaly ? summarizeAnomalySmoke(result, baseUrl) : summarizeRuntimeSmoke(result, baseUrl);

    console.log(JSON.stringify(args.json ? result : summary, null, 2));

    if (result.status === 'blocked' || (args.strict && result.status !== 'passed')) {
      process.exitCode = 1;
    }
  } finally {
    await stopBridge(bridge);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
