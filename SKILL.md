---
name: baijiahao-publisher
description: 百家号(baijiahao.baidu.com)文章自动发布流程。通过 isolated-browser 拉起隔离 Chrome + CDP WebSocket 驱动。适用 Windows + 稳定版 Chrome + isolated-browser skill。触发词:百家号发布、baijiahao、发布文章到百家号。
---

# 百家号文章自动发布 Skill(v7,2026-07-10 完整打通)

## 适用场景

- 自动化将文章发布到百度百家号平台
- 处理标题(Lexical 编辑器)、正文(UEditor iframe)、封面设置
- 支持本地文件上传封面和 AI 智能生成封面两种策略

## 关键发现更新(v7,2026-07-10 完整打通)

### ✅ 核心难题已解决(v7,2026-07-10):发布全流程自动化

**之前的误判**:一直以为“发布按钮点不中”(React 事件委托 / 遮罩层)。
**真实根因(2026-07-10 发布《京东外卖强势入局》验证)**:标题输入框是空的(显示占位符“请输入标题(2-64字)”),发布被“标题必填”校验**静默拦截**--onClick 执行了但校验没过,无弹窗无跳转,表现像按钮失灵。

**正确发布方案(2026-07-10 二次实测《如何高效管理你的每日任务清单》修正)**:
1. 标题必须真填进 Lexical(见下方“标题填写”)。
2. 封面必须真实设置(见下方封面方案)——首轮自动发布曾因封面缺失被“请添加封面”静默拦截,URL 不变,同样像按钮失灵。
3. **发布按钮用 CDP `Input.dispatchMouseEvent` 真实鼠标坐标点击**(先取按钮 `getBoundingClientRect` 中心)。⚠️ 修正:v7 初版称可用 `element.click()` 原生点击触发 React 冒泡——**二次实测证明不成立**:in-page `button.click()` 对 cheetah/React 组件不提交(返回 CLICKED 但 URL 不变),必须用真实鼠标坐标点击。坐标点击会命中 button 内 `<span>发布</span>`,但因是真实 `isTrusted` 鼠标事件,React 能正常响应。
4. 确认弹窗(若有)同样用真实鼠标坐标点击(匹配“确认发布”或“确定”文字)。

**验证结果**:2026-07-10 17:07 《京东外卖强势入局》发布成功(标题空理论验证);2026-07-10 18:54 《如何高效管理你的每日任务清单》用真实鼠标点击发布成功,URL 跳 `builder/rc/clue`。

**CDP `Input.dispatchMouseEvent` 真实鼠标点击**:对 cheetah 组件(标题框/封面占位/发布按钮/确定按钮)均有效,前提坐标是元素真实中心(动态 `getBoundingClientRect`,勿硬编码)。in-page `.click()` / `dispatchEvent` 合成事件对 cheetah 组件基本无效。

### 🟢 封面方案:AI 生成已打通(cheetah 自研组件,非 antd) - 2026-07-10 第二次实测修正

**关键发现**:封面弹窗是百家号**自研 cheetah/FeEditorApp 组件**,所有 `.ant-modal` 选择器都失效。

⚠️ **v7 初版坐标已失效(2026-07-10 18:5x 二次实测)**:以下为修正后的可靠方法。

**核心原则:真实鼠标坐标点击 + 动态取中心,禁硬编码坐标、禁 in-page `.click()`**

百家号编辑器(标题框/封面占位/发布按钮)对合成事件(JS `element.click()`、`dispatchEvent`、React 合成事件)基本不响应,**只能用 CDP `Input.dispatchMouseEvent` 真实鼠标坐标点击**,且坐标必须基于元素的 `getBoundingClientRect` 运行时计算(不同分辨率/视口坐标不同,硬编码必然点空)。

真实结构(经 DOM 探测确认):
- 打开弹窗的占位项:**动态文本定位**——"选择封面"文字向上找 `-default` 祖先(⚠️ 前端 class hash 每次加载都变,严禁写死 `FeEditorApp-*` 这类 hash)。真实可点容器约 612×134、中心约 (506,312)。文档旧写的 198×134/(299,305) 是误判,已作废;但定位一律用文本 + 动态 rect,不依赖任何固定坐标。
- 提示词 textarea:弹窗内可见 textarea(先 `cdpClickEl` 聚焦,再 `cdpInsertText` 填词)。
- AI 生成触发:**不是 button,是 `SPAN.FeEditorApp-_6853aa778d53acdc-theme` 文本"根据全文智能生成封面"**(约 viewport (518,230))。点它即按全文自动生成,无需先填提示词。
- 确定按钮:生成后文本变为"确定 (1)"(注意带空格和数字),须 `indexOf('确定')` 模糊匹配,且同样用真实鼠标点击(坐标处 button 自身为顶层时 CDP 坐标点击有效)。

