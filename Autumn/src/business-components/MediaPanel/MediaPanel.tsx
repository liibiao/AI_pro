import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Panel } from '../../components/Panel';
import {
  filterAssetLibraryItems,
  getAssignedAssetIds,
  summarizeAssetLibrary,
  type AssetLibraryTypeFilter,
} from '../../services/assets/assetLibrary';
import type { AssetItem, StoryboardElement } from '../../types/pipeline';
import { classNames } from '../../utils/classNames';

interface MediaPanelProps {
  assets: AssetItem[];
  storyboardElements?: StoryboardElement[];
  selectedAssetId?: string | null;
  onDeleteAsset?: (assetId: string) => void;
  onDeleteAssets?: (assetIds: string[]) => void;
  onSelectAsset?: (assetId: string) => void;
  onToggleFavorite?: (assetId: string) => void;
  onUploadFiles?: (files: File[]) => void;
}

const typeFilters: Array<{ id: AssetLibraryTypeFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'image', label: '图片' },
  { id: 'video', label: '视频' },
  { id: 'audio', label: '音频' },
  { id: 'document', label: '文档' },
];

function getAssetIcon(asset: AssetItem): string {
  if (asset.type === 'audio') {
    return '▥';
  }

  if (asset.type === 'video') {
    return '▶';
  }

  if (asset.type === 'document') {
    return '§';
  }

  return '▧';
}

function getAssetStatusLabel(asset: AssetItem): string {
  if (asset.status === 'completed') {
    return '已完成';
  }

  if (asset.status === 'running') {
    return typeof asset.progress === 'number' ? `${asset.progress}%` : '生成中';
  }

  if (asset.status === 'failed') {
    return '失败';
  }

  return '排队中';
}

function getAssetOriginLabel(asset: AssetItem): string {
  if (asset.origin === 'uploaded') {
    return '本地上传';
  }

  if (asset.origin === 'generated') {
    return '生成结果';
  }

  if (asset.origin === 'mock') {
    return '示例素材';
  }

  return asset.sourceUrl ? '外部链接' : '工作区';
}

function formatFileSize(fileSize?: number): string {
  if (!fileSize) {
    return '未知';
  }

  if (fileSize < 1024 * 1024) {
    return `${Math.max(1, Math.round(fileSize / 1024))} KB`;
  }

  return `${(fileSize / 1024 / 1024).toFixed(1)} MB`;
}

function formatAssetDate(createdAt?: string): string {
  if (!createdAt) {
    return '未记录';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(createdAt));
}

