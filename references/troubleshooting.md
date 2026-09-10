# 百家号发布问题与解决方案(v6,2026-07-07 / v7 修正 2026-07-10 / v3 再修正 2026-08-21)

> ⚠️ v7 重大修正(2026-07-10 已 E2E 验证发布成功):
> 1. **发布按钮**:v7 初版称可用 CDP eval 原生 `button.click()` 一次完成--**二次实测(18:54)证明不成立**:in-page `button.click()` 对 cheetah/React 组件不提交(返回 CLICKED 但 URL 不变)。**正确做法:CDP `Input.dispatchMouseEvent` 真实鼠标坐标点击**(取按钮真实中心)。标题为空/封面缺失仍会静默拦截,表现为按钮失灵。
> 2. **封面弹窗不是 Ant Design**,是百家号自研 cheetah/FeEditorApp 组件,所有 `.ant-modal` 选择器失效。
> 3. **遮罩层不是发布拦截根因**--移除遮罩层的暴力方案多余,标题/封面缺失才是真因。
> 4. **标题用 CDP Input.insertText 可用**(非追加),之前 T2 结论过时。
> 5. **封面各步(v7 初版坐标 612,561/1153,274/1384,752 已失效)**:占位项真实中心偏左、AI 生成触发是 SPAN"根据全文智能生成封面"(非 1153,274 的 DIV),全部须真实鼠标 + 动态取中心,禁硬编码、禁 `.click()`。
> 6. **(2026-07-15 修正) class hash 每次加载都变**:`_73a3a52aab7e3a36` / `_48bec92b4e533276` 等 `FeEditorApp-*` hash 每次页面加载随机变化,任何写死 hash 的选择器必然后续失效。
> 7. **(2026-07-15) 全屏封面选择弹窗会遮挡编辑页"发布"按钮**:点封面弹窗"确定"选好封面后,若立刻点"发布"会被该 fullscreen modal 吞掉(页面无变化)。必须先轮询确认弹窗消失(COVER_MODAL 不存在)再点发布。
> 8. **(2026-07-15) 编辑页常驻 3 个 `[role=dialog]` 浮层**:"标题 内容 确认"、"标题 内容 取消 确认"、"返回编辑 立即发布"手机预览弹窗。检测"封面弹窗已打开"不能取第一个 `[role=dialog]`,须遍历找含"AI封面"/"本地上传"文本的那个。
> 9. **(2026-07-15) 手机预览遮罩 `preview-phone-modal` 盖住封面区**:点封面占位会落空。点封面前先点"返回编辑"关掉该遮罩。

> 🔥 **v3 再修正(2026-08-21 实战验证《身处低谷时,请重新认识你的「处境」》发布成功)——推翻上表第 6 条的结论**:
> - **封面占位真实可点元素不是"选择封面"文字向上找的 `-default` 外层容器(612×134,点它不开弹窗),而是该文字所在的内层 ~198×134 卡片本身**(精确文本匹配 + 宽度过滤 100~400 取最窄者)。根因:`querySelectorAll('*')` 遍历顺序是外层先于内层,"向上找 `-default` 祖先"会停在 612px 非可点容器,导致点空——这正是旧版 cover_publish 误判"封面弹窗未正确打开"的真因。
> - 发布脚本已统一为 **publish.js**（自包含纯 CDP，仅依赖 cdp_lib.js + node_modules/ws），不再依赖 xbrowser；旧 cover_publish.js / finish_publish.js / final_publish.js 已于 2026-09-10 删除（残留旧「AI封图」UI、336 大图 width>40 单过滤、clickByText 关弹窗等失效逻辑）。
> - 综上:第 6 条"真实可点占位容器约 612×134、中心约 (506,312)"与"向上找 -default 祖先"两处结论均作废;正确 finder 见 SKILL.md 封面方案段与脚本 COVER_FINDER。

## 一、发布按钮不响应(v7 已解决,原 v6 误判为无解)

