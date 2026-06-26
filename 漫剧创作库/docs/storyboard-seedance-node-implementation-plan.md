# 分镜 + Seedance 提示词节点开发实施计划

## 目标

在不重做现有文本节点和资产推演能力的前提下，补齐后半段生产链路：

文本节点生成剧本 -> 推演资产卡 -> 资产卡确认/生成资产图 -> 分镜 + Seedance 提示词节点 -> Seedance 生视频节点。

本次整改只复用现有文本节点、现有资产推演入口和现有资产设计节点能力；资产确认页、分镜提示词节点、Seedance 段落提示词组织与节点衔接重新开发。

## 现有可复用能力

- `smart-vision/app/scripts/bridge-server.mjs`
  - `startCreativeProduction`
  - `buildCreativeStoryboard`
  - 已能从输入剧本生成资产卡、分镜表、`assetIds`、`durationSeconds`、`imagePrompt`、`videoPrompt`、`seedancePromptArtifactPath`。

- `smart-vision/app/src/types.ts`
  - `CreativeAssetCard`
  - `CreativeStoryboardShot`
  - `CreativeStartResult`

- `tools/workbench-web/image-studio-canvas-next.html`
  - 现有 `assetDesign` 节点。
  - 默认值：`assetType: character`、`templateId: simple_three_view_sheet`、`size: 16:9`、`resolution: 1k`。
  - 已有图片大图预览、参考图上传、MJ 任务/四宫格相关能力，可复用交互逻辑。

## 新增模块

### 1. 资产卡确认模块

用途：接收文本节点推演出的资产卡，完成提示词确认、资产图生成、MJ 四宫格选图、最终资产图回填。

状态：

- `draft`
  - 刚推演出来，没有任何生成图片。
  - 只有资产名称、分类、提示词、引用标签、参考图上传入口。

- `editingPrompt`
  - 双击资产 item 打开编辑弹窗。
  - 弹窗复用资产设计节点字段。
  - 顶部工具栏使用 `资产模板图片`，默认 `simple_three_view_sheet`。
  - 不使用随机种子字段。

- `generating`
  - 点击单个资产生成或批量生成后进入。

- `generatedSingle`
  - 普通生图结果，生成单张资产图，可直接确认。

- `generatedMjGrid`
  - Midjourney 结果，先展示四宫格。
  - 四宫格不是最终资产图，必须选中其中一张。

- `backfilled`
  - 选中 MJ 单图或普通单图确认后，回填为真正资产图。
  - 此时引用标签升级为带图片的 `@资源` clip。

- `confirmed`
  - 用户确认该资产可用于后续分镜提示词节点。

关键规则：

- 初始资产卡不能显示假图。
- 所有 `@资源` 必须是 `缩略图 + 引用标签` 的 clip。
- hover `@资源` 弹出大图预览卡。
- MJ 四宫格必须先选图再回填，不能直接进入后续节点。

### 2. 分镜 + Seedance 提示词节点

用途：消费已确认资产卡和分镜表，将分镜行聚合成可投 Seedance 的段落提示词。

输入：

- 已确认资产卡列表。
- `@资源` 映射表。
- 分镜表 `shots[]`。
- 剧本片段/来源段落。

输出：

- 每段 Seedance 视频提示词。
- 每段绑定的 `@资源` clip 列表。
- 可填入 Seedance 生视频节点的数据包。

分段规则：

- 默认每段最多 15 秒。
- 每段从 `0s` 开始写该段内部时间轴。
- 最后一段不足 15 秒时，按真实剩余秒数输出。
- 例如总时长 42 秒：
  - 段落 01：0-15s，输出 15s 提示词。
  - 段落 02：15-30s，输出 15s 提示词。
  - 段落 03：30-42s，输出 12s 提示词。

提示词结构：

- `画面主体`
- `@Image` / `@资源 clip`
- 时间轴：`0s-4s`、`4s-8s`、`8s-12s` 等，按真实时长展开。
- `环境联动`
- `光线`
- `对白配音`
- `音效设计`
- `画质`
- `负面提示词`

### 3. Seedance 生视频衔接

用途：接收某一个段落的 Seedance 提示词和对应资源，创建或填入现有 `seedanceVideo` 节点。

输入：

- `segmentPrompt`
- `durationSeconds`
- `resourceClips[]`
- 可选参考视频/音频。

输出：

