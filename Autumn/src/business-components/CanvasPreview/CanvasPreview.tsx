import { EmptyState } from '../../components/EmptyState';
import { Panel } from '../../components/Panel';
import { CreateClapperMark } from '../../components/CreateClapperMark';
import type { AssetItem, ProductionWorkspaceState, StoryboardElement } from '../../types/pipeline';

interface CanvasPreviewProps {
  workspaceState: ProductionWorkspaceState;
  selectedElement: StoryboardElement;
  assets: AssetItem[];
  selectedAsset?: AssetItem;
  emptyPreview?: boolean;
}

export function CanvasPreview({
  workspaceState,
  selectedElement,
  assets,
  selectedAsset,
  emptyPreview = false,
}: CanvasPreviewProps) {
  const activeAsset = selectedAsset ?? selectedElement.assets[0] ?? assets[0];
  const isAudio = workspaceState === 'audioPreview';
  const isVideo = workspaceState === 'shotVideoGenerating' || workspaceState === 'timelinePreview';
  const isShotScript = workspaceState === 'shotScriptCard';
  const isStoryboardOverview = workspaceState === 'storyboardOverview';
  const isLoading =
    activeAsset?.status === 'running' && !isVideo && !isShotScript;
  const videoProgress = activeAsset?.progress ?? selectedElement.progress ?? 65;
  const shotScriptAsset = assets.find((asset) => asset.id === 'asset-fortress-img') ?? activeAsset;
  const getAssetBackground = (asset?: AssetItem) => asset?.thumbnail
    ? {
        background: `linear-gradient(180deg, rgba(7, 9, 12, 0.02), rgba(7, 9, 12, 0.56)), ${asset.thumbnail}`,
      }
    : undefined;
  const visualBackground = getAssetBackground(activeAsset);
  const shotScriptBackground = getAssetBackground(shotScriptAsset);
  const previewTitle = emptyPreview
    ? '预览'
    : isShotScript
      ? `预览 ${selectedElement.name}_script`
      : isVideo
        ? '预览 Shot_Twist_Awakening_video'
        : `预览 ${activeAsset?.name ?? ''}`;

  return (
    <Panel
      title={previewTitle}
      icon="⌗"
      className="preview-panel"
      actions={<span className="preview-actions">❝ ↓ ♡ ⌫ HD</span>}
    >
      <div className="preview-stage">
        {emptyPreview ? (
          <div className="preview-empty-mark" aria-label="暂无预览">
            <CreateClapperMark variant="preview" />
          </div>
        ) : null}

        {!emptyPreview && workspaceState === 'skillCompleted' ? (
          <EmptyState
            icon="▣"
            title="开始创作"
            description="创作需求已进入后台漫剧创作库流水线。"
          />
        ) : null}

        {!emptyPreview && workspaceState === 'videoSpecDocument' ? (
          <div className="video-spec-preview">
            <header>
              <span>Final Video Spec</span>
              <strong>《城门·守》</strong>
              <small>Production Document · 1-2 min · 16:9</small>
            </header>
            <div className="video-spec-preview__body">
              <p>东方玄幻战争剧情短片，以旁白和角色动作驱动叙事。</p>
              <dl>
                <div>
                  <dt>Visual Style</dt>
                  <dd>中国古典美学、城门战场、压迫感云层</dd>
                </div>
                <div>
                  <dt>Core Shots</dt>
                  <dd>城楼全景 / 魔族逼近 / 将领迎战 / 结尾转折</dd>
                </div>
                <div>
                  <dt>Pipeline</dt>
                  <dd>脚本 &gt; 故事板 &gt; 元素生成 &gt; 镜头视频 &gt; 时间线合成</dd>
                </div>
              </dl>
            </div>
          </div>
        ) : null}

        {!emptyPreview && isLoading ? (
          <div className="generation-preview">
            <span className="aurora-dot" />
            <strong>{activeAsset?.progress ?? selectedElement.progress ?? 80}%</strong>
            <p>后台流水线正在生成素材，请稍候...</p>
            <div className="generation-preview__steps">
              <span>Agent 分析完成</span>
              <span>资产配置完成</span>
              <span>生成素材中</span>
            </div>
          </div>
        ) : null}

        {!emptyPreview && isShotScript ? (
          <div className="shot-script-preview">
            <div className="shot-script-preview__visual" style={shotScriptBackground}>
              <div className="shot-script-preview__overlay">
                <span>Shot Script</span>
                <strong>{selectedElement.name}</strong>
                <p>{selectedElement.description}</p>
                <div className="shot-script-preview__chips" aria-label="分镜脚本信息">
                  <span>元素 {selectedElement.assets.length}</span>
                  <span>旁白 00:15</span>
                  <span>镜头 16:9</span>
                  <span>HD</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {!emptyPreview && isStoryboardOverview ? (
          <div className="storyboard-overview-preview">
            <CreateClapperMark variant="preview" />
          </div>
        ) : null}

        {!emptyPreview && !isLoading && isAudio ? (
          <div className="audio-player-card">
            <span className="play-button">▶</span>
            <div>
              <strong>{activeAsset?.name}</strong>
              <div className="waveform">
                {Array.from({ length: 36 }, (_, index) => (
                  <span key={index} style={{ height: `${18 + ((index * 13) % 34)}px` }} />
                ))}
              </div>
              <span>00:00 / {activeAsset?.duration ?? '01:32'}</span>
            </div>
            <div className="audio-player-card__meta">
              <span>旁白</span>
              <span>配乐</span>
              <span>音效</span>
            </div>
          </div>
        ) : null}

        {!emptyPreview &&
        !isLoading &&
        !isShotScript &&
        !isAudio &&
        !isStoryboardOverview &&
        isVideo ? (
          <div className="video-player-preview">
            <div className="video-player-preview__screen" style={visualBackground}>
              <span className="video-player-preview__play">▶</span>
              {workspaceState === 'shotVideoGenerating' ? (
                <div className="video-player-preview__progress">
                  <strong>生成中 {videoProgress}%</strong>
                  <span><i style={{ width: `${videoProgress}%` }} /></span>
                </div>
              ) : null}
            </div>
            <div className="video-player-preview__controls">
              <span>{workspaceState === 'timelinePreview' ? '00:32 / 01:27' : '00:00 / 00:15'}</span>
              <div>
                <button type="button">16:9</button>
                <button type="button">HD</button>
                <button type="button">全屏</button>
              </div>
            </div>
            <div className="video-player-preview__mini-timeline">
              {['00:00', '00:15', '00:30', '00:45', '01:00'].map((time, index) => (
                <span key={time} className={index < 3 ? 'is-ready' : ''}>
                  <i>{time}</i>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {!emptyPreview &&
        !isLoading &&
        !isShotScript &&
        !isAudio &&
        !isVideo &&
        !isStoryboardOverview &&
        workspaceState !== 'skillCompleted' &&
        workspaceState !== 'videoSpecDocument' ? (
          <div className={`image-preview-card image-preview-card--${selectedElement.type}`}>
            <div className="fantasy-visual fantasy-visual--primary" style={visualBackground}>
              <span>{isVideo ? '▶' : selectedElement.type.toUpperCase()}</span>
            </div>
            <div className="fantasy-visual fantasy-visual--secondary">
              <div className="preview-metadata-card">
                <small>{isVideo ? 'Shot Video' : selectedElement.type}</small>
                <strong>{selectedElement.name}</strong>
                <p>{selectedElement.description}</p>
                <div className="preview-metadata-card__chips">
                  <span>{activeAsset?.type ?? 'asset'}</span>
                  <span>{activeAsset?.status ?? selectedElement.status}</span>
                  {typeof activeAsset?.progress === 'number' ? <span>{activeAsset.progress}%</span> : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
