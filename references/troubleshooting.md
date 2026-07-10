# 百家号发布问题与解决方案(v6,2026-07-07 / v7 修正 2026-07-10)

> ⚠️ v7 重大修正(2026-07-10 已 E2E 验证发布成功):
> 1. **发布按钮**:v7 初版称可用 CDP eval 原生 `button.click()` 一次完成——**二次实测(18:54)证明不成立**:in-page `button.click()` 对 cheetah/React 组件不提交(返回 CLICKED 但 URL 不变)。**正确做法:CDP `Input.dispatchMouseEvent` 真实鼠标坐标点击**(取按钮真实中心)。标题为空/封面缺失仍会静默拦截,表现为按钮失灵。
> 2. **封面弹窗不是 Ant Design**,是百家号自研 cheetah/FeEditorApp 组件,所有 `.ant-modal` 选择器失效。
> 3. **遮罩层不是发布拦截根因**——移除遮罩层的暴力方案多余,标题/封面缺失才是真因。
> 4. **标题用 CDP Input.insertText 可用**(非追加),之前 T2 结论过时。
> 5. **封面各步(v7 初版坐标 612,561/1153,274/1384,752 已失效)**:占位项真实中心偏左(约299,535)、AI 生成触发是 SPAN“根据全文智能生成封面”(非 1153,274 的 DIV),全部须真实鼠标 + 动态取中心,禁硬编码、禁 `.click()`。

## 一、发布按钮不响应(v7 已解决,原 v6 误判为无解)

| # | 问题 | 根因 | 解决方法 |
|---|------|------|----------|
| P1 | 点"发布"后 URL 不变,无任何反馈 | **表单校验静默拦截**;标题超 64 字/正文不足/封面未绑定 | 先检查 `[class*=error]` 元素内容,修正后重试 |
| P2 | `elementFromPoint` 返回 `cheetah-modal-wrap` 而非发布按钮 | 封面弹窗关闭后残留透明 `position: fixed` 遮罩层 | 暴力移除所有 `position: fixed`/`sticky` 元素 |
| P3 | `elementFromPoint` 返回 `SPAN` 等其他元素 | 另一个 modal 或 tooltip 在发布按钮上方 | 移除所有遮罩层,重试;仍不行则手动 |
| P4 | CDP `Input.dispatchMouseEvent` 坐标点发布按钮无响应 | 坐标 (1113,888) 处命中 button 内 `<span>发布</span>`,或坐标非元素真实中心 | **已解决**:真实鼠标坐标点击(取按钮 `getBoundingClientRect` 中心,用 `cdpClickEl`);坐标须是元素真实中心,可绕过 span 子节点被 React 正常响应。2026-07-10 18:54 实测确认真实鼠标点击可提交 |
| P5 | xb click / in-page `button.click()` 点发布按钮无响应 | cheetah 组件对合成事件不响应,仅接受真实 `isTrusted` 鼠标事件 | **已解决**:用 CDP 真实鼠标坐标点击(非 `button.click()`)。⚠️ v7 初版称 `button.click()` 有效——二次实测证明不成立(in-page click 返回 CLICKED 但 URL 不变) |
| P0 | 点发布无任何反应(URL 不变、无弹窗) | **真实根因:标题为空**(占位符"请输入标题"被误判为有标题),被"标题必填"校验静默拦截 | 填标题进 React 状态后再 `button.click()`;填法见 T1/T2(CDP insertText 已验证可用) |
| P6 | 点发布后 dialog 弹出但点"确认"后还是回到编辑页 | 表单校验 dialog,确认后重新验证失败 | 检查 dialog 文本,找到具体错误原因 |
| P7 | 发布错误信息含"请添加封面" | 封面未真正绑定(AI 生成了但"确定"按钮没点上) | 重新执行封面流程(本地上传方案最稳) |
| P8 | 发布错误信息含"标题最多64个字" | 服务端草稿恢复导致标题累积(Lexical 累积乱码) | 清除 storage 后刷新页面,重填标题 |
| P9 | 表单校验无任何错误文本 | 页面可能出错了(如 React 崩溃) | 刷新页面,从零开始 |

**根因总结(v7 修正)**:发布按钮不响应主要是**标题为空被必填校验静默拦截**造成的假象,而非 React 事件委托或遮罩层。用 CDP eval `button.click()` 触发原生冒泡事件即可发布,已彻底自动化,无需手动。

---

## 二、封面相关问题(v6 更新重写)

| # | 问题 | 根因 | 解决方法 |
|---|------|------|----------|
| F1 | 点击“选择封面”后弹窗不打开 | (1) 点到列表容器而非真正占位项(占位项偏左,列表中心会落空);(2) 用 in-page `.click()` 合成事件(cheetah 不响应) | **真实鼠标点击占位项** `DIV.FeEditorApp-_73a3a52aab7e3a36-default`,动态取 `getBoundingClientRect` 中心(用 `cdpClickEl`),禁硬编码 (612,561) |
| F2 | “AI封图” tab 点击不切换 | 封面弹窗是 cheetah 自研组件,非 Ant Design;tab 用 `[role=tab]` | CDP **真实鼠标**点 `[role=tab]` 的 `getBoundingClientRect` 中心(已验证);in-page `.click()` 无效 |
| F4 | “根据全文智能生成封面”触发找不到/点了无反应 | 它不是 button,是 `SPAN.FeEditorApp-_6853aa778d53acdc-theme`;v7 初版说的生成 DIV (1153,274) 已失效 | CDP **真实鼠标**点该 SPAN(动态中心);点它即按全文自动生成,无需先填提示词 |
| F3 | “确定”按钮 disabled（灰色不可点） | 封面图未生成/未选中 | AI:真实鼠标点 SPAN 触发生成,轮询 22s+ 直到文本变“确定 (1)”启用再真实点击 |
| F4 | 封面弹窗内“根据全文智能生成封面”按钮找不到 | 可能:CSS 隐藏、或未切到 AI 封图 tab | 先切 AI 封图 tab(真实鼠标),再点该 SPAN |
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
