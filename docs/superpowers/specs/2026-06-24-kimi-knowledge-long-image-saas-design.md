# 基于 Kimi API 的 AI 知识长图 SaaS 架构设计

## 背景

当前项目是一个本地 CLI 流水线：把学术论文整理为公众号长图 HTML，并用 Playwright 按 `section.section` 导出 PNG 切片。现有约束集中在 `AGENTS.md`、`README.md`、`prompts.md`，核心脚本是 `pipeline.js` 和 `export-modules.js`。

新产品方向不再局限于论文，而是面向知识博主和公众号作者，提供在线可部署的 AI 知识长图工作台。第一版默认使用 Kimi API，支持论文 PDF、行业报告 PDF、网页文章或粘贴正文，最终产物是可编辑文案、HTML 长图和 PNG 切片。

## 产品定位

产品名称暂定为“AI 知识长图工作台”。

目标用户：

- 公众号知识博主
- 科普和行业解读作者
- 小团队内容运营人员

第一版核心价值：

- 把长文、论文、报告快速转成适合公众号传播的结构化长图
- 保留人工确认节点，避免 AI 直接生成不可控成品
- 支持在线项目管理、异步生成、PNG 切片下载

## MVP 范围

第一版支持三类内容入口：

- 论文 PDF
- 行业报告 PDF
- 网页文章或粘贴正文

第一版必须具备：

- 用户登录和项目归属
- 创建项目、上传 PDF、粘贴正文或输入网页正文
- Kimi API 解析内容结构
- 生成 3-5 个选题角度
- 用户选择或修改选题角度
- 生成可编辑文案稿
- 用户确认文案稿
- 论文和报告场景下的图表/图片整理与 `contact_sheet` 验收
- 封面和配色确认
- 基于模板生成 HTML
- 检查缺失资源、section 数和导出状态
- 用 Playwright 导出 PNG 切片
- 下载导出结果

第一版暂不做：

- 多人协作
- 付费系统
- 模板市场
- 多平台自动发布
- 复杂素材库
- 移动端完整编辑器

## 总体架构

系统采用单体 Web 应用加异步 Worker 的 SaaS 架构。

```text
Web 前端
  ↓
API Server
  ↓
PostgreSQL
  ↓
Redis + BullMQ
  ↓
Worker
  - Kimi 内容解析
  - Kimi 文案生成
  - PDF 图表裁剪
  - HTML 生成
  - Playwright PNG 导出
  ↓
对象存储
  - PDF
  - assets
  - contact_sheet
  - HTML
  - PNG 切片
```

推荐目录结构：

```text
apps/web/
  Next.js 前端和 API 路由

worker/
  BullMQ worker
  Playwright 导出任务
  PyMuPDF 图表处理任务

core/
  ai/
  export/
  projects/
  storage/
  workflows/

templates/
  academic-paper/
  report-explainer/
  article-explainer/

projects/
  本地开发和临时任务工作目录
```

部署进程：

- `web`：前端和 API
- `worker`：异步任务执行
- `redis`：任务队列
- `postgres`：业务数据

对象存储可选 S3、Cloudflare R2、阿里云 OSS 或腾讯云 COS。国内部署时优先考虑阿里云 OSS 或腾讯云 COS。

## Kimi API 集成

Kimi API 使用 OpenAI 兼容格式。配置项：

```env
AI_PROVIDER=kimi
KIMI_API_KEY=<server-side-secret>
KIMI_BASE_URL=https://api.moonshot.ai/v1
KIMI_MAIN_MODEL=kimi-k2.6
KIMI_FAST_MODEL=moonshot-v1-32k
KIMI_LONG_MODEL=moonshot-v1-128k
KIMI_VISION_MODEL=kimi-k2.6
```

模型分工：

- `kimi-k2.6`：内容深度解析、选题策略、复杂文案、图文理解
- `moonshot-v1-128k`：长报告、长论文文本整理
- `moonshot-v1-32k`：标题、摘要、短文案、局部改写

AI 调用必须通过 Provider 抽象，不允许业务流程直接调用 SDK。

```text
core/ai/
  provider.ts
  kimi.ts
  prompts/
    analyze-source.md
    generate-angles.md
    generate-draft.md
    generate-html.md
    revise-draft.md
```

