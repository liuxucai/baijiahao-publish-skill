# 百家号发布 - 工作流程 v6(2026-07-07 验证 / v7 修正 2026-07-10)

> ⚠️ v7 修正(2026-07-10 已 E2E 验证《京东外卖强势入局》发布成功):
> - 封面弹窗是 **cheetah 自研组件(非 antd)**。真实元素:打开弹窗占位 `DIV.FeEditorApp-_73a3a52aab7e3a36-default`、AI 生成触发是 `SPAN.FeEditorApp-_6853aa778d53acdc-theme` 文本“根据全文智能生成封面”(非 button、非 1153,274 的 DIV);“确定”按钮生成后文本为“确定 (1)”。
> - **v7 初版坐标 (612,561)/(1153,274)/(1384,752) 已失效**——2026-07-10 18:5x 二次实测:占位真实中心偏左(约299,535),硬编码必点空。所有点击须用 CDP **真实鼠标坐标**,坐标动态取 `getBoundingClientRect` 中心(见 `cdpClickEl`),禁硬编码、禁 in-page `.click()`。
> - 标题用 **CDP Input.insertText**(Ctrl+A 选中后替换,非追加)已验证可用。
> - **标题/封面缺失才是发布被静默拦截真因**,不是遮罩层。
> - 发布按钮:2026-07-10 17:07 发布时疑似原生 `button.click()` 有效;但 **18:54 二次实测证明 in-page `button.click()` 对 cheetah 不提交**,须用 CDP 真实鼠标坐标点击(见第七.1)。
> 完整可用脚本见 `scripts/bjh_publish3.js`(填标题+发布) 与 `scripts/bjh_cover3.js`(AI封面)。

## v6 更新要点

- **发布按钮无响应根因**：React 事件委托 + 透明遮罩层遮挡 + 表单校验静默拦截
- **封面方案推翻重建**：放弃纯 xb/AI 封面，改为 CDP 文件上传（`DOM.setFileInputFiles`）最可靠
- **新增 CDP WebSocket 直连方案**：处理 Ant Design 组件的 PointerEvent、文件上传、遮罩层移除
- **新增全局存储清理**：解决标题因服务端草稿恢复持续累积的问题

---

## 零、核心技术决策

### 0.1 浏览器方案对比

| 方案 | 优点 | 缺点 |
|------|------|------|
| xb CLI | 独立 profile，登录态持久 | 不支持 navigate，eval 耗时长 |
| CDP WebSocket（直连） | isTrusted=true，可上传文件，可移除 DOM | 需端口 9222，React 事件委托仍可能不响应 |
| OpenClaw browser MCP | 有截图 | 环境变量乱码，与 xb 实例分离 |

**最终方案**：xb CLI 启动浏览器 + CDP WebSocket 增强（混合模式）。

### 0.2 发布按钮失效根因分析

经过 30+ 次调试（2026-07-07），确认以下阻塞原因按顺序排查：

```
#1 表单校验失败 → 点击后 URL 不变，无任何反馈
   ├─ 标题超 64 字（Lexical 累积/服务端草稿恢复）
   ├─ 正文不足最低字数
   └─ 封面未绑定（"请添加封面"错误）
   
#2 透明遮罩层遮挡 → elementFromPoint 返回 cheetah-modal-wrap 而非发布按钮
   └─ 封面弹窗关闭后残留 position: fixed 层
   
#3 React 事件委托 → xb click 和 CDP mouseEvent 均可能不被 React 接受
   └─ React 18 合成的 onClick 可能检查 isTrusted、事件类型等
```

### 0.3 关于 AI 封面的真相

**重要发现（2026-07-07 19:46 截图验证）**：
- "AI封图" tab 切换不生效 → `cdp dispatchMouseEvent` 和 `xb click` 均无效
- 只能用 JS `element.click()` 通过 CDP eval 强制调用
- "确定"按钮在封面未生成时为 disabled，AI 生成后可能仍 disabled
- CDP 文件上传（本地上传）是唯一 100% 可靠的方式