| 步骤 | 方法 | 选择器(动态取中心,勿硬编码) |
|------|------|------|
| 开弹窗 | **真实鼠标点击**占位项 | 文本定位:`Array.from(document.querySelectorAll('*')).find(e=>e.textContent.trim()==='选择封面')` 再向上找 `-default` 祖先 |
| 隐藏蓝色提示条 | CDP eval `display:none` | 含"标题功能已合并至文字模板"的条 |
| 切 AI封图 tab | **真实鼠标点击** `[role=tab]` 文本中心 | `getBoundingClientRect` 取中心 |
| 触发 AI 生成 | **真实鼠标点击** SPAN(非 button) | `span` 文本"根据全文智能生成封面" |
| 轮询确定 | 读按钮 `disabled` | 文本变"确定 (1)"即启用 |
| 点确定 | **真实鼠标点击** | button 文本含"确定" |

**cdp_lib 已提供 `cdpClickEl(sock, finderExpr)`**:先 `scrollIntoView({block:'center})` → 取 `getBoundingClientRect` 中心 → `cdpClickXY` 真实点击。封面各步统一用此函数。

**注意**:"确定"按钮文本是"确定"或"确定 (1)",检测时要 `indexOf('确定')` 而非精确匹配。

本地上传方案(setFileInputFiles)仍可用作兜底,但需先切到"本地上传"tab 后 file input 才存在。

### 🟡 标题清空唯一可靠方案

Lexical 编辑器不支持 `execCommand('delete')`,Ctrl+A+Delete 是追加而非替换。

**唯一可靠**:`Ctrl+A → type`(CDP Input.insertText 天然替换选区,非追加)。如果标题累积过长(服务端草稿恢复),刷新页面也不行,需清除 `localStorage` + `sessionStorage` 后重新打开。

### 🟢 CDP vs xb 选择策略(2026-07-10 第二次实测修正)

| 场景 | 推荐工具 |
|------|---------|
| 标题填写 | CDP 坐标点标题框 + Ctrl+A(dispatchKeyEvent)+ Input.insertText(已验证可用,非追加) |
| 正文设置(UEditor) | CDP eval `editor.setContent(html)` |
| 封面-打开弹窗 | CDP **真实鼠标**点击占位项(动态文本定位 + 动态取中心,禁写死 hash,实测容器约 612×134 中心 (506,312)) |
| 封面-AI封图 tab | CDP **真实鼠标**点 `[role=tab]` 文本中心 |
| 封面-AI 生成触发 | CDP **真实鼠标**点 SPAN"根据全文智能生成封面"(非 button,非 1153,274 的 DIV) |
| 封面-确定按钮 | CDP **真实鼠标**点击(文本"确定 (1)",模糊匹配) |
| 封面-文件上传 | CDP DOM.setFileInputFiles(兜底方案) |
| 发布按钮 | CDP **真实鼠标**点击(坐标点 center)--⚠️ in-page `button.click()` 对 cheetah 组件无效,18:54 实测须真实鼠标点击才提交 |
| 页面导航 | CDP Page.navigate |

## 完整流程(按 v7 实测修正)

```
1. 打开发布页 → 等待编辑器 READY
2. 关闭引导弹窗("我知道了")
3. [可选] 清除 storage 再刷新--本次发布未清除也成功,仅标题累积乱码时再用
4. 填标题:CDP 坐标点标题框(756,257)→ Ctrl+A(dispatchKeyEvent)→ Input.insertText 写入(勿用 Delete)
   ⚠️ 必须确认标题真进了 React 状态,别被占位符"请输入标题"误导(曾误判成 17 字)
5. 填正文:CDP eval `editor.setContent(html)`(UEditor)
6. 设置封面(cheetah 自研组件,非 antd,2026-07-10 第二次实测修正):
   核心:全部用 CDP **真实鼠标坐标点击** + 动态取中心(cdpClickEl),禁硬编码坐标、禁 in-page .click()。
   方案A(本地上传兜底):真实点击占位项 → 切"本地上传"tab → CDP DOM.setFileInputFiles → 真实点击"确定"
   方案B(AI生成,已打通):真实点击占位项(动态文本定位:"选择封面"文字向上找 `-default` 祖先,禁写死 hash) → 隐藏提示条(含"标题功能已合并至文字模板")
     → 真实点击"AI封图"tab → 真实点击 SPAN"根据全文智能生成封面"(自动按全文生成,无需填提示词)
     → 轮询"确定 (1)"启用 → 真实点击"确定 (1)"
7. [实测非必需] 移除 fixed 遮罩层--之前误判为根因,实际发布被拦截是因标题/封面缺失
8. 点击"发布":CDP **真实鼠标坐标点击**(取按钮 getBoundingClientRect 中心)。⚠️ in-page `button.click()` 对 cheetah 不提交(18:54 实测),必须用真实鼠标事件
9. 轮询 URL 跳转 / body 含"审核"即为成功;若有确认弹窗同样用真实鼠标点击("确认发布"/"确定")
```

## 前置要求

