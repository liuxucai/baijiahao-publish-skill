# 百家号发布 - 工作流程（2026-07-15 实测修正版）

> ⚠️ v3 修正(2026-08-21 实战验证《身处低谷时,请重新认识你的「处境」》发布成功):
> - 封面弹窗是 **cheetah 自研组件(非 antd)**。占位项、AI 生成触发(SPAN"根据全文智能生成封面")、"确定 (1)"按钮均用文本/角色动态定位,禁写死运行时 class hash。
> - **所有点击用 CDP 真实鼠标坐标**(Input.dispatchMouseEvent),坐标动态取 getBoundingClientRect 中心(见 cdp_lib.cdpClickXY + 本地 getRect),禁硬编码坐标、禁 in-page .click()/dispatchEvent。
> - 标题用 **CDP Input.insertText**(Ctrl+A 选中后替换,非追加)已验证可用。
> - **标题/封面缺失才是发布被静默拦截真因**,不是遮罩层。
> - 发布按钮:须用 CDP 真实鼠标坐标点击(实测 in-page `button.click()` 对 cheetah 不提交)。
> - ⚠️ **封面占位真实可点元素不是"选择封面"文字向上找的 -default 外层(612×134,点它不开弹窗),而是该文字所在的内层 ~198×134 卡片本身**(取 width 过滤后最窄者)。这是旧版误判"封面弹窗未正确打开"的根因。
> 完整可用脚本:`scripts/publish.js`(全流程,自包含纯 CDP,已验证 E2E;旧 cover_publish.js / finish_publish.js / final_publish.js 已删除)。

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
- "AI封面" tab 切换不生效 → 旧 `indexOf('AI封图')` 点不到;改用「AI封面」文本
- 只能用 JS `element.click()` 通过 CDP eval 强制调用
- "确定"按钮在封面未生成时为 disabled，AI 生成后可能仍 disabled
- CDP 文件上传（本地上传）⛔ 已禁用(用户禁止);AI 封面失败即中止发布,勿回退本地上传

---

## 一、打开发布页

用 CDP `Page.navigate` 导航：

```javascript
await cdp('Page.navigate', { url: 'https://baijiahao.baidu.com/builder/rc/edit?type=news&t=' + Date.now() });
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
// CDP eval 定位“我知道了”并真实鼠标点击
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

### 6.1 ⛔ 方案 A：本地上传（已禁用，用户禁止）

> **2026-09-10 起已禁用**：用户明令禁止本地上传兜底。AI 封面失败即**主动中止发布**，绝不回退本地上传、绝不带病发布。
> 以下旧脚本片段仅供参考历史实现（setCoverUpload 已从 publish.js 删除，请勿复用）：

```javascript
// 旧实现(已禁用,勿用):本地上传走 DOM.setFileInputFiles,需先切"本地上传" tab 后 file input 才存在
// 用户禁止,publish.js 不再提供此路径
```

### 6.2 方案 B：AI 封面（2026-07-15 实测跑通）

> 封面各步一律用 CDP 真实鼠标坐标点击,选择器用文本/角色定位,禁写死运行时 class hash。
> **封面各步一律用 CDP 真实鼠标坐标点击，坐标动态取 `getBoundingClientRect` 中心**（cdp_lib 的 `cdpClickEl`）；
> 选择器用文本/角色定位，禁写死运行时 class hash（`FeEditorApp-*` hash 每次加载都变）。

```javascript
// 前置：npm install ws；cdp 连接后拿到 sock

// 0. 若封面弹窗未开，先真实点击占位项打开
//    ⚠️ 真实可点的是“选择封面”文字所在的内层 ~198px 卡片本身（取 width 100~400 过滤后最窄者）。
//      千万别用“向上找 -default 祖先”——querySelectorAll('*') 外层先于内层，会停在 612px 非可点容器，导致点空。
//      class hash 每次加载都变，一律动态取 rect，不写死。
await cdpClickEl(sock, "(function(){var els=Array.from(document.querySelectorAll('*'));var c=els.filter(function(e){return (e.textContent||'').trim()==='选择封面'&&e.getBoundingClientRect().width>100&&e.getBoundingClientRect().width<400;});if(!c.length)return null;c.sort(function(a,b){return a.getBoundingClientRect().width-b.getBoundingClientRect().width;});return c[0];})()");
await sleep(2500);

// 1. 隐藏蓝色提示条（含“标题功能已合并至文字模板”）
await cdpEval(`(function(){var n=Array.from(document.querySelectorAll('*'));
  for(var i=0;i<n.length;i++){var e=n[i];
    if(e.children.length===0&&e.textContent.indexOf('标题功能已合并至文字模板')!==-1){
      var bar=e.closest('[class*=notice],[class*=tip],[class*=alert],[class*=bar],[class*=banner]')||e.parentElement;
      if(bar){bar.style.display='none';return 'HIDDEN';}}}return 'NF';})()`);
await sleep(600);