export function MediaPanel({
  assets,
  storyboardElements = [],
  selectedAssetId,
  onDeleteAsset,
  onDeleteAssets,
  onSelectAsset,
  onToggleFavorite,
  onUploadFiles,
}: MediaPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [typeFilter, setTypeFilter] = useState<AssetLibraryTypeFilter>('all');
  const [showUnassignedOnly, setShowUnassignedOnly] = useState(false);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedBatchAssetIds, setSelectedBatchAssetIds] = useState<string[]>([]);
  const assignedAssetIds = useMemo(
    () => getAssignedAssetIds(storyboardElements),
    [storyboardElements],
  );
  const summary = useMemo(
    () => summarizeAssetLibrary(assets, assignedAssetIds),
    [assets, assignedAssetIds],
  );
  const filteredAssets = useMemo(
    () =>
      filterAssetLibraryItems(
        assets,
        {
          type: typeFilter,
          assignment: showUnassignedOnly ? 'unassigned' : 'all',
          favorite: showFavoritesOnly ? 'favorite' : 'all',
        },
        assignedAssetIds,
      ),
    [assets, assignedAssetIds, showFavoritesOnly, showUnassignedOnly, typeFilter],
  );
  const selectedAsset =
    assets.find((asset) => asset.id === selectedAssetId) ?? filteredAssets[0] ?? assets[0];
  const selectedBatchCount = selectedBatchAssetIds.length;
  const allFilteredAssetsSelected =
    filteredAssets.length > 0 && filteredAssets.every((asset) => selectedBatchAssetIds.includes(asset.id));

  useEffect(() => {
    const existingAssetIds = new Set(assets.map((asset) => asset.id));
    setSelectedBatchAssetIds((assetIds) => assetIds.filter((assetId) => existingAssetIds.has(assetId)));
  }, [assets]);

  function openUploadPicker() {
    fileInputRef.current?.click();
  }

  function handleUploadChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);

    if (files.length > 0) {
      onUploadFiles?.(files);
    }

    event.currentTarget.value = '';
  }

  function toggleBatchAsset(assetId: string) {
    setSelectedBatchAssetIds((assetIds) =>
      assetIds.includes(assetId)
        ? assetIds.filter((selectedAssetId) => selectedAssetId !== assetId)
        : [...assetIds, assetId],
    );
  }

  function toggleAllFilteredAssets() {
    setSelectedBatchAssetIds((assetIds) => {
      if (allFilteredAssetsSelected) {
        const filteredAssetIds = new Set(filteredAssets.map((asset) => asset.id));
        return assetIds.filter((assetId) => !filteredAssetIds.has(assetId));
      }

      return Array.from(new Set([...assetIds, ...filteredAssets.map((asset) => asset.id)]));
    });
  }

  function deleteAssets(assetIds: string[]) {
    if (!assetIds.length) {
      return;
    }

    if (assetIds.length === 1) {
      onDeleteAsset?.(assetIds[0]!);
    } else if (onDeleteAssets) {
      onDeleteAssets(assetIds);
    } else {
      assetIds.forEach((assetId) => onDeleteAsset?.(assetId));
    }

    setSelectedBatchAssetIds((selectedAssetIds) =>
      selectedAssetIds.filter((assetId) => !assetIds.includes(assetId)),
    );
  }

  return (
    <Panel
      title="媒体文件"
      icon="▱"
      actions={
        <div className="media-panel-actions">
          <button className="media-upload-button" type="button" onClick={openUploadPicker}>
            上传
          </button>
          <label className="media-toggle">
            <input
              type="checkbox"
              checked={showUnassignedOnly}
              onChange={(event) => setShowUnassignedOnly(event.target.checked)}
            />
            <span className="toggle-dot" />
            <span>未分配</span>
          </label>
        </div>
      }
      className="media-panel"
    >
      <div className="media-library">
        <input
          accept="image/*,video/*,audio/*,.pdf,.txt,.md,.doc,.docx"
          className="media-upload-input"
          multiple
          onChange={handleUploadChange}
          ref={fileInputRef}
          type="file"
        />
        <div className="media-strip__header">
          <strong>已生成素材</strong>
          <span>{summary.total} files · {summary.unassigned} free · {summary.favorites} fav</span>
        </div>

        {assets.length > 0 ? (
          <div className="media-library__summary" aria-label="素材统计">
            <span>图片 {summary.byType.image}</span>
            <span>视频 {summary.byType.video}</span>
            <span>音频 {summary.byType.audio}</span>
            <span>生成中 {summary.byStatus.running}</span>
          </div>
        ) : null}

        {assets.length > 0 ? (
          <div className="media-filter-tabs" aria-label="素材类型">
            {typeFilters.map((filter) => (
              <button
                className={filter.id === typeFilter ? 'is-active' : undefined}
                key={filter.id}
                type="button"
                onClick={() => setTypeFilter(filter.id)}
              >
                {filter.label}
              </button>
            ))}
            <button
              className={showFavoritesOnly ? 'is-active' : undefined}
              type="button"
              onClick={() => setShowFavoritesOnly((value) => !value)}
            >
              收藏
            </button>
          </div>
        ) : null}

        {assets.length > 0 ? (
          <div className="media-batch-bar" aria-label="批量操作">
            <button type="button" onClick={toggleAllFilteredAssets}>
              {allFilteredAssetsSelected ? '取消全选' : '全选当前'}
            </button>
            <span>{selectedBatchCount} selected</span>
            <button
              disabled={selectedBatchCount === 0}
              type="button"
              onClick={() => deleteAssets(selectedBatchAssetIds)}
            >
              批量删除
            </button>
          </div>
        ) : null}

        {selectedAsset ? (
          <>
            <button
              className="media-preview-card"
              type="button"
              onClick={() => onSelectAsset?.(selectedAsset.id)}
            >
              <span
                className="media-preview-card__thumb"
                style={selectedAsset.thumbnail ? { background: selectedAsset.thumbnail } : undefined}
              >
                {getAssetIcon(selectedAsset)}
              </span>
              <span>
                <strong>{selectedAsset.name}</strong>
                <small>
                  {selectedAsset.type} · {getAssetStatusLabel(selectedAsset)} · {getAssetOriginLabel(selectedAsset)}
                </small>
              </span>
            </button>
            <div className="media-preview-actions">
              <button type="button" onClick={() => setShowDetails((value) => !value)}>
                {showDetails ? '收起详情' : '查看详情'}
              </button>
              <button
                className={selectedAsset.isFavorite ? 'is-active' : undefined}
                type="button"
                onClick={() => onToggleFavorite?.(selectedAsset.id)}
              >
                {selectedAsset.isFavorite ? '已收藏' : '收藏'}
              </button>
            </div>
            {showDetails ? (
              <section className="media-detail-drawer" aria-label="资产详情">
                <header>
                  <strong>资产详情</strong>
                  <span>{assignedAssetIds.has(selectedAsset.id) ? '已绑定' : '未分配'}</span>
                </header>
                <dl>
                  <div>
                    <dt>类型</dt>
                    <dd>{selectedAsset.type}</dd>
                  </div>
                  <div>
                    <dt>状态</dt>
                    <dd>{getAssetStatusLabel(selectedAsset)}</dd>
                  </div>
                  <div>
                    <dt>来源</dt>
                    <dd>{getAssetOriginLabel(selectedAsset)}</dd>
                  </div>
                  <div>
                    <dt>大小</dt>
                    <dd>{formatFileSize(selectedAsset.fileSize)}</dd>
                  </div>
                  <div>
                    <dt>创建</dt>
                    <dd>{formatAssetDate(selectedAsset.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>MIME</dt>
                    <dd>{selectedAsset.mimeType ?? '未记录'}</dd>
                  </div>
                </dl>
              </section>
            ) : null}
          </>
        ) : null}

        {assets.length === 0 ? (
          <div className="media-empty-flow">
            <span>暂无媒体文件</span>
            <button type="button" onClick={openUploadPicker}>+</button>
          </div>
        ) : null}

        {assets.length > 0 && filteredAssets.length === 0 ? (
          <div className="media-empty-flow media-empty-flow--compact">
            <span>无匹配素材</span>
          </div>
        ) : null}

        <div className="media-strip">
          {filteredAssets.map((asset) => (
            <article
              className={classNames(
                'media-card',
                selectedAssetId === asset.id && 'media-card--active',
                assignedAssetIds.has(asset.id) && 'media-card--assigned',
                asset.isFavorite && 'media-card--favorite',
                selectedBatchAssetIds.includes(asset.id) && 'media-card--checked',
              )}
              key={asset.id}
            >
              <button
                aria-label={
                  selectedBatchAssetIds.includes(asset.id) ? `取消选择 ${asset.name}` : `选择 ${asset.name}`
                }
                aria-pressed={selectedBatchAssetIds.includes(asset.id)}
                className="media-card__check"
                type="button"
                onClick={() => toggleBatchAsset(asset.id)}
              >
                {selectedBatchAssetIds.includes(asset.id) ? '✓' : '○'}
              </button>
              <button className="media-card__main" type="button" onClick={() => onSelectAsset?.(asset.id)}>
                <div
                  className="media-card__thumb"
                  style={asset.thumbnail ? { background: asset.thumbnail } : undefined}
                >
                  {getAssetIcon(asset)}
                  {typeof asset.progress === 'number' ? <strong>{asset.progress}%</strong> : null}
                </div>
                <span>{asset.name}</span>
                <small>
                  {assignedAssetIds.has(asset.id) ? '已绑定' : '未分配'} · {getAssetStatusLabel(asset)}
                </small>
              </button>
              <footer className="media-card__actions">
                <button
                  aria-label={asset.isFavorite ? `取消收藏 ${asset.name}` : `收藏 ${asset.name}`}
                  className={asset.isFavorite ? 'is-active' : undefined}
                  type="button"
                  onClick={() => onToggleFavorite?.(asset.id)}
                >
                  ☆
                </button>
                <button
                  aria-label={`删除 ${asset.name}`}
                  type="button"
                  onClick={() => deleteAssets([asset.id])}
                >
                  ⌫
                </button>
              </footer>
            </article>
          ))}
          {assets.length > 0 ? (
            <button className="media-card media-card--add" type="button" onClick={openUploadPicker}>
              +
            </button>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
