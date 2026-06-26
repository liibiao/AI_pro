import { useEffect, useState, type FormEvent } from 'react';
import { mapPlatformAuthSession } from '../../adapters/auth/mapUserProfile';
import {
  loginPlatformAccount,
  registerPlatformAccount,
} from '../../api/auth/authApi';
import type { AuthSession, UserProfile } from '../../types/user';
import { formatCreditBalance, formatUserPlan } from '../../utils/userDisplay';

export type AuthDialogMode = 'login' | 'register' | 'forgot';

interface AuthDialogProps {
  isAuthenticated: boolean;
  mode: AuthDialogMode;
  open: boolean;
  userProfile?: UserProfile | null;
  onAuthenticated: (session: AuthSession) => void;
  onClose: () => void;
  onModeChange: (mode: AuthDialogMode) => void;
  onSignOut: () => void;
}

function getModeTitle(mode: AuthDialogMode): string {
  if (mode === 'register') {
    return '创建账号';
  }

  if (mode === 'forgot') {
    return '找回密码';
  }

  return '登录账号';
}

function getModeSubtitle(mode: AuthDialogMode): string {
  if (mode === 'register') {
    return '创建后台账号，开始同步创作资产。';
  }

  if (mode === 'forgot') {
    return '提交账号信息，等待密码重置。';
  }

  return '使用后台账号进入 Autumn 工作台。';
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '账号请求失败，请稍后重试。';
}

export function AuthDialog({
  isAuthenticated,
  mode,
  open,
  userProfile,
  onAuthenticated,
  onClose,
  onModeChange,
  onSignOut,
}: AuthDialogProps) {
  const [account, setAccount] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetAccount, setResetAccount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setError(null);
    setMessage(null);
  }, [mode, open]);

  if (!open) {
    return null;
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedAccount = account.trim();

    if (!trimmedAccount || !password) {
      setError('请输入账号和密码。');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await loginPlatformAccount(trimmedAccount, password);
      onAuthenticated(mapPlatformAuthSession(response));
      setMessage('登录成功，正在同步后台账号信息。');
      onClose();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedAccount = account.trim();

    if (!trimmedAccount || !password) {
      setError('请输入账号和密码。');
      return;
    }

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致。');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await registerPlatformAccount({
        account: trimmedAccount,
        nickname: nickname.trim() || trimmedAccount,
        password,
      });
      onAuthenticated(mapPlatformAuthSession(response));
      setMessage('注册成功，已登录。');
      onClose();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  }

  function submitForgot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!resetAccount.trim()) {
      setError('请输入需要找回的手机号或邮箱。');
      return;
    }

    setError(null);
    setMessage('找回申请已记录。当前后台未开放自助重置接口，请联系管理员完成密码重置。');
  }

  return (
    <div className="auth-overlay" role="presentation">
      <section className="auth-dialog" aria-label={getModeTitle(mode)} role="dialog" aria-modal="true">
        <button className="auth-dialog__close" onClick={onClose} type="button" aria-label="关闭账号面板">
          ×
        </button>
        <div className="auth-dialog__visual" aria-hidden="true">
          <div className="auth-orbit">
            <span />
            <span />
            <span />
          </div>
          <strong>Autumn.ai</strong>
          <p>后台账号中心</p>
        </div>

        <div className="auth-dialog__content">
          {isAuthenticated ? (
            <div className="auth-profile-panel">
              <span className="auth-profile-avatar" />
              <div>
                <span className="auth-eyebrow">当前账号</span>
                <h2>{userProfile?.displayName ?? 'Autumn Creator'}</h2>
                <p>已连接后台管理系统，可使用已启用模型与 Agent 能力。</p>
              </div>
              <div className="auth-profile-stats">
                <span>
                  <small>积分余额</small>
                  <strong>{formatCreditBalance(userProfile?.creditBalance, 0)}</strong>
                </span>
                <span>
                  <small>套餐</small>
                  <strong>{formatUserPlan(userProfile?.plan, 'Free')}</strong>
                </span>
              </div>
              <button className="auth-submit auth-submit--secondary" onClick={onSignOut} type="button">
                退出登录
              </button>
            </div>
          ) : (
            <>
              <div className="auth-dialog__heading">
                <span className="auth-eyebrow">账号中心</span>
                <h2>{getModeTitle(mode)}</h2>
                <p>{getModeSubtitle(mode)}</p>
              </div>

              <div className="auth-mode-tabs" role="tablist" aria-label="账号操作">
                <button
                  className={mode === 'login' ? 'auth-mode-tab auth-mode-tab--active' : 'auth-mode-tab'}
                  onClick={() => onModeChange('login')}
                  type="button"
                >
                  登录
                </button>
                <button
                  className={mode === 'register' ? 'auth-mode-tab auth-mode-tab--active' : 'auth-mode-tab'}
                  onClick={() => onModeChange('register')}
                  type="button"
                >
                  注册
                </button>
                <button
                  className={mode === 'forgot' ? 'auth-mode-tab auth-mode-tab--active' : 'auth-mode-tab'}
                  onClick={() => onModeChange('forgot')}
                  type="button"
                >
                  忘记密码
                </button>
              </div>

              {mode === 'forgot' ? (
                <form className="auth-form" onSubmit={submitForgot}>
                  <label>
                    <span>手机号 / 邮箱</span>
                    <input
                      autoComplete="username"
                      inputMode="email"
                      onChange={(event) => setResetAccount(event.target.value)}
                      placeholder="输入注册手机号或邮箱"
                      value={resetAccount}
                    />
                  </label>
                  <button className="auth-submit" type="submit">
                    提交找回申请
                  </button>
                </form>
              ) : (
                <form className="auth-form" onSubmit={mode === 'login' ? submitLogin : submitRegister}>
                  <label>
                    <span>手机号 / 邮箱</span>
                    <input
                      autoComplete="username"
                      inputMode="email"
                      onChange={(event) => setAccount(event.target.value)}
                      placeholder="输入后台账号"
                      value={account}
                    />
                  </label>
                  {mode === 'register' ? (
                    <label>
                      <span>昵称</span>
                      <input
                        autoComplete="nickname"
                        onChange={(event) => setNickname(event.target.value)}
                        placeholder="创作者昵称"
                        value={nickname}
                      />
                    </label>
                  ) : null}
                  <label>
                    <span>密码</span>
                    <input
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="输入密码"
                      type="password"
                      value={password}
                    />
                  </label>
                  {mode === 'register' ? (
                    <label>
                      <span>确认密码</span>
                      <input
                        autoComplete="new-password"
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        placeholder="再次输入密码"
                        type="password"
                        value={confirmPassword}
                      />
                    </label>
                  ) : null}
                  <button className="auth-submit" disabled={isSubmitting} type="submit">
                    {isSubmitting ? '处理中...' : mode === 'login' ? '登录并连接后台' : '注册并登录'}
                  </button>
                </form>
              )}

              {error ? <div className="auth-status auth-status--error">{error}</div> : null}
              {message ? <div className="auth-status auth-status--success">{message}</div> : null}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
