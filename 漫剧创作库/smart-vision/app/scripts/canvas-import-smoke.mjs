import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, '..');
const smartVisionRoot = path.resolve(appRoot, '..');

function parseArgs(argv) {
  const args = {
    baseUrl: null,
    port: null,
    workflowId: null,
    json: false,
    strict: false,
    requireCanvas: false,
    browserProbe: false,
    chromePath: process.env.CHROME_PATH ?? ''
  };

  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    if (arg === '--strict') args.strict = true;
    if (arg === '--require-canvas') args.requireCanvas = true;
    if (arg === '--browser-probe') args.browserProbe = true;
    if (arg.startsWith('--base-url=')) args.baseUrl = arg.slice('--base-url='.length).replace(/\/+$/, '');
    if (arg.startsWith('--port=')) args.port = Number(arg.slice('--port='.length));
    if (arg.startsWith('--workflowId=')) args.workflowId = arg.slice('--workflowId='.length) || null;
    if (arg.startsWith('--chrome-path=')) args.chromePath = arg.slice('--chrome-path='.length) || '';
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

async function fetchPlainJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
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

function step(id, passed, summary, extra = {}) {
  return {
    id,
    status: passed ? 'passed' : 'blocked',
    summary,
    ...extra
  };
}

function getUrlParam(url, key) {
  return new URL(url).searchParams.get(key);
}

function appendSearchParams(url, params) {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    parsed.searchParams.set(key, String(value));
  }
  return parsed.toString();
}

function findChromeExecutable(explicitPath = '') {
  const candidates = [
    explicitPath,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

async function checkCanvasHttp(workflowUrl, requireCanvas) {
  try {
    const response = await fetch(workflowUrl, {
      signal: AbortSignal.timeout(5000)
    });
    const text = await response.text();
    const ok = response.ok && text.includes('params.get(\'bridgeBase\')||wf.canvasExecution?.bridgeBase');
    return {
      id: 'canvas_live_import_page',
      status: ok ? 'passed' : 'blocked',
      summary: `${response.status} · ${text.length} bytes`,
      httpStatus: response.status,
      size: text.length
    };
  } catch (error) {
    return {
      id: 'canvas_live_import_page',
      status: requireCanvas ? 'blocked' : 'skipped',
      summary: requireCanvas ? `canvas unreachable: ${error.message}` : `canvas not running: ${error.message}`,
      error: error.message
    };
  }
}

function connectCdp(webSocketUrl) {
  return new Promise((resolve, reject) => {
    if (!globalThis.WebSocket) {
      reject(new Error('Global WebSocket is not available in this Node runtime.'));
      return;
    }

    const ws = new WebSocket(webSocketUrl);
    const pending = new Map();
    let nextId = 1;

    ws.addEventListener('open', () => {
      resolve({
        send(method, params = {}) {
          const id = nextId++;
          ws.send(JSON.stringify({ id, method, params }));
          return new Promise((sendResolve, sendReject) => {
            pending.set(id, { resolve: sendResolve, reject: sendReject });
          });
        },
        close() {
          ws.close();
        }
      });
    });

    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const callbacks = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) callbacks.reject(new Error(message.error.message || JSON.stringify(message.error)));
      else callbacks.resolve(message.result);
    });

    ws.addEventListener('error', () => {
      reject(new Error('Chrome DevTools websocket failed.'));
    });

    ws.addEventListener('close', () => {
      for (const callbacks of pending.values()) {
        callbacks.reject(new Error('Chrome DevTools websocket closed.'));
      }
      pending.clear();
    });
  });
}

async function waitForChromeTarget(debugPort) {
  const deadline = Date.now() + 15000;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const targets = await fetchPlainJson(`http://127.0.0.1:${debugPort}/json`);
      const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page) return page;
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }

  throw new Error(`Chrome DevTools target did not become ready: ${lastError?.message ?? 'timeout'}`);
}

async function readImportProbe(cdp) {
  const result = await cdp.send('Runtime.evaluate', {
    expression: 'window.__SMART_VISION_IMPORT_PROBE__ || null',
    returnByValue: true,
    awaitPromise: false
  });
  return result?.result?.value ?? null;
}

