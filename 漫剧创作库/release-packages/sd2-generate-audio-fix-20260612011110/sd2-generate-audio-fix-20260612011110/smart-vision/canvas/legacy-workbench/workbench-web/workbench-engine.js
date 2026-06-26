/**
 * workbench-engine.js
 * 共享逻辑层 — 从 image-studio-standalone-v3 提取的纯函数与 API 逻辑
 * 零 DOM 依赖，可被任何 UI 版本（列表版 / 画布版）加载复用
 *
 * 导出全局: window.WorkbenchEngine = { ... }
 */
;(function (root) {
  'use strict';

  /* ═══════════════════════════════════════════
     常量 & 配置
     ═══════════════════════════════════════════ */
  const API_BASE = '/api/workbench/image-studio';
  const IS_STANDALONE_MODE = true;
  const DEFAULT_OUTPUT_DIR = 'runninghub_outputs/image-studio-v3';
  const WORDLIST_API = `${API_BASE}/wordlist`;
  const PRESET_WORDLIST_ID = 'preset-recipes';
  const MAX_UPLOAD = 10;

  const LANE_CONFIG = [
    { id: 'subject_action', label: '主体动作', aliases: ['subject_action', 'character_design_sheet'] },
    { id: 'art_style', label: '风格', aliases: ['art_style', 'preset_style'] },
    { id: 'camera_composition', label: '镜头', aliases: ['camera_composition'] },
    { id: 'lighting_atmosphere', label: '光影', aliases: ['lighting_atmosphere', 'color_palette', 'material_texture'] },
    { id: 'quality_render', label: '画质', aliases: ['quality_render', 'weight_control', 'mj_params'] },
    { id: 'negative_prompts', label: '负面提示词', aliases: ['negative_prompts'] },
  ];

  const LOCAL_HISTORY_KEY = 'image_standalone_v3_history';
  const MAX_LOCAL_HISTORY = 30;
  const MC_STORAGE_KEY = 'image_studio_models_v3';
  const MC_ACTIVE_KEY = 'image_studio_active_model_v3';
  const DIR_LABEL_KEY = 'image_studio_dir_label_v3';
  const DIR_HANDLE_DB_NAME = 'ImageStudioV3';
  const DIR_HANDLE_STORE = 'dirHandles';

  /* ═══════════════════════════════════════════
     工具函数（纯函数）
     ═══════════════════════════════════════════ */
  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function withNoCache(url) {
    if (!url) return '';
    if (url.startsWith('data:')) return url;
    return url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now();
  }

  function dataUrlToBlob(dataUrl) {
    const match = String(dataUrl || '').match(/^data:([^;,]+)?(;base64)?,(.*)$/);
    if (!match) throw new Error('参考图数据格式无效');
    const mimeType = match[1] || 'image/png';
    const encoded = match[3] || '';
    const binary = match[2] ? atob(encoded) : decodeURIComponent(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mimeType });
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function loadImageElement(sourceUrl) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('图片加载失败，无法压缩')); };
      img.src = sourceUrl;
    });
  }

  async function compressImageDataUrl(dataUrl, options) {
    options = options || {};
    var maxSide = Number(options.maxSide || 1536);
    var outputType = options.outputType || 'image/jpeg';
    var quality = Number(options.quality || 0.86);
    var maxBytes = Number(options.maxBytes || 4 * 1024 * 1024);
    var minQuality = Number(options.minQuality || 0.62);
    var minSide = Number(options.minSide || 768);
    var onProgress = typeof options.onProgress === 'function' ? options.onProgress : function () {};
    var blob = dataUrlToBlob(dataUrl);
    onProgress(0.08, '读取图片');
    var objectUrl = URL.createObjectURL(blob);
    try {
      onProgress(0.18, '解析尺寸');
      var img = await loadImageElement(objectUrl);
      var width = img.naturalWidth || img.width;
      var height = img.naturalHeight || img.height;
      var needResize = Math.max(width, height) > maxSide;
      if (!needResize && blob.size <= maxBytes) {
        onProgress(1, '无需压缩');
        return dataUrl;
      }
      var scale = Math.min(1, maxSide / Math.max(width, height));
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('浏览器不支持图片压缩画布');
      var outBlob = blob;
      var attempt = 0;
      while (attempt < 12) {
        var targetWidth = Math.max(1, Math.round(width * scale));
        var targetHeight = Math.max(1, Math.round(height * scale));
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        ctx.clearRect(0, 0, targetWidth, targetHeight);
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        var currentQuality = Math.max(minQuality, quality - attempt * 0.035);
        onProgress(Math.min(0.88, 0.28 + attempt * 0.05), needResize ? '按平台尺寸压缩' : '压缩体积');
        outBlob = await new Promise(function (resolve) {
          canvas.toBlob(function (result) {
            resolve(result || blob);
          }, outputType, currentQuality);
        });
        if (outBlob.size <= maxBytes) break;
        if (currentQuality <= minQuality + 0.001 || attempt % 3 === 2) scale *= 0.86;
        if (Math.max(Math.round(width * scale), Math.round(height * scale)) < minSide) break;
        attempt += 1;
      }
      if (outBlob.size > maxBytes) throw new Error('参考图已压到平台最大尺寸，但体积仍超过上传限制，请裁剪后重试');
      onProgress(0.92, '生成预览');
      var result = await blobToDataUrl(outBlob);
      onProgress(1, '压缩完成');
      return result;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function base64ToBlob(base64, mimeType) {
    mimeType = mimeType || 'image/png';
    const byteChars = atob(base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i += 1) byteNumbers[i] = byteChars.charCodeAt(i);
    return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
  }

  function makeUploadFileName(name, fallback) {
    fallback = fallback || 'reference.png';
    const source = String(name || '').trim() || fallback;
    const safe = source.replace(/[\\/:*?"<>|]+/g, '_');
    return /\.(png|jpg|jpeg|webp)$/i.test(safe) ? safe : `${safe}.png`;
  }

  function getOutputDirPath(raw) {
    const value = String(raw || '').trim();
    if (!value) return DEFAULT_OUTPUT_DIR;
    if (value.startsWith('/') || value.includes('/')) return value;
    return 'runninghub_outputs/' + value;
  }

  function getDirDisplayName(dir) {
    const value = String(dir || '').trim();
    if (!value) return '设置存图目录';
    const normalized = value.replace(/\\/g, '/').replace(/\/+$/, '');
    const name = normalized.split('/').filter(Boolean).pop();
    return name || normalized;
  }

  function getImageRefLabel(imgIdx) {
    const safeIndex = Number.isFinite(imgIdx) ? imgIdx : 0;
    return `图${safeIndex + 1}`;
  }

  function shouldJoinI2iWithoutComma(prevPart, nextPart) {
    if (!prevPart || !nextPart) return true;
    if (prevPart.type === 'image' || nextPart.type === 'image') return true;
    const prevText = String(prevPart.text || '');
    const nextText = String(nextPart.text || '');
    if (/[，,、；;：:\(（\[【\s]$/.test(prevText)) return true;
    if (/^[，,、；;：:）)】\]\.。!！?？\s]/.test(nextText)) return true;
    return false;
  }

  function resolvePreviewUrl(saved) {
    if (!saved) return '';
    if (saved.localUrl) return saved.localUrl;
    if (saved.url && (!/^https?:\/\//i.test(String(saved.url)) || String(saved.url).startsWith('/'))) return saved.url;
    if (saved.remoteUrl) return saved.remoteUrl;
    if (saved.cachedDataUrl) return saved.cachedDataUrl;
    if (saved.path) return '/api/workbench/image-studio/file?path=' + encodeURIComponent(saved.path);
    if (saved.url) return saved.url;
    return '';
  }

  function makeWordlistSelectionKey(dimId, text) { return `${dimId}::${text}`; }
  function makePresetSelectionKey(categoryId, text) { return `${categoryId}::${text}`; }

  function normalizeDimToLaneId(dimId) {
    for (const lane of LANE_CONFIG) { if (lane.aliases.includes(dimId)) return lane.id; }
    return 'subject_action';
  }

  /* ═══════════════════════════════════════════
     状态管理（纯数据操作，不含 DOM）
     ═══════════════════════════════════════════ */
  function createInitialState() {
    return {
      mode: 'txt2img',
      editMode: 'builder',
      uploadImages: [],
      latestResult: null,
      gallery: [],
      models: [],
      defaults: {},
      wordlistIndex: [],
      presetData: null,
      currentDimension: '',
      currentPresetCategory: '',
      promptLanes: {
        subject_action: [],
        art_style: [],
        camera_composition: [],
        lighting_atmosphere: [],
        quality_render: [],
        negative_prompts: [],
      },
      laneInputs: {
        subject_action: '',
        art_style: '',
        camera_composition: '',
        lighting_atmosphere: '',
        quality_render: '',
        negative_prompts: '',
      },
      selectedWordlistKeys: new Set(),
      selectedPresetKeys: new Set(),
      i2iChips: [],
      i2iFreeText: '',
      i2iPopupOpen: false,
      i2iEditingTextIndex: -1,
      dirHandle: null,
      outputDirLabel: '',
    };
  }

  function addPromptChip(state, dimId, text, kind, meta) {
    kind = kind || 'tag';
    meta = meta || {};
    const laneId = normalizeDimToLaneId(dimId);
    const lane = state.promptLanes[laneId];
    const exists = lane.some(item => item.text === text && item.kind === kind && item.source === dimId);
    if (exists) return false;
    lane.push({ text, kind, source: dimId, meta });
    if (kind === 'tag') state.selectedWordlistKeys.add(makeWordlistSelectionKey(dimId, text));
    if (kind === 'preset' && meta.categoryId) state.selectedPresetKeys.add(makePresetSelectionKey(meta.categoryId, text));
    return true;
  }

  function removePromptChip(state, laneId, idx) {
    const removed = state.promptLanes[laneId].splice(idx, 1)[0];
    if (removed && removed.kind === 'tag') state.selectedWordlistKeys.delete(makeWordlistSelectionKey(removed.source, removed.text));
    if (removed && removed.kind === 'preset' && removed.meta && removed.meta.categoryId) state.selectedPresetKeys.delete(makePresetSelectionKey(removed.meta.categoryId, removed.text));
  }

  function clearAllPromptLanes(state) {
    Object.keys(state.promptLanes).forEach(key => state.promptLanes[key] = []);
    Object.keys(state.laneInputs).forEach(key => state.laneInputs[key] = '');
    state.selectedWordlistKeys.clear();
    state.selectedPresetKeys.clear();
  }

  function syncPromptTextarea(state) {
    const parts = [];
    for (const lane of LANE_CONFIG) {
      for (const item of state.promptLanes[lane.id]) parts.push(item.text);
      const custom = (state.laneInputs[lane.id] || '').trim();
      if (custom) parts.push(custom);
    }
    return parts.join('，');
  }

  /* ── img2img chip 管理 ── */
  function remapI2iImageChipIndexes(state, indexMap) {
    state.i2iChips = state.i2iChips
      .filter(chip => chip.type !== 'image' || indexMap.has(chip.imgIdx))
      .map(chip => chip.type === 'image' ? Object.assign({}, chip, { imgIdx: indexMap.get(chip.imgIdx) }) : chip);
  }

  function removeI2iChip(state, idx) {
    const removed = state.i2iChips.splice(idx, 1)[0];
    if (removed && removed.type === 'tag') state.selectedWordlistKeys.delete(makeWordlistSelectionKey(removed.source, removed.text));
    if (removed && removed.type === 'preset' && removed.categoryId) state.selectedPresetKeys.delete(makePresetSelectionKey(removed.categoryId, removed.text));
    state.i2iEditingTextIndex = -1;
  }

  function buildI2iPromptText(state, options) {
    options = options || {};
    const withAt = options.withAt !== false;
    const parts = [];
    for (const chip of state.i2iChips) {
      if (chip.type === 'image') {
        const ref = getImageRefLabel(chip.imgIdx);
        parts.push({ type: 'image', text: withAt ? '@' + ref : ref });
      } else {
        parts.push({ type: chip.type || 'text', text: chip.text });
      }
    }
    let result = '';
    parts.forEach((part, idx) => {
      const text = String(part.text || '').trim();
      if (!text) return;
      const prevPart = idx > 0 ? parts[idx - 1] : null;
      if (result && !shouldJoinI2iWithoutComma(prevPart, part)) {
        result += '，';
      }
      result += text;
    });
    return result;
  }

  /* ═══════════════════════════════════════════
     API 通信
     ═══════════════════════════════════════════ */
  function buildDirectApiHeaders(apiKey) {
    return { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' };
  }

  function buildDirectMultipartHeaders(apiKey) {
    return { 'Authorization': 'Bearer ' + apiKey };
  }

  function extractDirectImageItem(responsePayload) {
    var data = responsePayload && responsePayload.data;
    if (Array.isArray(data) && data.length && typeof data[0] === 'object') return data[0];
    var errorText = String(responsePayload && responsePayload.error || responsePayload && responsePayload.message || responsePayload && responsePayload.msg || '').trim();
    var errorCode = String(responsePayload && responsePayload.code || '').trim();
    if (errorText) {
      throw new Error(errorCode ? '上游接口返回错误（code=' + errorCode + '）：' + errorText : '上游接口返回错误：' + errorText);
    }
    throw new Error('接口返回中未找到图片数据: ' + JSON.stringify(responsePayload).slice(0, 300));
  }

  async function buildStandaloneResult(responsePayload) {
    var item = extractDirectImageItem(responsePayload);
    var remoteUrl = String(item.url || item.image_url || '').trim();
    var b64 = String(item.b64_json || item.b64 || '').trim();
    var revisedPrompt = String(item.revised_prompt || (responsePayload && responsePayload.revised_prompt) || '').trim();
    var timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    var filename = 'img-' + timestamp + '.png';
    if (b64) {
      return { saved: { cachedDataUrl: 'data:image/png;base64,' + b64, remoteUrl: '', revisedPrompt: revisedPrompt, filename: filename, path: '' } };
    }
    if (remoteUrl) {
      return { saved: { url: remoteUrl, remoteUrl: remoteUrl, revisedPrompt: revisedPrompt, filename: filename, path: '' } };
    }
    throw new Error('接口已返回响应，但未包含 url 或 b64_json');
  }

  function isProviderImageRef(value) {
    var ref = String(value || '').trim();
    if (!ref) return false;
    if (/^data:/i.test(ref) || /^blob:/i.test(ref)) return false;
    return /^file-[\w-]+$/i.test(ref) || /^https?:\/\//i.test(ref);
  }

  function normalizeProviderImageRefs(values) {
    var source = Array.isArray(values) ? values : [];
    var refs = [];
    source.forEach(function (item) {
      var candidates = [];
      if (typeof item === 'string') candidates = [item];
      else if (item) candidates = [item.uploadRef, item.providerRef, item.fileId, item.id, item.file_id, item.remoteUrl, item.image];
      candidates.some(function (candidate) {
        var ref = String(candidate || '').trim();
        if (isProviderImageRef(ref) && refs.indexOf(ref) < 0) {
          refs.push(ref);
          return true;
        }
        return false;
      });
    });
    return refs;
  }

  async function generateImageStandalone(payload) {
    var adapter = (payload.protocol && payload.protocol.adapter) || 'openai-edits';
    var action = String(payload.action || payload.mode || '').trim();
    var requestPayload = {
      action: action || (normalizeProviderImageRefs(Array.isArray(payload.image) ? payload.image : payload.images).length ? 'img2img' : 'txt2img'),
      mode: action || payload.mode || '',
      baseUrl: payload.baseUrl,
      apiKey: payload.apiKey,
      model: payload.model,
      size: payload.size,
      prompt: payload.prompt,
      response_format: payload.response_format || 'url',
      outputDir: payload.outputDir || DEFAULT_OUTPUT_DIR,
      protocol: payload.protocol || {}
    };
    if (payload.resolution) requestPayload.resolution = payload.resolution;
    if (payload.aspectRatio) requestPayload.aspectRatio = payload.aspectRatio;
    if (payload.imageSize) requestPayload.imageSize = payload.imageSize;
    if (payload.n != null) requestPayload.n = payload.n;

    if (adapter === 'openai-edits') {
      requestPayload.background = payload.background || 'auto';
      if (payload.mask && isProviderImageRef(payload.mask)) requestPayload.mask = payload.mask;
    }

    // 所有 adapter 都传 image refs（后端按 adapter 决定如何使用）
    var imageRefs = normalizeProviderImageRefs(Array.isArray(payload.image) ? payload.image : payload.images);
    if (imageRefs.length) requestPayload.image = imageRefs;

    var resp = await fetch(API_BASE + '/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload),
      signal: payload.signal
    });
    var data = await resp.json();
    if (!resp.ok || data.error || data.ok === false) throw new Error(data && data.error && data.error.message || data && data.error || data && data.message || data && data.msg || 'HTTP ' + resp.status);
    return data;
  }

  /* ═══════════════════════════════════════════
     词库 & 预设加载
     ═══════════════════════════════════════════ */
  async function fetchWordlistResource(wordlistId, embeddedWordlists) {
    embeddedWordlists = embeddedWordlists || {};
    var embedded = getEmbeddedWordlist(wordlistId || 'index', embeddedWordlists);
    if (IS_STANDALONE_MODE && embedded) return embedded;
    var url = wordlistId ? WORDLIST_API + '?id=' + encodeURIComponent(wordlistId) : WORDLIST_API;
    try {
      var resp = await fetch(url, { cache: 'no-store' });
      var data = await resp.json();
      if (!resp.ok || !data.ok) throw new Error(data.error || '加载失败');
      return data;
    } catch (err) {
      if (embedded) return embedded;
      throw err;
    }
  }

  function getEmbeddedWordlist(wordlistId, embeddedWordlists) {
    embeddedWordlists = embeddedWordlists || {};
    var safe = String(wordlistId || '').trim().replace(/\.json$/i, '') + '.json';
    return embeddedWordlists[safe] || null;
  }

  async function loadModelsFromServer() {
    var models = [];
    try {
      var response = await fetch(API_BASE + '/models', { cache: 'no-store' });
      var data = await response.json();
      if (response.ok && data.ok) models = data.models || [];
    } catch (_) { /* ignore */ }
    return models;
  }

  /* ═══════════════════════════════════════════
     本地持久化（localStorage / IndexedDB）
     ═══════════════════════════════════════════ */
  function normalizeModelUrl(url) {
    return String(url || '').trim().replace(/\/+$/, '');
  }
  function getModelBaseUrl(raw) {
    return normalizeModelUrl(raw && (raw.url || raw.baseUrl || raw.base_url || raw.apiBase || raw.api_base || raw.endpoint));
  }
  function getModelApiKey(raw) {
    return String(raw && (raw.key || raw.apiKey || raw.api_key || raw.token) || '').trim();
  }
  function getModelName(raw) {
    return String(raw && (raw.model || raw.name) || '').trim();
  }
  function normalizeModelKeyPart(value) {
    return String(value || '').trim().toLowerCase().replace(/[\s_\-+.]+/g, '');
  }
  function getModelAliasName(raw) {
    var alias = String(raw && (raw.name || raw.alias || raw.nick || raw.nickname || raw.displayName || (raw.ui && raw.ui.label)) || '').trim();
    if (alias) return alias;
    return String(raw && raw.model || '').trim();
  }
  function getModelIdentityKey(raw) {
    var registered = String(raw && (raw.identityKey || raw._identityKey) || '').trim();
    if (registered) return registered;
    var real = normalizeModelKeyPart(getModelName(raw));
    var alias = normalizeModelKeyPart(getModelAliasName(raw));
    return [real, alias].filter(Boolean).join('::');
  }
  function makeModelId() {
    return 'm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }
  function dedupeModels(models) {
    var result = [];
    var seen = new Set();
    (Array.isArray(models) ? models : []).forEach(function (raw) {
      var realName = getModelName(raw);
      var alias = getModelAliasName(raw);
      var nick = String(raw && (raw.nick || raw.nickname || raw.displayName || (raw.ui && raw.ui.label)) || '').trim();
      var url = getModelBaseUrl(raw);
      var identityKey = getModelIdentityKey(Object.assign({}, raw, { model: realName, name: alias }));
      var type = String(raw && raw.type || '').trim();
      if (!type) {
        var lowerName = [realName, alias, nick].join(' ').toLowerCase();
        if (lowerName.indexOf('seedance') >= 0 || lowerName.indexOf('t2v') >= 0 || lowerName.indexOf('video') >= 0 || lowerName.indexOf('vidu') >= 0 || lowerName.indexOf('wan') >= 0 || lowerName.indexOf('hailuo') >= 0 || lowerName.indexOf('kling') >= 0 || lowerName.indexOf('runway') >= 0 || lowerName.indexOf('pika') >= 0) type = 'video';
        else if (/gpt-?(o|[0-9])|claude|qwen|deepseek|gemini|llm/.test(lowerName)) type = 'llm';
        else type = 'image';
      }
      if (!realName && !url) return;
      if (identityKey && seen.has(identityKey)) return;
      if (identityKey) seen.add(identityKey);
      result.push(Object.assign({}, raw, { id: String(raw && raw.id || '').trim() || identityKey || makeModelId(), name: alias || realName, model: realName || alias, nick: nick, url: url, baseUrl: url, key: getModelApiKey(raw), apiKey: getModelApiKey(raw), type: type, _identityKey: identityKey }));
    });
    return result;
  }
  function loadLocalModels() {
    try { return dedupeModels(JSON.parse(localStorage.getItem(MC_STORAGE_KEY) || '[]')); } catch (_) { return []; }
  }
  function saveLocalModels(models) {
    localStorage.setItem(MC_STORAGE_KEY, JSON.stringify(dedupeModels(models)));
  }
  function getActiveModelIndex() {
    var idx = parseInt(localStorage.getItem(MC_ACTIVE_KEY), 10);
    return isNaN(idx) ? 0 : idx;
  }
  function setActiveModelIndex(idx) {
    localStorage.setItem(MC_ACTIVE_KEY, String(idx));
  }

  function loadLocalHistory() {
    try { return JSON.parse(localStorage.getItem(LOCAL_HISTORY_KEY) || '[]'); } catch (_) { return []; }
  }
  function saveLocalHistory(items) {
    localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(items.slice(0, MAX_LOCAL_HISTORY)));
  }
  function addToLocalHistory(saved) {
    if (!saved) return;
    var history = loadLocalHistory();
    var entry = {
      name: saved.filename || ('image-' + Date.now() + '.png'),
      filename: saved.filename || ('image-' + Date.now() + '.png'),
      cachedDataUrl: saved.cachedDataUrl || '',
      url: saved.url || '',
      remoteUrl: saved.remoteUrl || '',
      revisedPrompt: saved.revisedPrompt || '',
      updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    };
    history.unshift(entry);
    saveLocalHistory(history);
    return history;
  }
  function clearLocalHistory() {
    localStorage.removeItem(LOCAL_HISTORY_KEY);
  }

  /* ── IndexedDB 目录句柄 ── */
  function _openDirDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DIR_HANDLE_DB_NAME, 1);
      req.onupgradeneeded = function () { if (!req.result.objectStoreNames.contains(DIR_HANDLE_STORE)) req.result.createObjectStore(DIR_HANDLE_STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  async function saveDirHandleToIndexedDb(handle) {
    try {
      var db = await _openDirDb();
      var tx = db.transaction(DIR_HANDLE_STORE, 'readwrite');
      tx.objectStore(DIR_HANDLE_STORE).put(handle, 'main');
      await new Promise(function (res, rej) { tx.oncomplete = res; tx.onerror = function () { rej(tx.error); }; });
      db.close();
    } catch (err) { console.warn('保存目录句柄到 IndexedDB 失败:', err); }
  }

  async function loadDirHandleFromIndexedDb() {
    try {
      var db = await _openDirDb();
      var tx = db.transaction(DIR_HANDLE_STORE, 'readonly');
      var store = tx.objectStore(DIR_HANDLE_STORE);
      var req = store.get('main');
      var result = await new Promise(function (res, rej) { req.onsuccess = function () { res(req.result); }; req.onerror = function () { rej(req.error); }; });
      db.close();
      if (result) {
        try { await result.requestPermission({ mode: 'readwrite' }); } catch (_) { return null; }
        try { for await (var _ of result.values()) break; } catch (_) { return null; }
        return result;
      }
    } catch (err) { console.warn('从 IndexedDB 加载目录句柄失败:', err); }
    return null;
  }

  async function removeDirHandleFromIndexedDb() {
    try {
      var db = await _openDirDb();
      var tx = db.transaction(DIR_HANDLE_STORE, 'readwrite');
      tx.objectStore(DIR_HANDLE_STORE).delete('main');
      await new Promise(function (res) { tx.oncomplete = res; tx.onerror = res; });
      db.close();
    } catch (_) { /* ignore */ }
    localStorage.removeItem(DIR_LABEL_KEY);
  }

  async function saveToDirHandle(handle, imageData, filename) {
    if (!handle) return false;
    try {
      var fileHandle = await handle.getFileHandle(filename, { create: true });
      var writable = await fileHandle.createWritable();
      await writable.write(imageData);
      await writable.close();
      return true;
    } catch (err) {
      console.warn('saveToDirHandle failed:', err);
      return false;
    }
  }

  async function scanDirForImages(dirHandle) {
    if (!dirHandle) return [];
    var images = [];
    var imgExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];
    try {
      for await (var entry of dirHandle.values()) {
        if (entry.kind === 'file') {
          var name = entry.name.toLowerCase();
          if (imgExts.some(function (ext) { return name.endsWith(ext); })) {
            var file = await entry.getFile();
            var reader = new FileReader();
            var dataUrl = await new Promise(function (resolve, reject) {
              reader.onload = function () { resolve(reader.result); };
              reader.onerror = function () { reject(reader.error); };
              reader.readAsDataURL(file);
            });
            images.push({
              filename: entry.name,
              url: dataUrl,
              path: entry.name,
              size: file.size,
              modifiedTime: file.lastModified,
              _file: file,
            });
          }
        }
      }
      images.sort(function (a, b) { return b.modifiedTime - a.modifiedTime; });
    } catch (err) { console.warn('scanDirForImages failed:', err); }
    return images;
  }

  async function cacheRemoteToLocal(url) {
    try {
      var resp = await fetch(url);
      if (!resp.ok) return '';
      var blob = await resp.blob();
      return await new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () { resolve(reader.result); };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (_) { return ''; }
  }

  async function downloadImage(dataUrl, filename) {
    if (!dataUrl) return;
    var a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename || 'image.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /* ═══════════════════════════════════════════
     文件处理
     ═══════════════════════════════════════════ */
  function handleImageFiles(fileList, state, callback) {
    if (!fileList || !fileList.length) return;
    var remain = MAX_UPLOAD - state.uploadImages.length;
    if (remain <= 0) { callback && callback('max'); return; }
    var files = Array.from(fileList).slice(0, remain);
    var loaded = 0;
    files.forEach(function (file) {
      var reader = new FileReader();
      reader.onload = function () {
        state.uploadImages.push({ name: file.name, dataUrl: String(reader.result || '') });
        loaded += 1;
        if (loaded === files.length) callback && callback('done', loaded);
      };
      reader.readAsDataURL(file);
    });
  }

  function removeUploadImage(state, index) {
    state.uploadImages.splice(index, 1);
    var indexMap = new Map();
    state.uploadImages.forEach(function (_, newIdx) {
      var oldIdx = newIdx >= index ? newIdx + 1 : newIdx;
      indexMap.set(oldIdx, newIdx);
    });
    remapI2iImageChipIndexes(state, indexMap);
  }

  function reorderUploadImages(state, fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    var oldImages = state.uploadImages.slice();
    var moved = oldImages[fromIndex];
    if (!moved) return;
    oldImages.splice(fromIndex, 1);
    oldImages.splice(toIndex, 0, moved);
    var indexMap = new Map();
    oldImages.forEach(function (img, newIdx) {
      var oldIdx = state.uploadImages.indexOf(img);
      indexMap.set(oldIdx, newIdx);
    });
    state.uploadImages = oldImages;
    remapI2iImageChipIndexes(state, indexMap);
  }

  /* ═══════════════════════════════════════════
     Payload 构建
     ═══════════════════════════════════════════ */
  function buildPayload(state, formValues) {
    formValues = formValues || {};
    var rawMode = String(state && state.mode || 'txt2img').trim();
    var action = rawMode === 'img2img' ? 'img2img' : (rawMode === 'panorama' || rawMode === 'imageToPanorama' ? 'panorama' : 'txt2img');
    var payload = {
      baseUrl: (formValues.baseUrl || '').trim(),
      apiKey: (formValues.apiKey || '').trim(),
      model: (formValues.model || '').trim(),
      size: formValues.size || '1024x1024',
      background: (formValues.background || '').trim() || 'auto',
      prompt: (formValues.prompt || '').trim(),
      response_format: formValues.response_format || 'url',
      outputDir: (formValues.outputDir || '').trim() || DEFAULT_OUTPUT_DIR,
      n: formValues.n,
      mask: (formValues.mask || '').trim(),
    };
    if (action === 'img2img' || action === 'panorama') payload.image = state.uploadImages;
    return payload;
  }

  /* ═══════════════════════════════════════════
     视频生成独立请求链路（不同于生图模型，不复用图片 payload / endpoint）
     ═══════════════════════════════════════════ */
  var IMAGE_STATUS_API = API_BASE + '/image/status';
  var VIDEO_API_BASE = API_BASE + '/generate-video';
  var VIDEO_START_API = API_BASE + '/video/start';
  var VIDEO_STATUS_API = API_BASE + '/video/status';
  var VIDEO_CONTENT_API = API_BASE + '/video/content';
  var VIDEO_PROVIDER_PAYLOAD_PREVIEW_API = API_BASE + '/video-provider-payload-preview';
  var IMAGE_PROVIDER_PAYLOAD_PREVIEW_API = API_BASE + '/image-provider-payload-preview';
  var FILES_UPLOAD_API = '/v1/files';
  var OBJECT_STORAGE_UPLOAD_API = API_BASE + '/upload-reference';
  function normalizeReferenceUploadMode(mode) {
    var value = String(mode || '').trim().toLowerCase();
    return value === 'cos' || value === 'object_storage' ? 'object_storage' : 'files';
  }
  function getReferenceUploadApi(mode) {
    return normalizeReferenceUploadMode(mode) === 'object_storage' ? OBJECT_STORAGE_UPLOAD_API : FILES_UPLOAD_API;
  }
  function buildVideoRequestPayload(payload) {
    payload = payload || {};
    var hasGenerateAudio = Object.prototype.hasOwnProperty.call(payload, 'generateAudio') || Object.prototype.hasOwnProperty.call(payload, 'generate_audio') || Object.prototype.hasOwnProperty.call(payload, 'enableSound') || Object.prototype.hasOwnProperty.call(payload, 'enable_sound');
    var generateAudioValue = payload.generateAudio !== undefined ? payload.generateAudio : (payload.generate_audio !== undefined ? payload.generate_audio : (payload.enableSound !== undefined ? payload.enableSound : payload.enable_sound));
    var protocol = payload.protocol && typeof payload.protocol === 'object' ? Object.assign({}, payload.protocol) : {};
    var soundField = String(payload.soundField || payload.sound_field || protocol.soundField || '').trim();
    if (soundField) protocol.soundField = soundField;
    return {
      endpointUrl: String(payload.endpointUrl || payload.baseUrl || payload.url || '').trim(),
      baseUrl: String(payload.endpointUrl || payload.baseUrl || payload.url || '').trim(),
      apiKey: String(payload.apiKey || payload.key || '').trim(),
      model: String(payload.model || '').trim(),
      prompt: String(payload.prompt || '').trim(),
      mode: payload.mode || payload.seedanceMode || payload.seedance_mode || '',
      function_mode: payload.function_mode || payload.functionMode || '',
      videoMode: payload.videoMode || 'text-to-video',
      refMode: payload.refMode || '',
      duration: String(payload.duration || payload.seconds || '5').replace(/s$/i, ''),
      seconds: String(payload.seconds || payload.duration || '5').replace(/s$/i, ''),
      quality: payload.quality || '720p',
      resolution: payload.resolution || payload.quality || '720p',
      aspectRatio: ['21:9', '16:9', '9:16', '1:1', '4:3', '3:4'].includes(payload.aspectRatio || payload.aspect_ratio) ? (payload.aspectRatio || payload.aspect_ratio) : '16:9',
      size: payload.size || payload.pixelSize || '',
      fps: payload.fps || '',
      watermark: payload.watermark,
      audioUrl: payload.audioUrl || payload.audio_url || '',
      videoUrl: payload.videoUrl || payload.video_url || '',
      refVideo: payload.refVideo || null,
      refAudio: payload.refAudio || null,
      ...((hasGenerateAudio || soundField) ? { generateAudio: generateAudioValue !== false, generate_audio: generateAudioValue !== false } : {}),
      ...(soundField ? { soundField: soundField, protocol: protocol } : {}),
      images: Array.isArray(payload.images) ? payload.images : [],
      image_url: payload.image_url || payload.imageUrl || '',
      imageUrl: payload.imageUrl || payload.image_url || '',
      extra_images: Array.isArray(payload.extra_images) ? payload.extra_images : (Array.isArray(payload.extraImages) ? payload.extraImages : []),
      extraImages: Array.isArray(payload.extraImages) ? payload.extraImages : (Array.isArray(payload.extra_images) ? payload.extra_images : []),
      extra_videos: Array.isArray(payload.extra_videos) ? payload.extra_videos : (Array.isArray(payload.extraVideos) ? payload.extraVideos : []),
      extraVideos: Array.isArray(payload.extraVideos) ? payload.extraVideos : (Array.isArray(payload.extra_videos) ? payload.extra_videos : []),
      extra_audios: Array.isArray(payload.extra_audios) ? payload.extra_audios : (Array.isArray(payload.extraAudios) ? payload.extraAudios : []),
      extraAudios: Array.isArray(payload.extraAudios) ? payload.extraAudios : (Array.isArray(payload.extra_audios) ? payload.extra_audios : []),
      reference_image_urls: Array.isArray(payload.reference_image_urls) ? payload.reference_image_urls : [],
      reference_video_urls: Array.isArray(payload.reference_video_urls) ? payload.reference_video_urls : [],
      reference_audio_urls: Array.isArray(payload.reference_audio_urls) ? payload.reference_audio_urls : [],
      image_urls: Array.isArray(payload.image_urls) ? payload.image_urls : (Array.isArray(payload.imageUrls) ? payload.imageUrls : []),
      video_urls: Array.isArray(payload.video_urls) ? payload.video_urls : (Array.isArray(payload.videoUrls) ? payload.videoUrls : []),
      audio_urls: Array.isArray(payload.audio_urls) ? payload.audio_urls : (Array.isArray(payload.audioUrls) ? payload.audioUrls : []),
      adapter: payload.adapter || payload.protocolAdapter || '',
      requestMethod: payload.requestMethod || payload.protocolMethod || '',
      outputDir: payload.outputDir || DEFAULT_OUTPUT_DIR,
    };
  }
  async function requestVideoGeneration(payload) {
    var requestPayload = buildVideoRequestPayload(payload);
    var resp = await fetch(VIDEO_API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload)
    });
    var data = await resp.json();
    if (!resp.ok || !data.ok) throw new Error(data && data.error || data && data.message || data && data.msg || 'HTTP ' + resp.status);
    return data;
  }
  async function startVideoGeneration(payload) {
    payload = payload || {};
    var requestPayload = buildVideoRequestPayload(payload);
    var fetchOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload)
    };
    if (payload.signal) fetchOptions.signal = payload.signal;
    var resp = await fetch(VIDEO_START_API, fetchOptions);
    var data = await resp.json();
    if (!resp.ok || !data.ok) throw new Error(data && data.error || data && data.message || data && data.msg || 'HTTP ' + resp.status);
    return data;
  }
  async function getImageGenerationStatus(taskId, options) {
    var fetchOptions = {};
    if (options && options.signal) fetchOptions.signal = options.signal;
    var resp = await fetch(IMAGE_STATUS_API + '?taskId=' + encodeURIComponent(taskId || ''), fetchOptions);
    var data = await resp.json();
    if (!resp.ok || !data.ok) throw new Error(data && data.error || data && data.message || data && data.msg || 'HTTP ' + resp.status);
    return data;
  }
  async function getVideoGenerationStatus(taskId, options) {
    var fetchOptions = {};
    if (options && options.signal) fetchOptions.signal = options.signal;
    var resp = await fetch(VIDEO_STATUS_API + '?taskId=' + encodeURIComponent(taskId || ''), fetchOptions);
    var data = await resp.json();
    if (!resp.ok || !data.ok) throw new Error(data && data.error || data && data.message || data && data.msg || 'HTTP ' + resp.status);
    return data;
  }
  function getVideoContentUrl(taskId) {
    return VIDEO_CONTENT_API + '?taskId=' + encodeURIComponent(taskId || '');
  }
  async function getVideoPreviewUrl(taskId, fallbackUrl, options) {
    var status = null;
    try {
      status = await getVideoGenerationStatus(taskId, options || {});
    } catch (err) {
      return fallbackUrl || getVideoContentUrl(taskId);
    }
    if (status && status.localUrl) return status.localUrl;
    return fallbackUrl || getVideoContentUrl(taskId);
  }
  async function requestVideoProviderPayloadPreview(payload) {
    var requestPayload = buildVideoRequestPayload(payload);
    var resp = await fetch(VIDEO_PROVIDER_PAYLOAD_PREVIEW_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload)
    });
    var data = await resp.json();
    if (!resp.ok || !data.ok) throw new Error(data && data.error || data && data.message || data && data.msg || 'HTTP ' + resp.status);
    return data;
  }
  async function requestImageProviderPayloadPreview(payload) {
    var requestPayload = Object.assign({}, payload || {});
    var resp = await fetch(IMAGE_PROVIDER_PAYLOAD_PREVIEW_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload)
    });
    var data = await resp.json();
    if (!resp.ok || !data.ok) throw new Error(data && data.error || data && data.message || data && data.msg || 'HTTP ' + resp.status);
    return data;
  }
  async function uploadReferenceImage(file, options) {
    options = options || {};
    if (typeof Blob === 'function' && !(file instanceof Blob)) {
      throw new Error('参考图上传失败：传入的 file 不是浏览器 File/Blob，可能是 fileId、URL 或图片元数据对象');
    }
    var mode = normalizeReferenceUploadMode(options.mode || options.uploadMode);
    var uploadApi = getReferenceUploadApi(mode);
    var onProgress = typeof options.onProgress === 'function' ? options.onProgress : function () {};
    var form = new FormData();
    form.append('file', file, file && file.name ? file.name : 'reference.png');
    form.append('purpose', 'vision');
    form.append('mode', mode);
    if (mode === 'files') {
      form.append('baseUrl', String(options.baseUrl || options.endpointUrl || '').trim());
      form.append('apiKey', String(options.apiKey || options.key || '').trim());
    }
    if (typeof XMLHttpRequest !== 'function') {
      var fallbackResp = await fetch(uploadApi, { method: 'POST', body: form });
      var fallbackData = await fallbackResp.json();
      if (!fallbackResp.ok || (!fallbackData.ok && !fallbackData.id)) throw new Error(fallbackData && fallbackData.error || fallbackData && fallbackData.message || fallbackData && fallbackData.msg || 'HTTP ' + fallbackResp.status);
      onProgress({ loaded: file && file.size ? file.size : 1, total: file && file.size ? file.size : 1, percent: 100, phase: 'done', mode: mode });
      return fallbackData;
    }
    return await new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', uploadApi, true);
      xhr.upload.onprogress = function (evt) {
        var total = Number(evt && evt.total || file && file.size || 0) || 0;
        var loaded = Number(evt && evt.loaded || 0) || 0;
        var percent = total > 0 ? Math.max(0, Math.min(100, Math.round(loaded / total * 100))) : 0;
        onProgress({ loaded: loaded, total: total, percent: percent, phase: 'uploading', mode: mode });
      };
      xhr.onerror = function () { reject(new Error('上传参考图失败，网络连接中断')); };
      xhr.onabort = function () { reject(new Error('上传参考图已取消')); };
      xhr.onload = function () {
        var data = {};
        try {
          data = JSON.parse(xhr.responseText || '{}');
        } catch (_) {
          reject(new Error('上传参考图返回了无效 JSON'));
          return;
        }
        if (xhr.status < 200 || xhr.status >= 300 || (!data.ok && !data.id)) {
          reject(new Error(data && data.error || data && data.message || data && data.msg || 'HTTP ' + xhr.status));
          return;
        }
        onProgress({ loaded: file && file.size ? file.size : 1, total: file && file.size ? file.size : 1, percent: 100, phase: 'done', mode: mode });
        resolve(data);
      };
      xhr.send(form);
    });
  }
  async function generateVideoStandalone(payload) {
    return requestVideoGeneration(payload);
  }

  /* ═══════════════════════════════════════════
     导出
     ═══════════════════════════════════════════ */
  var Engine = {
    // 常量
    API_BASE: API_BASE,
    IS_STANDALONE_MODE: IS_STANDALONE_MODE,
    DEFAULT_OUTPUT_DIR: DEFAULT_OUTPUT_DIR,
    WORDLIST_API: WORDLIST_API,
    PRESET_WORDLIST_ID: PRESET_WORDLIST_ID,
    MAX_UPLOAD: MAX_UPLOAD,
    LANE_CONFIG: LANE_CONFIG,
    LOCAL_HISTORY_KEY: LOCAL_HISTORY_KEY,
    MC_STORAGE_KEY: MC_STORAGE_KEY,
    MC_ACTIVE_KEY: MC_ACTIVE_KEY,

    // 视频生成独立请求链路
    buildVideoRequestPayload: buildVideoRequestPayload,
    requestVideoGeneration: requestVideoGeneration,
    startVideoGeneration: startVideoGeneration,
    getImageGenerationStatus: getImageGenerationStatus,
    getVideoGenerationStatus: getVideoGenerationStatus,
    getVideoContentUrl: getVideoContentUrl,
    getVideoPreviewUrl: getVideoPreviewUrl,
    requestVideoProviderPayloadPreview: requestVideoProviderPayloadPreview,
    requestImageProviderPayloadPreview: requestImageProviderPayloadPreview,
    normalizeReferenceUploadMode: normalizeReferenceUploadMode,
    getReferenceUploadApi: getReferenceUploadApi,
    uploadReferenceImage: uploadReferenceImage,
    generateVideoStandalone: generateVideoStandalone,

    // 工具函数
    escapeHtml: escapeHtml,
    withNoCache: withNoCache,
    dataUrlToBlob: dataUrlToBlob,
    base64ToBlob: base64ToBlob,
    makeUploadFileName: makeUploadFileName,
    getOutputDirPath: getOutputDirPath,
    getDirDisplayName: getDirDisplayName,
    getImageRefLabel: getImageRefLabel,
    shouldJoinI2iWithoutComma: shouldJoinI2iWithoutComma,
    resolvePreviewUrl: resolvePreviewUrl,
    makeWordlistSelectionKey: makeWordlistSelectionKey,
    makePresetSelectionKey: makePresetSelectionKey,
    normalizeDimToLaneId: normalizeDimToLaneId,

    // 状态管理
    createInitialState: createInitialState,
    addPromptChip: addPromptChip,
    removePromptChip: removePromptChip,
    clearAllPromptLanes: clearAllPromptLanes,
    syncPromptTextarea: syncPromptTextarea,
    remapI2iImageChipIndexes: remapI2iImageChipIndexes,
    removeI2iChip: removeI2iChip,
    buildI2iPromptText: buildI2iPromptText,

    // API
    buildDirectApiHeaders: buildDirectApiHeaders,
    buildDirectMultipartHeaders: buildDirectMultipartHeaders,
    generateImageStandalone: generateImageStandalone,
    buildStandaloneResult: buildStandaloneResult,

    // 词库
    fetchWordlistResource: fetchWordlistResource,
    getEmbeddedWordlist: getEmbeddedWordlist,
    loadModelsFromServer: loadModelsFromServer,

    // 持久化
    loadLocalModels: loadLocalModels,
    saveLocalModels: saveLocalModels,
    getActiveModelIndex: getActiveModelIndex,
    setActiveModelIndex: setActiveModelIndex,
    loadLocalHistory: loadLocalHistory,
    saveLocalHistory: saveLocalHistory,
    addToLocalHistory: addToLocalHistory,
    clearLocalHistory: clearLocalHistory,
    saveDirHandleToIndexedDb: saveDirHandleToIndexedDb,
    loadDirHandleFromIndexedDb: loadDirHandleFromIndexedDb,
    removeDirHandleFromIndexedDb: removeDirHandleFromIndexedDb,
    saveToDirHandle: saveToDirHandle,
    scanDirForImages: scanDirForImages,
    cacheRemoteToLocal: cacheRemoteToLocal,
    downloadImage: downloadImage,

    // 文件处理
    handleImageFiles: handleImageFiles,
    removeUploadImage: removeUploadImage,
    reorderUploadImages: reorderUploadImages,

    // Payload
    buildPayload: buildPayload,
  };

  // 挂载到全局
  if (typeof root.WorkbenchEngine === 'undefined') {
    root.WorkbenchEngine = Engine;
  }

})(typeof window !== 'undefined' ? window : this);
