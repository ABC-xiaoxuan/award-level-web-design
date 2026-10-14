# 动效模式参考

这份参考用于为页面选择轻量、可解释的动效。动效应服务于页面概念和信息层级，而不是让所有元素都自动播放。

## 使用原则

1. 按概念选择一个签名时刻；可以是静态构图。需要动效时，再搭配少量入场和微交互。
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

## 模式一：rise 入场

**适用**：首屏标题、区块标题、卡片组。

```css
[data-motion="rise"] {
  opacity: 1;
  transform: none;
}
[data-motion="rise"].is-prepared {
  opacity: 0;
  transform: translateY(24px);
  transition: opacity var(--duration-base) var(--ease-out),
              transform var(--duration-base) var(--ease-out);
}
[data-motion="rise"].is-prepared.is-visible {
  opacity: 1;
  transform: none;
}
```

- 初始化成功后才添加 `.is-prepared`，用 `IntersectionObserver` 添加 `.is-visible`；完整回退例见下方。
- 延迟不超过 600ms；首屏核心内容不要等待滚动事件才显示。
- reduced motion：`opacity: 1; transform: none; transition: none`。

## 模式二：fade 淡入

**适用**：辅助元信息、分隔线、次要装饰。

只改变 `opacity`，建议 240–420ms。不要用它隐藏主要标题、正文或 CTA；避免页面初始长期空白。

## 模式三：clip 裁切揭示

**适用**：海报式标题、图片、建筑网格或版面展开。

```css
[data-motion="clip"] {
  clip-path: inset(0);
}
[data-motion="clip"].is-prepared {
  clip-path: inset(0 100% 0 0);
  transition: clip-path 700ms var(--ease-out);
}
[data-motion="clip"].is-prepared.is-visible {
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

- 使用 `<button>`、`role="tablist"`、`role="tab"` 和 `role="tabpanel"`，关联 `aria-controls` / `aria-labelledby`，维护 `aria-selected` 和 roving `tabindex`；方向键、Home / End 切换需实际验证。
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
    animation-delay: 0s !important;
    animation-iteration-count: 1 !important;
    transition-duration: .001ms !important;
    scroll-behavior: auto !important;
  }

  [data-motion="rise"].is-prepared,
  [data-motion="clip"].is-prepared {
    opacity: 1 !important;
    transform: none !important;
    clip-path: inset(0) !important;
  }

  [data-motion], [data-stagger-item] {
    transition-delay: 0s !important;
  }
}
```

CSS 降级不能替代脚本中的暂停逻辑。使用 `requestAnimationFrame`、`setInterval` 或自动轮播时，仍需监听 `visibilitychange`、`IntersectionObserver` 和用户的暂停操作。

## 渐进增强与动态偏好

以下示例只负责有限的区块入场：首屏直接可见，只有观察器可用时才准备屏外元素；初始化、回调失败或首次通知超时都恢复内容。脚本放在 `defer` / module 中或 DOM 就绪后运行；脚本未加载时不隐藏任何内容。

```js
const preference = matchMedia('(prefers-reduced-motion: reduce)')
const elements = [...document.querySelectorAll('[data-motion="rise"], [data-motion="clip"]')]
let observer, fallback

function revealAll() {
  observer?.disconnect()
  clearTimeout(fallback)
  elements.forEach(el => {
    el.classList.remove('is-prepared')
    el.classList.add('is-visible')
  })
}

function initializeMotion() {
  revealAll()
  if (preference.matches || !('IntersectionObserver' in window)) return
  try {
    observer = new IntersectionObserver(entries => {
      try {
        clearTimeout(fallback)
        entries.forEach(entry => {
          if (!entry.isIntersecting) return
          entry.target.classList.add('is-visible')
          observer.unobserve(entry.target)
        })
      } catch { revealAll() }
    }, { threshold: 0.1 })
    elements.forEach(el => {
      const rect = el.getBoundingClientRect()
      if (rect.top < innerHeight && rect.bottom > 0) return
      observer.observe(el)
      el.classList.remove('is-visible')
      el.classList.add('is-prepared')
    })
    fallback = setTimeout(revealAll, 1500)
  } catch { revealAll() }
}

preference.addEventListener('change', initializeMotion)
window.addEventListener('pagehide', revealAll)
window.addEventListener('pageshow', initializeMotion)
initializeMotion()
```

连续动效另外维护播放条件：用户未暂停、页面可见、元素在屏内且 `preference.matches === false`。任一条件变更都取消已有 rAF / timer；恢复时只启动一个循环。实际切换偏好、离屏、返回页面与暂停按钮都需测试，CSS 模板无法验证这些脚本行为。
