import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, AutoComplete, Button, Card, ConfigProvider, DatePicker, Form, Input, InputNumber, Layout, Menu, Modal, Popconfirm, Progress, Segmented, Select, Space, Statistic, Switch, Table, Tabs, Tag, App as AntApp, message } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import { api, clearToken, getToken, getTokenMode, money, setToken, type TokenMode } from './api';
import './styles.css';

const queryClient = new QueryClient();
const { Header, Sider, Content } = Layout;

type ApiList<T> = { ok: true; items: T[]; total?: number };
const PERSONAL_API_DOC_URL = '/docs/customer-generation-api.html';
const ENTERPRISE_API_DOC_URL = '/docs/enterprise-generation-api.html';
function openApiDocs(scope: 'personal' | 'enterprise' = 'personal') {
  window.open(scope === 'enterprise' ? ENTERPRISE_API_DOC_URL : PERSONAL_API_DOC_URL, '_blank', 'noopener,noreferrer');
}

function isHttp404Error(err: unknown) {
  return err instanceof Error && /\bHTTP 404\b|Cannot (POST|PATCH|PUT|GET|DELETE)\b/i.test(err.message || '');
}

async function setUserCreditBalance(userId: string, balance: number, remark: string) {
  const body = JSON.stringify({ balance, remark });
  try {
    return await api(`/api/users/${userId}/credits`, { method: 'PATCH', body });
  } catch (err) {
    if (!isHttp404Error(err)) throw err;
    return api(`/api/wallets/${userId}/set-balance`, { method: 'POST', body });
  }
}

async function clearUserCreditBalance(userId: string, remark: string) {
  const body = JSON.stringify({ remark });
  try {
    return await api(`/api/users/${userId}/credits/clear`, { method: 'POST', body });
  } catch (err) {
    if (!isHttp404Error(err)) throw err;
    return api(`/api/wallets/${userId}/set-balance`, {
      method: 'POST',
      body: JSON.stringify({ balance: 0, remark }),
    });
  }
}

