const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

async function exportSections({
  inputPath,
  outputDir,
  width = 390,
  scale = 3,
  background = "#fff7e8"
}) {
  const htmlPath = path.resolve(inputPath);
  const fileUrl = "file://" + htmlPath;

  if (!fs.existsSync(htmlPath)) {
    throw new Error(`找不到 HTML 文件：${htmlPath}`);
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });

  const page = await browser.newPage({
    viewport: { width, height: 2000 },
    deviceScaleFactor: scale
  });

  await page.goto(fileUrl, { waitUntil: "networkidle" });

  await page.addStyleTag({
    content: `html, body { background: ${background} !important; }`
  });

  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
    const images = Array.from(document.images);
    await Promise.all(
      images.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      })
    );
  });

  const sections = page.locator("section.section");
  const count = await sections.count();

  console.log(`检测到 ${count} 个 section 模块`);

  for (let i = 0; i < count; i++) {
    const section = sections.nth(i);

    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    let box = await section.boundingBox();

    if (!box) {
      console.log(`跳过第 ${i + 1} 个 section：无法获取位置`);
      continue;
    }

    const padX = 12;
    const padTop = -1;
    const padBottom = 20;

    const neededHeight = Math.ceil(box.height + padTop + padBottom + 80);
    const currentViewport = page.viewportSize();

    if (currentViewport && neededHeight > currentViewport.height) {
      await page.setViewportSize({ width, height: neededHeight });
      await section.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      box = await section.boundingBox();
    }

    if (!box) {
      console.log(`跳过第 ${i + 1} 个 section：重新获取位置失败`);
      continue;
    }

    const clip = {
      x: Math.max(Math.floor(box.x - padX), 0),
      y: Math.max(Math.floor(box.y - padTop), 0),
      width: Math.ceil(Math.min(box.width + padX * 2, width)),
      height: Math.ceil(box.height + padTop + padBottom)
    };

    const outputPath = path.join(
      outputDir,
      `${String(i + 1).padStart(2, "0")}_section.png`
    );

    await page.screenshot({
      path: outputPath,
      type: "png",
      clip,
      omitBackground: false
    });

    console.log(`已导出：${outputPath}`);
  }

  await browser.close();
  return { count, outputDir };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-i" || arg === "--input") {
      args.inputPath = argv[++i];
    } else if (arg === "-o" || arg === "--output") {
      args.outputDir = argv[++i];
    } else if (arg === "--width") {
      args.width = parseInt(argv[++i], 10);
    } else if (arg === "--scale") {
      args.scale = parseInt(argv[++i], 10);
    } else if (arg === "--background") {
      args.background = argv[++i];
    }
  }
  return args;
}

function printUsage() {
  console.log([
    "用法: node export-modules.js -i <html路径> -o <输出目录> [选项]",
    "",
    "必需:",
    "  -i, --input <path>     HTML 文件路径",
    "  -o, --output <dir>     输出目录",
    "",
    "可选:",
    "  --width <px>           视口宽度，默认 390",
    "  --scale <n>            设备缩放比，默认 3",
    "  --background <color>   背景色，默认 #fff7e8"
  ].join("\n"));
}

if (require.main === module) {
  const args = parseArgs(process.argv);

  if (!args.inputPath || !args.outputDir) {
    printUsage();
    process.exit(1);
  }

  exportSections(args)
    .then(({ count }) => {
      console.log(`全部完成：${count} 个 section 已导出到 ${args.outputDir}`);
    })
    .catch(error => {
      console.error("导出失败：", error);
      process.exit(1);
    });
}

module.exports = { exportSections };