Provider 接口：

```ts
interface AIProvider {
  analyzeSource(input: AnalyzeSourceInput): Promise<AnalyzeSourceResult>;
  generateAngles(input: GenerateAnglesInput): Promise<AngleOption[]>;
  generateDraft(input: GenerateDraftInput): Promise<DraftResult>;
  reviseDraft(input: ReviseDraftInput): Promise<DraftResult>;
  generateHtml(input: GenerateHtmlInput): Promise<HtmlResult>;
}
```

所有需要被程序继续处理的 AI 输出都必须使用 JSON Schema 或严格 JSON 模式校验。校验失败时自动重试一次；仍失败则标记任务失败并把错误展示给用户。

## 工作流抽象

系统不再把“论文”写死为唯一流程，而是注册多个 workflow。

```text
academic_paper
report_explainer
article_explainer
```

统一步骤：

```text
created
source_uploaded
source_analyzed
angle_selected
draft_generated
draft_approved
assets_ready
style_confirmed
html_generated
checked
exported
```

不同 workflow 的差异：

- `academic_paper`：要求识别论文结构、实验逻辑、结论、图表对应关系，论文基本信息放在文案最后。
- `report_explainer`：要求提炼行业趋势、关键数据、政策或商业影响，报告来源信息放在文案最后。
- `article_explainer`：要求提炼观点、背景、争议、适合公众号传播的重构角度。

后端必须做状态机校验：

- 未完成 `source_analyzed` 不能生成选题角度
- 未完成 `angle_selected` 不能生成文案稿
- 未完成 `draft_approved` 不能生成 HTML
- 未完成 `style_confirmed` 不能导出 PNG
- 未完成资源检查不能进入导出

## 人工确认节点

人工确认是产品质量控制的一部分，不是可选装饰。

第一版包含：

- 选题角度确认
- 文案稿确认
- 图表/素材确认
- 封面和配色确认
- 导出前检查确认

论文和报告 PDF 场景保留现有关键规则：

- 必须先阅读和解析 PDF，再进入文案生成
- 图表必须从 PyMuPDF 页面渲染结果裁剪，不直接抽取 PDF 内嵌图片对象
- 必须生成 `contact_sheet`
- 图表路径按出现顺序映射为 `assets/1.png`、`assets/2.png`
- 封面路径固定为 `assets/top.png`
- 同一个实验或论证模块的方法、结果、图表应放在同一个 section

## 数据模型

核心表：

```text
users
  id
  email
  name
  created_at

projects
  id
  owner_id
  title
  content_type
  workflow_id
  status
  selected_angle_id
  style_config
  created_at
  updated_at

project_files
  id
  project_id
  owner_id
  kind
  storage_key
  filename
  mime_type
  size_bytes
  created_at

ai_runs
  id
  project_id
  provider
  model
  task_type
  prompt_version
  input_tokens
  output_tokens
  status
  error_message
  created_at

jobs
  id
  project_id
  type
  status
  progress
  error_message
  created_at
  updated_at

drafts
  id
  project_id
  version
  content_markdown
  status
  created_at

angle_options
  id
  project_id
  title
  summary
  audience
  tone
  status
  created_at
```

文件 `kind` 建议：

```text
source_pdf
source_text
figure
cover
contact_sheet
draft_docx
draft_markdown
html
export_png
export_zip
```

## API 设计

项目：

```text
POST /api/projects
GET  /api/projects
GET  /api/projects/:id
PATCH /api/projects/:id
```

输入：

```text
POST /api/projects/:id/source/pdf
POST /api/projects/:id/source/text
POST /api/projects/:id/source/url
```

AI 和流程任务：

```text
POST /api/projects/:id/analyze
POST /api/projects/:id/angles
POST /api/projects/:id/angles/:angleId/select
POST /api/projects/:id/drafts
PATCH /api/projects/:id/drafts/:draftId
POST /api/projects/:id/drafts/:draftId/approve
POST /api/projects/:id/assets/extract
POST /api/projects/:id/assets/approve
POST /api/projects/:id/style/confirm
POST /api/projects/:id/html
POST /api/projects/:id/check
POST /api/projects/:id/export
```

任务和文件：

