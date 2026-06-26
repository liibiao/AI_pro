import { mapPipelineEvent, mapPipelineSnapshot } from '../../adapters/pipeline/mapPipelineEvent';
import { pipelineEventDtos } from '../../mock/pipelineMock';
import type { PipelineEvent, PipelineSnapshot, PipelineStage } from '../../types/pipeline';

export const pipelineEvents: PipelineEvent[] = pipelineEventDtos.map(mapPipelineEvent);

export const pipelineStageOrder: PipelineStage[] = pipelineEventDtos.map((event) => event.stage);

export function getPipelineSnapshotByStage(stage: PipelineStage): PipelineSnapshot {
  const event = pipelineEventDtos.find((item) => item.stage === stage) ?? pipelineEventDtos[0];
  return mapPipelineSnapshot(event);
}

export function getNextPipelineStage(stage: PipelineStage): PipelineStage {
  const currentIndex = pipelineStageOrder.indexOf(stage);
  const nextIndex = Math.min(currentIndex + 1, pipelineStageOrder.length - 1);
  return pipelineStageOrder[nextIndex];
}

export function getPreviousPipelineStage(stage: PipelineStage): PipelineStage {
  const currentIndex = pipelineStageOrder.indexOf(stage);
  const previousIndex = Math.max(currentIndex - 1, 0);
  return pipelineStageOrder[previousIndex];
}