| 项目 | 要求 |
|------|------|
| 浏览器 | 正式版 Chrome / Edge(稳定版) |
| 启用浏览器 | **isolated-browser skill**:`node skills/isolated-browser/scripts/launch.js` 拉起隔离 Chrome |
| 控制工具 | Node.js `ws` 模块(CDP 直连) |
| 路径 | isolated-browser: `skills/isolated-browser/scripts/launch.js` |
| CDP | 由 isolated-browser 拉起的隔离 Chrome 以 `--remote-debugging-port=9222` 常驻提供(隔离 profile `~/.chrome_qclaw_stable`,不碰用户浏览器) |
| 运行环境 | Node.js 脚本(不要从 PowerShell 直接调 xb/agent-browser 交互) |

## 启用浏览器(isolated-browser)

> **此 skill 不自带浏览器启动逻辑**:启用浏览器统一调用 `isolated-browser` skill,由其拉起一个与用户默认浏览器完全隔离的 Chrome 实例并常驻 CDP。发布脚本只通过 CDP(9222)直连驱动,不依赖 xb 的浏览器托管。

> **若 `isolated-browser` skill 未安装**：从 GitHub 安装 `https://github.com/liuxucai/isolated-browser-skill`（clone 或下载 ZIP 解压到 skills/isolated-browser），安装后即可调用其 `scripts/launch.js` 拉起隔离 Chrome。

```bash
# 1) 拉起隔离 Chrome(固定 profile ~/.chrome_qclaw_stable + CDP 端口 9222 常驻)
node skills/isolated-browser/scripts/launch.js
#    -> 打开百家号后台登录页,手动登录(不填密码),确认进后台首页

# 2) 跑发布脚本(脚本内 CDP 直连 127.0.0.1:9222,无需再过 isolated-browser)
node scripts/publish.js
```

关键点:
- isolated-browser 用 `--user-data-dir=~/.chrome_qclaw_stable` 隔离 profile,与用户 Chrome 不串登录态,可长期复用、免重复登录。
- 浏览器实例后台常驻(detached + `child.unref()`),脚本退出也不会被杀。
- 发布脚本的 `cdpConnect()` 连 `ws://127.0.0.1:9222` 即驱动该隔离实例,百家号需已登录。
- 环境变量可覆盖:`ISOB_CDP_PORT`(默认 9222)、`ISOB_PROFILE_DIR`(默认 `~/.chrome_qclaw_stable`)。

## 文件结构

```
skills/baijiahao-publisher/
├── SKILL.md                    ← 本文件
├── scripts/
│   ├── publish.js               ← ✅ 统一发布入口(标题+正文+AI封面+发布,已验证 E2E)
│   ├── cdp_lib.js               ← CDP WebSocket 库(connect/click/eval/insertText/setFileInputFiles)✅
│   ├── cover_publish.js          ← ✅ 完整补封面+发布(AI生成,全动态定位,2026-07-15 验证)
│   └── finish_publish.js         ← ✅ 封面弹窗已开时收尾(关弹窗→发布,2026-07-15 验证)
├── references/
│   ├── workflow.md             ← 详细步骤
│   ├── troubleshooting.md      ← 问题与方案
│   └── commands.md             ← 浏览器启用 + CDP 命令参考
└── templates/
    └── article.txt             ← 文章模板
```

## 快速使用

```bash
# 1. 安装 ws 模块(首次需要,依赖 node_modules/ws)
cd <本 skill 目录>  # 即 skills/baijiahao-publisher
npm install ws   # 若 node_modules/ws 已存在可跳过

# 2. 完整发布(填标题+正文+AI封面+发布):编辑 publish.js 的 TITLE/正文后再跑
node scripts/publish.js

# 3. 仅补封面+发布(草稿已填好标题正文,只差封面):
node scripts/cover_publish.js

# 4. 封面选择弹窗已开着时的收尾(关弹窗→发布):
node scripts/finish_publish.js
```

> 完整发布链路已打通。CDP 端口 9222 需由 **isolated-browser 拉起的隔离 Chrome** 提供(运行 `node skills/isolated-browser/scripts/launch.js`);百家号需已登录。所有点击用 CDP 真实鼠标坐标(动态 rect),不依赖运行时 class hash。

## 封面失败时手动操作指引

如果自动封面设置失败,脚本会打开浏览器在编辑器页。请在浏览器中手动:
1. 滚动到“设置封面”区,点“选择封面”占位项(真实可点元素偏左,约左 1/3 处,勿点列表正中)
2. 若出现蓝色提示条(含“标题功能已合并至文字模板”),先关闭它
3. 切到“AI封图” tab
4. 点“根据全文智能生成封面”(是文字按钮,非图标 DIV;点它即按全文自动生成,可不必填提示词)
5. 等 15-30s 直到封面出现,点“确定 (1)”按钮(文字带空格和数字)
6. 确认标题已填,点“发布”按钮(真实点击即可提交)

## 脚本 vs 手动执行参考

| 自动执行超时后 | 手动在浏览器中操作 |
|------|------|
| 标题已填好 → 无需操作 | 可直接点发布 |
| 正文已填好 → 无需操作 | 可直接点发布 |
| 封面未设置 → 手动设 | "选择封面"→"AI封图"→"生成"→确定 |
| 遮罩层挡住发布 → 按 F5 刷新 | 内容可能被保留(草稿) |
