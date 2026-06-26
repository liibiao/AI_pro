import type { GenerationTask, GenerationTaskKind } from '../../types/generationTask';
import type { AssetItem, AssetType } from '../../types/pipeline';

function getAssetType(kind: GenerationTaskKind): AssetType {
  if (kind === 'video') {
    return 'video';
  }

  if (kind === 'audio') {
    return 'audio';
  }

  if (kind === 'document' || kind === 'pipeline') {
    return 'document';
  }

  return 'image';
}

function getAssetName(task: GenerationTask, index: number): string {
  const suffix = index === 0 ? '' : ` ${index + 1}`;

  if (task.kind === 'video') {
    return `${task.label || '视频生成'}${suffix}`;
  }

  if (task.kind === 'audio') {
    return `${task.label || '音频生成'}${suffix}`;
  }

  if (task.kind === 'document' || task.kind === 'pipeline') {
    return `${task.label || '生成结果'}${suffix}`;
  }

  return `${task.label || '图片生成'}${suffix}`;
}

function getThumbnail(url: string, type: AssetType): string | undefined {
  if (type === 'image' || type === 'video') {
    return `url(${url}) center/cover`;
  }

  return undefined;
}

export function createAssetsFromGenerationTask(task: GenerationTask): AssetItem[] {
  const urls = task.resultUrls ?? [];

  if (!urls.length) {
    return [];
  }

  const type = getAssetType(task.kind);

  return urls.map((url, index) => ({
    id: `asset-${task.id}-${index + 1}`,
    name: getAssetName(task, index),
    type,
    status: task.status,
    progress: task.progress,
    sourceUrl: url,
    ...(task.targetAssetSlot ? { targetAssetSlot: task.targetAssetSlot } : {}),
    thumbnail: getThumbnail(url, type),
  }));
}
