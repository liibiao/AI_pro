const appUrl = process.env.APP_URL || 'http://127.0.0.1:5174';
const apiUrl = process.env.API_URL || 'http://127.0.0.1:4000';
const cdpUrl = process.env.CHROME_CDP_URL || 'http://127.0.0.1:9223';
const account = process.env.ADMIN_ACCOUNT || '13800000000';
const password = process.env.ADMIN_PASSWORD || 'admin123456';

const checks = [];

function assertText(text, expected, label) {
  const ok = text.replace(/\s+/g, '').includes(expected.replace(/\s+/g, ''));
  checks.push({ ok, label, expected });
  if (!ok) throw new Error(`${label}: missing "${expected}"`);
}

async function loginToken() {
  const resp = await fetch(`${apiUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account, password }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`login failed: ${resp.status} ${JSON.stringify(data)}`);
  return data.token;
}

async function cdpTarget() {
  const targets = await fetch(`${cdpUrl}/json`).then(resp => resp.json());
  const target = targets.find(item => item.type === 'page') || targets[0];
  if (!target?.webSocketDebuggerUrl) throw new Error('Chrome CDP page target not found');
  return target.webSocketDebuggerUrl;
}

async function createClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const msg = JSON.parse(event.data);
    if (!msg.id) return;
    const item = pending.get(msg.id);
    if (!item) return;
    pending.delete(msg.id);
    if (msg.error) item.reject(new Error(JSON.stringify(msg.error)));
    else item.resolve(msg.result);
  });
  return {
    send(method, params = {}) {
      const current = ++id;
      ws.send(JSON.stringify({ id: current, method, params }));
      return new Promise((resolve, reject) => pending.set(current, { resolve, reject }));
    },
    close() {
      ws.close();
    },
  };
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Runtime exception');
  return result.result?.value;
}

async function waitReady(client) {
  await evaluate(client, `new Promise(resolve => {
    if (document.readyState === 'complete') resolve(true);
    else window.addEventListener('load', () => resolve(true), { once: true });
  })`);
}

async function pageText(client) {
  return evaluate(client, 'document.body.innerText');
}

async function waitForExpectations(client, expectations, label) {
  let text = '';
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5000) {
    text = await pageText(client);
    const compact = text.replace(/\s+/g, '');
    if (expectations.every(expected => compact.includes(expected.replace(/\s+/g, '')))) return text;
    await evaluate(client, 'new Promise(resolve => setTimeout(resolve, 250))');
  }
  for (const expected of expectations) assertText(text, expected, label);
  return text;
}

async function clickText(client, label) {
  return evaluate(client, `(async () => {
    const candidates = Array.from(document.querySelectorAll('button, [role="menuitem"], .ant-menu-item, .ant-tabs-tab, .ant-modal-close, .ant-select-selector'));
    const el = candidates.find(item => (item.innerText || item.textContent || '').replace(/\\s+/g, '').includes(${JSON.stringify(label.replace(/\s+/g, ''))}));
    if (!el) return false;
    el.click();
    await new Promise(resolve => setTimeout(resolve, 250));
    return true;
  })()`);
}

async function openMenu(client, label, expectations) {
  const clicked = await clickText(client, label);
  if (!clicked) throw new Error(`menu not found: ${label}`);
  const text = await waitForExpectations(client, expectations, `${label} page`);
  for (const expected of expectations) assertText(text, expected, `${label} page`);
}

async function openAndCloseModal(client, buttonLabel, expectations) {
  const opened = await clickText(client, buttonLabel);
  if (!opened) throw new Error(`button not found: ${buttonLabel}`);
  const modalText = await waitForExpectations(client, expectations, `${buttonLabel} modal`);
  for (const expected of expectations) assertText(modalText, expected, `${buttonLabel} modal`);
  await clickText(client, '取消');
}

async function main() {
  const token = await loginToken();
  const client = await createClient(await cdpTarget());
  try {
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Page.navigate', { url: appUrl });
    await waitReady(client);
    await evaluate(client, `localStorage.setItem('ai_admin_token', ${JSON.stringify(token)}); location.reload();`);
    await waitReady(client);

    await openMenu(client, '数据概览', ['用户数', '代理数', '成功调用']);
    await openMenu(client, '用户管理', ['新增用户', '重置密码']);
    await openAndCloseModal(client, '新增用户', ['手机号', '昵称', '角色']);
    await openMenu(client, '充值管理', ['扫码充值', '充值订单', '生成二维码']);
    await openMenu(client, '模型管理', ['模型列表', '上游渠道', '调用记录']);
    await openMenu(client, '会员套餐', ['新增套餐', '编辑']);
    await openAndCloseModal(client, '新增套餐', ['价格积分', '有效天数']);
    await openMenu(client, '会员账号池', ['批量生成', '会员账号池']);
    await openMenu(client, '代理管理', ['代理列表', '客户数', '待结佣金']);
    await openMenu(client, '代理工作台', ['客户数', '我的客户', '核销账号']);
    await openMenu(client, '体验卡', ['体验卡', '批量生成']);
    await openMenu(client, '佣金结算', ['佣金明细', '结算单', '按代理结算']);
    await openAndCloseModal(client, '按代理结算', ['代理', '备注']);
    await openMenu(client, '系统设置', ['支付和充值', '支付宝网页二维码', '保存设置']);
    await openMenu(client, '操作日志', ['管理员', '动作', '时间']);

    console.log(JSON.stringify({ ok: true, checks }, null, 2));
  } finally {
    client.close();
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
