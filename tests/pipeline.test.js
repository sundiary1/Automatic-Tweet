const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { auditTopic, processTopic } = require("../pipeline");

function makeTopic(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-test-"));
  const topicDir = path.join(root, "topic");
  fs.mkdirSync(path.join(topicDir, "assets"), { recursive: true });

  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(topicDir, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }

  return topicDir;
}

function html(sectionCount, imageRefs = []) {
  const sections = Array.from({ length: sectionCount }, (_, i) => {
    const image = imageRefs[i] ? `<img src="${imageRefs[i]}">` : "";
    return `<section class="section"><h2>${i + 1}</h2>${image}</section>`;
  }).join("\n");
  return `<!doctype html><html><body>${sections}</body></html>`;
}

test("auditTopic reports missing local assets referenced by HTML", () => {
  const topicDir = makeTopic({
    "topic.html": html(2, ["assets/top.png", "assets/1.png"]),
    "assets/top.png": "fake"
  });

  const [audit] = auditTopic(topicDir);

  assert.equal(audit.exportableSections, 2);
  assert.deepEqual(audit.missingAssets, ["assets/1.png"]);
});

test("processTopic exports when section PNG count does not match exportable sections", () => {
  const topicDir = makeTopic({
    "topic.html": html(2),
    "01_section.png": "fake"
  });

  const [item] = processTopic(topicDir, false);

  assert.equal(item.status, "export");
  assert.equal(item.reason, "section PNG 数量不匹配：已有 1 张，应有 2 张");
});

test("processTopic skips only when assets exist and PNG count matches sections", () => {
  const topicDir = makeTopic({
    "topic.html": html(1, ["assets/top.png"]),
    "assets/top.png": "fake",
    "01_section.png": "fake"
  });

  const [item] = processTopic(topicDir, false);

  assert.equal(item.status, "skip");
  assert.equal(item.reason, "已是最新");
});
