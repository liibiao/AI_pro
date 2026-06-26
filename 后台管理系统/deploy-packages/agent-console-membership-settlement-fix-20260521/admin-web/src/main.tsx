import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, ConfigProvider, Form, Input, InputNumber, Layout, Menu, Modal, Popconfirm, Progress, Select, Space, Statistic, Table, Tabs, Tag, App as AntApp, message } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { api, clearToken, getToken, money, setToken } from './api';
import './styles.css';

const queryClient = new QueryClient();
const { Header, Sider, Content } = Layout;

type ApiList<T> = { ok: true; items: T[]; total?: number };

function Login({ onDone }: { onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function submit(values: { account: string; password: string }) {
    setLoading(true);
    setError('');
    try {
      const data = await api<{ token: string }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ account: values.account.trim(), password: values.password }) });
      setToken(data.token);
      onDone();
    } catch (err) {
      const messageText = err instanceof Error ? err.message : '登录失败';
      setError(messageText);
      message.error(messageText);
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="loginPage">
      <Card className="loginCard" title="AI 后台管理系统">
        <Form layout="vertical" onFinish={submit}>
          {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
          <Form.Item name="account" label="账号" rules={[{ required: true }]}>
            <Input placeholder="手机号或邮箱" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true }]}>
            <Input.Password placeholder="密码" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>登录</Button>
        </Form>
      </Card>
    </div>
  );
}

type UserRole = 'USER' | 'AGENT' | 'ADMIN' | 'SUPER_ADMIN';

type MenuItem = {
  key: string;
  label: string;
  roles?: UserRole[];
};

function Shell() {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<{ user: { nickname: string; role: UserRole } }>('/api/auth/me') });
  const role = me.data?.user.role;
  const visibleMenuItems = useMemo(() => getMenuItemsByRole(role), [role]);
  const [page, setPage] = useState('dashboard');
  const title = useMemo(() => visibleMenuItems.find(x => x.key === page)?.label || '后台', [page, visibleMenuItems]);

  useEffect(() => {
    if (!role || visibleMenuItems.length === 0) return;
    if (!visibleMenuItems.some(item => item.key === page)) {
      setPage(visibleMenuItems[0].key);
    }
  }, [page, role, visibleMenuItems]);

  return (
    <Layout className="appShell">
      <Sider width={220} theme="light">
        <div className="brand">AI Admin</div>
        <Menu selectedKeys={[page]} mode="inline" items={visibleMenuItems} onClick={e => setPage(e.key)} />
      </Sider>
      <Layout>
        <Header className="top">
          <div className="pageTitle">{title}</div>
          <Space>
            <span>{me.data?.user.nickname}</span>
            <Tag>{me.data?.user.role}</Tag>
            <Button onClick={() => { clearToken(); location.reload(); }}>退出</Button>
          </Space>
        </Header>
        <Content className="content">
          {page === 'dashboard' && <Dashboard />}
          {page === 'accountCenter' && <AccountCenter />}
          {page === 'users' && <Users />}
          {page === 'wallets' && <Wallets />}
          {page === 'recharges' && <Recharges />}
          {page === 'generationResults' && <GenerationResults />}
          {page === 'generateLab' && <GenerateLab />}
          {page === 'models' && <Models />}
          {page === 'dataPacks' && <DataPacks />}
          {page === 'membershipPlans' && <MembershipPlans />}
          {page === 'agents' && <Agents />}
          {page === 'agentCredit' && <AgentCreditAdmin />}
          {page === 'agentConsole' && <AgentConsole />}
          {page === 'trialCards' && <TrialCards />}
          {page === 'commissions' && <Commissions />}
          {page === 'systemSettings' && <SystemSettings />}
          {page === 'memberAccounts' && <MemberAccounts />}
          {page === 'logs' && <AdminLogs />}
        </Content>
      </Layout>
    </Layout>
  );
}

