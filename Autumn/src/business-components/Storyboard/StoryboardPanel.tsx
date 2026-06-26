import { useState, type DragEvent, type FormEvent } from 'react';
import { Panel } from '../../components/Panel';
import type { GenerationParams } from '../../types/params';
import type { GenerationStageStatus, StoryboardElement } from '../../types/pipeline';
import { classNames } from '../../utils/classNames';

const storyboardDragDataType = 'application/x-autumn-storyboard-element';

interface StoryboardPanelProps {
  currentGenerationParams?: GenerationParams;
  elements: StoryboardElement[];
  selectedElementId: string;
  onAddShot?: () => void;
  onBindCurrentParams?: (elementId: string) => void;
  onDeleteElement?: (elementId: string) => void;
  onDuplicateElement?: (elementId: string) => void;
  onGenerateAllShots?: () => void;
  onRegenerateElement?: (elementId: string) => void;
  onReorderElement?: (elementId: string, toIndex: number) => void;
  onSelectElement: (elementId: string) => void;
  onUpdateElement?: (elementId: string, patch: { name: string; description: string }) => void;
}

function formatParams(params: GenerationParams | undefined): string[] {
  if (!params) {
    return [];
  }

  return [
    `IW ${params.imageWeight.toFixed(2)}x`,
    params.crefAssetIds.length > 0 ? `CRef ${params.crefAssetIds.length}` : null,
    params.srefAssetIds.length > 0 ? `SRef ${params.srefAssetIds.length}` : null,
    params.seed !== null ? `Seed ${params.seed}` : null,
  ].filter((item): item is string => Boolean(item));
}

function getStatusLabel(status: GenerationStageStatus): string {
  if (status === 'completed') {
    return '已完成';
  }

  if (status === 'running') {
    return '生成中';
  }

  if (status === 'failed') {
    return '失败';
  }

  return '待生成';
}

