# director-stage-children-error-hotfix-20260601170755

修复 `3D导演台` 在高精度人物模型初始化时可能出现的：

```text
Cannot read properties of undefined (reading 'children')
```

## 内容

- `3D导演台` 初始化角色时改为 `safeAddDirectorActorObject`，高精度模型异常会自动降级为稳定基础人偶，不再让整个导演台黑屏。
- `updateDirectorActorSkeleton` 增加 Object3D 防御，过滤无效骨段和跟随对象。
- `TransformControls.attach` 增加 try/catch 和 Object3D 判断，挂载失败时自动 detach。
- `聚焦对象` 的 Box3 边界计算增加容错，避免 Three.js 在异常子对象上读取 `children` 时报错。
- 保留上一包的 64 关节、拟人实体模型、场景库和资产拖入背景能力。

## 验证

```text
script_syntax_ok 4
pose_joint_data_ok 15 64
actor_tree_ok 256 65 1 0
package_marker_check_ok
```
