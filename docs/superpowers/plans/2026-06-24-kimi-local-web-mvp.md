# Kimi Local Web MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dependency-free local web MVP for the AI knowledge long-image workflow, using Kimi API for pasted-text analysis and draft generation while preserving the existing CLI export pipeline.

**Architecture:** Add a small native Node HTTP server, focused core modules, and a static browser UI. Store project state in `projects/<slug>/project.json`, call Kimi through a provider abstraction, and reuse the existing `pipeline.js` audit/export logic instead of replacing it.

**Tech Stack:** Node.js CommonJS, native `http`, native `fetch`, existing Playwright dependency, existing `node:test`, static HTML/CSS/JS, file-backed project storage.

## Global Constraints

- Do not add dependencies in this MVP.
- Preserve the existing `node pipeline.js --new 主题名`, `npm run check`, and `node pipeline.js --batch` flows.
- Do not write HTML before source analysis, draft confirmation, style confirmation, and cover confirmation.
- Store topic artifacts under `projects/<主题名>/`.
- Keep cover path fixed as `assets/top.png`.
- Keep figure paths ordered as `assets/1.png`, `assets/2.png`.
- Main rendered modules must use `<section>` elements containing the `section` class.
- Do not commit or upload generated `projects/` content by default.
- Kimi API key must only be read from server-side environment variables.
- This plan implements M1 only: local web MVP, pasted-text source, Kimi analysis, angle selection, draft generation, HTML/check/export hooks.

---

## File Structure

- Create `core/project-store.js`: file-backed project creation, metadata loading, status transitions, source/draft persistence.
- Create `core/workflow.js`: allowed project statuses and transition guard.
- Create `core/ai/kimi-provider.js`: Kimi OpenAI-compatible API calls through native `fetch`.
- Create `core/ai/prompts.js`: prompt builders and strict JSON extraction helpers.
- Create `core/html/generate-simple-html.js`: dependency-free HTML generator for confirmed drafts.
- Create `server/web-server.js`: native HTTP API and static file server.
- Create `web/index.html`: local browser UI shell.
- Create `web/app.js`: frontend API calls and state rendering.
- Create `web/styles.css`: compact workbench styling.
- Modify `package.json`: add `web` script only.
- Modify `pipeline.js`: export `parseArgs`, `findTopicDirs`, and `printAudit` only if tests need them; otherwise leave unchanged.
- Add tests in `tests/workflow.test.js`, `tests/project-store.test.js`, `tests/kimi-provider.test.js`, and `tests/html-generator.test.js`.

---

### Task 1: Workflow Status Guard

**Files:**
- Create: `core/workflow.js`
- Test: `tests/workflow.test.js`

**Interfaces:**
- Produces: `STATUSES: string[]`
- Produces: `canTransition(from: string, to: string): boolean`
- Produces: `assertTransition(from: string, to: string): void`
- Produces: `nextRequiredAction(status: string): string`

- [ ] **Step 1: Write the failing test**

Create `tests/workflow.test.js`:

```js
const assert = require("node:assert/strict");
const test = require("node:test");

const {
  STATUSES,
  assertTransition,
  canTransition,
  nextRequiredAction
} = require("../core/workflow");

test("workflow exposes the MVP statuses in order", () => {
  assert.deepEqual(STATUSES, [
    "created",
    "source_uploaded",
    "source_analyzed",
    "angle_selected",
    "draft_generated",
    "draft_approved",
    "style_confirmed",
    "html_generated",
    "checked",
    "exported"
  ]);
});

test("canTransition only allows forward one-step transitions", () => {
  assert.equal(canTransition("created", "source_uploaded"), true);
  assert.equal(canTransition("source_uploaded", "created"), false);
  assert.equal(canTransition("created", "draft_generated"), false);
});

test("assertTransition throws a useful error for invalid transitions", () => {
  assert.throws(
    () => assertTransition("created", "html_generated"),
    /Invalid workflow transition: created -> html_generated/
  );
});

test("nextRequiredAction returns user-facing action text", () => {
  assert.equal(nextRequiredAction("created"), "添加来源内容");
  assert.equal(nextRequiredAction("draft_approved"), "确认封面和配色");
  assert.equal(nextRequiredAction("exported"), "下载 PNG 切片");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL with `Cannot find module '../core/workflow'`.

- [ ] **Step 3: Write minimal implementation**

Create `core/workflow.js`:

```js
const STATUSES = [
  "created",
  "source_uploaded",
  "source_analyzed",
  "angle_selected",
  "draft_generated",
  "draft_approved",
  "style_confirmed",
  "html_generated",
  "checked",
  "exported"
];

const ACTIONS = {
  created: "添加来源内容",
  source_uploaded: "解析内容结构",
  source_analyzed: "选择选题角度",
  angle_selected: "生成文案稿",
  draft_generated: "确认文案稿",
  draft_approved: "确认封面和配色",
  style_confirmed: "生成 HTML",
  html_generated: "运行检查",
  checked: "导出 PNG 切片",
  exported: "下载 PNG 切片"
};

function statusIndex(status) {
  return STATUSES.indexOf(status);
}

function canTransition(from, to) {
  const fromIndex = statusIndex(from);
  const toIndex = statusIndex(to);
  return fromIndex !== -1 && toIndex !== -1 && toIndex === fromIndex + 1;
}