```text
GET /api/jobs/:id
GET /api/projects/:id/files
GET /api/files/:id/signed-url
```

耗时 API 返回 `job_id`，前端轮询或通过 SSE 接收进度。

## Worker 设计

任务类型：

```text
parse_source
generate_angles
generate_draft
extract_assets
generate_html
check_html
export_png
create_export_zip
```

Worker 原则：

- 每个任务必须幂等
- 文件写入使用项目隔离目录或临时目录
- 任务成功后上传对象存储，再更新数据库
- 任务失败后保留错误日志
- Playwright 导出和 PyMuPDF 裁剪必须限制并发

建议并发：

- AI 任务：根据 Kimi 速率限制配置
- PDF 任务：每台 worker 1-2 个
- Playwright 导出：每台 worker 1 个起步

## 前端页面

第一版页面：

- 登录页
- 项目列表页
- 创建项目页
- 项目详情页
- 文案编辑页
- 素材验收页
- 模板和配色选择页
- 导出结果页

项目详情页是核心工作台，包含：

- 当前状态
- 流程步骤条
- 最近任务日志
- 当前可执行操作
- 文件和预览区

文案编辑器第一版可以用 Markdown 文本编辑，不需要一开始做复杂富文本。

## 模板系统

模板按内容类型组织：

```text
templates/
  academic-paper/
    prompt.md
    style.json
    base.html
  report-explainer/
    prompt.md
    style.json
    base.html
  article-explainer/
    prompt.md
    style.json
    base.html
```

模板要求：

- 每个主要模块必须生成包含 `section` class 的 `<section>` 标签
- 图片引用只能使用系统分配的资产路径或文件 ID 映射
- 论文和报告来源信息放在最后
- HTML 生成前必须经过资源引用检查

## 现有代码迁移

保留现有 CLI 能力，但逐步拆分为可被 Web 和 Worker 复用的模块。

目标拆分：

```text
pipeline.js
  → core/export/check.js
  → core/projects/local-projects.js
  → cli/pipeline.js

export-modules.js
  → core/export/export-sections.js
  → worker/tasks/export-png.js
  → cli/export-modules.js
```

`AGENTS.md` 中论文专属规则迁移到：

```text
core/workflows/academic-paper/rules.md
core/workflows/academic-paper/workflow.ts
templates/academic-paper/prompt.md
```

`projects/` 继续用于本地开发和 worker 临时目录，但线上数据库和对象存储才是最终状态来源。

## 安全和合规

必须处理：

- 用户文件隔离
- 下载链接使用 signed URL
- API key 只存在服务端环境变量
- 上传文件大小限制
- PDF 和图片类型校验
- HTML 生成后做资源白名单检查
- 不允许用户上传 HTML 后直接执行任意脚本
- Worker 临时目录任务完成后清理

## 测试策略

单元测试：

- workflow 状态机
- AI 输出 JSON 校验
- HTML 资源检查
- section 数统计
- 文件路径映射

集成测试：

- 创建项目到文案生成
- 生成 HTML 到检查
- 导出 PNG 到 ZIP

端到端测试：

- 用户上传 PDF
- 选择选题角度
- 编辑并确认文案
- 生成并下载切片

保留现有 `npm test`，迁移后新增针对 `core/export` 的测试。

## 里程碑

### M1：本地 Web MVP

- Next.js 项目壳
- 项目列表和详情
- 本地文件存储适配
- Kimi Provider
- 粘贴正文生成选题角度和文案

### M2：PDF 和导出闭环

- PDF 上传
- PyMuPDF 图表处理 worker
- contact sheet 验收
- HTML 生成
- Playwright PNG 导出

### M3：线上化

- PostgreSQL
- Redis + BullMQ
- 对象存储
- 用户登录
- signed URL
- Docker 部署

### M4：内容类型扩展

- 行业报告模板
- 网页文章模板
- 模板风格配置
- 导出 ZIP

## 关键决策

- 默认模型供应商使用 Kimi API
- 采用 Provider 抽象，避免模型供应商锁定
- 采用单体 Web 应用加异步 Worker，不做微服务
- 第一版面向知识博主，不覆盖企业运营和矩阵团队
- 保留人工确认节点，避免 AI 一键生成不可控成品
- 保留现有 Playwright 导出内核，逐步模块化