- 现有 `seedanceVideo` 节点可执行数据。
- 后续生成的视频结果仍走现有视频节点/输出登记逻辑。

## 数据结构建议

### AssetCard

```ts
type AssetCardStatus =
  | 'draft'
  | 'editingPrompt'
  | 'generating'
  | 'generatedSingle'
  | 'generatedMjGrid'
  | 'backfilled'
  | 'confirmed'
  | 'blocked';

type AssetCard = {
  id: string;
  type: 'character' | 'scene' | 'prop' | 'atmosphere' | 'color' | string;
  name: string;
  prompt: string;
  negativePrompt?: string;
  referenceLabel: string;
  source: 'script-derive' | string;
  sourceNodeId?: string;
  sourceSegmentIds?: string[];
  templateId?: string;
  templateLabel?: string;
  referenceUploads: ResourceImage[];
  generatedImages: ResourceImage[];
  mjGrid?: {
    taskId?: string;
    gridImage: ResourceImage;
    candidates: ResourceImage[];
    selectedIndex?: number;
  };
  finalImage?: ResourceImage;
  status: AssetCardStatus;
};
```

### ResourceClip

```ts
type ResourceClip = {
  assetId: string;
  label: string;
  thumbnailUrl: string;
  imageUrl: string;
  type: string;
  role: 'character_consistency' | 'scene_space' | 'key_prop' | 'style_reference' | string;
  source: 'asset-confirm';
  confirmed: boolean;
};
```

### SeedanceSegment

```ts
type SeedanceSegment = {
  id: string;
  episodeId: string;
  index: number;
  sourceShotIds: string[];
  absoluteStartSeconds: number;
  absoluteEndSeconds: number;
  durationSeconds: number;
  title: string;
  resourceClips: ResourceClip[];
  prompt: string;
  status: 'draft' | 'generated' | 'edited' | 'sentToVideoNode';
};
```

## API/服务改造

### 保留

- 保留 `/api/smart-vision/creative/start` 作为剧本输入后的生产入口。
- 保留现有 asset/cards/storyboard/seedance artifact 写入逻辑。

### 新增建议

1. `POST /api/smart-vision/assets/confirm-session/create`
   - 从 `CreativeStartResult.assets` 创建资产确认 session。
   - 初始状态全部为 `draft`，无图片。

2. `POST /api/smart-vision/assets/confirm-session/update-card`
   - 保存资产卡提示词、模板、分类、引用标签、参考图。

3. `POST /api/smart-vision/assets/confirm-session/generate-card`
   - 调用现有资产设计/图片生成能力。
   - 普通模型返回单图。
   - MJ 返回四宫格状态。

4. `POST /api/smart-vision/assets/confirm-session/select-mj-image`
   - 选择 MJ 四宫格中的某一张。
   - 回填为 `finalImage`。

5. `POST /api/smart-vision/assets/confirm-session/confirm`
   - 确认全部资产。
   - 输出 `ResourceClip[]` 和资源映射。

6. `POST /api/smart-vision/storyboard-seedance/create`
   - 根据已确认资源和 `shots[]` 创建分镜 + Seedance 提示词节点数据。

7. `POST /api/smart-vision/storyboard-seedance/generate-segments`
   - 按 15s 分段生成 Seedance 段落提示词。
   - 尾段按真实剩余秒数生成。

8. `POST /api/smart-vision/storyboard-seedance/send-to-video-node`
   - 将某段提示词和资源包填入现有 `seedanceVideo` 节点。

## 前端组件拆分

### AssetConfirmPage

对应效果图：

- `design-mockups/asset-confirm-generation-states/01-empty-prompt-only-before-generation.png`
- `03-single-image-generated-confirm.png`
- `04-mj-four-grid-confirm.png`

职责：

- 分类筛选。
- 状态筛选。
- 资产卡 grid。
- 右侧详情。
- 批量生成。
- 确认并创建分镜提示词节点。

### AssetPromptEditorModal

对应效果图：

- `02b-prompt-editor-template-image-selector.png`
- `02c-template-image-dropdown-open.png`

职责：

- 复用资产设计节点参数。
- 编辑提示词/负面提示词。
- 上传角色/场景/道具参考图。
- 选择资产模板图片。
- 保存并生成资产图。

### MjGridPicker

对应效果图：

- `04-mj-four-grid-confirm.png`
- `05-mj-large-preview-backfill.png`

职责：

