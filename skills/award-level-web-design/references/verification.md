# 渲染与验证工具

## 安装和浏览器

需要 Python 3.10+、Playwright 和可启动的 Chrome / Edge / Chromium。`shoot.py` 是 Python 入口，`audit.py` 处理审计，`performance.py` 整理性能数据；必要的 DOM 与 PerformanceObserver JavaScript 在浏览器执行，无需单独安装 Node.js。

推荐直接运行（入口声明 Python 依赖）：

```bash
uv run <skill目录>/scripts/shoot.py http://localhost:5173 --audit --out shots
```

也可以使用独立 venv：

```bash
python3 -m venv /tmp/web-design-venv
/tmp/web-design-venv/bin/python -m pip install -r <skill目录>/scripts/requirements.txt
/tmp/web-design-venv/bin/python <skill目录>/scripts/shoot.py http://localhost:5173 --audit --out shots
```

默认寻找本机 Chrome / Edge / Chromium，也可用 `--chrome /path/to/browser` 或 `CHROME` 指定可执行文件。如果本机没有浏览器，安装 Playwright Chromium：

```bash
uv run --with playwright python -m playwright install chromium
# venv 模式：/tmp/web-design-venv/bin/python -m playwright install chromium
```

项目自己的服务器仍按项目命令启动。输入可以是 HTTP(S) URL 或本地 HTML 文件；涉及模块、请求或路由时优先使用本地 HTTP 服务。

## 常用命令

```bash
uv run <skill目录>/scripts/shoot.py http://localhost:5173 --audit --full --perf --reduced-motion --sections '#work,.pricing' --ready-selector '#app-ready' --out shots
```

默认视口宽度统一为 **375 / 768 / 1280 / 1920**，`--widths 375,768,1280,1920` 可覆盖。只采样 normal；添加 `--reduced-motion` 后，每个宽度分别用独立 context 采样 normal 与 reduce，不依靠 CSS 字符串判断降级。

| 参数 | 作用 |
| --- | --- |
| `--out shots` | 截图与 JSON 输出目录 |
| `--sections '#work,.pricing'` | 滚动到指定区块并截图 |
| `--full` | 额外捕获整页，加载滚动范围内的懒资源 |
| `--max-height 16000` | 限制整页截图高度；达到上限会记录裁切告警 |
| `--audit` | 运行 DOM 审计，写出 `audit.json` |
| `--perf` | 采集 LCP、CLS、资源与字体字节数 |
| `--axe --axe-source /path/to/axe.min.js` | 使用本地 axe-core 文件扫描；不通过 npm 或在线下载获取脚本 |
| `--ready-selector '#app-ready'` | 等待应用指定元素可见 |
| `--ready-js 'window.appReady === true'` | 等待应用的就绪表达式为真 |
| `--timeout 20000` | 导航、就绪与状态等待的超时，单位 ms，默认 20000 |
| `--settle 500` | 就绪后的辅助等待，单位 ms，默认 500；不能证明应用或动画已完成 |
| `--reduced-motion` | 同时采样 normal 和 reduce |
| `--states states.json` | 在独立页面执行命名状态动作和断言 |
| `--max-issues 12` | 限制展示的问题数量，不截断实际 error / warning 统计 |
| `--fail-on-error` | 审计 error、axe violation、断言/运行失败或破图时返回 1；浏览器启动失败返回 2 |

脚本等待页面加载、所指定的业务就绪条件、字体与可见图片，以及不超过 5 秒的有限动画，再执行辅助等待；持续或长动画不作为等待对象。异步业务内容应使用应用自己的 ready selector / expression；固定等待只用作补充。区块加载、持续动画、数据流和拖动仍需针对页面实际验证。

性能阈值可设置 `--max-lcp 2500`、`--max-cls 0.1`、`--max-bytes 1500000`、`--max-font-bytes 300000`。它们产生告警，不构成真实性能承诺。

## 关键状态与交互

保存 `states.json`：

```json
{
  "states": [
    {
      "name": "menu-open",
      "actions": [
        {"type": "click", "selector": "#menu-toggle"},
        {"type": "wait", "selector": "#menu-panel", "state": "visible"}
      ],
      "expect": [
        {"selector": "#menu-panel", "state": "visible"}
      ]
    }
  ]
}
```

```bash
uv run <skill目录>/scripts/shoot.py http://localhost:5173 --audit --states states.json --out shots
```

每个命名状态在独立的新 context 中导航并等待就绪，不继承 base 或其他状态的点击、存储和表单值。用 `actions` 重现所需前置条件：

| `type` | 必需字段 / 可选字段 |
| --- | --- |
| `click` | `selector` |
| `fill` | `selector`, `value` |
| `press` | `selector`, `key`，例如 `Enter` 或 `Tab` |
| `hover` | `selector` |
| `wait` | `selector`，`state` 默认为 `visible` |

`expect` 指定 `selector` 和 `state`；`state` 可为 `visible`、`hidden`、`attached`、`detached`。例如输入错误值后检查错误提示，或切换 tab 后检查目标面板。**动作执行成功不等于操作结果正确**：没有 `expect` 时只能称已执行/已截图，不能称业务结果通过。DOM 可见断言也不证明提交请求、业务数据或完整键盘体验正确。

## 阅读报告与补充人工验证

`report.json` 中 `runs[width][normal|reduce]` 含 `base` 和 `states`，记录相应截图、审计和状态执行结果；`audit.json` 保存对应审计结果。只启用的项目才有相关采样，不把缺少字段当成通过。

- 审计完整统计 `errors` / `warnings`；`issues` 受 `--max-issues` 限制，`omitted` 表示未展示数量。查看总数，必要时调大上限，避免只修前几条。
- `unchecked` 中的复杂背景、祖先透明度、无法解析的颜色等表示未检查。warning 要人工确认；不因无 error 就断言全部无障碍通过。
- 对比度检查适用于可解析的纯色背景；图片、渐变、伪元素、复杂叠加和动画需人工复核或使用 axe。44px 是建议点击尺寸，单条告警不直接等于 WCAG 违规。
- reduce 样本自动枚举仍运行的连续或超过 5 秒的 Web Animations；短过渡、隐藏内容和错峰需看截图或配置状态断言，不能证明 JS 计时器、Canvas、WebGL 或自动更新全部暂停。还需在页面打开时切换系统偏好，并验证暂停/恢复、隐藏页面与离屏行为。
- `--perf` 是一次 **unthrottled lab sample**，不是用户现场数据或 Core Web Vitals 认证。`totalBytes` / `fontBytes` 是 CDP 的 decoded response body，`transferBytes` 包含编码后的传输与协议开销；未使用 `--full` 时可能遗漏下方懒资源。LCP / CLS 为 `null` 代表不可用，不能按 0 算通过。
- axe 自动扫描以外，人工检查 Tab 顺序、焦点可见、Escape、触屏替代操作、表单反馈和关键流程；必要时用屏幕阅读器验证名称、角色与状态。

浏览器不能启动或截图失败时，记录具体命令与错误，改用现有浏览器工具完成能做的检查；只能代码审查时明确“未完成浏览器验收”，列出待测宽度、状态与风险。

## 维护验证

```bash
uv run --with playwright python -B -m unittest discover -s <skill目录>/tests -v
```

单测覆盖计数、对比度、点击区、性能缺失数据和状态配置；浏览器回归还验证真实 DOM、动态就绪、状态失败、reduce 动效及破图。缺少 Playwright 或浏览器时，浏览器回归会明确标为 skipped，不能据此声称它们通过。
