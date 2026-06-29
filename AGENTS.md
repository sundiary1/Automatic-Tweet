# AGENTS.md - 公众号论文长图自动化项目

## 项目目标

把学术论文转成公众号长图 HTML，再用 Playwright 按 `section.section` 导出 PNG 切片。

## 文档分工

- `AGENTS.md`：维护完整流程、关键规则和自动化约束
- `README.md`：维护项目简介、常用命令和简版使用流程
- `prompts.md`：只维护 HTML 生成模板，不重复完整项目流程

## 必须遵守的流程

1. 创建主题目录：`node pipeline.js --new 主题名`
2. 用户提供 PDF 后，先阅读 PDF，梳理论文结构、实验逻辑、结论和图表对应关系
3. 用 PyMuPDF 从 PDF 页面渲染结果中裁剪论文图表到 `projects/主题名/assets/`，并生成 `assets/contact_sheet.png` 做视觉验收
4. 生成可修改文案稿，例如 `projects/主题名/主题名_文案稿.docx`，并等待用户修改确认
5. 用户确认文案稿后，必须确认配色方案和 `assets/top.png` 是否已存在
6. 再按 `prompts.md` 和用户确认后的文案稿生成 `projects/主题名/主题名.html`
7. 运行 `npm run check` 检查缺失图片、section 数和 PNG 数
8. 运行 `node pipeline.js --batch` 导出 PNG

## 关键规则

- 不要在阅读 PDF、提取图片和用户确认文案稿前直接写 HTML
- 文案稿中论文基本信息放在最后，不放在文章前部
- 封面路径固定为 `assets/top.png`
- 图表路径按出现顺序使用 `assets/1.png`、`assets/2.png` ...
- 论文图表必须用 PyMuPDF 页面渲染后按图表区域裁剪，不要用 `pypdf` 或类似工具直接抽取 PDF 内嵌图片对象
- 提取图表后必须检查 `assets/contact_sheet.png`，确认白底正常、文字清晰、坐标轴/图例完整、颜色可读；不合格时先重裁或重绘图表，不进入 HTML 阶段
- PDF 中的文本表格若不是独立图片，优先重绘为可读 PNG，并仍按出现顺序占用 `assets/N.png`
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