async function checkCanvasBrowserProbe(workflowUrl, args) {
  const chromePath = findChromeExecutable(args.chromePath);
  if (!chromePath) {
    return {
      id: 'canvas_browser_import_probe',
      status: 'blocked',
      summary: 'Chrome executable not found',
      error: 'chrome_not_found'
    };
  }

  const debugPort = await getFreePort();
  const userDataDir = path.join('/private/tmp', `sv-canvas-chrome-${Date.now()}-${Math.round(Math.random() * 100000)}`);
  const probeUrl = appendSearchParams(workflowUrl, { probe: '1' });
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    probeUrl
  ], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let cdp = null;
  try {
    const target = await waitForChromeTarget(debugPort);
    cdp = await connectCdp(target.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');

    const deadline = Date.now() + 15000;
    let probe = null;
    while (Date.now() < deadline) {
      probe = await readImportProbe(cdp);
      if (probe?.status === 'imported' || probe?.status === 'failed') break;
      await sleep(250);
    }

    const imported = probe?.status === 'imported' && probe.nodeCount > 0 && probe.bridgeBase === getUrlParam(workflowUrl, 'bridgeBase');
    return {
      id: 'canvas_browser_import_probe',
      status: imported ? 'passed' : 'blocked',
      summary: imported ? `${probe.workflowId || 'workflow'} · nodes ${probe.nodeCount} · conns ${probe.connCount}` : `probe ${probe?.status ?? 'missing'}`,
      probe
    };
  } catch (error) {
    return {
      id: 'canvas_browser_import_probe',
      status: 'blocked',
      summary: error.message,
      error: error.message
    };
  } finally {
    if (cdp) cdp.close();
    if (chrome.exitCode === null) chrome.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => chrome.once('exit', resolve)),
      sleep(3000).then(() => {
        if (chrome.exitCode === null) chrome.kill('SIGKILL');
      })
    ]);
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function runSmoke(args, baseUrl) {
  const runScriptPath = path.join(smartVisionRoot, 'scripts/run-legacy-workbench.sh');
  const canvasHtmlPath = path.join(smartVisionRoot, 'canvas/legacy-workbench/workbench-web/image-studio-canvas.html');
  const runtimeCanvasHtmlPath = path.join(smartVisionRoot, '.runtime/legacy-workbench-root/smart-vision-workspace/tools/workbench-web/image-studio-canvas.html');
  const runScript = await readFile(runScriptPath, 'utf8');
  const canvasHtml = await readFile(canvasHtmlPath, 'utf8');
  const runtimeCanvasHtml = existsSync(runtimeCanvasHtmlPath) ? await readFile(runtimeCanvasHtmlPath, 'utf8') : '';
  const canvasPrecedenceNeedle = 'bridgeBase:(params.get(\'bridgeBase\')||wf.canvasExecution?.bridgeBase';

  const snapshotPayload = await fetchJson(`${baseUrl}/api/smart-vision/snapshot`);
  const snapshot = snapshotPayload.data;
  const workflows = snapshot.workflowRegistry?.workflows ?? [];
  const workflow = args.workflowId
    ? workflows.find((item) => item.id === args.workflowId)
    : workflows.find((item) => item.id === 'draft-release-1778304322583') ?? workflows.find((item) => item.path);

  if (!workflow) {
    throw new Error(`Workflow not found: ${args.workflowId ?? 'first available workflow'}`);
  }

  const artifactPayload = await fetchJson(`${baseUrl}/api/smart-vision/artifacts/read?path=${encodeURIComponent(workflow.path)}`);
  const importBridgeBase = getUrlParam(workflow.importUrl, 'bridgeBase');
  const editBridgeBase = getUrlParam(workflow.editUrl, 'bridgeBase');
  const runBridgeBase = getUrlParam(workflow.runUrl, 'bridgeBase');
  const importWorkflowPath = getUrlParam(workflow.importUrl, 'workflowPath');
  const editMode = getUrlParam(workflow.editUrl, 'mode');
  const runMode = getUrlParam(workflow.runUrl, 'mode');

  const steps = [
    step('legacy_canvas_default_port', runScript.includes('--port "${PORT:-8877}"'), 'run-legacy-workbench default port is 8877'),
    step('canvas_bridge_base_precedence', canvasHtml.includes(canvasPrecedenceNeedle), 'source canvas imports URL bridgeBase before embedded workflow bridgeBase'),
    step('runtime_canvas_bridge_base_precedence', !runtimeCanvasHtml || runtimeCanvasHtml.includes(canvasPrecedenceNeedle), runtimeCanvasHtml ? 'runtime canvas copy imports URL bridgeBase before embedded workflow bridgeBase' : 'runtime canvas copy not present; source copy is authoritative'),
    step('snapshot_bridge_base', snapshot.canvasStatus?.bridgeBase === baseUrl && snapshot.workflowRegistry?.bridgeBase === baseUrl, `${snapshot.canvasStatus?.bridgeBase ?? 'missing'} / ${snapshot.workflowRegistry?.bridgeBase ?? 'missing'}`),
    step('workflow_import_url_bridge_base', importBridgeBase === baseUrl && editBridgeBase === baseUrl && runBridgeBase === baseUrl, `import/edit/run bridgeBase => ${importBridgeBase} / ${editBridgeBase} / ${runBridgeBase}`),
    step('workflow_import_url_contract', importWorkflowPath === workflow.path && editMode === 'edit' && runMode === 'manual', `${workflow.path} · edit=${editMode} · run=${runMode}`),
    step('workflow_import_check', Boolean(workflow.importCheck?.ok), workflow.importCheck?.ok ? `${workflow.importCheck.schema ?? 'schema'} · nodes ${workflow.importCheck.nodeCount ?? 0}` : JSON.stringify(workflow.importCheck?.issues ?? [])),
    step('workflow_artifact_read', Boolean(artifactPayload.data?.size), `${workflow.path} · ${artifactPayload.data?.size ?? 0} bytes`)
  ];

  steps.push(await checkCanvasHttp(workflow.runUrl, args.requireCanvas));
  if (args.browserProbe) {
    steps.push(await checkCanvasBrowserProbe(workflow.runUrl, args));
  }

  const blockingSteps = steps.filter((item) => item.status === 'blocked');
  return {
    status: blockingSteps.length > 0 ? 'blocked' : 'passed',
    baseUrl,
    workflow: {
      id: workflow.id,
      path: workflow.path,
      importUrl: workflow.importUrl,
      runUrl: workflow.runUrl
    },
    canvasUrl: snapshot.canvasStatus?.url,
    requireCanvas: args.requireCanvas,
    browserProbe: args.browserProbe,
    steps,
    checkedAt: new Date().toISOString()
  };
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
    const result = await runSmoke(args, baseUrl);
    console.log(JSON.stringify(args.json ? result : {
      status: result.status,
      baseUrl: result.baseUrl,
      workflow: result.workflow,
      canvasUrl: result.canvasUrl,
      requireCanvas: result.requireCanvas,
      browserProbe: result.browserProbe,
      steps: result.steps.map(({ id, status, summary }) => ({ id, status, summary })),
      checkedAt: result.checkedAt
    }, null, 2));

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