function Login({ onDone }: { onDone: (mode: TokenMode) => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<TokenMode>('admin');
  async function submit(values: { account: string; password: string }) {
    setLoading(true);
    setError('');
    try {
      const path = mode === 'enterprise' ? '/api/enterprise/auth/login' : '/api/auth/login';
      const data = await api<{ token: string }>(path, { method: 'POST', body: JSON.stringify({ account: values.account.trim(), password: values.password, clientType: mode === 'enterprise' ? undefined : 'ADMIN_WEB' }) });
      setToken(data.token, mode);
      onDone(mode);
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
      <Card className="loginCard" title={mode === 'enterprise' ? '企业后台登录' : 'AI 后台管理系统'}>
        <Tabs activeKey={mode} onChange={key => { setMode(key as TokenMode); setError(''); }} items={[
          { key: 'admin', label: '管理后台' },
          { key: 'enterprise', label: '企业后台' },
        ]} />
        <Form layout="vertical" onFinish={submit}>
          {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
          <Form.Item name="account" label="账号" rules={[{ required: true }]}>
            <Input placeholder={mode === 'enterprise' ? '企业手机号或邮箱' : '手机号或邮箱'} />
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
          {page === 'agentDashboard' && <AgentDashboard />}
          {page === 'userDashboard' && <UserDashboard />}
          {page === 'accountCenter' && <AccountCenter />}
          {page === 'users' && <Users />}
          {page === 'wallets' && <Wallets />}
          {page === 'recharges' && <Recharges />}
          {page === 'generationResults' && <GenerationResults />}
          {page === 'generateLab' && <GenerateLab />}
          {page === 'models' && <Models />}
          {page === 'canvasNodes' && <CanvasNodeManagement />}
          {page === 'dataPacks' && <DataPacks />}
          {page === 'membershipPlans' && <MembershipPlans />}
          {page === 'agents' && <Agents />}
          {page === 'agentCredit' && <AgentCreditAdmin />}
          {page === 'agentConsole' && <AgentConsole />}
          {page === 'trialCards' && <TrialCards />}
          {page === 'commissions' && <Commissions />}
          {page === 'systemSettings' && <SystemSettings />}
          {page === 'memberAccounts' && <MemberAccounts />}
          {page === 'enterpriseAccounts' && <EnterpriseAccounts />}
          {page === 'logs' && <AdminLogs />}
        </Content>
      </Layout>
    </Layout>
  );
}

const menuItems: MenuItem[] = [
  { key: 'dashboard', label: '数据概览', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { key: 'agentDashboard', label: '数据概览', roles: ['AGENT'] },
  { key: 'userDashboard', label: '数据概览', roles: ['USER'] },
  { key: 'accountCenter', label: '账户中心' },
  { key: 'users', label: '用户管理', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { key: 'wallets', label: '钱包流水', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { key: 'recharges', label: '线下充值码', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { key: 'generationResults', label: '生图生视频结果', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { key: 'generateLab', label: '生成联调' },
  { key: 'models', label: '模型管理', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { key: 'canvasNodes', label: '画布节点管理', roles: ['SUPER_ADMIN'] },
  { key: 'dataPacks', label: '创作库数据包', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { key: 'membershipPlans', label: '会员套餐', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { key: 'memberAccounts', label: '会员账号池', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { key: 'agents', label: '代理管理', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { key: 'agentCredit', label: '代理额度', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { key: 'agentConsole', label: '代理工作台', roles: ['AGENT'] },
  { key: 'trialCards', label: '体验卡', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { key: 'commissions', label: '佣金结算', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { key: 'systemSettings', label: '系统设置', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { key: 'enterpriseAccounts', label: '企业 API 管理', roles: ['SUPER_ADMIN'] },
  { key: 'logs', label: '操作日志', roles: ['ADMIN', 'SUPER_ADMIN'] },
];

function getMenuItemsByRole(role?: UserRole) {
  if (!role) return [];
  return menuItems.filter(item => !item.roles || item.roles.includes(role));
}

type DashboardGranularity = 'day' | 'month';

type DashboardCreditSummary = {
  rechargeCredits: number;
  rechargeCount: number;
  rechargeAmountCents: number;
  paidRechargeCredits: number;
  paidRechargeCount: number;
  creditOnlyRechargeCredits: number;
  creditOnlyRechargeCount: number;
  consumeCredits: number;
  consumeCount: number;
  agentQuotaCredits: number;
  agentQuotaCreditsRaw: number;
  agentQuotaCount: number;
  agentQuotaCountRaw: number;
  superAdminSelfRechargeCredits: number;
  superAdminSelfRechargeCount: number;
  superAdminSelfRechargeAmountCents: number;
  walletBalance?: number;
  netCredits: number;
};

type DashboardSeriesItem = {
  period: string;
  rechargeCredits: number;
  consumeCredits: number;
  agentQuotaCredits: number;
  rechargeCount: number;
  consumeCount: number;
  agentQuotaCount: number;
  rechargeAmountCents: number;
  paidRechargeCredits: number;
  paidRechargeCount: number;
  creditOnlyRechargeCredits: number;
  creditOnlyRechargeCount: number;
  netCredits: number;
};

type DashboardAgentBreakdown = {
  agentId: string;
  agentName: string;
  ownerName: string;
  ownerPhone: string;
  customerCount: number;
  walletBalance: number;
  rechargeCredits: number;
  rechargeCount: number;
  rechargeAmountCents: number;
  paidRechargeCredits: number;
  paidRechargeCount: number;
  creditOnlyRechargeCredits: number;
  creditOnlyRechargeCount: number;
  consumeCredits: number;
  consumeCount: number;
  agentQuotaCredits: number;
  agentQuotaCreditsRaw: number;
  agentQuotaCount: number;
  agentQuotaCountRaw: number;
  availableCredits: number;
  frozenCredits: number;
  usedCredits: number;
  receivableCredits: number;
  netCredits: number;
};

type DashboardApi = {
  users: number;
  agents: number;
  usages: number;
  failedUsages: number;
  pendingUsages: number;
  redemptions: number;
  chargedCredits: number;
  rechargeCredits: number;
  commissionAmount: number;
  creditSummary: DashboardCreditSummary;
  series: DashboardSeriesItem[];
  agentBreakdown: DashboardAgentBreakdown[];
  filters: {
    agentId: string;
    excludeSuperAdminSelfRecharge: boolean;
    excludeAgentQuota: boolean;
  };
  range: {
    granularity: DashboardGranularity;
    start: string;
    end: string;
    timezone: string;
  };
};

type AgentDashboardApi = DashboardApi & {
  agent: any;
  team: {
    visibleAgentIds: string[];
    scopedAgentIds: string[];
    selectedAgentId: string;
    selectedAgentName: string;
    visibleAgentCount: number;
    customerCount: number;
    walletBalance: number;
    account: {
      availableCredits?: number;
      frozenCredits?: number;
      usedCredits?: number;
      creditLimit?: number;
      receivableCredits?: number;
    };
  };
};

type DashboardDetailRow = DashboardSeriesItem & {
  key: string;
  label: string;
};

type DonutSegment = {
  label: string;
  value: number;
  color: string;
};

const emptyDashboardSummary: DashboardCreditSummary = {
  rechargeCredits: 0,
  rechargeCount: 0,
  rechargeAmountCents: 0,
  paidRechargeCredits: 0,
  paidRechargeCount: 0,
  creditOnlyRechargeCredits: 0,
  creditOnlyRechargeCount: 0,
  consumeCredits: 0,
  consumeCount: 0,
  agentQuotaCredits: 0,
  agentQuotaCreditsRaw: 0,
  agentQuotaCount: 0,
  agentQuotaCountRaw: 0,
  superAdminSelfRechargeCredits: 0,
  superAdminSelfRechargeCount: 0,
  superAdminSelfRechargeAmountCents: 0,
  walletBalance: 0,
  netCredits: 0,
};

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

function parseMonthValue(value: string) {
  const [yearRaw, monthRaw] = value.split('-').map(Number);
  const now = new Date();
  const year = Number.isFinite(yearRaw) && yearRaw > 0 ? yearRaw : now.getFullYear();
  const monthIndex = Number.isFinite(monthRaw) && monthRaw >= 1 && monthRaw <= 12 ? monthRaw - 1 : now.getMonth();
  return { year, monthIndex };
}

function localPeriodKey(date: Date, granularity: DashboardGranularity) {
  const month = pad2(date.getMonth() + 1);
  if (granularity === 'month') return `${date.getFullYear()}-${month}`;
  return `${date.getFullYear()}-${month}-${pad2(date.getDate())}`;
}

function dashboardDateRange(granularity: DashboardGranularity, selectedMonth: string, selectedYear: number) {
  if (granularity === 'month') {
    const year = Number.isFinite(selectedYear) ? selectedYear : new Date().getFullYear();
    const start = new Date(year, 0, 1, 0, 0, 0, 0);
    const end = new Date(year + 1, 0, 1, 0, 0, 0, 0);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  const { year, monthIndex } = parseMonthValue(selectedMonth);
  const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const end = new Date(year, monthIndex + 1, 1, 0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

function buildDashboardRows(series: DashboardSeriesItem[], granularity: DashboardGranularity, selectedMonth: string, selectedYear: number) {
  const byPeriod = new Map(series.map(item => [item.period, item]));
  const rows: DashboardDetailRow[] = [];
  if (granularity === 'month') {
    const year = Number.isFinite(selectedYear) ? selectedYear : new Date().getFullYear();
    for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
      const date = new Date(year, monthIndex, 1);
      const period = localPeriodKey(date, 'month');
      const source = byPeriod.get(period);
      rows.push({
        key: period,
        period,
        label: `${monthIndex + 1}月`,
        rechargeCredits: source?.rechargeCredits || 0,
        consumeCredits: source?.consumeCredits || 0,
        agentQuotaCredits: source?.agentQuotaCredits || 0,
        rechargeCount: source?.rechargeCount || 0,
        consumeCount: source?.consumeCount || 0,
        agentQuotaCount: source?.agentQuotaCount || 0,
        rechargeAmountCents: source?.rechargeAmountCents || 0,
        paidRechargeCredits: source?.paidRechargeCredits || 0,
        paidRechargeCount: source?.paidRechargeCount || 0,
        creditOnlyRechargeCredits: source?.creditOnlyRechargeCredits || 0,
        creditOnlyRechargeCount: source?.creditOnlyRechargeCount || 0,
        netCredits: source?.netCredits || 0,
      });
    }
    return rows;
  }
  const { year, monthIndex } = parseMonthValue(selectedMonth);
  const days = new Date(year, monthIndex + 1, 0).getDate();
  for (let day = 1; day <= days; day += 1) {
    const date = new Date(year, monthIndex, day);
    const period = localPeriodKey(date, 'day');
    const source = byPeriod.get(period);
    rows.push({
      key: period,
      period,
      label: `${day}`,
      rechargeCredits: source?.rechargeCredits || 0,
      consumeCredits: source?.consumeCredits || 0,
      agentQuotaCredits: source?.agentQuotaCredits || 0,
      rechargeCount: source?.rechargeCount || 0,
      consumeCount: source?.consumeCount || 0,
      agentQuotaCount: source?.agentQuotaCount || 0,
      rechargeAmountCents: source?.rechargeAmountCents || 0,
      paidRechargeCredits: source?.paidRechargeCredits || 0,
      paidRechargeCount: source?.paidRechargeCount || 0,
      creditOnlyRechargeCredits: source?.creditOnlyRechargeCredits || 0,
      creditOnlyRechargeCount: source?.creditOnlyRechargeCount || 0,
      netCredits: source?.netCredits || 0,
    });
  }
  return rows;
}

function formatNumber(value: number | undefined) {
  return new Intl.NumberFormat('zh-CN').format(Math.round(value || 0));
}

function formatYuanFromCents(value: number | undefined) {
  return `¥${new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format((value || 0) / 100)}`;
}

function DashboardMetric({ label, value, detail, tone }: { label: string; value: number; detail?: string; tone?: 'blue' | 'orange' | 'green' | 'purple' | 'gray' }) {
  return (
    <div className={`dashboardMetric dashboardMetric-${tone || 'gray'}`}>
      <div className="dashboardMetricLabel">{label}</div>
      <div className="dashboardMetricValue">{formatNumber(value)}</div>
      {detail && <div className="dashboardMetricDetail">{detail}</div>}
    </div>
  );
}

function DashboardBarChart({ rows, showAgentQuota }: { rows: DashboardDetailRow[]; showAgentQuota: boolean }) {
  const maxValue = Math.max(1, ...rows.flatMap(row => [row.rechargeCredits, row.consumeCredits, showAgentQuota ? row.agentQuotaCredits : 0]));
  const labelStep = rows.length > 18 ? Math.ceil(rows.length / 10) : 1;
  const hasData = rows.some(row => row.rechargeCredits > 0 || row.consumeCredits > 0 || (showAgentQuota && row.agentQuotaCredits > 0));
  return (
    <div className="dashboardBarWrap">
      <div className="dashboardBarChart" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(30px, 1fr))` }}>
        {rows.map((row, index) => {
          const rechargeHeight = row.rechargeCredits > 0 ? Math.max(4, (row.rechargeCredits / maxValue) * 100) : 0;
          const consumeHeight = row.consumeCredits > 0 ? Math.max(4, (row.consumeCredits / maxValue) * 100) : 0;
          const quotaHeight = showAgentQuota && row.agentQuotaCredits > 0 ? Math.max(4, (row.agentQuotaCredits / maxValue) * 100) : 0;
          const title = `${row.period} 入账 ${formatNumber(row.rechargeCredits)} / 消耗 ${formatNumber(row.consumeCredits)}${showAgentQuota ? ` / 代理配额 ${formatNumber(row.agentQuotaCredits)}` : ''}`;
          return (
            <div className="dashboardBarGroup" key={row.key} title={title}>
              <div className="dashboardBarSlot">
                <span className="dashboardBar dashboardBar-recharge" style={{ height: `${rechargeHeight}%` }} />
                <span className="dashboardBar dashboardBar-consume" style={{ height: `${consumeHeight}%` }} />
                {showAgentQuota && <span className="dashboardBar dashboardBar-quota" style={{ height: `${quotaHeight}%` }} />}
              </div>
              <div className="dashboardBarLabel">{index % labelStep === 0 || index === rows.length - 1 ? row.label : ''}</div>
            </div>
          );
        })}
      </div>
      {!hasData && <div className="dashboardChartEmpty">当前筛选区间暂无积分数据</div>}
    </div>
  );
}

function DashboardDonut({ segments }: { segments: DonutSegment[] }) {
  const activeSegments = segments.filter(item => item.value > 0);
  const total = activeSegments.reduce((sum, item) => sum + item.value, 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="dashboardDonutLayout">
      <div className="dashboardDonut">
        <svg viewBox="0 0 120 120" role="img" aria-label="积分构成环形图">
          <circle cx="60" cy="60" r={radius} className="dashboardDonutTrack" />
          {activeSegments.length === 0 && <circle cx="60" cy="60" r={radius} className="dashboardDonutEmpty" />}
          {activeSegments.map(segment => {
            const dash = (segment.value / total) * circumference;
            const dashOffset = -offset;
            offset += dash;
            return (
              <circle
                key={segment.label}
                cx="60"
                cy="60"
                r={radius}
                className="dashboardDonutSegment"
                stroke={segment.color}
                strokeDasharray={`${dash} ${circumference}`}
                strokeDashoffset={dashOffset}
              />
            );
          })}
        </svg>
        <div className="dashboardDonutCenter">
          <strong>{formatNumber(total)}</strong>
          <span>积分规模</span>
        </div>
      </div>
      <div className="dashboardDonutLegend">
        {segments.map(segment => (
          <div className="dashboardLegendRow" key={segment.label}>
            <span className="dashboardLegendDot" style={{ background: segment.color }} />
            <span>{segment.label}</span>
            <strong>{formatNumber(segment.value)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardAgentBars({ agents }: { agents: DashboardAgentBreakdown[] }) {
  const ranked = agents
    .filter(agent => agent.rechargeCredits > 0 || agent.consumeCredits > 0 || agent.agentQuotaCredits > 0 || agent.walletBalance > 0)
    .slice(0, 10);
  const maxValue = Math.max(1, ...ranked.flatMap(agent => [agent.rechargeCredits, agent.consumeCredits, agent.walletBalance]));
  if (ranked.length === 0) {
    return <div className="dashboardAgentEmpty">当前筛选区间暂无代理维度数据</div>;
  }
  return (
    <div className="dashboardAgentBars">
      {ranked.map(agent => (
        <div className="dashboardAgentBarRow" key={agent.agentId}>
          <div className="dashboardAgentName">
            <strong>{agent.agentName}</strong>
            <span>{agent.customerCount} 客户</span>
          </div>
          <div className="dashboardAgentBarTracks">
            <div className="dashboardAgentTrack" title={`入账 ${formatNumber(agent.rechargeCredits)}`}>
              <span className="dashboardAgentTrackFill dashboardAgentTrackRecharge" style={{ width: agent.rechargeCredits > 0 ? `${Math.max(4, (agent.rechargeCredits / maxValue) * 100)}%` : 0 }} />
            </div>
            <div className="dashboardAgentTrack" title={`消耗 ${formatNumber(agent.consumeCredits)}`}>
              <span className="dashboardAgentTrackFill dashboardAgentTrackConsume" style={{ width: agent.consumeCredits > 0 ? `${Math.max(4, (agent.consumeCredits / maxValue) * 100)}%` : 0 }} />
            </div>
            <div className="dashboardAgentTrack" title={`客户余额 ${formatNumber(agent.walletBalance)}`}>
              <span className="dashboardAgentTrackFill dashboardAgentTrackBalance" style={{ width: agent.walletBalance > 0 ? `${Math.max(4, (agent.walletBalance / maxValue) * 100)}%` : 0 }} />
            </div>
          </div>
          <div className="dashboardAgentNumbers">
            <span>{formatNumber(agent.rechargeCredits)}</span>
            <span>{formatNumber(agent.consumeCredits)}</span>
            <span>{formatNumber(agent.walletBalance)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Dashboard() {
  const [granularity, setGranularity] = useState<DashboardGranularity>('day');
  const [selectedMonth, setSelectedMonth] = useState(currentMonthValue());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedAgentId, setSelectedAgentId] = useState('all');
  const [excludeSuperAdminSelfRecharge, setExcludeSuperAdminSelfRecharge] = useState(true);
  const [excludeAgentQuota, setExcludeAgentQuota] = useState(false);
  const range = useMemo(() => dashboardDateRange(granularity, selectedMonth, selectedYear), [granularity, selectedMonth, selectedYear]);
  const dashboardPath = useMemo(() => {
    const params = new URLSearchParams({
      granularity,
      start: range.start,
      end: range.end,
      agentId: selectedAgentId,
      excludeSuperAdminSelfRecharge: String(excludeSuperAdminSelfRecharge),
      excludeAgentQuota: String(excludeAgentQuota),
    });
    return `/api/dashboard?${params.toString()}`;
  }, [excludeAgentQuota, excludeSuperAdminSelfRecharge, granularity, range.end, range.start, selectedAgentId]);
  const q = useQuery({ queryKey: ['dashboard', dashboardPath], queryFn: () => api<DashboardApi>(dashboardPath) });
  const data = q.data;
  const summary = data?.creditSummary || emptyDashboardSummary;
  const agentBreakdown = data?.agentBreakdown || [];
  const selectedAgent = agentBreakdown.find(agent => agent.agentId === selectedAgentId);
  const agentCustomerWalletBalance = selectedAgent
    ? selectedAgent.walletBalance
    : agentBreakdown.reduce((sum, agent) => sum + agent.walletBalance, 0);
  const rows = useMemo(() => buildDashboardRows(data?.series || [], granularity, selectedMonth, selectedYear), [data?.series, granularity, selectedMonth, selectedYear]);
  const agentOptions = useMemo(() => [
    { label: '全部代理与用户', value: 'all' },
    ...agentBreakdown.map(agent => ({
      label: `${agent.agentName}${agent.ownerPhone ? ` (${agent.ownerPhone})` : ''}`,
      value: agent.agentId,
    })),
  ], [agentBreakdown]);
  const donutSegments = useMemo(() => [
    { label: '有收款入账', value: summary.paidRechargeCredits, color: '#2563eb' },
    { label: '未计收款入账', value: summary.creditOnlyRechargeCredits, color: '#06b6d4' },
    { label: '积分消耗', value: summary.consumeCredits, color: '#f97316' },
    { label: excludeAgentQuota ? '代理配额已过滤' : '代理配额', value: excludeAgentQuota ? 0 : summary.agentQuotaCredits, color: '#7c3aed' },
  ], [excludeAgentQuota, summary.agentQuotaCredits, summary.consumeCredits, summary.creditOnlyRechargeCredits, summary.paidRechargeCredits]);
  const detailColumns = [
    { title: granularity === 'day' ? '日期' : '月份', dataIndex: 'period', width: 130, render: (value: string) => <span className="dashboardPeriodCell">{value}</span> },
    { title: '入账积分', dataIndex: 'rechargeCredits', render: (value: number) => formatNumber(value) },
    { title: '入账笔数', dataIndex: 'rechargeCount', render: (value: number) => formatNumber(value) },
    { title: '实收金额', dataIndex: 'rechargeAmountCents', render: (value: number) => formatYuanFromCents(value) },
    { title: '有收款积分', dataIndex: 'paidRechargeCredits', render: (value: number) => formatNumber(value) },
    { title: '未计收款积分', dataIndex: 'creditOnlyRechargeCredits', render: (value: number) => formatNumber(value) },
    { title: '消耗积分', dataIndex: 'consumeCredits', render: (value: number) => formatNumber(value) },
    { title: '消耗笔数', dataIndex: 'consumeCount', render: (value: number) => formatNumber(value) },
    { title: '代理配额', dataIndex: 'agentQuotaCredits', render: (value: number) => formatNumber(value) },
    { title: '净增积分', dataIndex: 'netCredits', render: (value: number) => <span className={value >= 0 ? 'dashboardPositive' : 'dashboardNegative'}>{formatNumber(value)}</span> },
  ];
  const agentColumns = [
    { title: '代理', dataIndex: 'agentName', width: 180, render: (_: string, row: DashboardAgentBreakdown) => <div className="dashboardAgentCell"><strong>{row.agentName}</strong><span>{row.ownerName || row.ownerPhone || '-'}</span></div> },
    { title: '客户数', dataIndex: 'customerCount', render: (value: number) => formatNumber(value) },
    { title: '入账积分', dataIndex: 'rechargeCredits', render: (value: number) => formatNumber(value) },
    { title: '实收金额', dataIndex: 'rechargeAmountCents', render: (value: number) => formatYuanFromCents(value) },
    { title: '有收款积分', dataIndex: 'paidRechargeCredits', render: (value: number) => formatNumber(value) },
    { title: '未计收款积分', dataIndex: 'creditOnlyRechargeCredits', render: (value: number) => formatNumber(value) },
    { title: '消耗积分', dataIndex: 'consumeCredits', render: (value: number) => formatNumber(value) },
    { title: '客户余额', dataIndex: 'walletBalance', render: (value: number) => formatNumber(value) },
    { title: '代理配额', dataIndex: 'agentQuotaCredits', render: (value: number) => formatNumber(value) },
    { title: '可用额度', dataIndex: 'availableCredits', render: (value: number) => formatNumber(value) },
    { title: '已用额度', dataIndex: 'usedCredits', render: (value: number) => formatNumber(value) },
    { title: '净增积分', dataIndex: 'netCredits', render: (value: number) => <span className={value >= 0 ? 'dashboardPositive' : 'dashboardNegative'}>{formatNumber(value)}</span> },
  ];
  const periodText = granularity === 'day' ? `${selectedMonth} 每日` : `${selectedYear} 每月`;
  const scopeText = selectedAgent ? `${selectedAgent.agentName} · ` : '';
  return (
    <Space direction="vertical" size={16} className="dashboardPage">
      <Card className="dashboardControlCard">
        <div className="dashboardControlHeader">
          <div>
            <h2>数据概览</h2>
            <p>{scopeText}{periodText}统计，所有图表和明细使用同一筛选口径</p>
          </div>
          <div className="dashboardControls">
            <Segmented
              value={granularity}
              options={[
                { label: '按日', value: 'day' },
                { label: '按月', value: 'month' },
              ]}
              onChange={value => setGranularity(value as DashboardGranularity)}
            />
            {granularity === 'day' ? (
              <DatePicker
                className="dashboardDateInput"
                picker="month"
                allowClear={false}
                value={dayjs(`${selectedMonth}-01`)}
                format="YYYY年MM月"
                onChange={value => setSelectedMonth(value ? value.format('YYYY-MM') : currentMonthValue())}
              />
            ) : (
              <DatePicker
                className="dashboardYearInput"
                picker="year"
                allowClear={false}
                value={dayjs(`${selectedYear}-01-01`)}
                format="YYYY年"
                onChange={value => setSelectedYear(value ? value.year() : new Date().getFullYear())}
              />
            )}
            <Select
              className="dashboardAgentSelect"
              value={selectedAgentId}
              options={agentOptions}
              showSearch
              optionFilterProp="label"
              onChange={setSelectedAgentId}
            />
          </div>
        </div>
        <div className="dashboardFilterRow">
          <label>
            <Switch checked={excludeSuperAdminSelfRecharge} onChange={setExcludeSuperAdminSelfRecharge} />
            <span>过滤超级管理员给自己充值</span>
          </label>
          <label>
            <Switch checked={excludeAgentQuota} onChange={setExcludeAgentQuota} />
            <span>过滤代理配额积分</span>
          </label>
        </div>
      </Card>
      {q.error && <Alert type="error" showIcon message={q.error instanceof Error ? q.error.message : '数据概览加载失败'} />}
      <div className="dashboardMetricGrid">
        <DashboardMetric label="本期入账积分" value={summary.rechargeCredits} detail={`实收 ${formatYuanFromCents(summary.rechargeAmountCents)}，有收款 ${formatNumber(summary.paidRechargeCredits)}，未计收款 ${formatNumber(summary.creditOnlyRechargeCredits)}`} tone="blue" />
        <DashboardMetric label="本期消耗积分" value={summary.consumeCredits} detail={`${formatNumber(summary.consumeCount)} 笔消费流水`} tone="orange" />
        <DashboardMetric label="本期净增积分" value={summary.netCredits} detail="入账 + 配额 - 消耗" tone={summary.netCredits >= 0 ? 'green' : 'orange'} />
        <DashboardMetric label={excludeSuperAdminSelfRecharge ? '内部充值已过滤' : '内部充值已纳入'} value={summary.superAdminSelfRechargeCredits} detail={`${formatNumber(summary.superAdminSelfRechargeCount)} 笔超级管理员账号入账`} tone="gray" />
        <DashboardMetric label={excludeAgentQuota ? '代理配额已过滤' : '代理配额积分'} value={excludeAgentQuota ? summary.agentQuotaCreditsRaw : summary.agentQuotaCredits} detail={excludeAgentQuota ? `${formatNumber(summary.agentQuotaCreditsRaw)} 积分未纳入图表` : `${formatNumber(summary.agentQuotaCount)} 笔配额入账`} tone="purple" />
        <DashboardMetric label={selectedAgent ? '该代理客户余额' : '代理客户总余额'} value={agentCustomerWalletBalance} detail={selectedAgent ? `${formatNumber(selectedAgent.customerCount)} 个绑定客户` : `${formatNumber(agentBreakdown.length)} 个代理`} tone="green" />
        <DashboardMetric label="用户数" value={data?.users || 0} detail={`代理 ${formatNumber(data?.agents || 0)} 个`} tone="gray" />
        <DashboardMetric label="调用结果" value={data?.usages || 0} detail={`失败 ${formatNumber(data?.failedUsages || 0)}，待处理 ${formatNumber(data?.pendingUsages || 0)}`} tone="gray" />
      </div>
      <div className="dashboardChartGrid">
        <Card className="dashboardPanel" title="入账与消耗趋势" loading={q.isLoading && !data} extra={
          <div className="dashboardInlineLegend">
            <span><i className="legendRecharge" />入账</span>
            <span><i className="legendConsume" />消耗</span>
            {!excludeAgentQuota && <span><i className="legendQuota" />代理配额</span>}
          </div>
        }>
          <DashboardBarChart rows={rows} showAgentQuota={!excludeAgentQuota} />
        </Card>
        <Card className="dashboardPanel" title="积分构成" loading={q.isLoading && !data}>
          <DashboardDonut segments={donutSegments} />
        </Card>
      </div>
      <Card className="dashboardPanel" title="代理入账 / 消耗 / 余额排行" loading={q.isLoading && !data} extra={
        <div className="dashboardInlineLegend">
          <span><i className="legendRecharge" />入账</span>
          <span><i className="legendConsume" />消耗</span>
          <span><i className="legendBalance" />客户余额</span>
        </div>
      }>
        <DashboardAgentBars agents={agentBreakdown} />
      </Card>
      <Card className="dashboardPanel" title="统计明细" extra={<span className="dashboardMuted">{periodText}明细</span>}>
        <Table<DashboardDetailRow>
          rowKey="key"
          loading={q.isLoading}
          dataSource={rows}
          columns={detailColumns}
          pagination={granularity === 'day' ? { pageSize: 10, showSizeChanger: false } : false}
          scroll={{ x: 1120 }}
        />
      </Card>
      <Card className="dashboardPanel" title="代理明细" extra={<span className="dashboardMuted">按代理绑定客户归集入账、消耗与余额</span>}>
        <Table<DashboardAgentBreakdown>
          rowKey="agentId"
          loading={q.isLoading}
          dataSource={agentBreakdown}
          columns={agentColumns}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          scroll={{ x: 1320 }}
        />
      </Card>
    </Space>
  );
}

function AccountCenter() {
  const summary = useQuery({ queryKey: ['accountSummary'], queryFn: () => api<any>('/api/account/summary') });
  const plans = useQuery({ queryKey: ['membershipPlans'], queryFn: () => api<ApiList<any>>('/api/membership/plans') });
  const logs = useQuery({ queryKey: ['accountWalletLogs'], queryFn: () => api<ApiList<any>>('/api/account/wallet/logs') });
  const usages = useQuery({ queryKey: ['accountUsages'], queryFn: () => api<ApiList<any>>('/api/account/usages') });
  const apiTokens = useQuery({ queryKey: ['personalApiTokens'], queryFn: () => api<ApiList<any>>('/api/personal-api-tokens') });
  const qc = useQueryClient();
  const purchase = useMutation({
    mutationFn: (planId: string) => api('/api/membership/purchase', { method: 'POST', body: JSON.stringify({ planId }) }),
    onSuccess: () => {
      message.success('会员购买成功');
      ['accountSummary', 'accountWalletLogs', 'accountUsages', 'wallets', 'commissions'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    },
    onError: err => message.error(err instanceof Error ? err.message : '购买失败'),
  });
  const createApiToken = useMutation({
    mutationFn: (values: { name: string }) => api<any>('/api/personal-api-tokens', { method: 'POST', body: JSON.stringify(values) }),
    onSuccess: data => {
      qc.invalidateQueries({ queryKey: ['personalApiTokens'] });
      Modal.success({
        title: 'API Key 创建成功',
        width: 720,
        content: <Space direction="vertical" style={{ width: '100%' }}><Alert type="warning" showIcon message="请立即复制保存，关闭后不再展示明文。" /><Input.TextArea value={data.token?.plainToken || ''} autoSize readOnly /><Space><Button type="primary" onClick={() => copyText(data.token?.plainToken || '')}>复制 API Key</Button><Button onClick={() => openApiDocs('personal')}>查看对接文档</Button></Space></Space>,
      });
    },
    onError: err => message.error(err instanceof Error ? err.message : '创建失败'),
  });
  const disableApiToken = useMutation({
    mutationFn: (id: string) => api(`/api/personal-api-tokens/${id}/disable`, { method: 'PATCH' }),
    onSuccess: () => { message.success('API Key 已禁用'); qc.invalidateQueries({ queryKey: ['personalApiTokens'] }); },
    onError: err => message.error(err instanceof Error ? err.message : '禁用失败'),
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
      <Card title="API 接入" extra={<Button onClick={() => openApiDocs('personal')}>打开 API 对接文档</Button>}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert type="info" showIcon message="个人 API Key 长期不过期；会员折扣、账号状态、积分余额实时跟随当前账号。开放 API 使用 /api/open/personal/*，不会影响画布原接口。" />
          <Alert type="success" showIcon message="新手接入：创建 API Key 后先复制保存，再打开文档复制示例代码，把示例里的 sk_live_xxx 换成你的 Key 即可。" action={<Button size="small" onClick={() => openApiDocs('personal')}>查看文档</Button>} />
          <Form layout="inline" onFinish={values => createApiToken.mutate(values as { name: string })}>
            <Form.Item name="name" rules={[{ required: true }]} initialValue="默认 API Key" style={{ minWidth: 260 }}>
              <Input placeholder="API Key 名称" />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={createApiToken.isPending}>创建 API Key</Button>
          </Form>
          <Table rowKey="id" loading={apiTokens.isLoading} dataSource={apiTokens.data?.items || []} pagination={false} columns={[
            { title: '名称', dataIndex: 'name' },
            { title: '前缀', dataIndex: 'tokenPrefix' },
            { title: '状态', dataIndex: 'status', render: (v) => <Tag color={v === 'ACTIVE' ? 'green' : 'red'}>{v}</Tag> },
            { title: '最近调用', dataIndex: 'lastUsedAt', render: dateTime },
            { title: '创建时间', dataIndex: 'createdAt', render: dateTime },
            { title: '操作', render: (_, row) => row.status === 'ACTIVE' ? <Popconfirm title="禁用该 API Key？" onConfirm={() => disableApiToken.mutate(row.id)}><Button size="small" danger loading={disableApiToken.isPending}>禁用</Button></Popconfirm> : '-' },
          ]} />
        </Space>
      </Card>
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
  const [userFilters, setUserFilters] = useState({ page: 1, pageSize: 20, keyword: '' });
  const q = useQuery({
    queryKey: ['users', userFilters],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(userFilters.page),
        pageSize: String(userFilters.pageSize),
        ...(userFilters.keyword ? { keyword: userFilters.keyword } : {}),
      });
      return api<ApiList<any>>(`/api/users?${params.toString()}`);
    },
  });
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<{ user: { nickname: string; role: UserRole } }>('/api/auth/me') });
  const qc = useQueryClient();
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const status = useMutation({
    mutationFn: (input: { id: string; status: 'ACTIVE' | 'DISABLED' }) => api(`/api/users/${input.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: input.status }) }),
    onSuccess: () => { message.success('用户状态已更新'); qc.invalidateQueries({ queryKey: ['users'] }); },
    onError: err => message.error(err instanceof Error ? err.message : '更新失败'),
  });
  const rows = q.data?.items || [];
  const selectedUsers = rows.filter((row: any) => selectedRowKeys.includes(row.id));
  const isSuperAdmin = me.data?.user.role === 'SUPER_ADMIN';
  return <Card extra={<Space>
    <Input.Search
      allowClear
      placeholder="搜索昵称/手机号/邮箱"
      style={{ width: 260 }}
      onSearch={keyword => {
        setSelectedRowKeys([]);
        setUserFilters(prev => ({ ...prev, page: 1, keyword: keyword.trim() }));
      }}
    />
    {isSuperAdmin && <BatchOpenMembershipButton users={selectedUsers} keyword={userFilters.keyword} onDone={() => setSelectedRowKeys([])} />}
    <CreateUserButton />
  </Space>}><Table
    rowKey="id"
    loading={q.isLoading}
    dataSource={rows}
    pagination={{
      current: userFilters.page,
      pageSize: userFilters.pageSize,
      total: q.data?.total || 0,
      showSizeChanger: true,
      pageSizeOptions: [10, 20, 50, 100],
      showTotal: total => `共 ${total} 个用户`,
      onChange: (page, pageSize) => {
        setSelectedRowKeys([]);
        setUserFilters(prev => ({ ...prev, page, pageSize }));
      },
    }}
    rowSelection={isSuperAdmin ? {
      selectedRowKeys,
      onChange: setSelectedRowKeys,
      getCheckboxProps: (row: any) => ({ disabled: !!activeMembership(row) || row.status !== 'ACTIVE', title: activeMembership(row) ? '该用户已是会员' : row.status !== 'ACTIVE' ? '禁用用户不能批量开通' : '' }),
    } : undefined}
    columns={[
    { title: '昵称', dataIndex: 'nickname' },
    { title: '手机号', dataIndex: 'phone' },
    { title: '邮箱', dataIndex: 'email' },
    { title: '角色', dataIndex: 'role', render: (v) => <Tag>{v}</Tag> },
    { title: '状态', dataIndex: 'status', render: (v) => <UserStatusTag status={v} /> },
    { title: '会员', render: (_, row) => <MembershipStatusTag membership={activeMembership(row)} /> },
    { title: '绑定代理', render: (_, row) => row.agent?.name || '-' },
    { title: '余额', dataIndex: ['wallet', 'balance'], render: (v) => money(v || 0) },
    { title: '创建时间', dataIndex: 'createdAt', render: dateTime },
    {
      title: '操作',
      render: (_, row) => {
        const next = row.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
        return (
          <Space wrap>
            {isSuperAdmin && <DirectRechargeButton user={row} />}
            {isSuperAdmin && <SetUserCreditsButton user={row} />}
            {isSuperAdmin && <ClearUserCreditsButton user={row} />}
            <Popconfirm
              title={next === 'DISABLED' ? '禁用用户' : '启用用户'}
              description={`${next === 'DISABLED' ? '禁用后该用户不能登录和消费。' : '启用后该用户可正常登录。'}账号：${row.nickname || row.phone || row.email || row.id}`}
              okText="确定"
              cancelText="取消"
              onConfirm={() => status.mutateAsync({ id: row.id, status: next })}
            >
              <Button size="small" loading={status.isPending}>{next === 'DISABLED' ? '禁用' : '启用'}</Button>
            </Popconfirm>
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

function activeMembership(user: any) {
  const now = Date.now();
  return (user?.memberships || []).find((item: any) => item?.expiredAt && new Date(item.expiredAt).getTime() > now) || null;
}

function MembershipStatusTag({ membership }: { membership: any }) {
  if (!membership) return <Tag>非会员</Tag>;
  return <Tag color="gold">{membership.plan?.name || '会员'} · 到期 {dateTime(membership.expiredAt)}</Tag>;
}

function BatchOpenMembershipButton({ users, keyword, onDone }: { users: any[]; keyword: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<'selected' | 'allNonMember'>('selected');
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const plans = useQuery({ queryKey: ['membershipPlans'], queryFn: () => api<ApiList<any>>('/api/membership/plans') });
  const m = useMutation({
    mutationFn: (values: any) => api<any>('/api/admin/membership/batch-direct-open', {
      method: 'POST',
      body: JSON.stringify({
        userIds: scope === 'selected' ? users.map(user => user.id) : [],
        allNonMember: scope === 'allNonMember',
        keyword: scope === 'allNonMember' ? keyword : undefined,
        planId: values.planId,
        remark: values.remark,
      }),
    }),
    onSuccess: data => {
      message.success(`已开通 ${data.openedCount || 0} 个用户${data.skippedActiveUserIds?.length ? `，跳过已是会员 ${data.skippedActiveUserIds.length} 个` : ''}`);
      setOpen(false);
      form.resetFields();
      setScope('selected');
      onDone();
      ['users', 'dashboard', 'commissions', 'memberAccounts'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    },
    onError: err => message.error(err instanceof Error ? err.message : '批量开通失败'),
  });
  const selectedLabel = `${users.length} 个已选非会员用户`;
  const allLabel = `当前筛选下全部非会员用户${keyword ? `（关键词：${keyword}）` : '（不受分页限制）'}`;
  return (
    <>
      <Button type="primary" onClick={() => setOpen(true)}>批量开通会员</Button>
      <Modal
        title="批量直接开通会员"
        open={open}
        onCancel={() => { if (!m.isPending) setOpen(false); }}
        onOk={() => {
          if (scope === 'selected' && !users.length) {
            message.warning('请先选择非会员用户');
            return;
          }
          form.submit();
        }}
        okButtonProps={{ disabled: scope === 'selected' && !users.length }}
        confirmLoading={m.isPending}
        width={720}
      >
        <Alert type="info" showIcon style={{ marginBottom: 16 }} message={`将直接给${scope === 'selected' ? selectedLabel : allLabel}开通会员，不生成兑换码，也不扣用户积分。`} />
        <Form form={form} layout="vertical" onFinish={values => m.mutate(values)}>
          <Form.Item label="开通范围">
            <Select value={scope} onChange={setScope} options={[
              { value: 'selected', label: selectedLabel },
              { value: 'allNonMember', label: allLabel },
            ]} />
          </Form.Item>
          <Form.Item label="已选用户">
            <Space wrap>
              {users.slice(0, 12).map(user => <Tag key={user.id}>{user.nickname || user.phone || user.email || user.id}</Tag>)}
              {users.length > 12 && <Tag>+{users.length - 12}</Tag>}
              {!users.length && <Tag>未选择当前页用户</Tag>}
            </Space>
          </Form.Item>
          <Form.Item name="planId" label="会员套餐" rules={[{ required: true }]}>
            <Select loading={plans.isLoading} options={(plans.data?.items || []).filter((p: any) => p.status === 'ACTIVE').map((p: any) => ({ value: p.id, label: `${p.name} · ${p.durationDays}天` }))} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input placeholder="例如：线下批量赠送 / 活动补偿" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function DirectRechargeButton({ user }: { user: any }) {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (values: any) => api(`/api/wallets/${user.id}/direct-recharge`, {
      method: 'POST',
      body: JSON.stringify({
        amount: creditsFromYuan(values.amountYuan),
        remark: values.remark || `线下充值 ${Number(values.amountYuan || 0)} 元，自动换算 ${creditsFromYuan(values.amountYuan)} 积分`,
      }),
    }),
    onSuccess: () => {
      message.success('积分已充值');
      setOpen(false);
      form.resetFields();
      ['users', 'wallets', 'dashboard'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    },
    onError: err => message.error(err instanceof Error ? err.message : '充值失败'),
  });
  function openRechargeModal() {
    form.setFieldsValue({ amountYuan: 10, amount: creditsFromYuan(10), remark: undefined });
    setOpen(true);
  }
  return (
    <>
      <Button size="small" disabled={user.status !== 'ACTIVE'} onClick={openRechargeModal}>充值积分</Button>
      <Modal
        title={`直接充值积分：${user.nickname || user.phone || user.email || user.id}`}
        open={open}
        onCancel={() => { if (!m.isPending) setOpen(false); }}
        onOk={() => form.submit()}
        confirmLoading={m.isPending}
        destroyOnHidden
      >
        <Alert type="warning" showIcon style={{ marginBottom: 16 }} message={`填写人民币金额，系统按 ${OFFLINE_CREDITS_PER_CNY} 积分 / 元自动换算后给用户钱包充值。`} />
        <Form form={form} layout="vertical" onFinish={values => m.mutate(values)}>
          <Form.Item name="amountYuan" label="充值金额（人民币）" rules={[{ required: true }]}>
            <InputNumber
              min={0.01}
              precision={2}
              style={{ width: '100%' }}
              onChange={value => form.setFieldValue('amount', creditsFromYuan(value))}
            />
          </Form.Item>
          <Form.Item name="amount" label="自动换算积分" rules={[{ required: true }]}>
            <InputNumber min={1} precision={0} disabled style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input placeholder="例如：线下收款 / 活动赠送 / 售后补偿" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function SetUserCreditsButton({ user }: { user: any }) {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const currentBalance = Number(user.wallet?.balance || 0);
  const m = useMutation({
    mutationFn: (values: any) => setUserCreditBalance(
      user.id,
      Number(values.balance),
      values.remark || `超级管理员手动修改积分：${currentBalance} -> ${Number(values.balance)}`,
    ),
    onSuccess: () => {
      message.success('积分已修改');
      setOpen(false);
      form.resetFields();
      ['users', 'wallets', 'dashboard'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    },
    onError: err => message.error(err instanceof Error ? err.message : '修改积分失败'),
  });
  function openModal() {
    form.setFieldsValue({ balance: currentBalance, remark: undefined });
    setOpen(true);
  }
  return (
    <>
      <Button size="small" onClick={openModal}>修改积分</Button>
      <Modal
        title={`修改积分：${user.nickname || user.phone || user.email || user.id}`}
        open={open}
        onCancel={() => { if (!m.isPending) setOpen(false); }}
        onOk={() => form.submit()}
        confirmLoading={m.isPending}
        destroyOnHidden
      >
        <Alert type="info" showIcon style={{ marginBottom: 16 }} message={`当前余额：${currentBalance} 积分。这里会把钱包余额直接调整为你填写的目标积分，并写入钱包流水。`} />
        <Form form={form} layout="vertical" onFinish={values => m.mutate(values)}>
          <Form.Item name="balance" label="目标积分余额" rules={[{ required: true, message: '请填写目标积分余额' }]}>
            <InputNumber min={0} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input placeholder="例如：人工修正 / 售后补偿 / 测试账号调整" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function ClearUserCreditsButton({ user }: { user: any }) {
  const qc = useQueryClient();
  const currentBalance = Number(user.wallet?.balance || 0);
  const m = useMutation({
    mutationFn: () => clearUserCreditBalance(user.id, `超级管理员清零用户积分，原余额 ${currentBalance} 积分`),
    onSuccess: () => {
      message.success('积分已清零');
      ['users', 'wallets', 'dashboard'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    },
    onError: err => message.error(err instanceof Error ? err.message : '积分清零失败'),
  });
  return (
    <Popconfirm
      title="确认清零积分"
      description={`将 ${user.nickname || user.phone || user.email || user.id} 的积分从 ${currentBalance} 清零，此操作会写入钱包流水。`}
      okText="清零"
      cancelText="取消"
      okButtonProps={{ danger: true }}
      onConfirm={() => m.mutate()}
    >
      <Button size="small" danger loading={m.isPending} disabled={currentBalance <= 0}>清零积分</Button>
    </Popconfirm>
  );
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
  const [tempPassword, setTempPassword] = useState('');
  const m = useMutation({
    mutationFn: () => api<{ initialPassword?: string }>(`/api/users/${user.id}/password`, { method: 'PATCH', body: JSON.stringify({}) }),
    onSuccess: data => {
      message.success('密码已重置');
      setTempPassword(data.initialPassword || '');
    },
    onError: err => message.error(err instanceof Error ? err.message : '重置失败'),
  });
  return (
    <>
      <Popconfirm
        title="重置并查看临时密码"
        description={`系统会生成一个新密码，账号：${user.nickname || user.phone || user.email || user.id}`}
        okText="确定"
        cancelText="取消"
        onConfirm={() => m.mutateAsync()}
      >
        <Button size="small" loading={m.isPending}>重置/查看临时密码</Button>
      </Popconfirm>
      <Modal
        title="临时新密码"
        open={!!tempPassword}
        onCancel={() => setTempPassword('')}
        footer={[
          <Button key="copy" type="primary" onClick={() => navigator.clipboard?.writeText(tempPassword).then(() => message.success('已复制临时密码'))}>复制临时密码</Button>,
          <Button key="close" onClick={() => setTempPassword('')}>关闭</Button>,
        ]}
        destroyOnHidden
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert type="warning" showIcon message="原密码不可查询，系统已生成临时新密码，请只在本次弹窗中交给用户。" />
          <Input value={tempPassword} readOnly />
        </Space>
      </Modal>
    </>
  );
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
  return useQuery({
    queryKey: ['models', type],
    queryFn: async () => {
      const publicModels = await api<ApiList<any>>(`/api/models?type=${type}`).catch(() => ({ ok: true as const, items: [] }));
      const publicItems = apiListItems(publicModels).filter((item: any) => item?.type === type || item?.modelType === type);
      if (publicItems.length) return { ok: true as const, items: publicItems, total: publicItems.length };
      const adminModels = await api<ApiList<any>>('/api/admin/models');
      const items = apiListItems(adminModels).filter((item: any) => {
        const provider = item?.provider || {};
        return item?.type === type && item?.status !== 'DISABLED' && provider?.status !== 'DISABLED';
      });
      return { ok: true as const, items, total: items.length };
    },
  });
}

function buildLlmLabPayload(values: any, model: any) {
  const prompt = String(values?.prompt || '');
  const maxOutputTokens = Number(values?.maxOutputTokens || 800);
  return {
    channelKey: model?.provider?.providerKey || model?.providerKey,
    modelId: values?.modelId,
    type: 'LLM',
    mode: 'chat',
    prompt,
    params: {
      maxOutputTokens,
      messages: [{ role: 'user', content: prompt }],
      canvasNodeType: 'textPrompt',
      jsonEntry: {},
    },
  };
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
          <Select options={(models.data?.items || []).map((model: any) => ({ value: model.id, label: `${model.provider?.providerKey || '-'} · ${model.displayName} · ${money(model.salePrice || 0)}/张` }))} />
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
          <Select options={(models.data?.items || []).map((model: any) => ({ value: model.id, label: `${model.provider?.providerKey || '-'} · ${model.displayName} · ${videoSecondPriceLabel(model)}` }))} />
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
  const [chatItems, setChatItems] = useState<Array<{ role: 'user' | 'assistant'; content: string; status?: string }>>([]);
  const [localLogs, setLocalLogs] = useState<any[]>([]);
  const [form] = Form.useForm();
  const models = useModels('LLM');
  const currentValues = Form.useWatch([], form) || {};
  const modelItems = models.data?.items || [];
  const selectedModel = modelItems.find((item: any) => item.id === currentValues.modelId);
  const requestPreview = buildLlmLabPayload({ maxOutputTokens: 800, ...currentValues }, selectedModel);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async (values: any) => {
      const model = modelItems.find((item: any) => item.id === values.modelId);
      const payload = buildLlmLabPayload(values, model);
      const prompt = String(values.prompt || '');
      setResult(null);
      setChatItems([{ role: 'user', content: prompt }, { role: 'assistant', content: '正在连接 124 后台...', status: 'RUNNING' }]);
      setLocalLogs([
        makeLlmUiLog('front.submit', 'running', '前端已提交调试请求', { channelKey: payload.channelKey, modelId: payload.modelId }),
      ]);
      const started = await api<any>('/api/generation/debug/llm-chat', {
        method: 'POST',
        body: JSON.stringify({
          channelKey: payload.channelKey,
          modelId: payload.modelId,
          prompt,
          params: payload.params,
        }),
      });
      setResult(started);
      setLocalLogs(prev => [...prev, makeLlmUiLog('front.session', 'success', '124 已创建调试会话', { sessionId: started?.session?.id })]);
      const finalResult = await pollLlmDebugSession(started?.session?.id, next => {
        setResult(next);
        const session = next?.session || {};
        const text = session.text || session.error || '等待上游返回...';
        setChatItems([{ role: 'user', content: prompt }, { role: 'assistant', content: text, status: session.status }]);
      });
      return finalResult;
    },
    onSuccess: data => {
      setResult(data);
      const session = (data as any)?.session;
      message.success(session?.status === 'SUCCESS' ? '语言模型已返回' : '语言模型调试结束');
      qc.invalidateQueries({ queryKey: ['accountSummary'] });
      qc.invalidateQueries({ queryKey: ['generationTasks'] });
    },
    onError: err => {
      const errorText = err instanceof Error ? err.message : '调用失败';
      setChatItems(prev => {
        const next = prev.length ? prev.slice() : [];
        const userItem = next.find(item => item.role === 'user');
        return [userItem || { role: 'user', content: String(form.getFieldValue('prompt') || '') }, { role: 'assistant', content: errorText, status: 'FAILED' }];
      });
      setLocalLogs(prev => [...prev, makeLlmUiLog('front.error', 'failed', '前端调用失败', { message: errorText })]);
      message.error(errorText);
    },
  });
  const session = result?.session || null;
  const mergedLogs = [...localLogs, ...(session?.logs || [])];
  return (
    <Card title="语言模型联调">
      <div className="llmChatDebugLayout">
        <div className="llmChatConfig">
          <Form form={form} layout="vertical" initialValues={{ maxOutputTokens: 800, prompt: '帮我写一个无限画布 AI 创作流程的简短说明' }} onFinish={values => m.mutate(values)}>
            <Form.Item name="modelId" label="模型" rules={[{ required: true }]}>
              <Select loading={models.isLoading} placeholder="请选择后台已启用的大语言模型" options={modelItems.map((model: any) => ({ value: model.id, label: `${model.provider?.providerKey || '-'} · ${model.displayName || model.name} · 会员${model.creditsPerUsdCost || 0}积分/刀` }))} />
            </Form.Item>
            <Form.Item name="prompt" label="提示词" rules={[{ required: true }]}><Input.TextArea rows={5} /></Form.Item>
            <Form.Item name="maxOutputTokens" label="最大输出 Token"><InputNumber min={1} max={200000} precision={0} style={{ width: '100%' }} /></Form.Item>
            <Form.Item label="调用 JSON 入口">
              <Input.TextArea rows={8} readOnly value={JSON.stringify(requestPreview, null, 2)} />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={m.isPending}>发送消息并调试</Button>
          </Form>
        </div>
        <div className="llmChatPanel">
          <div className="llmChatMessages">
            {(chatItems.length ? chatItems : [{ role: 'assistant' as const, content: '等待发送消息' }]).map((item, index) => (
              <div key={`${item.role}-${index}`} className={`llmBubbleRow ${item.role === 'user' ? 'isUser' : 'isAssistant'}`}>
                <div className="llmBubble">
                  {item.status && <Tag color={item.status === 'SUCCESS' ? 'green' : item.status === 'FAILED' ? 'red' : 'blue'}>{item.status}</Tag>}
                  <div>{item.content}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="llmDebugGrid">
            <div className="llmDebugTimeline">
              <div className="llmDebugTitle">调用日志</div>
              {mergedLogs.length ? mergedLogs.map((log: any, index: number) => <LlmDebugLogItem key={`${log.step}-${index}`} log={log} />) : <div className="llmDebugEmpty">暂无调用日志</div>}
            </div>
            <pre className="generateResultJson llmRawJson">{result ? JSON.stringify(result, null, 2) : '等待调用结果'}</pre>
          </div>
        </div>
      </div>
    </Card>
  );
}

function makeLlmUiLog(step: string, status: string, messageText: string, detail?: any) {
  return { at: new Date().toISOString(), step, status, message: messageText, detail };
}

async function pollLlmDebugSession(sessionId: string, onUpdate: (data: any) => void) {
  if (!sessionId) throw new Error('124 未返回调试会话 ID');
  let latest: any = null;
  for (let i = 0; i < 240; i += 1) {
    await new Promise(resolve => window.setTimeout(resolve, i < 4 ? 700 : 1200));
    latest = await api<any>(`/api/generation/debug/llm-chat/${encodeURIComponent(sessionId)}`);
    onUpdate(latest);
    const status = latest?.session?.status;
    if (status === 'SUCCESS' || status === 'FAILED') return latest;
  }
  throw new Error('调试会话仍在运行，请稍后查看调用日志');
}

function LlmDebugLogItem({ log }: { log: any }) {
  const color = log.status === 'success' ? 'green' : log.status === 'failed' ? 'red' : log.status === 'running' ? 'blue' : 'default';
  return (
    <div className={`llmDebugLogItem status-${log.status || 'info'}`}>
      <div className="llmDebugLogHead">
        <Tag color={color}>{log.status || 'info'}</Tag>
        <span className="llmDebugStep">{log.step}</span>
        <span className="llmDebugTime">{dateTime(log.at)}</span>
      </div>
      <div className="llmDebugMessage">{log.message}</div>
      {log.detail !== undefined && <pre>{JSON.stringify(log.detail, null, 2)}</pre>}
    </div>
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

type GenerationResultTab = 'IMAGE' | 'ASSET_DESIGN' | 'SHOT_STORYBOARD' | 'STORYBOARD' | 'VIDEO';

function GenerationResults() {
  const [activeTab, setActiveTab] = useState<GenerationResultTab>('IMAGE');
  const [filters, setFilters] = useState({ status: '', userId: '', limit: 200 });
  const q = useQuery({
    queryKey: ['generationResults', activeTab, filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.userId) params.set('userId', filters.userId.trim());
      if (activeTab === 'VIDEO') params.set('type', 'VIDEO');
      else if (activeTab === 'IMAGE' || activeTab === 'STORYBOARD') params.set('type', 'IMAGE');
      if (activeTab === 'ASSET_DESIGN') params.set('mode', 'asset-design');
      if (activeTab === 'SHOT_STORYBOARD') params.set('mode', 'shot-storyboard');
      if (activeTab === 'STORYBOARD') params.set('mode', 'storyboard');
      params.set('limit', String(filters.limit));
      return api<ApiList<any>>(`/api/generation/admin/tasks?${params.toString()}`);
    },
  });
  const rows = apiListItems(q.data).filter((item: any) => {
    if (activeTab === 'VIDEO') return item.type === 'VIDEO';
    if (activeTab === 'ASSET_DESIGN') return isAssetDesignTask(item);
    if (activeTab === 'SHOT_STORYBOARD') return isShotStoryboardTask(item);
    if (activeTab === 'STORYBOARD') return item.type === 'IMAGE' && isStoryboardTask(item);
    return item.type === 'IMAGE' && !isStoryboardTask(item) && !isAssetDesignTask(item) && !isShotStoryboardTask(item);
  });
  return (
    <Card title="生图生视频结果列表">
      <Tabs
        activeKey={activeTab}
        onChange={key => setActiveTab(key as GenerationResultTab)}
        items={[
          { key: 'IMAGE', label: '图片', children: <GenerationResultTable rows={rows} loading={q.isLoading} fetching={q.isFetching} filters={filters} setFilters={setFilters} refetch={() => q.refetch()} /> },
          { key: 'ASSET_DESIGN', label: '资产设计', children: <GenerationResultTable rows={rows} loading={q.isLoading} fetching={q.isFetching} filters={filters} setFilters={setFilters} refetch={() => q.refetch()} /> },
          { key: 'SHOT_STORYBOARD', label: '分镜图', children: <GenerationResultTable rows={rows} loading={q.isLoading} fetching={q.isFetching} filters={filters} setFilters={setFilters} refetch={() => q.refetch()} /> },
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
          { title: '类型', dataIndex: 'type', width: 120, render: (v, row) => <Tag color="blue">{generationTypeLabel(v, row.mode, row)}</Tag> },
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
    REFUNDED: { color: 'purple', text: '已退款' },
    CANCELLED: { color: 'default', text: '已取消' },
    TIMEOUT: { color: 'orange', text: '超时' },
    RUNNING: { color: 'processing', text: '运行中' },
    PENDING: { color: 'gold', text: '等待中' },
    CREATED: { color: 'default', text: '已创建' },
  };
  const item = map[status] || { color: 'default', text: status || '-' };
  return <Tag color={item.color}>{item.text}</Tag>;
}

function GenerationChargeDisplay({ task }: { task: any }) {
  const charged = Number(task?.chargedCredits || 0);
  const refunded = Number(task?.refundCredits || 0);
  const status = String(task?.status || '').toUpperCase();
  const refundStatus = String(task?.refundStatus || '').toUpperCase();
  if (status === 'REFUNDED' || refunded > 0 || refundStatus === 'SUCCESS') {
    const net = Math.max(0, charged - refunded);
    return (
      <div>
        <Tag color="purple">实扣 {money(net)}</Tag>
        <div style={{ marginTop: 4, color: '#888' }}>原扣 {money(charged)}，已退 {money(refunded || charged)}</div>
      </div>
    );
  }
  return <div>{money(charged)}</div>;
}

function GenerationResultDetailButton({ task }: { task: any }) {
  const [open, setOpen] = useState(false);
  const urls = generationResultUrls(task);
  const firstUrl = urls[0] || '';
  const hasPreview = task.status === 'SUCCESS' && firstUrl;
  const hasStoryboardTable = Boolean(shotStoryboardResultText(task));
  const detailQuery = useQuery({
    queryKey: ['generationResultDetail', task.id],
    queryFn: () => api<{ task: any }>(`/api/generation/admin/tasks/${encodeURIComponent(task.id)}`),
    enabled: open,
  });
  const detailTask = detailQuery.data?.task || task;
  const detailUrls = generationResultUrls(detailTask);
  const detailPreviewUrl = detailUrls[0] || '';
  const detailHasPreview = detailTask.status === 'SUCCESS' && detailPreviewUrl;
  const detailHasStoryboardTable = Boolean(shotStoryboardResultText(detailTask));
  return (
    <>
      <Button type="link" size="small" onClick={() => setOpen(true)}>
        {hasPreview ? (task.type === 'VIDEO' ? '点击预览视频' : '点击预览图片') : hasStoryboardTable ? '查看分镜表' : task.errorMessage || '查看详情'}
      </Button>
      <Modal
        title={detailHasPreview ? (detailTask.type === 'VIDEO' ? '视频预览' : '图片预览') : detailHasStoryboardTable ? '分镜表详情' : '任务详情'}
        open={open}
        footer={null}
        width="92vw"
        centered
        destroyOnHidden
        onCancel={() => setOpen(false)}
        styles={{ body: { maxHeight: '82vh', overflow: 'auto' } }}
      >
        {detailQuery.isLoading ? <div style={{ padding: 24 }}>正在加载任务详情...</div> : <GenerationResultDetail task={detailTask} urls={detailUrls} />}
      </Modal>
    </>
  );
}

function GenerationResultDetail({ task, urls }: { task: any; urls: string[] }) {
  const previewUrl = urls[0] || '';
  const gptImage2Models = generationGptImage2Models(task);
  const storyboardTableText = shotStoryboardResultText(task);
  return (
    <div className="usageDetail">
      {previewUrl && <div>{task.type === 'VIDEO' ? <video className="generationPreview generationPreviewLarge" src={previewUrl} controls /> : <img className="generationPreview generationPreviewLarge" src={previewUrl} alt="generation result" />}</div>}
      {urls.length > 1 && <div className="generationUrlGrid">{urls.map((url, index) => <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer">结果链接 {index + 1}</a>)}</div>}
      {previewUrl && <div><a href={previewUrl} target="_blank" rel="noreferrer">打开原始链接</a></div>}
      {storyboardTableText && <div><b>分镜表结果</b><pre>{storyboardTableText}</pre></div>}
      <div><b>提示词</b><div>{task.prompt || '-'}</div></div>
      <div className="formGrid2">
        <div><b>用户名称</b><div>{task.user?.nickname || task.user?.phone || '-'}</div></div>
        <div><b>用户 UID</b><div>{task.userId || task.user?.id || '-'}</div></div>
        <div><b>任务状态</b><div><GenerationStatus status={task.status} /></div></div>
        <div><b>任务 ID</b><div>{task.upstreamTaskId || task.id}</div></div>
        <div><b>平台</b><div>{platformName(task.channelKey)}</div></div>
        <div><b>模型</b><div>{task.model?.displayName || task.model?.name || '-'}</div></div>
        {gptImage2Models && <div><b>生图模型</b><div>{gptImage2Models.imageModel}</div></div>}
        {gptImage2Models && <div><b>本单透传外层模型</b><div>{gptImage2Models.outerModel || '等待后台 requestJson'}</div></div>}
        <div><b>扣费</b><GenerationChargeDisplay task={task} /></div>
      </div>
      {task.errorMessage && <div><b>错误原因</b><div className="usageError">{task.errorMessage}</div></div>}
      <div className="formGrid2">
        <pre>{JSON.stringify({ paramsJson: task.paramsJson || {}, requestJson: task.requestJson || {} }, null, 2)}</pre>
        <pre>{JSON.stringify({ resultUrls: urls, resultJson: task.resultJson || {}, responseJson: task.responseJson || {} }, null, 2)}</pre>
      </div>
    </div>
  );
}

function generationGptImage2Models(task: any) {
  const requestJson = task?.requestJson && typeof task.requestJson === 'object' ? task.requestJson : {};
  const paramsJson = task?.paramsJson && typeof task.paramsJson === 'object' ? task.paramsJson : {};
  const model = task?.model && typeof task.model === 'object' ? task.model : {};
  const requestImageModel = jsonTextValue(requestJson, ['model']);
  const configuredImageModel = jsonTextValue(paramsJson, ['model']) || String(model.name || '').trim();
  const imageModel = requestImageModel || configuredImageModel;
  const hint = [
    task?.channelKey,
    task?.provider?.providerKey,
    model.id,
    model.modelKey,
    model.name,
    model.displayName,
    model.adapter,
    requestImageModel,
    configuredImageModel,
  ].map(value => String(value || '').toLowerCase()).join(' ');
  if (!/gpt[-_ ]?image[-_ ]?2/.test(hint) && !hint.includes('canvas_gpt-image-2-pro') && !hint.includes('canvas-gpt-image-2-pro')) return null;
  return {
    imageModel: imageModel || 'gpt-image-2',
    outerModel: jsonTextValue(requestJson, ['main_model', 'responses_model', 'codex_model', 'imageMainModel']),
  };
}

function jsonTextValue(value: any, keys: string[]) {
  if (!value || typeof value !== 'object') return '';
  for (const key of keys) {
    const next = String(value[key] || '').trim();
    if (next) return next;
  }
  return '';
}

function generationJsonTextValue(value: any, keys: string[]) {
  if (!value || typeof value !== 'object') return '';
  for (const key of keys) {
    const next = value[key];
    if (typeof next === 'string' && next.trim()) return next.trim();
  }
  return '';
}

function shotStoryboardResultText(task: any) {
  if (!isShotStoryboardTask(task)) return '';
  const result = task?.resultJson && typeof task.resultJson === 'object' ? task.resultJson : {};
  const response = task?.responseJson && typeof task.responseJson === 'object' ? task.responseJson : {};
  const params = task?.paramsJson && typeof task.paramsJson === 'object' ? task.paramsJson : {};
  return generationJsonTextValue(result, ['storyboardTable', 'tableText', 'table', 'text', 'content'])
    || generationJsonTextValue(params, ['storyboardTable', 'tableText', 'table'])
    || generationJsonTextValue(response, ['text', 'content', 'prompt']);
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
  if (isShotStoryboardTask(task)) return false;
  const params = task?.paramsJson && typeof task.paramsJson === 'object' ? task.paramsJson : {};
  const result = task?.resultJson && typeof task.resultJson === 'object' ? task.resultJson : {};
  const fields = [
    task.mode,
    params.mode,
    result.mode,
    params.taskType,
    params.task_type,
    result.taskType,
    result.task_type,
    params.nodeType,
    params.node_type,
    result.nodeType,
    result.node_type,
    params.template,
    result.template,
    params.sourceNodeType,
    params.source_node_type,
    result.sourceNodeType,
    result.source_node_type,
    params.workflowNodeType,
    params.workflow_node_type,
    params.canvasNodeType,
    params.canvas_node_type,
    result.canvasNodeType,
    result.canvas_node_type,
    params.sourceType,
    params.source_type,
    params.category,
    result.category,
    params.resultType,
    params.result_type,
    result.resultType,
    result.result_type,
    params.outputType,
    params.output_type,
    result.outputType,
    result.output_type,
    params.kind,
    result.kind,
  ];
  const text = fields.filter(Boolean).join(' ').toLowerCase();
  return /storyboard|故事板/.test(text) || String(task?.mode || '').trim().toLowerCase() === 'storyboard';
}

function isAssetDesignTask(task: any) {
  return /asset[-_\s]?design|assetdesign|资产设计/.test(generationTaskClassifierText(task));
}

function isShotStoryboardTask(task: any) {
  return /shot[-_\s]?storyboard|shotstoryboard|分镜节点|分镜表|分镜图/.test(generationTaskClassifierText(task));
}

function generationTaskClassifierText(task: any) {
  const params = task?.paramsJson && typeof task.paramsJson === 'object' ? task.paramsJson : {};
  const result = task?.resultJson && typeof task.resultJson === 'object' ? task.resultJson : {};
  const fields = [
    task?.mode,
    params.mode,
    result.mode,
    params.taskType,
    params.task_type,
    result.taskType,
    result.task_type,
    params.nodeType,
    params.node_type,
    result.nodeType,
    result.node_type,
    params.template,
    result.template,
    params.sourceNodeType,
    params.source_node_type,
    result.sourceNodeType,
    result.source_node_type,
    params.workflowNodeType,
    params.workflow_node_type,
    params.canvasNodeType,
    params.canvas_node_type,
    result.canvasNodeType,
    result.canvas_node_type,
    params.sourceType,
    params.source_type,
    params.category,
    result.category,
    params.resultType,
    params.result_type,
    result.resultType,
    result.result_type,
    params.outputType,
    params.output_type,
    result.outputType,
    result.output_type,
    params.kind,
    result.kind,
  ];
  return fields.filter(Boolean).join(' ').toLowerCase();
}

function apiListItems(data: any) {
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data?.items)) return data.data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
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

function generationTypeLabel(type: string, mode?: string, task?: any) {
  const normalizedMode = String(mode || '').toLowerCase();
  if (task && isAssetDesignTask(task)) return '资产设计';
  if (task && isShotStoryboardTask(task)) {
    const params = task?.paramsJson && typeof task.paramsJson === 'object' ? task.paramsJson : {};
    const result = task?.resultJson && typeof task.resultJson === 'object' ? task.resultJson : {};
    const outputType = String(params.outputType || params.output_type || result.outputType || result.output_type || '').toLowerCase();
    if (outputType === 'table') return '分镜表';
    if (outputType === 'table_image' || outputType === 'table-image') return '分镜表+分镜图';
    return '分镜图';
  }
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

type CanvasNodeConfigItem = {
  type: string;
  name: string;
  icon: string;
  category: string;
  description: string;
  enabled: boolean;
  hidden?: boolean;
  updatedAt?: string;
};

function canvasNodeConfigItems(data: any): CanvasNodeConfigItem[] {
  const candidates = [
    data?.items,
    data?.nodes,
    data?.data?.items,
    data?.data?.nodes,
    data?.data,
  ];
  const items = candidates.find(Array.isArray) || [];
  return items.filter((item: any) => item && typeof item === 'object' && item.type) as CanvasNodeConfigItem[];
}

function CanvasNodeManagement() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['canvasNodes'], queryFn: () => api<any>('/api/admin/canvas-nodes') });
  const items = canvasNodeConfigItems(q.data);
  const enabledCount = items.filter(item => item.enabled).length;
  const hiddenCount = items.filter(item => item.hidden).length;
  const toggle = useMutation({
    mutationFn: (input: { type: string; enabled: boolean }) => api(`/api/admin/canvas-nodes/${encodeURIComponent(input.type)}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: input.enabled }),
    }),
    onSuccess: (_data, variables) => {
      message.success(variables.enabled ? '节点已启用' : '节点已禁用');
      qc.invalidateQueries({ queryKey: ['canvasNodes'] });
    },
    onError: err => message.error(err instanceof Error ? err.message : '节点状态更新失败'),
  });
  function requestToggle(row: CanvasNodeConfigItem, enabled: boolean) {
    if (enabled) {
      toggle.mutate({ type: row.type, enabled });
      return;
    }
    Modal.confirm({
      title: `禁用节点：${row.name}`,
      content: '禁用后，该节点会从画布、节点选择器和连接候选中移除；已保存工作流里的同类节点也不会再加载使用。',
      okText: '确认禁用',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => toggle.mutateAsync({ type: row.type, enabled }),
    });
  }
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        message="只有启用的画布节点可以被创建、显示和连接"
        description="这里的配置会被画布启动时读取。禁用节点不会出现在节点选择器中，也不能作为自动补全节点或连接目标。"
      />
      {q.error && (
        <Alert
          type="error"
          showIcon
          message="画布节点配置加载失败"
          description={q.error instanceof Error ? q.error.message : '请确认后台 API 已部署并重启后端服务。'}
        />
      )}
      {!q.isLoading && !q.error && items.length === 0 && (
        <Alert
          type="warning"
          showIcon
          message="没有读取到节点配置"
          description="接口已返回，但没有包含 items 或 nodes 数据。请刷新重试，或重新部署后台 API。"
        />
      )}
      <div className="grid4">
        <Card><Statistic title="节点总数" value={items.length} /></Card>
        <Card><Statistic title="已启用" value={enabledCount} /></Card>
        <Card><Statistic title="已禁用" value={items.length - enabledCount} /></Card>
        <Card><Statistic title="系统隐藏节点" value={hiddenCount} /></Card>
      </div>
      <Card title="画布节点启停配置" extra={<Button onClick={() => q.refetch()} loading={q.isFetching}>刷新</Button>}>
        <Table<CanvasNodeConfigItem>
          rowKey="type"
          loading={q.isLoading}
          dataSource={items}
          pagination={false}
          scroll={{ x: 980 }}
          locale={{ emptyText: q.error ? '配置接口加载失败' : '暂无节点配置' }}
          columns={[
            {
              title: '节点',
              width: 260,
              render: (_, row) => (
                <Space>
                  <span className="canvasNodeIcon">{row.icon}</span>
                  <span>
                    <b>{row.name}</b>
                    <div className="muted">{row.type}</div>
                  </span>
                </Space>
              ),
            },
            { title: '分类', width: 110, dataIndex: 'category', render: value => <Tag>{canvasNodeCategoryLabel(value)}</Tag> },
            { title: '说明', dataIndex: 'description' },
            { title: '可见性', width: 110, render: (_, row) => row.hidden ? <Tag color="default">系统隐藏</Tag> : <Tag color="blue">可选择</Tag> },
            { title: '最近更新', width: 180, dataIndex: 'updatedAt', render: dateTime },
            {
              title: '状态',
              width: 140,
              fixed: 'right',
              render: (_, row) => (
                <Switch
                  checked={row.enabled}
                  loading={toggle.isPending}
                  checkedChildren="启用"
                  unCheckedChildren="禁用"
                  onChange={checked => requestToggle(row, checked)}
                />
              ),
            },
          ]}
        />
      </Card>
    </Space>
  );
}

function canvasNodeCategoryLabel(value: string) {
  const labels: Record<string, string> = { input: '素材', generate: '生成', edit: '编辑', output: '输出', custom: '自定义' };
  return labels[value] || value || '-';
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
    { title: '会员一刀积分', dataIndex: 'creditsPerUsdCost', render: (v, row) => row.type === 'LLM' ? `${Number(v || 0)} / 原价 ${memberOriginal(Number(v || 0))}` : '-' },
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
          <SimpleModelFormFields editing model={model} />
        </Form>
      </Modal>
    </>
  );
}

function SimpleModelFormFields({ editing = false, model }: { editing?: boolean; model?: any }) {
  const form = Form.useFormInstance();
  const selectedType = (Form.useWatch('type', form) || 'IMAGE') as 'IMAGE' | 'VIDEO' | 'LLM';
  const selectedAdapter = String(Form.useWatch('adapter', form) || '');
  const selectedModel = String(Form.useWatch('model', form) || '');
  const selectedNick = String(Form.useWatch('modelNick', form) || '');
  const selectedUpstreamStreamConfigMode = String(Form.useWatch('upstreamStreamConfigMode', form) || 'uniform');
  const selectedAsyncTaskConfigMode = String(Form.useWatch('asyncTaskConfigMode', form) || 'uniform');
  const selectedResponseTypeMode = String(Form.useWatch('responseTypeMode', form) || 'uniform');
  const adapterOptions = modelAdapterOptions.filter(option => option.type === selectedType);
  const showGptImage2MainModel = isGptImage2Config(selectedType, selectedAdapter, selectedModel, selectedNick);
  const videoDurationFields = selectedType === 'VIDEO' ? videoDurationResolutionFieldsForModel(model, selectedModel, selectedNick) : [];
  useEffect(() => {
    const currentAdapter = form.getFieldValue('adapter');
    if (!adapterOptions.some(option => option.value === currentAdapter)) {
      form.setFieldValue('adapter', adapterOptions[0]?.value);
    }
  }, [adapterOptions, form]);
  useEffect(() => {
    if (showGptImage2MainModel && !form.getFieldValue('imageMainModel')) {
      form.setFieldValue('imageMainModel', 'gpt-5.4-mini');
    }
    if (showGptImage2MainModel && !form.getFieldValue('asyncTaskMode')) {
      form.setFieldValue('asyncTaskMode', 'sync');
    }
  }, [form, showGptImage2MainModel]);
  return (
    <>
      <Form.Item name="type" label="模型分类" rules={[{ required: true }]}>
        <Select options={modelTypeOptions} />
      </Form.Item>
      <Form.Item name="adapter" label="渠道类型" rules={[{ required: true }]}>
        <Select options={adapterOptions} />
      </Form.Item>
      <Form.Item
        name="baseUrl"
        label="Base URL"
        tooltip="这里保存到数据库 upstreamProvider.baseUrl；生成任务最终只按该值拼接上游地址。可选预设，也可以手动输入任意 URL。"
        rules={[{ required: true }]}
      >
        <AutoComplete
          options={upstreamBaseUrlOptions}
          filterOption={(input, option) => String(option?.value || '').toLowerCase().includes(input.toLowerCase()) || String(option?.label || '').toLowerCase().includes(input.toLowerCase())}
        >
          <Input placeholder="选择中转站，或输入自定义 Base URL，例如 http://45.77.211.38:8317/v1" />
        </AutoComplete>
      </Form.Item>
      <Form.Item name="model" label="model" rules={[{ required: true }]}><Input placeholder="veo-3.1 / sora-2 / gpt-image-2 / gemini-3-pro-image-preview" /></Form.Item>
      <Form.Item name="modelNick" label="modelNick" rules={[{ required: true }]}><Input placeholder="画布下拉展示名" /></Form.Item>
      {showGptImage2MainModel && (
        <>
          <Form.Item
            name="imageMainModel"
            label="GPT-Image-2 外层模型"
            tooltip="控制 43 中转站调用 gpt-image-2 时使用的 Responses 外层模型；真正出图工具仍然是 gpt-image-2。"
            rules={[{ required: true, message: '请选择 GPT-Image-2 外层模型' }]}
          >
            <Select options={gptImage2MainModelOptions} />
          </Form.Item>
          <Form.Item
            name="upstreamStreamConfigMode"
            label="GPT-Image-2 上游 stream 配置"
            tooltip="控制 43 中转站向 OpenAI Responses 发起图片请求时是否使用流式。可统一切换，也可以按 1K/2K/3K/4K 分辨率分别配置。"
          >
            <Select options={responseTypeModeOptions} />
          </Form.Item>
          {selectedUpstreamStreamConfigMode === 'by_resolution' ? (
            <div className="formGrid2">
              {imageResolutionResponseTypeFields.map(item => (
                <Form.Item key={item.key} name={['upstreamStreamModes', item.key]} label={`${item.label} upstream stream`}>
                  <Select options={gptImage2UpstreamStreamOptions} />
                </Form.Item>
              ))}
            </div>
          ) : (
            <Form.Item
              name="upstreamStreamMode"
              label="GPT-Image-2 上游 stream"
              tooltip="统一应用到该模型所有分辨率。4K 长任务通常更适合非流式；是否这样配置由你在这里决定。"
            >
              <Select options={gptImage2UpstreamStreamOptions} />
            </Form.Item>
          )}
          <Form.Item
            name="asyncTaskConfigMode"
            label="GPT-Image-2 async_task 配置"
            tooltip="控制是否给 43/45 中转站请求加入 async_task:true。同步=不发送 async_task；异步=发送 async_task:true。可统一切换，也可以按分辨率分别配置。"
          >
            <Select options={responseTypeModeOptions} />
          </Form.Item>
          {selectedAsyncTaskConfigMode === 'by_resolution' ? (
            <div className="formGrid2">
              {imageResolutionResponseTypeFields.map(item => (
                <Form.Item key={item.key} name={['asyncTaskModes', item.key]} label={`${item.label} async_task`}>
                  <Select options={gptImage2AsyncTaskOptions} />
                </Form.Item>
              ))}
            </div>
          ) : (
            <Form.Item name="asyncTaskMode" label="GPT-Image-2 async_task">
              <Select options={gptImage2AsyncTaskOptions} />
            </Form.Item>
          )}
        </>
      )}
      {selectedType !== 'LLM' && (
        <Form.Item name="uploadMode" label="上传服务器">
          <Select options={uploadModeOptions} />
        </Form.Item>
      )}
      {selectedType === 'IMAGE' && (
        <>
          <Form.Item
            name="responseTypeMode"
            label="返回结果策略"
            tooltip="默认转存 COS。可统一配置，也可以按 1K/2K/3K/4K 分辨率分别配置。非 COS 结果在画布作为参考图时会先转存 COS。"
          >
            <Select options={responseTypeModeOptions} />
          </Form.Item>
          {selectedResponseTypeMode === 'by_resolution' ? (
            <div className="formGrid2">
              {imageResolutionResponseTypeFields.map(item => (
                <Form.Item key={item.key} name={['responseTypes', item.key]} label={`${item.label} response_type`}>
                  <Select options={imageResponseTypeOptions} />
                </Form.Item>
              ))}
            </div>
          ) : (
            <Form.Item name="responseType" label="response_type">
              <Select options={imageResponseTypeOptions} />
            </Form.Item>
          )}
        </>
      )}
      {selectedType === 'VIDEO' && (
        <>
          <div className="formGrid2">
            {videoDurationFields.map(item => (
              <Form.Item
                key={item.key}
                name={['maxVideoDurationSecondsByResolution', item.key]}
                label={`${item.label} 最大视频时长（秒）`}
                tooltip="按当前视频分辨率保存到模型 capabilities.maxVideoDurationSecondsByResolution，画布可选时长和提交上游时都会按该分辨率裁剪。"
              >
                <InputNumber min={1} precision={0} style={{ width: '100%' }} placeholder="例如 5 / 10 / 15 / 30 / 60" />
              </Form.Item>
            ))}
          </div>
          <Form.Item
            name="disabledVideoResolutions"
            label="停用分辨率"
            tooltip="选择后会保存到模型 capabilities.disabledResolutions，画布生视频节点会隐藏该渠道下对应分辨率，例如停用 1080p 后该渠道不能再选择 1080P。"
          >
            <Select
              mode="multiple"
              allowClear
              placeholder="选择要停用的分辨率"
              options={videoDurationFields.map(item => ({ value: item.key, label: item.label.toUpperCase() }))}
            />
          </Form.Item>
          <Form.Item
            name="responseType"
            label="response_type"
            tooltip="视频默认不转存，沿用当前上游返回；也可以选择 124 异步转存 COS，生成后先预览临时地址，后台再保存到 COS。"
          >
            <Select options={videoResponseTypeOptions} />
          </Form.Item>
        </>
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
  { value: 'local_cache_async_cos', label: '本地预览 + 后台异步 COS（推荐）' },
];

const upstreamBaseUrlOptions = [
  { value: 'http://45.77.211.38:8317/v1', label: '新中转站 Vultr 45 - http://45.77.211.38:8317/v1' },
  { value: 'http://43.165.186.217/v1', label: '备用中转站 腾讯 43 - http://43.165.186.217/v1' },
];

const responseTypeModeOptions = [
  { value: 'uniform', label: '统一切换配置' },
  { value: 'by_resolution', label: '按分辨率单独配置' },
];

const imageResponseTypeOptions = [
  { value: 'object_storage', label: '转存 COS' },
  { value: 'server_object_storage', label: '124 异步转存 COS（先预览）' },
  { value: 'provider_url', label: '中转站原地址' },
  { value: 'base64', label: 'base64' },
];

const videoResponseTypeOptions = [
  { value: 'provider_url', label: '不转存（默认，使用上游原地址）' },
  { value: 'server_object_storage', label: '124 异步转存 COS（先预览）' },
  { value: 'object_storage', label: '同步转存 COS' },
  { value: 'base64', label: 'base64' },
];

const imageResolutionResponseTypeFields = [
  { key: '1k', label: '1K' },
  { key: '2k', label: '2K' },
  { key: '3k', label: '3K' },
  { key: '4k', label: '4K' },
];

const defaultVideoDurationResolutionFields = [
  { key: '480p', label: '480p' },
  { key: '720p', label: '720p' },
  { key: '1080p', label: '1080p' },
];

const gptImage2MainModelOptions = [
  { value: 'gpt-5.5', label: 'gpt-5.5' },
  { value: 'gpt-5.4', label: 'gpt-5.4' },
  { value: 'gpt-5.4-mini', label: 'gpt-5.4-mini' },
];

const gptImage2UpstreamStreamOptions = [
  { value: 'auto', label: '自动（不强制覆盖）' },
  { value: 'non_stream', label: '非流式 stream=false' },
  { value: 'stream', label: '流式 stream=true' },
];

const gptImage2AsyncTaskOptions = [
  { value: 'sync', label: '同步（不发送 async_task）' },
  { value: 'async', label: '异步（async_task=true）' },
];

function isGptImage2Config(type: string, adapter: string, model: string, modelNick: string) {
  const text = `${adapter} ${model} ${modelNick}`.toLowerCase();
  return type === 'IMAGE' && /gpt[-_ ]?image[-_ ]?2/.test(text) && /openai-edits|gpt-image|image/.test(text);
}

function normalizeSimpleModelFormValues(model: any) {
  const protocol = model?.protocol && typeof model.protocol === 'object' ? model.protocol : {};
  const defaults = model?.defaults && typeof model.defaults === 'object' ? model.defaults : {};
  const providerDefaults = model?.provider?.defaultParams && typeof model.provider.defaultParams === 'object' ? model.provider.defaultParams : {};
  const capabilities = model?.capabilities && typeof model.capabilities === 'object' ? model.capabilities : {};
  const modelType = model.type || 'IMAGE';
  const defaultResponseType = modelType === 'VIDEO' ? 'provider_url' : 'object_storage';
  const ownUploadMode = Object.prototype.hasOwnProperty.call(model || {}, 'modelUploadMode')
    ? model.modelUploadMode
    : model.uploadMode;
  return {
    type: modelType,
    adapter: model.provider?.adapter || model.adapter || 'openai-image',
    baseUrl: model.provider?.baseUrl || '',
    model: model.name,
    modelNick: model.displayName,
    imageMainModel: normalizeGptImage2MainModelValue(protocol.imageMainModel || protocol.responsesModel || protocol.codexModel || defaults.imageMainModel || defaults.responsesModel || defaults.codexModel || providerDefaults.imageMainModel || providerDefaults.responsesModel || providerDefaults.codexModel) || 'gpt-5.4-mini',
    upstreamStreamConfigMode: normalizeResponseTypeModeValue(protocol.upstreamStreamConfigMode || protocol.upstream_stream_config_mode || defaults.upstreamStreamConfigMode || defaults.upstream_stream_config_mode || providerDefaults.upstreamStreamConfigMode || providerDefaults.upstream_stream_config_mode) || 'uniform',
    upstreamStreamMode: normalizeUpstreamStreamModeValue(protocol.upstreamStreamMode || protocol.upstream_stream_mode || defaults.upstreamStreamMode || defaults.upstream_stream_mode || providerDefaults.upstreamStreamMode || providerDefaults.upstream_stream_mode) || 'auto',
    upstreamStreamModes: normalizeUpstreamStreamModesValue(protocol.upstreamStreamModes || protocol.upstream_stream_modes || defaults.upstreamStreamModes || defaults.upstream_stream_modes || providerDefaults.upstreamStreamModes || providerDefaults.upstream_stream_modes),
    asyncTaskConfigMode: normalizeResponseTypeModeValue(protocol.asyncTaskConfigMode || protocol.async_task_config_mode || defaults.asyncTaskConfigMode || defaults.async_task_config_mode || providerDefaults.asyncTaskConfigMode || providerDefaults.async_task_config_mode) || 'uniform',
    asyncTaskMode: normalizeAsyncTaskModeValue(protocol.asyncTaskMode || protocol.async_task_mode || defaults.asyncTaskMode || defaults.async_task_mode || providerDefaults.asyncTaskMode || providerDefaults.async_task_mode) || 'sync',
    asyncTaskModes: normalizeAsyncTaskModesValue(protocol.asyncTaskModes || protocol.async_task_modes || defaults.asyncTaskModes || defaults.async_task_modes || providerDefaults.asyncTaskModes || providerDefaults.async_task_modes),
    uploadMode: normalizeUploadModeValue(ownUploadMode || ''),
    responseTypeMode: normalizeResponseTypeModeValue(protocol.responseTypeMode || protocol.response_type_mode || defaults.responseTypeMode || defaults.response_type_mode) || 'uniform',
    responseType: normalizeImageResponseTypeValue(protocol.responseType || protocol.response_type || defaults.responseType || defaults.response_type) || defaultResponseType,
    responseTypes: normalizeImageResponseTypesValue(protocol.responseTypes || protocol.response_types || defaults.responseTypes || defaults.response_types),
    maxVideoDurationSeconds: normalizePositiveIntegerValue(capabilities.maxVideoDurationSeconds || capabilities.max_video_duration_seconds) || undefined,
    maxVideoDurationSecondsByResolution: normalizeVideoMaxDurationByResolutionValue(capabilities.maxVideoDurationSecondsByResolution || capabilities.max_video_duration_seconds_by_resolution),
    disabledVideoResolutions: normalizeVideoDisabledResolutionsValue(capabilities.disabledVideoResolutions || capabilities.disabled_video_resolutions || capabilities.disabledResolutions || capabilities.disabled_resolutions),
    key: model.provider?.apiKey || '',
  };
}

function normalizeSimpleModelSubmitValues(values: any, editing = false) {
  const modelType = values.type || 'IMAGE';
  const defaultResponseType = modelType === 'VIDEO' ? 'provider_url' : 'object_storage';
  const payload = {
    ...values,
    baseUrl: String(values.baseUrl || '').trim(),
    adapter: String(values.adapter || '').trim(),
    model: String(values.model || '').trim(),
    modelNick: String(values.modelNick || '').trim(),
    imageMainModel: normalizeGptImage2MainModelValue(values.imageMainModel),
    upstreamStreamConfigMode: normalizeResponseTypeModeValue(values.upstreamStreamConfigMode) || 'uniform',
    upstreamStreamMode: normalizeUpstreamStreamModeValue(values.upstreamStreamMode) || 'auto',
    upstreamStreamModes: normalizeUpstreamStreamModesValue(values.upstreamStreamModes),
    asyncTaskConfigMode: normalizeResponseTypeModeValue(values.asyncTaskConfigMode) || 'uniform',
    asyncTaskMode: normalizeAsyncTaskModeValue(values.asyncTaskMode) || 'sync',
    asyncTaskModes: normalizeAsyncTaskModesValue(values.asyncTaskModes),
    uploadMode: normalizeUploadModeValue(values.uploadMode),
    responseTypeMode: normalizeResponseTypeModeValue(values.responseTypeMode) || 'uniform',
    responseType: normalizeImageResponseTypeValue(values.responseType) || defaultResponseType,
    responseTypes: normalizeImageResponseTypesValue(values.responseTypes),
    maxVideoDurationSeconds: normalizePositiveIntegerValue(values.maxVideoDurationSeconds) || null,
    maxVideoDurationSecondsByResolution: normalizeVideoMaxDurationByResolutionValue(values.maxVideoDurationSecondsByResolution),
    disabledVideoResolutions: normalizeVideoDisabledResolutionsValue(values.disabledVideoResolutions),
    key: String(values.key || '').trim(),
  };
  if (!isGptImage2Config(payload.type, payload.adapter, payload.model, payload.modelNick)) {
    delete payload.imageMainModel;
    delete payload.upstreamStreamConfigMode;
    delete payload.upstreamStreamMode;
    delete payload.upstreamStreamModes;
    delete payload.asyncTaskConfigMode;
    delete payload.asyncTaskMode;
    delete payload.asyncTaskModes;
  }
  if (payload.type === 'VIDEO') {
    payload.responseTypeMode = 'uniform';
    payload.responseTypes = {};
  }
  if (payload.type === 'LLM') {
    delete payload.responseTypeMode;
    delete payload.responseType;
    delete payload.responseTypes;
    delete payload.maxVideoDurationSeconds;
    delete payload.maxVideoDurationSecondsByResolution;
    delete payload.disabledVideoResolutions;
  }
  if (payload.type !== 'VIDEO') {
    delete payload.maxVideoDurationSeconds;
    delete payload.maxVideoDurationSecondsByResolution;
    delete payload.disabledVideoResolutions;
  }
  if (editing && !payload.key) delete payload.key;
  return payload;
}

function normalizePositiveIntegerValue(value: any) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : 0;
}

function normalizeVideoResolutionKey(value: any) {
  return String(value || '').trim().toLowerCase();
}

function videoDurationResolutionFieldsForModel(model: any, modelName: string, modelNick: string) {
  const caps = model?.capabilities && typeof model.capabilities === 'object' ? model.capabilities : {};
  const fromCaps = Array.isArray(caps.resolutions) ? caps.resolutions : [];
  const byResolution = normalizeVideoMaxDurationByResolutionValue(caps.maxVideoDurationSecondsByResolution || caps.max_video_duration_seconds_by_resolution);
  const fromMap = Object.keys(byResolution);
  const fromDisabled = normalizeVideoDisabledResolutionsValue(caps.disabledVideoResolutions || caps.disabled_video_resolutions || caps.disabledResolutions || caps.disabled_resolutions);
  const preset = videoDurationPresetResolutionList(modelName || model?.name, modelNick || model?.displayName);
  const values = [...fromCaps, ...fromMap, ...fromDisabled, ...preset]
    .map(normalizeVideoResolutionKey)
    .filter(Boolean);
  const unique = Array.from(new Set(values));
  return (unique.length ? unique : defaultVideoDurationResolutionFields.map(item => item.key))
    .map(key => ({ key, label: key.replace(/^(\d+)p$/i, '$1p') }));
}

function videoDurationPresetResolutionList(modelName: any, modelNick: any) {
  const text = `${modelName || ''} ${modelNick || ''}`.toLowerCase();
  if (text.includes('grok-imagine') || text.includes('grok video') || text.includes('grok-video')) return ['480p', '720p'];
  if (text.includes('sora-2') && !text.includes('v3')) return ['720p'];
  if (text.includes('sora-v3') || text.includes('sora-3.0-vip') || text.includes('sora 3.0 vip') || text.includes('sora-v3.0-vip') || text.includes('seedance') || text.includes('sora-vip3') || text.includes('veo')) return ['720p', '1080p'];
  return defaultVideoDurationResolutionFields.map(item => item.key);
}

function normalizeVideoMaxDurationByResolutionValue(value: any) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.entries(source).reduce<Record<string, number>>((acc, [key, raw]) => {
    const normalizedKey = normalizeVideoResolutionKey(key);
    const seconds = normalizePositiveIntegerValue(raw);
    if (normalizedKey && seconds) acc[normalizedKey] = seconds;
    return acc;
  }, {});
}

function normalizeVideoDisabledResolutionsValue(value: any) {
  const source = Array.isArray(value)
    ? value
    : (value && typeof value === 'object'
      ? Object.entries(value).filter(([, enabled]) => Boolean(enabled)).map(([key]) => key)
      : String(value || '').split(/[,\s/]+/));
  return Array.from(new Set(source
    .map(normalizeVideoResolutionKey)
    .filter(Boolean)));
}

function normalizeGptImage2MainModelValue(value: any) {
  const raw = String(value || '').trim().toLowerCase();
  return gptImage2MainModelOptions.some(option => option.value === raw) ? raw : '';
}

function normalizeUpstreamStreamModeValue(value: any) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === 'default') return 'auto';
  if (raw === 'auto') return 'auto';
  if (raw === 'stream' || raw === 'streaming' || raw === 'true') return 'stream';
  if (raw === 'non_stream' || raw === 'non-stream' || raw === 'nonstream' || raw === 'false') return 'non_stream';
  return '';
}

function normalizeUpstreamStreamModesValue(value: any) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(imageResolutionResponseTypeFields.map(item => [
    item.key,
    normalizeUpstreamStreamModeValue(source[item.key] || source[item.key.toUpperCase()]) || 'auto',
  ]));
}

function normalizeAsyncTaskModeValue(value: any) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === 'default') return 'sync';
  if (['async', 'async_task', 'async-task', 'background', 'background_task', 'background-task', 'true', '1', 'yes', '异步'].includes(raw)) return 'async';
  if (['sync', 'normal', 'synchronous', 'false', '0', 'no', '同步', 'off'].includes(raw)) return 'sync';
  return '';
}

function normalizeAsyncTaskModesValue(value: any) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(imageResolutionResponseTypeFields.map(item => [
    item.key,
    normalizeAsyncTaskModeValue(source[item.key] || source[item.key.toUpperCase()]) || 'sync',
  ]));
}

function normalizeUploadModeValue(value: any) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === 'default' || raw === 'auto') return '';
  if (raw === 'cos' || raw === 'object-storage' || raw === 'object_storage') return 'object_storage';
  if (['local_cache_async_cos', 'local-cache-async-cos', 'async_cos', 'async-cos', 'backend_async_cos', 'backend-async-cos', '后台异步cos', '后台异步转存cos'].includes(raw)) return 'local_cache_async_cos';
  if (raw === 'file' || raw === 'files') return 'files';
  return '';
}

function normalizeResponseTypeModeValue(value: any) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'by_resolution' || raw === 'by-resolution' || raw === 'resolution' || raw === 'per_resolution') return 'by_resolution';
  if (raw === 'uniform' || raw === 'same' || raw === 'single' || raw === 'default') return 'uniform';
  return '';
}

function normalizeImageResponseTypeValue(value: any) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === 'default' || raw === 'auto') return '';
  if (['cos', 'object_storage', 'object-storage', 'tencent_cos', '转存cos'].includes(raw)) return 'object_storage';
  if (['server_object_storage', 'server-object-storage', 'server_async_object_storage', 'server-async-object-storage', 'backend_object_storage', 'backend-object-storage', 'backend_async_object_storage', 'backend-async-object-storage', 'backend_cos', 'server_cos', '124_cos', '124_async_cos', '124-server-cos', '124服务器转存cos', '124异步转存cos', '后台转存cos', '后台异步转存cos'].includes(raw)) return 'server_object_storage';
  if (['url', 'provider_url', 'provider-url', 'origin_url', 'original_url', 'raw_url', '43_url', 'service_url', '43服务原地址'].includes(raw)) return 'provider_url';
  if (['base64', 'b64', 'b64_json'].includes(raw)) return 'base64';
  return '';
}

function normalizeImageResponseTypesValue(value: any) {
  const source = value && typeof value === 'object' ? value : {};
  return imageResolutionResponseTypeFields.reduce<Record<string, string>>((acc, item) => {
    acc[item.key] = normalizeImageResponseTypeValue(source[item.key] ?? source[item.key.toUpperCase()]) || 'object_storage';
    return acc;
  }, {});
}

function EditModelPricingButton({ model }: { model: any }) {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (values: any) => api(`/api/admin/models/${model.id}`, { method: 'PATCH', body: JSON.stringify(normalizeModelPricingSubmitValues(model, values)) }),
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
          <ModelPricingFormFields model={model} />
        </Form>
      </Modal>
    </>
  );
}

function ModelPricingFormFields({ model }: { model: any }) {
  const type = String(model?.type || '').toUpperCase();
  const common = (
    <>
      <Form.Item name="type" label="类型" hidden><Input /></Form.Item>
      <Form.Item name="status" label="状态"><Select options={[{ value: 'ACTIVE', label: '启用' }, { value: 'DISABLED', label: '停用' }]} /></Form.Item>
    </>
  );
  if (type === 'IMAGE') {
    return (
      <>
        <div className="formGrid2">{common}</div>
        <div className="formGrid2">
          {IMAGE_PRICING_RESOLUTIONS.map(tier => (
            <Form.Item key={tier} name={['imageTierPrices', tier]} label={`${tier}会员积分/张`} rules={[{ required: true, message: `请填写 ${tier} 价格` }]}>
              <InputNumber min={0} precision={0} style={{ width: '100%' }} />
            </Form.Item>
          ))}
        </div>
        <div style={{ color: '#888', fontSize: 12 }}>原价按会员价 4 折自动反推，成本按会员价 70% 自动写入；扣费按输出分辨率档位 × 张数计算。</div>
      </>
    );
  }
  if (type === 'VIDEO') {
    const resolutions = videoPricingResolutionList(model);
    return (
      <>
        <div className="formGrid2">{common}</div>
        <div className="formGrid2">
          {resolutions.map(resolution => (
            <Form.Item key={resolution} name={['videoTierPrices', resolution]} label={`${resolution}会员积分/秒`} rules={[{ required: true, message: `请填写 ${resolution} 秒价` }]}>
              <InputNumber min={0} precision={0} style={{ width: '100%' }} />
            </Form.Item>
          ))}
        </div>
        <div style={{ color: '#888', fontSize: 12 }}>原价按会员价 4 折自动反推，成本按会员价 70% 自动写入；扣费按生成秒数和所选分辨率计算。</div>
      </>
    );
  }
  return (
    <div className="formGrid2">
      {common}
      <Form.Item name="inputPriceUsdPer1m" label="输入价 USD/1M"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
      <Form.Item name="outputPriceUsdPer1m" label="输出价 USD/1M"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
      <Form.Item name="cnyPerUsdCost" label="一刀人民币"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
      <Form.Item name="creditsPerUsdCost" label="会员一刀积分"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
      <Form.Item name="markupRate" label="加价倍率"><InputNumber min={0.01} style={{ width: '100%' }} /></Form.Item>
      <div style={{ gridColumn: '1 / -1', color: '#888', fontSize: 12 }}>原价按会员价 4 折自动反推；实际扣费按用户会员状态计算，画布积分表和扣费接口会读取这里的配置。</div>
    </div>
  );
}

const IMAGE_PRICING_RESOLUTIONS = ['1K', '2K', '3K', '4K'];

function imagePricingTier(model: any, tier: string) {
  const pricing = model?.defaults?.pricing && typeof model.defaults.pricing === 'object' ? model.defaults.pricing : {};
  const tiers = Array.isArray(pricing?.tiers) ? pricing.tiers : [];
  const wanted = String(tier || '').toUpperCase();
  return tiers.find((item: any) => String(item?.tier || item?.label || item?.resolution || '').toUpperCase() === wanted) || null;
}

function imageTierMemberPrice(tier: any, fallback?: number) {
  const value = Number(tier?.memberCredits ?? tier?.chargedCredits ?? tier?.credits ?? tier?.price);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function videoPricingTier(model: any, resolution: string) {
  const pricing = model?.defaults?.pricing && typeof model.defaults.pricing === 'object' ? model.defaults.pricing : {};
  const tiers = Array.isArray(pricing?.resolutionTiers) ? pricing.resolutionTiers : [];
  const wanted = String(resolution || '').toLowerCase();
  return tiers.find((tier: any) => String(tier?.resolution || tier?.label || tier?.quality || '').toLowerCase() === wanted) || null;
}

function videoPricingResolutionList(model: any) {
  const caps = model?.capabilities && typeof model.capabilities === 'object' ? model.capabilities : {};
  const pricing = model?.defaults?.pricing && typeof model.defaults.pricing === 'object' ? model.defaults.pricing : {};
  const fromCaps = Array.isArray(caps.resolutions) ? caps.resolutions : [];
  const fromPricing = Array.isArray(pricing?.resolutionTiers) ? pricing.resolutionTiers.map((tier: any) => tier?.resolution || tier?.label || tier?.quality) : [];
  const values = [...fromCaps, ...fromPricing]
    .map(value => String(value || '').trim())
    .filter(Boolean);
  const unique = Array.from(new Set(values));
  return unique.length ? unique : ['720p'];
}

function videoTierMemberPrice(tier: any) {
  const value = Number(tier?.memberCreditsPerSecond ?? tier?.chargedCreditsPerSecond ?? tier?.creditsPerSecond ?? tier?.pricePerSecond);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function normalizeModelPricingFormValues(model: any) {
  const imageTierPrices = Object.fromEntries(IMAGE_PRICING_RESOLUTIONS.map((tier, index) => {
    const item = imagePricingTier(model, tier);
    const fallback = tier === '1K' ? Number(model.salePrice || 0) : undefined;
    return [tier, imageTierMemberPrice(item, index === 0 ? fallback : undefined)];
  }));
  const videoTierPrices = Object.fromEntries(videoPricingResolutionList(model).map(resolution => {
    const item = videoPricingTier(model, resolution);
    return [resolution, videoTierMemberPrice(item) ?? Number(model.pricePerSecond || 0)];
  }));
  return {
    type: model.type,
    unit: model.unit,
    salePrice: Number(model.salePrice || 0),
    costPrice: Number(model.costPrice || 0),
    pricePerSecond: Number(model.pricePerSecond || 0),
    imageTierPrices,
    videoTierPrices,
    inputPriceUsdPer1m: Number(model.inputPriceUsdPer1m || 0),
    outputPriceUsdPer1m: Number(model.outputPriceUsdPer1m || 0),
    cnyPerUsdCost: Number(model.cnyPerUsdCost || 0),
    creditsPerUsdCost: Number(model.creditsPerUsdCost || 0),
    markupRate: Number(model.markupRate || 1),
    status: model.status,
  };
}

function normalizeModelPricingSubmitValues(model: any, values: any) {
  const { imageTierPrices, videoTierPrices, ...rest } = values;
  const type = String(rest.type || model?.type || '').toUpperCase();
  if (type === 'IMAGE') return normalizeImagePricingSubmitValues(model, rest, imageTierPrices || {});
  if (type === 'VIDEO') return normalizeVideoPricingSubmitValues(model, rest, videoTierPrices || {});
  const memberCreditsPerUsdCost = Number(rest.creditsPerUsdCost || 0);
  const markupRate = Number(rest.markupRate || 1);
  const existingDefaults = model?.defaults && typeof model.defaults === 'object' && !Array.isArray(model.defaults) ? model.defaults : {};
  const existingPricing = existingDefaults.pricing && typeof existingDefaults.pricing === 'object' && !Array.isArray(existingDefaults.pricing) ? existingDefaults.pricing : {};
  return {
    type: rest.type,
    status: rest.status,
    unit: 'token_usd_ratio',
    inputPriceUsdPer1m: Number(rest.inputPriceUsdPer1m || 0),
    outputPriceUsdPer1m: Number(rest.outputPriceUsdPer1m || 0),
    cnyPerUsdCost: Number(rest.cnyPerUsdCost || 0),
    creditsPerUsdCost: memberCreditsPerUsdCost,
    markupRate,
    defaults: {
      ...existingDefaults,
      pricing: {
        ...existingPricing,
        unit: 'token_usd_ratio',
        currency: existingPricing.currency || 'credits',
        memberDiscountRate: 0.4,
        creditsPerUsdCost: memberCreditsPerUsdCost,
        memberCreditsPerUsdCost,
        originalCreditsPerUsdCost: memberOriginal(memberCreditsPerUsdCost),
        markupRate,
      },
    },
  };
}

function memberOriginal(member: number) {
  return Math.max(member, Math.ceil(member / 0.4));
}

function memberCost(member: number) {
  return Number((member * 0.7).toFixed(4));
}

function normalizeImagePricingSubmitValues(model: any, rest: any, imageTierPrices: Record<string, unknown>) {
  const tiers = IMAGE_PRICING_RESOLUTIONS
    .map(tier => ({ tier, value: Number(imageTierPrices[tier]) }))
    .filter(item => Number.isFinite(item.value) && item.value >= 0);
  const firstTier = tiers[0] || { tier: '1K', value: Number(rest.salePrice || 0) };
  const pricingTiers = tiers.map(item => ({
    tier: item.tier,
    chargedCredits: item.value,
    originalCredits: memberOriginal(item.value),
    costCredits: memberCost(item.value),
    grossMarginRate: 0.3,
  }));
  const existingDefaults = model?.defaults && typeof model.defaults === 'object' && !Array.isArray(model.defaults) ? model.defaults : {};
  const existingPricing = existingDefaults.pricing && typeof existingDefaults.pricing === 'object' && !Array.isArray(existingDefaults.pricing) ? existingDefaults.pricing : {};
  return {
    type: rest.type,
    status: rest.status,
    unit: 'image_resolution_tier',
    salePrice: firstTier.value,
    costPrice: memberCost(firstTier.value),
    defaults: {
      ...existingDefaults,
      pricing: {
        ...existingPricing,
        unit: 'image_resolution_tier',
        currency: existingPricing.currency || 'credits',
        memberDiscountRate: 0.4,
        tiers: pricingTiers,
      },
    },
  };
}

function normalizeVideoPricingSubmitValues(model: any, rest: any, videoTierPrices: Record<string, unknown>) {
  const members = videoPricingResolutionList(model)
    .map(resolution => ({ resolution, value: Number(videoTierPrices[resolution]) }))
    .filter(item => Number.isFinite(item.value) && item.value >= 0);
  if (!members.length) return rest;
  const resolutionTiers = members.map(item => ({
    resolution: item.resolution,
    chargedCreditsPerSecond: item.value,
    originalCreditsPerSecond: memberOriginal(item.value),
    costCreditsPerSecond: memberCost(item.value),
  }));
  const firstTier = resolutionTiers[0];
  const existingDefaults = model?.defaults && typeof model.defaults === 'object' && !Array.isArray(model.defaults) ? model.defaults : {};
  const existingPricing = existingDefaults.pricing && typeof existingDefaults.pricing === 'object' && !Array.isArray(existingDefaults.pricing) ? existingDefaults.pricing : {};
  return {
    type: rest.type,
    status: rest.status,
    unit: 'second',
    pricePerSecond: firstTier.chargedCreditsPerSecond,
    costPrice: firstTier.costCreditsPerSecond,
    defaults: {
      ...existingDefaults,
      pricing: {
        ...existingPricing,
        unit: 'second',
        currency: existingPricing.currency || 'credits',
        memberDiscountRate: 0.4,
        chargedCreditsPerSecond: firstTier.chargedCreditsPerSecond,
        originalCreditsPerSecond: firstTier.originalCreditsPerSecond,
        costCreditsPerSecond: firstTier.costCreditsPerSecond,
        resolutionTiers,
      },
    },
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
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
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

function AgentDashboard() {
  const [granularity, setGranularity] = useState<DashboardGranularity>('day');
  const [selectedMonth, setSelectedMonth] = useState(currentMonthValue());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedAgentId, setSelectedAgentId] = useState('all');
  const range = useMemo(() => dashboardDateRange(granularity, selectedMonth, selectedYear), [granularity, selectedMonth, selectedYear]);
  const dashboardPath = useMemo(() => {
    const params = new URLSearchParams({
      granularity,
      start: range.start,
      end: range.end,
      agentId: selectedAgentId,
    });
    return `/api/agent/dashboard?${params.toString()}`;
  }, [granularity, range.end, range.start, selectedAgentId]);
  const q = useQuery({ queryKey: ['agentDashboard', dashboardPath], queryFn: () => api<AgentDashboardApi>(dashboardPath) });
  const data = q.data;
  const summary = data?.creditSummary || emptyDashboardSummary;
  const team = data?.team;
  const agentBreakdown = data?.agentBreakdown || [];
  const selectedAgent = agentBreakdown.find(agent => agent.agentId === selectedAgentId);
  const rows = useMemo(() => buildDashboardRows(data?.series || [], granularity, selectedMonth, selectedYear), [data?.series, granularity, selectedMonth, selectedYear]);
  const agentOptions = useMemo(() => [
    { label: '全部团队', value: 'all' },
    ...agentBreakdown.map(agent => ({
      label: `${agent.agentName}${agent.ownerPhone ? ` (${agent.ownerPhone})` : ''}`,
      value: agent.agentId,
    })),
  ], [agentBreakdown]);
  const donutSegments = useMemo(() => [
    { label: '有收款入账', value: summary.paidRechargeCredits, color: '#2563eb' },
    { label: '未计收款入账', value: summary.creditOnlyRechargeCredits, color: '#06b6d4' },
    { label: '客户消耗', value: summary.consumeCredits, color: '#f97316' },
    { label: '下级配额', value: summary.agentQuotaCredits, color: '#7c3aed' },
  ], [summary.agentQuotaCredits, summary.consumeCredits, summary.creditOnlyRechargeCredits, summary.paidRechargeCredits]);
  const detailColumns = [
    { title: granularity === 'day' ? '日期' : '月份', dataIndex: 'period', width: 130, render: (value: string) => <span className="dashboardPeriodCell">{value}</span> },
    { title: '客户入账', dataIndex: 'rechargeCredits', render: (value: number) => formatNumber(value) },
    { title: '入账笔数', dataIndex: 'rechargeCount', render: (value: number) => formatNumber(value) },
    { title: '实收金额', dataIndex: 'rechargeAmountCents', render: (value: number) => formatYuanFromCents(value) },
    { title: '有收款积分', dataIndex: 'paidRechargeCredits', render: (value: number) => formatNumber(value) },
    { title: '未计收款积分', dataIndex: 'creditOnlyRechargeCredits', render: (value: number) => formatNumber(value) },
    { title: '客户消耗', dataIndex: 'consumeCredits', render: (value: number) => formatNumber(value) },
    { title: '消耗笔数', dataIndex: 'consumeCount', render: (value: number) => formatNumber(value) },
    { title: '下级配额', dataIndex: 'agentQuotaCredits', render: (value: number) => formatNumber(value) },
    { title: '净增积分', dataIndex: 'netCredits', render: (value: number) => <span className={value >= 0 ? 'dashboardPositive' : 'dashboardNegative'}>{formatNumber(value)}</span> },
  ];
  const agentColumns = [
    { title: '代理', dataIndex: 'agentName', width: 180, render: (_: string, row: DashboardAgentBreakdown) => <div className="dashboardAgentCell"><strong>{row.agentName}</strong><span>{row.ownerName || row.ownerPhone || '-'}</span></div> },
    { title: '客户数', dataIndex: 'customerCount', render: (value: number) => formatNumber(value) },
    { title: '客户入账', dataIndex: 'rechargeCredits', render: (value: number) => formatNumber(value) },
    { title: '实收金额', dataIndex: 'rechargeAmountCents', render: (value: number) => formatYuanFromCents(value) },
    { title: '有收款积分', dataIndex: 'paidRechargeCredits', render: (value: number) => formatNumber(value) },
    { title: '未计收款积分', dataIndex: 'creditOnlyRechargeCredits', render: (value: number) => formatNumber(value) },
    { title: '客户消耗', dataIndex: 'consumeCredits', render: (value: number) => formatNumber(value) },
    { title: '客户余额', dataIndex: 'walletBalance', render: (value: number) => formatNumber(value) },
    { title: '收到下级配额', dataIndex: 'agentQuotaCredits', render: (value: number) => formatNumber(value) },
    { title: '可用额度', dataIndex: 'availableCredits', render: (value: number) => formatNumber(value) },
    { title: '已用额度', dataIndex: 'usedCredits', render: (value: number) => formatNumber(value) },
    { title: '净增积分', dataIndex: 'netCredits', render: (value: number) => <span className={value >= 0 ? 'dashboardPositive' : 'dashboardNegative'}>{formatNumber(value)}</span> },
  ];
  const periodText = granularity === 'day' ? `${selectedMonth} 每日` : `${selectedYear} 每月`;
  const scopeText = selectedAgent ? `${selectedAgent.agentName} · ` : '';
  const account = team?.account || {};
  return (
    <Space direction="vertical" size={16} className="dashboardPage">
      <Card className="dashboardControlCard">
        <div className="dashboardControlHeader">
          <div>
            <h2>代理数据概览</h2>
            <p>{scopeText}{periodText}统计，仅展示当前代理团队权限范围内的数据</p>
          </div>
          <div className="dashboardControls">
            <Segmented
              value={granularity}
              options={[
                { label: '按日', value: 'day' },
                { label: '按月', value: 'month' },
              ]}
              onChange={value => setGranularity(value as DashboardGranularity)}
            />
            {granularity === 'day' ? (
              <DatePicker
                className="dashboardDateInput"
                picker="month"
                allowClear={false}
                value={dayjs(`${selectedMonth}-01`)}
                format="YYYY年MM月"
                onChange={value => setSelectedMonth(value ? value.format('YYYY-MM') : currentMonthValue())}
              />
            ) : (
              <DatePicker
                className="dashboardYearInput"
                picker="year"
                allowClear={false}
                value={dayjs(`${selectedYear}-01-01`)}
                format="YYYY年"
                onChange={value => setSelectedYear(value ? value.year() : new Date().getFullYear())}
              />
            )}
            <Select
              className="dashboardAgentSelect"
              value={selectedAgentId}
              options={agentOptions}
              showSearch
              optionFilterProp="label"
              onChange={setSelectedAgentId}
            />
          </div>
        </div>
      </Card>
      {q.error && <Alert type="error" showIcon message={q.error instanceof Error ? q.error.message : '代理数据概览加载失败'} />}
      <div className="dashboardMetricGrid">
        <DashboardMetric label="客户入账积分" value={summary.rechargeCredits} detail={`实收 ${formatYuanFromCents(summary.rechargeAmountCents)}，有收款 ${formatNumber(summary.paidRechargeCredits)}，未计收款 ${formatNumber(summary.creditOnlyRechargeCredits)}`} tone="blue" />
        <DashboardMetric label="客户消耗积分" value={summary.consumeCredits} detail={`${formatNumber(summary.consumeCount)} 笔消费流水`} tone="orange" />
        <DashboardMetric label="本期净增积分" value={summary.netCredits} detail="客户入账 + 下级配额 - 客户消耗" tone={summary.netCredits >= 0 ? 'green' : 'orange'} />
        <DashboardMetric label="给下级配额" value={summary.agentQuotaCredits} detail={`${formatNumber(summary.agentQuotaCount)} 笔下级代理配额`} tone="purple" />
        <DashboardMetric label={selectedAgent ? '该代理客户余额' : '团队客户余额'} value={Number((summary as any).walletBalance || team?.walletBalance || 0)} detail={`${formatNumber(selectedAgent ? selectedAgent.customerCount : team?.customerCount || 0)} 个客户`} tone="green" />
        <DashboardMetric label="我的可用额度" value={Number(account.availableCredits || 0)} detail={`冻结 ${formatNumber(Number(account.frozenCredits || 0))}，应收 ${formatNumber(Number(account.receivableCredits || 0))}`} tone="gray" />
        <DashboardMetric label="我的已用额度" value={Number(account.usedCredits || 0)} detail={`团队代理 ${formatNumber(team?.visibleAgentCount || 0)} 个`} tone="gray" />
        <DashboardMetric label="调用结果" value={data?.usages || 0} detail={`失败 ${formatNumber(data?.failedUsages || 0)}，待处理 ${formatNumber(data?.pendingUsages || 0)}`} tone="gray" />
      </div>
      <div className="dashboardChartGrid">
        <Card className="dashboardPanel" title="客户入账与消耗趋势" loading={q.isLoading && !data} extra={
          <div className="dashboardInlineLegend">
            <span><i className="legendRecharge" />入账</span>
            <span><i className="legendConsume" />消耗</span>
            <span><i className="legendQuota" />下级配额</span>
          </div>
        }>
          <DashboardBarChart rows={rows} showAgentQuota />
        </Card>
        <Card className="dashboardPanel" title="团队积分构成" loading={q.isLoading && !data}>
          <DashboardDonut segments={donutSegments} />
        </Card>
      </div>
      <Card className="dashboardPanel" title="团队代理入账 / 消耗 / 余额排行" loading={q.isLoading && !data} extra={
        <div className="dashboardInlineLegend">
          <span><i className="legendRecharge" />入账</span>
          <span><i className="legendConsume" />消耗</span>
          <span><i className="legendBalance" />客户余额</span>
        </div>
      }>
        <DashboardAgentBars agents={agentBreakdown} />
      </Card>
      <Card className="dashboardPanel" title="时间明细" extra={<span className="dashboardMuted">{periodText}明细</span>}>
        <Table<DashboardDetailRow>
          rowKey="key"
          loading={q.isLoading}
          dataSource={rows}
          columns={detailColumns}
          pagination={granularity === 'day' ? { pageSize: 10, showSizeChanger: false } : false}
          scroll={{ x: 1120 }}
        />
      </Card>
      <Card className="dashboardPanel" title="代理明细" extra={<span className="dashboardMuted">仅包含自己和可见下级代理</span>}>
        <Table<DashboardAgentBreakdown>
          rowKey="agentId"
          loading={q.isLoading}
          dataSource={agentBreakdown}
          columns={agentColumns}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          scroll={{ x: 1320 }}
        />
      </Card>
    </Space>
  );
}

function UserDashboard() {
  const [granularity, setGranularity] = useState<DashboardGranularity>('day');
  const [selectedMonth, setSelectedMonth] = useState(currentMonthValue());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const range = useMemo(() => dashboardDateRange(granularity, selectedMonth, selectedYear), [granularity, selectedMonth, selectedYear]);
  const dashboardPath = useMemo(() => {
    const params = new URLSearchParams({
      granularity,
      start: range.start,
      end: range.end,
    });
    return `/api/user/dashboard?${params.toString()}`;
  }, [granularity, range.end, range.start]);
  const q = useQuery({ queryKey: ['userDashboard', dashboardPath], queryFn: () => api<DashboardApi & { user: any }>(dashboardPath) });
  const data = q.data;
  const summary = data?.creditSummary || emptyDashboardSummary;
  const rows = useMemo(() => buildDashboardRows(data?.series || [], granularity, selectedMonth, selectedYear), [data?.series, granularity, selectedMonth, selectedYear]);
  const donutSegments = useMemo(() => [
    { label: '有收款入账', value: summary.paidRechargeCredits, color: '#2563eb' },
    { label: '未计收款入账', value: summary.creditOnlyRechargeCredits, color: '#06b6d4' },
    { label: '积分消耗', value: summary.consumeCredits, color: '#f97316' },
  ], [summary.consumeCredits, summary.creditOnlyRechargeCredits, summary.paidRechargeCredits]);
  const detailColumns = [
    { title: granularity === 'day' ? '日期' : '月份', dataIndex: 'period', width: 130, render: (value: string) => <span className="dashboardPeriodCell">{value}</span> },
    { title: '入账积分', dataIndex: 'rechargeCredits', render: (value: number) => formatNumber(value) },
    { title: '入账笔数', dataIndex: 'rechargeCount', render: (value: number) => formatNumber(value) },
    { title: '实收金额', dataIndex: 'rechargeAmountCents', render: (value: number) => formatYuanFromCents(value) },
    { title: '有收款积分', dataIndex: 'paidRechargeCredits', render: (value: number) => formatNumber(value) },
    { title: '未计收款积分', dataIndex: 'creditOnlyRechargeCredits', render: (value: number) => formatNumber(value) },
    { title: '消耗积分', dataIndex: 'consumeCredits', render: (value: number) => formatNumber(value) },
    { title: '消耗笔数', dataIndex: 'consumeCount', render: (value: number) => formatNumber(value) },
    { title: '净增积分', dataIndex: 'netCredits', render: (value: number) => <span className={value >= 0 ? 'dashboardPositive' : 'dashboardNegative'}>{formatNumber(value)}</span> },
  ];
  const periodText = granularity === 'day' ? `${selectedMonth} 每日` : `${selectedYear} 每月`;
  return (
    <Space direction="vertical" size={16} className="dashboardPage">
      <Card className="dashboardControlCard">
        <div className="dashboardControlHeader">
          <div>
            <h2>用户数据概览</h2>
            <p>{periodText}统计，仅展示当前登录账号自己的积分入账、消耗和余额</p>
          </div>
          <div className="dashboardControls">
            <Segmented
              value={granularity}
              options={[
                { label: '按日', value: 'day' },
                { label: '按月', value: 'month' },
              ]}
              onChange={value => setGranularity(value as DashboardGranularity)}
            />
            {granularity === 'day' ? (
              <DatePicker
                className="dashboardDateInput"
                picker="month"
                allowClear={false}
                value={dayjs(`${selectedMonth}-01`)}
                format="YYYY年MM月"
                onChange={value => setSelectedMonth(value ? value.format('YYYY-MM') : currentMonthValue())}
              />
            ) : (
              <DatePicker
                className="dashboardYearInput"
                picker="year"
                allowClear={false}
                value={dayjs(`${selectedYear}-01-01`)}
                format="YYYY年"
                onChange={value => setSelectedYear(value ? value.year() : new Date().getFullYear())}
              />
            )}
          </div>
        </div>
      </Card>
      {q.error && <Alert type="error" showIcon message={q.error instanceof Error ? q.error.message : '用户数据概览加载失败'} />}
      <div className="dashboardMetricGrid">
        <DashboardMetric label="本期入账积分" value={summary.rechargeCredits} detail={`实收 ${formatYuanFromCents(summary.rechargeAmountCents)}，有收款 ${formatNumber(summary.paidRechargeCredits)}，未计收款 ${formatNumber(summary.creditOnlyRechargeCredits)}`} tone="blue" />
        <DashboardMetric label="本期消耗积分" value={summary.consumeCredits} detail={`${formatNumber(summary.consumeCount)} 笔消费流水`} tone="orange" />
        <DashboardMetric label="本期净增积分" value={summary.netCredits} detail="入账 - 消耗" tone={summary.netCredits >= 0 ? 'green' : 'orange'} />
        <DashboardMetric label="当前余额" value={Number(summary.walletBalance || 0)} detail="当前账号可用积分" tone="green" />
        <DashboardMetric label="调用成功" value={data?.usages || 0} detail={`失败 ${formatNumber(data?.failedUsages || 0)}，待处理 ${formatNumber(data?.pendingUsages || 0)}`} tone="gray" />
        <DashboardMetric label="入账笔数" value={summary.rechargeCount} detail={`有收款 ${formatNumber(summary.paidRechargeCount)}，未计收款 ${formatNumber(summary.creditOnlyRechargeCount)}`} tone="gray" />
      </div>
      <div className="dashboardChartGrid">
        <Card className="dashboardPanel" title="入账与消耗趋势" loading={q.isLoading && !data} extra={
          <div className="dashboardInlineLegend">
            <span><i className="legendRecharge" />入账</span>
            <span><i className="legendConsume" />消耗</span>
          </div>
        }>
          <DashboardBarChart rows={rows} showAgentQuota={false} />
        </Card>
        <Card className="dashboardPanel" title="积分构成" loading={q.isLoading && !data}>
          <DashboardDonut segments={donutSegments} />
        </Card>
      </div>
      <Card className="dashboardPanel" title="时间明细" extra={<span className="dashboardMuted">{periodText}明细</span>}>
        <Table<DashboardDetailRow>
          rowKey="key"
          loading={q.isLoading}
          dataSource={rows}
          columns={detailColumns}
          pagination={granularity === 'day' ? { pageSize: 10, showSizeChanger: false } : false}
          scroll={{ x: 1120 }}
        />
      </Card>
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

function showGeneratedCodesModal(title: string, codes: string[] | string, options?: { apiDocs?: boolean; apiDocsScope?: 'personal' | 'enterprise'; copyLabel?: string }) {
  const list = Array.isArray(codes) ? codes.filter(Boolean) : [codes].filter(Boolean);
  if (list.length === 0) return;
  const text = list.join('\n');
  Modal.success({
    title,
    width: 680,
    content: (
      <div className="trialCodeBox">
        <Space style={{ marginBottom: 8 }} wrap>
          <b>新生成内容</b>
          <Button size="small" onClick={() => copyText(text)}>{options?.copyLabel || '复制全部'}</Button>
          {options?.apiDocs && <Button size="small" onClick={() => openApiDocs(options.apiDocsScope || 'personal')}>查看 API 对接文档</Button>}
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
      <Card title="客户积分充值与额度凭证" extra={<Space><AgentOfflineMembershipButton /><AgentDirectRechargeButton /><CreateAgentCreditVoucherButton />{summary.data?.agent?.level === 'FOUNDER' ? <GrantSubAgentCreditButton /> : null}<CreateAgentCreditGrantRequestButton /><CreateAgentVoucherRequestButton /></Space>}>
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

function AgentDirectRechargeButton() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const amountYuan = Form.useWatch('amountYuan', form);
  const qc = useQueryClient();
  const customers = useQuery({ queryKey: ['agentCustomers'], queryFn: () => api<ApiList<any>>('/api/agent/customers') });
  const m = useMutation({
    mutationFn: (values: any) => api<any>('/api/agent/credit/direct-recharge', {
      method: 'POST',
      body: JSON.stringify({
        userId: values.userId,
        credits: creditsFromYuan(values.amountYuan),
        amountCents: Math.round(Number(values.amountYuan || 0) * 100),
        transferChannel: values.transferChannel,
        transferNo: values.transferNo,
        proofImageUrl: values.proofImageUrl,
        remark: values.remark,
      }),
    }),
    onSuccess: data => {
      message.success(`客户积分已到账，当前余额 ${money(data.balance || 0)}`);
      setOpen(false);
      form.resetFields();
      ['agentCreditSummary', 'agentCreditLedger', 'myAgentReconciliationOrders', 'rechargeOrders', 'wallets'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    },
    onError: err => message.error(err instanceof Error ? err.message : '充值失败'),
  });
  useEffect(() => {
    form.setFieldValue('credits', creditsFromYuan(amountYuan));
  }, [amountYuan, form]);
  return (
    <>
      <Button type="primary" onClick={() => setOpen(true)}>直接充值积分</Button>
      <Modal title="代理直接给客户充值积分" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={m.isPending} width={680}>
        <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="提交后会立即扣减代理可用额度，并把积分直接加入客户钱包；无需客户再兑换码。" />
        <Form form={form} layout="vertical" onFinish={values => m.mutate(values)}>
          <Form.Item name="userId" label="绑定客户" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={(customers.data?.items || []).map((c: any) => ({ value: c.userId, label: `${c.customerName || c.user?.nickname || '客户'} ${c.customerPhone || c.user?.phone || ''}${c.agent?.name ? ` · ${c.agent.name}` : ''}` }))} />
          </Form.Item>
          <div className="formGrid2">
            <Form.Item name="amountYuan" label="线下实付金额" rules={[{ required: true, message: '请填写线下实付金额' }]}><InputNumber min={0.01} precision={2} addonAfter="元" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="credits" label={`到账积分（${OFFLINE_CREDITS_PER_CNY} 积分 / 元）`} rules={[{ required: true }]}><InputNumber min={1} precision={0} disabled style={{ width: '100%' }} /></Form.Item>
          </div>
          <div className="formGrid2">
            <Form.Item name="transferChannel" label="收款方式"><Input placeholder="微信 / 支付宝 / 银行卡" /></Form.Item>
            <Form.Item name="transferNo" label="转账流水号"><Input /></Form.Item>
          </div>
          <Form.Item name="proofImageUrl" label="付款凭证图片 URL"><Input /></Form.Item>
          <Form.Item name="remark" label="备注"><Input /></Form.Item>
        </Form>
      </Modal>
    </>
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
      message.success('兑换凭证已生成，客户兑换后积分到账');
      if (data.code) showGeneratedCodesModal('兑换凭证已生成', data.code);
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
      <Button onClick={() => { setCreatedCode(''); setOpen(true); }}>生成兑换凭证</Button>
      <Modal title="生成客户兑换凭证" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={m.isPending}>
        <Alert type="info" showIcon style={{ marginBottom: 16 }} message="这里只生成兑换码并冻结代理额度；客户在账号页兑换后，积分才会进入客户钱包。" />
        <Form form={form} layout="vertical" initialValues={{ validDays: 30 }} onFinish={values => m.mutate(values)}>
          <Form.Item name="userId" label="绑定客户" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={(customers.data?.items || []).map((c: any) => ({ value: c.userId, label: `${c.customerName || c.user?.nickname || '客户'} ${c.customerPhone || c.user?.phone || ''}${c.agent?.name ? ` · ${c.agent.name}` : ''}` }))} />
          </Form.Item>
          <div className="formGrid2">
            <Form.Item name="amountYuan" label="线下实付金额" rules={[{ required: true, message: '请填写线下实付金额' }]}><InputNumber min={0.01} precision={2} addonAfter="元" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="credits" label={`凭证额度（${OFFLINE_CREDITS_PER_CNY} 积分 / 元）`} rules={[{ required: true }]}><InputNumber min={1} precision={0} disabled style={{ width: '100%' }} /></Form.Item>
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

function EnterpriseConsole() {
  const me = useQuery({ queryKey: ['enterpriseMe'], queryFn: () => api<any>('/api/enterprise/auth/me') });
  const [page, setPage] = useState('overview');
  const items = [
    { key: 'overview', label: '数据概览' },
    { key: 'wallet', label: '积分额度' },
    { key: 'tasks', label: '任务生成列表' },
    { key: 'tokens', label: 'API Token' },
  ];
  const title = items.find(item => item.key === page)?.label || '企业后台';
  return (
    <Layout className="appShell">
      <Sider width={220} theme="light">
        <div className="brand">Enterprise</div>
        <Menu selectedKeys={[page]} mode="inline" items={items} onClick={e => setPage(e.key)} />
      </Sider>
      <Layout>
        <Header className="top">
          <div className="pageTitle">{title}</div>
          <Space>
            <span>{me.data?.enterprise?.name || me.data?.user?.nickname}</span>
            <Tag>{me.data?.user?.role || 'ENTERPRISE'}</Tag>
            <Button onClick={() => { clearToken(); location.reload(); }}>退出</Button>
          </Space>
        </Header>
        <Content className="content">
          {page === 'overview' && <EnterpriseOverview />}
          {page === 'wallet' && <EnterpriseWallet />}
          {page === 'tasks' && <EnterpriseTasks />}
          {page === 'tokens' && <EnterpriseTokens />}
        </Content>
      </Layout>
    </Layout>
  );
}

function EnterpriseOverview() {
  const q = useQuery({ queryKey: ['enterpriseSummary'], queryFn: () => api<any>('/api/enterprise/dashboard/summary') });
  const data = q.data?.data || {};
  return <div className="grid4">
    <Card><Statistic title="当前余额" value={data.balance || 0} suffix="积分" /></Card>
    <Card><Statistic title="累计消耗" value={data.totalConsumedCredits || 0} suffix="积分" /></Card>
    <Card><Statistic title="今日消耗" value={data.todayConsumedCredits || 0} suffix="积分" /></Card>
    <Card><Statistic title="本月消耗" value={data.monthConsumedCredits || 0} suffix="积分" /></Card>
    <Card><Statistic title="总任务" value={data.totalTasks || 0} /></Card>
    <Card><Statistic title="今日任务" value={data.todayTasks || 0} /></Card>
    <Card><Statistic title="成功任务" value={data.successTasks || 0} /></Card>
    <Card><Statistic title="失败任务" value={data.failedTasks || 0} /></Card>
  </div>;
}

function EnterpriseWallet() {
  const wallet = useQuery({ queryKey: ['enterpriseWallet'], queryFn: () => api<any>('/api/enterprise/wallet') });
  const logs = useQuery({ queryKey: ['enterpriseWalletLogs'], queryFn: () => api<ApiList<any>>('/api/enterprise/wallet/logs') });
  return <Space direction="vertical" size={16} style={{ width: '100%' }}>
    <div className="grid4"><Card><Statistic title="企业积分余额" value={wallet.data?.wallet?.balance || 0} suffix="积分" /></Card></div>
    <Card title="消耗与充值流水"><Table rowKey="id" loading={logs.isLoading} dataSource={apiListItems(logs.data)} columns={[
      { title: '类型', dataIndex: 'type' },
      { title: '金额', dataIndex: 'amount', render: money },
      { title: '前余额', dataIndex: 'balanceBefore', render: money },
      { title: '后余额', dataIndex: 'balanceAfter', render: money },
      { title: '备注', dataIndex: 'remark', ellipsis: true },
      { title: '时间', dataIndex: 'createdAt', render: dateTime },
    ]} /></Card>
  </Space>;
}

function EnterpriseTasks() {
  const [filters, setFilters] = useState({ status: '', type: '' });
  const q = useQuery({
    queryKey: ['enterpriseTasks', filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.type) params.set('type', filters.type);
      return api<ApiList<any>>(`/api/enterprise/generation/tasks?${params.toString()}`);
    },
  });
  return <Card title="企业生成任务">
    <Space style={{ marginBottom: 12 }} wrap>
      <Select allowClear placeholder="状态" style={{ width: 140 }} options={[{ value: 'SUCCESS', label: '成功' }, { value: 'FAILED', label: '失败' }, { value: 'RUNNING', label: '运行中' }, { value: 'PENDING', label: '等待中' }]} onChange={value => setFilters(prev => ({ ...prev, status: value || '' }))} />
      <Select allowClear placeholder="类型" style={{ width: 140 }} options={[{ value: 'IMAGE', label: '图片' }, { value: 'VIDEO', label: '视频' }]} onChange={value => setFilters(prev => ({ ...prev, type: value || '' }))} />
      <Button onClick={() => q.refetch()} loading={q.isFetching}>刷新</Button>
    </Space>
    <Table rowKey="id" loading={q.isLoading} dataSource={apiListItems(q.data)} scroll={{ x: 1200 }} columns={[
      { title: '提交时间', dataIndex: 'createdAt', width: 170, render: dateTime },
      { title: '类型', dataIndex: 'type', width: 100, render: (v, row: any) => <Tag color="blue">{generationTypeLabel(v, row.mode, row)}</Tag> },
      { title: '模型', width: 160, render: (_, row: any) => row.model?.displayName || row.model?.name || '-' },
      { title: '状态', dataIndex: 'status', width: 110, render: (v: string) => <GenerationStatus status={v} /> },
      { title: '进度', dataIndex: 'progress', width: 160, render: (v: number, row: any) => <Progress percent={progressValue(v, row.status)} size="small" status={row.status === 'FAILED' ? 'exception' : 'success'} /> },
      { title: '扣费', dataIndex: 'chargedCredits', width: 120, render: money },
      { title: '任务ID', dataIndex: 'upstreamTaskId', width: 260, ellipsis: true, render: (_, row: any) => row.upstreamTaskId || row.id },
      { title: '详情', width: 140, render: (_, row: any) => <EnterpriseTaskDetailButton id={row.id} /> },
    ]} />
  </Card>;
}

function EnterpriseTaskDetailButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ['enterpriseTaskDetail', id], queryFn: () => api<{ task: any }>(`/api/enterprise/generation/tasks/${id}`), enabled: open });
  return <>
    <Button type="link" size="small" onClick={() => setOpen(true)}>查看</Button>
    <Modal title="任务详情" open={open} footer={null} width="92vw" onCancel={() => setOpen(false)} destroyOnHidden>
      {q.isLoading ? <div style={{ padding: 24 }}>正在加载...</div> : <GenerationResultDetail task={q.data?.task || {}} urls={generationResultUrls(q.data?.task || {})} />}
    </Modal>
  </>;
}

function EnterpriseTokens() {
  const q = useQuery({ queryKey: ['enterpriseTokens'], queryFn: () => api<ApiList<any>>('/api/enterprise/api-tokens') });
  return <Card title="企业 API Token"><Table rowKey="id" loading={q.isLoading} dataSource={apiListItems(q.data)} columns={[
    { title: '名称', dataIndex: 'name' },
    { title: '前缀', dataIndex: 'tokenPrefix' },
    { title: '状态', dataIndex: 'status', render: (v) => <Tag color={v === 'ACTIVE' ? 'green' : 'red'}>{v}</Tag> },
    { title: '过期时间', dataIndex: 'expiredAt', render: dateTime },
    { title: '最近调用', dataIndex: 'lastUsedAt', render: dateTime },
    { title: '创建时间', dataIndex: 'createdAt', render: dateTime },
  ]} /></Card>;
}

function EnterpriseAccounts() {
  const q = useQuery({ queryKey: ['enterpriseAccounts'], queryFn: () => api<ApiList<any>>('/api/admin/enterprise/accounts') });
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const create = useMutation({
    mutationFn: (values: any) => api<any>('/api/admin/enterprise/accounts', { method: 'POST', body: JSON.stringify(values) }),
    onSuccess: data => {
      message.success('企业账号已创建');
      setOpen(false);
      form.resetFields();
      qc.invalidateQueries({ queryKey: ['enterpriseAccounts'] });
      if (data.initialPassword) showGeneratedCodesModal('企业管理员初始密码', data.initialPassword);
    },
    onError: err => message.error(err instanceof Error ? err.message : '创建失败'),
  });
  return <Card title="企业 API 管理" extra={<Space><Button onClick={() => openApiDocs('enterprise')}>查看企业 API 对接文档</Button><Button type="primary" onClick={() => setOpen(true)}>创建企业</Button></Space>}>
    <Alert type="info" showIcon style={{ marginBottom: 12 }} message="企业客户接入时，请先创建企业账号并充值，再创建企业 API Token；创建后可打开文档复制企业接口示例，将 ent_live_xxx 替换成真实 Token。" />
    <Table rowKey="id" loading={q.isLoading} dataSource={apiListItems(q.data)} scroll={{ x: 1400 }} columns={[
      { title: '企业名称', dataIndex: 'name', width: 180 },
      { title: '状态', dataIndex: 'status', width: 100, render: (v) => <Tag color={v === 'ACTIVE' ? 'green' : 'red'}>{v}</Tag> },
      { title: '余额', width: 120, render: (_, row: any) => money(row.billingUser?.wallet?.balance || 0) },
      { title: '企业用户', width: 220, render: (_, row: any) => (row.users || []).map((u: any) => u.nickname || u.email || u.phone).join(' / ') || '-' },
      { title: 'Token 数', width: 100, render: (_, row: any) => row.tokens?.length || 0 },
      { title: '备注', dataIndex: 'remark', ellipsis: true },
      { title: '创建时间', dataIndex: 'createdAt', width: 170, render: dateTime },
      { title: '操作', width: 320, render: (_, row: any) => <Space wrap><EnterpriseRechargeButton account={row} /><EnterpriseCreateTokenButton account={row} /><EnterpriseTokenManageButton account={row} /></Space> },
    ]} />
    <Modal title="创建企业账号" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={create.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" initialValues={{ adminNickname: '企业管理员' }} onFinish={values => create.mutate(values)}>
        <Form.Item name="name" label="企业名称" rules={[{ required: true }]}><Input /></Form.Item>
        <div className="formGrid2">
          <Form.Item name="adminEmail" label="管理员邮箱"><Input /></Form.Item>
          <Form.Item name="adminPhone" label="管理员手机号"><Input /></Form.Item>
        </div>
        <Form.Item name="adminNickname" label="管理员昵称" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="adminPassword" label="管理员密码" extra="留空时系统自动生成"><Input.Password /></Form.Item>
        <Form.Item name="remark" label="备注"><Input.TextArea rows={3} /></Form.Item>
      </Form>
    </Modal>
  </Card>;
}

function EnterpriseRechargeButton({ account }: { account: any }) {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (values: any) => api(`/api/admin/enterprise/accounts/${account.id}/recharge`, { method: 'POST', body: JSON.stringify({ amount: Number(values.amount || 0), remark: values.remark }) }),
    onSuccess: () => { message.success('企业积分已充值'); setOpen(false); form.resetFields(); qc.invalidateQueries({ queryKey: ['enterpriseAccounts'] }); },
    onError: err => message.error(err instanceof Error ? err.message : '充值失败'),
  });
  return <>
    <Button size="small" onClick={() => setOpen(true)}>充值</Button>
    <Modal title={`企业充值：${account.name}`} open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={m.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={values => m.mutate(values)}>
        <Form.Item name="amount" label="充值积分" rules={[{ required: true }]}><InputNumber min={1} precision={0} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="remark" label="备注"><Input /></Form.Item>
      </Form>
    </Modal>
  </>;
}

function EnterpriseCreateTokenButton({ account }: { account: any }) {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (values: any) => api<any>(`/api/admin/enterprise/accounts/${account.id}/tokens`, { method: 'POST', body: JSON.stringify({ name: values.name, expiredAt: values.expiredAt || null }) }),
    onSuccess: data => { message.success('企业 Token 已创建'); setOpen(false); form.resetFields(); qc.invalidateQueries({ queryKey: ['enterpriseAccounts'] }); showGeneratedCodesModal('企业 API Token（仅展示一次）', data.token?.plainToken || '', { apiDocs: true, apiDocsScope: 'enterprise', copyLabel: '复制企业 Token' }); },
    onError: err => message.error(err instanceof Error ? err.message : '创建失败'),
  });
  return <>
    <Button size="small" onClick={() => { form.setFieldsValue({ name: '生产环境 Token' }); setOpen(true); }}>创建 Token</Button>
    <Modal title={`创建企业 Token：${account.name}`} open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={m.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={values => m.mutate(values)}>
        <Form.Item name="name" label="Token 名称" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="expiredAt" label="过期时间 ISO，可留空"><Input placeholder="例如：2026-12-31T23:59:59.000Z" /></Form.Item>
      </Form>
    </Modal>
  </>;
}

function EnterpriseTokenManageButton({ account }: { account: any }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const disable = useMutation({
    mutationFn: (id: string) => api(`/api/admin/enterprise/tokens/${id}/disable`, { method: 'PATCH' }),
    onSuccess: () => { message.success('Token 已禁用'); qc.invalidateQueries({ queryKey: ['enterpriseAccounts'] }); },
    onError: err => message.error(err instanceof Error ? err.message : '禁用失败'),
  });
  return <>
    <Button size="small" onClick={() => setOpen(true)}>Token 列表</Button>
    <Modal title={`企业 Token：${account.name}`} open={open} footer={null} onCancel={() => setOpen(false)} width={820}>
      <Table rowKey="id" dataSource={account.tokens || []} pagination={false} columns={[
        { title: '名称', dataIndex: 'name' },
        { title: '前缀', dataIndex: 'tokenPrefix' },
        { title: '状态', dataIndex: 'status', render: (v) => <Tag color={v === 'ACTIVE' ? 'green' : 'red'}>{v}</Tag> },
        { title: '过期时间', dataIndex: 'expiredAt', render: dateTime },
        { title: '最近调用', dataIndex: 'lastUsedAt', render: dateTime },
        { title: '操作', render: (_, row: any) => <Space>
          {row.status === 'ACTIVE' ? <Popconfirm title="禁用该 Token？" onConfirm={() => disable.mutate(row.id)}><Button size="small" danger loading={disable.isPending}>禁用</Button></Popconfirm> : null}
          <Button size="small" onClick={() => copyText(row.tokenPrefix || '')}>复制前缀</Button>
        </Space> },
      ]} />
    </Modal>
  </>;
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
  const [mode, setMode] = useState<TokenMode>(getTokenMode());
  return <AntApp>{authed ? (mode === 'enterprise' ? <EnterpriseConsole /> : <Shell />) : <Login onDone={nextMode => { setMode(nextMode); setAuthed(true); }} />}</AntApp>;
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