function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid workflow transition: ${from} -> ${to}`);
  }
}

function nextRequiredAction(status) {
  return ACTIONS[status] || "检查项目状态";
}

module.exports = {
  STATUSES,
  assertTransition,
  canTransition,
  nextRequiredAction
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS for `tests/workflow.test.js`; existing pipeline tests still pass.

- [ ] **Step 5: Commit**

```bash
git add core/workflow.js tests/workflow.test.js
git commit -m "feat: add workflow status guard"
```

---

### Task 2: File-Backed Project Store

**Files:**
- Create: `core/project-store.js`
- Test: `tests/project-store.test.js`

**Interfaces:**
- Consumes: `assertTransition(from, to)` from `core/workflow.js`
- Produces: `createProject({ rootDir, title, contentType }): Project`
- Produces: `loadProject(projectDir): Project`
- Produces: `listProjects(rootDir): Project[]`
- Produces: `saveSourceText(projectDir, text): Project`
- Produces: `setAnalysis(projectDir, analysis): Project`
- Produces: `selectAngle(projectDir, angleId): Project`
- Produces: `saveDraft(projectDir, markdown): Project`
- Produces: `approveDraft(projectDir): Project`
- Produces: `confirmStyle(projectDir, styleConfig): Project`
- Produces: `markHtmlGenerated(projectDir, htmlPath): Project`
- Produces: `markChecked(projectDir, audit): Project`
- Produces: `markExported(projectDir, exportCount): Project`

- [ ] **Step 1: Write the failing test**

Create `tests/project-store.test.js`:

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  approveDraft,
  confirmStyle,
  createProject,
  listProjects,
  loadProject,
  markChecked,
  markExported,
  markHtmlGenerated,
  saveDraft,
  saveSourceText,
  selectAngle,
  setAnalysis
} = require("../core/project-store");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "web-mvp-projects-"));
}

test("createProject creates a slugged project directory with metadata", () => {
  const rootDir = tempRoot();
  const project = createProject({
    rootDir,
    title: "认知偏差 解读",
    contentType: "article_explainer"
  });

  assert.equal(project.title, "认知偏差 解读");
  assert.equal(project.content_type, "article_explainer");
  assert.equal(project.status, "created");
  assert.ok(fs.existsSync(path.join(project.project_dir, "assets")));
  assert.ok(fs.existsSync(path.join(project.project_dir, "project.json")));
});

test("saveSourceText persists source text and advances status", () => {
  const rootDir = tempRoot();
  const project = createProject({ rootDir, title: "Source Demo", contentType: "article_explainer" });
  const updated = saveSourceText(project.project_dir, "这是一段长文。");

  assert.equal(updated.status, "source_uploaded");
  assert.equal(fs.readFileSync(path.join(project.project_dir, "source.txt"), "utf8"), "这是一段长文。");
});

test("project can move through the MVP confirmation flow", () => {
  const rootDir = tempRoot();
  const project = createProject({ rootDir, title: "Flow Demo", contentType: "article_explainer" });
  saveSourceText(project.project_dir, "source");
  setAnalysis(project.project_dir, {
    summary: "summary",
    angles: [{ id: "angle-1", title: "角度一", summary: "摘要" }]
  });
  selectAngle(project.project_dir, "angle-1");
  saveDraft(project.project_dir, "# Draft");
  approveDraft(project.project_dir);
  const styled = confirmStyle(project.project_dir, {
    palette: "warm",
    coverPath: "assets/top.png"
  });
  const htmlReady = markHtmlGenerated(project.project_dir, path.join(project.project_dir, "Flow Demo.html"));
  const checked = markChecked(project.project_dir, [{ htmlName: "Flow Demo.html", exportableSections: 2 }]);
  const exported = markExported(project.project_dir, 2);

  assert.equal(styled.status, "style_confirmed");
  assert.equal(htmlReady.status, "html_generated");
  assert.equal(checked.status, "checked");
  assert.equal(exported.status, "exported");
  assert.equal(exported.selected_angle_id, "angle-1");
  assert.equal(exported.style_config.palette, "warm");
  assert.equal(exported.export_count, 2);
});

test("listProjects returns newest project metadata first", () => {
  const rootDir = tempRoot();
  createProject({ rootDir, title: "A", contentType: "article_explainer" });
  createProject({ rootDir, title: "B", contentType: "article_explainer" });

  const projects = listProjects(rootDir);
  assert.deepEqual(projects.map(project => project.title), ["B", "A"]);
});

test("loadProject throws for a missing project", () => {
  assert.throws(() => loadProject(path.join(tempRoot(), "missing")), /Project metadata not found/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL with `Cannot find module '../core/project-store'`.

- [ ] **Step 3: Write minimal implementation**

Create `core/project-store.js`:

```js
const fs = require("node:fs");
const path = require("node:path");
const { assertTransition } = require("./workflow");

function slugify(value) {
  const ascii = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return ascii || `project-${Date.now()}`;
}

function now() {
  return new Date().toISOString();
}

function metadataPath(projectDir) {
  return path.join(projectDir, "project.json");
}

function writeProject(project) {
  fs.writeFileSync(metadataPath(project.project_dir), JSON.stringify(project, null, 2), "utf8");
  return project;
}

function loadProject(projectDir) {
  const filePath = metadataPath(projectDir);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Project metadata not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function advance(project, nextStatus) {
  assertTransition(project.status, nextStatus);
  project.status = nextStatus;
  project.updated_at = now();
  return writeProject(project);
}

function uniqueProjectDir(rootDir, title) {
  const base = slugify(title);
  let candidate = path.join(rootDir, base);
  let index = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(rootDir, `${base}-${index}`);
    index++;
  }
  return candidate;
}