| # | 问题 | 根因 | 解决方法 |
|---|------|------|----------|
| P1 | 点"发布"后 URL 不变,无任何反馈 | **表单校验静默拦截**;标题超 64 字/正文不足/封面未绑定 | 先检查 `[class*=error]` 元素内容,修正后重试 |
| P2 | `elementFromPoint` 返回 `cheetah-modal-wrap` 而非发布按钮 | 封面弹窗关闭后残留透明 `position: fixed` 遮罩层 | 暴力移除所有 `position: fixed`/`sticky` 元素 |
| P3 | `elementFromPoint` 返回 `SPAN` 等其他元素 | 另一个 modal 或 tooltip 在发布按钮上方 | 移除所有遮罩层,重试;仍不行则手动 |
| P4 | CDP `Input.dispatchMouseEvent` 坐标点发布按钮无响应 | 坐标 (1113,888) 处命中 button 内 `<span>发布</span>`,或坐标非元素真实中心 | **已解决**:真实鼠标坐标点击(取按钮 `getBoundingClientRect` 中心,用 `cdpClickEl`);坐标须是元素真实中心,可绕过 span 子节点被 React 正常响应。2026-07-10 18:54 实测确认真实鼠标点击可提交 |
| P5 | xb click / in-page `button.click()` 点发布按钮无响应 | cheetah 组件对合成事件不响应,仅接受真实 `isTrusted` 鼠标事件 | **已解决**:用 CDP 真实鼠标坐标点击(非 `button.click()`)。⚠️ v7 初版称 `button.click()` 有效--二次实测证明不成立(in-page click 返回 CLICKED 但 URL 不变) |
| P0 | 点发布无任何反应(URL 不变、无弹窗) | **真实根因:标题为空**(占位符"请输入标题"被误判为有标题),被"标题必填"校验静默拦截 | 填标题进 React 状态后再 `button.click()`;填法见 T1/T2(CDP insertText 已验证可用) |
| P6 | 点发布后 dialog 弹出但点"确认"后还是回到编辑页 | 表单校验 dialog,确认后重新验证失败 | 检查 dialog 文本,找到具体错误原因 |
| P7 | 发布错误信息含"请添加封面" | 封面未真正绑定(AI 生成了但没点中缩略图 img 本身、或"确定"没点上) | 重新执行 setCoverAI:务必**真实点击 img 元素**(width 40~200),勿点 group;用精确坐标 cdpClickXY 点"确定 (1)"并轮询 dialog 消失 |
| P8 | 发布错误信息含"标题最多64个字" | 服务端草稿恢复导致标题累积(Lexical 累积乱码) | 清除 storage 后刷新页面,重填标题 |
| P9 | 表单校验无任何错误文本 | 页面可能出错了(如 React 崩溃) | 刷新页面,从零开始 |

**根因总结(v7 修正)**:发布按钮不响应主要是**标题为空被必填校验静默拦截**造成的假象,而非 React 事件委托或遮罩层。用 CDP eval `button.click()` 触发原生冒泡事件即可发布,已彻底自动化,无需手动。

---

## 二、封面相关问题(v6 更新重写)

| # | 问题 | 根因 | 解决方法 |
|---|------|------|----------|
| F1 | 点击“选择封面”后弹窗不打开 | (1) 误点到外层 612×134 列表容器而非真正可点卡片(占位项偏左,列表中心会落空);(2) 用 in-page `.click()` 合成事件(cheetah 不响应) | **真实鼠标点击“选择封面”文字所在的内层 ~198×134 卡片本身**(精确文本匹配 + 宽度过滤100~400取最窄者);注意 `querySelectorAll('*')` 外层先于内层,若“向上找 -default 祖先”会停在 612px 非可点容器——这是旧版误判“封面弹窗未正确打开”的根因。用 `cdp_lib` 的真实坐标点击(cdpClickXY / 本地 clickEl),禁硬编码坐标 |
| F2 | "AI封图" tab 点击不切换(或旧脚本用 `indexOf('AI封图')` 点不到) | 封面弹窗是 cheetah 自研组件,非 Ant Design;新 UI tab 文本为「AI封面」 | CDP **真实鼠标**点 `[role=tab]` 文本中心(文本改为「AI封面」);in-page `.click()` 无效 |
| F4 | "根据全文智能生成封面"触发找不到/点了无反应 | 它不是 button,是 `SPAN.FeEditorApp-_6853aa778d53acdc-theme`;v7 初版说的生成 DIV (1153,274) 已失效 | CDP **真实鼠标**点该 SPAN(动态中心);点它即按全文自动生成,无需先填提示词 |
| F3 | "确定"按钮 disabled(灰色不可点) | 封面图未生成/未选中 | AI:真实鼠标点 SPAN 触发生成,轮询 22s+ 直到文本变"确定 (1)"启用再真实点击 |
| F4 | 封面弹窗内"根据全文智能生成封面"按钮找不到 | 可能:CSS 隐藏、或未切到 AI 封图 tab | 先切 AI 封图 tab(真实鼠标),再点该 SPAN |
| F5 | file input 找不到 | 封面弹窗打开后 file input 可能挂载在 dialog 内,被遮罩遮蔽 | CDP `DOM.getDocument` + `DOM.querySelector('input[type="file"]')` |
| F6 | CDP `DOM.setFileInputFiles` 成功但"确定"仍 disabled | 上传后需要几秒渲染预览、或图片尺寸/格式不对 | 等 3-5s 再查;确保 JPG 为 3:2 横版(推荐 800x533) |
| F7 | 封面对话框关闭后残留透明遮罩层 | 图片预览式 modal(`cheetah-modal-wrap`)非组件卸载残留 | 暴力 `display: none` 或 `remove()` 所有 position:fixed |
| F8 | 发布时显示"请添加三张横版封面图" | 编辑器模式从"单图"变为"三图" | 在封面对话框中点"单图" tab 切换回 |
| F9 | AI 声明弹窗("我知道了")遮挡封面流程 | AI 内容声明弹窗在页面加载后弹出 | 先点"我知道了"再执行封面流程 |

