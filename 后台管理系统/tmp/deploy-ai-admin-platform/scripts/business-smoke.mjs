const base = process.env.API_BASE || 'http://127.0.0.1:4000';
const adminAccount = process.env.SMOKE_ADMIN_ACCOUNT || '13800000000';
const adminPassword = process.env.SMOKE_ADMIN_PASSWORD || 'admin123456';
const rand = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const agentPhone = `17${rand.slice(-9)}`;
const customerPhone = `16${rand.slice(-9)}`;
const agentPassword = `Aa${rand}!x`;
const jsonHeaders = { 'Content-Type': 'application/json' };

async function api(path, options = {}, token) {
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      ...jsonHeaders,
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function assert(ok, step, detail) {
  if (!ok) {
    console.log(JSON.stringify({ ok: false, step, detail: summarize(detail) }, null, 2));
    process.exit(1);
  }
}

function summarize(value) {
  if (!value || typeof value !== 'object') return value;
  if ('body' in value) {
    return {
      status: value.status,
      code: value.body?.code || null,
      error: value.body?.error || null,
    };
  }
  return value;
}

async function main() {
  const adminLogin = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ account: adminAccount, password: adminPassword }),
  });
  assert(adminLogin.status === 200 && adminLogin.body.token, 'admin login', adminLogin);
  const adminToken = adminLogin.body.token;

  const agentReg = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ phone: agentPhone, password: agentPassword, nickname: 'smoke-agent' }),
  });
  assert(agentReg.status === 200 && agentReg.body.user?.id, 'agent user register', agentReg);

  const createdAgent = await api('/api/admin/agents', {
    method: 'POST',
    body: JSON.stringify({
      userId: agentReg.body.user.id,
      name: `烟测代理${rand.slice(-4)}`,
      level: 'FOUNDER',
      commissionRate: 0.1,
      settlementDelayDays: 1,
    }),
  }, adminToken);
  assert(createdAgent.status === 200 && createdAgent.body.agent?.id, 'create agent', createdAgent);
  const agentId = createdAgent.body.agent.id;

  const agentLogin = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ account: agentPhone, password: agentPassword }),
  });
  assert(agentLogin.status === 200 && agentLogin.body.token, 'agent login', agentLogin);
  const agentToken = agentLogin.body.token;

  const customer = await api('/api/agent/customers', {
    method: 'POST',
    body: JSON.stringify({ customerPhone, customerName: 'smoke-customer' }),
  }, agentToken);
  assert(customer.status === 200 && customer.body.customer?.userId && customer.body.initialPassword, 'create customer', customer);
  const customerId = customer.body.customer.userId;
  const customerPassword = customer.body.initialPassword;

  const customerLogin = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ account: customerPhone, password: customerPassword }),
  });
  assert(customerLogin.status === 200 && customerLogin.body.token, 'customer login', customerLogin);
  const customerToken = customerLogin.body.token;

  const voucherRequest = await api('/api/agent/credit-voucher-requests', {
    method: 'POST',
    body: JSON.stringify({
      userId: customerId,
      credits: 40,
      amountCents: 40,
      validDays: 7,
      transferChannel: 'smoke',
      transferNo: `voucher-request-${rand}`,
      remark: 'smoke voucher request',
    }),
  }, agentToken);
  assert(voucherRequest.status === 200 && voucherRequest.body.request?.id, 'create agent voucher request', voucherRequest);
  const voucherRequestId = voucherRequest.body.request.id;

  const adminVoucherRequests = await api('/api/admin/agent-credit/voucher-requests', { method: 'GET' }, adminToken);
  assert(
    adminVoucherRequests.status === 200 && adminVoucherRequests.body.items?.some(item => item.id === voucherRequestId),
    'admin list agent voucher requests',
    adminVoucherRequests,
  );

  const approveVoucherRequest = await api(`/api/admin/agent-credit/voucher-requests/${voucherRequestId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ remark: 'smoke approve voucher request' }),
  }, adminToken);
  assert(approveVoucherRequest.status === 200 && approveVoucherRequest.body.code, 'approve agent voucher request', approveVoucherRequest);

  const revealVoucherRequestCode = await api(`/api/agent/credit-voucher-requests/${voucherRequestId}/reveal-code`, {
    method: 'POST',
    body: JSON.stringify({}),
  }, agentToken);
  assert(revealVoucherRequestCode.status === 200 && revealVoucherRequestCode.body.code, 'agent reveal approved voucher code', revealVoucherRequestCode);
  assert(revealVoucherRequestCode.body.code === approveVoucherRequest.body.code, 'approved and revealed voucher code match', {
    approved: approveVoucherRequest.body.code,
    revealed: revealVoucherRequestCode.body.code,
  });

  const revealVoucherRequestCodeAgain = await api(`/api/agent/credit-voucher-requests/${voucherRequestId}/reveal-code`, {
    method: 'POST',
    body: JSON.stringify({}),
  }, agentToken);
  assert(revealVoucherRequestCodeAgain.status >= 400, 'agent voucher code reveal is one-time', revealVoucherRequestCodeAgain);

  const requestVoucherRedeem = await api('/api/recharge/vouchers/redeem', {
    method: 'POST',
    body: JSON.stringify({ code: revealVoucherRequestCode.body.code }),
  }, customerToken);
  assert(requestVoucherRedeem.status === 200, 'redeem approved request voucher', requestVoucherRedeem);

  const plans = await api('/api/membership/plans', { method: 'GET' }, adminToken);
  assert(plans.status === 200 && Array.isArray(plans.body.items) && plans.body.items.length, 'membership plans', plans);
  const plan = plans.body.items.find(item => item.status === 'ACTIVE') || plans.body.items[0];

  const batch = await api('/api/membership/member-accounts/batch-create', {
    method: 'POST',
    body: JSON.stringify({ planId: plan.id, quantity: 1 }),
  }, adminToken);
  assert(batch.status === 200, 'batch create member account', batch);

  const claim = await api('/api/agent/accounts/claim', {
    method: 'POST',
    body: JSON.stringify({ quantity: 1 }),
  }, agentToken);
  assert(claim.status === 200 && claim.body.accounts?.[0]?.code, 'agent claim account', claim);

  const redeemBody = JSON.stringify({ code: claim.body.accounts[0].code, userId: customerId });
  const [redeemA, redeemB] = await Promise.all([
    api('/api/agent/accounts/redeem', { method: 'POST', body: redeemBody }, agentToken),
    api('/api/agent/accounts/redeem', { method: 'POST', body: redeemBody }, agentToken),
  ]);
  const memberRedeemStatuses = [redeemA.status, redeemB.status].sort((a, b) => a - b);
  assert(memberRedeemStatuses[0] === 200 && memberRedeemStatuses[1] >= 400, 'concurrent member redeem guarded', {
    memberRedeemStatuses,
    codes: [redeemA.body.code || null, redeemB.body.code || null],
  });

  const grant = await api('/api/admin/agent-credit/grants', {
    method: 'POST',
    body: JSON.stringify({ agentId, credits: 120, amountCents: 120, transferChannel: 'smoke', transferNo: `smoke-${rand}` }),
  }, adminToken);
  assert(grant.status === 200, 'grant agent credits', grant);

  const voucher = await api('/api/agent/credit-vouchers', {
    method: 'POST',
    body: JSON.stringify({ userId: customerId, credits: 60, amountCents: 60, validDays: 7 }),
  }, agentToken);
  assert(voucher.status === 200 && voucher.body.code, 'create agent voucher', voucher);

  const voucherBody = JSON.stringify({ code: voucher.body.code });
  const [voucherA, voucherB] = await Promise.all([
    api('/api/recharge/vouchers/redeem', { method: 'POST', body: voucherBody }, customerToken),
    api('/api/recharge/vouchers/redeem', { method: 'POST', body: voucherBody }, customerToken),
  ]);
  const voucherRedeemStatuses = [voucherA.status, voucherB.status].sort((a, b) => a - b);
  assert(voucherRedeemStatuses[0] === 200 && voucherRedeemStatuses[1] >= 400, 'concurrent voucher redeem guarded', {
    voucherRedeemStatuses,
    codes: [voucherA.body.code || null, voucherB.body.code || null],
  });

  const accounting = await api(`/api/admin/agent-credit/agents/${agentId}/accounting`, { method: 'GET' }, adminToken);
  assert(accounting.status === 200 && accounting.body.agent?.id === agentId, 'agent accounting detail', accounting);
  assert(accounting.body.stats?.customerCount >= 1, 'agent accounting customer stats', accounting);
  assert(Array.isArray(accounting.body.ledger) && accounting.body.ledger.length >= 2, 'agent accounting ledger', accounting);
  assert(Array.isArray(accounting.body.vouchers) && accounting.body.vouchers.length >= 1, 'agent accounting vouchers', accounting);
  assert(Array.isArray(accounting.body.voucherRequests) && accounting.body.voucherRequests.length >= 1, 'agent accounting voucher requests', accounting);
  assert(Array.isArray(accounting.body.reconciliationOrders) && accounting.body.reconciliationOrders.length >= 1, 'agent accounting reconciliation orders', accounting);

  console.log(JSON.stringify({
    ok: true,
    base,
    agentCreated: true,
    customerBound: true,
    voucherRequestApproved: true,
    memberRedeemStatuses,
    voucherRedeemStatuses,
    accountingDetail: true,
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