export function StoryboardPanel({
  currentGenerationParams,
  elements,
  selectedElementId,
  onAddShot,
  onBindCurrentParams,
  onDeleteElement,
  onDuplicateElement,
  onGenerateAllShots,
  onRegenerateElement,
  onReorderElement,
  onSelectElement,
  onUpdateElement,
}: StoryboardPanelProps) {
  const [draggedElementId, setDraggedElementId] = useState<string | null>(null);
  const [dragOverState, setDragOverState] = useState<{
    elementId: string;
    position: 'before' | 'after';
  } | null>(null);
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState({
    description: '',
    name: '',
  });
  const canReorderElements = Boolean(onReorderElement) && elements.length > 1;
  const hasKeyElements = elements.some((element) => element.type !== 'shot');
  const shotCount = elements.filter((element) => element.type === 'shot').length;
  const canGenerateAllShots = Boolean(onGenerateAllShots) && shotCount > 0;

  function getElementIndex(elementId: string): number {
    return elements.findIndex((element) => element.id === elementId);
  }

  function getDropPosition(event: DragEvent<HTMLElement>): 'before' | 'after' {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientY > bounds.top + bounds.height / 2 ? 'after' : 'before';
  }

  function getReorderIndex(sourceElementId: string, targetElementId: string, position: 'before' | 'after') {
    const sourceIndex = getElementIndex(sourceElementId);
    const targetIndex = getElementIndex(targetElementId);

    if (sourceIndex < 0 || targetIndex < 0) {
      return null;
    }

    const desiredIndex = targetIndex + (position === 'after' ? 1 : 0);
    return sourceIndex < desiredIndex ? desiredIndex - 1 : desiredIndex;
  }

  function handleMoveElement(elementId: string, offset: -1 | 1) {
    const currentIndex = getElementIndex(elementId);

    if (currentIndex < 0) {
      return;
    }

    onReorderElement?.(elementId, currentIndex + offset);
  }

  function handleDragStart(event: DragEvent<HTMLElement>, elementId: string) {
    if (!canReorderElements) {
      return;
    }

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(storyboardDragDataType, elementId);
    event.dataTransfer.setData('text/plain', elementId);
    setDraggedElementId(elementId);
  }

  function handleDragOver(event: DragEvent<HTMLElement>, targetElementId: string) {
    if (!canReorderElements || !draggedElementId || draggedElementId === targetElementId) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverState({
      elementId: targetElementId,
      position: getDropPosition(event),
    });
  }

  function handleDrop(event: DragEvent<HTMLElement>, targetElementId: string) {
    if (!canReorderElements) {
      return;
    }

    event.preventDefault();
    const sourceElementId =
      event.dataTransfer.getData(storyboardDragDataType) ||
      event.dataTransfer.getData('text/plain') ||
      draggedElementId;
    const position = getDropPosition(event);

    setDraggedElementId(null);
    setDragOverState(null);

    if (!sourceElementId || sourceElementId === targetElementId) {
      return;
    }

    const reorderIndex = getReorderIndex(sourceElementId, targetElementId, position);

    if (reorderIndex === null) {
      return;
    }

    onReorderElement?.(sourceElementId, reorderIndex);
  }

  function handleDragEnd() {
    setDraggedElementId(null);
    setDragOverState(null);
  }

  function handleStartEditing(element: StoryboardElement) {
    onSelectElement(element.id);
    setEditingElementId(element.id);
    setEditingDraft({
      description: element.description,
      name: element.name,
    });
  }

  function handleCancelEditing() {
    setEditingElementId(null);
  }

  function handleSaveEditing(event: FormEvent<HTMLFormElement>, elementId: string) {
    event.preventDefault();

    if (!onUpdateElement) {
      return;
    }

    onUpdateElement(elementId, editingDraft);
    setEditingElementId(null);
  }

  return (
    <Panel
      title="故事板"
      icon="▦"
      className="storyboard-panel"
      actions={
        elements.length > 0 ? (
          <button
            className="storyboard-panel__batch-button"
            disabled={!canGenerateAllShots}
            onClick={onGenerateAllShots}
            type="button"
          >
            ▶ 全部镜头
          </button>
        ) : undefined
      }
    >
      {hasKeyElements ? <div className="storyboard-section-label">·· 关键元素 ··</div> : null}
      <div className="storyboard-list">
        {elements.length === 0 ? (
          <div className="storyboard-empty-flow">
            <span>·· 关键元素 ··</span>
            <span>·· 分镜 ··</span>
            <button disabled={!onAddShot} onClick={onAddShot} type="button">+</button>
            <span>·· 旁白与音乐 ··</span>
          </div>
        ) : null}
        {elements.map((element, elementIndex) => {
          const parameterBadges = formatParams(element.generationParams);
          const canDeleteElement = elements.length > 1;
          const canMoveElementUp = canReorderElements && elementIndex > 0;
          const canMoveElementDown = canReorderElements && elementIndex < elements.length - 1;
          const regenerateButtonLabel = element.status === 'failed' ? '重试' : '重生成';
          const isEditing = editingElementId === element.id;

          return (
          <article
            className={classNames(
              'story-card',
              selectedElementId === element.id && 'story-card--selected',
              canReorderElements && 'story-card--sortable',
              draggedElementId === element.id && 'story-card--dragging',
              dragOverState?.elementId === element.id &&
                dragOverState.position === 'before' &&
                'story-card--drop-before',
              dragOverState?.elementId === element.id &&
                dragOverState.position === 'after' &&
                'story-card--drop-after',
            )}
            data-storyboard-element-id={element.id}
            draggable={canReorderElements}
            key={element.id}
            onDragEnd={handleDragEnd}
            onDragLeave={() => setDragOverState(null)}
            onDragOver={(event) => handleDragOver(event, element.id)}
            onDragStart={(event) => handleDragStart(event, element.id)}
            onDrop={(event) => handleDrop(event, element.id)}
          >
            <button
              className="story-card__content"
              onClick={() => onSelectElement(element.id)}
              type="button"
            >
              <span
                className={`story-card__visual story-card__visual--${element.type}`}
                style={element.assets[0]?.thumbnail ? { background: element.assets[0].thumbnail } : undefined}
                aria-hidden="true"
              >
                {element.assets[0]?.type === 'audio'
                  ? '▥'
                  : element.assets[0]?.type === 'video'
                    ? '▶'
                    : element.type}
              </span>
              <span className="story-card__meta-row">
                <span className="story-card__meta">{element.type}</span>
                <span className={`story-card__status story-card__status--${element.status}`}>
                  {getStatusLabel(element.status)}
                </span>
              </span>
              <strong>{element.name}</strong>
              <span>{element.description}</span>
              <div className="asset-row">
                {element.assets.map((asset) => (
                  <span className="asset-token" key={asset.id}>
                    {asset.type === 'audio' ? '▥' : asset.type === 'video' ? '▶' : '▧'} {asset.name}
                  </span>
                ))}
              </div>
              {parameterBadges.length > 0 ? (
                <div className="story-card__params" aria-label="已绑定生成参数">
                  {parameterBadges.map((badge) => (
                    <span key={badge}>{badge}</span>
                  ))}
                </div>
              ) : currentGenerationParams ? (
                <div className="story-card__params story-card__params--empty">未绑定当前参数</div>
              ) : null}
              {typeof element.progress === 'number' ? (
                <div className="progress-bar" aria-label={`${element.progress}%`}>
                  <span style={{ width: `${element.progress}%` }} />
                </div>
              ) : null}
              {element.status === 'failed' && element.errorMessage ? (
                <div className="story-card__error">{element.errorMessage}</div>
              ) : null}
            </button>
            {isEditing ? (
              <form
                aria-label={`${element.name} 编辑`}
                className="story-card__edit-form"
                draggable={false}
                onDragStart={(event) => event.stopPropagation()}
                onSubmit={(event) => handleSaveEditing(event, element.id)}
              >
                <label>
                  <span>名称</span>
                  <input
                    maxLength={80}
                    onChange={(event) =>
                      setEditingDraft((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    value={editingDraft.name}
                  />
                </label>
                <label>
                  <span>描述</span>
                  <textarea
                    maxLength={240}
                    onChange={(event) =>
                      setEditingDraft((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    rows={3}
                    value={editingDraft.description}
                  />
                </label>
                <div className="story-card__edit-actions">
                  <button onClick={handleCancelEditing} type="button">
                    取消
                  </button>
                  <button disabled={!onUpdateElement || editingDraft.name.trim().length === 0} type="submit">
                    保存
                  </button>
                </div>
              </form>
            ) : null}
            {canReorderElements ? (
              <div className="story-card__sort-actions" aria-label={`${element.name} 排序`}>
                <button
                  aria-label={`上移 ${element.name}`}
                  disabled={!canMoveElementUp}
                  onClick={() => handleMoveElement(element.id, -1)}
                  title="上移"
                  type="button"
                >
                  ↑
                </button>
                <button
                  aria-label={`下移 ${element.name}`}
                  disabled={!canMoveElementDown}
                  onClick={() => handleMoveElement(element.id, 1)}
                  title="下移"
                  type="button"
                >
                  ↓
                </button>
              </div>
            ) : null}
            <div className="story-card__actions" aria-label={`${element.name} 操作`}>
              <button
                aria-pressed={isEditing}
                disabled={!onUpdateElement}
                onClick={() => handleStartEditing(element)}
                type="button"
              >
                编辑
              </button>
              <button
                disabled={!onBindCurrentParams || !currentGenerationParams}
                onClick={() => onBindCurrentParams?.(element.id)}
                type="button"
              >
                参数
              </button>
              <button
                disabled={!onDuplicateElement}
                onClick={() => onDuplicateElement?.(element.id)}
                type="button"
              >
                复制
              </button>
              <button
                disabled={!onDeleteElement || !canDeleteElement}
                onClick={() => onDeleteElement?.(element.id)}
                type="button"
              >
                删除
              </button>
              <button
                disabled={!onRegenerateElement}
                onClick={() => onRegenerateElement?.(element.id)}
                type="button"
              >
                {regenerateButtonLabel}
              </button>
            </div>
          </article>
          );
        })}
      </div>
      {elements.length > 0 ? (
        <>
          <div className="storyboard-section-label">·· 分镜 ··</div>
          <button className="add-card-button" disabled={!onAddShot} onClick={onAddShot} type="button">
            + 添加分镜
          </button>
        </>
      ) : null}
    </Panel>
  );
}