---

## 一、打开发布页

xb CLI 用 `open` 命令（不支持 `navigate`）：

```javascript
await xb(['run', '--browser', 'chrome', 'open', 'https://baijiahao.baidu.com/builder/rc/edit?type=news&t=' + Date.now()]);
await sleep(8000);

// 等待编辑器加载完成
for (let i = 0; i < 40; i++) {
  const v = await cdpEval('(function(){var e=window.editor;return e&&typeof e.setContent==="function"?"READY":"WAIT";})()');
  if (v === 'READY') break;
  await sleep(1500);
}
```

**关键**：URL 加 `t=` 时间戳参数避免缓存。

---

## 二、关闭引导弹窗

百家号可能弹出多个弹窗：
1. **AI 助手欢迎** — "我知道了" 按钮
2. **图文新增功能说明** — "我知道了" 按钮  
3. **引导遮罩** — 需移除或点掉

```javascript
// 方法 A：xb snapshot 找 ref
const data = await snapshot();
const refs = data.refs || {};
for (const [ref, v] of Object.entries(refs)) {
  if (v.role === 'button' && v.name && v.name.includes('我知道了')) {
    await xb(['run', '--browser', 'chrome', 'click', ref], 15000);
    await sleep(1500);
  }
}

// 方法 B：CDP eval 定位
const ikPos = await cdpEval(`(function(){
  var B = document.querySelectorAll("button");
  for(var b of B){
    if(b.textContent.trim() === "我知道了" && b.offsetParent !== null){
      var r = b.getBoundingClientRect();
      return JSON.stringify({x:r.x+r.width/2, y:r.y+r.height/2});
    }
  }
  return "NF";
})()`);
if (ikPos && ikPos !== 'NF') await cdpClick(JSON.parse(ikPos).x, JSON.parse(ikPos).y);
```

---

## 三、可选的存储清理

标题累积过多（超 64 字）时，需要清理浏览器存储防止草稿恢复：

```javascript
// 先清存储再导航
await cdpEval('(function(){localStorage.clear();sessionStorage.clear();return"OK";})()');

// 重新打开发布页
await cdp('Page.navigate', { url: 'https://baijiahao.baidu.com/builder/rc/edit?type=news&t=' + Date.now() });
```

---

## 四、填入标题

### 4.1 CSS 选择器

```css
#newsTextArea [data-testid="news-title-input"] [contenteditable="true"]
```

> ⚠️ 不要用 `[data-testid="news-title-input"]` 本身（那是容器 div，不是可编辑元素）

### 4.2 填写方法

```javascript
// 1. 聚焦 → Ctrl+A → type（不要 Delete！）
await cdpEval('document.querySelector("#newsTextArea [data-testid=\\"news-title-input\\"] [contenteditable=\\"true\\"]").focus()');
await sleep(500);

// CDP 方式
await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', modifiers: 2, windowsVirtualKeyCode: 65, key: 'a' });
await cdp('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 2, windowsVirtualKeyCode: 65, key: 'a' });
await sleep(200);
await cdp('Input.insertText', { text: '文章标题' });
await sleep(500);
```

**为什么不能按 Delete？**
- Lexical 编辑器完全忽略 `execCommand('delete')`
- Ctrl+A+Delete 后 type → **追加**到末尾，而非替换
- 即使 `DataTransfer.paste('')` 清空，Lexical reconciler 也可能恢复内容

---

## 五、填入正文

### 5.1 UEditor iframe

百家号正文使用 UEditor，封装在 `#ueditor_0` iframe 中。

### 5.2 填写方法

