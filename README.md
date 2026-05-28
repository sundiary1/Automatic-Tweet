# 公众号论文长图自动化

## 常用命令

```bash
# 创建新主题目录
node pipeline.js --new 新论文

# 检查所有主题：section 数、PNG 数、缺失图片
npm run check

# 一键导出所有未完成主题
node pipeline.js --batch

# 强制重导某个主题
node pipeline.js projects/batman_effect/ --force

# 单独导出一个 HTML
node export-modules.js -i projects/xxx/xxx.html -o projects/xxx/

# 运行测试
npm test
```

## 新增文章流程

1. `node pipeline.js --new 主题名`
2. 把 PDF 放进 `projects/主题名/`
3. 先从 PDF 提取图表到 `assets/`
4. 生成 HTML 前确认配色方案，并确认 `assets/top.png` 已存在
5. 生成 `projects/主题名/主题名.html`
6. `npm run check`
7. `node pipeline.js --batch`

