# 中文字体与排版

中文页面最常见的结局是：中文字体太重不敢加载，退回系统字体，看起来和任何网页都一样。这份参考解决三件事：选什么字体、怎么加载得动、怎么排得好看。防错类的规则（断行、字体回退）见 [review-checklist.md](review-checklist.md) 第 1 节，这里不重复。

## 1. 按气质选字体

默认只用 OFL 许可的字体，可以随网页分发，也可以子集化。

| 字体 | 许可 | 气质 | 用法 |
| --- | --- | --- | --- |
| 思源黑体 / Noto Sans SC | OFL | 中性、现代、清晰 | 正文首选；可变字重，100–900 都有 |
| 思源宋体 / Noto Serif SC | OFL | 编辑感、文学、克制的高级 | 杂志、文化、餐饮、建筑的标题和引文；粗字重做展示很有力量 |
| 霞鹜文楷 LXGW WenKai | OFL | 手写温度、人文、安静 | 阅读类、手作、教育；标题和短正文都可以 |
| 得意黑 Smiley Sans | OFL | 窄、斜、有速度感 | 潮流、运动、科技活动的标题；只有一个字重，不要用于正文 |
| 站酷小薇、站酷庆科黄油体等（Google Fonts） | OFL | 复古宋感 / 方块装饰感 | 只用于短标题或标志性字样 |
| 马善政、龙藏、志莽行等书法体（Google Fonts） | OFL | 书法、东方、手迹 | 只用于一两个词的签名式标题，绝不用于正文 |

其他免费商用字体：阿里巴巴普惠体、HarmonyOS Sans、MiSans 都有各自的许可协议，条款不是 OFL，例如可能禁止转售字体文件，或者要求署名。使用前请阅读官方许可原文，并在交付说明里注明。

字体参考链接：[霞鹜文楷](https://github.com/lxgw/LxgwWenKai)、[得意黑](https://github.com/atelier-anchor/smiley-sans)、[MiSans FAQ](https://hyperos.mi.com/font/faq)。

## 2. 中西文搭配

- **气质要对应**：衬线西文配宋体，几何或怪诞无衬线配黑体，手写或人文西文配楷体。
- **栈的顺序**：西文字体放前面，中文字体放后面，最后是通用族：`"Fraunces", "Noto Serif SC", serif`。原因是中文字体自带的西文字形通常比较平庸，而西文字体又不含汉字。
- **视觉大小**：同一字号下，汉字的字面框比西文小写字母大。混排时如果西文显得小一号，可以用 `@font-face { size-adjust: 105%; }` 单独放大西文，不要改整体字号。
- **西文做装饰层**：大号西文数字、全大写的小标签、等宽字体的编号，配上中文正文，是中文页面建立层级、显出精致的有效手法。示例页里的 `A—01`、`DAY 0`、`01 / 本季豆单` 都是这种用法。

## 3. 加载策略

完整的中文字体有 5–20 MB，不能整包加载。

- **正文用系统字体栈**，并保证回退效果可以接受：
  ```css
  --f-cn: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif;
  ```
- **展示字体按页面子集化**，只保留页面上实际出现的字符，每个子集目标在 100 KB 以内：
  ```bash
  pip install fonttools brotli
  pyftsubset NotoSerifSC.otf --text-file=used-chars.txt --flavor=woff2 --output-file=serif-sc.woff2
  ```
  repo 里的 `tests/optimize-fonts.py` 是完整示例：从 HTML 里提取字符、实例化可变字重、生成 `@font-face`。
- 用户输入、CMS 内容这类动态文字无法预先子集化。要么只给静态标题使用展示字体，要么用 Google Fonts 那种按 `unicode-range` 切片的方式加载。
- 可变字体先用 `instantiateVariableFont` 把字重范围裁到实际用到的区间，体积能再小一截。
- 每次修改文案后都要重新生成子集，否则新出现的字会退回系统字体。

## 4. 排版细节

| 场景 | 字号 | 行高 | 字距 |
| --- | --- | --- | --- |
| 正文 | 16–18px | 1.7–1.9 | 0 到 0.02em |
| 小标题 | 20–28px | 1.4–1.5 | 0 |
| 展示标题 | 48px 以上 | 1.1–1.25（中文比西文要高一些） | -0.01 到 -0.03em，只对大字号收紧 |
| 全大写西文小标签 | 11–13px | — | 0.08–0.16em |

- **行长**：正文每行 25–40 个汉字，用 `max-width: 36em` 之类的值控制。
- **不要用中文斜体**：浏览器生成的伪斜体很难看。强调时改用字重、颜色或着重号（`text-emphasis: filled dot`）。
- **避头尾**：`line-break: strict`，避免句号、右括号出现在行首。
- **标点挤压**：`text-spacing-trim: normal`（[MDN](https://developer.mozilla.org/docs/Web/CSS/text-spacing-trim)），可以压缩相邻标点和行首标点的空白。浏览器支持度约 72%，作为渐进增强使用。
- **中西文间距**：`text-autospace: normal`（[MDN](https://developer.mozilla.org/docs/Web/CSS/text-autospace)），自动在汉字和西文、数字之间加间距。支持度约 85%（[caniuse](https://caniuse.com/mdn-css_properties_text-autospace)）。不支持的浏览器上，手动加空格也可以接受，但全站规则要统一。
- **两端对齐**：中文正文在桌面上用 `text-align: justify` 很整齐。但手机窄屏或中西文混排时字距会被拉开，这些场景下改回 `start`。

## 5. 竖排：中文独有的签名手法

西文模板做不到竖排，所以它是中文页面最容易做出辨识度的手法之一。

```css
.vertical {
  writing-mode: vertical-rl;
  text-orientation: mixed;      /* 西文侧躺，汉字直立 */
  line-height: 1.8;
}
.vertical .num { text-combine-upright: all; }  /* 两位数字横向合并成一格，例如 "12" */
```

- **适合**：首屏标题、侧边的章节名、引文、诗句、菜单。
- **不适合**：长正文、需要快速扫读的列表、表单。
- **手机上**：竖排标题会占用很大的高度，要单独检查。必要时在小屏改回横排，或者缩短文字。
- 竖排时，标点会自动换成竖排字形。用截图确认引号和破折号的方向是否正确。
