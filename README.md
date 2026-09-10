# 百家号自动发布 Skill（2026-09-10 实测可用版）

一键把文章发布到百家号：标题（Lexical）→ 正文（UEditor）→ 封面（AI 生成）→ 发布（CDP 真实鼠标点击）。

## 前置条件
1. Node.js + `ws` 模块：进入本 skill 目录执行 `npm install ws`（依赖 node_modules/ws）
2. 已安装 isolated-browser skill（由其拉起隔离 Chrome，提供 CDP 9222）
3. 浏览器已用 isolated-browser 拉起隔离 Chrome 并打开百家号编辑页，CDP 端口 `9222` 可用
4. 百家号已登录（登录态在隔离 profile ~/.chrome_qclaw_stable）

> 本 skill 已**自包含**，仅依赖 `cdp_lib.js` + `node_modules/ws`，不再依赖 xbrowser。

## 用法
1. 编辑 `scripts/publish.js` 顶部的 `CONFIG`：
   ```js
   title: '文章标题',                      // 2~64 字（ensureTitle 闭环会校验+复核）
   bodyHtml: '<p>第一段</p><p>第二段</p>', // 正文 HTML
   coverMode: 'ai',                        // 仅 'ai' | 'skip'（'upload' 已禁用）
   cdpPort: 9222,
   ```
2. 运行：
   ```bash
   node skills/baijiahao-publisher/scripts/publish.js
   ```
   发布链路：填标题（ensureTitle 闭环）→ 填正文 → setCoverAI（AI 封面）→ 点发布 → 轮询 URL/body。

## 关键结论（2026-09-10 修正）
- **所有点击用 CDP `Input.dispatchMouseEvent` 真实鼠标坐标**（先 `getBoundingClientRect` 取中心）。in-page `button.click()` 对 cheetah/React 组件不提交。
- **标题为空/封面缺失是发布被静默拦截真因**：标题用 CDP 坐标点 + Ctrl+A + `Input.insertText` 填入（ensureTitle 闭环：校验→填入→复核→不合规则清空重填，最多 3 次）。
- **封面弹窗是 cheetah 自研组件（非 antd）**，所有 `.ant-modal` 选择器失效。
- ⚠️ **封面占位真实可点元素是“选择封面”文字所在的内层 ~198×134 卡片本身**（精确文本匹配 + 宽度过滤 100~400 取最窄者），不是“向上找 -default 祖先”取到的 612×134 外层容器。
- **AI 封面新 UI（2026-09-10）**：切「AI封面」tab → 点 `id=ai-cover-tab-v2-step-1`（AI 生成封面入口，约 3s 生成 14~17 张）→ **真实点击 img 元素本身**（width 41~200，勿点 336×252 大预览）→ 父 group 加 -selected 类、「确定 (1)」变 enabled → 用精确坐标 `cdpClickXY` 点「确定 (1)」并轮询弹窗关闭。
- 坐标全部动态取 `getBoundingClientRect`，禁硬编码、禁写死运行时 class hash（每次加载都变）。
- ⛔ **本地上传兜底已禁用**（用户禁止）：AI 封面失败即主动中止发布，绝不带病发布、绝不回退本地上传。

## 文件说明
- `scripts/publish.js` — 统一发布入口（标题+正文+AI封面+发布，已验证 E2E）
- `scripts/cdp_lib.js` — CDP WebSocket 库（connect/eval/click/insertText/screenshot）
- `scripts/check_title.js` — 标题静态校验（validateTitle，纯规则不连浏览器）
- `scripts/clear_title.js` — 清空标题框（Ctrl+A + Input.insertText("")）
- `scripts/test_title_clear.js` — 标题填→清→填回归测试
- `references/workflow.md` — 详细流程
- `references/troubleshooting.md` — 问题库（含 F 系列已证伪做法）
- `references/commands.md` — 浏览器启用 + CDP 命令参考

> 旧 cover_publish.js / finish_publish.js / final_publish.js / publish_self.js 已删除（残留旧「AI封图」UI、336 大图 width>40 单过滤、clickByText 关弹窗等失效逻辑），统一入口见 publish.js。
