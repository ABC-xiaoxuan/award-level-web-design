# 动效模式参考

这份参考用于为页面选择轻量、可解释的动效。动效应服务于页面概念和信息层级，而不是让所有元素都自动播放。

## 使用原则

1. 每个页面选择 **一个签名动效**，再搭配少量入场和微交互。
2. 优先使用 `transform`、`opacity`、`clip-path` 和 CSS `background-position`；避免在滚动中频繁改变布局属性。
3. 动效默认使用 180–700ms；连续背景动画应保持低频、低对比度。
4. 超过 5 秒的内容循环、打字、标签切换和录音演示必须提供可见的暂停/播放控件。
5. 页面隐藏、元素离屏和用户悬停/聚焦时应停止非必要计时器或动画循环。
6. 必须提供 `prefers-reduced-motion: reduce` 降级：内容直接可见，连续动画停止，信息不能只通过动效传达。

## 统一令牌

```css
:root {
  --ease-out: cubic-bezier(.22, 1, .36, 1);
  --ease-standard: cubic-bezier(.2, .8, .2, 1);
  --duration-fast: 180ms;
  --duration-base: 420ms;
  --duration-slow: 700ms;
}
```

## 时长和缓动的规则

令牌定了以后，用的时候还要守几条规则。评委说不出原因，但能感觉到不对。

- **时长和移动距离成正比。** 40px 的轻推用 0.9s 显得拖沓，全屏面板用 0.2s 又显得粗暴。大致是：状态变化（hover、切换）150–250ms，元素移动 400–800ms，整屏场景 800–1600ms。
- **入场先快后慢（ease-out），退场先慢后快（ease-in）。** 除了持续循环（跑马灯、旋转）和随滚动变化的数值，不要用 linear。
- **全站只用一种缓动性格。** 弹性回弹、锐利的 expo、线性混在同一个页面里，会显得不统一。
- **入场位移 16–32px。** 100px 以上的大位移飞入，看起来就像模板。
- **首屏内容不做滚动揭示。** 首屏内容必须在第一次渲染时就可见，这也能保护 LCP。
- **揭示以组为单位，而且只揭示一次。** 二十个元素各自淡入就是噪音；向上滚动时再播一遍显得廉价。

以上规则参考了 [SandroHub013/awwwards-skill](https://github.com/SandroHub013/awwwards-skill)（MIT）的 `05-motion.md`。

## 模式一：rise 入场

**适用**：首屏标题、区块标题、卡片组。

```css
[data-motion="rise"] {
  opacity: 0;
  transform: translateY(24px);
  transition: opacity var(--duration-base) var(--ease-out),
              transform var(--duration-base) var(--ease-out);
}
[data-motion="rise"].is-visible {
  opacity: 1;
  transform: none;
}
```

- 用 `IntersectionObserver` 添加 `.is-visible`。
- 延迟不超过 600ms；首屏核心内容不要等待滚动事件才显示。
- reduced motion：`opacity: 1; transform: none; transition: none`。

## 模式二：fade 淡入

**适用**：辅助元信息、分隔线、次要装饰。

只改变 `opacity`，建议 240–420ms。不要用它隐藏主要标题、正文或 CTA；避免页面初始长期空白。

## 模式三：clip 裁切揭示

**适用**：海报式标题、图片、建筑网格或版面展开。

```css
[data-motion="clip"] {
  clip-path: inset(0 100% 0 0);
  transition: clip-path 700ms var(--ease-out);
}
[data-motion="clip"].is-visible {
  clip-path: inset(0);
}
```

- 确保裁切前元素仍有可访问的 DOM 文本。
- 不要在大型正文区域使用，避免内容突然消失。
- reduced motion：直接使用 `clip-path: inset(0)`。

## 模式四：stagger 错峰

**适用**：列表、评分条、流程步骤。

```css
[data-stagger-item] {
  transition-delay: calc(var(--motion-index, 0) * 70ms);
}
```

- 最多 6–8 个项目；总延迟尽量不超过 600ms。
- 错峰只强化已有的阅读顺序，不能让用户等待才能读完整列表。
- reduced motion 下清除 `transition-delay`。

## 模式五：line-draw 线条绘制

**适用**：曲线、路线、等高线、图标轮廓。

SVG 路径可使用 `stroke-dasharray` / `stroke-dashoffset`，并在绘制完成后保持最终状态。用 `requestAnimationFrame` 时应在页面隐藏、元素离屏或用户暂停时停止循环。

- 曲线是信息内容时，提供静态最终状态作为降级。
- 不要为了装饰持续重绘整张 SVG 或 Canvas。
- 如果绘制超过 5 秒或循环播放，提供暂停控制。

## 模式六：counter 数值变化

**适用**：评分、统计数字、进度值。

- 数值变化必须有明确语义，不能用计数动画制造虚假的加载感。
- 时长建议 400–700ms，并保留可读的最终数值。
- 数字变化不应导致布局抖动；预留宽度或使用等宽数字。
- reduced motion 下直接显示最终值。

## 模式七：tabs 标签切换

**适用**：案例详情、功能说明、内容分组。

- 使用真正的 `<button>`、`role="tablist"`、`role="tab"` 和 `role="tabpanel"`，保证键盘方向键可操作。
- 指示器可用 `transform` 移动；面板只做短暂淡入，不要同时隐藏所有内容。
- 自动轮播必须有暂停按钮，并在悬停、聚焦、页面隐藏时停止。

## 模式八：cursor-follow / background-loop

**适用**：建筑坐标、测量线、低对比度等高线等签名效果。

- 指针跟随效果应使用 `transform`，通过 `requestAnimationFrame` 合帧；首次进入时直接定位到指针，避免从屏幕外扫入。
- 位移函数应连续，例如使用 `Math.tanh`，避免符号跳变造成撕裂。
- 背景循环应低对比度、低帧率、低面积；不要让装饰抢过标题和 CTA。
- 页面隐藏、离屏、悬停/聚焦暂停条件以及 reduced motion 都要覆盖。

## 选择建议

| 页面概念 | 推荐签名动效 | 避免 |
| --- | --- | --- |
| 慢烘焙、档案、手工 | `line-draw` 曲线 | 快速弹跳、密集粒子 |
| 建筑、制图、工业系统 | `clip` 网格 + `cursor-follow` 坐标 | 大面积模糊和弹性缩放 |
| 音频、实时工具、信息整理 | `tabs` + 波形或低频 `background-loop` | 无法暂停的持续播放 |
| 评审、报告、作品集 | `counter` + `stagger` 评分 | 所有卡片同时淡入 |

## reduced motion 模板

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .001ms !important;
    scroll-behavior: auto !important;
  }

  [data-motion="rise"],
  [data-motion="clip"] {
    opacity: 1;
    transform: none;
    clip-path: inset(0);
  }

  [data-motion] {
    transition-delay: 0s !important;
  }
}
```

CSS 降级不能替代脚本中的暂停逻辑。使用 `requestAnimationFrame`、`setInterval` 或自动轮播时，仍需监听 `visibilitychange`、`IntersectionObserver` 和用户的暂停操作。
