;(function (root) {
  'use strict';

  var TOKEN_KEY = 'canvas_platform_token';
  var API_BASE_KEY = 'canvas_platform_api_base';
  var DEFAULT_API_BASE = 'http://127.0.0.1:4000';
  var state = {
    apiBase: String(root.CANVAS_PLATFORM_API_BASE || localStorage.getItem(API_BASE_KEY) || DEFAULT_API_BASE).replace(/\/+$/, ''),
    token: localStorage.getItem(TOKEN_KEY) || '',
    user: null,
    summary: null,
    installed: false,
    xhrInstalled: false,
    widgetRenderer: null,
    refreshTimer: null
  };

  function setApiBase(apiBase) {
    state.apiBase = String(apiBase || DEFAULT_API_BASE).trim().replace(/\/+$/, '');
    localStorage.setItem(API_BASE_KEY, state.apiBase);
    return state.apiBase;
  }

  function setToken(token) {
    state.token = String(token || '').trim();
    if (state.token) localStorage.setItem(TOKEN_KEY, state.token);
    else localStorage.removeItem(TOKEN_KEY);
  }

  function authHeaders(headers) {
    var next = new Headers(headers || {});
    if (state.token && !next.has('Authorization')) next.set('Authorization', 'Bearer ' + state.token);
    return next;
  }

  function toApiUrl(path) {
    var raw = String(path || '');
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.indexOf('/api/') === 0 || raw === '/v1/files' || raw.indexOf('/v1/files?') === 0) return state.apiBase + raw;
    return state.apiBase + (raw.charAt(0) === '/' ? raw : '/' + raw);
  }

  function shouldProxyUrl(url) {
    var raw = String(url || '');
    return raw.indexOf('/api/') === 0 || raw === '/v1/files' || raw.indexOf('/v1/files?') === 0;
  }

  function shouldRefreshSummaryAfterUrl(url) {
    var raw = String(url || '');
    return raw.indexOf('/api/workbench/image-studio/generate') === 0 ||
      raw.indexOf('/api/generate/') === 0 ||
      raw.indexOf('/api/recharge/orders/') === 0;
  }

  function scheduleSummaryRefresh(url, ok) {
    if (!ok || !state.token || !shouldRefreshSummaryAfterUrl(url)) return;
    if (state.refreshTimer) root.clearTimeout(state.refreshTimer);
    state.refreshTimer = root.setTimeout(function () {
      state.refreshTimer = null;
      refreshSummary()
        .then(function () {
          if (typeof state.widgetRenderer === 'function') {
            var renderResult = state.widgetRenderer();
            if (renderResult && typeof renderResult.catch === 'function') renderResult.catch(function () {});
          }
        })
        .catch(function () {});
    }, 200);
  }

  async function request(path, options) {
    options = options || {};
    var headers = authHeaders(options.headers || {});
    if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    var resp = await fetch(toApiUrl(path), Object.assign({}, options, { headers: headers }));
    var data = await resp.json().catch(function () { return {}; });
    if (!resp.ok || data.ok === false) {
      throw new Error(data.error || data.message || data.msg || ('HTTP ' + resp.status));
    }
    return data;
  }

  async function login(account, password) {
    var data = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ account: account, password: password })
    });
    setToken(data.token);
    state.user = data.user || null;
    await refreshSummary().catch(function () {});
    return data;
  }

  async function register(input) {
    var data = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input || {})
    });
    setToken(data.token);
    state.user = data.user || null;
    await refreshSummary().catch(function () {});
    return data;
  }

  async function refreshSummary() {
    if (!state.token) return null;
    var data = await request('/api/account/summary');
    state.summary = data;
    state.user = data.user || state.user;
    return data;
  }

  function logout() {
    setToken('');
    state.user = null;
    state.summary = null;
  }

  function installFetchBridge() {
    if (state.installed || !root.fetch) return;
    var nativeFetch = root.fetch.bind(root);
    root.fetch = function (input, init) {
      init = init || {};
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (!shouldProxyUrl(url)) return nativeFetch(input, init);

      var nextInit = Object.assign({}, init, { headers: authHeaders(init.headers || (input && input.headers)) });
      var nextUrl = toApiUrl(url);
      if (typeof input === 'string') {
        return nativeFetch(nextUrl, nextInit).then(function (resp) {
          scheduleSummaryRefresh(url, resp.ok);
          return resp;
        });
      }
      return nativeFetch(new Request(nextUrl, Object.assign({}, input, nextInit))).then(function (resp) {
        scheduleSummaryRefresh(url, resp.ok);
        return resp;
      });
    };
    state.installed = true;
  }

  function installXhrBridge() {
    if (state.xhrInstalled || !root.XMLHttpRequest) return;
    var proto = root.XMLHttpRequest.prototype;
    var nativeOpen = proto.open;
    var nativeSend = proto.send;
    proto.open = function (method, url, async, user, password) {
      this.__canvasPlatformUrl = url;
      this.__canvasPlatformProxied = shouldProxyUrl(url);
      return nativeOpen.call(this, method, this.__canvasPlatformProxied ? toApiUrl(url) : url, async !== false, user, password);
    };
    proto.send = function (body) {
      if (this.__canvasPlatformProxied && state.token) {
        try { this.setRequestHeader('Authorization', 'Bearer ' + state.token); } catch (_) {}
        try {
          this.addEventListener('loadend', function () {
            scheduleSummaryRefresh(this.__canvasPlatformUrl, this.status >= 200 && this.status < 300);
          });
        } catch (_) {}
      }
      return nativeSend.call(this, body);
    };
    state.xhrInstalled = true;
  }

  function installBridge() {
    installFetchBridge();
    installXhrBridge();
  }

  function moneyCredits(value) {
    return String(Number(value || 0));
  }

  function mountAccountWidget(options) {
    options = options || {};
    if (document.getElementById('canvas-platform-account')) return;
    var wrap = document.createElement('div');
    wrap.id = 'canvas-platform-account';
    wrap.innerHTML = [
      '<style>',
      '#canvas-platform-account{position:fixed;right:14px;top:58px;z-index:99999;font:12px -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;color:#e5e7eb}',
      '#canvas-platform-account .cpb-btn{height:30px;border:1px solid rgba(255,255,255,.16);border-radius:8px;background:#151a24;color:#f8fafc;padding:0 10px;cursor:pointer}',
      '#canvas-platform-account .cpb-panel{display:none;width:282px;margin-top:8px;padding:12px;border:1px solid rgba(255,255,255,.14);border-radius:10px;background:rgba(7,10,16,.96);box-shadow:0 18px 48px rgba(0,0,0,.48)}',
      '#canvas-platform-account.open .cpb-panel{display:block}',
      '#canvas-platform-account input{box-sizing:border-box;width:100%;height:30px;margin:4px 0 8px;padding:0 8px;border-radius:8px;border:1px solid rgba(255,255,255,.14);background:#0f1420;color:#f8fafc}',
      '#canvas-platform-account .cpb-row{display:flex;gap:8px}.cpb-row>*{flex:1}.cpb-muted{color:#94a3b8}.cpb-err{color:#fb7185;min-height:18px}.cpb-ok{color:#34d399}',
      '#canvas-platform-account .cpb-qr{word-break:break-all;padding:8px;border-radius:8px;background:#0f1420;color:#cbd5e1}',
      '</style>',
      '<button class="cpb-btn" data-cpb-toggle>账户</button>',
      '<div class="cpb-panel" data-cpb-panel></div>'
    ].join('');
    document.body.appendChild(wrap);

    wrap.querySelector('[data-cpb-toggle]').addEventListener('click', function () {
      wrap.classList.toggle('open');
      renderWidget();
    });

    async function renderWidget() {
      var panel = wrap.querySelector('[data-cpb-panel]');
      if (!panel) return;
      if (!state.token) {
        panel.innerHTML = [
          '<label class="cpb-muted">API 地址</label><input data-cpb-api value="' + escapeHtml(state.apiBase) + '">',
          '<label class="cpb-muted">账号</label><input data-cpb-account placeholder="手机号 / 邮箱">',
          '<label class="cpb-muted">密码</label><input data-cpb-password type="password" placeholder="至少 6 位">',
          '<div class="cpb-row"><button class="cpb-btn" data-cpb-login>登录</button><button class="cpb-btn" data-cpb-register>注册</button></div>',
          '<div class="cpb-err" data-cpb-msg></div>'
        ].join('');
        bindAuth(panel);
        return;
      }

      var summary = state.summary || await refreshSummary().catch(function () { return null; });
      var wallet = summary && summary.wallet ? summary.wallet : {};
      var user = summary && summary.user ? summary.user : state.user || {};
      panel.innerHTML = [
        '<div><b>' + escapeHtml(user.nickname || user.phone || '已登录') + '</b></div>',
        '<div class="cpb-muted">余额：<span class="cpb-ok">' + moneyCredits(wallet.balance) + '</span> 积分</div>',
        '<div class="cpb-row" style="margin-top:10px"><button class="cpb-btn" data-cpb-refresh>刷新</button><button class="cpb-btn" data-cpb-logout>退出</button></div>',
        '<hr style="border:0;border-top:1px solid rgba(255,255,255,.1);margin:12px 0">',
        '<label class="cpb-muted">充值兑换码</label><input data-cpb-voucher placeholder="输入后台或代理给你的兑换码">',
        '<div class="cpb-row"><button class="cpb-btn" data-cpb-redeem>兑换充值</button></div>',
        '<div class="cpb-qr" data-cpb-result style="display:none"></div>',
        '<div class="cpb-err" data-cpb-msg></div>'
      ].join('');
      bindAccount(panel);
    }

    state.widgetRenderer = renderWidget;

    function bindAuth(panel) {
      var msg = panel.querySelector('[data-cpb-msg]');
      function values() {
        setApiBase(panel.querySelector('[data-cpb-api]').value);
        return {
          account: panel.querySelector('[data-cpb-account]').value.trim(),
          password: panel.querySelector('[data-cpb-password]').value
        };
      }
      panel.querySelector('[data-cpb-login]').addEventListener('click', async function () {
        try {
          var v = values();
          await login(v.account, v.password);
          if (shouldReloadOnAuth(options)) { root.location.reload(); return; }
          await renderWidget();
        } catch (err) { msg.textContent = err.message || String(err); }
      });
      panel.querySelector('[data-cpb-register]').addEventListener('click', async function () {
        try {
          var v = values();
          await register({ phone: v.account, password: v.password, nickname: v.account });
          if (shouldReloadOnAuth(options)) { root.location.reload(); return; }
          await renderWidget();
        } catch (err) { msg.textContent = err.message || String(err); }
      });
    }

    function bindAccount(panel) {
      var msg = panel.querySelector('[data-cpb-msg]');
      var resultBox = panel.querySelector('[data-cpb-result]');
      panel.querySelector('[data-cpb-refresh]').addEventListener('click', async function () {
        try { await refreshSummary(); await renderWidget(); } catch (err) { msg.textContent = err.message || String(err); }
      });
      panel.querySelector('[data-cpb-logout]').addEventListener('click', function () {
        logout();
        renderWidget();
      });
      panel.querySelector('[data-cpb-redeem]').addEventListener('click', async function () {
        try {
          var code = String(panel.querySelector('[data-cpb-voucher]').value || '').trim();
          if (!code) throw new Error('请输入充值兑换码');
          var data = await request('/api/recharge/vouchers/redeem', { method: 'POST', body: JSON.stringify({ code: code }) });
          await refreshSummary();
          resultBox.style.display = 'block';
          resultBox.textContent = '兑换成功，到账 ' + moneyCredits(data.order && data.order.credits || 0) + ' 积分';
          msg.textContent = '';
        } catch (err) { msg.textContent = err.message || String(err); }
      });
    }

    if (options.open) wrap.classList.add('open');
    renderWidget();
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function shouldReloadOnAuth(options) {
    return options.reloadOnAuth !== false && root.CANVAS_PLATFORM_RELOAD_ON_LOGIN !== false;
  }

  var client = {
    state: state,
    setApiBase: setApiBase,
    setToken: setToken,
    getToken: function () { return state.token; },
    logout: logout,
    request: request,
    login: login,
    register: register,
    me: function () { return request('/api/auth/me'); },
    summary: refreshSummary,
    wallet: function () { return request('/api/account/wallet'); },
    models: function (type) { return request('/api/models' + (type ? '?type=' + encodeURIComponent(type) : '')); },
    createRechargeOrder: function (amountYuan) { return request('/api/recharge/orders', { method: 'POST', body: JSON.stringify({ amountYuan: amountYuan }) }); },
    mockPay: function (orderNo) { return request('/api/recharge/orders/' + encodeURIComponent(orderNo) + '/mock-pay', { method: 'POST' }); },
    redeemVoucher: function (code) { return request('/api/recharge/vouchers/redeem', { method: 'POST', body: JSON.stringify({ code: code }) }); },
    generateImage: function (payload) { return request('/api/generate/image', { method: 'POST', body: JSON.stringify(payload || {}) }); },
    startVideo: function (payload) { return request('/api/generate/video/start', { method: 'POST', body: JSON.stringify(payload || {}) }); },
    videoStatus: function (payload) { return request('/api/generate/video/status', { method: 'POST', body: JSON.stringify(payload || {}) }); },
    chat: function (payload) { return request('/api/generate/llm/chat', { method: 'POST', body: JSON.stringify(payload || {}) }); },
    installBridge: installBridge,
    mountAccountWidget: mountAccountWidget
  };

  root.CanvasPlatform = client;
  installBridge();
  if (root.CANVAS_PLATFORM_AUTO_WIDGET !== false) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { mountAccountWidget(); });
    else mountAccountWidget();
  }
})(window);