```javascript
// 方法 A（推荐）：通过 window.editor.setContent
await cdpEval('window.editor.setContent("<p>正文段落</p><p>第二段落</p>")');

// 方法 B：直接操作 iframe body
await cdpEval(`(function(){
  var iframe = document.querySelector('#ueditor_0');
  var doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.body.innerHTML = '<p>正文段落</p>';
  doc.body.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
```

---

## 六、设置封面

### 6.1 方案 A：本地上传（推荐，最可靠）

```javascript
// 前置：npm install ws
// 前置：生成一张 800x533 JPG 封面图

// 1. 滚动到封面区域
await cdpEval('window.scrollTo(0, 700)');
await sleep(500);

// 2. 点击"选择封面"打开弹窗
await cdpClickBy(`(function(){
  var wa = document.createTreeWalker(document.body, 4, null, false);
  var n;
  while(n = wa.nextNode()){
    if(n.textContent.trim() === "选择封面"){
      var r = n.parentElement.getBoundingClientRect();
      return JSON.stringify({x:r.x+r.width/2, y:r.y+r.height/2});
    }
  }
  return "NF";
})()`);
await sleep(3000);

// 3. 找 file input 并上传
const doc = await cdp('DOM.getDocument', {});
const inputNode = await cdp('DOM.querySelector', {
  nodeId: doc.result.root.nodeId,
  selector: 'input[type="file"]'
});
await cdp('DOM.setFileInputFiles', {
  files: ['C:/path/to/cover.jpg'],
  nodeId: inputNode.result.nodeId
});
await sleep(3000);

// 4. 确认按钮（上传后自动激活 Enabled）
await cdpClickBy(`(function(){
  var B = document.querySelectorAll("button");
  for(var b of B){
    if(b.textContent.indexOf("确定") !== -1 && !b.disabled){
      return JSON.stringify({x:Math.round(b.getBoundingClientRect().x+b.getBoundingClientRect().width/2), y:Math.round(b.getBoundingClientRect().y+b.getBoundingClientRect().height/2)});
    }
  }
  return "NF";
})()`);
await sleep(3000);
```

### 6.2 方案 B：AI 封面（2026-07-10 第二次实测修正，已跑通）

> ⚠️ v7 初版坐标 (612,561)/(1153,274)/(1384,752) 与“生成按钮是 DIV”等结论已失效。
> 百家号编辑器对合成事件（JS `element.click()`、`dispatchEvent`）基本不响应，
> **封面各步一律用 CDP 真实鼠标坐标点击，坐标动态取 `getBoundingClientRect` 中心**（cdp_lib 的 `cdpClickEl`）。

```javascript
// 前置：npm install ws；cdp 连接后拿到 sock

// 0. 若封面弹窗未开，先真实点击占位项打开
//    占位项真实元素：DIV.FeEditorApp-_73a3a52aab7e3a36-default
//    ⚠️ 它嵌在列表容器内，列表中心约(506,535)但真正可点项中心偏左约(299,535)，
//       硬编码(612,561)必然点空，必须用元素 rect 动态点击。
await cdpClickEl(sock, "document.querySelector('.FeEditorApp-_73a3a52aab7e3a36-default')");
await sleep(2500);

// 1. 隐藏蓝色提示条（含“标题功能已合并至文字模板”）
await cdpEval(`(function(){var n=Array.from(document.querySelectorAll('*'));
  for(var i=0;i<n.length;i++){var e=n[i];
    if(e.children.length===0&&e.textContent.indexOf('标题功能已合并至文字模板')!==-1){
      var bar=e.closest('[class*=notice],[class*=tip],[class*=alert],[class*=bar],[class*=banner]')||e.parentElement;
      if(bar){bar.style.display='none';return 'HIDDEN';}}}return 'NF';})()`);
await sleep(600);

// 2. 切到 AI封图 tab（真实鼠标点击 [role=tab] 文本中心）
await cdpClickEl(sock, "(function(){var t=document.querySelectorAll('[role=tab]');
  for(var i=0;i<t.length;i++){if(t[i].textContent.indexOf('AI封图')!==-1)return t[i];}return null;})()");
await sleep(2200);

// 3. 触发 AI 生成：真实鼠标点击 SPAN“根据全文智能生成封面”
//    ⚠️ 它不是 button，是 SPAN.FeEditorApp-_6853aa778d53acdc-theme，
//       点它即按全文自动生成，无需先填提示词。
await cdpClickEl(sock, "(function(){var s=Array.from(document.querySelectorAll('span'));
  for(var i=0;i<s.length;i++){if(s[i].textContent.trim()==='根据全文智能生成封面'&&s[i].offsetWidth>0)return s[i];}return null;})()");