- 展示 MJ 四宫格。
- 四宫格 item 点击查看大图。
- 选中单张并回填。
- 复用现有大图查看动画。

### ResourceClip

职责：

- 标准 `@资源` 展示组件。
- 必须包含缩略图。
- hover 弹大图预览。
- 支持替换/查看资产详情。

### StoryboardSeedanceNode

对应效果图：

- `design-mockups/storyboard-seedance-chain-v2/02-node-image-clip-resources.png`
- `design-mockups/storyboard-seedance-chain-v2/03-prompt-detail-image-clips.png`

职责：

- 展示分段列表。
- 展示每段绑定资源 clip。
- 生成/编辑 Seedance 段落提示词。
- 创建或填入 Seedance 生视频节点。

## 开发顺序

### Phase 1：数据结构和 session 落盘

- 扩展 `CreativeAssetCard`，不要破坏现有字段。
- 新增资产确认 session 数据结构。
- 将 `creative/start` 的资产输出转为“无图 draft 资产卡”。
- 增加 artifact 落盘：
  - `01-资产图与提示词/asset-confirm-sessions/{episodeId}.json`

验收：

- 输入剧本后能看到 10 张无图资产卡。
- 每张卡保留提示词、分类、引用标签。

### Phase 2：资产确认页

- 开发 AssetConfirmPage。
- 初始状态无图。
- 支持单卡/批量生成。
- 支持状态筛选和详情面板。

验收：

- 空状态没有假图。
- 点击生成后状态更新。
- 只有全部确认后才能创建分镜提示词节点。

### Phase 3：资产提示词编辑弹窗

- 开发 AssetPromptEditorModal。
- 复用资产设计节点参数默认值。
- `资产模板图片` 默认 `simple_three_view_sheet`。
- 移除随机种子字段。

验收：

- 双击 item 打开弹窗。
- 修改提示词后保存到资产卡。
- 保存并生成能进入生成流程。

### Phase 4：MJ 四宫格选图回填

- 开发 MjGridPicker。
- 四宫格 item 可查看大图。
- 选中单图后回填为最终资产图。

验收：

- MJ 四宫格不能直接确认。
- 回填后 asset.finalImage 有值。
- `@资源` clip 使用回填后的单图缩略图。

### Phase 5：分镜 + Seedance 提示词节点

- 开发 StoryboardSeedanceNode。
- 从确认资产和 `shots[]` 自动生成 `ResourceClip[]`。
- 按 15s 切段。
- 尾段按剩余秒数生成。

验收：

- 总时长 42s 时输出 15s + 15s + 12s。
- 每段提示词都绑定对应 `@资源` clip。
- 点击段落能打开提示词编辑详情。

### Phase 6：Seedance 生视频节点衔接

- 将某段 Seedance 提示词填入现有 `seedanceVideo` 节点。
- 自动带入对应图片资源。
- 保持现有视频生成/输出登记流程。

验收：

- 点击“创建生视频节点”后生成可执行视频节点。
- 节点 prompt、duration、resources 与段落一致。

## 回归测试清单

- 文本节点生成剧本后，资产推演仍可用。
- 资产确认初始状态无图片。
- 双击资产卡打开编辑弹窗。
- 资产模板图片默认值为 `simple_three_view_sheet`。
- 普通模型单图生成可直接确认。
- MJ 四宫格必须选图回填。
- `@资源` 全部是图片 clip。
- `@资源` hover 有大图。
- 15s 分段正确。
- 尾段不足 15s 时不补空。
- Seedance 节点拿到正确 prompt 和资源。

## 主要风险

- 现有 `creative/start` 当前会直接写出 `seedancePromptArtifactPath`，需要避免和新“确认后再生成提示词”的流程冲突。
- MJ 四宫格的任务结果结构可能和普通图片结果不一致，需要统一成 `mjGrid.candidates[]`。
- `@资源` clip 需要全局一致，否则提示词编辑器、节点表格、详情页会出现三套不同样式。
- 如果资产未确认就创建分镜提示词节点，会导致后续 `@资源` 缺图，因此必须加创建前校验。

## 推荐第一批落地范围

先做最小闭环：

1. 资产确认 session。
2. 无图资产确认页。
3. 双击编辑弹窗，包含 `资产模板图片`。
4. 普通单图生成回填。
5. 创建分镜 + Seedance 提示词节点。
6. 15s/尾段提示词生成。

MJ 四宫格作为第二批接入，但 UI 和数据结构第一批就预留。