function createProject({ rootDir, title, contentType }) {
  const projectDir = uniqueProjectDir(rootDir, title);
  fs.mkdirSync(path.join(projectDir, "assets"), { recursive: true });
  const timestamp = now();
  const project = {
    id: path.basename(projectDir),
    title,
    content_type: contentType,
    status: "created",
    selected_angle_id: null,
    style_config: null,
    project_dir: projectDir,
    created_at: timestamp,
    updated_at: timestamp
  };
  return writeProject(project);
}

function listProjects(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  return fs.readdirSync(rootDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(rootDir, entry.name))
    .filter(projectDir => fs.existsSync(metadataPath(projectDir)))
    .map(loadProject)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function saveSourceText(projectDir, text) {
  const project = loadProject(projectDir);
  fs.writeFileSync(path.join(projectDir, "source.txt"), text, "utf8");
  return advance(project, "source_uploaded");
}

function setAnalysis(projectDir, analysis) {
  const project = loadProject(projectDir);
  fs.writeFileSync(path.join(projectDir, "analysis.json"), JSON.stringify(analysis, null, 2), "utf8");
  project.analysis = analysis;
  return advance(project, "source_analyzed");
}

function selectAngle(projectDir, angleId) {
  const project = loadProject(projectDir);
  project.selected_angle_id = angleId;
  return advance(project, "angle_selected");
}

function saveDraft(projectDir, markdown) {
  const project = loadProject(projectDir);
  fs.writeFileSync(path.join(projectDir, "draft.md"), markdown, "utf8");
  return advance(project, "draft_generated");
}

function approveDraft(projectDir) {
  const project = loadProject(projectDir);
  return advance(project, "draft_approved");
}

function confirmStyle(projectDir, styleConfig) {
  const project = loadProject(projectDir);
  project.style_config = styleConfig;
  return advance(project, "style_confirmed");
}

function markHtmlGenerated(projectDir, htmlPath) {
  const project = loadProject(projectDir);
  project.html_path = htmlPath;
  return advance(project, "html_generated");
}

function markChecked(projectDir, audit) {
  const project = loadProject(projectDir);
  project.latest_audit = audit;
  return advance(project, "checked");
}

function markExported(projectDir, exportCount) {
  const project = loadProject(projectDir);
  project.export_count = exportCount;
  return advance(project, "exported");
}

module.exports = {
  approveDraft,
  confirmStyle,
  createProject,
  listProjects,
  loadProject,
  markChecked,
  markExported,
  markHtmlGenerated,
  saveDraft,
  saveSourceText,
  selectAngle,
  setAnalysis
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS for workflow, project store, and existing pipeline tests.

- [ ] **Step 5: Commit**

```bash
git add core/project-store.js tests/project-store.test.js
git commit -m "feat: add file backed project store"
```

---

### Task 3: Kimi Provider and Prompt Helpers

**Files:**
- Create: `core/ai/prompts.js`
- Create: `core/ai/kimi-provider.js`
- Test: `tests/kimi-provider.test.js`

**Interfaces:**
- Produces: `extractJsonObject(text: string): object`
- Produces: `buildAnalyzePrompt(sourceText: string): { system: string, user: string }`
- Produces: `buildDraftPrompt({ sourceText, analysis, angleId }): { system: string, user: string }`
- Produces: `createKimiProvider({ apiKey, baseURL, model, fetchImpl }): { analyzeSource, generateDraft }`

- [ ] **Step 1: Write the failing test**

Create `tests/kimi-provider.test.js`:

```js
const assert = require("node:assert/strict");
const test = require("node:test");

const { extractJsonObject } = require("../core/ai/prompts");
const { createKimiProvider } = require("../core/ai/kimi-provider");

test("extractJsonObject parses fenced JSON", () => {
  const result = extractJsonObject("```json\n{\"summary\":\"ok\"}\n```");
  assert.deepEqual(result, { summary: "ok" });
});

test("extractJsonObject parses plain JSON", () => {
  const result = extractJsonObject("{\"draft\":\"hello\"}");
  assert.deepEqual(result, { draft: "hello" });
});

test("createKimiProvider sends OpenAI compatible chat completion request", async () => {
  const calls = [];
  const provider = createKimiProvider({
    apiKey: "test-key",
    baseURL: "https://api.moonshot.ai/v1",
    model: "kimi-k2.6",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        async json() {
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  summary: "一段摘要",
                  angles: [{ id: "angle-1", title: "科普角度", summary: "适合科普" }]
                })
              }
            }],
            usage: { prompt_tokens: 10, completion_tokens: 20 }
          };
        }
      };
    }
  });

  const result = await provider.analyzeSource("长文内容");

  assert.equal(result.summary, "一段摘要");
  assert.equal(result.angles[0].id, "angle-1");
  assert.equal(calls[0].url, "https://api.moonshot.ai/v1/chat/completions");
  assert.equal(calls[0].options.headers.Authorization, "Bearer test-key");
  assert.equal(JSON.parse(calls[0].options.body).model, "kimi-k2.6");
});

