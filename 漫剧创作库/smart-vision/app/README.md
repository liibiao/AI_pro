# smart-vision/app

智能视界前端平台壳层 MVP。

## 当前定位

第一版只做本地产品壳层，不重写 legacy 无限画布：

- 项目列表与当前项目总览
- 单集任务看板
- 审核中心
- 关键产物索引
- Workflow JSON 入口占位
- 无限画布跳转入口
- `.smart-vision/` 状态文件读取
- 本地桥接 API：项目快照、服务健康检查、画布模型统计

## 启动

安装依赖：

```bash
cd smart-vision/app
npm install
```

启动桥接服务：

```bash
npm run bridge
```

另开终端启动前端：

```bash
npm run dev
```

默认前端地址：

```text
http://127.0.0.1:5177
```

桥接服务地址：

```text
http://127.0.0.1:5188
```

legacy 无限画布入口：

```text
http://127.0.0.1:8877/image-studio-canvas.html
```

## 常用命令

```bash
npm run sync:snapshot
npm run build
npm run preview
```

`npm run build` 会先同步项目快照，再执行 TypeScript 与 Vite 构建。
