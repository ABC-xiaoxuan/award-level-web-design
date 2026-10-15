# 技术栈与项目结构

技术栈不是奖项评分项。评委看的是速度、完成度和创意。先选能表达概念的最小技术栈。不要因为某个库流行就把它加入项目。

## 选择矩阵

| 需求 | 优先选择 |
| --- | --- |
| 静态品牌页、营销页、轻动效 | 原生 HTML/CSS/JS、Astro 或 Vite |
| 内容多、需要 CMS | Astro 加 headless CMS |
| 多路由、共享 WebGL 场景、应用状态 | Next.js 或 Nuxt |
| 单个轻量 3D 效果 | OGL 或原生 WebGL |
| 产品查看器、相机路径、GLTF | Three.js |
| React 项目中的 3D | `@react-three/fiber` 加 `drei` |
| 电商 | Shopify Hydrogen，或 headless Shopify 加 Astro/Next |
| 设计师独立交付 | Webflow 或 Framer，但必须重新设计关键结构 |

单页 HTML 已经能表达概念时，不要为了“高级”引入框架。需要 3D 时也不要默认引入 Three.js。一个图像扭曲通常只需要 OGL 或一个 WebGL quad。

## 常用库的职责

- 动效时间线：GSAP。只注册真正使用的插件。
- 平滑滚动：Lenis。只在概念需要连续 scrub 时使用。
- 3D：轻效果用 OGL，场景和模型用 Three.js。
- React 3D：只在 React 项目里使用 `@react-three/fiber` 和 `drei`。
- 页面转场：优先 View Transitions API。MPA 再考虑 Barba 或 Taxi。
- 视频：短循环用渐进式 MP4，长片用 HLS。详见 [video.md](video.md)。

不要同时堆叠这些库。典型组合是框架、GSAP、Lenis，需要空间概念时再加 Three.js。

## 一个可维护的结构

```text
src/
  styles/
    _tokens.scss       # 颜色、字号、间距、缓动、时长
    _reset.scss
    _base.scss
    index.scss
  lib/
    scroll.ts          # Lenis 与 ScrollTrigger
    gl.ts              # 只在使用 3D 时存在
    utils.ts           # lerp、clamp、RAF 工具
  modules/
    nav.ts
    preloader.ts
    reveals.ts
    cursor.ts
    <section>.ts
  shaders/             # GLSL 文件，不写进模板字符串
```

每个区块一个模块，导出 `init()` 和 `destroy()`。销毁时清理 ScrollTrigger、GSAP 动画、事件监听器和 GPU 资源。所有令牌集中在一个文件里。颜色和时长散落在组件中的硬编码，是维护缺陷。

## 一个渲染循环

使用 GSAP 和 Lenis 时，让同一个 ticker 驱动滚动、DOM 动画和 WebGL：

```ts
const lenis = new Lenis({ autoRaf: false, duration: 1.1 });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => {
  lenis.raf(time * 1000);
  renderWebGL?.();
});
gsap.ticker.lagSmoothing(0);
```

不要让 Lenis、Canvas 和业务脚本各自启动 `requestAnimationFrame`。多个循环会让 DOM 和画布错一帧。字体和图片加载完成后重新测量滚动触发器。

## 交付检查

- 静态资源使用 Brotli 或 gzip，带 hash 的资源使用长期缓存。
- 图片在构建时生成准确尺寸的 AVIF/WebP。
- 有 HTTPS、CSP、favicon、`og:image`、`robots.txt` 和 sitemap。
- 记录库版本和浏览器支持范围。
- `prefers-reduced-motion` 下关闭 Lenis，并把滚动交还浏览器。

这份参考改写自 [SandroHub013/awwwards-skill](https://github.com/SandroHub013/awwwards-skill) 的 `06-stack.md`，按本 skill 的静态 HTML、中文页面和可验证交付场景整理。
