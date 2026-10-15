# 滚动系统

滚动是获奖页面最容易失控的交互。每种技术都会用一部分可用性换创意，只有概念需要时才使用。

## 先保留原生滚动

普通内容页、快速浏览页和电商页优先使用原生滚动。需要连续镜头、地平线或场景变换时，才使用 Lenis。保留原生滚动条、锚点和浏览器的查找与历史恢复。

使用 Lenis 时：

- `duration` 保持在 1.0–1.2，超过 1.4 会产生拖沓感。
- 触屏设备保持原生惯性，通常使用 `syncTouch: false`。
- reduced-motion 下销毁 Lenis。
- 抽屉或模态框打开时停止，关闭时恢复，并锁定 body 滚动。
- 锚点使用 `scrollTo`，偏移量要扣除固定导航高度。

## 一个循环和一个进度值

DOM、平滑滚动和 WebGL 必须共用一个 ticker。每个场景只维护一个 0–1 的标准化进度，再从子区间推导各个动作。不要给同一个区块挂十个互相竞争的触发器。

```js
const state = { progress: 0 };
const EXPLODE = [0.10, 0.42];
const t = gsap.utils.mapRange(EXPLODE[0], EXPLODE[1], 0, 1, state.progress);
const explode = gsap.utils.clamp(0, 1, t);
```

## 常用模式

### 固定区块与 scrub

固定整个 section，移动它的子元素。保留 `pinSpacing`，用章节标签、进度条或计数器说明用户还要经过多长。固定超过约 4 个视口高度时必须重新审视概念。

### 横向章节

桌面可以用固定容器加横向轨道。`end` 根据轨道实际宽度计算，并设置 `invalidateOnRefresh: true`。手机端改为原生 `overflow-x: auto` 加 `scroll-snap-type`，不要把触屏滚动锁进横向劫持。

### Sticky + 内容滚动

媒体列 `position: sticky`，文字列正常滚动。这是最稳妥的高价值模式，几乎没有 scroll-jacking 风险，也天然适配 reduced-motion。

### CSS scroll-driven animation

`animation-timeline: view()` 和 `scroll()` 只用于装饰和进度条。必须有 `@supports` 回退，并保持正文默认可见。浏览器不支持时不能让内容消失。

## 性能规则

- 不要在 scroll 事件里反复读取布局。尺寸在 resize 或 refresh 时缓存。
- 不要在原始 scroll 事件里直接写样式。统一放到 ticker。
- 用 `IntersectionObserver` 暂停离屏视频、Canvas 和 WebGL。
- 长页面可使用 `content-visibility: auto`，同时提供 `contain-intrinsic-size` 防止 CLS。
- 插值要按 `dt` 修正，避免高刷新率设备速度不同。
- 键盘的 Space、PageDown、Home、End 和方向键必须继续可用。

## 必须避免

- 劫持滚轮跳整屏，却不给滚动条反馈。
- 让用户无法判断横向滚动方向。
- 从锚点进入后元素仍停在隐藏状态。
- 忽略浏览器的前进、后退滚动恢复。
- 为了连续画面把触屏惯性改成自定义拖拽。

这份参考改写自 [SandroHub013/awwwards-skill](https://github.com/SandroHub013/awwwards-skill) 的 `07-scroll.md`，并补充了移动端、中文页面和现有 audit 流程需要的降级要求。