const menuItems: MenuItem[] = [
  { key: 'dashboard', label: '数据概览', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { key: 'accountCenter', label: '账户中心' },
  { key: 'users', label: '用户管理', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { key: 'wallets', label: '钱包流水', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { key: 'recharges', label: '线下充值码', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { key: 'generationResults', label: '生图生视频结果', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { key: 'generateLab', label: '生成联调' },
  { key: 'models', label: '模型管理', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { key: 'dataPacks', label: '创作库数据包', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { key: 'membershipPlans', label: '会员套餐', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { key: 'memberAccounts', label: '会员账号池', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { key: 'agents', label: '代理管理', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { key: 'agentCredit', label: '代理额度', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { key: 'agentConsole', label: '代理工作台', roles: ['AGENT'] },
  { key: 'trialCards', label: '体验卡', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { key: 'commissions', label: '佣金结算', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { key: 'systemSettings', label: '系统设置', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { key: 'logs', label: '操作日志', roles: ['ADMIN', 'SUPER_ADMIN'] },
];

function getMenuItemsByRole(role?: UserRole) {
  if (!role) return [];
  return menuItems.filter(item => !item.roles || item.roles.includes(role));
}

function Dashboard() {
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Record<string, number>>('/api/dashboard') });
  const data = q.data || {};
  return (
    <div className="grid4">
      <Card><Statistic title="用户数" value={data.users || 0} /></Card>
      <Card><Statistic title="代理数" value={data.agents || 0} /></Card>
      <Card><Statistic title="成功调用" value={data.usages || 0} /></Card>
      <Card><Statistic title="失败调用" value={data.failedUsages || 0} /></Card>
      <Card><Statistic title="消耗积分" value={data.chargedCredits || 0} suffix="积分" /></Card>
      <Card><Statistic title="充值积分" value={data.rechargeCredits || 0} suffix="积分" /></Card>
      <Card><Statistic title="核销数" value={data.redemptions || 0} /></Card>
      <Card><Statistic title="佣金" value={data.commissionAmount || 0} suffix="积分" /></Card>
    </div>
  );
}

function AccountCenter() {
  const summary = useQuery({ queryKey: ['accountSummary'], queryFn: () => api<any>('/api/account/summary') });
  const plans = useQuery({ queryKey: ['membershipPlans'], queryFn: () => api<ApiList<any>>('/api/membership/plans') });
  const logs = useQuery({ queryKey: ['accountWalletLogs'], queryFn: () => api<ApiList<any>>('/api/account/wallet/logs') });
  const usages = useQuery({ queryKey: ['accountUsages'], queryFn: () => api<ApiList<any>>('/api/account/usages') });
  const qc = useQueryClient();
  const purchase = useMutation({
    mutationFn: (planId: string) => api('/api/membership/purchase', { method: 'POST', body: JSON.stringify({ planId }) }),
    onSuccess: () => {
      message.success('会员购买成功');
      ['accountSummary', 'accountWalletLogs', 'accountUsages', 'wallets', 'commissions'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    },
    onError: err => message.error(err instanceof Error ? err.message : '购买失败'),
  });
  const redeemTrial = useMutation({
    mutationFn: (values: { code: string }) => api('/api/trial-cards/redeem', { method: 'POST', body: JSON.stringify(values) }),
    onSuccess: () => {
      message.success('体验卡兑换成功');
      ['accountSummary', 'accountWalletLogs', 'accountUsages'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    },
    onError: err => message.error(err instanceof Error ? err.message : '兑换失败'),
  });
  const redeemVoucher = useMutation({
    mutationFn: (values: { code: string }) => api('/api/recharge/vouchers/redeem', { method: 'POST', body: JSON.stringify(values) }),
    onSuccess: () => {
      message.success('充值兑换码兑换成功');
      ['accountSummary', 'accountWalletLogs', 'rechargeOrders', 'agentCreditSummary', 'agentCreditVouchers'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    },
    onError: err => message.error(err instanceof Error ? err.message : '兑换失败'),
  });
  const redeemMembershipCode = useMutation({
    mutationFn: (values: { code: string }) => api('/api/membership-vouchers/redeem', { method: 'POST', body: JSON.stringify(values) }),
    onSuccess: () => {
      message.success('会员兑换成功');
      ['accountSummary', 'memberAccounts', 'agentRedemptions', 'commissions'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    },
    onError: err => message.error(err instanceof Error ? err.message : '兑换失败'),
  });
  const data = summary.data || {};
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div className="grid4">
        <Card><Statistic title="余额" value={data.wallet?.balance || 0} suffix="积分" /></Card>
        <Card><Statistic title="当前会员" value={data.membership?.plan?.name || '未开通'} /></Card>
        <Card><Statistic title="最近生成" value={data.recentUsages?.length || 0} /></Card>
        <Card><Statistic title="最近充值" value={data.recentRecharges?.length || 0} /></Card>
      </div>
      <Card title="会员套餐">
        <Table rowKey="id" loading={plans.isLoading} dataSource={(plans.data?.items || []).filter((p: any) => p.status === 'ACTIVE')} columns={[
          { title: '名称', dataIndex: 'name' },
          { title: '价格', dataIndex: 'price', render: money },
          { title: '有效天数', dataIndex: 'durationDays' },
          { title: '操作', render: (_, row) => <Button type="primary" size="small" loading={purchase.isPending} onClick={() => purchase.mutate(row.id)}>余额购买</Button> },
        ]} />
      </Card>
      <Card title="体验卡兑换">
        <Form layout="inline" onFinish={values => redeemTrial.mutate(values as { code: string })}>
          <Form.Item name="code" rules={[{ required: true }]} style={{ minWidth: 320 }}>
            <Input placeholder="输入体验卡码" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={redeemTrial.isPending}>兑换</Button>
        </Form>
      </Card>
      <Card title="充值兑换码兑换">
        <Form layout="inline" onFinish={values => redeemVoucher.mutate(values as { code: string })}>
          <Form.Item name="code" rules={[{ required: true }]} style={{ minWidth: 320 }}>
            <Input placeholder="输入后台或代理给你的充值兑换码" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={redeemVoucher.isPending}>兑换充值</Button>
        </Form>
      </Card>
      <Card title="会员兑换码兑换">
        <Form layout="inline" onFinish={values => redeemMembershipCode.mutate(values as { code: string })}>
          <Form.Item name="code" rules={[{ required: true }]} style={{ minWidth: 320 }}>
            <Input placeholder="输入会员兑换码" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={redeemMembershipCode.isPending}>兑换会员</Button>
        </Form>
      </Card>
      <Tabs items={[
        { key: 'logs', label: '钱包流水', children: <Table rowKey="id" loading={logs.isLoading} dataSource={logs.data?.items || []} columns={[
          { title: '类型', dataIndex: 'type' },
          { title: '金额', dataIndex: 'amount', render: money },
          { title: '前余额', dataIndex: 'balanceBefore', render: money },
          { title: '后余额', dataIndex: 'balanceAfter', render: money },
          { title: '备注', dataIndex: 'remark' },
          { title: '时间', dataIndex: 'createdAt', render: dateTime },
        ]} /> },
        { key: 'usages', label: '生成记录', children: <Table rowKey="id" loading={usages.isLoading} dataSource={usages.data?.items || []} columns={[
          { title: '模型', dataIndex: ['model', 'displayName'] },
          { title: '类型', dataIndex: 'modelType' },
          { title: '扣费', dataIndex: 'chargedCredits', render: money },
          { title: '状态', dataIndex: 'status' },
          { title: '提示词', dataIndex: 'prompt', ellipsis: true },
          { title: '时间', dataIndex: 'createdAt', render: dateTime },
        ]} /> },
      ]} />
    </Space>
  );
}

function Users() {
  const q = useQuery({ queryKey: ['users'], queryFn: () => api<ApiList<any>>('/api/users') });
  const qc = useQueryClient();
  const status = useMutation({
    mutationFn: (input: { id: string; status: 'ACTIVE' | 'DISABLED' }) => api(`/api/users/${input.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: input.status }) }),
    onSuccess: () => { message.success('用户状态已更新'); qc.invalidateQueries({ queryKey: ['users'] }); },
    onError: err => message.error(err instanceof Error ? err.message : '更新失败'),
  });
  return <Card extra={<CreateUserButton />}><Table rowKey="id" loading={q.isLoading} dataSource={q.data?.items || []} columns={[
    { title: '昵称', dataIndex: 'nickname' },
    { title: '手机号', dataIndex: 'phone' },
    { title: '邮箱', dataIndex: 'email' },
    { title: '角色', dataIndex: 'role', render: (v) => <Tag>{v}</Tag> },
    { title: '状态', dataIndex: 'status', render: (v) => <UserStatusTag status={v} /> },
    { title: '绑定代理', render: (_, row) => row.agent?.name || '-' },
    { title: '余额', dataIndex: ['wallet', 'balance'], render: (v) => money(v || 0) },
    { title: '创建时间', dataIndex: 'createdAt', render: dateTime },
    {
      title: '操作',
      render: (_, row) => {
        const next = row.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
        return (
          <Space>
            <Button size="small" loading={status.isPending} onClick={() => Modal.confirm({
              title: next === 'DISABLED' ? '禁用用户' : '启用用户',
              content: `${next === 'DISABLED' ? '禁用后该用户不能登录和消费。' : '启用后该用户可正常登录。'}账号：${row.nickname}`,
              onOk: () => status.mutateAsync({ id: row.id, status: next }),
            })}>{next === 'DISABLED' ? '禁用' : '启用'}</Button>
            <ResetUserPasswordButton user={row} />
          </Space>
        );
      },
    },
  ]} /></Card>;
}

function UserStatusTag({ status }: { status: string }) {
  return <Tag color={status === 'ACTIVE' ? 'green' : 'red'}>{status}</Tag>;
}

function CreateUserButton() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (values: any) => api<{ initialPassword?: string }>('/api/users', { method: 'POST', body: JSON.stringify(values) }),
    onSuccess: data => {
      message.success('用户已创建');
      if (data.initialPassword) Modal.success({ title: '初始密码', content: `请交给用户：${data.initialPassword}` });
      setOpen(false);
      form.resetFields();
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: err => message.error(err instanceof Error ? err.message : '创建失败'),
  });
  return (
    <>
      <Button type="primary" onClick={() => setOpen(true)}>新增用户</Button>
      <Modal title="新增用户" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={m.isPending}>
        <Form form={form} layout="vertical" initialValues={{ role: 'USER', status: 'ACTIVE' }} onFinish={values => m.mutate(values)}>
          <Form.Item name="phone" label="手机号"><Input /></Form.Item>
          <Form.Item name="email" label="邮箱"><Input /></Form.Item>
          <Form.Item name="nickname" label="昵称" rules={[{ required: true }]}><Input /></Form.Item>
          <div className="formGrid2">
            <Form.Item name="role" label="角色" rules={[{ required: true }]}>
              <Select options={[
                { value: 'USER', label: '普通用户' },
                { value: 'ADMIN', label: '管理员' },
                { value: 'SUPER_ADMIN', label: '超级管理员' },
              ]} />
            </Form.Item>
            <Form.Item name="status" label="状态" rules={[{ required: true }]}>
              <Select options={[{ value: 'ACTIVE', label: '启用' }, { value: 'DISABLED', label: '禁用' }]} />
            </Form.Item>
          </div>
          <Form.Item name="password" label="密码" extra="留空时系统自动生成初始密码">
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function ResetUserPasswordButton({ user }: { user: any }) {
  const m = useMutation({
    mutationFn: () => api<{ initialPassword?: string }>(`/api/users/${user.id}/password`, { method: 'PATCH', body: JSON.stringify({}) }),
    onSuccess: data => Modal.success({ title: '新密码', content: data.initialPassword ? `请交给用户：${data.initialPassword}` : '密码已重置' }),
    onError: err => message.error(err instanceof Error ? err.message : '重置失败'),
  });
  return <Button size="small" loading={m.isPending} onClick={() => Modal.confirm({
    title: '重置密码',
    content: `系统会生成一个新密码，账号：${user.nickname}`,
    onOk: () => m.mutateAsync(),
  })}>重置密码</Button>;
}

function Wallets() {
  const q = useQuery({ queryKey: ['wallets'], queryFn: () => api<ApiList<any>>('/api/wallets') });
  return <Card><Table rowKey="id" loading={q.isLoading} dataSource={q.data?.items || []} columns={[
    { title: '用户', dataIndex: ['user', 'nickname'] },
    { title: '手机号', dataIndex: ['user', 'phone'] },
    { title: '余额', dataIndex: 'balance', render: money },
    { title: '更新时间', dataIndex: 'updatedAt', render: dateTime },
    { title: '操作', render: (_, row) => <AdjustWalletButton userId={row.userId} /> },
  ]} /></Card>;
}

function yuan(amountCents: number) {
  return `￥${(amountCents / 100).toFixed(2)}`;
}

const OFFLINE_CREDITS_PER_CNY = 100;

function creditsFromYuan(value: unknown) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * OFFLINE_CREDITS_PER_CNY);
}

function membershipCardAmountYuan(plans: any[] | undefined, planId: unknown, quantity: unknown, discountRate: unknown) {
  const plan = (plans || []).find((item: any) => item.id === planId);
  const price = Number(plan?.price || 0);
  const qty = Number(quantity || 0);
  const discount = Number(discountRate || 0);
  if (!Number.isFinite(price) || !Number.isFinite(qty) || !Number.isFinite(discount) || price <= 0 || qty <= 0 || discount <= 0) return undefined;
  return Math.ceil(price * qty * discount) / 100;
}

function dateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', { hour12: false });
}

function RechargeStatus({ status }: { status: string }) {
  const color: Record<string, string> = { PENDING: 'gold', PAID: 'green', CLOSED: 'default', FAILED: 'red' };
  return <Tag color={color[status] || 'default'}>{status}</Tag>;
}

function Recharges() {
  const [createdCode, setCreatedCode] = useState('');
  const [form] = Form.useForm();
  const amountYuan = Form.useWatch('amountYuan', form);
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ['usersForRechargeVouchers'], queryFn: () => api<ApiList<any>>('/api/users') });
  const vouchers = useQuery({ queryKey: ['adminRechargeVouchers'], queryFn: () => api<ApiList<any>>('/api/admin/recharge-vouchers') });
  const orders = useQuery({
    queryKey: ['rechargeOrders'],
    queryFn: () => api<ApiList<any>>('/api/recharge/orders'),
  });
  const create = useMutation({
    mutationFn: (values: any) => api<any>('/api/admin/recharge-vouchers', {
      method: 'POST',
      body: JSON.stringify({
        userId: values.userId,
        credits: creditsFromYuan(values.amountYuan),
        amountCents: Math.round(Number(values.amountYuan || 0) * 100),
        validDays: Number(values.validDays || 30),
        transferChannel: values.transferChannel,
        transferNo: values.transferNo,
        proofImageUrl: values.proofImageUrl,
        remark: values.remark,
      }),
    }),
    onSuccess: data => {
      message.success('充值兑换码已生成');
      setCreatedCode(data.code || '');
      form.resetFields();
      ['adminRechargeVouchers', 'rechargeOrders', 'dashboard'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    },
    onError: err => message.error(err instanceof Error ? err.message : '生成充值兑换码失败'),
  });
  useEffect(() => {
    form.setFieldValue('credits', creditsFromYuan(amountYuan));
  }, [amountYuan, form]);
  const cancel = useMutation({
    mutationFn: (id: string) => api(`/api/admin/recharge-vouchers/${id}/cancel`, { method: 'POST', body: JSON.stringify({ remark: '后台取消线下充值码' }) }),
    onSuccess: () => {
      message.success('兑换码已取消');
      ['adminRechargeVouchers', 'rechargeOrders', 'dashboard'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    },
    onError: err => message.error(err instanceof Error ? err.message : '取消失败'),
  });
  const voucherItems = vouchers.data?.items || [];
  const orderItems = orders.data?.items || [];
  const stats = voucherItems.reduce((acc: any, item: any) => {
    acc.count += 1;
    acc.credits += item.credits || 0;
    if (item.status === 'AVAILABLE') acc.available += item.credits || 0;
    if (item.status === 'REDEEMED') acc.redeemed += item.credits || 0;
    return acc;
  }, { count: 0, credits: 0, available: 0, redeemed: 0 });
  const userOptions = (users.data?.items || []).map((user: any) => ({
    value: user.id,
    label: `${user.nickname || user.phone || user.email || user.id}${user.phone ? ` · ${user.phone}` : ''}${user.agent?.name ? ` · 代理 ${user.agent.name}` : ''}`,
  }));
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div className="grid4">
        <Card><Statistic title="兑换码数量" value={stats.count} /></Card>
        <Card><Statistic title="待兑换额度" value={stats.available} suffix="积分" /></Card>
        <Card><Statistic title="已兑换额度" value={stats.redeemed} suffix="积分" /></Card>
        <Card><Statistic title="入账订单" value={orderItems.length} /></Card>
      </div>
      <Card title="线下付款后生成充值兑换码">
        <Form form={form} layout="vertical" initialValues={{ credits: 1000, amountYuan: 10, validDays: 30 }} onFinish={values => create.mutate(values)}>
          <div className="settingsGrid">
            <Form.Item name="userId" label="绑定用户" rules={[{ required: true }]}>
              <Select showSearch optionFilterProp="label" loading={users.isLoading} options={userOptions} placeholder="选择已注册用户" />
            </Form.Item>
            <Form.Item name="amountYuan" label="线下实付金额" rules={[{ required: true, message: '请填写线下实付金额' }]}>
              <InputNumber min={0.01} precision={2} addonAfter="元" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="credits" label={`充值积分（${OFFLINE_CREDITS_PER_CNY} 积分 / 元）`} rules={[{ required: true }]}>
              <InputNumber min={1} precision={0} disabled style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="validDays" label="有效天数" rules={[{ required: true }]}>
              <InputNumber min={1} max={365} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="transferChannel" label="收款方式">
              <Input placeholder="微信 / 支付宝 / 银行卡" />
            </Form.Item>
            <Form.Item name="transferNo" label="转账流水号">
              <Input />
            </Form.Item>
            <Form.Item name="proofImageUrl" label="凭证图片 URL">
              <Input />
            </Form.Item>
            <Form.Item name="remark" label="备注">
              <Input />
            </Form.Item>
          </div>
          <Button type="primary" htmlType="submit" loading={create.isPending}>生成兑换码</Button>
        </Form>
      </Card>
      <Tabs items={[
        { key: 'vouchers', label: '充值兑换码', children: <Card><Table rowKey="id" loading={vouchers.isLoading} dataSource={voucherItems} columns={[
          { title: '兑换码单号', dataIndex: 'voucherNo' },
          { title: '来源', render: (_, row) => <VoucherSourceTag voucher={row} /> },
          { title: '客户', render: (_, row) => row.user?.nickname || row.user?.phone || row.userId },
          { title: '绑定代理', render: (_, row) => row.agent?.name || row.user?.agent?.name || '-' },
          { title: '兑换码', render: (_, row) => <VoucherCodeCell row={row} /> },
          { title: '积分', dataIndex: 'credits', render: money },
          { title: '金额', dataIndex: 'amountCents', render: yuan },
          { title: '状态', dataIndex: 'status', render: (status: string) => <VoucherStatusTag status={status} /> },
          { title: '过期时间', dataIndex: 'expiredAt', render: dateTime },
          { title: '兑换时间', dataIndex: 'redeemedAt', render: dateTime },
          { title: '创建时间', dataIndex: 'createdAt', render: dateTime },
          {
            title: '操作',
            render: (_, row) => row.source === 'ADMIN' && row.status === 'AVAILABLE' ? (
              <Popconfirm
                title="取消充值兑换码"
                description={`取消后用户不能再兑换：${row.voucherNo}`}
                okText="确认取消"
                cancelText="先不取消"
                okButtonProps={{ danger: true, loading: cancel.isPending }}
                onConfirm={() => cancel.mutateAsync(row.id)}
              >
                <Button size="small" danger loading={cancel.isPending}>取消</Button>
              </Popconfirm>
            ) : null,
          },
        ]} /></Card> },
        { key: 'requests', label: '代理配额申请', children: <AgentVoucherRequestAdminTable /> },
        { key: 'orders', label: '充值入账记录', children: <Card><Table rowKey="id" loading={orders.isLoading} dataSource={orderItems} columns={[
          { title: '订单号', dataIndex: 'orderNo' },
          { title: '用户', dataIndex: ['user', 'nickname'] },
          { title: '金额', dataIndex: 'amountCents', render: yuan },
          { title: '积分', dataIndex: 'credits', render: money },
          { title: '渠道', dataIndex: 'channel' },
          { title: '状态', dataIndex: 'status', render: (status: string) => <RechargeStatus status={status} /> },
          { title: '交易号', dataIndex: 'paymentTradeNo' },
          { title: '创建时间', dataIndex: 'createdAt', render: dateTime },
        ]} /></Card> },
      ]} />
      <Modal title="充值兑换码已生成" open={Boolean(createdCode)} onCancel={() => setCreatedCode('')} footer={<Button type="primary" onClick={() => setCreatedCode('')}>关闭</Button>}>
        <Space style={{ marginBottom: 8 }}>
          <b>有效期内未兑换前，可在记录中再次复制</b>
          <Button size="small" onClick={() => copyText(createdCode)}>复制</Button>
        </Space>
        <pre className="trialCodeBox">{createdCode}</pre>
      </Modal>
    </Space>
  );
}

function VoucherSourceTag({ voucher }: { voucher: any }) {
  if (voucher.source === 'ADMIN') return <Tag color="blue">后台线下</Tag>;
  return <Tag color="purple">代理额度</Tag>;
}

function VoucherStatusTag({ status }: { status: string }) {
  const color: Record<string, string> = { AVAILABLE: 'gold', REDEEMED: 'green', CANCELLED: 'default', EXPIRED: 'red' };
  const label: Record<string, string> = { AVAILABLE: '待兑换', REDEEMED: '已兑换', CANCELLED: '已取消', EXPIRED: '已过期' };
  return <Tag color={color[status] || 'default'}>{label[status] || status}</Tag>;
}

function VoucherCodeCell({ row }: { row: any }) {
  const code = row.code || row.voucher?.code || '';
  const status = row.status || row.voucher?.status || '';
  const expiredAt = row.expiredAt || row.voucher?.expiredAt;
  if (code) {
    return (
      <Space>
        <code>{code}</code>
        <Button size="small" onClick={() => copyText(code)}>复制</Button>
      </Space>
    );
  }
  if (status === 'AVAILABLE' && expiredAt) return <span>历史码不可恢复</span>;
  if (status === 'REDEEMED') return <span>已兑换失效</span>;
  if (status === 'EXPIRED') return <span>已过期失效</span>;
  if (status === 'CANCELLED') return <span>已取消</span>;
  return <span>-</span>;
}

function MockPayButton({ order, onPaid, size }: { order: any; onPaid?: (order: any) => void; size?: 'small' | 'middle' | 'large' }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => api<{ order: any }>(`/api/recharge/orders/${order.orderNo}/mock-pay`, { method: 'POST' }),
    onSuccess: data => {
      message.success('模拟支付成功，余额已入账');
      onPaid?.(data.order);
      qc.invalidateQueries({ queryKey: ['rechargeOrders'] });
      qc.invalidateQueries({ queryKey: ['wallets'] });
    },
    onError: err => message.error(err instanceof Error ? err.message : '模拟支付失败'),
  });
  return <Button size={size} loading={m.isPending} onClick={() => m.mutate()}>模拟支付成功</Button>;
}

function CloseRechargeButton({ order, onClosed, size }: { order: any; onClosed?: (order: any) => void; size?: 'small' | 'middle' | 'large' }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => api<{ order: any }>(`/api/recharge/orders/${order.orderNo}/close`, { method: 'POST' }),
    onSuccess: data => {
      message.success('订单已关闭');
      onClosed?.(data.order);
      qc.invalidateQueries({ queryKey: ['rechargeOrders'] });
    },
    onError: err => message.error(err instanceof Error ? err.message : '关闭失败'),
  });
  return <Button size={size} danger loading={m.isPending} onClick={() => Modal.confirm({
    title: '关闭充值订单',
    content: `关闭后不能继续支付该订单：${order.orderNo}`,
    onOk: () => m.mutateAsync(),
  })}>关闭</Button>;
}

function useModels(type: 'IMAGE' | 'VIDEO' | 'LLM') {
  return useQuery({ queryKey: ['models', type], queryFn: () => api<ApiList<any>>(`/api/models?type=${type}`) });
}

function GenerateLab() {
  return (
    <Tabs items={[
      { key: 'image', label: '图片生成', children: <ImageGenerateLab /> },
      { key: 'video', label: '视频生成', children: <VideoGenerateLab /> },
      { key: 'llm', label: '语言模型', children: <LlmGenerateLab /> },
    ]} />
  );
}

function ImageGenerateLab() {
  const [result, setResult] = useState<any>(null);
  const [form] = Form.useForm();
  const models = useModels('IMAGE');
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (values: any) => {
      const model = (models.data?.items || []).find((item: any) => item.id === values.modelId);
      return api('/api/generation/tasks', {
        method: 'POST',
        body: JSON.stringify({
          channelKey: model?.provider?.providerKey,
          modelId: values.modelId,
          type: 'IMAGE',
          mode: 'txt2img',
          prompt: values.prompt,
          params: { size: values.size, quantity: values.quantity, n: values.quantity },
        }),
      });
    },
    onSuccess: data => {
      setResult(data);
      message.success('图片任务已提交');
      qc.invalidateQueries({ queryKey: ['accountSummary'] });
      qc.invalidateQueries({ queryKey: ['generationTasks'] });
    },
    onError: err => message.error(err instanceof Error ? err.message : '生成失败'),
  });
  return (
    <GenerateLabCard title="图片生成联调" result={result}>
      <Form form={form} layout="vertical" initialValues={{ size: '1024x1024', quantity: 1, prompt: '一张无限画布工作台概念图' }} onFinish={values => m.mutate(values)}>
        <Form.Item name="modelId" label="模型" rules={[{ required: true }]}>
          <Select options={(models.data?.items || []).map(model => ({ value: model.id, label: `${model.provider?.providerKey || '-'} · ${model.displayName} · ${money(model.salePrice || 0)}/张` }))} />
        </Form.Item>
        <Form.Item name="prompt" label="提示词" rules={[{ required: true }]}><Input.TextArea rows={4} /></Form.Item>
        <div className="formGrid2">
          <Form.Item name="size" label="尺寸"><Select options={['1024x1024', '1024x1536', '1536x1024'].map(value => ({ value, label: value }))} /></Form.Item>
          <Form.Item name="quantity" label="数量"><InputNumber min={1} max={10} precision={0} style={{ width: '100%' }} /></Form.Item>
        </div>
        <Button type="primary" htmlType="submit" loading={m.isPending}>提交图片任务</Button>
      </Form>
      {result?.task?.resultUrlsJson?.[0] && <img className="generatePreviewImage" src={result.task.resultUrlsJson[0]} alt="generated" />}
    </GenerateLabCard>
  );
}

function VideoGenerateLab() {
  const [result, setResult] = useState<any>(null);
  const [form] = Form.useForm();
  const models = useModels('VIDEO');
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (values: any) => {
      const model = (models.data?.items || []).find((item: any) => item.id === values.modelId);
      return api('/api/generation/tasks', {
        method: 'POST',
        body: JSON.stringify({
          channelKey: model?.provider?.providerKey,
          modelId: values.modelId,
          type: 'VIDEO',
          mode: 'text-to-video',
          prompt: values.prompt,
          params: { durationSeconds: values.durationSeconds, aspectRatio: values.aspectRatio, resolution: values.resolution },
        }),
      });
    },
    onSuccess: data => {
      setResult(data);
      message.success('视频任务已创建');
      qc.invalidateQueries({ queryKey: ['accountSummary'] });
      qc.invalidateQueries({ queryKey: ['generationTasks'] });
    },
    onError: err => message.error(err instanceof Error ? err.message : '生成失败'),
  });
  const status = useMutation({
    mutationFn: () => api<any>(`/api/generation/tasks/${result?.task?.id}/query`, { method: 'POST' }),
    onSuccess: data => { setResult((prev: any) => ({ ...prev, statusCheck: data, task: data.task || prev?.task })); message.success('视频状态已更新'); },
    onError: err => message.error(err instanceof Error ? err.message : '查询失败'),
  });
  return (
    <GenerateLabCard title="视频生成联调" result={result}>
      <Form form={form} layout="vertical" initialValues={{ durationSeconds: 5, aspectRatio: '9:16', resolution: '720p', prompt: '一段无限画布节点自动连线的视频' }} onFinish={values => m.mutate(values)}>
        <Form.Item name="modelId" label="模型" rules={[{ required: true }]}>
          <Select options={(models.data?.items || []).map(model => ({ value: model.id, label: `${model.provider?.providerKey || '-'} · ${model.displayName} · ${videoSecondPriceLabel(model)}` }))} />
        </Form.Item>
        <Form.Item name="prompt" label="提示词" rules={[{ required: true }]}><Input.TextArea rows={4} /></Form.Item>
        <div className="formGrid2">
          <Form.Item name="durationSeconds" label="时长秒"><InputNumber min={1} max={120} precision={0} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="aspectRatio" label="比例"><Select options={['9:16', '16:9', '1:1'].map(value => ({ value, label: value }))} /></Form.Item>
          <Form.Item name="resolution" label="清晰度"><Select options={['720p', '1080p'].map(value => ({ value, label: value }))} /></Form.Item>
        </div>
        <Space>
          <Button type="primary" htmlType="submit" loading={m.isPending}>提交视频任务</Button>
          <Button disabled={!result?.task?.id || !result?.task?.upstreamTaskId} loading={status.isPending} onClick={() => status.mutate()}>查询状态</Button>
        </Space>
      </Form>
    </GenerateLabCard>
  );
}

function LlmGenerateLab() {
  const [result, setResult] = useState<any>(null);
  const [form] = Form.useForm();
  const models = useModels('LLM');
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (values: any) => {
      const model = (models.data?.items || []).find((item: any) => item.id === values.modelId);
      return api('/api/generation/tasks', {
        method: 'POST',
        body: JSON.stringify({
          channelKey: model?.provider?.providerKey,
          modelId: values.modelId,
          type: 'LLM',
          mode: 'chat',
          prompt: values.prompt,
          params: { maxOutputTokens: values.maxOutputTokens },
        }),
      });
    },
    onSuccess: data => {
      setResult(data);
      message.success('语言模型任务已提交');
      qc.invalidateQueries({ queryKey: ['accountSummary'] });
      qc.invalidateQueries({ queryKey: ['generationTasks'] });
    },
    onError: err => message.error(err instanceof Error ? err.message : '调用失败'),
  });
  return (
    <GenerateLabCard title="语言模型联调" result={result}>
      <Form form={form} layout="vertical" initialValues={{ maxOutputTokens: 800, prompt: '帮我写一个无限画布 AI 创作流程的简短说明' }} onFinish={values => m.mutate(values)}>
        <Form.Item name="modelId" label="模型" rules={[{ required: true }]}>
          <Select options={(models.data?.items || []).map(model => ({ value: model.id, label: `${model.provider?.providerKey || '-'} · ${model.displayName} · ${model.creditsPerUsdCost || 0}积分/刀` }))} />
        </Form.Item>
        <Form.Item name="prompt" label="提示词" rules={[{ required: true }]}><Input.TextArea rows={4} /></Form.Item>
        <Form.Item name="maxOutputTokens" label="最大输出 Token"><InputNumber min={1} max={200000} precision={0} style={{ width: '100%' }} /></Form.Item>
        <Button type="primary" htmlType="submit" loading={m.isPending}>提交模型任务</Button>
      </Form>
      {result?.task?.resultJson?.text && <Card size="small" className="generateResultText">{result.task.resultJson.text}</Card>}
    </GenerateLabCard>
  );
}

function GenerateLabCard({ title, result, children }: { title: string; result: any; children: React.ReactNode }) {
  return (
    <Card title={title}>
      <div className="generateLabLayout">
        <div>{children}</div>
        <pre className="generateResultJson">{result ? JSON.stringify(result, null, 2) : '等待调用结果'}</pre>
      </div>
    </Card>
  );
}

function GenerationResults() {
  const [activeTab, setActiveTab] = useState<'IMAGE' | 'STORYBOARD' | 'VIDEO'>('IMAGE');
  const [filters, setFilters] = useState({ status: '', userId: '', limit: 200 });
  const q = useQuery({
    queryKey: ['generationResults', activeTab, filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.userId) params.set('userId', filters.userId.trim());
      if (activeTab === 'VIDEO') params.set('type', 'VIDEO');
      else params.set('type', 'IMAGE');
      if (activeTab === 'STORYBOARD') params.set('mode', 'storyboard');
      params.set('limit', String(filters.limit));
      return api<ApiList<any>>(`/api/generation/admin/tasks?${params.toString()}`);
    },
  });
  const rows = (q.data?.items || []).filter((item: any) => {
    if (activeTab === 'VIDEO') return item.type === 'VIDEO';
    if (activeTab === 'STORYBOARD') return item.type === 'IMAGE' && isStoryboardTask(item);
    return item.type === 'IMAGE' && !isStoryboardTask(item);
  });
  return (
    <Card title="生图生视频结果列表">
      <Tabs
        activeKey={activeTab}
        onChange={key => setActiveTab(key as 'IMAGE' | 'STORYBOARD' | 'VIDEO')}
        items={[
          { key: 'IMAGE', label: '图片', children: <GenerationResultTable rows={rows} loading={q.isLoading} fetching={q.isFetching} filters={filters} setFilters={setFilters} refetch={() => q.refetch()} /> },
          { key: 'STORYBOARD', label: '故事板', children: <GenerationResultTable rows={rows} loading={q.isLoading} fetching={q.isFetching} filters={filters} setFilters={setFilters} refetch={() => q.refetch()} /> },
          { key: 'VIDEO', label: '视频', children: <GenerationResultTable rows={rows} loading={q.isLoading} fetching={q.isFetching} filters={filters} setFilters={setFilters} refetch={() => q.refetch()} /> },
        ]}
      />
    </Card>
  );
}

function GenerationResultTable({ rows, loading, fetching, filters, setFilters, refetch }: { rows: any[]; loading: boolean; fetching: boolean; filters: { status: string; userId: string; limit: number }; setFilters: React.Dispatch<React.SetStateAction<{ status: string; userId: string; limit: number }>>; refetch: () => void }) {
  return (
    <>
      <Space style={{ marginBottom: 12 }} wrap>
        <Select
          allowClear
          placeholder="任务状态"
          style={{ width: 140 }}
          value={filters.status || undefined}
          options={[{ value: 'SUCCESS', label: '成功' }, { value: 'FAILED', label: '失败' }, { value: 'RUNNING', label: '运行中' }, { value: 'PENDING', label: '等待中' }]}
          onChange={value => setFilters(prev => ({ ...prev, status: value || '' }))}
        />
        <Input.Search
          allowClear
          placeholder="用户 UID"
          style={{ width: 260 }}
          onSearch={value => setFilters(prev => ({ ...prev, userId: value.trim() }))}
        />
        <Select
          style={{ width: 120 }}
          value={filters.limit}
          options={[50, 100, 200, 500].map(value => ({ value, label: `${value} 条` }))}
          onChange={value => setFilters(prev => ({ ...prev, limit: value }))}
        />
        <Button onClick={refetch} loading={fetching}>刷新</Button>
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={rows}
        scroll={{ x: 1280 }}
        columns={[
          { title: '提交时间', dataIndex: 'createdAt', width: 170, render: dateTime },
          { title: '结束时间', width: 170, render: (_, row) => dateTime(row.completedAt || row.failedAt || row.updatedAt) },
          { title: '用户名称', width: 140, ellipsis: true, render: (_, row) => row.user?.nickname || row.user?.phone || '-' },
          { title: '用户UID', dataIndex: 'userId', width: 220, ellipsis: true },
          { title: '花费时间', width: 100, render: (_, row) => <span className="durationPill">{durationSeconds(row)} s</span> },
          { title: '平台', dataIndex: 'channelKey', width: 100, render: v => <Tag color="green">{platformName(v)}</Tag> },
          { title: '类型', dataIndex: 'type', width: 120, render: (v, row) => <Tag color="blue">{generationTypeLabel(v, row.mode)}</Tag> },
          { title: '任务ID', dataIndex: 'upstreamTaskId', width: 280, ellipsis: true, render: (_, row) => row.upstreamTaskId || row.id },
          { title: '任务状态', dataIndex: 'status', width: 110, render: (v: string) => <GenerationStatus status={v} /> },
          { title: '进度', dataIndex: 'progress', width: 170, render: (v: number, row) => <Progress percent={progressValue(v, row.status)} size="small" status={row.status === 'FAILED' ? 'exception' : 'success'} /> },
          { title: '详情', width: 160, render: (_, row) => <GenerationResultDetailButton task={row} /> },
        ]}
      />
    </>
  );
}

function GenerationStatus({ status }: { status: string }) {
  const map: Record<string, { color: string; text: string }> = {
    SUCCESS: { color: 'green', text: '成功' },
    FAILED: { color: 'red', text: '失败' },
    RUNNING: { color: 'processing', text: '运行中' },
    PENDING: { color: 'gold', text: '等待中' },
    CREATED: { color: 'default', text: '已创建' },
  };
  const item = map[status] || { color: 'default', text: status || '-' };
  return <Tag color={item.color}>{item.text}</Tag>;
}

function GenerationResultDetailButton({ task }: { task: any }) {
  const [open, setOpen] = useState(false);
  const urls = generationResultUrls(task);
  const firstUrl = urls[0] || '';
  const hasPreview = task.status === 'SUCCESS' && firstUrl;
  return (
    <>
      <Button type="link" size="small" onClick={() => setOpen(true)}>
        {hasPreview ? (task.type === 'VIDEO' ? '点击预览视频' : '点击预览图片') : task.errorMessage || '查看详情'}
      </Button>
      <Modal
        title={hasPreview ? (task.type === 'VIDEO' ? '视频预览' : '图片预览') : '任务详情'}
        open={open}
        footer={null}
        width="92vw"
        centered
        destroyOnHidden
        onCancel={() => setOpen(false)}
        styles={{ body: { maxHeight: '82vh', overflow: 'auto' } }}
      >
        <GenerationResultDetail task={task} urls={urls} />
      </Modal>
    </>
  );
}

function GenerationResultDetail({ task, urls }: { task: any; urls: string[] }) {
  const previewUrl = urls[0] || '';
  return (
    <div className="usageDetail">
      {previewUrl && <div>{task.type === 'VIDEO' ? <video className="generationPreview generationPreviewLarge" src={previewUrl} controls /> : <img className="generationPreview generationPreviewLarge" src={previewUrl} alt="generation result" />}</div>}
      {urls.length > 1 && <div className="generationUrlGrid">{urls.map((url, index) => <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer">结果链接 {index + 1}</a>)}</div>}
      {previewUrl && <div><a href={previewUrl} target="_blank" rel="noreferrer">打开原始链接</a></div>}
      <div><b>提示词</b><div>{task.prompt || '-'}</div></div>
      <div className="formGrid2">
        <div><b>用户名称</b><div>{task.user?.nickname || task.user?.phone || '-'}</div></div>
        <div><b>用户 UID</b><div>{task.userId || task.user?.id || '-'}</div></div>
        <div><b>任务状态</b><div><GenerationStatus status={task.status} /></div></div>
        <div><b>任务 ID</b><div>{task.upstreamTaskId || task.id}</div></div>
        <div><b>平台</b><div>{platformName(task.channelKey)}</div></div>
        <div><b>模型</b><div>{task.model?.displayName || task.model?.name || '-'}</div></div>
        <div><b>扣费</b><div>{money(task.chargedCredits || 0)}</div></div>
      </div>
      {task.errorMessage && <div><b>错误原因</b><div className="usageError">{task.errorMessage}</div></div>}
      <div className="formGrid2">
        <pre>{JSON.stringify(task.paramsJson || {}, null, 2)}</pre>
        <pre>{JSON.stringify({ resultUrls: urls, resultJson: task.resultJson || {}, responseJson: task.responseJson || {} }, null, 2)}</pre>
      </div>
    </div>
  );
}

function generationResultUrls(task: any) {
  const values = [
    ...(Array.isArray(task.resultUrlsJson) ? task.resultUrlsJson : []),
    task.resultJson?.url,
    task.resultJson?.video_url,
    task.resultJson?.image_url,
    task.resultJson?.output_url,
    task.resultJson?.saved?.url,
    task.resultJson?.saved?.remoteUrl,
  ];
  return Array.from(new Set(values
    .filter((url): url is string => typeof url === 'string' && (/^https?:\/\//i.test(url) || /^\/api\//i.test(url)))
    .map(normalizeGenerationResultUrl)
    .filter(Boolean)));
}

function normalizeGenerationResultUrl(url: string) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  const localMatch = raw.match(/^https?:\/\/(?:127\.0\.0\.1|localhost):4000(\/api\/generation\/results\/[^?#\s]+(?:[?#]\S*)?)$/i);
  if (localMatch) return localMatch[1];
  return raw;
}

function isStoryboardTask(task: any) {
  const text = [task.mode, task.paramsJson?.mode, task.paramsJson?.taskType, task.paramsJson?.template, task.paramsJson?.sourceNodeType, task.prompt, JSON.stringify(task.paramsJson || {})].filter(Boolean).join(' ').toLowerCase();
  return /storyboard|故事板|分镜|panel|comic/.test(text);
}

function durationSeconds(row: any) {
  const start = new Date(row.startedAt || row.createdAt).getTime();
  const end = new Date(row.completedAt || row.failedAt || row.updatedAt || row.createdAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return Math.round((end - start) / 1000);
}

function progressValue(value: number, status: string) {
  if (status === 'SUCCESS' || status === 'FAILED') return 100;
  const num = Number(value || 0);
  return Math.max(0, Math.min(100, num));
}

function platformName(value?: string) {
  if (!value) return '-';
  if (/sora/i.test(value)) return 'Sora';
  if (/veo/i.test(value)) return 'Veo';
  if (/image|gpt/i.test(value)) return 'GPT Image';
  return value;
}

function generationTypeLabel(type: string, mode?: string) {
  const normalizedMode = String(mode || '').toLowerCase();
  if (type === 'IMAGE' && /storyboard/i.test(normalizedMode)) return '故事板';
  if (type === 'IMAGE') return /img2img|image-to-image|image_to_image|edit|repair|refine|panorama/.test(normalizedMode) ? '图生图' : '文生图';
  if (type === 'VIDEO') return /image-to-video|video-to-video/i.test(String(mode || '')) ? '图生视频' : '文生视频';
  return type || '-';
}

function Models() {
  return (
    <Tabs items={[
      { key: 'models', label: '模型列表', children: <ModelList /> },
      { key: 'providers', label: '上游渠道', children: <Providers /> },
      { key: 'usages', label: '调用记录', children: <ModelUsages /> },
    ]} />
  );
}

function DataPacks() {
  const q = useQuery({ queryKey: ['dataPacks'], queryFn: () => api<any>('/api/data-packs') });
  const qc = useQueryClient();
  const activeId = q.data?.activeDataPackId || q.data?.activeDataPack?.id || '';
  const packs = q.data?.packs || q.data?.items || [];
  const selectPack = useMutation({
    mutationFn: (id: string) => api(`/api/admin/data-packs/${encodeURIComponent(id)}/select`, { method: 'POST' }),
    onSuccess: () => {
      message.success('当前创作库已切换');
      qc.invalidateQueries({ queryKey: ['dataPacks'] });
    },
    onError: err => message.error(err instanceof Error ? err.message : '切换失败'),
  });
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div className="grid4">
        <Card><Statistic title="已注册数据包" value={packs.length} /></Card>
        <Card><Statistic title="当前 Active" value={activeId || '-'} /></Card>
        <Card><Statistic title="可用数据包" value={packs.filter((pack: any) => pack.status !== 'disabled').length} /></Card>
        <Card><Statistic title="最近更新" value={dateTime(q.data?.updatedAt)} /></Card>
      </div>
      <Card
        title="创作库数据包"
        extra={<CreateDataPackButton />}
      >
        <Table<any>
          rowKey="id"
          loading={q.isLoading}
          dataSource={packs}
          scroll={{ x: 1280 }}
          expandable={{ expandedRowRender: row => <DataPackDetail pack={row} /> }}
          columns={[
            { title: '名称', dataIndex: 'title', width: 220, render: (value, row) => <Space><span>{value}</span>{row.id === activeId && <Tag color="green">Active</Tag>}</Space> },
            { title: 'ID', dataIndex: 'id', width: 220, ellipsis: true },
            { title: '类型', dataIndex: 'type', width: 160, render: value => <Tag>{value || 'creative_automation'}</Tag> },
            { title: '状态', dataIndex: 'status', width: 110, render: value => <Tag color={value === 'active' ? 'green' : value === 'draft' ? 'gold' : 'red'}>{value}</Tag> },
            { title: '默认任务', dataIndex: 'defaultTaskType', width: 180, ellipsis: true },
            { title: '目录', width: 110, render: (_, row) => `${row.roots?.length || 0} 个` },
            { title: '能力', width: 240, render: (_, row) => dataPackCapabilityTags(row) },
            { title: '描述', dataIndex: 'description', ellipsis: true },
            {
              title: '操作',
              width: 260,
              render: (_, row) => (
                <Space>
                  <Button size="small" disabled={row.id === activeId || row.status === 'disabled'} loading={selectPack.isPending} onClick={() => selectPack.mutate(row.id)}>设为当前</Button>
                  <EditDataPackButton dataPack={row} />
                </Space>
              ),
            },
          ]}
        />
      </Card>
    </Space>
  );
}

function DataPackDetail({ pack }: { pack: any }) {
  return (
    <div className="dataPackDetail">
      <div>
        <b>目录根</b>
        <Table<any>
          size="small"
          pagination={false}
          rowKey={(row: any, index) => `${row.id || row.root}-${index}`}
          dataSource={pack.roots || []}
          columns={[
            { title: 'ID', dataIndex: 'id', width: 180 },
            { title: '标题', dataIndex: 'title', width: 220 },
            { title: '路径', dataIndex: 'root', ellipsis: true },
            { title: '类型', dataIndex: 'sourceKind', width: 160 },
            { title: '扩展名', dataIndex: 'extensions', render: value => Array.isArray(value) ? value.join(', ') : '-' },
            { title: '解析上限', dataIndex: 'parseLimit', width: 100 },
          ]}
        />
      </div>
      <div className="formGrid2">
        <pre>{JSON.stringify({ capabilities: pack.capabilities || {}, metadata: pack.metadata || {} }, null, 2)}</pre>
        <pre>{JSON.stringify({ tags: pack.tags || [], rootBasePath: pack.rootBasePath || '', sourceVersion: pack.sourceVersion || '' }, null, 2)}</pre>
      </div>
    </div>
  );
}

function dataPackCapabilityTags(pack: any) {
  const capabilityKeys = Object.entries(pack.capabilities || {})
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key)
    .slice(0, 4);
  if (!capabilityKeys.length) return '-';
  return <Space size={4} wrap>{capabilityKeys.map(key => <Tag key={key} color="blue">{key}</Tag>)}</Space>;
}

function CreateDataPackButton() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (values: any) => api('/api/admin/data-packs', { method: 'POST', body: JSON.stringify(normalizeDataPackPayload(values)) }),
    onSuccess: () => {
      message.success('创作库数据包已注册');
      setOpen(false);
      form.resetFields();
      qc.invalidateQueries({ queryKey: ['dataPacks'] });
    },
    onError: err => message.error(err instanceof Error ? err.message : '注册失败'),
  });
  return (
    <>
      <Button type="primary" onClick={() => setOpen(true)}>注册数据包</Button>
      <Modal title="注册创作库数据包" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={m.isPending} width={980} destroyOnHidden>
        <Form form={form} layout="vertical" initialValues={defaultDataPackFormValues()} onFinish={values => m.mutate(values)}>
          <DataPackFormFields />
        </Form>
      </Modal>
    </>
  );
}

function EditDataPackButton({ dataPack }: { dataPack: any }) {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (values: any) => api(`/api/admin/data-packs/${encodeURIComponent(dataPack.id)}`, { method: 'PATCH', body: JSON.stringify(normalizeDataPackPayload(values).dataPack) }),
    onSuccess: () => {
      message.success('创作库数据包已更新');
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['dataPacks'] });
    },
    onError: err => message.error(err instanceof Error ? err.message : '更新失败'),
  });
  function openModal() {
    form.setFieldsValue(dataPackFormValues(dataPack));
    setOpen(true);
  }
  return (
    <>
      <Button size="small" onClick={openModal}>编辑</Button>
      <Modal title={`编辑数据包：${dataPack.title || dataPack.id}`} open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={m.isPending} width={980} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={values => m.mutate(values)}>
          <DataPackFormFields editing />
        </Form>
      </Modal>
    </>
  );
}

function DataPackFormFields({ editing = false }: { editing?: boolean }) {
  return (
    <>
      <div className="formGrid2">
        <Form.Item name="id" label="数据包 ID" rules={[{ required: true }]}>
          <Input disabled={editing} placeholder="manju-creation-library" />
        </Form.Item>
        <Form.Item name="title" label="显示名称" rules={[{ required: true }]}>
          <Input placeholder="漫剧创作库" />
        </Form.Item>
        <Form.Item name="type" label="业务类型">
          <Select options={[
            { value: 'comic_drama', label: '漫剧 / 短剧' },
            { value: 'ad_creative', label: '广告创意' },
            { value: 'ecommerce_product', label: '电商商品图' },
            { value: 'film_creation', label: '电影创作' },
            { value: 'self_media_promo', label: '自媒体宣传片' },
            { value: 'creative_automation', label: '通用创作自动化' },
          ]} />
        </Form.Item>
        <Form.Item name="status" label="状态">
          <Select options={[
            { value: 'active', label: '启用' },
            { value: 'draft', label: '草稿' },
            { value: 'disabled', label: '停用' },
          ]} />
        </Form.Item>
        <Form.Item name="defaultTaskType" label="默认任务类型">
          <Input placeholder="creative_orchestration" />
        </Form.Item>
        <Form.Item name="rootBasePath" label="根目录基准路径">
          <Input placeholder="/Users/billy/Documents/AI_pro/漫剧创作库" />
        </Form.Item>
      </div>
      <Form.Item name="description" label="说明">
        <Input.TextArea rows={2} placeholder="说明这个数据包用于哪类自动化生产流水线" />
      </Form.Item>
      <Form.Item name="rootsJson" label="数据包目录 JSON" rules={[{ required: true }]}>
        <Input.TextArea rows={9} placeholder='[{"id":"agents","title":"Agents","root":"agents","sourceKind":"agents","extensions":[".md",".json"],"limit":500,"parseLimit":160}]' />
      </Form.Item>
      <div className="formGrid2">
        <Form.Item name="tagsText" label="标签">
          <Input placeholder="comic, agent_pipeline, smart_canvas" />
        </Form.Item>
        <Form.Item name="sourceVersion" label="版本">
          <Input placeholder="2026-05-16" />
        </Form.Item>
      </div>
      <div className="formGrid2">
        <Form.Item name="capabilitiesJson" label="能力 JSON">
          <Input.TextArea rows={6} />
        </Form.Item>
        <Form.Item name="metadataJson" label="元数据 JSON">
          <Input.TextArea rows={6} />
        </Form.Item>
      </div>
      {!editing && (
        <Form.Item name="activate" label="注册后切换">
          <Select options={[{ value: true, label: '设为当前 Active' }, { value: false, label: '只注册，不切换' }]} />
        </Form.Item>
      )}
    </>
  );
}

function defaultDataPackFormValues() {
  return {
    type: 'creative_automation',
    status: 'active',
    defaultTaskType: 'creative_orchestration',
    activate: false,
    rootsJson: JSON.stringify([
      { id: 'docs', title: 'Docs', root: 'docs', sourceKind: 'docs', extensions: ['.md', '.json', '.txt', '.yaml', '.yml'], limit: 500, parseLimit: 120 },
      { id: 'agents', title: 'Agents', root: 'agents', sourceKind: 'agents', extensions: ['.md', '.json'], limit: 500, parseLimit: 160 },
      { id: 'skills', title: 'Skills', root: 'skills', sourceKind: 'skills', extensions: ['.md', '.json'], limit: 500, parseLimit: 160 },
      { id: 'templates', title: 'Templates', root: 'templates', sourceKind: 'templates', extensions: ['.md', '.json', '.txt'], limit: 500, parseLimit: 120 },
      { id: 'wordlists', title: 'Wordlists', root: 'wordlists', sourceKind: 'wordlists', extensions: ['.md', '.json', '.txt'], limit: 500, parseLimit: 160 },
    ], null, 2),
    capabilitiesJson: JSON.stringify(defaultDataPackCapabilities(), null, 2),
    metadataJson: JSON.stringify({ deliverableMode: 'customer_facing', workflowJsonVisibility: 'internal' }, null, 2),
  };
}

function dataPackFormValues(pack: any) {
  return {
    id: pack.id,
    title: pack.title,
    type: pack.type || 'creative_automation',
    status: pack.status || 'active',
    defaultTaskType: pack.defaultTaskType || 'creative_orchestration',
    rootBasePath: pack.rootBasePath || '',
    description: pack.description || '',
    rootsJson: JSON.stringify(pack.roots || [], null, 2),
    tagsText: (pack.tags || []).join(', '),
    sourceVersion: pack.sourceVersion || '',
    capabilitiesJson: JSON.stringify(pack.capabilities || defaultDataPackCapabilities(), null, 2),
    metadataJson: JSON.stringify(pack.metadata || {}, null, 2),
  };
}

function normalizeDataPackPayload(values: any) {
  const dataPack = {
    id: values.id,
    title: values.title,
    type: values.type || 'creative_automation',
    status: values.status || 'active',
    source: 'admin_registry',
    sourceVersion: values.sourceVersion || undefined,
    description: values.description || '',
    rootBasePath: values.rootBasePath || '',
    defaultTaskType: values.defaultTaskType || 'creative_orchestration',
    roots: parseDataPackJson(values.rootsJson, '数据包目录 JSON'),
    tags: splitList(values.tagsText),
    capabilities: parseDataPackJson(values.capabilitiesJson, '能力 JSON'),
    metadata: parseDataPackJson(values.metadataJson, '元数据 JSON'),
  };
  return { dataPack, activate: values.activate === true };
}

function defaultDataPackCapabilities() {
  return {
    dynamicAgentPipeline: true,
    smartCanvas: true,
    customerDeliverables: true,
    internalWorkflowJson: true,
    referenceImages: true,
    outputKinds: ['adapted_script', 'shot_table', 'asset_cards', 'asset_images', 'storyboard', 'prompt', 'video', 'qa_report', 'release_package'],
  };
}

function parseDataPackJson(value: string, label: string) {
  const raw = String(value || '').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${label} 格式错误`);
  }
}

function splitList(value: string) {
  return String(value || '')
    .split(/[,，\n]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function Providers() {
  const q = useQuery({ queryKey: ['providers'], queryFn: () => api<ApiList<any>>('/api/admin/upstream-providers') });
  return <Card title="上游渠道" extra={<CreateProviderButton />}><Table rowKey="id" loading={q.isLoading} dataSource={q.data?.items || []} columns={[
    { title: '渠道 Key', dataIndex: 'providerKey' },
    { title: '名称', dataIndex: 'name' },
    { title: '类型', dataIndex: 'type', render: v => v ? <Tag>{v}</Tag> : '-' },
    { title: 'Adapter', dataIndex: 'adapter' },
    { title: 'Base URL', dataIndex: 'baseUrl', ellipsis: true },
    { title: '状态', dataIndex: 'status' },
    { title: '创建时间', dataIndex: 'createdAt', render: dateTime },
    { title: '操作', render: (_, row) => <Space><EditProviderButton provider={row} /><TestProviderButton provider={row} /></Space> },
  ]} /></Card>;
}

function ModelList() {
  const q = useQuery({ queryKey: ['adminModels'], queryFn: () => api<ApiList<any>>('/api/admin/models') });
  const items = q.data?.items || [];
  const renderTable = (type: string) => <ModelTypeTable loading={q.isLoading} items={items.filter((item: any) => item.type === type)} />;
  return (
    <Card title="模型列表" extra={<CreateModelButton />}>
      <Tabs items={[
        { key: 'IMAGE', label: '图片模型', children: renderTable('IMAGE') },
        { key: 'VIDEO', label: '视频模型', children: renderTable('VIDEO') },
        { key: 'LLM', label: '大语言模型', children: renderTable('LLM') },
      ]} />
    </Card>
  );
}

function mergeAdminModelCache(qc: any, model: any) {
  if (!model?.id) return;
  qc.setQueryData(['adminModels'], (old: ApiList<any> | undefined) => {
    if (!old?.items) return old;
    return { ...old, items: old.items.map(item => item.id === model.id ? { ...item, ...model } : item) };
  });
}

async function refreshModelCaches(qc: any) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: ['adminModels'] }),
    qc.invalidateQueries({ queryKey: ['models'] }),
    qc.refetchQueries({ queryKey: ['adminModels'] }),
  ]);
}

function videoSecondPriceLabel(model: any) {
  const pricing = model?.defaults?.pricing && typeof model.defaults.pricing === 'object' ? model.defaults.pricing : null;
  const tiers = Array.isArray(pricing?.resolutionTiers) ? pricing.resolutionTiers : [];
  const tierText = tiers
    .map((tier: any) => {
      const label = String(tier?.resolution || tier?.label || '').trim();
      const price = Number(tier?.memberCreditsPerSecond ?? tier?.chargedCreditsPerSecond ?? tier?.creditsPerSecond ?? tier?.pricePerSecond ?? NaN);
      if (!label || !Number.isFinite(price)) return '';
      return `${label} ${price}`;
    })
    .filter(Boolean);
  if (tierText.length) return `${tierText.join(' / ')} 积分/秒`;
  return `${model?.pricePerSecond || 0} 积分/秒`;
}

function ModelTypeTable({ loading, items }: { loading: boolean; items: any[] }) {
  const qc = useQueryClient();
  const refreshModels = async () => {
    await refreshModelCaches(qc);
  };
  const toggleStatus = useMutation({
    mutationFn: (input: { id: string; status: 'ACTIVE' | 'DISABLED' }) => api(`/api/admin/models/${input.id}`, { method: 'PATCH', body: JSON.stringify({ status: input.status }) }),
    onSuccess: async (data: any, variables) => {
      message.success(variables.status === 'ACTIVE' ? '模型已启用' : '模型已禁用');
      mergeAdminModelCache(qc, data?.model);
      await refreshModels();
    },
    onError: err => {
      Modal.error({ title: '状态更新失败', content: err instanceof Error ? err.message : '请检查接口请求或管理员权限' });
    },
  });
  return <Table rowKey="id" loading={loading || toggleStatus.isPending} dataSource={items} scroll={{ x: 1200 }} columns={[
    { title: '模型昵称', dataIndex: 'displayName' },
    { title: 'model', dataIndex: 'name' },
    { title: 'Adapter', render: (_, row) => row.provider?.adapter || row.adapter || '-' },
    { title: 'Base URL', render: (_, row) => row.provider?.baseUrl || '-', ellipsis: true },
    { title: 'Endpoint', dataIndex: 'endpointPath', ellipsis: true },
    { title: '类型', dataIndex: 'type', render: v => <Tag>{v}</Tag> },
    { title: '图片1K价', dataIndex: 'salePrice', render: money },
    { title: '视频秒价', render: (_, row) => row.type === 'VIDEO' ? videoSecondPriceLabel(row) : money(row.pricePerSecond || 0) },
    { title: '一刀积分', dataIndex: 'creditsPerUsdCost', render: v => String(v || 0) },
    { title: '状态', dataIndex: 'status', render: value => <Tag color={value === 'ACTIVE' ? 'green' : 'red'}>{value === 'ACTIVE' ? '启用' : '禁用'}</Tag> },
    {
      title: '操作',
      width: 300,
      className: 'modelActionCell',
      render: (_, row) => {
        const nextStatus = row.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
        return (
          <Space>
            <EditModelButton model={row} />
            <EditModelPricingButton model={row} />
            <Button
              size="small"
              danger={nextStatus === 'DISABLED'}
              loading={toggleStatus.isPending}
              disabled={toggleStatus.isPending}
              onClick={event => {
                event.stopPropagation();
                const actionText = nextStatus === 'DISABLED' ? '禁用' : '启用';
                if (window.confirm(`${actionText}模型：${row.displayName}？`)) {
                  toggleStatus.mutate({ id: row.id, status: nextStatus });
                }
              }}
            >
              {nextStatus === 'DISABLED' ? '禁用' : '启用'}
            </Button>
            <DeleteModelButton model={row} />
          </Space>
        );
      },
    },
  ]} />;
}

function ModelUsages() {
  const [filters, setFilters] = useState({ status: '', type: '', limit: 200 });
  const q = useQuery({
    queryKey: ['modelUsages', filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.type) params.set('type', filters.type);
      params.set('limit', String(filters.limit));
      return api<ApiList<any>>(`/api/admin/model-usages?${params.toString()}`);
    },
  });
  return (
    <Card>
      <Space style={{ marginBottom: 12 }} wrap>
        <Select
          allowClear
          placeholder="状态"
          style={{ width: 140 }}
          value={filters.status || undefined}
          options={[{ value: 'SUCCESS', label: '成功' }, { value: 'FAILED', label: '失败' }, { value: 'PENDING', label: '处理中' }]}
          onChange={value => setFilters(prev => ({ ...prev, status: value || '' }))}
        />
        <Select
          allowClear
          placeholder="类型"
          style={{ width: 140 }}
          value={filters.type || undefined}
          options={[{ value: 'IMAGE', label: '图片' }, { value: 'VIDEO', label: '视频' }, { value: 'LLM', label: '语言模型' }]}
          onChange={value => setFilters(prev => ({ ...prev, type: value || '' }))}
        />
        <Select
          style={{ width: 120 }}
          value={filters.limit}
          options={[50, 100, 200, 500].map(value => ({ value, label: `${value} 条` }))}
          onChange={value => setFilters(prev => ({ ...prev, limit: value }))}
        />
      </Space>
      <Table
        rowKey="id"
        loading={q.isLoading}
        dataSource={q.data?.items || []}
        expandable={{ expandedRowRender: row => <UsageDetail usage={row} /> }}
        columns={[
          { title: '用户', dataIndex: ['user', 'nickname'] },
          { title: '模型', dataIndex: ['model', 'displayName'] },
          { title: '渠道', dataIndex: ['model', 'provider', 'name'] },
          { title: '类型', dataIndex: 'modelType', render: v => <Tag>{v}</Tag> },
          { title: '扣费', dataIndex: 'chargedCredits', render: money },
          { title: '状态', dataIndex: 'status', render: (v: string) => <UsageStatus status={v} /> },
          { title: '错误', dataIndex: 'errorMessage', ellipsis: true },
          { title: '上游任务', dataIndex: 'upstreamTaskId', ellipsis: true },
          { title: '时间', dataIndex: 'createdAt', render: dateTime },
        ]}
      />
    </Card>
  );
}

function UsageStatus({ status }: { status: string }) {
  const color: Record<string, string> = { SUCCESS: 'green', FAILED: 'red', PENDING: 'gold' };
  return <Tag color={color[status] || 'default'}>{status}</Tag>;
}

function UsageDetail({ usage }: { usage: any }) {
  return (
    <div className="usageDetail">
      <div><b>提示词</b><div>{usage.prompt || '-'}</div></div>
      <div className="formGrid2">
        <div><b>请求 ID</b><div>{usage.requestId || '-'}</div></div>
        <div><b>上游任务 ID</b><div>{usage.upstreamTaskId || '-'}</div></div>
        <div><b>Token</b><div>{usage.inputTokens || 0} / {usage.outputTokens || 0} / {usage.totalTokens || 0}</div></div>
        <div><b>成本</b><div>{money(usage.costAmount || 0)} / ${Number(usage.costUsd || 0)}</div></div>
      </div>
      {usage.resultUrl && <div><b>结果地址</b><div><a href={usage.resultUrl} target="_blank" rel="noreferrer">{usage.resultUrl}</a></div></div>}
      {usage.errorMessage && <div><b>错误原因</b><div className="usageError">{usage.errorMessage}</div></div>}
      <div className="formGrid2">
        <pre>{JSON.stringify(usage.requestJson || {}, null, 2)}</pre>
        <pre>{JSON.stringify(usage.responseJson || {}, null, 2)}</pre>
      </div>
    </div>
  );
}

function MemberAccounts() {
  const q = useQuery({ queryKey: ['memberAccounts'], queryFn: () => api<ApiList<any>>('/api/member-accounts') });
  const qc = useQueryClient();
  const voidAccount = useMutation({
    mutationFn: (id: string) => api(`/api/member-accounts/${id}/void`, { method: 'POST' }),
    onSuccess: () => { message.success('会员账号已作废'); qc.invalidateQueries({ queryKey: ['memberAccounts'] }); },
    onError: err => message.error(err instanceof Error ? err.message : '作废失败'),
  });
  return <Space direction="vertical" size={16} style={{ width: '100%' }}>
    <Card title="会员账号池" extra={<Space><AdminGrantAgentMembershipCardsButton /><AdminOfflineMembershipButton /><BatchCreateAccountsButton /></Space>}><Table rowKey="id" loading={q.isLoading} dataSource={q.data?.items || []} columns={[
      { title: '账号', dataIndex: 'code' },
      { title: '套餐', dataIndex: ['plan', 'name'] },
      { title: '状态', dataIndex: 'status' },
      { title: '领取代理', dataIndex: ['claimedAgent', 'name'] },
      { title: '绑定用户', render: (_, row) => row.redeemedUserId || '-' },
      { title: '创建时间', dataIndex: 'createdAt', render: dateTime },
      { title: '操作', render: (_, row) => <Space>{['AVAILABLE', 'CLAIMED'].includes(row.status) ? <Button size="small" danger loading={voidAccount.isPending} onClick={() => Modal.confirm({ title: '作废会员账号', content: `作废后代理不能再核销：${row.code}`, onOk: () => voidAccount.mutateAsync(row.id) })}>作废</Button> : null}<Button size="small" onClick={() => copyText(row.code)}>复制</Button></Space> },
    ]} /></Card>
    <AdminMembershipCardRequestsTable />
  </Space>;
}

function AdminGrantAgentMembershipCardsButton() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const agents = useQuery({ queryKey: ['agents'], queryFn: () => api<ApiList<any>>('/api/admin/agents') });
  const plans = useQuery({ queryKey: ['membershipPlans'], queryFn: () => api<ApiList<any>>('/api/membership/plans') });
  const planId = Form.useWatch('planId', form);
  const quantity = Form.useWatch('quantity', form);
  const discountRate = Form.useWatch('discountRate', form);
  const m = useMutation({
    mutationFn: (values: any) => api('/api/admin/agent-membership/cards/grant', {
      method: 'POST',
      body: JSON.stringify({
        agentId: values.agentId,
        planId: values.planId,
        quantity: values.quantity,
        discountRate: Number(values.discountRate),
        amountCents: values.amountYuan ? Math.round(Number(values.amountYuan) * 100) : undefined,
        transferChannel: values.transferChannel,
        transferNo: values.transferNo,
        proofImageUrl: values.proofImageUrl,
        remark: values.remark,
      }),
    }),
    onSuccess: () => {
      message.success('会员卡资格已配置');
      setOpen(false);
      form.resetFields();
      ['memberAccounts', 'adminMembershipCardRequests'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    },
    onError: err => message.error(err instanceof Error ? err.message : '配置失败'),
  });
  useEffect(() => {
    const amountYuan = membershipCardAmountYuan(plans.data?.items, planId, quantity, discountRate);
    if (amountYuan !== undefined) form.setFieldValue('amountYuan', amountYuan);
  }, [plans.data?.items, planId, quantity, discountRate, form]);
  return <>
    <Button type="primary" onClick={() => { form.setFieldsValue({ quantity: 10, discountRate: 0.3 }); setOpen(true); }}>给代理配会员卡</Button>
    <Modal title="给代理配置会员卡资格" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={m.isPending} width={720}>
      <Form form={form} layout="vertical" initialValues={{ quantity: 10, discountRate: 0.3 }} onFinish={values => m.mutate(values)}>
        <Form.Item name="agentId" label="代理" rules={[{ required: true }]}>
          <Select showSearch optionFilterProp="label" options={(agents.data?.items || []).map((a: any) => ({ value: a.id, label: `${a.name} · ${a.user?.phone || a.user?.nickname || ''}` }))} />
        </Form.Item>
        <div className="formGrid2">
          <Form.Item name="planId" label="会员套餐" rules={[{ required: true }]}>
            <Select options={(plans.data?.items || []).filter((p: any) => p.status === 'ACTIVE').map((p: any) => ({ value: p.id, label: `${p.name} · ${(Number(p.price || 0) / 100).toFixed(2)}元 · ${p.durationDays}天` }))} />
          </Form.Item>
          <Form.Item name="quantity" label="数量" rules={[{ required: true }]}>
            <InputNumber min={1} max={1000} precision={0} style={{ width: '100%' }} />
          </Form.Item>
        </div>
        <div className="formGrid2">
          <Form.Item name="discountRate" label="代理折扣" rules={[{ required: true }]}>
            <InputNumber min={0.01} max={1} step={0.01} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="amountYuan" label="线下实付金额" rules={[{ required: true, message: '请确认线下实付金额' }]}><InputNumber min={0.01} precision={2} addonAfter="元" style={{ width: '100%' }} /></Form.Item>
        </div>
        <div className="formGrid2">
          <Form.Item name="transferChannel" label="收款方式"><Input placeholder="微信 / 支付宝 / 银行卡" /></Form.Item>
          <Form.Item name="transferNo" label="转账流水号"><Input /></Form.Item>
        </div>
        <Form.Item name="proofImageUrl" label="付款凭证图片 URL"><Input /></Form.Item>
        <Form.Item name="remark" label="备注"><Input /></Form.Item>
      </Form>
    </Modal>
  </>;
}

function AdminMembershipCardRequestsTable() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['adminMembershipCardRequests'], queryFn: () => api<ApiList<any>>('/api/admin/agent-membership/card-requests') });
  const approve = useMutation({
    mutationFn: (id: string) => api(`/api/admin/agent-membership/card-requests/${id}/approve`, { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: () => { message.success('会员卡申请已通过'); ['adminMembershipCardRequests', 'memberAccounts'].forEach(key => qc.invalidateQueries({ queryKey: [key] })); },
    onError: err => message.error(err instanceof Error ? err.message : '审核失败'),
  });
  const reject = useMutation({
    mutationFn: (id: string) => api(`/api/admin/agent-membership/card-requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason: '管理员驳回会员卡申请' }) }),
    onSuccess: () => { message.success('会员卡申请已驳回'); qc.invalidateQueries({ queryKey: ['adminMembershipCardRequests'] }); },
    onError: err => message.error(err instanceof Error ? err.message : '驳回失败'),
  });
  return <Card title="代理会员卡申请记录"><Table rowKey="id" loading={q.isLoading} dataSource={q.data?.items || []} columns={[
    { title: '单号', dataIndex: 'orderNo' },
    { title: '代理', dataIndex: ['agent', 'name'] },
    { title: '数量', dataIndex: 'credits' },
    { title: '金额', dataIndex: 'amountCents', render: (v: number) => `${(Number(v || 0) / 100).toFixed(2)} 元` },
    { title: '状态', dataIndex: 'status' },
    { title: '备注', dataIndex: 'remark' },
    { title: '时间', dataIndex: 'createdAt', render: dateTime },
    { title: '操作', render: (_, row) => row.status === 'PENDING' ? <Space><Button size="small" type="primary" loading={approve.isPending} onClick={() => approve.mutate(row.id)}>通过</Button><Button size="small" danger loading={reject.isPending} onClick={() => reject.mutate(row.id)}>驳回</Button></Space> : null },
  ]} /></Card>;
}

function Agents() {
  const q = useQuery({ queryKey: ['agents'], queryFn: () => api<ApiList<any>>('/api/admin/agents') });
  return <Card title="代理列表" extra={<CreateAgentButton />}><Table rowKey="id" loading={q.isLoading} dataSource={q.data?.items || []} columns={[
    { title: '代理', dataIndex: 'name' },
    { title: '用户', dataIndex: ['user', 'nickname'] },
    { title: '手机号', dataIndex: ['user', 'phone'] },
    { title: '等级', dataIndex: 'level' },
    { title: '上级代理', dataIndex: ['parentAgent', 'name'] },
    { title: '佣金率', dataIndex: 'commissionRate', render: v => String(v) },
    { title: '对账期', dataIndex: 'settlementDelayDays', render: v => `${v || 1} 天` },
    { title: '客户数', dataIndex: ['stats', 'customerCount'] },
    { title: '核销数', dataIndex: ['stats', 'redemptionCount'] },
    { title: '待结佣金', dataIndex: ['stats', 'pendingCommissionAmount'], render: money },
    { title: '状态', dataIndex: 'status' },
    { title: '操作', render: (_, row) => <Space><AgentCustomersModalButton agent={row} /><EditAgentButton agent={row} /></Space> },
  ]} /></Card>;
}

function AgentCustomersModalButton({ agent }: { agent: any }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ['adminAgentCustomers', agent.id],
    queryFn: () => api<ApiList<any>>(`/api/admin/agents/${agent.id}/customers`),
    enabled: open,
  });
  return (
    <>
      <Button size="small" onClick={() => setOpen(true)}>客户</Button>
      <Modal title={`${agent.name} 的客户`} open={open} onCancel={() => setOpen(false)} footer={null} width={920}>
        <Table rowKey="id" loading={q.isLoading} dataSource={q.data?.items || []} columns={[
          { title: '客户名', render: (_, row) => row.customerName || row.user?.nickname || '-' },
          { title: '手机号', render: (_, row) => row.customerPhone || row.user?.phone || '-' },
          { title: '用户昵称', dataIndex: ['user', 'nickname'] },
          { title: '余额', dataIndex: ['user', 'wallet', 'balance'], render: (v) => money(v || 0) },
          { title: '核销数', dataIndex: ['stats', 'redemptionCount'] },
          { title: '佣金', dataIndex: ['stats', 'commissionAmount'], render: money },
          { title: '绑定时间', dataIndex: 'createdAt', render: dateTime },
        ]} />
      </Modal>
    </>
  );
}

function AgentCreditAdmin() {
  const accounts = useQuery({ queryKey: ['agentCreditAccounts'], queryFn: () => api<ApiList<any>>('/api/admin/agent-credit/accounts') });
  const items = accounts.data?.items || [];
  const totals = items.reduce((acc: any, agent: any) => {
    acc.availableCredits += agent.creditAccount?.availableCredits || 0;
    acc.frozenCredits += agent.creditAccount?.frozenCredits || 0;
    acc.usedCredits += agent.creditAccount?.usedCredits || 0;
    acc.receivableCredits += agent.creditAccount?.receivableCredits || 0;
    return acc;
  }, { availableCredits: 0, frozenCredits: 0, usedCredits: 0, receivableCredits: 0 });
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div className="grid4">
        <Card><Statistic title="代理数" value={items.length} /></Card>
        <Card><Statistic title="可用额度" value={totals.availableCredits} suffix="积分" /></Card>
        <Card><Statistic title="冻结额度" value={totals.frozenCredits} suffix="积分" /></Card>
        <Card><Statistic title="已使用额度" value={totals.usedCredits} suffix="积分" /></Card>
      </div>
      <Card title="代理额度账户" extra={<GrantAgentCreditButton />}>
        <Table rowKey="id" loading={accounts.isLoading} dataSource={items} columns={[
          { title: '代理', dataIndex: 'name' },
          { title: '手机号', dataIndex: ['user', 'phone'] },
          { title: '可用额度', dataIndex: ['creditAccount', 'availableCredits'], render: money },
          { title: '冻结额度', dataIndex: ['creditAccount', 'frozenCredits'], render: money },
          { title: '已使用', dataIndex: ['creditAccount', 'usedCredits'], render: money },
          { title: '应收额度', dataIndex: ['creditAccount', 'receivableCredits'], render: money },
          { title: '佣金率', dataIndex: 'commissionRate', render: v => String(v) },
          { title: '状态', dataIndex: 'status' },
          { title: '操作', render: (_, row) => <AgentAccountingModalButton agent={row} /> },
        ]} />
      </Card>
      <AgentVoucherRequestAdminTable />
      <AgentReconciliationTable admin />
    </Space>
  );
}

function AgentVoucherRequestAdminTable() {
  const [approvedCode, setApprovedCode] = useState('');
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['agentVoucherRequestsAdmin'], queryFn: () => api<ApiList<any>>('/api/admin/agent-credit/voucher-requests') });
  const approve = useMutation({
    mutationFn: (values: { id: string; remark?: string }) => api<any>(`/api/admin/agent-credit/voucher-requests/${values.id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ remark: values.remark }),
    }),
    onSuccess: data => {
      message.success('申请已通过，兑换码已生成');
      setApprovedCode(data.code || '');
      ['agentVoucherRequestsAdmin', 'agentCreditAccounts', 'agentReconciliationOrders'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    },
    onError: err => message.error(err instanceof Error ? err.message : '审核失败'),
  });
  const reject = useMutation({
    mutationFn: (values: { id: string; reason?: string }) => api(`/api/admin/agent-credit/voucher-requests/${values.id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason: values.reason }),
    }),
    onSuccess: () => {
      message.success('申请已驳回');
      ['agentVoucherRequestsAdmin', 'agentReconciliationOrders'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    },
    onError: err => message.error(err instanceof Error ? err.message : '驳回失败'),
  });
  return (
    <>
      <Card title="充值码申请审核">
        <Table rowKey="id" loading={q.isLoading} dataSource={q.data?.items || []} columns={[
          { title: '申请号', dataIndex: 'requestNo' },
          { title: '代理', render: (_, row) => row.agent?.name || row.agentId },
          { title: '客户', render: (_, row) => row.user?.nickname || row.user?.phone || row.userId },
          { title: '额度', dataIndex: 'credits', render: money },
          { title: '金额', dataIndex: 'amountCents', render: yuan },
          { title: '状态', dataIndex: 'status', render: status => <AgentVoucherRequestStatus status={status} /> },
          { title: '兑换码', render: (_, row) => <VoucherCodeCell row={row} /> },
          { title: '收款方式', dataIndex: 'transferChannel' },
          { title: '流水号', dataIndex: 'transferNo' },
          { title: '凭证图', render: (_, row) => row.proofImageUrl ? <a href={row.proofImageUrl} target="_blank" rel="noreferrer">查看</a> : '-' },
          { title: '创建时间', dataIndex: 'createdAt', render: dateTime },
          { title: '审核时间', dataIndex: 'reviewedAt', render: dateTime },
          {
            title: '操作',
            render: (_, row) => row.status === 'PENDING' ? (
              <Space>
                <Button size="small" type="primary" loading={approve.isPending} onClick={() => approve.mutate({ id: row.id })}>通过</Button>
                <Button size="small" danger loading={reject.isPending} onClick={() => Modal.confirm({
                  title: '确认驳回这条申请？',
                  onOk: () => reject.mutate({ id: row.id, reason: '审核驳回' }),
                })}>驳回</Button>
              </Space>
            ) : row.voucher?.voucherNo || '-',
          },
        ]} />
      </Card>
      <Modal title="兑换码已生成" open={Boolean(approvedCode)} onCancel={() => setApprovedCode('')} footer={<Button type="primary" onClick={() => setApprovedCode('')}>关闭</Button>}>
        <Space style={{ marginBottom: 8 }}>
          <b>有效期内未兑换前，管理员和代理都可在记录中再次复制</b>
          <Button size="small" onClick={() => copyText(approvedCode)}>复制</Button>
        </Space>
        <pre className="trialCodeBox">{approvedCode}</pre>
      </Modal>
    </>
  );
}

function AgentVoucherRequestStatus({ status }: { status: string }) {
  const color: Record<string, string> = { PENDING: 'gold', APPROVED: 'green', REJECTED: 'red', CANCELLED: 'default' };
  const label: Record<string, string> = { PENDING: '待审核', APPROVED: '已通过', REJECTED: '已驳回', CANCELLED: '已取消' };
  return <Tag color={color[status] || 'default'}>{label[status] || status}</Tag>;
}

function AgentAccountingModalButton({ agent }: { agent: any }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['agentAccounting', agent.id],
    queryFn: () => api<any>(`/api/admin/agent-credit/agents/${agent.id}/accounting`),
    enabled: open,
  });
  const settle = useMutation({
    mutationFn: (id: string) => api(`/api/admin/agent-reconciliation-orders/${id}/settle`, { method: 'POST', body: JSON.stringify({ status: 'SETTLED' }) }),
    onSuccess: () => {
      message.success('对账单已结算');
      ['agentAccounting', 'agentReconciliationOrders', 'agentCreditAccounts', 'agents'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    },
    onError: err => message.error(err instanceof Error ? err.message : '结算失败'),
  });
  const approveGrant = useMutation({
    mutationFn: (id: string) => api(`/api/admin/agent-credit/grant-requests/${id}/approve`, { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: () => {
      message.success('代理配额已入账');
      ['agentAccounting', 'agentReconciliationOrders', 'agentCreditAccounts', 'agents'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    },
    onError: err => message.error(err instanceof Error ? err.message : '审核失败'),
  });
  const rejectGrant = useMutation({
    mutationFn: (id: string) => api(`/api/admin/agent-credit/grant-requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason: '管理员驳回配额申请' }) }),
    onSuccess: () => {
      message.success('配额申请已驳回');
      ['agentAccounting', 'agentReconciliationOrders'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    },
    onError: err => message.error(err instanceof Error ? err.message : '驳回失败'),
  });
  const detail = q.data || {};
  const account = detail.agent?.creditAccount || {};
  const stats = detail.stats || {};
  const voucherByStatus = stats.vouchers?.byStatus || {};
  const requestByStatus = stats.voucherRequests?.byStatus || {};
  const reconciliationByStatus = stats.reconciliation?.byStatus || {};
  return (
    <>
      <Button size="small" onClick={() => setOpen(true)}>账务</Button>
      <Modal title={`${agent.name} 账务详情`} open={open} onCancel={() => setOpen(false)} footer={null} width={1180}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div className="grid4">
            <Card><Statistic title="可用额度" value={account.availableCredits || 0} suffix="积分" /></Card>
            <Card><Statistic title="冻结额度" value={account.frozenCredits || 0} suffix="积分" /></Card>
            <Card><Statistic title="已使用额度" value={account.usedCredits || 0} suffix="积分" /></Card>
            <Card><Statistic title="绑定客户" value={stats.customerCount || 0} /></Card>
          </div>
          <div className="grid4">
            <Card><Statistic title="待兑换凭证" value={voucherByStatus.AVAILABLE?.credits || 0} suffix="积分" /></Card>
            <Card><Statistic title="已兑换凭证" value={voucherByStatus.REDEEMED?.credits || 0} suffix="积分" /></Card>
            <Card><Statistic title="待审核申请" value={requestByStatus.PENDING?.credits || 0} suffix="积分" /></Card>
            <Card><Statistic title="待对账额度" value={reconciliationByStatus.PENDING?.credits || 0} suffix="积分" /></Card>
          </div>
          <Tabs items={[
            { key: 'orders', label: '对账订单', children: <Table rowKey="id" loading={q.isLoading} dataSource={detail.reconciliationOrders || []} columns={[
              { title: '订单号', dataIndex: 'orderNo' },
              { title: '类型', dataIndex: 'type' },
              { title: '状态', dataIndex: 'status' },
              { title: '额度', dataIndex: 'credits', render: money },
              { title: '金额', dataIndex: 'amountCents', render: yuan },
              { title: '收款方式', dataIndex: 'transferChannel' },
              { title: '流水号', dataIndex: 'transferNo' },
              { title: '确认人', dataIndex: ['confirmedByAdmin', 'nickname'] },
              { title: '时间', dataIndex: 'createdAt', render: dateTime },
              { title: '操作', render: (_: any, row: any) => {
                if (row.type === 'PREPAID_GRANT' && row.status === 'PENDING') {
                  return (
                    <Space>
                      <Button size="small" type="primary" loading={approveGrant.isPending} onClick={() => approveGrant.mutate(row.id)}>配额入账</Button>
                      <Button size="small" danger loading={rejectGrant.isPending} onClick={() => rejectGrant.mutate(row.id)}>驳回</Button>
                    </Space>
                  );
                }
                return row.status !== 'SETTLED' ? <Button size="small" loading={settle.isPending} onClick={() => settle.mutate(row.id)}>标记结算</Button> : null;
              } },
            ]} /> },
	            { key: 'vouchers', label: '额度凭证', children: <Table rowKey="id" loading={q.isLoading} dataSource={detail.vouchers || []} columns={[
	              { title: '凭证号', dataIndex: 'voucherNo' },
	              { title: '客户', render: (_: any, row: any) => row.user?.nickname || row.user?.phone || '-' },
	              { title: '兑换码', render: (_: any, row: any) => <VoucherCodeCell row={row} /> },
	              { title: '额度', dataIndex: 'credits', render: money },
	              { title: '金额', dataIndex: 'amountCents', render: yuan },
	              { title: '状态', dataIndex: 'status' },
	              { title: '过期时间', dataIndex: 'expiredAt', render: dateTime },
	              { title: '兑换时间', dataIndex: 'redeemedAt', render: dateTime },
	            ]} /> },
	            { key: 'requests', label: '充值码申请', children: <Table rowKey="id" loading={q.isLoading} dataSource={detail.voucherRequests || []} columns={[
	              { title: '申请号', dataIndex: 'requestNo' },
	              { title: '客户', render: (_: any, row: any) => row.user?.nickname || row.user?.phone || row.userId },
	              { title: '额度', dataIndex: 'credits', render: money },
	              { title: '金额', dataIndex: 'amountCents', render: yuan },
	              { title: '状态', dataIndex: 'status', render: (status: string) => <AgentVoucherRequestStatus status={status} /> },
	              { title: '兑换码', render: (_: any, row: any) => <VoucherCodeCell row={row} /> },
	              { title: '收款方式', dataIndex: 'transferChannel' },
	              { title: '流水号', dataIndex: 'transferNo' },
	              { title: '关联凭证', render: (_: any, row: any) => row.voucher?.voucherNo || '-' },
	              { title: '时间', dataIndex: 'createdAt', render: dateTime },
	            ]} /> },
            { key: 'ledger', label: '额度流水', children: <Table rowKey="id" loading={q.isLoading} dataSource={detail.ledger || []} columns={[
              { title: '类型', dataIndex: 'type' },
              { title: '变动', dataIndex: 'amount', render: money },
              { title: '前余额', dataIndex: 'balanceBefore', render: money },
              { title: '后余额', dataIndex: 'balanceAfter', render: money },
              { title: '关联', render: (_: any, row: any) => row.relatedType ? `${row.relatedType}:${row.relatedId || '-'}` : '-' },
              { title: '备注', dataIndex: 'remark' },
              { title: '时间', dataIndex: 'createdAt', render: dateTime },
            ]} /> },
            { key: 'customers', label: '绑定客户', children: <Table rowKey="id" loading={q.isLoading} dataSource={detail.customers || []} columns={[
              { title: '客户名', render: (_: any, row: any) => row.customerName || row.user?.nickname || '-' },
              { title: '手机号', render: (_: any, row: any) => row.customerPhone || row.user?.phone || '-' },
              { title: '余额', dataIndex: ['user', 'wallet', 'balance'], render: (v) => money(v || 0) },
              { title: '绑定时间', dataIndex: 'createdAt', render: dateTime },
              { title: '注册时间', dataIndex: ['user', 'createdAt'], render: dateTime },
            ]} /> },
          ]} />
        </Space>
      </Modal>
    </>
  );
}

function GrantAgentCreditButton() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const amountYuan = Form.useWatch('amountYuan', form);
  const qc = useQueryClient();
  const agents = useQuery({ queryKey: ['agents'], queryFn: () => api<ApiList<any>>('/api/admin/agents') });
  const m = useMutation({
    mutationFn: (values: any) => api('/api/admin/agent-credit/grants', {
      method: 'POST',
      body: JSON.stringify({
        agentId: values.agentId,
        credits: creditsFromYuan(values.amountYuan),
        amountCents: Math.round(Number(values.amountYuan || 0) * 100),
        transferChannel: values.transferChannel,
        transferNo: values.transferNo,
        proofImageUrl: values.proofImageUrl,
        remark: values.remark,
      }),
    }),
    onSuccess: () => {
      message.success('代理额度已入账');
      setOpen(false);
      form.resetFields();
      ['agentCreditAccounts', 'agentReconciliationOrders', 'agents'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    },
    onError: err => message.error(err instanceof Error ? err.message : '入账失败'),
  });
  useEffect(() => {
    form.setFieldValue('credits', creditsFromYuan(amountYuan));
  }, [amountYuan, form]);
  return (
    <>
      <Button type="primary" onClick={() => setOpen(true)}>手动配额度</Button>
      <Modal title="代理线下转账入账" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={m.isPending}>
        <Form form={form} layout="vertical" onFinish={values => m.mutate(values)}>
          <Form.Item name="agentId" label="代理" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={(agents.data?.items || []).map((agent: any) => ({ value: agent.id, label: `${agent.name} ${agent.user?.phone || ''}` }))} />
          </Form.Item>
          <div className="formGrid2">
            <Form.Item name="amountYuan" label="线下实付金额" rules={[{ required: true, message: '请填写线下实付金额' }]}><InputNumber min={0.01} precision={2} addonAfter="元" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="credits" label={`配给额度（${OFFLINE_CREDITS_PER_CNY} 积分 / 元）`} rules={[{ required: true }]}><InputNumber min={1} precision={0} disabled style={{ width: '100%' }} /></Form.Item>
          </div>
          <Form.Item name="transferChannel" label="收款方式"><Input placeholder="微信 / 支付宝 / 银行卡" /></Form.Item>
          <Form.Item name="transferNo" label="转账流水号"><Input /></Form.Item>
          <Form.Item name="proofImageUrl" label="凭证图片 URL"><Input /></Form.Item>
          <Form.Item name="remark" label="备注"><Input /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function AgentReconciliationTable({ admin = false }: { admin?: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: [admin ? 'agentReconciliationOrders' : 'myAgentReconciliationOrders'],
    queryFn: () => api<ApiList<any>>(admin ? '/api/admin/agent-reconciliation-orders' : '/api/agent/reconciliation-orders'),
  });
  const settle = useMutation({
    mutationFn: (id: string) => api(`/api/admin/agent-reconciliation-orders/${id}/settle`, { method: 'POST', body: JSON.stringify({ status: 'SETTLED' }) }),
    onSuccess: () => {
      message.success('对账单已结算');
      qc.invalidateQueries({ queryKey: ['agentReconciliationOrders'] });
    },
    onError: err => message.error(err instanceof Error ? err.message : '结算失败'),
  });
  const approveGrant = useMutation({
    mutationFn: (id: string) => api(`/api/admin/agent-credit/grant-requests/${id}/approve`, { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: () => {
      message.success('代理配额已入账');
      ['agentReconciliationOrders', 'agentCreditAccounts', 'agents'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    },
    onError: err => message.error(err instanceof Error ? err.message : '审核失败'),
  });
  const rejectGrant = useMutation({
    mutationFn: (id: string) => api(`/api/admin/agent-credit/grant-requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason: '管理员驳回配额申请' }) }),
    onSuccess: () => {
      message.success('配额申请已驳回');
      qc.invalidateQueries({ queryKey: ['agentReconciliationOrders'] });
    },
    onError: err => message.error(err instanceof Error ? err.message : '驳回失败'),
  });
  return <Card title={admin ? '代理对账订单' : '我的对账订单'}><Table rowKey="id" loading={q.isLoading} dataSource={q.data?.items || []} columns={[
    { title: '订单号', dataIndex: 'orderNo' },
    ...(admin ? [{ title: '代理', dataIndex: ['agent', 'name'] }] : []),
    { title: '类型', dataIndex: 'type' },
    { title: '状态', dataIndex: 'status' },
    { title: '额度', dataIndex: 'credits', render: money },
    { title: '金额', dataIndex: 'amountCents', render: yuan },
    { title: '关联', render: (_, row) => row.relatedType ? `${row.relatedType}:${row.relatedId || '-'}` : '-' },
    { title: '备注', dataIndex: 'remark' },
    { title: '时间', dataIndex: 'createdAt', render: dateTime },
    ...(admin ? [{ title: '操作', render: (_: any, row: any) => {
      if (row.type === 'PREPAID_GRANT' && row.status === 'PENDING') {
        return (
          <Space>
            <Button size="small" type="primary" loading={approveGrant.isPending} onClick={() => approveGrant.mutate(row.id)}>配额入账</Button>
            <Button size="small" danger loading={rejectGrant.isPending} onClick={() => Modal.confirm({
              title: '驳回配额申请',
              content: row.orderNo,
              onOk: () => rejectGrant.mutateAsync(row.id),
            })}>驳回</Button>
          </Space>
        );
      }
      return row.status !== 'SETTLED' ? <Button size="small" onClick={() => settle.mutate(row.id)}>标记结算</Button> : null;
    } }] : []),
  ]} /></Card>;
}

function EditAgentButton({ agent }: { agent: any }) {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const agents = useQuery({ queryKey: ['agents'], queryFn: () => api<ApiList<any>>('/api/admin/agents') });
  const m = useMutation({
    mutationFn: (values: any) => api(`/api/admin/agents/${agent.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...values,
        parentAgentId: values.parentAgentId || null,
      }),
    }),
    onSuccess: () => {
      message.success('代理已更新');
      setOpen(false);
      ['agents', 'commissions', 'settlements'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    },
    onError: err => message.error(err instanceof Error ? err.message : '更新失败'),
  });
  function openModal() {
    form.setFieldsValue({
      name: agent.name,
      level: agent.level,
      parentAgentId: agent.parentAgentId || undefined,
      commissionRate: Number(agent.commissionRate || 0),
      settlementDelayDays: Number(agent.settlementDelayDays || 1),
      status: agent.status,
    });
    setOpen(true);
  }
  return (
    <>
      <Button size="small" onClick={openModal}>编辑</Button>
      <Modal title="编辑代理" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={m.isPending}>
        <Form form={form} layout="vertical" onFinish={values => m.mutate(values)}>
          <Form.Item name="name" label="代理名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="level" label="等级"><Select options={[{ value: 'NORMAL', label: '普通代理' }, { value: 'FOUNDER', label: '一级/初创代理' }]} /></Form.Item>
          <Form.Item name="parentAgentId" label="上级代理">
            <Select allowClear options={(agents.data?.items || []).filter((item: any) => item.id !== agent.id).map((item: any) => ({ value: item.id, label: item.name }))} />
          </Form.Item>
          <Form.Item name="commissionRate" label="佣金比例"><InputNumber min={0} max={1} step={0.01} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="settlementDelayDays" label="对账期天数"><InputNumber min={1} max={3} precision={0} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="status" label="状态"><Select options={[{ value: 'ACTIVE', label: '启用' }, { value: 'DISABLED', label: '停用' }]} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function Commissions() {
  return <Tabs items={[
    { key: 'commissions', label: '佣金明细', children: <CommissionTable /> },
    { key: 'settlements', label: '结算单', children: <Settlements /> },
  ]} />;
}

function CommissionTable() {
  const qc = useQueryClient();
  const settle = useMutation({
    mutationFn: (id: string) => api(`/api/commissions/${id}/settle`, { method: 'POST' }),
    onSuccess: () => { message.success('已结算'); qc.invalidateQueries({ queryKey: ['commissions'] }); qc.invalidateQueries({ queryKey: ['settlements'] }); qc.invalidateQueries({ queryKey: ['agents'] }); },
    onError: err => message.error(err instanceof Error ? err.message : '结算失败'),
  });
  const q = useQuery({ queryKey: ['commissions'], queryFn: () => api<ApiList<any>>('/api/commissions') });
  return <Card extra={<SettleAgentButton />}><Table rowKey="id" loading={q.isLoading} dataSource={q.data?.items || []} columns={[
    { title: '代理', dataIndex: ['agent', 'name'] },
    { title: '客户', render: (_, row) => row.redemption?.user?.nickname || row.redemption?.user?.phone || '-' },
    { title: '套餐', dataIndex: ['redemption', 'plan', 'name'] },
    { title: '会员账号', dataIndex: ['redemption', 'account', 'code'] },
    { title: '来源', dataIndex: 'sourceType' },
    { title: '金额', dataIndex: 'amount', render: money },
    { title: '状态', render: (_, row) => <Space><span>{row.status}</span>{row.status === 'PENDING' && !row.settleEligible ? <Tag>未到对账期</Tag> : null}</Space> },
    { title: '时间', dataIndex: 'createdAt', render: dateTime },
    { title: '可结算时间', dataIndex: 'settleEligibleAt', render: dateTime },
    { title: '操作', render: (_, row) => row.status === 'PENDING' ? <Button size="small" onClick={() => settle.mutate(row.id)}>标记结算</Button> : null },
  ]} /></Card>;
}

function SettleAgentButton() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const agents = useQuery({ queryKey: ['agents'], queryFn: () => api<ApiList<any>>('/api/admin/agents') });
  const agentOptions = (agents.data?.items || []).map((agent: any) => {
    const pending = agent.stats?.pendingCommissionAmount || 0;
    const eligible = agent.stats?.eligibleCommissionAmount || 0;
    const delay = agent.settlementDelayDays || 1;
    return {
      value: agent.id,
      disabled: eligible <= 0,
      label: `${agent.name} · 可结 ${money(eligible)} · 待结 ${money(pending)} · 对账期 ${delay} 天${pending > 0 && eligible <= 0 ? ' · 未到期' : ''}`,
    };
  });
  const m = useMutation({
    mutationFn: (values: any) => api(`/api/settlements/agent/${values.agentId}/settle-pending`, { method: 'POST', body: JSON.stringify({ remark: values.remark }) }),
    onSuccess: (data: any) => {
      message.success(`已结算 ${money(data.settlement.amount)}，共 ${data.count} 笔`);
      setOpen(false);
      form.resetFields();
      ['commissions', 'settlements', 'agents', 'agentPerformance'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    },
    onError: err => message.error(err instanceof Error ? err.message : '结算失败，请刷新后重试'),
  });
  return (
    <>
      <Button type="primary" onClick={() => setOpen(true)}>按代理结算</Button>
      <Modal title="按代理结清待结佣金" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={m.isPending}>
        <Form form={form} layout="vertical" onFinish={values => m.mutate(values)}>
          <Form.Item name="agentId" label="代理" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              loading={agents.isLoading}
              placeholder="选择代理后结清该代理全部待结佣金"
              options={agentOptions.map((option: any) => ({ ...option, disabled: false }))}
            />
          </Form.Item>
          <div className="muted" style={{ marginTop: -12, marginBottom: 18 }}>
            管理员确认线下付款后，可直接结清该代理全部待结佣金，不受对账期限制。
          </div>
          <Form.Item name="remark" label="备注"><Input /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function Settlements() {
  const q = useQuery({ queryKey: ['settlements'], queryFn: () => api<ApiList<any>>('/api/settlements') });
  return <Card><Table rowKey="id" loading={q.isLoading} dataSource={q.data?.items || []} columns={[
    { title: '代理', dataIndex: ['agent', 'name'] },
    { title: '金额', dataIndex: 'amount', render: money },
    { title: '状态', dataIndex: 'status' },
    { title: '备注', dataIndex: 'remark' },
    { title: '创建时间', dataIndex: 'createdAt', render: dateTime },
    { title: '结算时间', dataIndex: 'settledAt', render: dateTime },
  ]} /></Card>;
}

function MembershipPlans() {
  const q = useQuery({ queryKey: ['membershipPlans'], queryFn: () => api<ApiList<any>>('/api/membership/plans') });
  return <Card title="会员套餐" extra={<CreatePlanButton />}><Table rowKey="id" loading={q.isLoading} dataSource={q.data?.items || []} columns={[
    { title: '名称', dataIndex: 'name' },
    { title: '价格', dataIndex: 'price', render: (value: number) => `${(Number(value || 0) / 100).toFixed(2)} 元` },
    { title: '天数', dataIndex: 'durationDays' },
    { title: '状态', dataIndex: 'status' },
    { title: '操作', render: (_, row) => <EditPlanButton plan={row} /> },
  ]} /></Card>;
}

function TrialCardStatus({ status }: { status: string }) {
  const color: Record<string, string> = { AVAILABLE: 'green', USED: 'blue', VOIDED: 'default', EXPIRED: 'red' };
  return <Tag color={color[status] || 'default'}>{status}</Tag>;
}

function TrialCards() {
  const q = useQuery({ queryKey: ['trialCards'], queryFn: () => api<ApiList<any>>('/api/trial-cards') });
  const qc = useQueryClient();
  const voidCard = useMutation({
    mutationFn: (id: string) => api(`/api/trial-cards/${id}/void`, { method: 'PATCH' }),
    onSuccess: () => { message.success('体验卡已作废'); qc.invalidateQueries({ queryKey: ['trialCards'] }); },
    onError: err => message.error(err instanceof Error ? err.message : '作废失败'),
  });
  return <Card title="体验卡" extra={<CreateTrialCardsButton />}><Table rowKey="id" loading={q.isLoading} dataSource={q.data?.items || []} columns={[
    { title: '卡码', dataIndex: 'code' },
    { title: '套餐', dataIndex: ['plan', 'name'] },
    { title: '代理', dataIndex: ['agent', 'name'] },
    { title: '使用用户', render: (_, row) => row.usedUser?.nickname || row.usedUser?.phone || '-' },
    { title: '状态', dataIndex: 'status', render: (status: string) => <TrialCardStatus status={status} /> },
    { title: '过期时间', dataIndex: 'expiredAt', render: dateTime },
    { title: '使用时间', dataIndex: 'usedAt', render: dateTime },
    { title: '操作', render: (_, row) => row.status === 'AVAILABLE' ? <Button size="small" danger loading={voidCard.isPending} onClick={() => voidCard.mutate(row.id)}>作废</Button> : null },
  ]} /></Card>;
}

function CreateTrialCardsButton() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const plans = useQuery({ queryKey: ['membershipPlans'], queryFn: () => api<ApiList<any>>('/api/membership/plans') });
  const agents = useQuery({ queryKey: ['agents'], queryFn: () => api<ApiList<any>>('/api/admin/agents') });
  const m = useMutation({
    mutationFn: (values: any) => api('/api/trial-cards', {
      method: 'POST',
      body: JSON.stringify({
        planId: values.planId,
        agentId: values.agentId,
        quantity: values.quantity,
        expiredAt: new Date(values.expiredAt).toISOString(),
      }),
    }),
    onSuccess: () => { message.success('体验卡已生成'); setOpen(false); form.resetFields(); qc.invalidateQueries({ queryKey: ['trialCards'] }); },
    onError: err => message.error(err instanceof Error ? err.message : '生成失败'),
  });
  return (
    <>
      <Button type="primary" onClick={() => setOpen(true)}>批量生成</Button>
      <Modal title="批量生成体验卡" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={m.isPending}>
        <Form form={form} layout="vertical" initialValues={{ quantity: 10 }} onFinish={values => m.mutate(values)}>
          <Form.Item name="planId" label="会员套餐" rules={[{ required: true }]}>
            <Select options={(plans.data?.items || []).filter((p: any) => p.status === 'ACTIVE').map(p => ({ value: p.id, label: p.name }))} />
          </Form.Item>
          <Form.Item name="agentId" label="指定代理">
            <Select allowClear options={(agents.data?.items || []).map(a => ({ value: a.id, label: a.name }))} />
          </Form.Item>
          <Form.Item name="quantity" label="数量" rules={[{ required: true }]}>
            <InputNumber min={1} max={500} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="expiredAt" label="过期时间" rules={[{ required: true }]}>
            <Input type="datetime-local" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function AdjustWalletButton({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (values: any) => api(`/api/wallets/${userId}/adjust`, { method: 'POST', body: JSON.stringify(values) }),
    onSuccess: () => { message.success('调账成功'); setOpen(false); form.resetFields(); qc.invalidateQueries({ queryKey: ['wallets'] }); },
    onError: err => message.error(err instanceof Error ? err.message : '调账失败'),
  });
  return (
    <>
      <Button size="small" onClick={() => setOpen(true)}>调账</Button>
      <Modal title="钱包调账" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={m.isPending}>
        <Form form={form} layout="vertical" initialValues={{ type: 'ADMIN_ADD' }} onFinish={values => m.mutate(values)}>
          <Form.Item name="type" label="类型" rules={[{ required: true }]}>
            <Select options={[{ value: 'ADMIN_ADD', label: '加款' }, { value: 'ADMIN_DEDUCT', label: '扣款' }]} />
          </Form.Item>
          <Form.Item name="amount" label="积分" rules={[{ required: true }]}>
            <InputNumber min={1} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="remark" label="备注" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function ProviderFormFields({ editing = false }: { editing?: boolean }) {
  return (
    <>
      <div className="formGrid2">
        <Form.Item name="providerKey" label="渠道 Key" rules={[{ required: true }]}>
          <Input disabled={editing} placeholder="sora2_main / gpt_image_main" />
        </Form.Item>
        <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="type" label="类型"><Select allowClear options={[{ value: 'IMAGE', label: '图片' }, { value: 'VIDEO', label: '视频' }, { value: 'LLM', label: '语言模型' }]} /></Form.Item>
        <Form.Item name="adapter" label="Adapter" rules={[{ required: true }]}><Input placeholder="openai-image / grok-image / gemini-image-generate / gemini-video / gemini-chat" /></Form.Item>
        <Form.Item name="baseUrl" label="Base URL" rules={[{ required: true }]}><Input placeholder="https://api.example.com/v1" /></Form.Item>
        <Form.Item name="apiKey" label="API Key" rules={editing ? [] : [{ required: true }]}><Input.Password placeholder={editing ? '留空则保留原 Key' : ''} /></Form.Item>
        <Form.Item name="endpointPath" label="提交接口路径"><Input placeholder="/images/generations /video/generations" /></Form.Item>
        <Form.Item name="statusEndpointPath" label="状态接口路径"><Input placeholder="/video/status" /></Form.Item>
        <Form.Item name="uploadMode" label="上传服务器"><Select allowClear options={uploadModeOptions} /></Form.Item>
        <Form.Item name="requestMethod" label="请求方法"><Input placeholder="sync / async-poll / GET / POST" /></Form.Item>
        <Form.Item name="defaultModel" label="默认真实模型"><Input /></Form.Item>
        <Form.Item name="timeoutMs" label="超时毫秒"><InputNumber min={1000} precision={0} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="weight" label="权重"><InputNumber min={0} precision={0} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="concurrencyLimit" label="并发上限"><InputNumber min={0} precision={0} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="failureThreshold" label="失败阈值"><InputNumber min={0} precision={0} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="status" label="状态"><Select options={[{ value: 'ACTIVE', label: '启用' }, { value: 'DISABLED', label: '停用' }]} /></Form.Item>
      </div>
      <Form.Item name="defaultParamsText" label="默认参数 JSON"><Input.TextArea rows={4} placeholder="{}" /></Form.Item>
    </>
  );
}

function normalizeProviderPayload(values: any) {
  const payload = { ...values };
  if ('uploadMode' in payload) payload.uploadMode = normalizeUploadModeValue(payload.uploadMode);
  if ('defaultParamsText' in payload) {
    payload.defaultParams = parseJsonInput(payload.defaultParamsText || '{}');
    delete payload.defaultParamsText;
  }
  return payload;
}

function normalizeProviderFormValues(provider: any) {
  return {
    providerKey: provider.providerKey,
    name: provider.name,
    type: provider.type || undefined,
    adapter: provider.adapter || 'openai-image',
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey || '',
    endpointPath: provider.endpointPath || '',
    statusEndpointPath: provider.statusEndpointPath || '',
    uploadMode: provider.uploadMode || '',
    requestMethod: provider.requestMethod || '',
    defaultModel: provider.defaultModel || '',
    defaultParamsText: JSON.stringify(provider.defaultParams || {}, null, 2),
    timeoutMs: Number(provider.timeoutMs || 60000),
    weight: Number(provider.weight || 100),
    concurrencyLimit: Number(provider.concurrencyLimit || 0),
    failureThreshold: Number(provider.failureThreshold || 5),
    status: provider.status,
  };
}

function CreateProviderButton() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (values: any) => api('/api/admin/upstream-providers', { method: 'POST', body: JSON.stringify(normalizeProviderPayload(values)) }),
    onSuccess: () => { message.success('渠道已创建'); setOpen(false); form.resetFields(); qc.invalidateQueries({ queryKey: ['providers'] }); },
    onError: err => message.error(err instanceof Error ? err.message : '创建失败'),
  });
  return (
    <>
      <Button type="primary" onClick={() => setOpen(true)}>新增渠道</Button>
      <Modal title="新增上游渠道" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={m.isPending} width={820}>
        <Form form={form} layout="vertical" initialValues={{ status: 'ACTIVE', adapter: 'openai-image', timeoutMs: 60000, weight: 100, concurrencyLimit: 0, failureThreshold: 5, defaultParamsText: '{}' }} onFinish={values => m.mutate(values)}>
          <ProviderFormFields />
        </Form>
      </Modal>
    </>
  );
}

function EditProviderButton({ provider }: { provider: any }) {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (values: any) => {
      const payload = normalizeProviderPayload(values);
      if (!payload.apiKey) delete payload.apiKey;
      return api(`/api/admin/upstream-providers/${provider.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    },
    onSuccess: () => { message.success('渠道已更新'); setOpen(false); qc.invalidateQueries({ queryKey: ['providers'] }); },
    onError: err => message.error(err instanceof Error ? err.message : '更新失败'),
  });
  function openModal() {
    form.setFieldsValue(normalizeProviderFormValues(provider));
    setOpen(true);
  }
  return (
    <>
      <Button size="small" onClick={openModal}>编辑</Button>
      <Modal title="编辑上游渠道" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={m.isPending} width={820}>
        <Form form={form} layout="vertical" onFinish={values => m.mutate(values)}>
          <ProviderFormFields editing />
        </Form>
      </Modal>
    </>
  );
}

function TestProviderButton({ provider }: { provider: any }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [form] = Form.useForm();
  const m = useMutation({
    mutationFn: (values: any) => {
      const method = values.method || 'GET';
      const payload = method === 'POST' ? parseJsonInput(values.payload) : undefined;
      return api(`/api/admin/upstream-providers/${provider.id}/test`, {
        method: 'POST',
        body: JSON.stringify({
          endpointPath: values.endpointPath || '/models',
          method,
          ...(method === 'POST' ? { payload } : {}),
        }),
      });
    },
    onSuccess: data => { setResult(data); message.success('上游测试完成'); },
    onError: err => { setResult(null); message.error(err instanceof Error ? err.message : '测试失败'); },
  });
  function openModal() {
    form.setFieldsValue({ method: 'GET', endpointPath: '/models', payload: '{}' });
    setResult(null);
    setOpen(true);
  }
  return (
    <>
      <Button size="small" onClick={openModal}>测试</Button>
      <Modal title={`测试上游：${provider.name}`} open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={m.isPending} okText="开始测试" width={760}>
        <Form form={form} layout="vertical" onFinish={values => m.mutate(values)}>
          <div className="formGrid2">
            <Form.Item name="method" label="方法" rules={[{ required: true }]}><Select options={[{ value: 'GET', label: 'GET' }, { value: 'POST', label: 'POST' }]} /></Form.Item>
            <Form.Item name="endpointPath" label="接口路径" rules={[{ required: true }]}><Input placeholder="/models" /></Form.Item>
          </div>
          <Form.Item name="payload" label="POST 请求体 JSON"><Input.TextArea rows={5} /></Form.Item>
        </Form>
        <pre className="generateResultJson">{result ? JSON.stringify(result, null, 2) : '等待测试结果'}</pre>
      </Modal>
    </>
  );
}

function parseJsonInput(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('请求体 JSON 格式错误');
  }
}

function CreateModelButton() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (values: any) => api('/api/admin/models', { method: 'POST', body: JSON.stringify(normalizeSimpleModelSubmitValues(values)) }),
    onSuccess: async (data: any) => {
      message.success('模型已创建');
      setOpen(false);
      form.resetFields();
      if (data?.model) {
        qc.setQueryData(['adminModels'], (old: ApiList<any> | undefined) => old?.items ? { ...old, items: [data.model, ...old.items.filter(item => item.id !== data.model.id)] } : old);
      }
      await refreshModelCaches(qc);
    },
    onError: err => message.error(err instanceof Error ? err.message : '创建失败'),
  });
  return (
    <>
      <Button type="primary" onClick={() => setOpen(true)}>新增模型</Button>
      <Modal title="新增模型" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={m.isPending} width={640}>
        <Form form={form} layout="vertical" initialValues={{ type: 'IMAGE', adapter: 'openai-edits', baseUrl: 'http://localhost:8317/v1', uploadMode: '' }} onFinish={values => m.mutate(values)}>
          <SimpleModelFormFields />
        </Form>
      </Modal>
    </>
  );
}

function EditModelButton({ model }: { model: any }) {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (values: any) => {
      const payload = normalizeSimpleModelSubmitValues(values, true);
      return api(`/api/admin/models/${model.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    },
    onSuccess: async (data: any) => {
      message.success('模型已更新');
      setOpen(false);
      mergeAdminModelCache(qc, data?.model);
      await refreshModelCaches(qc);
    },
    onError: err => message.error(err instanceof Error ? err.message : '更新失败'),
  });
  function openModal() {
    form.setFieldsValue(normalizeSimpleModelFormValues(model));
    setOpen(true);
  }
  return (
    <>
      <Button size="small" onClick={openModal}>编辑</Button>
      <Modal title="编辑模型" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={m.isPending} width={640}>
        <Form form={form} layout="vertical" onFinish={values => m.mutate(values)}>
          <SimpleModelFormFields editing />
        </Form>
      </Modal>
    </>
  );
}

function SimpleModelFormFields({ editing = false }: { editing?: boolean }) {
  const form = Form.useFormInstance();
  const selectedType = (Form.useWatch('type', form) || 'IMAGE') as 'IMAGE' | 'VIDEO' | 'LLM';
  const adapterOptions = modelAdapterOptions.filter(option => option.type === selectedType);
  useEffect(() => {
    const currentAdapter = form.getFieldValue('adapter');
    if (!adapterOptions.some(option => option.value === currentAdapter)) {
      form.setFieldValue('adapter', adapterOptions[0]?.value);
    }
  }, [adapterOptions, form]);
  return (
    <>
      <Form.Item name="type" label="模型分类" rules={[{ required: true }]}>
        <Select options={modelTypeOptions} />
      </Form.Item>
      <Form.Item name="adapter" label="渠道类型" rules={[{ required: true }]}>
        <Select options={adapterOptions} />
      </Form.Item>
      <Form.Item name="baseUrl" label="Base URL" rules={[{ required: true }]}><Input placeholder="http://localhost:8317/v1" /></Form.Item>
      <Form.Item name="model" label="model" rules={[{ required: true }]}><Input placeholder="veo-3.1 / sora-2 / gpt-image-2 / gemini-3-pro-image-preview" /></Form.Item>
      <Form.Item name="modelNick" label="modelNick" rules={[{ required: true }]}><Input placeholder="画布下拉展示名" /></Form.Item>
      {selectedType !== 'LLM' && (
        <Form.Item name="uploadMode" label="上传服务器">
          <Select options={uploadModeOptions} />
        </Form.Item>
      )}
      <Form.Item name="key" label="key" rules={editing ? [] : [{ required: true }]}><Input.Password placeholder={editing ? '留空则保留原 Key' : 'sk-...'} /></Form.Item>
    </>
  );
}

const modelTypeOptions = [
  { value: 'IMAGE', label: '图片模型' },
  { value: 'VIDEO', label: '视频模型' },
  { value: 'LLM', label: '大语言模型' },
];

const modelAdapterOptions = [
  { value: 'openai-image', label: 'OpenAI 图片生成 /images/generations', type: 'IMAGE' },
  { value: 'openai-edits', label: 'OpenAI 图片编辑 /images/edits', type: 'IMAGE' },
  { value: 'gpt-image-v2', label: 'GPT Image V2 /images/generations', type: 'IMAGE' },
  { value: 'gemini-image', label: 'Gemini 图片 /v1beta/models/{model}:generateContent', type: 'IMAGE' },
  { value: 'gemini-image-generate', label: 'Gemini 统一文生图 /images/generations', type: 'IMAGE' },
  { value: 'gemini-image-edit', label: 'Gemini 统一图生图 /images/edits', type: 'IMAGE' },
  { value: 'grok-image', label: 'Grok 文生图 /images/generations', type: 'IMAGE' },
  { value: 'grok-image-edit', label: 'Grok 图生图 /images/edits', type: 'IMAGE' },
  { value: 'sora-video', label: 'Sora v3 视频 /videos + /videos/{id}', type: 'VIDEO' },
  { value: 'seedance2-vip', label: 'Seedance 2.0 VIP 视频 /videos + /videos/{id}', type: 'VIDEO' },
  { value: 'grok-video', label: 'Grok 生视频 /videos', type: 'VIDEO' },
  { value: 'gemini-video', label: 'Gemini Veo 视频 /videos + /videos/{id}', type: 'VIDEO' },
  { value: 'veo-chat', label: 'Veo 3.1 视频 /v1/chat/completions', type: 'VIDEO' },
  { value: 'notevideo', label: '视频通用 /video/generations', type: 'VIDEO' },
  { value: 'seedance', label: 'Seedance 视频', type: 'VIDEO' },
  { value: 'jimeng', label: '即梦视频', type: 'VIDEO' },
  { value: 'openai-chat', label: 'OpenAI Chat /chat/completions', type: 'LLM' },
  { value: 'grok-chat', label: 'Grok Chat /chat/completions', type: 'LLM' },
  { value: 'gemini-chat', label: 'Gemini Chat /chat/completions', type: 'LLM' },
];

const uploadModeOptions = [
  { value: '', label: '默认（按当前渠道逻辑）' },
  { value: 'files', label: 'FILES 服务上传（file-xxx）' },
  { value: 'object_storage', label: 'COS 服务上传（公网 URL）' },
];

function normalizeSimpleModelFormValues(model: any) {
  return {
    type: model.type || 'IMAGE',
    adapter: model.provider?.adapter || model.adapter || 'openai-image',
    baseUrl: model.provider?.baseUrl || '',
    model: model.name,
    modelNick: model.displayName,
    uploadMode: normalizeUploadModeValue(model.uploadMode || model.protocol?.uploadMode || model.provider?.uploadMode || ''),
    key: model.provider?.apiKey || '',
  };
}

function normalizeSimpleModelSubmitValues(values: any, editing = false) {
  const payload = {
    ...values,
    baseUrl: String(values.baseUrl || '').trim(),
    adapter: String(values.adapter || '').trim(),
    model: String(values.model || '').trim(),
    modelNick: String(values.modelNick || '').trim(),
    uploadMode: normalizeUploadModeValue(values.uploadMode),
    key: String(values.key || '').trim(),
  };
  if (editing && !payload.key) delete payload.key;
  return payload;
}

function normalizeUploadModeValue(value: any) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === 'default' || raw === 'auto') return '';
  if (raw === 'cos' || raw === 'object-storage' || raw === 'object_storage') return 'object_storage';
  if (raw === 'file' || raw === 'files') return 'files';
  return '';
}

function EditModelPricingButton({ model }: { model: any }) {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (values: any) => api(`/api/admin/models/${model.id}`, { method: 'PATCH', body: JSON.stringify(values) }),
    onSuccess: async (data: any) => {
      message.success('定价已更新');
      setOpen(false);
      mergeAdminModelCache(qc, data?.model);
      await refreshModelCaches(qc);
    },
    onError: err => message.error(err instanceof Error ? err.message : '更新失败'),
  });
  function openModal() {
    form.setFieldsValue(normalizeModelPricingFormValues(model));
    setOpen(true);
  }
  return (
    <>
      <Button size="small" onClick={openModal}>定价</Button>
      <Modal title={`配置定价：${model.displayName}`} open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={m.isPending} width={720}>
        <Form form={form} layout="vertical" onFinish={values => m.mutate(values)}>
          <ModelPricingFormFields />
        </Form>
      </Modal>
    </>
  );
}

function ModelPricingFormFields() {
  return (
    <div className="formGrid2">
      <Form.Item name="type" label="类型" rules={[{ required: true }]}><Select options={[{ value: 'IMAGE', label: '出图' }, { value: 'VIDEO', label: '视频' }, { value: 'LLM', label: '语言模型' }]} /></Form.Item>
      <Form.Item name="status" label="状态"><Select options={[{ value: 'ACTIVE', label: '启用' }, { value: 'DISABLED', label: '停用' }]} /></Form.Item>
      <Form.Item name="unit" label="计费单位" rules={[{ required: true }]}><Input placeholder="image / second / token_usd_ratio" /></Form.Item>
      <Form.Item name="salePrice" label="图片1K基准价"><InputNumber min={0} precision={0} style={{ width: '100%' }} /></Form.Item>
      <Form.Item name="pricePerSecond" label="视频每秒积分"><InputNumber min={0} precision={0} style={{ width: '100%' }} /></Form.Item>
      <Form.Item name="costPrice" label="成本积分"><InputNumber min={0} precision={4} style={{ width: '100%' }} /></Form.Item>
      <Form.Item name="inputPriceUsdPer1m" label="输入价 USD/1M"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
      <Form.Item name="outputPriceUsdPer1m" label="输出价 USD/1M"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
      <Form.Item name="cnyPerUsdCost" label="一刀人民币"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
      <Form.Item name="creditsPerUsdCost" label="一刀积分"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
      <Form.Item name="markupRate" label="加价倍率"><InputNumber min={0.01} style={{ width: '100%' }} /></Form.Item>
    </div>
  );
}

function normalizeModelPricingFormValues(model: any) {
  return {
    type: model.type,
    unit: model.unit,
    salePrice: Number(model.salePrice || 0),
    costPrice: Number(model.costPrice || 0),
    pricePerSecond: Number(model.pricePerSecond || 0),
    inputPriceUsdPer1m: Number(model.inputPriceUsdPer1m || 0),
    outputPriceUsdPer1m: Number(model.outputPriceUsdPer1m || 0),
    cnyPerUsdCost: Number(model.cnyPerUsdCost || 0),
    creditsPerUsdCost: Number(model.creditsPerUsdCost || 0),
    markupRate: Number(model.markupRate || 1),
    status: model.status,
  };
}

function DeleteModelButton({ model }: { model: any }) {
  const qc = useQueryClient();
  const refreshModels = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['adminModels'] }),
      qc.invalidateQueries({ queryKey: ['models'] }),
      qc.refetchQueries({ queryKey: ['adminModels'] }),
    ]);
  };
  const m = useMutation({
    mutationFn: () => api(`/api/admin/models/${model.id}`, { method: 'DELETE' }),
    onSuccess: async (data: any) => {
      message.success(data.disabled ? '模型已有调用记录，已自动改为停用' : '模型已删除');
      await refreshModels();
    },
    onError: err => {
      Modal.error({ title: '删除失败', content: err instanceof Error ? err.message : '请检查接口请求或管理员权限' });
    },
  });
  return (
    <Button
      size="small"
      danger
      loading={m.isPending}
      disabled={m.isPending}
      onClick={event => {
        event.stopPropagation();
        if (window.confirm(`确认删除模型：${model.displayName}？已有调用记录时会自动改为停用。`)) {
          m.mutate();
        }
      }}
    >
      删除
    </Button>
  );
}

function normalizeModelFormValues(model: any) {
  return normalizeModelPricingFormValues(model);
}

function CreatePlanButton() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (values: any) => api('/api/membership/plans', { method: 'POST', body: JSON.stringify(normalizePlanSubmitValues(values)) }),
    onSuccess: () => { message.success('套餐已创建'); setOpen(false); form.resetFields(); qc.invalidateQueries({ queryKey: ['membershipPlans'] }); },
    onError: err => message.error(err instanceof Error ? err.message : '创建失败'),
  });
  return (
    <>
      <Button type="primary" onClick={() => setOpen(true)}>新增套餐</Button>
      <Modal title="新增会员套餐" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={m.isPending}>
        <Form form={form} layout="vertical" initialValues={{ status: 'ACTIVE' }} onFinish={values => m.mutate(values)}>
          <PlanFormFields />
        </Form>
      </Modal>
    </>
  );
}

function EditPlanButton({ plan }: { plan: any }) {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (values: any) => api(`/api/membership/plans/${plan.id}`, { method: 'PATCH', body: JSON.stringify(normalizePlanSubmitValues(values)) }),
    onSuccess: () => { message.success('套餐已更新'); setOpen(false); qc.invalidateQueries({ queryKey: ['membershipPlans'] }); },
    onError: err => message.error(err instanceof Error ? err.message : '更新失败'),
  });
  return (
    <>
      <Button size="small" onClick={() => { form.setFieldsValue(normalizePlanFormValues(plan)); setOpen(true); }}>编辑</Button>
      <Modal title="编辑会员套餐" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={m.isPending}>
        <Form form={form} layout="vertical" onFinish={values => m.mutate(values)}>
          <PlanFormFields />
        </Form>
      </Modal>
    </>
  );
}

