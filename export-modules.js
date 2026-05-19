const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

// 改成你的 HTML 文件名
const htmlFile = "batman_effect\\batman_effect_v2.html";

async function main() {
  const htmlPath = path.resolve(__dirname, htmlFile);
  const fileUrl = "file://" + htmlPath;

  if (!fs.existsSync(htmlPath)) {
    throw new Error(`找不到 HTML 文件：${htmlPath}`);
  }

  // 用 HTML 文件名创建输出文件夹
  const htmlBaseName = path.parse(htmlFile).name;
  const outputDir = path.join(__dirname, htmlBaseName);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: true
  });

  const page = await browser.newPage({
    viewport: {
      width: 390,
      height: 2000
    },
    deviceScaleFactor: 3
  });

  await page.goto(fileUrl, {
    waitUntil: "networkidle"
  });

  // 强制页面背景，避免圆角外侧透明显示成黑色
  await page.addStyleTag({
    content: `
      html, body {
        background: #fff7e8 !important;
      }
    `
  });

  // 等待字体和图片加载
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

  const sections = page.locator("section");
  const count = await sections.count();

  console.log(`检测到 ${count} 个 section 模块`);
  console.log(`输出文件夹：${outputDir}`);

  for (let i = 0; i < count; i++) {
    const section = sections.nth(i);

    // 先滚动到当前 section
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    let box = await section.boundingBox();

    if (!box) {
      console.log(`跳过第 ${i + 1} 个 section：无法获取位置`);
      continue;
    }

    // 左右留白、上方只留 2px（避免捕获上方模块的分割线）、下方多留白保证呼吸感
    const padX = 12;
    const padTop = -1;
    const padBottom = 20;

    // 如果当前模块太高，就临时增大视口高度
    const neededHeight = Math.ceil(box.height + padTop + padBottom + 80);
    const currentViewport = page.viewportSize();

    if (currentViewport && neededHeight > currentViewport.height) {
      await page.setViewportSize({
        width: 390,
        height: neededHeight
      });

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
      width: Math.ceil(Math.min(box.width + padX * 2, 390)),
      height: Math.ceil(box.height + padTop + padBottom)
    };

    const outputPath = path.join(
      outputDir,
      `${String(i + 1).padStart(2, "0")}_section.png`
    );

    await page.screenshot({
      path: outputPath,
      type: "png",
      clip: clip,
      omitBackground: false
    });

    console.log(`已导出：${outputPath}`);
  }

  await browser.close();

  console.log("全部模块已导出完成。");
}

main().catch(error => {
  console.error("导出失败：", error);
  process.exit(1);
});