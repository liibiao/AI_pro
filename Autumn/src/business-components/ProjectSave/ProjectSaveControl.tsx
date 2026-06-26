import type {
  ProjectSaveStatus,
  ProjectSnapshot,
} from '../../types/project';
import {
  formatProjectSavedAt,
  getProjectLatestVersionLabel,
  getProjectSaveStatusLabel,
  getProjectSnapshotReasonLabel,
  sortProjectSnapshotsByVersionDesc,
} from '../../utils/projectSaveDisplay';

export interface ProjectSaveControlProps {
  status: ProjectSaveStatus;
  lastSavedAt?: string;
  error?: string | null;
  snapshots: ProjectSnapshot[];
  isLoadingSnapshots?: boolean;
  canSave: boolean;
  onManualSave: () => void;
}

export function ProjectSaveControl({
  status,
  lastSavedAt,
  error,
  snapshots,
  isLoadingSnapshots = false,
  canSave,
  onManualSave,
}: ProjectSaveControlProps) {
  const sortedSnapshots = sortProjectSnapshotsByVersionDesc(snapshots);
  const statusLabel = getProjectSaveStatusLabel(status, lastSavedAt);
  const versionLabel = getProjectLatestVersionLabel(snapshots);
  const canManualSave = canSave && status !== 'saving';

  return (
    <details className="project-save-control">
      <summary title="保存与版本">
        <span className={`project-save-dot project-save-dot--${status}`} />
        <span className="project-save-control__status">{statusLabel}</span>
        <strong>{versionLabel}</strong>
      </summary>

      <div className="project-save-menu">
        <div className="project-save-menu__actions">
          <button disabled={!canManualSave} onClick={onManualSave} type="button">
            {status === 'saving' ? '保存中' : '立即保存'}
          </button>
          <span>{versionLabel}</span>
        </div>

        {error ? <p className="project-save-error">{error}</p> : null}

        <span className="project-save-menu__label">版本记录</span>
        {isLoadingSnapshots ? <p className="project-save-empty">加载中</p> : null}
        {!isLoadingSnapshots && sortedSnapshots.length === 0 ? (
          <p className="project-save-empty">暂无版本</p>
        ) : null}
        {!isLoadingSnapshots
          ? sortedSnapshots.map((snapshot) => (
              <article className="project-save-version" key={snapshot.id}>
                <strong>v{snapshot.version}</strong>
                <span>{getProjectSnapshotReasonLabel(snapshot.reason)}</span>
                <time dateTime={snapshot.savedAt}>{formatProjectSavedAt(snapshot.savedAt)}</time>
              </article>
            ))
          : null}
      </div>
    </details>
  );
}
