import assert from 'node:assert/strict';
import {
  applyProjectExportTaskEvent,
  defaultProjectExportOptions,
  mapProjectExportTaskEventDto,
  mapProjectExportOptionsDto,
  mapProjectExportOptionsToDto,
  mapProjectExportTaskDto,
} from '../src/adapters/projects/mapProjectExport';
import { createProjectExportTaskEventsUrl } from '../src/api/projects/projectExportSocket';
import {
  mockProjectExportFailedEventDto,
  mockProjectExportProgressEventDtos,
  mockProjectExportTaskDto,
} from '../src/mock/projectExportMock';
import {
  clearMockProjectExportTasks,
  createConfiguredProjectExportTask,
  getConfiguredProjectExportTask,
} from '../src/services/projects/projectExportRepository';
import {
  getProjectExportFormatLabel,
  getProjectExportFrameRateLabel,
  getProjectExportResolutionLabel,
  getProjectExportStatusLabel,
  getProjectExportSummary,
} from '../src/utils/projectExportDisplay';

async function test(name: string, run: () => void | Promise<void>) {
  await run();
  console.log(`✓ ${name}`);
}

await test('project export adapter maps options and task dto', () => {
  const optionsDto = mapProjectExportOptionsToDto({
    format: 'mov',
    resolution: '4k',
    frameRate: 60,
    includeSubtitles: false,
    compressQuality: true,
  });
  const task = mapProjectExportTaskDto({
    task_id: 'export-api-1',
    project_id: 'project-api-1',
    status: 'completed',
    progress: 100,
    options: optionsDto,
    created_at: '2026-06-17T02:00:00.000Z',
    updated_at: '2026-06-17T02:01:00.000Z',
    download_url: '/downloads/export.mov',
  });

  assert.deepEqual(optionsDto, {
    format: 'mov',
    resolution: '4k',
    frame_rate: 60,
    include_subtitles: false,
    compress_quality: true,
  });
  assert.deepEqual(mapProjectExportOptionsDto(optionsDto), {
    format: 'mov',
    resolution: '4k',
    frameRate: 60,
    includeSubtitles: false,
    compressQuality: true,
  });
  assert.equal(task.id, 'export-api-1');
  assert.equal(task.projectId, 'project-api-1');
  assert.equal(task.status, 'completed');
  assert.equal(task.downloadUrl, '/downloads/export.mov');

  assert.equal(mapProjectExportTaskDto(mockProjectExportTaskDto).id, 'export-contract-001');
});

await test('mock export repository advances running task to completed download', async () => {
  const originalDateNow = Date.now;

  clearMockProjectExportTasks();
  Date.now = () => 1771444444000;

  try {
    const task = await createConfiguredProjectExportTask('project-export-test');

    assert.equal(task.id, 'export-project-export-test-1771444444000');
    assert.equal(task.status, 'running');
    assert.equal(task.progress, 12);
    assert.deepEqual(task.options, defaultProjectExportOptions);

    Date.now = () => 1771444447000;
    const completedTask = await getConfiguredProjectExportTask(task.id);

    assert.equal(completedTask?.status, 'completed');
    assert.equal(completedTask?.progress, 100);
    assert.equal(
      completedTask?.downloadUrl,
      '/downloads/project-export-test/export-project-export-test-1771444444000.mp4',
    );

    Date.now = () => 1771444448000;
    const customTask = await createConfiguredProjectExportTask('project-export-test', {
      options: {
        format: 'gif',
        resolution: '720p',
        frameRate: 24,
        includeSubtitles: false,
        compressQuality: true,
      },
    });

    assert.deepEqual(customTask.options, {
      format: 'gif',
      resolution: '720p',
      frameRate: 24,
      includeSubtitles: false,
      compressQuality: true,
    });

    Date.now = () => 1771444451000;
    const completedCustomTask = await getConfiguredProjectExportTask(customTask.id);
    assert.equal(
      completedCustomTask?.downloadUrl,
      '/downloads/project-export-test/export-project-export-test-1771444448000.gif',
    );
  } finally {
    Date.now = originalDateNow;
    clearMockProjectExportTasks();
  }
});

await test('project export display helpers format labels', () => {
  const task = {
    id: 'export-display',
    projectId: 'project-display',
    status: 'running' as const,
    progress: 48,
    options: {
      format: 'mp4' as const,
      resolution: '1080p' as const,
      frameRate: 30 as const,
      includeSubtitles: true,
      compressQuality: false,
    },
    createdAt: '2026-06-17T02:00:00.000Z',
    updatedAt: '2026-06-17T02:00:30.000Z',
  };

  assert.equal(getProjectExportStatusLabel(undefined), '导出');
  assert.equal(getProjectExportStatusLabel('running'), '导出中');
  assert.equal(getProjectExportStatusLabel('completed'), '导出完成');
  assert.equal(getProjectExportFormatLabel('mp4'), 'MP4');
  assert.equal(getProjectExportResolutionLabel('4k'), '4K');
  assert.equal(getProjectExportFrameRateLabel(30), '30fps');
  assert.equal(getProjectExportSummary(task), 'MP4 | 1080P | 30fps');
});

await test('project export events map and apply to the current task', () => {
  const task = mapProjectExportTaskDto(mockProjectExportTaskDto);
  const event = mapProjectExportTaskEventDto(mockProjectExportProgressEventDtos[2]!);
  const ignoredEvent = {
    ...event,
    taskId: 'other-task',
  };

  assert.equal(event.progress, 100);
  assert.deepEqual(applyProjectExportTaskEvent(task, ignoredEvent), task);
  assert.deepEqual(applyProjectExportTaskEvent(task, event), {
    ...task,
    status: 'completed',
    progress: 100,
    updatedAt: '2026-06-17T09:00:15.000Z',
    downloadUrl: '/downloads/project-local-demo/export-contract-001.mp4',
    error: undefined,
  });

  const failedEvent = mapProjectExportTaskEventDto(mockProjectExportFailedEventDto);
  assert.deepEqual(applyProjectExportTaskEvent(task, failedEvent), {
    ...task,
    status: 'failed',
    progress: 64,
    updatedAt: '2026-06-17T09:00:12.000Z',
    downloadUrl: undefined,
    error: '导出服务暂时不可用，请稍后重试。',
  });
});

await test('project export socket url uses default export event path', () => {
  assert.equal(
    createProjectExportTaskEventsUrl('export-task-1'),
    '/api/export-tasks/export-task-1/events',
  );
});
