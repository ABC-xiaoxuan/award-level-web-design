# 视频优先页面

对后期制作、电影、产品 reel 和案例站，视频是内容，也是签名时刻。视频如果只是标题后面的背景纹理，遵守动效与性能参考即可，不需要这一整套流程。

## 四条原则

1. reel 是首屏主角。不要用 WebGL 实验遮住真正要展示的作品。
2. 声音永远主动开启。声音按钮要一直可见，不能藏在自动消失的控制栏里。
3. 每个视频都有设计过的 poster。它负责首屏、慢网、reduced-motion 和截图状态。
4. 播放器是设计系统的一部分。自定义控件必须重建键盘和读屏操作，否则使用原生控件。

## 编码和预算

```html
<video muted loop playsinline preload="metadata" poster="/reel-poster.avif">
  <source src="/reel.av1.mp4" type='video/mp4; codecs="av01.0.05M.08"'>
  <source src="/reel.h264.mp4" type='video/mp4; codecs="avc1.4d401f"'>
</video>
```

AV1 优先，HEVC 服务 Safari，H.264 作为通用回退。短循环使用渐进式 MP4。超过约 60 秒的 reel 使用 HLS 和多码率。渐进式 MP4 设置 `faststart`，循环视频在编码时移除音轨。

| 资源 | 目标 | 上限 |
| --- | --- | --- |
| 6–10 秒 1080p hero loop | 小于 1.5MB | 2MB |
| 4–6 秒 480p 卡片预览 | 小于 400KB | 600KB |
| reel 首段加 poster | 小于 2MB | 计入首屏 3MB |
| hero poster AVIF | 小于 150KB | 200KB |

Poster 是 LCP 候选，视频不是。预加载准确尺寸的 poster，等视频第一帧绘制后再淡入。视频必须设置 `width`/`height` 或 `aspect-ratio`。

## 卡片预览

项目索引可以播放单独剪出的 4–6 秒静音片段。桌面端可以把 pointer X 映射到 `currentTime`，但要使用 `requestVideoFrameCallback` 或节流。触屏端没有 hover，第一次点击播放，第二次点击打开项目。使用 `IntersectionObserver` 暂停离屏视频，页面隐藏时也暂停，并限制同时播放的数量。

## 可访问播放器

至少提供播放/暂停、可拖动进度、时间、声音、全屏和字幕。控件使用真实 `button`，有 `:focus-visible`、`aria-label` 和 `aria-pressed`。有对白时使用真实 `<track kind="captions">`。全屏作用于包含控件的播放器容器。

reduced-motion 下不自动播放，展示 poster 和清晰的播放按钮。自动播放必须静音，超过 5 秒的连续播放必须可暂停。

## 视频反模式

- 任何地方自动播放声音。
- 没有 poster 就把视频当 LCP。
- 用 GIF 代替 MP4。
- 为了扭曲一个普通视频而引入 WebGL。
- 用滚轮劫持用户播放影片。
- 给几十张卡片都设置 `preload="auto"`。
- 自动隐藏控制栏后连声音按钮也消失。
- 只有烧录字幕，没有可选的 `<track>`。

这份参考改写自 [SandroHub013/awwwards-skill](https://github.com/SandroHub013/awwwards-skill) 的 `17-video.md`，并接入本项目的性能、无障碍和 reduced-motion 要求。