---

## 三、标题相关问题(v6 更新)

| # | 问题 | 根因 | 解决方法 |
|---|------|------|----------|
| T1 | Ctrl+A+Delete 后标题内容不减反增(追加) | Lexical 编辑器忽略 `execCommand('delete')` | 不要按 Delete!只用 Ctrl+A → type |
| T2 | 标题插入方式 | CDP `Input.insertText` 在 Ctrl+A 选中后写入为**替换**(非追加),已验证可用 | CDP 坐标点标题框(756,257)→ Ctrl+A(dispatchKeyEvent)→ Input.insertText |
| T3 | 刷新页面后标题仍有乱码残留 | 服务端草稿自动恢复 + localStorage 缓存 | 清除 `localStorage.clear()` + `sessionStorage.clear()` 再刷新 |
| T4 | `setFieldsValue({title: ''})` 报 `NO_FORM` | Ant Design Form 实例未找到(React fiber 遍历失败) | 弃用 Form API,坚持 Ctrl+A → type |
| T5 | 标题 DOM 有一对辅助全角引号 `""` | 百家号 Lexical 插件自动添加 | 不影响实际发布,忽略 |

---

## 四、正文填充问题

| # | 问题 | 根因 | 解决方法 |
|---|------|------|----------|
| B1 | 内容写到 AI 助手面板而非正文区 | 正文在 `#ueditor_0` iframe 内,直接 type 写错位置 | 用 JS eval 操作 iframe 内部 DOM |
| B2 | `window.editor.setContent()` 报错 `setContent is not a function` | 编辑器未完全初始化 | 等 40 次 × 1.5s 轮询直到 READY |
| B3 | 字数显示为 0 | 正文未正确写入 iframe(之前失败的写法) | 确保用 iframe body innerHTML + input 事件 |
| B4 | 正文包含多余空行 | innerHTML 段落拼接不当 | 确保用 `<p>` 标签包裹每段,不是直接 `\n` |
| B5 | iframe eval 报跨域错误 | iframe 同域限制 | 百家号正文 iframe 为同域(`baijiahao.baidu.com`),不存在此问题 |

---

## 五、CDP 连接问题(v6 新增)

| # | 问题 | 根因 | 解决方法 |
|---|------|------|----------|
| C1 | CDP 端口 9222-9225 均无响应 | xb 启动的 Chrome 默认不带 `--remote-debugging-port` | 手动启动 Chrome:`start msedge --remote-debugging-port=9222` |
| C2 | CDP 连接后 eval 返回 null | 页面未加载完(空页面)或 target 已关闭 | 确保先 `Page.navigate` 加载目标页 |
| C3 | CDP `DOM.getDocument` 返回 `root: null` | 页面还未渲染(about:blank 时需要导航) | 先导航到目标页面再获取 document |
| C4 | CDP `DOM.setFileInputFiles` 报 `Node not found` | input 元素在 iframe 或 shadow DOM 内 | 用 `DOM.querySelector` 正确获取 nodeId |
| C5 | CDP 连接后页面导航失败 | `Page.navigate` 可能被 SSRF 策略拦截 | 改用 xb CLI 的 `open` 命令 |

---

## 六、工具兼容性问题

| # | 问题 | 解决方法 |
|---|------|----------|
| X1 | xb CLI 在 PowerShell 中输出中文乱码(`閫氳繃鐜...`),导致 exit code 非零 | 编写独立 Node.js 脚本封装所有 xb 操作 |
| X2 | PowerShell 不支持 `&&` 链式语法 | 改用分号 `;` 或 Node.js 脚本串联 |
| X3 | xb CLI `navigate` 命令不存在 | 用 `open` 命令代替 |
| X4 | xb CLI `fill` 命令中文编码损坏 | 改用 `type` 命令或 eval 设置 innerHTML |
| X5 | xb CLI 启动 Chrome 后立即退出 | 关闭所有残留 chrome.exe 进程后重试 |
| X6 | Node.js `ws` 模块未安装 | `npm install ws` |
| X7 | xb 的 `--base64` 参数 JS 必须 IIFE 包裹 | eval JS: `Buffer.from('(function(){...})()').toString('base64')` |
| X8 | 环境变量注入乱码 `"閫氳繃鐜 ̄ ̄{` | 不影响功能,忽略 |