// 2. 切到 AI封面 tab（真实鼠标点击 [role=tab] 文本中心，动态 rect）
await cdpClickEl(sock, "(function(){var t=document.querySelectorAll('[role=tab]');
  for(var i=0;i<t.length;i++){if(t[i].textContent.indexOf('AI封面')!==-1)return t[i];}return null;})()");
await sleep(2200);

// 3. 触发 AI 生成：真实鼠标点击 id=ai-cover-tab-v2-step-1（role=button，AI 生成封面入口）
//    ⚠️ 新 UI 已无“根据全文智能生成封面”SPAN；切到 AI封面 tab 后点 step-1 即按全文自动生成 14~17 张缩略图。
//    （无需走 step-2 热门模板，也无需点“做同款”——它是 pointer-events:none 提示，点不动）
await cdpClickEl(sock, "(function(){var e=document.getElementById('ai-cover-tab-v2-step-1');return e||null;})()");
await sleep(3000);

// 4. 点选第一张缩略图（70×52 的 img 本身，width 41~200；勿点 336×252 大预览图，它会被 width>40 排在 imgs[0] 但选不中）
//    ⚠️ 必须真实点击 img 元素本身；点父 group 只弹 cheetah-popover、无法选中，确定恒 disabled。
//    选中后父 group 加 -selected 类、"确定 (1)" 才 enabled。
const THUMB = "(function(){var c=(" + COVER_MODAL + ");if(!c)return null;var imgs=Array.from(c.querySelectorAll('img')).filter(function(img){var w=img.getBoundingClientRect().width;return w>40&&w<200;});return imgs[0]||null;})()";
let ok=false;
for(let pick=0;pick<3&&!ok;pick++){
  await cdpClickEl(sock, THUMB);
  for(let ri=0;ri<3;ri++){
    await sleep(2000);
    const d = await cdpEval("(function(){var c=(" + COVER_MODAL + ");var b=Array.from(c.querySelectorAll('button')).find(function(x){return x.textContent.indexOf('确定')!==-1;});return b?(b.disabled?'DISABLED':'ENABLED'):'NF';})()");
    if(d==='ENABLED'){ ok=true; break; }
  }
}
if(!ok){ console.log('AI 封面未选中,中止发布'); }

// 5. 用精确坐标真实鼠标点击“确定 (1)”应用封面（cdpClickEl 曾命中外层同名“确定”按钮，弹窗未关）
const rc = await cdpEval("(function(){var c=(" + COVER_MODAL + ");var b=Array.from(c.querySelectorAll('button')).find(function(x){return x.textContent.indexOf('确定')!==-1&&x.offsetWidth>0;});if(!b)return 'NF';var r=b.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});})()");
if(rc.indexOf('{')===0){ const pp=JSON.parse(rc); await cdpClickXY(sock, pp.x, pp.y); }
for(let ci=0;ci<5;ci++){ await sleep(2000);
  const still = await cdpEval("(function(){var ds=Array.from(document.querySelectorAll('[role=dialog]'));return ds.some(function(d){return d.innerText.indexOf('AI封面')!==-1||d.innerText.indexOf('本地上传')!==-1;});})()");
  if(!still) break;
}
await sleep(3000);
```

**核心要点**：
- 标题框、封面占位、AI 生成 SPAN、确定按钮、发布按钮——全部走 CDP 真实鼠标坐标点击，禁 in-page `.click()`。
- 坐标基于元素 `getBoundingClientRect` 运行时计算（用 `cdpClickEl`），绝不硬编码。
- AI 生成触发元素是 id=ai-cover-tab-v2-step-1（role=button），不是旧 SPAN“根据全文智能生成封面”（已不存在）。
- 选封面必须真实点击 img 元素本身（width 41~200），禁点 group（只弹 popover、选不中）。
- 关闭弹窗用精确坐标 cdpClickXY 点“确定 (1)”，并轮询 [role=dialog] 消失（clickByText 会命中外层同名按钮）。

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
| 选择封面 | 精确文本"选择封面" + width 过滤(100~400)取最窄者(内层 ~198px 卡片) | CDP mouseEvent(动态 rect) |
| AI封面 tab | `[role=tab]` 含 "AI封面" | CDP mouseEvent |
| 生成封面 | `#ai-cover-tab-v2-step-1` (role=button) | CDP mouseEvent |
| AI 封面缩略图 | `img` width 41~200（弹窗内；勿选 336×252 大预览） | CDP mouseEvent（点 img 本身） |
| 确定关闭弹窗 | `button` 含 "确定 (1)" | CDP mouseEvent 精确坐标 + 轮询 dialog 消失 |
| AI 封面缩略图 | `img` width 41~200（弹窗内；勿选 336×252 大预览） | CDP mouseEvent（点 img 本身） |
| 确定关闭弹窗 | `button` 含 "确定 (1)" | CDP mouseEvent 精确坐标 + 轮询 dialog 消失 |
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
