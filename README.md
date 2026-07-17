# 百家号自动发布 Skill（v7，已 E2E 验证）

一键把文章发布到百家号：标题（Lexical）→ 正文（UEditor）→ 封面（AI生成/本地上传）→ 发布（原生 click）。

## 前置条件
1. Node.js + `ws` 模块：进入本 skill 目录执行 `npm install ws`（依赖 node_modules/ws）
2. 已安装 isolated-browser skill（由其拉起隔离 Chrome，提供 CDP 9222）
3. 浏览器已用 xb 打开百家号编辑页，且 CDP 端口 `9222` 可用（xb 启动的 Chrome 自带）
4. 百家号已登录（登录态在 Chrome profile）

## 用法
1. 编辑 `scripts/publish.js` 顶部的 `CONFIG`：
   ```js
   title: '文章标题',                      // ≤64 字
   bodyHtml: '<p>第一段</p><p>第二段</p>', // 正文 HTML
   coverMode: 'ai',                        // 'ai' | 'upload' | 'skip'
   cdpPort: 9222,
   ```
2. 本地上传模式需准备 `cover.jpg`（在 workspace 根目录）。
3. 运行：
   ```bash
   node skills/baijiahao-publisher/scripts/publish.js
   ```

## 关键结论（v7）
- **发布按钮**：用 CDP eval 执行原生 `button.click()`（坐标点击会被内部 `<span>` 拦截 React 冒泡）。
- **标题为空是发布"失灵"真因**：之前误判为 React 事件委托/遮罩层。标题用 CDP 坐标点 + Ctrl+A + `Input.insertText` 填入。
- **封面弹窗是 cheetah 自研组件（非 antd）**：真实坐标：开弹窗 (612,561)、提示词 (853,228)、生成按钮 DIV (1153,274)、确定 (1384,752)。AI封图 tab 用 `[role=tab]` 中心点击。
- **遮罩层不是根因**：无需暴力移除。
- AI 封面失败自动回退本地上传。

## 文件说明
- `scripts/publish.js` — 统一发布入口（标题+正文+封面+发布）
- `scripts/cdp_lib.js` — CDP WebSocket 库（connect/eval/click/insertText/setFileInputFiles）
- `references/workflow.md` — 详细流程
- `references/troubleshooting.md` — 问题库（含 v7 修正）
- `references/commands.md` — xb/CDP 命令参考
- `_legacy/` — v6 旧脚本（已弃用，仅留档）
