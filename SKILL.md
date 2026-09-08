---
name: baijiahao-publisher
description: 百家号(baijiahao.baidu.com)文章自动发布流程。通过 isolated-browser 拉起隔离 Chrome + CDP WebSocket 驱动。适用 Windows + 稳定版 Chrome + isolated-browser skill。触发词:百家号发布、baijiahao、发布文章到百家号。
---

# 百家号文章自动发布 Skill(v3,2026-08-21 修正:自包含纯 CDP + 封面定位修正)

## 适用场景

- 自动化将文章发布到百度百家号平台
- 处理标题(Lexical 编辑器)、正文(UEditor iframe)、封面设置
- 支持本地文件上传封面和 AI 智能生成封面两种策略

## 关键发现更新(v3,2026-08-21 修正:自包含纯 CDP,封面占位定位修正)

> 历史:2026-07-10 v7 已打通发布全流程;2026-08-21 重写为自包含纯 CDP(不再依赖 xbrowser),并修正封面占位定位为“内层 ~198px 卡片”。

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

⚠️ **核心修正（2026-08-21 实战验证）**:封面占位真实可点元素**不是**“选择封面”文字向上找的 `-default` 外层容器（612×134，点它不开弹窗），而是该文字所在的**内层 ~198×134 卡片本身**。`querySelectorAll('*')` 遍历顺序是外层先于内层，若用“向上找 `-default` 祖先”会停在 612px 非可点容器，导致点击落空（这正是之前 publish.js 报错“封面弹窗未正确打开”的根因）。

**正确定位器（精确文本 + 宽度过滤，取最窄者）**:
```js
// 真实可点的是内层 ~198px 卡片；别用“向上找 -default 祖先”（会取到 612px 外层）
var els=Array.from(document.querySelectorAll('*'));
var c=els.filter(function(e){
  return (e.textContent||'').trim()==='选择封面'
    && e.getBoundingClientRect().width>100 && e.getBoundingClientRect().width<400;
});
c.sort(function(a,b){return a.getBoundingClientRect().width-b.getBoundingClientRect().width;});
return c[0]; // 最内层卡片
```

**核心原则:真实鼠标坐标点击 + 动态取中心,禁硬编码坐标、禁 in-page `.click()`、禁写死 `-default`/hash**

| 步骤 | 方法 | 选择器/定位器 |
|------|------|------|
| 开弹窗 | **真实鼠标点击**内层卡片 | 精确文本`选择封面`+宽度过滤(100~400)取最窄者 |
| 隐藏蓝色提示条 | CDP eval `display:none` | 含"标题功能已合并至文字模板"的条 |
| 切 AI封图 tab | **真实鼠标点击** `[role=tab]` 文本中心 | `getBoundingClientRect` 取中心 |
| AI 生成 | **切到 AI封图 tab 后自动生成**（2026-08-31 修正：不再有“根据全文智能生成封面”按钮，无需点击触发） |
| **选封面缩略图(关键)** | **真实鼠标点击**生成后的一张缩略图 `img`(width>40) | ⚠️ 2026-08-31 修正：生成完成后“确定”仍 disabled，**必须点选一张缩略图后“确定 (1)”才启用**——此前反复“封面没设置成功”的根因 |
| 点确定 | **真实鼠标点击** | button 文本含"确定"（文本为“确定”或“确定 (1)”） |

**cdp_lib 已提供 `cdpClickEl(sock, finderExpr)`**:先 `scrollIntoView({block:'center})` → 取 `getBoundingClientRect` 中心 → `cdpClickXY` 真实点击。封面各步统一用此函数。

**注意**:"确定"按钮文本是"确定"或"确定 (1)",检测时要 `indexOf('确定')` 而非精确匹配。

本地上传方案(setFileInputFiles)仍可用作兜底,但需先切到"本地上传"tab 后 file input 才存在。

### 🟡 标题清空唯一可靠方案

Lexical 编辑器不支持 `execCommand('delete')`,Ctrl+A+Delete 是追加而非替换。

**唯一可靠**:`Ctrl+A → type`(CDP Input.insertText 天然替换选区,非追加)。如果标题累积过长(服务端草稿恢复),刷新页面也不行,需清除 `localStorage` + `sessionStorage` 后重新打开。

**2026-09-08 实测**：填→清→填全流程通过（`scripts/test_title_clear.js`）。清空用 `clearTitle()`（点框→Ctrl+A→`Input.insertText("")`）。⚠️ 清空后 `.input-box` 的 `innerText` 会显示 Lexical 占位符「请输入标题（2-64字）」——这是空框的占位提示**不是残留内容**；判定是否已空应读 `.input-box` 下非 `[class*=placeholder]` 节点的文本（占位符节点 child:0）。

