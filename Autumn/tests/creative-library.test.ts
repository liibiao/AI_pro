import assert from 'node:assert/strict';
import { mapBackendDataPackResponse } from '../src/adapters/agent-packages/mapAgentPackage';
import { mapDataPackResponseSkills } from '../src/adapters/skills/mapSkillLibraryItem';
import { normalizeAgentPackageDataSource } from '../src/config/agentPackageRuntime';
import { normalizeSkillLibraryDataSource } from '../src/config/skillLibraryRuntime';
import { listConfiguredAgentPackages } from '../src/services/agent-packages/agentPackageRepository';
import { listConfiguredSkillLibraryItems } from '../src/services/skills/skillLibraryRepository';
import type { ListDataPacksResponseDto } from '../src/api/agent-packages/agentPackageDto';

async function test(name: string, run: () => void | Promise<void>) {
  await run();
  console.log(`✓ ${name}`);
}

const dataPackResponse: ListDataPacksResponseDto = {
  activeDataPackId: 'manju-creation-library',
  items: [
    {
      id: 'manju-creation-library',
      title: '漫剧创作库',
      description: '工业化漫剧创作数据包。',
      sourceVersion: '0.2.0',
      status: 'active',
      roots: [
        { id: 'agents', title: 'Agent 协作体系', root: 'agents', sourceKind: 'agents' },
        { id: 'skills', title: 'Skill 能力包', root: 'skills', sourceKind: 'skills' },
        { id: 'templates', title: '模板体系', root: 'templates', sourceKind: 'templates' },
      ],
    },
    {
      id: 'disabled-pack',
      title: '停用包',
      status: 'disabled',
      roots: [{ id: 'skills', title: '停用 Skill', root: 'skills' }],
    },
  ],
  updatedAt: '2026-06-17T13:40:00.000Z',
};

await test('mapBackendDataPackResponse maps shared data packs into agent packages', () => {
  const packages = mapBackendDataPackResponse(dataPackResponse);

  assert.equal(packages.length, 1);
  assert.deepEqual(
    packages.map((agentPackage) => ({
      id: agentPackage.id,
      name: agentPackage.name,
      version: agentPackage.version,
      syncStatus: agentPackage.syncStatus,
      agents: agentPackage.agents.map((agent) => agent.name),
      skills: agentPackage.skills.map((skill) => skill.name),
      templates: agentPackage.templates.map((template) => template.name),
    })),
    [
      {
        id: 'manju-creation-library',
        name: '漫剧创作库',
        version: '0.2.0',
        syncStatus: 'synced',
        agents: ['Agent 协作体系'],
        skills: ['Skill 能力包'],
        templates: ['模板体系'],
      },
    ],
  );
});

await test('mapDataPackResponseSkills derives backend skills from data pack roots', () => {
  const skills = mapDataPackResponseSkills(dataPackResponse);

  assert.deepEqual(
    skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      source: skill.source,
      storageScope: skill.storageScope,
      syncStatus: skill.syncStatus,
      originPackageId: skill.originPackageId,
    })),
    [
      {
        id: 'data-pack-manju-creation-library-skills',
        name: 'Skill 能力包',
        source: 'backend',
        storageScope: 'account',
        syncStatus: 'synced',
        originPackageId: 'manju-creation-library',
      },
    ],
  );
});

await test('creative library data source config defaults unknown values to api', () => {
  assert.equal(normalizeAgentPackageDataSource(undefined), 'api');
  assert.equal(normalizeAgentPackageDataSource('api'), 'api');
  assert.equal(normalizeAgentPackageDataSource('mock'), 'mock');
  assert.equal(normalizeAgentPackageDataSource('other'), 'api');
  assert.equal(normalizeSkillLibraryDataSource(undefined), 'api');
  assert.equal(normalizeSkillLibraryDataSource('api'), 'api');
  assert.equal(normalizeSkillLibraryDataSource('mock'), 'mock');
  assert.equal(normalizeSkillLibraryDataSource('other'), 'api');
});

await test('creative library repositories require auth in api mode by default', async () => {
  await assert.rejects(
    () => listConfiguredAgentPackages(),
    /Agent 数据包需要 ai_admin_token/,
  );
  await assert.rejects(
    () => listConfiguredSkillLibraryItems(),
    /Skill 数据包需要 ai_admin_token/,
  );
});
