# AGENTS.md - 公众号论文长图自动化项目

## 项目目标

把学术论文转成公众号长图 HTML，再用 Playwright 按 `section.section` 导出 PNG 切片。

## 必须遵守的流程

1. 创建主题目录：`node pipeline.js --new 主题名`
2. 用户提供 PDF 后，先提取论文图表到 `projects/主题名/assets/`
3. 生成 HTML 前，必须确认配色方案和 `assets/top.png` 是否已存在
4. 再按 `prompts.md` 生成 `projects/主题名/主题名.html`
5. 运行 `npm run check` 检查缺失图片、section 数和 PNG 数
6. 运行 `node pipeline.js --batch` 导出 PNG

## 关键规则

- 不要在提取图片和确认风格前直接写 HTML
- 封面路径固定为 `assets/top.png`
- 图表路径按出现顺序使用 `assets/1.png`、`assets/2.png` ...
- 同一个实验的方法、结果和图表必须放在同一个 section 内
- 每个主要模块必须使用 `<section class="section ...">`
- 默认不要提交或上传 `projects/`，里面是论文、图片和导出产物
- 不新增依赖；只用 Node.js、Playwright、Python PyMuPDF

## 常用命令

```bash
npm run check
node pipeline.js --batch
node pipeline.js --batch --force
node export-modules.js -i projects/xxx/xxx.html -o projects/xxx/
```
