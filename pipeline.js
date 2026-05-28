const path = require("path");
const fs = require("fs");
const { exportSections } = require("./export-modules");

function parseArgs(argv) {
  const args = { batch: false, check: false, force: false, batchDir: null, topicDir: null, newName: null };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--batch") {
      args.batch = true;
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args.batchDir = path.resolve(next);
        i++;
      } else {
        args.batchDir = path.resolve("projects");
      }
    } else if (arg === "--check" || arg === "--audit") {
      args.check = true;
    } else if (arg === "--force") {
      args.force = true;
    } else if (arg === "--new") {
      args.newName = argv[++i];
    } else if (!arg.startsWith("--")) {
      args.topicDir = path.resolve(arg);
    }
  }
  return args;
}

function findHtmlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries
    .filter(e => e.isFile() && e.name.endsWith(".html"))
    .map(e => path.join(dir, e.name));
}

function countSectionPngs(dir) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && /^\d{2}_section\.png$/i.test(e.name))
    .length;
}

function countExportableSections(html) {
  return (html.match(/<section[^>]*class=["'][^"']*\bsection\b[^"']*["']/gi) || []).length;
}

function findAssetRefs(html) {
  return Array.from(html.matchAll(/src=["'](assets\/[^"']+)["']/gi), match => match[1]);
}

function findTopicDirs(parentDir) {
  if (!fs.existsSync(parentDir)) return [];
  const entries = fs.readdirSync(parentDir, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory())
    .map(e => path.join(parentDir, e.name));
}

function auditHtml(htmlPath, dir) {
  const html = fs.readFileSync(htmlPath, "utf8");
  const assetRefs = [...new Set(findAssetRefs(html))];
  const missingAssets = assetRefs.filter(ref => !fs.existsSync(path.join(dir, ref)));

  return {
    htmlPath,
    htmlName: path.basename(htmlPath),
    exportableSections: countExportableSections(html),
    existingPngs: countSectionPngs(dir),
    assetRefs,
    missingAssets
  };
}

function auditTopic(dir) {
  return findHtmlFiles(dir).map(htmlPath => auditHtml(htmlPath, dir));
}

function processTopic(dir, force) {
  const audits = auditTopic(dir);
  if (audits.length === 0) return null;

  const results = [];
  for (const audit of audits) {
    const base = { ...audit, dir };
    if (audit.exportableSections === 0) {
      results.push({ ...base, status: "issue", reason: "没有找到可导出的 section.section" });
      continue;
    }
    if (audit.missingAssets.length > 0) {
      results.push({
        ...base,
        status: "issue",
        reason: `缺少资源：${audit.missingAssets.join(", ")}`
      });
      continue;
    }
    if (!force && audit.existingPngs === audit.exportableSections) {
      results.push({ ...base, status: "skip", reason: "已是最新", count: 0 });
      continue;
    }
    const reason = force
      ? "强制重新导出"
      : `section PNG 数量不匹配：已有 ${audit.existingPngs} 张，应有 ${audit.exportableSections} 张`;
    results.push({ ...base, status: "export", reason });
  }
  return results;
}

function printAudit(items) {
  for (const item of items) {
    const status = item.missingAssets.length > 0
      ? "资源缺失"
      : item.existingPngs === item.exportableSections
        ? "已就绪"
        : "需导出";
    const details = [
      `${item.htmlPath}`,
      `  状态：${status}`,
      `  section：${item.exportableSections}`,
      `  PNG：${item.existingPngs}`,
      `  图片引用：${item.assetRefs.length}`
    ];
    if (item.missingAssets.length > 0) {
      details.push(`  缺少：${item.missingAssets.join(", ")}`);
    }
    console.log(details.join("\n"));
  }
}

async function main() {
  const args = parseArgs(process.argv);

  let allResults = [];

  if (args.newName) {
    const topicDir = path.resolve("projects", args.newName);
    const assetsDir = path.join(topicDir, "assets");
    if (fs.existsSync(topicDir)) {
      console.log(`目录已存在：${topicDir}`);
      return;
    }
    fs.mkdirSync(assetsDir, { recursive: true });
    console.log(`已创建：${topicDir}/`);
    console.log(`已创建：${topicDir}/assets/`);
    return;
  }

  if (args.check && !args.batch && !args.topicDir) {
    args.batch = true;
    args.batchDir = path.resolve("projects");
  }

  if (args.batch) {
    const topicDirs = findTopicDirs(args.batchDir);
    if (topicDirs.length === 0) {
      console.log(`在 ${args.batchDir} 中没有找到主题目录`);
      return;
    }
    console.log(`扫描 ${args.batchDir}，找到 ${topicDirs.length} 个主题目录\n`);

    for (const dir of topicDirs) {
      const pending = processTopic(dir, args.force);
      if (!pending) continue;
      if (args.check) {
        printAudit(pending);
        console.log();
        allResults.push(...pending);
        continue;
      }
      for (const item of pending) {
        if (item.status === "skip") {
          console.log(`${item.htmlPath} → 跳过（${item.reason}）`);
          allResults.push({ ...item, sectionCount: null });
        } else if (item.status === "issue") {
          console.log(`${item.htmlPath} → 需处理（${item.reason}）`);
          allResults.push({ ...item, sectionCount: null, error: item.reason });
        } else {
          try {
            const { count } = await exportSections({
              inputPath: item.htmlPath,
              outputDir: dir
            });
            console.log(`${item.htmlPath} → 导出 ${count} 张`);
            allResults.push({ ...item, sectionCount: count });
          } catch (err) {
            console.error(`${item.htmlPath} → 失败：${err.message}`);
            allResults.push({ ...item, sectionCount: null, error: err.message });
          }
        }
      }
      console.log();
    }
  } else if (args.topicDir) {
    const pending = processTopic(args.topicDir, args.force);
    if (!pending) {
      console.log(`在 ${args.topicDir} 中没有找到 HTML 文件`);
      return;
    }
    if (args.check) {
      printAudit(pending);
      allResults.push(...pending);
    } else {
      for (const item of pending) {
        if (item.status === "skip") {
          console.log(`${item.htmlPath} → 跳过（${item.reason}）`);
          allResults.push({ ...item, sectionCount: null });
        } else if (item.status === "issue") {
          console.log(`${item.htmlPath} → 需处理（${item.reason}）`);
          allResults.push({ ...item, sectionCount: null, error: item.reason });
        } else {
          try {
            const { count } = await exportSections({
              inputPath: item.htmlPath,
              outputDir: args.topicDir
            });
            console.log(`${item.htmlPath} → 导出 ${count} 张`);
            allResults.push({ ...item, sectionCount: count });
          } catch (err) {
            console.error(`${item.htmlPath} → 失败：${err.message}`);
            allResults.push({ ...item, sectionCount: null, error: err.message });
          }
        }
      }
    }
  } else {
    console.log([
      "用法:",
      "  node pipeline.js --new <名称>       创建新主题目录（含 assets/）",
      "  node pipeline.js <主题目录>         处理单个主题",
      "  node pipeline.js --batch            批量处理 projects/ 下所有主题",
      "  node pipeline.js --batch <目录>     批量处理指定目录下所有主题",
      "  node pipeline.js --check            检查 projects/ 下所有主题，不导出",
      "  node pipeline.js <主题目录> --check 检查单个主题，不导出",
      "",
      "选项:",
      "  --force  强制重新导出，覆盖已有 PNG"
    ].join("\n"));
    return;
  }

  const exported = allResults.filter(r => r.status === "export" && !r.error);
  const skipped = allResults.filter(r => r.status === "skip");
  const failed = allResults.filter(r => r.error);
  const totalSections = exported.reduce((sum, r) => sum + (r.sectionCount || 0), 0);

  if (args.check) {
    const issues = allResults.filter(r => r.status === "issue" || r.missingAssets?.length > 0);
    const needsExport = allResults.filter(r => r.status === "export");
    console.log(`检查完成：${allResults.length} 个 HTML，${issues.length} 个资源/结构问题，${needsExport.length} 个需要导出`);
    return;
  }

  console.log(`完成：${exported.length} 个导出，${skipped.length} 个跳过` +
    (failed.length > 0 ? `，${failed.length} 个失败` : "") +
    (totalSections > 0 ? `，共 ${totalSections} 张新 PNG` : ""));
}

if (require.main === module) {
  main().catch(error => {
    console.error("流水线失败：", error);
    process.exit(1);
  });
}

module.exports = {
  auditHtml,
  auditTopic,
  countExportableSections,
  countSectionPngs,
  findAssetRefs,
  processTopic
};