await sleep(2000);

// 4. 轮询“确定”按钮（文本为“确定 (1)”带空格和数字，须模糊匹配 indexOf('确定')）
let ok=false;
for(let i=0;i<30;i++){
  await sleep(5000);
  const d = await cdpEval(`(function(){var b=document.querySelectorAll('button');
    for(var i=0;i<b.length;i++){if(b[i].textContent.trim().indexOf('确定')!==-1&&b[i].offsetWidth>0)
      return b[i].disabled?'DISABLED':'ENABLED';}return 'NF';})()`);
  if(d==='ENABLED'){ ok=true; break; }
}
if(!ok){ console.log('AI 生成未果'); }

// 5. 真实鼠标点击“确定 (1)”应用封面
await cdpClickEl(sock, "(function(){var b=Array.from(document.querySelectorAll('button'));
  for(var i=0;i<b.length;i++){if(b[i].textContent.trim().indexOf('确定')!==-1&&b[i].offsetWidth>0)return b[i];}return null;})()");
await sleep(3000);
```

**核心要点**：
- 标题框、封面占位、AI 生成 SPAN、确定按钮、发布按钮——全部走 CDP 真实鼠标坐标点击，禁 in-page `.click()`。
- 坐标基于元素 `getBoundingClientRect` 运行时计算（用 `cdpClickEl`），绝不硬编码。
- AI 生成触发元素是 SPAN“根据全文智能生成封面”，不是 button、不是 `(1153,274)` 的 DIV。
- 生成完成后按钮文字是“确定 (1)”，检测用 `indexOf('确定')`。

---

## 七、发布

### 7.1 标准流程（2026-07-10 第二次实测修正）

```javascript
// ⚠️ 发布按钮:用 CDP 真实鼠标坐标点击(先取按钮 getBoundingClientRect 中心)。
//    in-page `button.click()` 对 cheetah 组件不提交(返回 CLICKED 但 URL 不变),
//    真实 isTrusted 鼠标事件才能触发 React 提交。

// 1. 先确认无校验错误弹窗(标题/封面缺失会被静默拦截)
const errors = await cdpEval(`(function(){var E=document.querySelectorAll("[class*=error]");
  return Array.from(E).map(function(e){return e.textContent.substring(0,40);}).join("|");})()`);
if (errors) console.log('  发布前校验错误:', errors);

// 2. CDP 真实鼠标点击发布按钮(动态取中心)
await cdpClickEl(sock, "(function(){var b=Array.from(document.querySelectorAll('button'));
  for(var i=0;i<b.length;i++){if(b[i].textContent.trim()==='发布'&&b[i].offsetWidth>0)return b[i];}return null;})()");
await sleep(3000);

// 3. 若有确认弹窗,同样真实鼠标点击“确认发布”/“确定”
const dlg = await cdpEval(`(function(){var b=Array.from(document.querySelectorAll('button'));
  for(var i=0;i<b.length;i++){var t=b[i].textContent.trim();
    if((t==='确认发布'||t==='确定')&&b[i].offsetWidth>0)return t;}return 'NF';})()`);
if (dlg!=='NF') {
  await cdpClickEl(sock, "(function(){var b=Array.from(document.querySelectorAll('button'));
    for(var i=0;i<b.length;i++){var t=b[i].textContent.trim();
      if((t==='确认发布'||t==='确定')&&b[i].offsetWidth>0)return b[i];}return null;})()");
  await sleep(3000);
}

