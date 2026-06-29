# 公众号论文长图自动化

把学术论文整理成适合微信公众号发布的长图 HTML，并使用 Playwright 按 `section.section` 自动导出高清 PNG 切片。

项目保留人工确认环节：先理解论文、提取并验收图表、确认文案和视觉方案，再生成 HTML。这样能减少图文错配、结论夸大和排版返工。

## 核心能力

- 创建标准化的论文主题目录
- 检查 HTML 引用的本地图片是否缺失
- 统计可导出的 section 与已有 PNG 数量
- 按 section 批量导出高清 PNG
- 跳过已完整导出的主题，或强制重新导出
- 通过测试覆盖资源检查和导出判断逻辑

## 环境要求

- [Node.js](https://nodejs.org/) 18 或更高版本
- Python 3，并安装 [PyMuPDF](https://pymupdf.readthedocs.io/)
- Chromium（由 Playwright 安装）

## 安装

```bash
git clone <你的仓库地址>
cd <仓库目录>
npm install
npx playwright install chromium
python -m pip install PyMuPDF
```

## 标准工作流

### 1. 创建主题目录

```bash
node pipeline.js --new 新论文
```

命令会创建：

```text
projects/
└── 新论文/
    └── assets/
```

### 2. 放入并阅读论文

把论文 PDF 放进 `projects/新论文/`。生成内容前，先梳理论文结构、实验逻辑、主要结论，以及实验与图表之间的对应关系。

### 3. 裁剪和验收图表

使用 PyMuPDF 渲染 PDF 页面，再按图表区域裁剪到 `projects/新论文/assets/`：

```text
assets/top.png        # 封面
assets/1.png          # 正文中出现的第 1 张图表
assets/2.png          # 正文中出现的第 2 张图表
assets/contact_sheet.png
```

图表必须按正文出现顺序编号。通过 `contact_sheet.png` 检查白底、文字、坐标轴、图例和颜色；不合格时先重裁或重绘。

### 4. 确认文案稿

生成可编辑的文案稿，例如：

```text
projects/新论文/新论文_文案稿.docx
```

论文基本信息放在文案末尾。等待文案修改确认后，再继续生成 HTML。

### 5. 确认视觉方案

确认配色方案，并确保封面文件已经保存为：

```text
projects/新论文/assets/top.png
```

### 6. 生成 HTML

根据确认后的文案稿和 [`prompts.md`](prompts.md) 生成：

```text
projects/新论文/新论文.html
```

每个主要模块必须使用 `<section class="section ...">`。同一个实验的方法、结果和图表应放在同一个 section 内。

### 7. 检查项目

```bash
npm run check
```

检查内容包括缺失图片、可导出 section 数、已有 PNG 数和待导出主题。

### 8. 导出 PNG

```bash
node pipeline.js --batch
```

每个 `section.section` 会导出为一张独立 PNG，并保存到对应主题目录。

## 常用命令

```bash
# 创建主题目录
node pipeline.js --new 主题名

# 检查全部主题
npm run check

# 检查单个主题
node pipeline.js projects/主题名 --check

# 导出单个主题
node pipeline.js projects/主题名

# 批量导出 projects/ 下的主题
node pipeline.js --batch

# 强制重新导出单个主题
node pipeline.js projects/主题名 --force

# 强制批量重新导出
node pipeline.js --batch --force

# 直接指定 HTML 和输出目录
node export-modules.js -i projects/主题名/主题名.html -o projects/主题名/

# 运行测试
npm test
```

## 仓库结构

```text
.
├── AGENTS.md          # 完整工作流、强制规则和自动化约束
├── README.md          # 项目简介与使用说明
├── prompts.md         # HTML 长图生成模板
├── pipeline.js        # 主题创建、检查和批量导出入口
├── export-modules.js  # Playwright section 截图工具
├── tests/             # Node.js 测试
├── package.json
└── projects/          # 本地论文与生成产物，默认不提交
```

## 文档分工

- [`AGENTS.md`](AGENTS.md)：自动化代理必须遵守的完整流程和关键规则
- [`prompts.md`](prompts.md)：生成公众号长图 HTML 时使用的模板
- `README.md`：面向项目使用者的快速说明

如需修改工作流约束，请更新 `AGENTS.md`；如需修改 HTML 的结构或视觉要求，请更新 `prompts.md`。

## 上传 GitHub 前

`projects/`、PDF、`node_modules/` 和本机工具配置已在 `.gitignore` 中排除。提交前仍建议检查：

```bash
git status
git diff --check
```

不要提交论文原文、未公开数据、生成图片、文案稿或包含个人信息的本地配置。