function PlanFormFields() {
  return (
    <>
      <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input /></Form.Item>
      <Form.Item name="priceYuan" label="价格（元）" rules={[{ required: true }]}><InputNumber min={0} precision={2} addonAfter="元" style={{ width: '100%' }} /></Form.Item>
      <Form.Item name="durationDays" label="有效天数" rules={[{ required: true }]}><InputNumber min={1} precision={0} style={{ width: '100%' }} /></Form.Item>
      <Form.Item name="status" label="状态"><Select options={[{ value: 'ACTIVE', label: '启用' }, { value: 'DISABLED', label: '停用' }]} /></Form.Item>
    </>
  );
}

function normalizePlanFormValues(plan: any) {
  return {
    ...plan,
    priceYuan: Number(plan?.price || 0) / 100,
  };
}

function normalizePlanSubmitValues(values: any) {
  const { priceYuan, ...rest } = values;
  return {
    ...rest,
    price: Math.round(Number(priceYuan || 0) * 100),
    bonusCredits: 0,
  };
}

function BatchCreateAccountsButton() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const plans = useQuery({ queryKey: ['membershipPlans'], queryFn: () => api<ApiList<any>>('/api/membership/plans') });
  const m = useMutation({
    mutationFn: (values: any) => api('/api/member-accounts/batch-create', { method: 'POST', body: JSON.stringify(values) }),
    onSuccess: () => { message.success('账号已生成'); setOpen(false); form.resetFields(); qc.invalidateQueries({ queryKey: ['memberAccounts'] }); },
    onError: err => message.error(err instanceof Error ? err.message : '生成失败'),
  });
  return (
    <>
      <Button type="primary" onClick={() => setOpen(true)}>批量生成</Button>
      <Modal title="批量生成会员账号" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={m.isPending}>
        <Form form={form} layout="vertical" initialValues={{ quantity: 10 }} onFinish={values => m.mutate(values)}>
          <Form.Item name="planId" label="会员套餐" rules={[{ required: true }]}>
            <Select options={(plans.data?.items || []).map(p => ({ value: p.id, label: p.name }))} />
          </Form.Item>
          <Form.Item name="quantity" label="数量" rules={[{ required: true }]}>
            <InputNumber min={1} max={1000} precision={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function AdminOfflineMembershipButton() {
  const [open, setOpen] = useState(false);
  const [createdCode, setCreatedCode] = useState('');
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const mode = Form.useWatch('mode', form);
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<ApiList<any>>('/api/users') });
  const plans = useQuery({ queryKey: ['membershipPlans'], queryFn: () => api<ApiList<any>>('/api/membership/plans') });
  const m = useMutation({
    mutationFn: (values: any) => api<any>(values.mode === 'code' ? '/api/admin/membership/offline-code' : '/api/admin/membership/direct-open', {
      method: 'POST',
      body: JSON.stringify({
        userId: values.userId,
        planId: values.planId,
        amountCents: values.amountYuan ? Math.round(Number(values.amountYuan) * 100) : undefined,
        transferChannel: values.transferChannel,
        transferNo: values.transferNo,
        proofImageUrl: values.proofImageUrl,
        remark: values.remark,
      }),
    }),
    onSuccess: data => {
      message.success(mode === 'code' ? '会员兑换码已生成' : '会员已开通');
      if (mode === 'code' && data.code) showGeneratedCodesModal('会员兑换码已生成', data.code);
      setCreatedCode('');
      setOpen(false);
      form.resetFields();
      ['memberAccounts', 'users', 'dashboard', 'commissions'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    },
    onError: err => message.error(err instanceof Error ? err.message : '操作失败'),
  });
  return (
    <>
      <Button type="primary" onClick={() => { setCreatedCode(''); form.setFieldsValue({ mode: 'code' }); setOpen(true); }}>线下开通会员</Button>
      <Modal title="线下收款后开通会员" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={m.isPending} width={680}>
        <Form form={form} layout="vertical" initialValues={{ mode: 'code' }} onFinish={values => m.mutate(values)}>
          <Form.Item name="mode" label="处理方式" rules={[{ required: true }]}>
            <Select options={[{ value: 'code', label: '生成会员兑换码' }, { value: 'direct', label: '直接升级成会员' }]} />
          </Form.Item>
          <Form.Item name="userId" label="客户" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={(users.data?.items || []).map((u: any) => ({ value: u.id, label: `${u.nickname || '用户'} ${u.phone || u.email || ''}${u.agent?.name ? ` · ${u.agent.name}` : ''}` }))} />
          </Form.Item>
          <div className="formGrid2">
            <Form.Item name="planId" label="会员套餐" rules={[{ required: true }]}>
              <Select options={(plans.data?.items || []).filter((p: any) => p.status === 'ACTIVE').map((p: any) => ({ value: p.id, label: `${p.name} · ${money(p.price)} · ${p.durationDays}天` }))} />
            </Form.Item>
            <Form.Item name="amountYuan" label="线下实付金额"><InputNumber min={0.01} precision={2} addonAfter="元" style={{ width: '100%' }} /></Form.Item>
          </div>
          <div className="formGrid2">
            <Form.Item name="transferChannel" label="收款方式"><Input placeholder="微信 / 支付宝 / 银行卡" /></Form.Item>
            <Form.Item name="transferNo" label="转账流水号"><Input /></Form.Item>
          </div>
          <Form.Item name="proofImageUrl" label="付款凭证图片 URL"><Input /></Form.Item>
          <Form.Item name="remark" label="备注"><Input /></Form.Item>
        </Form>
        {createdCode && (
          <div className="trialCodeBox">
            <Space style={{ marginBottom: 8 }}>
              <b>会员兑换码</b>
              <Button size="small" onClick={() => copyText(createdCode)}>复制</Button>
            </Space>
            <pre>{createdCode}</pre>
          </div>
        )}
      </Modal>
    </>
  );
}

function CreateAgentButton() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<ApiList<any>>('/api/users') });
  const agents = useQuery({ queryKey: ['agents'], queryFn: () => api<ApiList<any>>('/api/admin/agents') });
  const m = useMutation({
    mutationFn: (values: any) => api('/api/admin/agents', { method: 'POST', body: JSON.stringify(values) }),
    onSuccess: () => { message.success('代理已创建'); setOpen(false); form.resetFields(); qc.invalidateQueries({ queryKey: ['agents'] }); },
    onError: err => message.error(err instanceof Error ? err.message : '创建失败'),
  });
  return (
    <>
      <Button type="primary" onClick={() => setOpen(true)}>新增代理</Button>
      <Modal title="新增代理" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={m.isPending}>
        <Form form={form} layout="vertical" initialValues={{ level: 'NORMAL', commissionRate: 0.1, settlementDelayDays: 1 }} onFinish={values => m.mutate(values)}>
          <Form.Item name="userId" label="绑定用户" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={(users.data?.items || []).map(u => ({ value: u.id, label: `${u.nickname} ${u.phone || ''}` }))} />
          </Form.Item>
          <Form.Item name="name" label="代理名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="level" label="等级"><Select options={[{ value: 'NORMAL', label: '普通代理' }, { value: 'FOUNDER', label: '一级/初创代理' }]} /></Form.Item>
          <Form.Item name="parentAgentId" label="上级代理">
            <Select allowClear options={(agents.data?.items || []).map(a => ({ value: a.id, label: a.name }))} />
          </Form.Item>
          <Form.Item name="commissionRate" label="佣金比例"><InputNumber min={0} max={1} step={0.01} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="settlementDelayDays" label="对账期天数"><InputNumber min={1} max={3} precision={0} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function AgentConsole() {
  const perf = useQuery({ queryKey: ['agentPerformance'], queryFn: () => api<Record<string, number>>('/api/agent/performance') });
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div className="grid4">
        <Card><Statistic title="客户数" value={perf.data?.customerCount || 0} /></Card>
        <Card><Statistic title="核销数" value={perf.data?.redemptionCount || 0} /></Card>
        <Card><Statistic title="待结佣金" value={perf.data?.pendingCommissionAmount || 0} suffix="积分" /></Card>
        <Card><Statistic title="已结佣金" value={perf.data?.settledCommissionAmount || 0} suffix="积分" /></Card>
        <Card><Statistic title="已领账号" value={perf.data?.claimedAccountCount || 0} /></Card>
        <Card><Statistic title="已核销账号" value={perf.data?.redeemedAccountCount || 0} /></Card>
        <Card><Statistic title="下级代理" value={perf.data?.subAgentCount || 0} /></Card>
        <Card><Statistic title="下级核销" value={perf.data?.subAgentRedemptionCount || 0} /></Card>
      </div>
      <Tabs items={[
        { key: 'customers', label: '我的客户', children: <AgentCustomers /> },
        { key: 'accounts', label: '已领取账号', children: <AgentClaimedAccounts /> },
        { key: 'redeem', label: '核销账号', children: <AgentRedeem /> },
        { key: 'credit', label: '额度凭证', children: <AgentCreditPanel /> },
        { key: 'trialCards', label: '体验卡', children: <AgentTrialCards /> },
        { key: 'commissions', label: '我的佣金', children: <AgentCommissions /> },
        { key: 'subs', label: '下级代理', children: <AgentSubAgents /> },
      ]} />
    </Space>
  );
}

