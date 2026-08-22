# 百家号自动发布 Skill（v3，2026-08-21 修正）

一键把文章发布到百家号：标题（Lexical）→ 正文（UEditor）→ 封面（AI生成/本地上传）→ 发布（CDP 真实鼠标点击）。

## 前置条件
1. Node.js + `ws` 模块：进入本 skill 目录执行 `npm install ws`（依赖 node_modules/ws）
2. 已安装 isolated-browser skill（由其拉起隔离 Chrome，提供 CDP 9222）
3. 浏览器已用 isolated-browser 拉起隔离 Chrome 并打开百家号编辑页，CDP 端口 `9222` 可用
4. 百家号已登录（登录态在隔离 profile `~/.chrome_qclaw_stable`）

> 本 skill 已**自包含**，仅依赖 `cdp_lib.js` + `node_modules/ws`，不再依赖 xbrowser。

## 用法
1. 编辑 `scripts/publish.js` 顶部的 `CONFIG`：
   ```js
   title: '文章标题',                      // ≤64 字
   bodyHtml: '<p>第一段</p><p>第二段</p>', // 正文 HTML
   coverMode: 'ai',                        // 'ai' | 'upload' | 'skip'
   cdpPort: 9222,
   ```
2. 本地上传模式需准备 `cover.jpg`（在 `%USERPROFILE%\.qclaw\baijiahao_skill\cover.jpg`）。
3. 运行：
   ```bash
   node skills/baijiahao-publisher/scripts/publish.js
   ```
   仅补封面+发布（草稿已填好标题正文）：`node skills/baijiahao-publisher/scripts/cover_publish.js`
   封面弹窗已开时收尾：`node skills/baijiahao-publisher/scripts/finish_publish.js`

## 关键结论（v3, 2026-08-21 修正）
- **发布按钮 / 封面各步一律用 CDP `Input.dispatchMouseEvent` 真实鼠标坐标点击**（先 `getBoundingClientRect` 取中心）。in-page `button.click()` 对 cheetah/React 组件不提交（返回 CLICKED 但 URL 不变）。
- **标题为空/封面缺失是发布“失灵”真因**：之前误判为 React 事件委托/遮罩层。标题用 CDP 坐标点 + Ctrl+A + `Input.insertText` 填入（替换选区，非追加）。
- **封面弹窗是 cheetah 自研组件（非 antd）**：所有 `.ant-modal` 选择器失效。
- ⚠️ **封面占位真实可点元素是“选择封面”文字所在的内层 ~198×134 卡片本身**（精确文本匹配 + 宽度过滤 100~400 取最窄者），**不是**“向上找 `-default` 祖先”取到的 612×134 外层容器（点它不开弹窗）。这是旧版误判“封面弹窗未正确打开”的根因。
- **AI 生成触发是 SPAN“根据全文智能生成封面”**（非 button、非固定坐标），点它即按全文自动生成。确定按钮文本为“确定”或“确定 (1)”，检测用 `indexOf('确定')` 模糊匹配。
- 坐标全部动态取 `getBoundingClientRect`，禁硬编码、禁写死运行时 class hash（每次加载都变）。
- AI 封面失败自动回退本地上传。

## 文件说明
- `scripts/publish.js` — 统一发布入口（标题+正文+封面+发布，纯 CDP 自包含）
- `scripts/cover_publish.js` — 补封面+发布（纯 CDP 自包含）
- `scripts/finish_publish.js` — 封面弹窗已开时收尾（纯 CDP 自包含）
- `scripts/publish_self.js` — 自包含一键发布示例（内嵌正文，已实测发布成功）
- `scripts/cdp_lib.js` — CDP WebSocket 库（connect/eval/click/insertText/setFileInputFiles/screenshot）
- `references/workflow.md` — 详细流程
- `references/troubleshooting.md` — 问题库
- `references/commands.md` — 浏览器启用 + CDP 命令参考
- `_legacy/` — v6 旧脚本（已弃用，仅留档）
