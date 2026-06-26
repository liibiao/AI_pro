import type { AgentPackage } from '../../types/agentPackage';

interface AgentPackageSwitcherProps {
  activePackage?: AgentPackage;
  packages: AgentPackage[];
  backendImportCandidate?: AgentPackage;
  importError?: string | null;
  isImportingLocal?: boolean;
  onSwitchPackage: (packageId: string) => void;
  onImportBackendPackage: () => void;
  onImportLocalPackage: (file: File) => void;
}

function getScopeLabel(agentPackage: AgentPackage) {
  return agentPackage.storageScope === 'device' ? '本设备' : '账号';
}

export function AgentPackageSwitcher({
  activePackage,
  packages,
  backendImportCandidate,
  importError,
  isImportingLocal,
  onSwitchPackage,
  onImportBackendPackage,
  onImportLocalPackage,
}: AgentPackageSwitcherProps) {
  return (
    <details className="agent-package-switcher">
      <summary>
        <span>Agent包</span>
        <strong>{activePackage?.name ?? '未选择'}</strong>
      </summary>

      <div className="agent-package-menu">
        <div className="agent-package-menu__section">
          <span className="agent-package-menu__label">已导入数据包</span>
          {packages.map((agentPackage) => (
            <button
              className={
                activePackage?.id === agentPackage.id
                  ? 'agent-package-option agent-package-option--active'
                  : 'agent-package-option'
              }
              key={agentPackage.id}
              onClick={() => onSwitchPackage(agentPackage.id)}
              type="button"
            >
              <strong>{agentPackage.name}</strong>
              <span>
                v{agentPackage.version} | {agentPackage.source === 'backend' ? '后台导入' : '本地导入'} |{' '}
                {getScopeLabel(agentPackage)}
              </span>
              {agentPackage.storageScope === 'device' ? (
                <small>仅当前设备可用，不同步到账号云端</small>
              ) : null}
            </button>
          ))}
        </div>

        <div className="agent-package-menu__actions">
          <button disabled={!backendImportCandidate} onClick={onImportBackendPackage} type="button">
            导入后台数据包
          </button>
          <label className="agent-package-upload">
            {isImportingLocal ? '导入中...' : '本地导入 JSON'}
            <input
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) {
                  onImportLocalPackage(file);
                }
                event.currentTarget.value = '';
              }}
              type="file"
            />
          </label>
        </div>

        {backendImportCandidate ? (
          <p className="agent-package-hint">
            可从后台导入：{backendImportCandidate.name}。后台包属于账号资源，可多设备同步。
          </p>
        ) : null}
        <p className="agent-package-hint">本地导入的数据包只保存在当前浏览器设备，不会上传后台。</p>
        {importError ? <p className="agent-package-error">{importError}</p> : null}
      </div>
    </details>
  );
}

