import assert from 'node:assert/strict';
import {
  mapOpenProjectResponse,
  mapProjectListItem,
} from '../src/adapters/projects/mapProject';
import { mapProjectSnapshotPayloadToDto } from '../src/adapters/projects/mapProjectSnapshot';
import { normalizeProjectDataSource } from '../src/config/projectRuntime';
import {
  createMockProject,
  listMockProjects,
  openMockProject,
} from '../src/services/projects/mockProjectRepository';
import {
  createConfiguredProject,
  listConfiguredProjects,
  openConfiguredProject,
} from '../src/services/projects/projectRepository';
import type {
  OpenProjectResponseDto,
  ProjectListItemDto,
} from '../src/api/projects/projectDto';

async function test(name: string, run: () => void | Promise<void>) {
  await run();
  console.log(`✓ ${name}`);
}

await test('mapProjectListItem maps backend project dto into UI list item', () => {
  const dto: ProjectListItemDto = {
    project_id: 'project-api-1',
    title: 'API 项目',
    updated_at: '2026年6月16日 22:59',
    status: 'running',
    description: '后台项目',
    thumbnail_url: '/assets/project.png',
  };

  assert.deepEqual(mapProjectListItem(dto), {
    id: 'project-api-1',
    title: 'API 项目',
    updatedAt: '2026年6月16日 22:59',
    status: 'running',
    description: '后台项目',
    thumbnail: 'url(/assets/project.png) center/cover',
  });
});

await test('mapOpenProjectResponse maps latest snapshot when backend includes it', () => {
  const response: OpenProjectResponseDto = {
    project: {
      project_id: 'project-api-1',
      title: 'API 项目',
      updated_at: '2026年6月16日 22:59',
      status: 'running',
      thumbnail_style: 'linear-gradient(#111, #222)',
    },
    opened_at: '2026-06-17T02:30:00.000Z',
    latest_snapshot: {
      snapshot_id: 'snapshot-api-9',
      project_id: 'project-api-1',
      version: 9,
      reason: 'manual',
      saved_at: '2026-06-17T02:28:00.000Z',
      payload: mapProjectSnapshotPayloadToDto({
        projectTitle: '恢复标题',
        stage: 'timeline_ready',
        chatFlowState: 'mediaGenerating',
        workspaceState: 'timelinePreview',
        storyboardElements: [],
        timelineTracks: [],
        assets: [],
        documents: [],
        creditBalance: 1024,
      }),
    },
  };

  const project = mapOpenProjectResponse(response);

  assert.equal(project.id, 'project-api-1');
  assert.equal(project.latestSnapshot?.id, 'snapshot-api-9');
  assert.equal(project.latestSnapshot?.version, 9);
  assert.equal(project.latestSnapshot?.payload.projectTitle, '恢复标题');
  assert.equal(project.latestSnapshot?.payload.stage, 'timeline_ready');
});

await test('listMockProjects starts empty so home shows only create entry', () => {
  const projects = listMockProjects();

  assert.deepEqual(projects, []);
});

await test('createMockProject creates a pending local project with fallback fields', () => {
  const originalDateNow = Date.now;
  Date.now = () => 1771111111111;

  try {
    const project = createMockProject({ title: '  镜头草稿  ' });

    assert.equal(project.id, 'project-local-1771111111111');
    assert.equal(project.title, '镜头草稿');
    assert.equal(project.updatedAt, '刚刚');
    assert.equal(project.status, 'pending');
    assert.equal(project.description, '开启您的创作之旅');
    assert.match(project.thumbnail, /^linear-gradient/);
  } finally {
    Date.now = originalDateNow;
  }
});

await test('openMockProject resolves an existing project by id', () => {
  const projects = [
    createMockProject({ title: 'AI视频演示：禁止在校园使用超能力' }),
  ];

  assert.equal(openMockProject(projects, projects[0]!.id)?.title, 'AI视频演示：禁止在校园使用超能力');
  assert.equal(openMockProject(projects, 'missing-project'), null);
});

await test('normalizeProjectDataSource defaults unknown values to mock', () => {
  assert.equal(normalizeProjectDataSource(undefined), 'mock');
  assert.equal(normalizeProjectDataSource('mock'), 'mock');
  assert.equal(normalizeProjectDataSource('api'), 'api');
  assert.equal(normalizeProjectDataSource('other'), 'mock');
});

await test('project repository uses mock data by default', async () => {
  const originalDateNow = Date.now;
  Date.now = () => 1771222222222;

  try {
    const projects = await listConfiguredProjects();
    const project = await createConfiguredProject({ title: '  默认数据源  ' });
    const opened = await openConfiguredProject([project], project.id);

    assert.deepEqual(projects, []);
    assert.equal(project.id, 'project-local-1771222222222');
    assert.equal(project.title, '默认数据源');
    assert.equal(opened?.title, '默认数据源');
  } finally {
    Date.now = originalDateNow;
  }
});
