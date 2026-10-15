# Scroll-scrub：把镜头旅程做成页面

只有当“一段连续旅程”就是页面概念时，才使用 scroll-scrub。普通内容页、编辑页和电商页不适合。它是滚动驱动的影片，不是更复杂的 scroll-jacking。

## 五条原则

1. 概念不是镜头旅程时，停止使用这个模式。
2. 使用原生滚动。读取 `scrollY` 并映射时间，不拦截滚轮。
3. 每个 seam 都应该是一个有意义的门。相邻片段共享同一帧，而不是用溶解掩盖错误接缝。
4. 静帧负责 LCP，视频是渐进增强。每段都有能独立成立的 poster。
5. 播放和 scrub 分开。自动播放使用 `video.play()`，滚动拖动才按需写 `currentTime`，否则会产生 seek storm。

## 什么时候不用

- 用户主要来阅读、购买或查找信息。
- 视频只是背景纹理或单个 hero loop。
- 不能为手机重新取景。
- 只需要一个固定区块，此时使用 [scroll.md](scroll.md) 的 sticky 或 scrub 模式。

## 资产管线

先制作完整镜头，再在门槛处切段。场景通常 6–8 秒，连接段 3–4 秒。四个场景约占 9–10 个视口高度。页面必须显示路线点、章节或进度条，让用户知道旅程长度。

- 24fps 已足够，滚动位置决定平滑度，不是视频帧率。
- 桌面用 AV1 和 H.264 回退，关键帧间隔要短。
- 手机重新渲染或重新取景，不能只裁切 16:9。
- 音轨在编码时移除，poster 使用设计过的首帧。
- 首屏只加载 poster 和当前片段。其他片段按距离排队，一次只请求一个。

## 引擎结构

维护一个片段表、一个 scroll 读取函数和一个 rAF。读取函数只更新目标进度，rAF 让当前进度追上目标，再处理视频时间。不要在 scroll 事件里直接排队 seek。

```js
const segments = [
  { id: 's0', kind: 'scene', weight: 1.6, seconds: 7, poster: 's0' },
  { id: 'c0', kind: 'connector', weight: 0.9, seconds: 3.5, poster: 's1' },
];

function readScroll(y) {
  // 只更新 target，不直接写 video.currentTime
}

function frame() {
  for (const segment of segments) {
    if (!segment.video || segment.video.seeking) continue;
    const time = segment.current * segment.video.duration;
    if (Math.abs(segment.video.currentTime - time) > 0.008) {
      segment.video.currentTime = time;
    }
  }
  requestAnimationFrame(frame);
}
```

视频加载完成后，先把它定位到当前目标再显示。iOS 首次触摸时可用静音 `play()` 再 `pause()` 预热解码器。触屏地址栏导致的高度变化不要触发会改变滚动位置的完整重排。

如果页面有自动播放展示模式，发生滚轮、触摸、键盘或页面隐藏时暂停，只允许明确的播放按钮恢复。不要通过改变 `playbackRate` 长时间追赶滚动误差。

## 替代方案

短片段少于约 150 帧且视频 seek 仍然卡顿时，可以按需加载 WebP/JPEG 帧序列到 Canvas。它更准确，但初始字节和内存更高，必须分块加载，并保留第一帧 poster。

## 预算和降级

- 单段 1080p AV1：小于 1.5MB。
- 单段 1080p H.264：小于 2MB。
- 手机 720p 片段：小于 1MB。
- poster：小于 150KB。
- 首屏 poster 加第一段视频和页面：小于 3MB。
- LCP 看 poster 或首屏文案，不把视频当作唯一指标。

reduced-motion 下不创建 video，只让 poster 按滚动淡换。键盘使用真实按钮跳到真实文档位置。无 JS 时 HTML 至少包含第一段 poster 和文案。审计时检查首屏体积、LCP、9 个滚动停点、减弱动效下是否有 video、键盘跳转和接缝帧。

这份参考改写自 [SandroHub013/awwwards-skill](https://github.com/SandroHub013/awwwards-skill) 的 `19-scroll-scrub.md`，结合了 [video.md](video.md) 和 [scroll.md](scroll.md) 的降级规则。