---

## 七、页面状态与诊断

| # | 问题 | 解决方法 |
|---|------|----------|
| S1 | 页面状态不明 | 用 `xb run get url` 或 `cdpEval('window.location.href')` 确认 |
| S2 | 编辑器加载超时 / 变量未定义 | 40 轮 × 1.5s 轮询 `window.editor`;确保选中 URL 是编辑页 |
| S3 | 需要检查弹窗状态 | `cdpEval('document.querySelectorAll("[role=dialog]").length')` |
| S4 | 需要检查校验错误 | `cdpEval('(function(){var E=document.querySelectorAll("[class*=error]");return Array.from(E).map(function(e){return e.textContent.substring(0,40);}).join("|");})()')` |
| S5 | 要检查标题字数 | `cdpEval('document.querySelector("#newsTextArea [data-testid=\\"news-title-input\\"] [contenteditable=\\"true\\"]").textContent.length')` |
| S6 | 要检查正文字数 | `cdpEval('(function(){var d=(document.querySelector("#ueditor_0")||{}).contentDocument;return d?d.body.textContent.length:-1;})()')` |
| S7 | 要检查发布按钮是否被遮挡 | `cdpEval + elementFromPoint`(参考 workflow.md 第 7.1 节) |


## 八、2026-07-15 完整实战问题清单(发布《文言之用》)

> 本次从技能安装到发布成功,共踩 15 个坑,按阶段归纳。核心结论:**cheetah 组件只能用 CDP 真实鼠标坐标点击;选择器不依赖运行时 hash,全部文本/角色动态定位;操作前先排查遮挡层。**

### 阶段一:技能安装与环境(问题 1-3)
| # | 问题 | 根因 | 解决方法 |
|---|------|------|----------|
| 1 | GitHub 下载失败(代理没走通) | 环境里设了代理变量,但 GitHub 走系统 IE 代理 127.0.0.1:2080 才通 | 去掉 shell 代理变量,用系统代理通道重下 |
| 2 | 脚本硬编码原作者工作区路径 `<原工作区ID>` | 安装后路径与当前工作区不符 | 全局替换为当前工作区 ID 或改用动态推导 |
| 3 | 百家号未登录跳登录页 | xb 打开编辑页跳转到登录页 | 用户手动登录确认进后台再继续 |

### 阶段二:初次发布被打回(问题 4-5)
| # | 问题 | 根因 | 解决方法 |
|---|------|------|----------|
| 4 | 原 publish.js 封面坐标硬编码 (612,561) 点不中,被请添加封面拦截 | 坐标写死,实际占位随视口变化 | 改动态取 rect 真实坐标点击(已并入 publish.js) |
| 5 | 封面占位首次点击 cdpClickEl 返回 ERR | cheetah 组件两步间重渲染,DOM 节点脱钩 | 改单步 scrollIntoView+取坐标+立即 CDP 点击一步到位(已并入 publish.js) |

### 阶段三:封面点击定位(问题 6-9)
| # | 问题 | 根因 | 解决方法 |
|---|------|------|----------|
| 6 | `indexOf('选择封面')` 命中全屏大容器(1280×610)点空 | 模糊匹配命中含该词的列表容器 | 改精确匹配 `textContent.trim()==='选择封面'` |
| 7 | 封面区被手机预览遮罩 `preview-phone-modal` 挡住,点击落空 | 遮罩盖在封面上方 | 点封面前先点返回编辑关掉遮罩 |
| 8 | 前端 class hash 每次加载都变(`_73a3a52aab7e3a36`→`_48bec92b4e533276`) | 写死 hash 后续轮次失效 | 全部改文本/角色动态定位,不依赖 hash |
| 9 | SKILL.md 占位尺寸/坐标(198×134/(299,305))过时,实测 612×134/(506,312) | 文档静态坐标与实际不符 | 以动态探测结果为准,不迷信文档 |

### 阶段四:弹窗检测误判(问题 10)
| # | 问题 | 根因 | 解决方法 |
|---|------|------|----------|
| 10 | 检测封面弹窗已打开取第一个 `[role=dialog]`,命中常驻标题 内容 确认浮层误判中止 | 编辑页常驻 3 个 `[role=dialog]` | 遍历所有 dialog,找含AI封面/本地上传文本的才是封面弹窗(COVER_MODAL) |