test("createKimiProvider throws useful errors for failed API responses", async () => {
  const provider = createKimiProvider({
    apiKey: "test-key",
    baseURL: "https://api.moonshot.ai/v1",
    model: "kimi-k2.6",
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      async text() {
        return "rate limited";
      }
    })
  });

  await assert.rejects(
    () => provider.analyzeSource("长文内容"),
    /Kimi API failed: 429 rate limited/
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL with `Cannot find module '../core/ai/prompts'`.

- [ ] **Step 3: Write prompt helpers**

Create `core/ai/prompts.js`:

```js
function stripFence(text) {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractJsonObject(text) {
  const stripped = stripFence(text);
  return JSON.parse(stripped);
}

function buildAnalyzePrompt(sourceText) {
  return {
    system: [
      "你是面向公众号知识博主的内容策划助手。",
      "你必须输出严格 JSON，不要输出 Markdown。",
      "JSON 字段必须包含 summary 和 angles。",
      "angles 是 3 到 5 个选题角度，每个角度包含 id、title、summary。"
    ].join("\n"),
    user: [
      "请分析下面的来源内容，提炼摘要并给出适合公众号长图的选题角度。",
      "",
      sourceText
    ].join("\n")
  };
}

function buildDraftPrompt({ sourceText, analysis, angleId }) {
  return {
    system: [
      "你是公众号知识长图文案作者。",
      "你必须输出严格 JSON，不要输出 Markdown 外壳。",
      "JSON 字段必须包含 markdown。",
      "markdown 内容用于后续生成长图 HTML，论文或报告来源信息放在最后。"
    ].join("\n"),
    user: [
      `已选择选题角度：${angleId}`,
      "内容分析：",
      JSON.stringify(analysis, null, 2),
      "",
      "来源内容：",
      sourceText
    ].join("\n")
  };
}

module.exports = {
  buildAnalyzePrompt,
  buildDraftPrompt,
  extractJsonObject
};
```

- [ ] **Step 4: Write Kimi provider**

Create `core/ai/kimi-provider.js`:

```js
const {
  buildAnalyzePrompt,
  buildDraftPrompt,
  extractJsonObject
} = require("./prompts");

function createKimiProvider({
  apiKey = process.env.KIMI_API_KEY,
  baseURL = process.env.KIMI_BASE_URL || "https://api.moonshot.ai/v1",
  model = process.env.KIMI_MAIN_MODEL || "kimi-k2.6",
  fetchImpl = globalThis.fetch
} = {}) {
  if (!apiKey) {
    throw new Error("KIMI_API_KEY is required");
  }
  if (!fetchImpl) {
    throw new Error("A fetch implementation is required");
  }

  async function complete(prompt) {
    const response = await fetchImpl(`${baseURL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user }
        ],
        temperature: 0.4
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Kimi API failed: ${response.status} ${body}`);
    }

    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Kimi API response did not include message content");
    }
    return extractJsonObject(content);
  }

  return {
    analyzeSource(sourceText) {
      return complete(buildAnalyzePrompt(sourceText));
    },
    generateDraft(input) {
      return complete(buildDraftPrompt(input));
    }
  };
}

module.exports = { createKimiProvider };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`

Expected: PASS for Kimi provider tests and previous tests.

- [ ] **Step 6: Commit**

```bash
git add core/ai/prompts.js core/ai/kimi-provider.js tests/kimi-provider.test.js
git commit -m "feat: add kimi provider"
```

---

### Task 4: Simple HTML Generator

**Files:**
- Create: `core/html/generate-simple-html.js`
- Test: `tests/html-generator.test.js`

**Interfaces:**
- Produces: `generateSimpleHtml({ title, draftMarkdown, styleConfig }): string`
- Produces: `writeProjectHtml({ projectDir, title, draftMarkdown, styleConfig }): string`

- [ ] **Step 1: Write the failing test**

Create `tests/html-generator.test.js`:

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  generateSimpleHtml,
  writeProjectHtml
} = require("../core/html/generate-simple-html");

test("generateSimpleHtml creates exportable section elements", () => {
  const html = generateSimpleHtml({
    title: "认知偏差",
    draftMarkdown: "# 标题\n\n第一段\n\n## 模块一\n\n内容",
    styleConfig: { background: "#fff7e8", accent: "#8b3a2b" }
  });

  assert.match(html, /<section class="section cover">/);
  assert.match(html, /<section class="section content">/);
  assert.match(html, /assets\/top\.png/);
  assert.match(html, /认知偏差/);
});

test("writeProjectHtml writes title based html file", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "html-generator-"));
  const htmlPath = writeProjectHtml({
    projectDir,
    title: "Demo",
    draftMarkdown: "正文",
    styleConfig: { background: "#ffffff", accent: "#111111" }
  });

  assert.equal(path.basename(htmlPath), "Demo.html");
  assert.ok(fs.existsSync(htmlPath));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL with `Cannot find module '../core/html/generate-simple-html'`.

- [ ] **Step 3: Write minimal implementation**

Create `core/html/generate-simple-html.js`:

```js
const fs = require("node:fs");
const path = require("node:path");

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function markdownToBlocks(markdown) {
  return markdown
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => {
      if (block.startsWith("# ")) return `<h1>${escapeHtml(block.slice(2))}</h1>`;
      if (block.startsWith("## ")) return `<h2>${escapeHtml(block.slice(3))}</h2>`;
      if (block.startsWith("- ")) {
        const items = block.split("\n")
          .filter(line => line.startsWith("- "))
          .map(line => `<li>${escapeHtml(line.slice(2))}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }
      return `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`;
    });
}

