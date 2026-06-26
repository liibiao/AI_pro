import type { SkillLibraryItem } from '../../types/skillLibrary';

interface SkillLibrarySwitcherProps {
  skills: SkillLibraryItem[];
  enabledSkillIds: string[];
  backendImportCandidate?: SkillLibraryItem;
  importError?: string | null;
  isImportingLocal?: boolean;
  onToggleSkill: (skillId: string) => void;
  onImportBackendSkill: () => void;
  onImportLocalSkill: (file: File) => void;
}

function getSourceLabel(skill: SkillLibraryItem) {
  if (skill.source === 'agentPackage') {
    return '数据包内置';
  }

  return skill.source === 'backend' ? '后台导入' : '本地导入';
}

function getScopeLabel(skill: SkillLibraryItem) {
  return skill.storageScope === 'device' ? '本设备' : '账号';
}

export function SkillLibrarySwitcher({
  skills,
  enabledSkillIds,
  backendImportCandidate,
  importError,
  isImportingLocal,
  onToggleSkill,
  onImportBackendSkill,
  onImportLocalSkill,
}: SkillLibrarySwitcherProps) {
  return (
    <details className="skill-library-switcher">
      <summary>
        <span>Skill库</span>
        <strong>{enabledSkillIds.length} 启用</strong>
      </summary>

      <div className="skill-library-menu">
        <span className="skill-library-menu__label">项目可用 Skill</span>

        <div className="skill-list">
          {skills.map((skill) => {
            const enabled = enabledSkillIds.includes(skill.id);

            return (
              <button
                className={enabled ? 'skill-item skill-item--enabled' : 'skill-item'}
                key={skill.id}
                onClick={() => onToggleSkill(skill.id)}
                type="button"
              >
                <span className="skill-item__switch">{enabled ? '启用' : '停用'}</span>
                <strong>{skill.name}</strong>
                <span>
                  v{skill.version} | {getSourceLabel(skill)} | {getScopeLabel(skill)}
                </span>
                <small>{skill.description}</small>
                {skill.storageScope === 'device' ? (
                  <small>仅当前设备可用，不同步到账号云端</small>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="skill-library-actions">
          <button disabled={!backendImportCandidate} onClick={onImportBackendSkill} type="button">
            导入后台 Skill
          </button>
          <label className="skill-upload">
            {isImportingLocal ? '导入中...' : '本地导入 Skill'}
            <input
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) {
                  onImportLocalSkill(file);
                }
                event.currentTarget.value = '';
              }}
              type="file"
            />
          </label>
        </div>

        {backendImportCandidate ? (
          <p className="skill-library-hint">
            可从后台导入：{backendImportCandidate.name}。后台 Skill 属于账号资源，可多设备同步。
          </p>
        ) : null}
        <p className="skill-library-hint">本地导入 Skill 只保存在当前浏览器设备，不会上传后台。</p>
        {importError ? <p className="skill-library-error">{importError}</p> : null}
      </div>
    </details>
  );
}