### 🔁 标题闭环流程（2026-09-08 优化，发布主链路已接）

把「填前校验→填入→填后复核→不合规则清空+重构+再填」封成 `ensureTitle(sock,title)`（位于 publish.js），`main()` 在填正文前调用：

1. **填前校验** `validateTitle(title)`：非空、2–64 字（按 Unicode 字符计）、首尾无空白、无连续空白。不合规→进入重构。
2. **填入**：CDP 点框 + Ctrl+A + `Input.insertText(title)`。
3. **填后复核** `postCheckTitle(sock,title)`：真实读回 `.input-box` 非占位符文本，既校验"符合要求"也校验"与预期一致"（防编辑器静默截断/串字）。
4. **不合规则**：`clearTitle()` 清空 → `reconstructTitle()` 重构 → 再填入，最多 `MAX_TITLE_RETRIES=3` 轮。
   - 自动可修：`首尾/连续空白`→规范化；`超长(>64)`→截断到 64 字。
   - 无法自动修：`空`/`过短(<2字)`/`长度合规但与预期不符`→返回 NULL，`ensureTitle` 中止并提示人工，不盲目发布。

**实测（2026-09-08，`_live_title_loop.js`）**：合规标题 1 轮通过；超长(162字)自动截断到 64 字后通过；首尾/连续空格规范化后通过。全程用真实鼠标坐标 + `Input.insertText`，清空用空串替换选区。

### 🟢 CDP vs xb 选择策略(2026-07-10 第二次实测修正)

| 场景 | 推荐工具 |
|------|---------|
| 标题填写 | CDP 坐标点标题框 + Ctrl+A(dispatchKeyEvent)+ Input.insertText(已验证可用,非追加) |
| 正文设置(UEditor) | CDP eval `editor.setContent(html)` |
| 封面-打开弹窗 | CDP **真实鼠标**点击内层卡片(精确文本"选择封面"+宽度过滤取最窄者,误取 612px 外层会点空) |
| 封面-AI封图 tab | CDP **真实鼠标**点 `[role=tab]` 文本中心 |
| 封面-AI 生成触发 | 切到 AI封图 tab 即自动生成(2026-08-31 修正：旧版“根据全文智能生成封面”SPAN 已移除) |
| **封面-选缩略图** | **真实鼠标点击**一张 `img` 缩略图(2026-08-31 修正：不设此步则“确定”恒 disabled，封面无法生效) |
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
   方案B(AI生成,已打通):真实点击内层卡片(精确文本"选择封面"+宽度过滤取最窄者,**别用"向上找 -default 祖先"——会取到 612px 非可点外层**) → 隐藏提示条(含"标题功能已合并至文字模板")
     → 真实点击"AI封图"tab → **切到 AI封图 tab 后封面自动生成**(2026-08-31 修正：旧版"根据全文智能生成封面"SPAN 已不存在,无需点击触发)
     → **点选一张生成的缩略图**(2026-08-31 修正：关键！不点选则"确定"恒 disabled,封面无法生效) → 真实点击"确定 (1)"
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
│   ├── cdp_lib.js               ← CDP WebSocket 库(connect/click/eval/insertText/setFileInputFiles/screenshot)✅
│   ├── cover_publish.js          ← ✅ 完整补封面+发布(AI生成,全动态定位,2026-08-21 修正)
│   └── finish_publish.js         ← ✅ 封面弹窗已开时收尾(关弹窗→发布,2026-08-21 修正)
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
1. 滚动到“设置封面”区,点“选择封面”占位项(真实可点的是**内层 ~198px 宽的卡片**,精确文本匹配+宽度过滤取最窄者;⚠️ 别点外层 612px 大容器,它不响应)
2. 若出现蓝色提示条(含“标题功能已合并至文字模板”),先关闭它
3. 切到“AI封图” tab（切过去后封面会**自动生成**，不再有“根据全文智能生成封面”按钮）
4. ⚠️ 等几秒生成完成后，**点选其中一张缩略图**——这一步必做，否则“确定”按钮一直是灰色不可点
5. 点“确定 (1)”按钮（文字带空格和数字）
6. 确认标题已填,点“发布”按钮(真实点击即可提交)

## 脚本 vs 手动执行参考

| 自动执行超时后 | 手动在浏览器中操作 |
|------|------|
| 标题已填好 → 无需操作 | 可直接点发布 |
| 正文已填好 → 无需操作 | 可直接点发布 |
| 封面未设置 → 手动设 | "选择封面"→"AI封图"→"生成"→确定 |
| 遮罩层挡住发布 → 按 F5 刷新 | 内容可能被保留(草稿) |