function generateSimpleHtml({ title, draftMarkdown, styleConfig = {} }) {
  const background = styleConfig.background || "#fff7e8";
  const accent = styleConfig.accent || "#8b3a2b";
  const blocks = markdownToBlocks(draftMarkdown);
  const sections = [];

  sections.push(`
    <section class="section cover">
      <img class="cover-image" src="assets/top.png" alt="">
      <h1>${escapeHtml(title)}</h1>
    </section>
  `);

  for (let i = 0; i < blocks.length; i += 3) {
    sections.push(`
      <section class="section content">
        ${blocks.slice(i, i + 3).join("\n")}
      </section>
    `);
  }

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; background: ${background}; color: #231815; font-family: Arial, "Microsoft YaHei", sans-serif; }
    .page { width: 390px; margin: 0 auto; background: ${background}; }
    .section { box-sizing: border-box; width: 390px; padding: 28px 24px; background: ${background}; }
    .cover { min-height: 520px; display: flex; flex-direction: column; justify-content: end; }
    .cover-image { width: 100%; border-radius: 8px; margin-bottom: 24px; }
    h1 { margin: 0 0 16px; font-size: 32px; line-height: 1.18; color: ${accent}; }
    h2 { margin: 0 0 12px; font-size: 23px; line-height: 1.3; color: ${accent}; }
    p, li { font-size: 16px; line-height: 1.78; }
    ul { padding-left: 1.2em; }
  </style>
</head>
<body>
  <main class="page">
    ${sections.join("\n")}
  </main>
</body>
</html>`;
}

function safeHtmlName(title) {
  return `${title.replace(/[\\/:*?"<>|]/g, "-")}.html`;
}

function writeProjectHtml({ projectDir, title, draftMarkdown, styleConfig }) {
  const htmlPath = path.join(projectDir, safeHtmlName(title));
  fs.writeFileSync(htmlPath, generateSimpleHtml({ title, draftMarkdown, styleConfig }), "utf8");
  return htmlPath;
}

module.exports = {
  generateSimpleHtml,
  writeProjectHtml
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS for HTML generator tests and previous tests.

- [ ] **Step 5: Commit**

```bash
git add core/html/generate-simple-html.js tests/html-generator.test.js
git commit -m "feat: add simple html generator"
```

---

### Task 5: Native HTTP API Server

**Files:**
- Create: `server/web-server.js`
- Modify: `package.json`
- Test: `tests/web-server.test.js`

**Interfaces:**
- Consumes: project store functions from `core/project-store.js`
- Consumes: `createKimiProvider()` from `core/ai/kimi-provider.js`
- Consumes: `writeProjectHtml()` from `core/html/generate-simple-html.js`
- Consumes: `auditTopic()` and `processTopic()` from `pipeline.js`
- Produces: `createServer({ rootDir, aiProvider }): http.Server`

- [ ] **Step 1: Write the failing test**

Create `tests/web-server.test.js`:

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createServer } = require("../server/web-server");

async function request(baseUrl, method, route, body) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null
  };
}

async function withServer(handler) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-server-"));
  const aiProvider = {
    async analyzeSource() {
      return {
        summary: "摘要",
        angles: [{ id: "angle-1", title: "科普角度", summary: "适合科普" }]
      };
    },
    async generateDraft() {
      return { markdown: "# 科普角度\n\n正文" };
    }
  };
  const server = createServer({ rootDir, aiProvider });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await handler(`http://127.0.0.1:${port}`, rootDir);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test("API creates a project and runs the pasted-text flow", async () => {
  await withServer(async baseUrl => {
    const created = await request(baseUrl, "POST", "/api/projects", {
      title: "Demo",
      contentType: "article_explainer"
    });
    assert.equal(created.status, 200);
    const id = created.body.project.id;

    const source = await request(baseUrl, "POST", `/api/projects/${id}/source/text`, {
      text: "长文内容"
    });
    assert.equal(source.body.project.status, "source_uploaded");

    const analyzed = await request(baseUrl, "POST", `/api/projects/${id}/analyze`);
    assert.equal(analyzed.body.project.status, "source_analyzed");
    assert.equal(analyzed.body.analysis.summary, "摘要");

    const selected = await request(baseUrl, "POST", `/api/projects/${id}/angles/angle-1/select`);
    assert.equal(selected.body.project.status, "angle_selected");

    const draft = await request(baseUrl, "POST", `/api/projects/${id}/drafts`);
    assert.equal(draft.body.project.status, "draft_generated");
    assert.match(draft.body.draft, /# 科普角度/);
  });
});

test("API returns 404 for missing projects", async () => {
  await withServer(async baseUrl => {
    const response = await request(baseUrl, "GET", "/api/projects/missing", null);
    assert.equal(response.status, 404);
    assert.match(response.body.error, /Project not found/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL with `Cannot find module '../server/web-server'`.

- [ ] **Step 3: Write API server implementation**

Create `server/web-server.js`:

```js
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const { createKimiProvider } = require("../core/ai/kimi-provider");
const {
  approveDraft,
  confirmStyle,
  createProject,
  listProjects,
  loadProject,
  markChecked,
  markHtmlGenerated,
  saveDraft,
  saveSourceText,
  selectAngle,
  setAnalysis
} = require("../core/project-store");
const { writeProjectHtml } = require("../core/html/generate-simple-html");
const { auditTopic } = require("../pipeline");

function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function projectDir(rootDir, id) {
  const dir = path.join(rootDir, id);
  if (!fs.existsSync(path.join(dir, "project.json"))) {
    throw new Error(`Project not found: ${id}`);
  }
  return dir;
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function createServer({
  rootDir = path.resolve("projects"),
  staticDir = path.resolve("web"),
  aiProvider = createKimiProvider()
} = {}) {
  fs.mkdirSync(rootDir, { recursive: true });

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const parts = url.pathname.split("/").filter(Boolean);

      if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
        const filePath = url.pathname === "/"
          ? path.join(staticDir, "index.html")
          : path.join(staticDir, url.pathname);
        if (!filePath.startsWith(staticDir) || !fs.existsSync(filePath)) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const type = filePath.endsWith(".css") ? "text/css" : filePath.endsWith(".js") ? "text/javascript" : "text/html";
        res.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
        res.end(fs.readFileSync(filePath));
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/projects") {
        json(res, 200, { projects: listProjects(rootDir) });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/projects") {
        const body = await readJson(req);
        const project = createProject({
          rootDir,
          title: body.title,
          contentType: body.contentType || "article_explainer"
        });
        json(res, 200, { project });
        return;
      }

      if (parts[0] === "api" && parts[1] === "projects" && parts[2]) {
        const id = parts[2];
        const dir = projectDir(rootDir, id);

        if (req.method === "GET" && parts.length === 3) {
          json(res, 200, { project: loadProject(dir) });
          return;
        }

        if (req.method === "POST" && parts[3] === "source" && parts[4] === "text") {
          const body = await readJson(req);
          json(res, 200, { project: saveSourceText(dir, body.text || "") });
          return;
        }

        if (req.method === "POST" && parts[3] === "analyze") {
          const sourceText = readText(path.join(dir, "source.txt"));
          const analysis = await aiProvider.analyzeSource(sourceText);
          json(res, 200, { project: setAnalysis(dir, analysis), analysis });
          return;
        }

        if (req.method === "POST" && parts[3] === "angles" && parts[5] === "select") {
          json(res, 200, { project: selectAngle(dir, parts[4]) });
          return;
        }

        if (req.method === "POST" && parts[3] === "drafts") {
          const project = loadProject(dir);
          const sourceText = readText(path.join(dir, "source.txt"));
          const analysis = JSON.parse(readText(path.join(dir, "analysis.json")));
          const draft = await aiProvider.generateDraft({
            sourceText,
            analysis,
            angleId: project.selected_angle_id
          });
          json(res, 200, { project: saveDraft(dir, draft.markdown), draft: draft.markdown });
          return;
        }

        if (req.method === "POST" && parts[3] === "drafts" && parts[5] === "approve") {
          json(res, 200, { project: approveDraft(dir) });
          return;
        }

        if (req.method === "POST" && parts[3] === "style" && parts[4] === "confirm") {
          const body = await readJson(req);
          json(res, 200, { project: confirmStyle(dir, body.styleConfig || {}) });
          return;
        }

        if (req.method === "POST" && parts[3] === "html") {
          const project = loadProject(dir);
          const htmlPath = writeProjectHtml({
            projectDir: dir,
            title: project.title,
            draftMarkdown: readText(path.join(dir, "draft.md")),
            styleConfig: project.style_config || {}
          });
          json(res, 200, { project: markHtmlGenerated(dir, htmlPath), htmlPath });
          return;
        }

        if (req.method === "POST" && parts[3] === "check") {
          const audit = auditTopic(dir);
          json(res, 200, { project: markChecked(dir, audit), audit });
          return;
        }
      }

      json(res, 404, { error: "Route not found" });
    } catch (error) {
      const status = /Project not found/.test(error.message) ? 404 : 500;
      json(res, status, { error: error.message });
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  createServer().listen(port, () => {
    console.log(`Web MVP running at http://localhost:${port}`);
  });
}

module.exports = { createServer };
```

- [ ] **Step 4: Add npm script**

Modify `package.json`:

```json
{
  "scripts": {
    "test": "node --test tests/*.test.js",
    "check": "node pipeline.js --check",
    "web": "node server/web-server.js"
  },
  "dependencies": {
    "playwright": "^1.60.0"
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`

Expected: PASS for web server tests and previous tests.

- [ ] **Step 6: Commit**

```bash
git add server/web-server.js package.json tests/web-server.test.js
git commit -m "feat: add local web api server"
```

---

### Task 6: Static Web Workbench

**Files:**
- Create: `web/index.html`
- Create: `web/app.js`
- Create: `web/styles.css`

**Interfaces:**
- Consumes API routes from `server/web-server.js`
- Produces a local UI at `http://localhost:3000`

- [ ] **Step 1: Create HTML shell**

Create `web/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI 知识长图工作台</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <main class="app">
    <aside class="sidebar">
      <div class="brand">AI 知识长图</div>
      <form id="create-form" class="panel">
        <label>
          标题
          <input name="title" required placeholder="输入项目标题">
        </label>
        <label>
          类型
          <select name="contentType">
            <option value="article_explainer">文章解读</option>
            <option value="academic_paper">论文解读</option>
            <option value="report_explainer">报告解读</option>
          </select>
        </label>
        <button type="submit">创建项目</button>
      </form>
      <div id="project-list" class="project-list"></div>
    </aside>

    <section class="workspace">
      <header class="topbar">
        <div>
          <h1 id="project-title">选择或创建项目</h1>
          <p id="project-status">准备开始</p>
        </div>
      </header>

      <section class="panel">
        <h2>来源内容</h2>
        <textarea id="source-text" placeholder="粘贴文章、笔记或报告片段"></textarea>
        <button id="save-source">保存来源</button>
      </section>

      <section class="panel actions">
        <button id="analyze">解析内容</button>
        <button id="select-angle">选择第一个角度</button>
        <button id="generate-draft">生成文案</button>
        <button id="approve-draft">确认文案</button>
        <button id="confirm-style">确认配色</button>
        <button id="generate-html">生成 HTML</button>
        <button id="check-html">检查</button>
      </section>

      <section class="panel split">
        <div>
          <h2>分析结果</h2>
          <pre id="analysis"></pre>
        </div>
        <div>
          <h2>文案稿</h2>
          <textarea id="draft"></textarea>
        </div>
      </section>

      <section class="panel">
        <h2>日志</h2>
        <pre id="log"></pre>
      </section>
    </section>
  </main>
  <script src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create frontend JavaScript**

Create `web/app.js`:

```js
let currentProject = null;
let currentAnalysis = null;

const elements = {
  createForm: document.querySelector("#create-form"),
  projectList: document.querySelector("#project-list"),
  projectTitle: document.querySelector("#project-title"),
  projectStatus: document.querySelector("#project-status"),
  sourceText: document.querySelector("#source-text"),
  saveSource: document.querySelector("#save-source"),
  analyze: document.querySelector("#analyze"),
  selectAngle: document.querySelector("#select-angle"),
  generateDraft: document.querySelector("#generate-draft"),
  approveDraft: document.querySelector("#approve-draft"),
  confirmStyle: document.querySelector("#confirm-style"),
  generateHtml: document.querySelector("#generate-html"),
  checkHtml: document.querySelector("#check-html"),
  analysis: document.querySelector("#analysis"),
  draft: document.querySelector("#draft"),
  log: document.querySelector("#log")
};

function log(message) {
  elements.log.textContent = `${new Date().toLocaleTimeString()} ${message}\n${elements.log.textContent}`;
}

async function api(route, options = {}) {
  const response = await fetch(route, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "请求失败");
  return payload;
}

function renderProject(project) {
  currentProject = project;
  elements.projectTitle.textContent = project.title;
  elements.projectStatus.textContent = project.status;
}

async function loadProjects() {
  const payload = await api("/api/projects");
  elements.projectList.innerHTML = "";
  for (const project of payload.projects) {
    const button = document.createElement("button");
    button.textContent = `${project.title} · ${project.status}`;
    button.addEventListener("click", async () => {
      const detail = await api(`/api/projects/${project.id}`);
      renderProject(detail.project);
      log(`打开项目 ${project.title}`);
    });
    elements.projectList.appendChild(button);
  }
}

elements.createForm.addEventListener("submit", async event => {
  event.preventDefault();
  const form = new FormData(elements.createForm);
  const payload = await api("/api/projects", {
    method: "POST",
    body: {
      title: form.get("title"),
      contentType: form.get("contentType")
    }
  });
  renderProject(payload.project);
  await loadProjects();
  log("项目已创建");
});

elements.saveSource.addEventListener("click", async () => {
  const payload = await api(`/api/projects/${currentProject.id}/source/text`, {
    method: "POST",
    body: { text: elements.sourceText.value }
  });
  renderProject(payload.project);
  log("来源已保存");
});

elements.analyze.addEventListener("click", async () => {
  const payload = await api(`/api/projects/${currentProject.id}/analyze`, { method: "POST" });
  currentAnalysis = payload.analysis;
  elements.analysis.textContent = JSON.stringify(payload.analysis, null, 2);
  renderProject(payload.project);
  log("内容解析完成");
});

elements.selectAngle.addEventListener("click", async () => {
  const first = currentAnalysis?.angles?.[0];
  if (!first) throw new Error("没有可选择的角度");
  const payload = await api(`/api/projects/${currentProject.id}/angles/${first.id}/select`, { method: "POST" });
  renderProject(payload.project);
  log(`已选择角度：${first.title}`);
});

elements.generateDraft.addEventListener("click", async () => {
  const payload = await api(`/api/projects/${currentProject.id}/drafts`, { method: "POST" });
  elements.draft.value = payload.draft;
  renderProject(payload.project);
  log("文案已生成");
});

elements.approveDraft.addEventListener("click", async () => {
  const payload = await api(`/api/projects/${currentProject.id}/drafts/current/approve`, { method: "POST" });
  renderProject(payload.project);
  log("文案已确认");
});

elements.confirmStyle.addEventListener("click", async () => {
  const payload = await api(`/api/projects/${currentProject.id}/style/confirm`, {
    method: "POST",
    body: { styleConfig: { background: "#fff7e8", accent: "#8b3a2b", coverPath: "assets/top.png" } }
  });
  renderProject(payload.project);
  log("配色已确认");
});

elements.generateHtml.addEventListener("click", async () => {
  const payload = await api(`/api/projects/${currentProject.id}/html`, { method: "POST" });
  renderProject(payload.project);
  log(`HTML 已生成：${payload.htmlPath}`);
});

elements.checkHtml.addEventListener("click", async () => {
  const payload = await api(`/api/projects/${currentProject.id}/check`, { method: "POST" });
  elements.analysis.textContent = JSON.stringify(payload.audit, null, 2);
  log("检查完成");
});

loadProjects().catch(error => log(error.message));
```

- [ ] **Step 3: Create CSS**

Create `web/styles.css`:

```css
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: Arial, "Microsoft YaHei", sans-serif;
  color: #201916;
  background: #f6f1ea;
}
.app {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 300px 1fr;
}
.sidebar {
  border-right: 1px solid #ddd2c4;
  padding: 20px;
  background: #fffaf3;
}
.brand {
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 20px;
}
.workspace {
  padding: 24px;
}
.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
h1, h2, p {
  margin-top: 0;
}
.panel {
  border: 1px solid #ddd2c4;
  border-radius: 8px;
  background: #fffdf9;
  padding: 16px;
  margin-bottom: 16px;
}
label {
  display: block;
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 12px;
}
input, select, textarea {
  width: 100%;
  border: 1px solid #d4c5b4;
  border-radius: 6px;
  padding: 10px;
  font: inherit;
  background: #fff;
}
textarea {
  min-height: 180px;
  resize: vertical;
}
button {
  border: 0;
  border-radius: 6px;
  padding: 10px 12px;
  font-weight: 700;
  color: #fff;
  background: #8b3a2b;
  cursor: pointer;
}
.project-list {
  display: grid;
  gap: 8px;
}
.project-list button,
.actions button {
  width: 100%;
}
.actions {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
pre {
  white-space: pre-wrap;
  overflow: auto;
  max-height: 360px;
}
@media (max-width: 900px) {
  .app,
  .split {
    grid-template-columns: 1fr;
  }
  .actions {
    grid-template-columns: 1fr 1fr;
  }
}
```

- [ ] **Step 4: Run local server smoke test**

Run: `npm run web`

Expected: Terminal prints `Web MVP running at http://localhost:3000`.

Open: `http://localhost:3000`

Expected: The workbench renders with a sidebar, project form, source panel, action buttons, analysis panel, draft panel, and log panel.

- [ ] **Step 5: Run automated tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/index.html web/app.js web/styles.css
git commit -m "feat: add static web workbench"
```

---

### Task 7: Export Hook and Documentation

**Files:**
- Modify: `server/web-server.js`
- Modify: `README.md`
- Test: `tests/web-server.test.js`

**Interfaces:**
- Consumes: `exportSections({ inputPath, outputDir })` from `export-modules.js`
- Produces: `POST /api/projects/:id/export`

- [ ] **Step 1: Add failing export route test**

Append to `tests/web-server.test.js`:

```js
test("API check route reports generated HTML audit", async () => {
  await withServer(async baseUrl => {
    const created = await request(baseUrl, "POST", "/api/projects", {
      title: "Check Demo",
      contentType: "article_explainer"
    });
    const id = created.body.project.id;
    await request(baseUrl, "POST", `/api/projects/${id}/source/text`, { text: "长文内容" });
    await request(baseUrl, "POST", `/api/projects/${id}/analyze`);
    await request(baseUrl, "POST", `/api/projects/${id}/angles/angle-1/select`);
    await request(baseUrl, "POST", `/api/projects/${id}/drafts`);
    await request(baseUrl, "POST", `/api/projects/${id}/drafts/current/approve`);
    await request(baseUrl, "POST", `/api/projects/${id}/style/confirm`, {
      styleConfig: { background: "#fff7e8", accent: "#8b3a2b" }
    });
    await request(baseUrl, "POST", `/api/projects/${id}/html`);

    const checked = await request(baseUrl, "POST", `/api/projects/${id}/check`);

    assert.equal(checked.status, 200);
    assert.equal(checked.body.audit.length, 1);
    assert.ok(checked.body.audit[0].exportableSections >= 1);
  });
});
```

- [ ] **Step 2: Run test to verify current behavior**

Run: `npm test`

Expected: PASS if Task 5 check route already works. If it fails because `assets/top.png` is missing, continue to Step 3 and make check output visible without auto-advancing status.

- [ ] **Step 3: Add export route**

Modify `server/web-server.js` near the check route:

```js
const { exportSections } = require("../export-modules");
```

Add `markExported` to the existing project-store import:

```js
  markExported,
```

Add route:

```js
        if (req.method === "POST" && parts[3] === "export") {
          const project = loadProject(dir);
          if (!project.html_path) {
            json(res, 400, { error: "HTML has not been generated" });
            return;
          }
          const result = await exportSections({
            inputPath: project.html_path,
            outputDir: dir
          });
          json(res, 200, { project: markExported(dir, result.count), result });
          return;
        }
```

- [ ] **Step 4: Document local web usage**

Append to `README.md`:

```md
## 本地 Web MVP

```bash
npm run web
```

打开 `http://localhost:3000`，可以创建项目、粘贴正文、调用 Kimi API 生成分析和文案稿，并继续生成 HTML、检查资源和导出 PNG。

需要先在环境变量中配置：

```bash
set KIMI_API_KEY=你的Kimi API Key
set KIMI_BASE_URL=https://api.moonshot.ai/v1
set KIMI_MAIN_MODEL=kimi-k2.6
```
```

- [ ] **Step 5: Run verification**

Run: `npm test`

Expected: PASS.

Run: `npm run check`

Expected: Existing project checks still run through `pipeline.js`.

- [ ] **Step 6: Commit**

```bash
git add server/web-server.js tests/web-server.test.js README.md
git commit -m "feat: connect web mvp to export pipeline"
```

---

## Self-Review Notes

Spec coverage:

- Kimi Provider is covered in Task 3.
- Local project state and status transitions are covered in Tasks 1 and 2.
- Pasted-text source workflow is covered in Tasks 2, 5, and 6.
- HTML generation and section requirements are covered in Task 4.
- Existing pipeline reuse is covered in Tasks 5 and 7.
- Full SaaS requirements, database, Redis, object storage, login, PDF extraction, and worker isolation are intentionally deferred to later plans because this plan implements M1 only.

Placeholder scan:

- The plan contains no unresolved placeholder markers or unspecified implementation steps.
- Each code-producing step includes concrete code.

Type consistency:

- `project.project_dir`, `project.content_type`, `project.selected_angle_id`, and `project.style_config` are consistently used across project store, server, and HTML generator tasks.
- Kimi provider methods return `analysis` objects and `{ markdown }` draft objects matching server usage.