function AgentCustomers() {
  const q = useQuery({ queryKey: ['agentCustomers'], queryFn: () => api<ApiList<any>>('/api/agent/customers') });
  return <Card title="我的客户" extra={<AddAgentCustomerButton />}><Table rowKey="id" loading={q.isLoading} dataSource={q.data?.items || []} columns={[
    { title: '客户名', dataIndex: 'customerName' },
    { title: '手机号', dataIndex: 'customerPhone' },
    { title: '用户昵称', dataIndex: ['user', 'nickname'] },
    { title: '绑定时间', dataIndex: 'createdAt', render: dateTime },
  ]} /></Card>;
}

function AddAgentCustomerButton() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (values: any) => api('/api/agent/customers', { method: 'POST', body: JSON.stringify(values) }),
    onSuccess: (data: any) => {
      message.success('客户已绑定');
      if (data.initialPassword) Modal.success({ title: '客户账号已创建', content: `初始密码：${data.initialPassword}` });
      setOpen(false);
      form.resetFields();
      qc.invalidateQueries({ queryKey: ['agentCustomers'] });
      qc.invalidateQueries({ queryKey: ['agentPerformance'] });
    },
    onError: err => message.error(err instanceof Error ? err.message : '绑定失败'),
  });
  return (
    <>
      <Button type="primary" onClick={() => setOpen(true)}>录入客户</Button>
      <Modal title="录入客户" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={m.isPending}>
        <Form form={form} layout="vertical" onFinish={values => m.mutate(values)}>
          <Form.Item name="customerPhone" label="客户手机号" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="customerName" label="客户姓名"><Input /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function AgentClaimedAccounts() {
  const q = useQuery({ queryKey: ['agentClaimedAccounts'], queryFn: () => api<ApiList<any>>('/api/agent/accounts/claimed') });
  return <Card title="会员卡库存" extra={<CreateAgentMembershipCardRequestButton />}><Table rowKey="id" loading={q.isLoading} dataSource={q.data?.items || []} columns={[
    { title: '会员卡码', dataIndex: 'code' },
    { title: '套餐', dataIndex: ['plan', 'name'] },
    { title: '状态', dataIndex: 'status' },
    { title: '领取时间', dataIndex: 'claimedAt', render: dateTime },
    { title: '操作', render: (_, row) => <Button size="small" onClick={() => copyText(row.code)}>复制</Button> },
  ]} /></Card>;
}

function AgentTrialCards() {
  const q = useQuery({ queryKey: ['agentTrialCards'], queryFn: () => api<ApiList<any>>('/api/agent/trial-cards') });
  const me = useQuery({ queryKey: ['agentMe'], queryFn: () => api<any>('/api/agent/me') });
  const isFounder = me.data?.agent?.level === 'FOUNDER';
  return <Card title="我的体验卡" extra={<Space><CreateAgentMembershipCardRequestButton />{isFounder ? <CreateAgentTrialCardsButton /> : null}</Space>}>
    {!isFounder ? <Alert type="info" showIcon style={{ marginBottom: 16 }} message="只有初创/一级代理可以自主生成体验卡；普通代理请向上级代理或管理员申请。" /> : null}
    <Table rowKey="id" loading={q.isLoading} dataSource={q.data?.items || []} columns={[
    { title: '卡码', dataIndex: 'code' },
    { title: '套餐', dataIndex: ['plan', 'name'] },
    { title: '使用用户', render: (_, row) => row.usedUser?.nickname || row.usedUser?.phone || '-' },
    { title: '状态', dataIndex: 'status', render: (status: string) => <TrialCardStatus status={status} /> },
    { title: '过期时间', dataIndex: 'expiredAt', render: dateTime },
    { title: '使用时间', dataIndex: 'usedAt', render: dateTime },
    { title: '操作', render: (_, row) => <Space><Button size="small" onClick={() => copyText(row.code)}>复制</Button></Space> },
  ]} />
  </Card>;
}

function CreateAgentMembershipCardRequestButton() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const plans = useQuery({ queryKey: ['membershipPlans'], queryFn: () => api<ApiList<any>>('/api/membership/plans') });
  const requests = useQuery({ queryKey: ['agentMembershipCardRequests'], queryFn: () => api<ApiList<any>>('/api/agent/membership-card-requests') });
  const planId = Form.useWatch('planId', form);
  const quantity = Form.useWatch('quantity', form);
  const discountRate = Form.useWatch('discountRate', form);
  const m = useMutation({
    mutationFn: (values: any) => api('/api/agent/membership-card-requests', {
      method: 'POST',
      body: JSON.stringify({
        planId: values.planId,
        quantity: values.quantity,
        discountRate: Number(values.discountRate),
        amountCents: values.amountYuan ? Math.round(Number(values.amountYuan) * 100) : undefined,
        transferChannel: values.transferChannel,
        transferNo: values.transferNo,
        proofImageUrl: values.proofImageUrl,
        remark: values.remark,
      }),
    }),
    onSuccess: () => {
      message.success('会员卡资格申请已提交');
      setOpen(false);
      form.resetFields();
      ['agentMembershipCardRequests'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    },
    onError: err => message.error(err instanceof Error ? err.message : '申请失败'),
  });
  useEffect(() => {
    const amountYuan = membershipCardAmountYuan(plans.data?.items, planId, quantity, discountRate);
    if (amountYuan !== undefined) form.setFieldValue('amountYuan', amountYuan);
  }, [plans.data?.items, planId, quantity, discountRate, form]);
  return <>
    <Button type="primary" onClick={() => { form.setFieldsValue({ quantity: 10, discountRate: 0.3 }); setOpen(true); }}>申请会员卡资格</Button>
    <Modal title="申请会员卡资格" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={m.isPending} width={760}>
      <Form form={form} layout="vertical" initialValues={{ quantity: 10, discountRate: 0.3 }} onFinish={values => m.mutate(values)}>
        <div className="formGrid2">
          <Form.Item name="planId" label="会员套餐" rules={[{ required: true }]}>
            <Select options={(plans.data?.items || []).filter((p: any) => p.status === 'ACTIVE').map((p: any) => ({ value: p.id, label: `${p.name} · ${(Number(p.price || 0) / 100).toFixed(2)}元 · ${p.durationDays}天` }))} />
          </Form.Item>
          <Form.Item name="quantity" label="数量" rules={[{ required: true }]}>
            <InputNumber min={1} max={1000} precision={0} style={{ width: '100%' }} />
          </Form.Item>
        </div>
        <div className="formGrid2">
          <Form.Item name="discountRate" label="申请折扣" rules={[{ required: true }]}>
            <InputNumber min={0.01} max={1} step={0.01} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="amountYuan" label="线下实付金额" rules={[{ required: true, message: '请确认线下实付金额' }]}><InputNumber min={0.01} precision={2} addonAfter="元" style={{ width: '100%' }} /></Form.Item>
        </div>
        <div className="formGrid2">
          <Form.Item name="transferChannel" label="付款方式"><Input placeholder="微信 / 支付宝 / 银行卡" /></Form.Item>
          <Form.Item name="transferNo" label="转账流水号"><Input /></Form.Item>
        </div>
        <Form.Item name="proofImageUrl" label="付款凭证图片 URL"><Input /></Form.Item>
        <Form.Item name="remark" label="备注"><Input /></Form.Item>
      </Form>
      <Table size="small" rowKey="id" loading={requests.isLoading} dataSource={requests.data?.items || []} pagination={false} columns={[
        { title: '单号', dataIndex: 'orderNo' },
        { title: '数量', dataIndex: 'credits' },
        { title: '金额', dataIndex: 'amountCents', render: (v: number) => `${(Number(v || 0) / 100).toFixed(2)} 元` },
        { title: '状态', dataIndex: 'status' },
      ]} />
    </Modal>
  </>;
}

function CreateAgentTrialCardsButton() {
  const [open, setOpen] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const plans = useQuery({ queryKey: ['membershipPlans'], queryFn: () => api<ApiList<any>>('/api/membership/plans') });
  const m = useMutation({
    mutationFn: (values: any) => api<{ codes: string[]; count: number }>('/api/agent/trial-cards', { method: 'POST', body: JSON.stringify(values) }),
    onSuccess: data => {
      message.success('体验卡已生成');
      showGeneratedCodesModal('体验卡已生成', data.codes || []);
      setCodes([]);
      setOpen(false);
      form.resetFields();
      qc.invalidateQueries({ queryKey: ['agentTrialCards'] });
    },
    onError: err => message.error(err instanceof Error ? err.message : '生成失败'),
  });
  return (
    <>
      <Button type="primary" onClick={() => { setCodes([]); setOpen(true); }}>生成体验卡</Button>
      <Modal title="生成体验卡" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={m.isPending} width={680}>
        <Form form={form} layout="vertical" initialValues={{ quantity: 1, validDays: 7 }} onFinish={values => m.mutate(values)}>
          <Form.Item name="planId" label="会员套餐" rules={[{ required: true }]}>
            <Select options={(plans.data?.items || []).filter((p: any) => p.status === 'ACTIVE').map(p => ({ value: p.id, label: `${p.name} · ${p.durationDays}天` }))} />
          </Form.Item>
          <div className="formGrid2">
            <Form.Item name="quantity" label="数量" rules={[{ required: true }]}>
              <InputNumber min={1} max={100} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="validDays" label="有效天数" rules={[{ required: true }]}>
              <InputNumber min={1} max={90} precision={0} style={{ width: '100%' }} />
            </Form.Item>
          </div>
        </Form>
        {codes.length > 0 && (
          <div className="trialCodeBox">
            <Space style={{ marginBottom: 8 }}>
              <b>新生成卡码</b>
              <Button size="small" onClick={() => copyText(codes.join('\n'))}>复制全部</Button>
            </Space>
            <pre>{codes.join('\n')}</pre>
          </div>
        )}
      </Modal>
    </>
  );
}

let copyToastTimer: number | undefined;

function showCopyToast(text: string, type: 'success' | 'error' | 'warning' = 'success') {
  if (copyToastTimer) window.clearTimeout(copyToastTimer);
  let toast = document.querySelector<HTMLDivElement>('.copyToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'copyToast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  toast.className = `copyToast copyToast-${type}`;
  window.requestAnimationFrame(() => toast?.classList.add('show'));
  copyToastTimer = window.setTimeout(() => {
    toast?.classList.remove('show');
    copyToastTimer = undefined;
  }, 1800);
}

function showGeneratedCodesModal(title: string, codes: string[] | string) {
  const list = Array.isArray(codes) ? codes.filter(Boolean) : [codes].filter(Boolean);
  if (list.length === 0) return;
  const text = list.join('\n');
  Modal.success({
    title,
    width: 680,
    content: (
      <div className="trialCodeBox">
        <Space style={{ marginBottom: 8 }}>
          <b>新生成内容</b>
          <Button size="small" onClick={() => copyText(text)}>复制全部</Button>
        </Space>
        <pre>{text}</pre>
      </div>
    ),
  });
}

async function copyText(text: string) {
  const value = String(text || '');
  if (!value) {
    showCopyToast('没有可复制内容', 'warning');
    return;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (!copied) throw new Error('copy failed');
    }
    showCopyToast('复制成功');
  } catch {
    showCopyToast('复制失败，请手动选择复制', 'error');
  }
}

function ClaimAccountsButton() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (values: any) => api('/api/agent/accounts/claim', { method: 'POST', body: JSON.stringify(values) }),
    onSuccess: () => {
      message.success('领取成功');
      setOpen(false);
      form.resetFields();
      ['agentClaimedAccounts', 'agentPerformance'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    },
    onError: err => message.error(err instanceof Error ? err.message : '领取失败'),
  });
  return (
    <>
      <Button type="primary" onClick={() => setOpen(true)}>领取账号</Button>
      <Modal
        title="领取会员账号"
        open={open}
        onCancel={() => setOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setOpen(false)}>取消</Button>,
          <Button key="submit" type="primary" loading={m.isPending} onClick={() => form.submit()}>确认领取</Button>,
        ]}
      >
        <Form form={form} layout="vertical" initialValues={{ quantity: 1 }} onFinish={values => m.mutate(values)}>
          <Form.Item name="quantity" label="领取数量" rules={[{ required: true }]}>
            <InputNumber min={1} max={10} precision={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function AgentRedeem() {
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const customers = useQuery({ queryKey: ['agentCustomers'], queryFn: () => api<ApiList<any>>('/api/agent/customers') });
  const accounts = useQuery({ queryKey: ['agentClaimedAccounts'], queryFn: () => api<ApiList<any>>('/api/agent/accounts/claimed') });
  const m = useMutation({
    mutationFn: (values: any) => api('/api/agent/accounts/redeem', { method: 'POST', body: JSON.stringify(values) }),
    onSuccess: () => {
      message.success('核销成功');
      form.resetFields();
      ['agentClaimedAccounts', 'agentRedemptions', 'agentCommissions', 'agentPerformance'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    },
    onError: err => message.error(err instanceof Error ? err.message : '核销失败'),
  });
  const availableAccounts = (accounts.data?.items || []).filter((item: any) => item.status === 'CLAIMED');
  return (
    <Card title="核销会员账号">
      <Form form={form} layout="vertical" onFinish={values => m.mutate(values)} style={{ maxWidth: 520 }}>
        <Form.Item name="code" label="会员账号" rules={[{ required: true }]}>
          <Select showSearch optionFilterProp="label" options={availableAccounts.map((a: any) => ({ value: a.code, label: `${a.code} · ${a.plan?.name || ''}` }))} />
        </Form.Item>
        <Form.Item name="userId" label="客户" rules={[{ required: true }]}>
          <Select showSearch optionFilterProp="label" options={(customers.data?.items || []).map((c: any) => ({ value: c.userId, label: `${c.customerName || c.user?.nickname || '客户'} ${c.customerPhone || c.user?.phone || ''}` }))} />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={m.isPending}>确认核销</Button>
      </Form>
      <AgentRedemptions />
    </Card>
  );
}

function AgentCreditPanel() {
  const summary = useQuery({ queryKey: ['agentCreditSummary'], queryFn: () => api<any>('/api/agent/credit/summary') });
  const invite = useQuery({ queryKey: ['agentInvite'], queryFn: () => api<any>('/api/agent/invite') });
  const inviteUrl = useMemo(() => {
    const agentId = String(invite.data?.agentId || '').trim();
    if (!agentId) return '';
    if (invite.data?.inviteUrl) return String(invite.data.inviteUrl);
    const url = new URL('/image-studio-canvas-next.html', window.location.origin);
    url.searchParams.set('agentId', agentId);
    return url.toString();
  }, [invite.data?.agentId, invite.data?.inviteUrl]);
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div className="grid4">
        <Card><Statistic title="可用额度" value={summary.data?.account?.availableCredits || 0} suffix="积分" /></Card>
        <Card><Statistic title="冻结额度" value={summary.data?.account?.frozenCredits || 0} suffix="积分" /></Card>
        <Card><Statistic title="已使用额度" value={summary.data?.account?.usedCredits || 0} suffix="积分" /></Card>
        <Card><Statistic title="待对账单" value={summary.data?.pendingReconciliation?.count || 0} /></Card>
      </div>
      <Card title="邀请注册绑定">
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>邀请参数：<Tag>{invite.data?.agentId || '-'}</Tag></div>
          <Input readOnly value={inviteUrl} placeholder="正在生成邀请链接" />
          <Space>
            <Button type="primary" onClick={() => copyText(inviteUrl)} disabled={!inviteUrl}>复制邀请链接</Button>
            <Button onClick={() => copyText(invite.data?.agentId || '')}>复制代理 ID</Button>
            <span className="muted">用户通过邀请链接打开画布注册，会自动绑定到当前代理。</span>
          </Space>
        </Space>
      </Card>
      <Card title="客户额度凭证" extra={<Space><AgentOfflineMembershipButton /><CreateAgentCreditVoucherButton />{summary.data?.agent?.level === 'FOUNDER' ? <GrantSubAgentCreditButton /> : null}<CreateAgentCreditGrantRequestButton /><CreateAgentVoucherRequestButton /></Space>}>
        <AgentCreditVoucherTable />
      </Card>
      <Tabs items={[
        { key: 'requests', label: '充值码申请', children: <AgentVoucherRequestTable /> },
        { key: 'ledger', label: '额度流水', children: <AgentCreditLedger /> },
        { key: 'reconciliation', label: '对账订单', children: <AgentReconciliationTable /> },
      ]} />
    </Space>
  );
}

function CreateAgentCreditVoucherButton() {
  const [open, setOpen] = useState(false);
  const [createdCode, setCreatedCode] = useState('');
  const [form] = Form.useForm();
  const amountYuan = Form.useWatch('amountYuan', form);
  const qc = useQueryClient();
  const customers = useQuery({ queryKey: ['agentCustomers'], queryFn: () => api<ApiList<any>>('/api/agent/customers') });
  const m = useMutation({
    mutationFn: (values: any) => api<any>('/api/agent/credit-vouchers', {
      method: 'POST',
      body: JSON.stringify({
        userId: values.userId,
        credits: creditsFromYuan(values.amountYuan),
        amountCents: Math.round(Number(values.amountYuan || 0) * 100),
        validDays: values.validDays,
      }),
    }),
    onSuccess: data => {
      message.success('额度凭证已生成');
      if (data.code) showGeneratedCodesModal('额度凭证已生成', data.code);
      setCreatedCode('');
      setOpen(false);
      form.resetFields();
      ['agentCreditSummary', 'agentCreditVouchers', 'agentCreditLedger'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    },
    onError: err => message.error(err instanceof Error ? err.message : '生成失败'),
  });
  useEffect(() => {
    form.setFieldValue('credits', creditsFromYuan(amountYuan));
  }, [amountYuan, form]);
  return (
    <>
      <Button type="primary" onClick={() => { setCreatedCode(''); setOpen(true); }}>生成凭证</Button>
      <Modal title="生成客户额度凭证" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={m.isPending}>
        <Form form={form} layout="vertical" initialValues={{ validDays: 30 }} onFinish={values => m.mutate(values)}>
          <Form.Item name="userId" label="绑定客户" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={(customers.data?.items || []).map((c: any) => ({ value: c.userId, label: `${c.customerName || c.user?.nickname || '客户'} ${c.customerPhone || c.user?.phone || ''}${c.agent?.name ? ` · ${c.agent.name}` : ''}` }))} />
          </Form.Item>
          <div className="formGrid2">
            <Form.Item name="amountYuan" label="线下实付金额" rules={[{ required: true, message: '请填写线下实付金额' }]}><InputNumber min={0.01} precision={2} addonAfter="元" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="credits" label={`充值额度（${OFFLINE_CREDITS_PER_CNY} 积分 / 元）`} rules={[{ required: true }]}><InputNumber min={1} precision={0} disabled style={{ width: '100%' }} /></Form.Item>
          </div>
          <Form.Item name="validDays" label="有效天数" rules={[{ required: true }]}><InputNumber min={1} max={365} precision={0} style={{ width: '100%' }} /></Form.Item>
        </Form>
        {createdCode && (
          <div className="trialCodeBox">
            <Space style={{ marginBottom: 8 }}>
              <b>有效期内未兑换前，可在记录中再次复制</b>
              <Button size="small" onClick={() => copyText(createdCode)}>复制</Button>
            </Space>
            <pre>{createdCode}</pre>
          </div>
        )}
      </Modal>
    </>
  );
}

function AgentOfflineMembershipButton() {
  const [open, setOpen] = useState(false);
  const [createdCode, setCreatedCode] = useState('');
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const mode = Form.useWatch('mode', form);
  const customers = useQuery({ queryKey: ['agentCustomers'], queryFn: () => api<ApiList<any>>('/api/agent/customers') });
  const plans = useQuery({ queryKey: ['membershipPlans'], queryFn: () => api<ApiList<any>>('/api/membership/plans') });
  const m = useMutation({
    mutationFn: (values: any) => api<any>(values.mode === 'code' ? '/api/agent/membership-vouchers' : '/api/agent/membership/direct-open', {
      method: 'POST',
      body: JSON.stringify({
        userId: values.userId,
        planId: values.planId,
        amountCents: values.amountYuan ? Math.round(Number(values.amountYuan) * 100) : undefined,
        transferChannel: values.transferChannel,
        transferNo: values.transferNo,
        proofImageUrl: values.proofImageUrl,
        remark: values.remark,
      }),
    }),
    onSuccess: data => {
      message.success(mode === 'code' ? '会员兑换码已生成' : '会员已开通');
      if (mode === 'code' && data.code) showGeneratedCodesModal('会员兑换码已生成', data.code);
      setCreatedCode('');
      setOpen(false);
      form.resetFields();
      ['agentCustomers', 'agentRedemptions', 'agentCommissions', 'agentPerformance'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    },
    onError: err => message.error(err instanceof Error ? err.message : '操作失败'),
  });
  return (
    <>
      <Button onClick={() => { setCreatedCode(''); form.setFieldsValue({ mode: 'code' }); setOpen(true); }}>会员线下开通</Button>
      <Modal title="客户会员线下开通" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={m.isPending} width={680}>
        <Form form={form} layout="vertical" initialValues={{ mode: 'code' }} onFinish={values => m.mutate(values)}>
          <Form.Item name="mode" label="处理方式" rules={[{ required: true }]}>
            <Select options={[{ value: 'code', label: '生成会员兑换码' }, { value: 'direct', label: '直接升级成会员' }]} />
          </Form.Item>
          <Form.Item name="userId" label="绑定客户" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={(customers.data?.items || []).map((c: any) => ({ value: c.userId, label: `${c.customerName || c.user?.nickname || '客户'} ${c.customerPhone || c.user?.phone || ''}${c.agent?.name ? ` · ${c.agent.name}` : ''}` }))} />
          </Form.Item>
          <div className="formGrid2">
            <Form.Item name="planId" label="会员套餐" rules={[{ required: true }]}>
              <Select options={(plans.data?.items || []).filter((p: any) => p.status === 'ACTIVE').map((p: any) => ({ value: p.id, label: `${p.name} · ${money(p.price)} · ${p.durationDays}天` }))} />
            </Form.Item>
            <Form.Item name="amountYuan" label="线下实付金额"><InputNumber min={0.01} precision={2} addonAfter="元" style={{ width: '100%' }} /></Form.Item>
          </div>
          <div className="formGrid2">
            <Form.Item name="transferChannel" label="收款方式"><Input placeholder="微信 / 支付宝 / 银行卡" /></Form.Item>
            <Form.Item name="transferNo" label="转账流水号"><Input /></Form.Item>
          </div>
          <Form.Item name="proofImageUrl" label="付款凭证图片 URL"><Input /></Form.Item>
          <Form.Item name="remark" label="备注"><Input /></Form.Item>
        </Form>
        {createdCode && (
          <div className="trialCodeBox">
            <Space style={{ marginBottom: 8 }}>
              <b>会员兑换码</b>
              <Button size="small" onClick={() => copyText(createdCode)}>复制</Button>
            </Space>
            <pre>{createdCode}</pre>
          </div>
        )}
      </Modal>
    </>
  );
}

function GrantSubAgentCreditButton() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const amountYuan = Form.useWatch('amountYuan', form);
  const qc = useQueryClient();
  const subAgents = useQuery({ queryKey: ['agentSubAgents'], queryFn: () => api<ApiList<any>>('/api/agent/sub-agents') });
  const m = useMutation({
    mutationFn: (values: any) => api('/api/agent/sub-agent-credit/grants', {
      method: 'POST',
      body: JSON.stringify({
        targetAgentId: values.targetAgentId,
        credits: creditsFromYuan(values.amountYuan),
        amountCents: Math.round(Number(values.amountYuan || 0) * 100),
        transferChannel: values.transferChannel,
        transferNo: values.transferNo,
        proofImageUrl: values.proofImageUrl,
        remark: values.remark,
      }),
    }),
    onSuccess: () => {
      message.success('线下代理配额已配置');
      setOpen(false);
      form.resetFields();
      ['agentCreditSummary', 'agentCreditLedger', 'agentSubAgents'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    },
    onError: err => message.error(err instanceof Error ? err.message : '配置失败'),
  });
  useEffect(() => {
    form.setFieldValue('credits', creditsFromYuan(amountYuan));
  }, [amountYuan, form]);
  return (
    <>
      <Button onClick={() => setOpen(true)}>给线下代理配额</Button>
      <Modal title="给线下代理配置额度" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={m.isPending}>
        <Form form={form} layout="vertical" onFinish={values => m.mutate(values)}>
          <Form.Item name="targetAgentId" label="线下代理" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={(subAgents.data?.items || []).map((agent: any) => ({ value: agent.id, label: `${agent.name} ${agent.user?.phone || agent.user?.nickname || ''}` }))} />
          </Form.Item>
          <div className="formGrid2">
            <Form.Item name="amountYuan" label="线下实付金额" rules={[{ required: true, message: '请填写线下实付金额' }]}><InputNumber min={0.01} precision={2} addonAfter="元" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="credits" label={`配置额度（${OFFLINE_CREDITS_PER_CNY} 积分 / 元）`} rules={[{ required: true }]}><InputNumber min={1} precision={0} disabled style={{ width: '100%' }} /></Form.Item>
          </div>
          <Form.Item name="transferChannel" label="收款方式"><Input placeholder="微信 / 支付宝 / 银行卡" /></Form.Item>
          <Form.Item name="transferNo" label="转账流水号"><Input /></Form.Item>
          <Form.Item name="proofImageUrl" label="付款凭证图片 URL"><Input /></Form.Item>
          <Form.Item name="remark" label="备注"><Input /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function CreateAgentCreditGrantRequestButton() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const amountYuan = Form.useWatch('amountYuan', form);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (values: any) => api('/api/agent/credit-grant-requests', {
      method: 'POST',
      body: JSON.stringify({
        credits: creditsFromYuan(values.amountYuan),
        amountCents: Math.round(Number(values.amountYuan || 0) * 100),
        transferChannel: values.transferChannel,
        transferNo: values.transferNo,
        proofImageUrl: values.proofImageUrl,
        remark: values.remark,
      }),
    }),
    onSuccess: () => {
      message.success('配额申请已提交，等待管理员审核');
      setOpen(false);
      form.resetFields();
      ['agentCreditSummary', 'myAgentReconciliationOrders'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    },
    onError: err => message.error(err instanceof Error ? err.message : '提交失败'),
  });
  useEffect(() => {
    form.setFieldValue('credits', creditsFromYuan(amountYuan));
  }, [amountYuan, form]);
  return (
    <>
      <Button onClick={() => setOpen(true)}>申请配额</Button>
      <Modal title="向管理员申请配额" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={m.isPending}>
        <Form form={form} layout="vertical" onFinish={values => m.mutate(values)}>
          <div className="formGrid2">
            <Form.Item name="amountYuan" label="线下实付金额" rules={[{ required: true, message: '请填写线下实付金额' }]}><InputNumber min={0.01} precision={2} addonAfter="元" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="credits" label={`申请额度（${OFFLINE_CREDITS_PER_CNY} 积分 / 元）`} rules={[{ required: true }]}><InputNumber min={1} precision={0} disabled style={{ width: '100%' }} /></Form.Item>
          </div>
          <Form.Item name="transferChannel" label="付款方式"><Input placeholder="微信 / 支付宝 / 银行卡" /></Form.Item>
          <Form.Item name="transferNo" label="转账流水号"><Input /></Form.Item>
          <Form.Item name="proofImageUrl" label="付款凭证图片 URL"><Input /></Form.Item>
          <Form.Item name="remark" label="备注"><Input /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function CreateAgentVoucherRequestButton() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const amountYuan = Form.useWatch('amountYuan', form);
  const qc = useQueryClient();
  const customers = useQuery({ queryKey: ['agentCustomers'], queryFn: () => api<ApiList<any>>('/api/agent/customers') });
  const m = useMutation({
    mutationFn: (values: any) => api('/api/agent/credit-voucher-requests', {
      method: 'POST',
      body: JSON.stringify({
        userId: values.userId,
        credits: creditsFromYuan(values.amountYuan),
        amountCents: Math.round(Number(values.amountYuan || 0) * 100),
        validDays: values.validDays,
        transferChannel: values.transferChannel,
        transferNo: values.transferNo,
        proofImageUrl: values.proofImageUrl,
        remark: values.remark,
      }),
    }),
    onSuccess: () => {
      message.success('申请已提交，等待管理员审核');
      setOpen(false);
      form.resetFields();
      ['agentVoucherRequests', 'myAgentReconciliationOrders', 'agentCreditSummary'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    },
    onError: err => message.error(err instanceof Error ? err.message : '提交失败'),
  });
  useEffect(() => {
    form.setFieldValue('credits', creditsFromYuan(amountYuan));
  }, [amountYuan, form]);
  return (
    <>
      <Button onClick={() => setOpen(true)}>申请生成凭证</Button>
      <Modal title="申请生成客户充值凭证" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={m.isPending}>
        <Form form={form} layout="vertical" initialValues={{ validDays: 30 }} onFinish={values => m.mutate(values)}>
          <Form.Item name="userId" label="绑定客户" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={(customers.data?.items || []).map((c: any) => ({ value: c.userId, label: `${c.customerName || c.user?.nickname || '客户'} ${c.customerPhone || c.user?.phone || ''}${c.agent?.name ? ` · ${c.agent.name}` : ''}` }))} />
          </Form.Item>
          <div className="formGrid2">
            <Form.Item name="amountYuan" label="线下实付金额" rules={[{ required: true, message: '请填写线下实付金额' }]}><InputNumber min={0.01} precision={2} addonAfter="元" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="credits" label={`充值额度（${OFFLINE_CREDITS_PER_CNY} 积分 / 元）`} rules={[{ required: true }]}><InputNumber min={1} precision={0} disabled style={{ width: '100%' }} /></Form.Item>
          </div>
          <div className="formGrid2">
            <Form.Item name="validDays" label="有效天数" rules={[{ required: true }]}><InputNumber min={1} max={365} precision={0} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="transferChannel" label="收款方式"><Input placeholder="微信 / 支付宝 / 银行卡" /></Form.Item>
          </div>
          <Form.Item name="transferNo" label="转账流水号"><Input /></Form.Item>
          <Form.Item name="proofImageUrl" label="付款凭证图片 URL"><Input /></Form.Item>
          <Form.Item name="remark" label="备注"><Input /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function AgentVoucherRequestTable() {
  const q = useQuery({ queryKey: ['agentVoucherRequests'], queryFn: () => api<ApiList<any>>('/api/agent/credit-voucher-requests') });
  return (
    <Table rowKey="id" loading={q.isLoading} dataSource={q.data?.items || []} columns={[
      { title: '申请号', dataIndex: 'requestNo' },
      { title: '客户', render: (_, row) => row.user?.nickname || row.user?.phone || row.userId },
      { title: '额度', dataIndex: 'credits', render: money },
      { title: '金额', dataIndex: 'amountCents', render: yuan },
      { title: '状态', dataIndex: 'status', render: status => <AgentVoucherRequestStatus status={status} /> },
      { title: '兑换码', render: (_, row) => <VoucherCodeCell row={row} /> },
      { title: '收款方式', dataIndex: 'transferChannel' },
      { title: '流水号', dataIndex: 'transferNo' },
      { title: '关联凭证', render: (_, row) => row.voucher?.voucherNo || '-' },
      { title: '申请时间', dataIndex: 'createdAt', render: dateTime },
      { title: '审核时间', dataIndex: 'reviewedAt', render: dateTime },
    ]} />
  );
}

function AgentCreditVoucherTable() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['agentCreditVouchers'], queryFn: () => api<ApiList<any>>('/api/agent/credit-vouchers') });
  const cancel = useMutation({
    mutationFn: (id: string) => api(`/api/agent/credit-vouchers/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      message.success('凭证已取消');
      ['agentCreditSummary', 'agentCreditVouchers', 'agentCreditLedger'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    },
    onError: err => message.error(err instanceof Error ? err.message : '取消失败'),
  });
  return <Table rowKey="id" loading={q.isLoading} dataSource={q.data?.items || []} columns={[
    { title: '凭证单号', dataIndex: 'voucherNo' },
    { title: '兑换码', render: (_, row) => <VoucherCodeCell row={row} /> },
    { title: '客户', render: (_, row) => row.user?.nickname || row.user?.phone || row.userId },
    { title: '额度', dataIndex: 'credits', render: money },
    { title: '收款金额', dataIndex: 'amountCents', render: yuan },
    { title: '状态', dataIndex: 'status' },
    { title: '过期时间', dataIndex: 'expiredAt', render: dateTime },
    { title: '兑换时间', dataIndex: 'redeemedAt', render: dateTime },
    { title: '操作', render: (_, row) => row.status === 'AVAILABLE' ? <Button size="small" danger onClick={() => cancel.mutate(row.id)}>取消</Button> : null },
  ]} />;
}

function AgentCreditLedger() {
  const q = useQuery({ queryKey: ['agentCreditLedger'], queryFn: () => api<ApiList<any>>('/api/agent/credit/ledger') });
  return <Card><Table rowKey="id" loading={q.isLoading} dataSource={q.data?.items || []} columns={[
    { title: '类型', dataIndex: 'type' },
    { title: '变动', dataIndex: 'amount', render: money },
    { title: '前可用额度', dataIndex: 'balanceBefore', render: money },
    { title: '后可用额度', dataIndex: 'balanceAfter', render: money },
    { title: '关联', render: (_, row) => row.relatedType ? `${row.relatedType}:${row.relatedId || '-'}` : '-' },
    { title: '备注', dataIndex: 'remark' },
    { title: '时间', dataIndex: 'createdAt', render: dateTime },
  ]} /></Card>;
}

function AgentRedemptions() {
  const q = useQuery({ queryKey: ['agentRedemptions'], queryFn: () => api<ApiList<any>>('/api/agent/redemptions') });
  return <Table style={{ marginTop: 16 }} rowKey="id" loading={q.isLoading} dataSource={q.data?.items || []} columns={[
    { title: '账号', dataIndex: ['account', 'code'] },
    { title: '客户', dataIndex: ['user', 'nickname'] },
    { title: '套餐', dataIndex: ['plan', 'name'] },
    { title: '佣金', dataIndex: 'commissionAmount', render: money },
    { title: '时间', dataIndex: 'redeemedAt', render: dateTime },
  ]} />;
}

function AgentCommissions() {
  const q = useQuery({ queryKey: ['agentCommissions'], queryFn: () => api<ApiList<any>>('/api/agent/commissions') });
  return <Card><Table rowKey="id" loading={q.isLoading} dataSource={q.data?.items || []} columns={[
    { title: '客户', render: (_, row) => row.redemption?.user?.nickname || row.redemption?.user?.phone || '-' },
    { title: '套餐', dataIndex: ['redemption', 'plan', 'name'] },
    { title: '会员账号', dataIndex: ['redemption', 'account', 'code'] },
    { title: '来源', dataIndex: 'sourceType' },
    { title: '金额', dataIndex: 'amount', render: money },
    { title: '状态', dataIndex: 'status' },
    { title: '时间', dataIndex: 'createdAt', render: dateTime },
  ]} /></Card>;
}

function AgentSubAgents() {
  const q = useQuery({ queryKey: ['agentSubAgents'], queryFn: () => api<ApiList<any>>('/api/agent/sub-agents') });
  return <Card title="下级代理" extra={<Space><GrantSubAgentMembershipCardsButton /><CreateSubAgentButton /></Space>}>
    <Alert
      type="info"
      showIcon
      style={{ marginBottom: 16 }}
      message="一级/初创代理可点击右上角“新增下级”，从已绑定到自己的客户里选择用户升级为下级代理。"
    />
    <Table rowKey="id" loading={q.isLoading} dataSource={q.data?.items || []} columns={[
    { title: '代理名', dataIndex: 'name' },
    { title: '用户', dataIndex: ['user', 'nickname'] },
    { title: '手机号', dataIndex: ['user', 'phone'] },
    { title: '佣金率', dataIndex: 'commissionRate', render: v => String(v) },
    { title: '客户数', dataIndex: ['stats', 'customerCount'] },
    { title: '核销数', dataIndex: ['stats', 'redemptionCount'] },
    { title: '佣金', dataIndex: ['stats', 'commissionAmount'], render: money },
    { title: '待结', dataIndex: ['stats', 'pendingCommissionAmount'], render: money },
    { title: '状态', dataIndex: 'status' },
  ]} />
  </Card>;
}

function GrantSubAgentMembershipCardsButton() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const subAgents = useQuery({ queryKey: ['agentSubAgents'], queryFn: () => api<ApiList<any>>('/api/agent/sub-agents') });
  const plans = useQuery({ queryKey: ['membershipPlans'], queryFn: () => api<ApiList<any>>('/api/membership/plans') });
  const planId = Form.useWatch('planId', form);
  const quantity = Form.useWatch('quantity', form);
  const discountRate = Form.useWatch('discountRate', form);
  const m = useMutation({
    mutationFn: (values: any) => api('/api/agent/sub-agent-membership/cards/grant', {
      method: 'POST',
      body: JSON.stringify({
        targetAgentId: values.targetAgentId,
        planId: values.planId,
        quantity: values.quantity,
        discountRate: Number(values.discountRate),
        amountCents: values.amountYuan ? Math.round(Number(values.amountYuan) * 100) : undefined,
        transferChannel: values.transferChannel,
        transferNo: values.transferNo,
        proofImageUrl: values.proofImageUrl,
        remark: values.remark,
      }),
    }),
    onSuccess: () => {
      message.success('下级代理会员卡资格已配置');
      setOpen(false);
      form.resetFields();
      ['agentSubAgents'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    },
    onError: err => message.error(err instanceof Error ? err.message : '配置失败'),
  });
  useEffect(() => {
    const amountYuan = membershipCardAmountYuan(plans.data?.items, planId, quantity, discountRate);
    if (amountYuan !== undefined) form.setFieldValue('amountYuan', amountYuan);
  }, [plans.data?.items, planId, quantity, discountRate, form]);
  return <>
    <Button onClick={() => { form.setFieldsValue({ quantity: 10, discountRate: 0.3 }); setOpen(true); }}>给下级配会员卡</Button>
    <Modal title="给下级代理配置会员卡资格" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={m.isPending} width={720}>
      <Form form={form} layout="vertical" initialValues={{ quantity: 10, discountRate: 0.3 }} onFinish={values => m.mutate(values)}>
        <Form.Item name="targetAgentId" label="下级代理" rules={[{ required: true }]}>
          <Select showSearch optionFilterProp="label" options={(subAgents.data?.items || []).map((a: any) => ({ value: a.id, label: `${a.name} · ${a.user?.phone || a.user?.nickname || ''}` }))} />
        </Form.Item>
        <div className="formGrid2">
          <Form.Item name="planId" label="会员套餐" rules={[{ required: true }]}>
            <Select options={(plans.data?.items || []).filter((p: any) => p.status === 'ACTIVE').map((p: any) => ({ value: p.id, label: `${p.name} · ${(Number(p.price || 0) / 100).toFixed(2)}元 · ${p.durationDays}天` }))} />
          </Form.Item>
          <Form.Item name="quantity" label="数量" rules={[{ required: true }]}>
            <InputNumber min={1} max={1000} precision={0} style={{ width: '100%' }} />
          </Form.Item>
        </div>
        <div className="formGrid2">
          <Form.Item name="discountRate" label="折扣" rules={[{ required: true }]}>
            <InputNumber min={0.01} max={1} step={0.01} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="amountYuan" label="线下实付金额" rules={[{ required: true, message: '请确认线下实付金额' }]}><InputNumber min={0.01} precision={2} addonAfter="元" style={{ width: '100%' }} /></Form.Item>
        </div>
        <div className="formGrid2">
          <Form.Item name="transferChannel" label="收款方式"><Input placeholder="微信 / 支付宝 / 银行卡" /></Form.Item>
          <Form.Item name="transferNo" label="转账流水号"><Input /></Form.Item>
        </div>
        <Form.Item name="proofImageUrl" label="付款凭证图片 URL"><Input /></Form.Item>
        <Form.Item name="remark" label="备注"><Input /></Form.Item>
      </Form>
    </Modal>
  </>;
}

function CreateSubAgentButton() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const customers = useQuery({ queryKey: ['agentCustomers'], queryFn: () => api<ApiList<any>>('/api/agent/customers') });
  const m = useMutation({
    mutationFn: (values: any) => api('/api/agent/sub-agents', { method: 'POST', body: JSON.stringify(values) }),
    onSuccess: (data: any) => {
      message.success('下级代理已创建');
      setOpen(false);
      form.resetFields();
      ['agentSubAgents', 'agentCustomers', 'agentPerformance'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    },
    onError: err => message.error(err instanceof Error ? err.message : '创建失败'),
  });
  const customerOptions = (customers.data?.items || [])
    .filter((item: any) => item.user && item.user.role !== 'AGENT' && item.user.role !== 'ADMIN' && item.user.role !== 'SUPER_ADMIN')
    .map((item: any) => ({
      value: item.userId,
      label: `${item.customerName || item.user?.nickname || '客户'} · ${item.customerPhone || item.user?.phone || item.user?.email || item.userId}`,
    }));
  return (
    <>
      <Button type="primary" onClick={() => { form.resetFields(); setOpen(true); }}>新增下级</Button>
      <Modal title="新增下级代理" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={m.isPending}>
        <Form form={form} layout="vertical" initialValues={{ commissionRate: 0.1, settlementDelayDays: 1 }} onFinish={values => m.mutate(values)}>
          <Form.Item name="userId" label="绑定客户" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" loading={customers.isLoading} options={customerOptions} placeholder="只能选择已绑定到自己的客户" />
          </Form.Item>
          <Form.Item name="name" label="代理名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="commissionRate" label="佣金比例"><InputNumber min={0} max={1} step={0.01} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="settlementDelayDays" label="对账期天数"><InputNumber min={1} max={3} precision={0} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function SystemSettings() {
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['systemSettings'], queryFn: () => api<ApiList<any>>('/api/admin/system-settings') });
  useEffect(() => {
    if (!q.data?.items) return;
    form.setFieldsValue(Object.fromEntries(q.data.items.map(item => [item.key, item.valueType === 'NUMBER' ? Number(item.value || 0) : item.value])));
  }, [form, q.data]);
  const groups = useMemo(() => {
    const map = new Map<string, any[]>();
    (q.data?.items || []).forEach(item => map.set(item.group, [...(map.get(item.group) || []), item]));
    return Array.from(map.entries());
  }, [q.data]);
  const m = useMutation({
    mutationFn: (values: Record<string, unknown>) => api('/api/admin/system-settings', {
      method: 'PATCH',
      body: JSON.stringify({
        settings: (q.data?.items || []).map(item => ({
          key: item.key,
          value: values[item.key] == null ? '' : String(values[item.key]),
        })),
      }),
    }),
    onSuccess: () => {
      message.success('系统设置已保存');
      form.resetFields();
      qc.invalidateQueries({ queryKey: ['systemSettings'] });
    },
    onError: err => message.error(err instanceof Error ? err.message : '保存失败'),
  });

  return (
    <Card title="系统设置">
      <Form form={form} layout="vertical" onFinish={values => m.mutate(values)}>
        <Space direction="vertical" size={20} style={{ width: '100%' }}>
          {groups.map(([group, items]) => (
            <section className="settingsGroup" key={group}>
              <h3>{settingGroupName(group)}</h3>
              <div className="settingsGrid">
                {items.map(item => (
                  <Form.Item key={item.key} name={item.key} label={item.label} extra={item.isSecret && item.hasValue ? '已配置，留空保存会保留原值' : item.remark}>
                    <SettingField item={item} />
                  </Form.Item>
                ))}
              </div>
            </section>
          ))}
          <Button type="primary" htmlType="submit" loading={m.isPending}>保存设置</Button>
        </Space>
      </Form>
    </Card>
  );
}

function settingGroupName(group: string) {
  const names: Record<string, string> = { payment: '支付和充值', alipay: '支付宝网页二维码', generation: '生成和上游' };
  return names[group] || group;
}

function SettingField({ item }: { item: any }) {
  if (item.key === 'payment.mode') {
    return <Select options={[{ value: 'voucher', label: '兑换码线下支付' }, { value: 'alipay', label: '支付宝二维码' }, { value: 'mock', label: 'Mock 支付' }]} />;
  }
  if (item.valueType === 'BOOLEAN') {
    return <Select options={[{ value: 'true', label: '开启' }, { value: 'false', label: '关闭' }]} />;
  }
  if (item.valueType === 'NUMBER') {
    return <InputNumber min={0} precision={0} style={{ width: '100%' }} />;
  }
  if (item.isSecret) {
    return <Input.TextArea rows={4} placeholder={item.hasValue ? '已配置，留空不修改' : '未配置'} />;
  }
  return <Input />;
}

function AdminLogs() {
  const q = useQuery({ queryKey: ['adminLogs'], queryFn: () => api<ApiList<any>>('/api/admin-logs') });
  return <Card><Table rowKey="id" loading={q.isLoading} dataSource={q.data?.items || []} columns={[
    { title: '管理员', dataIndex: ['adminUser', 'nickname'] },
    { title: '动作', dataIndex: 'action' },
    { title: '对象', dataIndex: 'targetType' },
    { title: '备注', dataIndex: 'remark' },
    { title: '时间', dataIndex: 'createdAt', render: dateTime },
  ]} /></Card>;
}

function Root() {
  const [authed, setAuthed] = useState(Boolean(getToken()));
  return <AntApp>{authed ? <Shell /> : <Login onDone={() => setAuthed(true)} />}</AntApp>;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN}>
      <QueryClientProvider client={queryClient}>
        <Root />
      </QueryClientProvider>
    </ConfigProvider>
  </React.StrictMode>,
);
