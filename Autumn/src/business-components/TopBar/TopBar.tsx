import type { PipelineStage, ThemeMode, WorkspacePanel } from '../../types/pipeline';
import type { AgentPackage } from '../../types/agentPackage';
import type { SkillLibraryItem } from '../../types/skillLibrary';
import type { AuthDialogMode } from '../Auth/AuthDialog';
import type { UserProfile } from '../../types/user';
import { AgentPackageSwitcher } from '../AgentPackageSwitcher/AgentPackageSwitcher';
import { SkillLibrarySwitcher } from '../SkillLibrary/SkillLibrarySwitcher';
import { BrandMark } from '../../components/BrandMark';
import { ToolbarButton } from '../../components/ToolbarButton';
import {
  ProjectSaveControl,
  type ProjectSaveControlProps,
} from '../ProjectSave/ProjectSaveControl';
import {
  ProjectExportControl,
  type ProjectExportControlProps,
} from '../ProjectExport/ProjectExportControl';
import { formatUserPlan } from '../../utils/userDisplay';

interface TopBarProps {
  projectTitle: string;
  openPanels: WorkspacePanel[];
  theme: ThemeMode;
  creditBalance: number;
  isAuthenticated?: boolean;
  userProfile?: UserProfile | null;
  activeAgentPackage?: AgentPackage;
  agentPackages: AgentPackage[];
  backendImportCandidate?: AgentPackage;
  agentPackageImportError?: string | null;
  isImportingLocalAgentPackage?: boolean;
  skills: SkillLibraryItem[];
  enabledSkillIds: string[];
  backendSkillImportCandidate?: SkillLibraryItem;
  skillImportError?: string | null;
  isImportingLocalSkill?: boolean;
  onBackToHome?: () => void;
  onSwitchAgentPackage: (packageId: string) => void;
  onImportBackendAgentPackage: () => void;
  onImportLocalAgentPackage: (file: File) => void;
  onToggleSkill: (skillId: string) => void;
  onImportBackendSkill: () => void;
  onImportLocalSkill: (file: File) => void;
  onOpenAuth?: (mode?: AuthDialogMode) => void;
  onTogglePanel: (panel: WorkspacePanel) => void;
  onThemeChange: (theme: ThemeMode) => void;
  projectExport?: ProjectExportControlProps;
  projectSave?: ProjectSaveControlProps;
  stage: PipelineStage;
}

export function TopBar({
  projectTitle,
  openPanels,
  theme,
  creditBalance,
  isAuthenticated = false,
  userProfile,
  activeAgentPackage,
  agentPackages,
  backendImportCandidate,
  agentPackageImportError,
  isImportingLocalAgentPackage,
  skills,
  enabledSkillIds,
  backendSkillImportCandidate,
  skillImportError,
  isImportingLocalSkill,
  onBackToHome,
  onSwitchAgentPackage,
  onImportBackendAgentPackage,
  onImportLocalAgentPackage,
  onToggleSkill,
  onImportBackendSkill,
  onImportLocalSkill,
  onOpenAuth,
  onTogglePanel,
  onThemeChange,
  projectExport,
  projectSave,
  stage,
}: TopBarProps) {
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
    <header className="topbar">
      <div className="topbar__left">
        {onBackToHome ? (
          <button className="topbar__brand-button" onClick={onBackToHome} title="返回项目列表" type="button">
            <BrandMark />
          </button>
        ) : (
          <BrandMark />
        )}
        <span className="topbar__divider" />
        <strong className="topbar__project">{projectTitle}</strong>
        <nav className="topbar__tools" aria-label="工作区面板">
          <ToolbarButton
            active={openPanels.includes('storyboard')}
            icon="▦"
            onClick={() => onTogglePanel('storyboard')}
          >
            故事板
          </ToolbarButton>
          <ToolbarButton
            active={openPanels.includes('media')}
            icon="▱"
            onClick={() => onTogglePanel('media')}
          >
            媒体文件
          </ToolbarButton>
          <ToolbarButton
            active={openPanels.includes('timeline')}
            icon="✂"
            onClick={() => onTogglePanel('timeline')}
          >
            时间线
          </ToolbarButton>
          <ToolbarButton
            active={openPanels.includes('document')}
            icon="▤"
            onClick={() => onTogglePanel('document')}
          >
            文档
          </ToolbarButton>
        </nav>
      </div>
      <div className="topbar__right">
        <AgentPackageSwitcher
          activePackage={activeAgentPackage}
          backendImportCandidate={backendImportCandidate}
          importError={agentPackageImportError}
          isImportingLocal={isImportingLocalAgentPackage}
          onImportBackendPackage={onImportBackendAgentPackage}
          onImportLocalPackage={onImportLocalAgentPackage}
          onSwitchPackage={onSwitchAgentPackage}
          packages={agentPackages}
        />
        <SkillLibrarySwitcher
          backendImportCandidate={backendSkillImportCandidate}
          enabledSkillIds={enabledSkillIds}
          importError={skillImportError}
          isImportingLocal={isImportingLocalSkill}
          onImportBackendSkill={onImportBackendSkill}
          onImportLocalSkill={onImportLocalSkill}
          onToggleSkill={onToggleSkill}
          skills={skills}
        />
        {projectSave ? <ProjectSaveControl {...projectSave} /> : null}
        <span className="stage-pill">{stage}</span>
        <button
          className="icon-pill"
          onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
          title="切换主题"
          type="button"
        >
          {theme === 'dark' ? '夜' : '昼'}
        </button>
        {projectExport ? <ProjectExportControl {...projectExport} /> : null}
        <span className="credit-pill"><span>🎞</span>{creditBalance}</span>
        <span className="credit-pill">{formatUserPlan(userProfile?.plan, 'Free')}</span>
        <button
          className={isAuthenticated ? 'auth-entry-button auth-entry-button--compact auth-entry-button--signed-in' : 'auth-entry-button auth-entry-button--compact'}
          onClick={() => onOpenAuth?.('login')}
          type="button"
        >
          <span className="user-avatar" aria-label={avatarLabel} style={avatarStyle} />
          <span>{isAuthenticated ? userProfile?.displayName ?? '账号' : '登录'}</span>
        </button>
      </div>
    </header>
  );
}