// 4. 轮询 URL 跳转 / body 含“审核”即为成功
for(let i=0;i<15;i++){
  await sleep(3000);
  const url = await cdpEval('window.location.href');
  const snap = await cdpEval('document.body.innerText');
  const ok = snap.indexOf('发布成功')!==-1||snap.indexOf('审核中')!==-1||
            snap.indexOf('已发布')!==-1||snap.indexOf('已提交')!==-1||
            url.indexOf('manage')!==-1||url.indexOf('success')!==-1||url.indexOf('articleId')!==-1;
  if (ok) { console.log('🎉 发布成功！'); break; }
}
```

### 7.2 失败后的手动操作指引

如果自动发布失败，浏览器已打开在编辑器页。手动操作：

1. **检查标题**：看标题是否超长（应 ≤64 字），多字按 Delete 删
2. **检查封面**：页面右下角是否显示封面缩略图？否→手动设封面
3. **点发布**：直接点"发布"按钮
4. **确认弹窗**：如有"确认发布"弹窗，点确认
5. 完成后再回到对话回复结果

---

## 八、关键选择器速查

| 目标 | CSS 选择器 | 操作方式 |
|------|-----------|---------|
| 标题输入 | `#newsTextArea [data-testid="news-title-input"] [contenteditable="true"]` | `Ctrl+A → type` 或 `CDP insertText` |
| 正文 iframe | `#ueditor_0` | `contentDocument.body.innerHTML` 或 `window.editor.setContent()` |
| 发布按钮 | `button[data-testid="publish-btn"]` | CDP mouseEvent |
| 选择封面 | `document.createTreeWalker` 查找 "选择封面" 文本 | CDP mouseEvent |
| AI封图 tab | `[role=tab]` 含 "AI封图" | JS eval `element.click()` |
| 生成封面 | 查找含 "根据全文智能生成" 的文本节点 | CDP mouseEvent |
| 确定按钮 | `button` 含 "确定" 且 `!disabled` | CDP mouseEvent |
| file input | `input[type="file"]` | CDP `DOM.setFileInputFiles` |
| 遮罩层 | `position: fixed` 高 z-index | CDP eval `remove()` / `display: none` |
| 弹窗 | `[role=dialog]` | CDP eval 读取/关闭 |

---

## 九、验证函数

```javascript
async function verify() {
  const url = await cdpEval('window.location.href');
  const title = await cdpEval(`(function(){
    var el = document.querySelector('#newsTextArea [data-testid="news-title-input"] [contenteditable="true"]');
    return el ? el.textContent.length : -1;
  })()`);
  const body = await cdpEval(`(function(){
    var iframe = document.querySelector('#ueditor_0');
    var doc = iframe ? (iframe.contentDocument || iframe.contentWindow.document) : null;
    return doc ? doc.body.textContent.length : -1;
  })()`);
  const errors = await cdpEval(`(function(){
    var E = document.querySelectorAll("[class*=error]");
    return Array.from(E).map(function(e){return e.textContent.substring(0,40);}).join("|");
  })()`);
  return { url, titleLen: parseInt(title), bodyLen: parseInt(body), errors };
}
```

---

## 十、发布按钮不响应的故障排除路径

```
按下发布按钮 → URL 不变
├─ 检查 dialog 数量
│  ├─ > 0 → 有校验弹窗，关闭后重试
│  └─ = 0 → 检查 elementFromPoint
│     ├─ 返回发布按钮自身 → 表单校验静默拦截
│     │  ├─ 检查 error 文本内容
│     │  └─ 修复后重试
│     └─ 返回其他元素 → 遮罩层遮挡
│        ├─ 移除所有 position:fixed
│        └─ 重试
└─ 如果全部正常仍不通 → 手动
```
