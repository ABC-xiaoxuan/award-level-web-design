# WebGL 与 3D

只在概念是空间、材质或实时场景时阅读本参考。WebGL 本身不会加分。一个慢、没有内容理由的 3D 场景，通常不如快速的排版页面。

## 先选合适的层级

| 需求 | 技术 |
| --- | --- |
| 单个图像扭曲、悬停效果、无限画廊 | OGL 或原生 WebGL quad |
| 产品查看器、灯光、模型、相机路径 | Three.js |
| React 项目中的 3D | `@react-three/fiber` 加 `drei` |
| 大量粒子或计算 | Three.js WebGPU 与 TSL，必须先测设备性能 |

## 渲染基线

```js
const renderer = new THREE.WebGLRenderer({
  antialias: !isMobile,
  alpha: false,
  powerPreference: 'high-performance',
  stencil: false,
  depth: true,
});
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
```

手机上限制 DPR。使用 WebGPU 时先 `await renderer.init()`，不能把初始化当成同步操作。

## DOM 和 Canvas 的关系

Canvas 可以负责空间画面，但标题、正文、按钮和可访问名称必须留在 DOM。推荐一个共享 Canvas，而不是每个元素一个 Canvas。把 DOM 的 `getBoundingClientRect()` 缓存在 resize 或 `ScrollTrigger.refresh()` 时，逐帧只更新滚动偏移。WebGL 必须在滚动更新之后、同一个 ticker 内渲染。

```js
function syncMesh(mesh, el) {
  const r = cachedRects.get(el);
  mesh.scale.set(r.width, r.height, 1);
  mesh.position.set(
    r.left - innerWidth / 2 + r.width / 2,
    -r.top + innerHeight / 2 - r.height / 2,
    0
  );
}
```

## 预算和资源

- 目标少于 100 draw calls/frame。
- 重复对象使用 `InstancedMesh`，静态几何体合并，材质尽量共享。
- 活跃灯光不超过 3 个，阴影贴图手机端不超过 1024。
- 模型目标小于 2MB 压缩包、少于 100k 三角形。
- 几何使用 Draco，纹理使用 KTX2/Basis，首屏外资源延迟加载。
- GLSL 放在 `.glsl` 文件中，不要塞进模板字符串。
- 监听 `renderer.info.memory`，路由切换和 resize 后数量必须稳定。

## 帧循环和降级

Canvas 只在可见时运行，页面隐藏时暂停，帧间隔要限制在合理范围。低端设备可以降低 DPR、关闭后处理和减少粒子。重要的是提供完整的 DOM/CSS 版本，而不是显示一个空画布。

必须处理：

- `webglcontextlost`：阻止默认行为，显示静态 poster。
- 没有 WebGL：渲染 DOM/CSS 版本。
- reduced-motion：停在一个有设计的静态帧，不自动播放相机路径。
- 移动端：重新设计轻量场景，不能只是关闭桌面效果。

多个输入同时影响场景时，每帧先合成一个状态值，再写入对象。不要让滚动、悬停、点击和 intro 各自启动 tween，互相抢控制权。

这份参考改写自 [SandroHub013/awwwards-skill](https://github.com/SandroHub013/awwwards-skill) 的 `08-webgl.md`，保留了它的资源预算和无障碍降级要求。
