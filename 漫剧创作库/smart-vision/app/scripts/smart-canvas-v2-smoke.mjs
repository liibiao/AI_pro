import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, '..');
const projectRoot = path.resolve(appRoot, '..');

function parseArgs(argv) {
  const args = { baseUrl: '', port: 0, strict: false, json: false, browserProbe: false, requireCanvas: false, canvasUrl: 'http://127.0.0.1:8877/tools/workbench-web/smart-vision-canvas-v2.html', chromePath: process.env.CHROME_PATH || '' };
  for (const arg of argv) {
    if (arg === '--strict') args.strict = true;
    if (arg === '--json') args.json = true;
    if (arg === '--browser-probe') args.browserProbe = true;
    if (arg === '--require-canvas') args.requireCanvas = true;
    if (arg.startsWith('--base-url=')) args.baseUrl = arg.slice('--base-url='.length).replace(/\/+$/, '');
    if (arg.startsWith('--port=')) args.port = Number(arg.slice('--port='.length));
    if (arg.startsWith('--canvas-url=')) args.canvasUrl = arg.slice('--canvas-url='.length);
    if (arg.startsWith('--chrome-path=')) args.chromePath = arg.slice('--chrome-path='.length);
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

async function fetchPlainJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  return response.json();
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

async function validateHtml(file) {
  const html = await fs.readFile(file, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  for (const [index, script] of scripts.entries()) {
    try {
      new Function(script);
    } catch (error) {
      throw new Error(`${file} inline script ${index + 1} syntax failed: ${error.message}`);
    }
  }
  const requiredSignals = [
    'activeDataPackOutputKinds',
    'activeDataPackProfileText',
    'syncDataPacksFromAdmin',
    '/api/smart-vision/creative/start',
    '/api/smart-vision/workflows/canvas-run-sessions/start',
    'startCreativeProductionForInputNode',
    'startCanvasRunSessionForNode',
    'collectWorkflowReferenceImages',
    '__SMART_CANVAS_V2_PROBE__',
    'runDeliverableQuality',
    'userDeliverable.kind 只能从这些交付物类型中选择',
    'Workflow JSON、运行参数、内部 adapter payload 只能放在 output/internal 字段',
  ];
  const missing = requiredSignals.filter((signal) => !html.includes(signal));
  if (missing.length) throw new Error(`${file} missing smart canvas v2 signals: ${missing.join(', ')}`);
  if (html.includes('当前漫剧包下包括')) throw new Error(`${file} still contains hard-coded Manju-only deliverable wording.`);
  return { file, inlineScripts: scripts.length, size: html.length };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function appendSearchParams(url, params) {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') parsed.searchParams.set(key, String(value));
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
  return candidates.find((candidate) => existsSync(candidate)) || null;
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

    ws.addEventListener('error', () => reject(new Error('Chrome DevTools websocket failed.')));
    ws.addEventListener('close', () => {
      for (const callbacks of pending.values()) callbacks.reject(new Error('Chrome DevTools websocket closed.'));
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
  throw new Error(`Chrome DevTools target did not become ready: ${lastError?.message || 'timeout'}`);
}

async function cdpEvaluate(cdp, expression, timeoutMs = 30000) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    timeout: timeoutMs
  });
  if (result?.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || result.exceptionDetails.exception?.description || 'CDP evaluation failed');
  }
  return result?.result?.value ?? null;
}

async function checkSmartCanvasV2Http(canvasUrl, requireCanvas) {
  try {
    const response = await fetch(canvasUrl, { signal: AbortSignal.timeout(5000) });
    const text = await response.text();
    const ok = response.ok && text.includes('__SMART_CANVAS_V2_PROBE__') && text.includes('smart-canvas-v2');
    return {
      id: 'smart_canvas_v2_live_page',
      status: ok ? 'passed' : 'blocked',
      summary: `${response.status} · ${text.length} bytes`,
      httpStatus: response.status,
      size: text.length
    };
  } catch (error) {
    return {
      id: 'smart_canvas_v2_live_page',
      status: requireCanvas ? 'blocked' : 'skipped',
      summary: requireCanvas ? `canvas unreachable: ${error.message}` : `canvas not running: ${error.message}`,
      error: error.message
    };
  }
}

async function checkSmartCanvasV2BrowserProbe(args, baseUrl) {
  const chromePath = findChromeExecutable(args.chromePath);
  if (!chromePath) {
    return {
      id: 'smart_canvas_v2_browser_probe',
      status: 'blocked',
      summary: 'Chrome executable not found',
      error: 'chrome_not_found'
    };
  }

  const debugPort = await getFreePort();
  const userDataDir = path.join('/private/tmp', `sv-smart-canvas-v2-chrome-${Date.now()}-${Math.round(Math.random() * 100000)}`);
  const probeUrl = appendSearchParams(args.canvasUrl, { probe: '1', bridgeBase: baseUrl });
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    probeUrl
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let cdp = null;
  try {
    const target = await waitForChromeTarget(debugPort);
    cdp = await connectCdp(target.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    const readyDeadline = Date.now() + 15000;
    let ready = false;
    while (Date.now() < readyDeadline) {
      ready = await cdpEvaluate(cdp, 'Boolean(window.__SMART_CANVAS_V2_PROBE__)', 10000);
      if (ready) break;
      await sleep(250);
    }
    if (!ready) throw new Error('smart canvas v2 probe was not installed.');
    const assisted = await cdpEvaluate(cdp, 'window.__SMART_CANVAS_V2_PROBE__.runAssisted()', 20000);
    const auto = await cdpEvaluate(cdp, 'window.__SMART_CANVAS_V2_PROBE__.runAuto()', 35000);
    const outputDetail = await cdpEvaluate(cdp, 'window.__SMART_CANVAS_V2_PROBE__.runOutputDetail()', 25000);
    const deliverableQuality = await cdpEvaluate(cdp, 'window.__SMART_CANVAS_V2_PROBE__.runDeliverableQuality()', 25000);
    const passed = assisted?.status === 'passed' && auto?.status === 'passed' && outputDetail?.status === 'passed' && deliverableQuality?.status === 'passed';
    return {
      id: 'smart_canvas_v2_browser_probe',
      status: passed ? 'passed' : 'blocked',
      summary: passed ? `assisted ${assisted.nodeCount}/${assisted.connCount}; auto ${auto.nodeCount}/${auto.connCount}; output detail ok; deliverables ${deliverableQuality.checked}` : `assisted=${assisted?.status || 'missing'}(${assisted?.reason || `${assisted?.nodeCount || 0}/${assisted?.connCount || 0}`}) auto=${auto?.status || 'missing'}(${auto?.nodeCount || 0}/${auto?.connCount || 0}) output=${outputDetail?.status || 'missing'}(${outputDetail?.reason || outputDetail?.mediaSrc || 'no detail'}) deliverables=${deliverableQuality?.status || 'missing'}(${deliverableQuality?.failed?.[0]?.type || deliverableQuality?.failed?.[0]?.reason || 'no detail'})`,
      probeUrl,
      assisted,
      auto,
      outputDetail,
      deliverableQuality
    };
  } catch (error) {
    return {
      id: 'smart_canvas_v2_browser_probe',
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
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function checkDataPackSwitchRuntime(baseUrl, originalActivePack) {
  const originalActivePackId = originalActivePack?.id || 'manju-creation-library';
  const smokePackId = 'sv-smoke-ad-creative-pack';
  const smokePack = {
    id: smokePackId,
    title: '广告创意测试包',
    description: 'Smart Canvas v2 smoke pack for validating pack-aware planner contracts.',
    type: 'ad_creative',
    status: 'active',
    source: 'smart_canvas_v2_smoke',
    rootBase: 'workspace',
    defaultTaskType: 'creative_orchestration',
    roots: [
      { id: 'docs', title: '广告方法论文档', root: 'docs', sourceKind: 'docs', extensions: ['.md', '.json', '.txt'], limit: 24, parseLimit: 8 },
      { id: 'agents', title: '广告 Agent 协作体系', root: 'agents', sourceKind: 'agents', extensions: ['.md', '.json', '.txt'], limit: 24, parseLimit: 8 },
      { id: 'skills', title: '广告 Skill 能力包', root: 'skills', sourceKind: 'skills', extensions: ['.md', '.json', '.txt'], limit: 24, parseLimit: 8 },
      { id: 'templates', title: '广告模板体系', root: 'templates', sourceKind: 'templates', extensions: ['.md', '.json', '.txt'], limit: 24, parseLimit: 8 },
      { id: 'wordlists', title: '广告词库', root: 'wordlists', sourceKind: 'wordlists', extensions: ['.md', '.json', '.txt'], limit: 24, parseLimit: 8 }
    ],
    capabilities: {
      dynamicAgentPipeline: true,
      smartCanvas: true,
      customerDeliverables: true,
      internalWorkflowJson: true,
      workflowJsonVisibility: 'internal',
      outputKinds: ['creative_brief', 'audience_strategy', 'ad_script', 'asset_cards', 'asset_images', 'prompt', 'video', 'qa_report', 'release_package'],
      requiredOrder: ['creative_brief', 'audience_strategy', 'ad_script', 'asset_cards', 'asset_images', 'video', 'qa', 'release']
    },
    metadata: {
      deliverableMode: 'customer_facing',
      workflowJsonVisibility: 'internal',
      packContractVersion: '0.2.0',
      dataPackFamily: 'ad_creative_smoke'
    }
  };

  let restoreError = null;
  try {
    const registerPayload = await fetchJson(`${baseUrl}/api/smart-vision/data-packs/register`, {
      method: 'POST',
      body: JSON.stringify({ dataPack: smokePack, activate: false }),
    });
    const registered = registerPayload.data?.registeredDataPack || null;
    assert(registered?.id === smokePackId, 'data-packs/register did not return the smoke pack.');

    const selectPayload = await fetchJson(`${baseUrl}/api/smart-vision/data-packs/select`, {
      method: 'POST',
      body: JSON.stringify({ dataPackId: smokePackId }),
    });
    const selected = selectPayload.data?.activeDataPack || null;
    assert(selected?.id === smokePackId, 'data-packs/select did not activate the smoke pack.');

    const runtimePayload = await fetchJson(`${baseUrl}/api/smart-vision/data-pack/runtime`, {
      method: 'POST',
      body: JSON.stringify({
        taskType: 'creative_orchestration',
        activeDataPackId: smokePackId,
        script: '为一款便携式 AI 投影仪生成 30 秒短视频广告创意。',
      }),
    });
    const runtime = runtimePayload.data || runtimePayload;
    const contract = runtime.plannerContract || {};
    const outputKinds = contract.outputKinds || [];
    const requiredOrder = contract.requiredOrder || [];
    assert(runtime.activeDataPack?.id === smokePackId, 'Runtime did not use the selected smoke data pack.');
    assert(runtime.activeDataPack?.type === 'ad_creative', 'Runtime did not preserve smoke data pack type.');
    assert(contract.activeDataPackTitle === smokePack.title, 'Planner contract did not use smoke data pack title.');
    assert(outputKinds.includes('creative_brief'), 'Ad pack planner contract lacks creative_brief.');
    assert(outputKinds.includes('ad_script'), 'Ad pack planner contract lacks ad_script.');
    assert(!outputKinds.includes('adapted_script'), 'Ad pack planner contract leaked Manju adapted_script output kind.');
    assert(requiredOrder[0] === 'creative_brief' && requiredOrder.includes('audience_strategy'), 'Ad pack requiredOrder did not follow registered capabilities.');
    assert(String(contract.requiredStepOrderRule || '').includes('creative_brief -> audience_strategy'), 'Ad pack step-order rule did not reflect registered order.');
    assert(String(contract.platformRole || '').includes('SaaS'), 'Planner contract no longer states SaaS datapack platform role.');
    assert(String(contract.userDeliverableRule || '').includes('creative_brief'), 'Planner user deliverable rule did not follow ad pack outputs.');
    assert(String(contract.userDeliverableRule || '').includes('Workflow JSON'), 'Planner contract must keep workflow JSON internal.');

    return {
      id: 'smart_canvas_v2_data_pack_switch',
      status: 'passed',
      registeredPackId: smokePackId,
      originalActivePackId,
      selectedActivePackId: runtime.activeDataPack.id,
      outputKinds,
      requiredOrder,
      restoredActivePackId: null
    };
  } finally {
    try {
      await fetchJson(`${baseUrl}/api/smart-vision/data-packs/select`, {
        method: 'POST',
        body: JSON.stringify({ dataPackId: originalActivePackId }),
      });
    } catch (error) {
      restoreError = error;
    }
    if (restoreError) throw new Error(`Data pack smoke restore failed: ${restoreError.message}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const port = args.baseUrl ? null : args.port || await getFreePort();
  const baseUrl = args.baseUrl || `http://127.0.0.1:${port}`;
  let bridge = null;

  try {
    const htmlChecks = [];
    htmlChecks.push(await validateHtml(path.join(projectRoot, 'canvas/legacy-workbench/workbench-web/smart-vision-canvas-v2.html')));
    htmlChecks.push(await validateHtml(path.join(projectRoot, '.runtime/legacy-workbench-root/smart-vision-workspace/tools/workbench-web/smart-vision-canvas-v2.html')));

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

    const packsPayload = await fetchJson(`${baseUrl}/api/smart-vision/data-packs`);
    const packsData = packsPayload.data || packsPayload;
    const activePack = packsData.activeDataPack || (packsData.packs || [])[0] || null;
    assert(activePack, 'Bridge did not return active data pack.');
    assert(Array.isArray(activePack.capabilities?.outputKinds), 'Active data pack lacks capabilities.outputKinds.');
    assert(activePack.capabilities.outputKinds.includes('asset_images'), 'Active data pack outputKinds does not include asset_images.');

    const runtimePayload = await fetchJson(`${baseUrl}/api/smart-vision/data-pack/runtime`, {
      method: 'POST',
      body: JSON.stringify({
        taskType: 'creative_orchestration',
        activeDataPackId: activePack.id,
        script: '一位年轻修复师在雨夜发现一幅会改变现实的古画。',
      }),
    });
    const runtime = runtimePayload.data || runtimePayload;
    const contract = runtime.plannerContract || {};
    assert(contract.fixedPipelineAllowed === false, 'Planner contract must forbid fixed pipeline fallback.');
    assert(Array.isArray(contract.outputKinds) && contract.outputKinds.includes('adapted_script'), 'Planner contract lacks dynamic outputKinds.');
    assert(String(contract.userDeliverableRule || '').includes('Workflow JSON'), 'Planner contract must keep workflow JSON internal.');
    assert(Array.isArray(runtime.activeDataPack?.outputKinds) && runtime.activeDataPack.outputKinds.length, 'Runtime activeDataPack outputKinds missing.');

    const dataPackSwitch = await checkDataPackSwitchRuntime(baseUrl, activePack);
    const restoredPacksPayload = await fetchJson(`${baseUrl}/api/smart-vision/data-packs`);
    const restoredPacksData = restoredPacksPayload.data || restoredPacksPayload;
    const restoredActivePack = restoredPacksData.activeDataPack || null;
    assert(restoredActivePack?.id === activePack.id, 'Data pack smoke did not restore original active data pack.');
    dataPackSwitch.restoredActivePackId = restoredActivePack.id;

    const importPayload = await fetchJson(`${baseUrl}/api/smart-vision/creative/import`, {
      method: 'POST',
      body: JSON.stringify({
        importId: 'smart-canvas-v2-smoke',
        files: [
          {
            fileName: 'smoke-script.md',
            mimeType: 'text/markdown',
            text: '一位年轻修复师在雨夜发现一幅会改变现实的古画。'
          }
        ]
      }),
    });
    const importResult = importPayload.data || importPayload;
    assert(Array.isArray(importResult.artifactPaths) && importResult.artifactPaths.length === 1, 'creative/import did not materialize imported artifact.');

    const creativePayload = await fetchJson(`${baseUrl}/api/smart-vision/creative/start`, {
      method: 'POST',
      body: JSON.stringify({
        dryRun: true,
        episodeId: 'smart-canvas-v2-smoke',
        scriptText: '一位年轻修复师在雨夜发现一幅会改变现实的古画。',
        importedFiles: importResult.artifactPaths,
        createPipelineRun: true,
        prepareFirstStage: true,
      }),
    });
    const creative = creativePayload.data || creativePayload;
    assert(creative.status === 'preview', 'creative/start dry-run did not return preview status.');
    assert(creative.shotCount > 0 && creative.assetCount > 0, 'creative/start did not produce storyboard/assets counts.');
    assert(creative.pipelineRun?.run?.stages?.length > 0, 'creative/start did not create pipeline run preview.');

    const imageImportPayload = await fetchJson(`${baseUrl}/api/smart-vision/creative/import`, {
      method: 'POST',
      body: JSON.stringify({
        importId: 'smart-canvas-v2-ref-smoke',
        files: [
          {
            fileName: 'reference.png',
            mimeType: 'image/png',
            dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
          }
        ]
      }),
    });
    const imageImport = imageImportPayload.data || imageImportPayload;
    assert(Array.isArray(imageImport.artifactPaths) && imageImport.artifactPaths.some((item) => String(item).endsWith('.png')), 'creative/import did not materialize image reference artifact.');

    const workflowDraftPayload = await fetchJson(`${baseUrl}/api/smart-vision/workflow-draft/save`, {
      method: 'POST',
      body: JSON.stringify({
        taskType: 'asset_image_generation',
        metadata: {
          source: 'smart-canvas-v2-smoke',
          note: 'smart canvas v2 reference image workflow smoke',
          episodeId: 'smart-canvas-v2-ref-smoke',
          inputArtifacts: imageImport.artifactPaths,
          referenceImages: imageImport.artifactPaths,
          outputArtifacts: ['01-资产图与提示词/资产图/smart-canvas-v2-ref-smoke.png']
        }
      }),
    });
    const workflowDraftResult = workflowDraftPayload.data || workflowDraftPayload;
    const workflowReferenceImages = workflowDraftResult.workflowDraft?.canvasExecution?.referenceImages || [];
    assert(workflowReferenceImages.some((item) => imageImport.artifactPaths.includes(item.artifactPath)), 'workflow-draft/save did not carry imported image into canvasExecution.referenceImages.');

    const runSessionPayload = await fetchJson(`${baseUrl}/api/smart-vision/workflows/canvas-run-sessions/start`, {
      method: 'POST',
      body: JSON.stringify({
        dryRun: true,
        workflowId: 'smart-canvas-v2-smoke-workflow',
        workflowPath: '02-工作流/smoke/smart-canvas-v2-smoke-workflow.json',
        taskType: 'asset_image_generation',
        source: 'smart-canvas-v2-smoke',
        outputArtifactHint: '01-资产图与提示词/画布回写/smart-canvas-v2-smoke.png',
      }),
    });
    const runSession = runSessionPayload.data || runSessionPayload;
    assert(runSession.session?.id && runSession.session?.runUrl, 'canvas-run-sessions/start dry-run did not return a runnable session.');

    const browserChecks = [await checkSmartCanvasV2Http(args.canvasUrl, args.requireCanvas)];
    if (args.browserProbe) {
      browserChecks.push(await checkSmartCanvasV2BrowserProbe(args, baseUrl));
    }
    const blockedBrowserChecks = browserChecks.filter((item) => item.status === 'blocked');
    if (blockedBrowserChecks.length && (args.requireCanvas || args.browserProbe)) {
      throw new Error(`Smart Canvas v2 browser checks blocked: ${blockedBrowserChecks.map((item) => `${item.id}:${item.summary}`).join('; ')}`);
    }

    const summary = {
      status: 'passed',
      baseUrl,
      activeDataPack: {
        id: activePack.id,
        title: activePack.title,
        type: activePack.type,
        outputKinds: activePack.capabilities.outputKinds,
      },
      plannerContract: {
        fixedPipelineAllowed: contract.fixedPipelineAllowed,
        outputKinds: contract.outputKinds,
        requiredOrder: contract.requiredOrder,
      },
      dataPackSwitch,
      bridgeContracts: {
        creativeImportArtifacts: importResult.artifactPaths,
        creativeStart: {
          status: creative.status,
          shotCount: creative.shotCount,
          assetCount: creative.assetCount,
          stageCount: creative.pipelineRun?.run?.stages?.length || 0,
        },
        workflowReferenceImages: {
          workflowId: workflowDraftResult.workflow?.id,
          referenceImageCount: workflowReferenceImages.length,
          artifactPaths: workflowReferenceImages.map((item) => item.artifactPath),
        },
        canvasRunSession: {
          id: runSession.session.id,
          runUrl: runSession.session.runUrl,
        },
      },
      browserChecks,
      htmlChecks,
    };

    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    if (args.strict) process.exitCode = 1;
    else throw error;
  } finally {
    await stopBridge(bridge);
  }
}

main();