### 阶段五:发布被遮挡(问题 11-13)
| # | 问题 | 根因 | 解决方法 |
|---|------|------|----------|
| 11 | 封面选择弹窗(fullscreen modal)盖住编辑页发布按钮,点击被吞、页面无变化 | 弹窗未关就点发布 | 点封面确定后先轮询确认弹窗消失,再点编辑页发布(真实坐标约 (800,594)) |
| 12 | fixed modal 内确定按钮坐标算出 (0,0) | 对 fixed modal 内按钮先 scrollIntoView 反而算出视口外 | modal 内按钮用 noScroll 直接取视口坐标 |
| 13 | `!!(...)` 布尔判断失灵(xbEval 序列化成字符串) | 字符串比较写成 `=== true` | 改 `=== 'true'` 字符串比较 |

### 阶段六:脚本工程(问题 14-15)
| # | 问题 | 根因 | 解决方法 |
|---|------|------|----------|
| 14 | PowerShell 把命令行内联 JS 当脚本解析报错 | 命令行直接贴 JS 被 shell 解析 | 所有 JS 写进 .js 文件再 `node` 执行 |
| 15 | 模板字符串拼接缺分号/引号报 SyntaxError | 字符串拼接写错 | 变量分步拼接,写文件后 `node` 验证语法 |

### 最终可用脚本
- `publish.js`:完整流程(填标题→填正文→setCoverAI→点发布),全部动态定位,AI 封面失败即中止(已禁用本地上传兜底)。

- 核心库 `cdp_lib.js`:CDP 连接 + `cdpEval` + `cdpClickXY` 真实坐标点击。

### 核心经验(五条)
1. cheetah 组件只能用 CDP 真实鼠标坐标点击,页面内 `click()`/`dispatchEvent` 无效。
2. 坐标必须 `getBoundingClientRect` 实时取,禁用硬编码;且单步取坐标后立即点击防重渲染脱钩。
3. 任何选择器不依赖运行时 hash,全部文本/角色/结构动态定位。
4. 操作前先排查遮挡层(预览遮罩、fullscreen modal),否则点击全落空。
5. 弹窗/状态检测要区分常驻浮层与业务弹窗,不能取第一个就当真。

## 九、已证伪的方法（2026-09-10 收尾沉淀，勿再用）

以下方法**实测无效或已被用户明令禁止**，不要再写回脚本或文档：

| 编号 | 失效做法 | 为何失效 | 正确做法 |
|------|----------|----------|----------|
| F-A | 用「AI封图」文本定位 tab | 新 UI tab 文本是「AI封面」，旧 `indexOf('AI封图')` 点不到 tab，导致封面流程错乱 | 用「AI封面」文本 |
| F-B | 切 AI封面 tab 后等“根据全文智能生成封面”按钮 | 该 SPAN 已不存在，切 tab 即自动生成（或点 `id=ai-cover-tab-v2-step-1`） | 点 `#ai-cover-tab-v2-step-1` 触发生成 |
| F-C | 点父 group / 缩略图外层容器选封面 | 只弹 `cheetah-popover` 浮层，无法选中，「确定」恒 disabled | **真实点击 `img` 元素本身**（父 group 加 `-selected`） |
| F-D | 缩略图选择器用 `width>40` 单过滤 | 弹窗内还有 336×252 大预览图排 `imgs[0]`，点中的是大预览图、选不中缩略图 | `width>40 && width<200` 取 70×52 候选 |
| F-E | `clickByText('确定')` 关弹窗 | 命中弹窗外编辑页同名「确定」按钮，弹窗未关、发布被遮挡 | 用精确坐标 `cdpClickXY` 点「确定 (1)」并轮询 `[role=dialog]` 消失 |
| F-F | 点「热门模板」/「做同款」 | AI 生成后直接选生成图即可；「做同款」是 `pointer-events:none` 提示（仅 hover 显示），点不动 | 直接选第一张 AI 生成图 |
| F-G | 本地上传兜底（setCoverUpload） | ⛔ 用户明令禁止 | AI 封面失败即**主动中止发布**，绝不带病发布 |
| F-H | 硬编码坐标点击 / in-page `.click()` | cheetah 组件不提交、坐标随视口漂移 | 全部用 `getBoundingClientRect` 动态取中心 + CDP 真实鼠标 |
| F-I | 向上找 `-default` 祖先定位封面占位 | hash 每次加载都变且取到 612px 外层非可点容器 | 用「精确文本 + 宽度过滤取最窄」 |
