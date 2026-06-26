import { BrandMark } from '../../components/BrandMark';
import type { AuthDialogMode } from '../../business-components/Auth/AuthDialog';
import type { ThemeMode } from '../../types/pipeline';
import type { ProjectListItem } from '../../types/project';
import type { UserProfile } from '../../types/user';
import { formatCreditBalance, formatUserPlan } from '../../utils/userDisplay';

interface HomePageProps {
  isAuthenticated?: boolean;
  projects: ProjectListItem[];
  theme: ThemeMode;
  userProfile?: UserProfile | null;
  onCreateProject: () => void;
  onOpenAuth: (mode?: AuthDialogMode) => void;
  onOpenProject: (project: ProjectListItem) => void;
  onThemeChange: (theme: ThemeMode) => void;
}

const navItems = [
  { label: '项目', icon: '▰' },
  {
    href: 'http://124.156.137.236/image-studio-canvas-next.html',
    label: 'Autumn TV',
    icon: '▣',
  },
  { label: 'Agent/Skill', icon: '⌘' },
  { label: '元素库', icon: '▧' },
  { label: '教程', icon: '☰' },
];

export function HomePage({
  isAuthenticated = false,
  projects = [],
  theme,
  userProfile,
  onCreateProject,
  onOpenAuth,
  onOpenProject,
  onThemeChange,
}: HomePageProps) {
  const avatarStyle = userProfile?.avatarUrl
    ? {
        backgroundImage: `url(${userProfile.avatarUrl})`,
        backgroundPosition: 'center',
        backgroundSize: 'cover',
      }
    : undefined;
  const avatarLabel = userProfile?.displayName
    ? `${userProfile.displayName} 用户头像`
    : '用户头像';

  return (
    <div className="app home-app" data-theme={theme}>
      <header className="home-topbar">
          <div className="home-title">
            <BrandMark />
            <span className="topbar__divider" />
            <strong>项目</strong>
          </div>
          <div className="home-actions">
            <button className="stage-pill home-event-pill" type="button">
              <span>✦</span> 世界杯挑战赛让「灵感上场」
            </button>
            <button
              className="icon-pill home-theme-toggle"
              onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
              type="button"
            >
              {theme === 'dark' ? '夜' : '昼'}
            </button>
            <span className="credit-pill credit-pill--balance">
              <span>▣</span>
              {formatCreditBalance(userProfile?.creditBalance)}
            </span>
            <span className="credit-pill credit-pill--pro">
              <span>◆</span>
              {formatUserPlan(userProfile?.plan)}
            </span>
            <button
              className={isAuthenticated ? 'auth-entry-button auth-entry-button--signed-in' : 'auth-entry-button'}
              onClick={() => onOpenAuth(isAuthenticated ? 'login' : 'login')}
              type="button"
            >
              <span className="user-avatar" aria-label={avatarLabel} style={avatarStyle} />
              <span>{isAuthenticated ? userProfile?.displayName ?? '账号' : '登录 / 注册'}</span>
            </button>
          </div>
      </header>

      <aside className="home-sidebar" aria-label="主导航">
        {navItems.map((item) => (
          item.href ? (
            <a className="home-nav" href={item.href} key={item.label}>
              <span className="home-nav__icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </a>
          ) : (
            <button
              className={item.label === '项目' ? 'home-nav home-nav--active' : 'home-nav'}
              key={item.label}
              type="button"
            >
            <span className="home-nav__icon" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
            </button>
          )
        ))}
      </aside>

      <main className="home-main">

        <section className="home-project-shell" aria-label="项目列表">
          <div className="project-grid project-grid--create-only">
            <button className="project-card project-card--create" onClick={onCreateProject} type="button">
              <span className="project-card__create-thumb">
                <span className="project-card__plus">+</span>
                <strong>创建新项目</strong>
              </span>
              <strong>新建项目</strong>
              <span>开启您的创作之旅</span>
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
