# GitHub 仓库整理设计

## 目标

将当前项目整理为可公开上传 GitHub 的 CLI 工具仓库，让首次访问者能够快速理解用途、安装依赖并完成一次论文长图导出，同时避免提交论文原文、生成产物和本机配置。

## 整理范围

- 保留核心脚本：`pipeline.js`、`export-modules.js`。
- 保留测试：`tests/pipeline.test.js`。
- 保留项目约束与模板：`AGENTS.md`、`prompts.md`。
- 重写 `README.md`，覆盖项目能力、环境要求、安装、工作流、命令、目录结构和注意事项。
- 扩充 `.gitignore`，忽略 `projects/`、依赖、本地工作区、本机工具配置、日志、论文 PDF 和常见系统文件。
- 从 Git 跟踪中移除 `.claude/settings.local.json`。
- 删除尚未实现且容易误导公开用户的 Kimi SaaS/MVP 设计稿。
- 根目录未跟踪论文 PDF 不移动、不删除，只通过忽略规则阻止误提交；论文与生成产物仍由用户自行保存在 `projects/` 中。

## 文档边界

- `README.md` 面向 GitHub 使用者，只保留简介、安装和简版流程。
- `AGENTS.md` 面向自动化代理，维护强制流程与约束。
- `prompts.md` 只维护 HTML 生成模板。

README 不复制完整提示词和全部代理规则，通过链接引导至对应文档。

## README 结构

1. 项目简介与输出形式
2. 核心能力
3. 环境要求与安装
4. 从创建主题到导出 PNG 的标准流程
5. 常用命令
6. 项目目录结构
7. 素材命名与自动检查规则
8. 隐私和 Git 提交注意事项

## 安全与兼容性

- 不新增 npm 或 Python 依赖声明。
- 不改变现有 CLI 参数和导出行为。
- 不修改或删除被 `.gitignore` 排除的 `projects/` 内容。
- 保留用户当前对 `AGENTS.md` 和 `prompts.md` 的未提交改动。

## 验证

- 运行 `npm test`。
- 运行 `npm run check`，允许它报告现有项目内容问题，但需确认命令本身正常运行。
- 检查 `git status`、`git ls-files` 和忽略规则，确认本机配置、PDF、`projects/`、`node_modules/` 不会进入提交。
- 检查 README 中的命令与 `package.json`、脚本实际参数一致。
