# Agent 数据包与 Skill 库设计

文档版本：V1.0  
更新日期：2026-06-14  
适用范围：Autumn 前端、后台管理系统接口、漫剧创作库 Agent 流水线。

## 1. 核心结论

Autumn 需要同时支持 Agent 数据包和 Skill 库。

- Agent 数据包：一整套 Agent 编排、Skill、模板、默认参数和流程配置。
- Skill 库：可被项目独立启用的能力单元，例如剧情分镜拆解、角色一致性控制、音频设计、镜头视频生成策略。

两者关系：

```text
Agent 数据包
  ├── Agents
  ├── Skills  -> 自动进入当前项目 Skill 库
  ├── Templates
  └── Defaults

Skill 库
  ├── 数据包内置 Skill
  ├── 后台导入 Skill
  └── 本地导入 Skill
```

## 2. 来源与作用域

| 类型 | 来源 | 存储作用域 | 同步策略 | UI 标识 |
| --- | --- | --- | --- | --- |
| 数据包内置 Skill | 当前 Agent 数据包 | 跟随数据包 | 跟随数据包 | 数据包内置 |
| 后台导入 Skill | 后台管理系统 | 账号 | 可多设备同步 | 后台导入 / 账号 |
| 本地导入 Skill | 当前设备文件 | 本设备 | 不上传后台，不账号同步 | 本地导入 / 本设备 |

强约束：

- 本地导入 Skill 只能当前设备使用。
- 本地导入 Skill 不得默认上传后台。
- 本地导入 Skill 不得绕过后台鉴权直接调用生成模型或视频生成内核。
- 如果未来需要上传本地 Skill 到后台，必须设计独立的“发布到后台 / 上传到账号”显式流程。

## 3. 前端分层

```text
src/types/
├── agentPackage.ts
└── skillLibrary.ts

src/api/
├── agent-packages/
└── skills/

src/adapters/
├── agent-packages/
└── skills/

src/services/
├── agent-packages/
└── skills/

src/store/
├── agentPackageStore.ts
└── skillLibraryStore.ts
```

## 4. 项目运行规则

1. 用户选择 Agent 数据包后，该数据包内置 Skill 自动出现在当前项目 Skill 库。
2. 用户可从后台导入更多 Skill，后台 Skill 属于账号资源。
3. 用户可从本地 JSON 导入 Skill，本地 Skill 只保存在当前浏览器设备。
4. 用户可在 Skill 库中启用 / 停用 Skill。
5. 发送创作指令时，前端把当前启用 Skill 的 ID 集合作为任务配置传给后台。
6. 后台漫剧创作库流水线根据启用 Skill 决定任务拆解、素材生成、视频生成和合成策略。

## 5. 当前 Sprint 0 实现状态

- 已实现 `AgentPackageSwitcher`。
- 已实现 `SkillLibrarySwitcher`。
- 已实现本地 Agent 数据包 JSON 导入。
- 已实现本地 Skill JSON 导入。
- 已实现后台导入候选 Mock。
- 已实现本地导入 `storageScope=device` 与 `syncStatus=localOnly` 标记。

## 6. 后续接口

待接后台：

- `GET /api/agent-packages`
- `POST /api/agent-packages/:packageId/import`
- `PUT /api/projects/:projectId/agent-package`
- `GET /api/skills`
- `POST /api/skills/:skillId/import`
- `PUT /api/projects/:projectId/skills/:skillId`

