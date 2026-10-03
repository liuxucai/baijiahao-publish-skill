# 命令参考（v4，2026-09-29 更新：删除 xb CLI 废弃路线，补防节流启动 + 上传 CDP 参考）

> **xb CLI 路线已于 2026-08-21 整体废弃**（v3 重写为自包含纯 CDP；中文乱码/命令缺失/安全锁等问题
> 见 troubleshooting.md 旧章节 X1~X8，仅作历史参考）。本 skill 现在只依赖：
> **isolated-browser 拉起的隔离 Chrome + Node.js `ws` 模块 CDP 直连**。

## 启用浏览器（isolated-browser）

```bash
# 拉起隔离 Chrome（固定 profile ~/.chrome_qclaw_stable + CDP 端口 9222 常驻），手动登录百家号
node skills/isolated-browser/scripts/launch.js "https://baijiahao.baidu.com/builder/rc/edit?type=news"
```

⚠️ **launch.js 必须是 2026-09-29 之后的版本**（内置防后台节流四参数）：

```
--disable-backgrounding-occluded-windows
--disable-background-timer-throttling
--disable-renderer-backgrounding
--disable-features=CalculateNativeWinOcclusion
```

缺这几条时，窗口被其他窗口遮挡 → `visibilityState=hidden` → 渲染被节流 →
插图弹窗等懒加载弹窗只挂载空壳（无 tab 无内容、确认按钮恒 disabled）、截图黑屏。
`Page.bringToFront` 对被 OS 层遮挡的窗口无效，只有启动参数能兜底。

在 WorkBuddy 沙箱中还要用 `run_in_background: true` + 末尾 `sleep 7200` 保活，
否则沙箱在命令结束时会回收 detached 子进程（Chrome 立刻被杀）。

隔离 Chrome 以 `--remote-debugging-port=9222` 常驻提供 CDP；发布脚本经 `ws://127.0.0.1:9222` 直连驱动。
登录态存在 `~/.chrome_qclaw_stable`，重启实例不丢。

## CDP WebSocket 命令（ws://127.0.0.1:9222/json）

```javascript
// 连接示例
const ws = require('ws');
const http = require('http');

http.get('http://127.0.0.1:9222/json', res => {
  let d = ''; res.on('data', c => d += c);
  res.on('end', () => {
    const list = JSON.parse(d);
    const page = list.find(t => t.type === 'page');
    const wsUrl = page.webSocketDebuggerUrl;
    // ...
  });
});

// 常用 CDP 命令
cdp('Page.navigate', { url: '...' });
cdp('Page.bringToFront', {});                    // 切前台标签页（对 OS 遮挡无效，见上）
cdp('Runtime.evaluate', { expression: 'JS code', returnByValue: true, awaitPromise: true });
cdp('DOM.getDocument', { depth: 0 });
cdp('DOM.querySelector', { nodeId: rootId, selector: 'input[type="file"]' });
cdp('DOM.setFileInputFiles', { files: ['path/to/img.jpg'], nodeId: 64 });
cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });   // hover（二级菜单需要）
cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', modifiers: 2, windowsVirtualKeyCode: 65, key: 'a' });
cdp('Input.insertText', { text: '标题内容' });
```

## 文件上传的正确姿势（插图/封面上传，2026-09-29 实测修正）

**不要**用 `DOM.querySelector` 全局找第一个 `input[type=file]`——编辑页还有 video 的上传框，会选错。
正确链路（`scripts/publish_with_image.js` 的 `setImgFile` 已实现）：

```javascript
// 1) Runtime.evaluate 用 returnByValue:false 拿到 input 的 objectId（按 accept=image 过滤取最后一个）
const r = cdp('Runtime.evaluate', {
  expression: "(function(){var ins=Array.from(document.querySelectorAll('input[type=file]'))" +
              ".filter(function(i){return (i.accept||'').indexOf('image')!==-1;});" +
              "return ins.length?ins[ins.length-1]:null;})()",
  returnByValue: false
});
// 2) 必须先 DOM.getDocument 初始化，否则下一步常报 NO_NODE
cdp('DOM.getDocument', { depth: 0 });
// 3) objectId → nodeId → setFileInputFiles
const rn = cdp('DOM.requestNode', { objectId: r.result.result.objectId });
cdp('DOM.setFileInputFiles', { nodeId: rn.result.nodeId, files: ['D:/path/img.jpg'] });
```

注意（troubleshooting I3/I5）：
- 设置后 `input.files.length` 用 JS 读出**恒为 0**（FileList 只读假象），上传实际已触发——
  成功与否以弹窗「确认」按钮变 enabled 为准（约 10~15s）；
- **只 set 一次**，反复重设会插入 N 张重复图（重复时用 `finish_dedupe_publish.js` 收尾去重）。

## CSS 选择器速查

| 目标 | 选择器 |
|------|--------|
| 标题输入 | `#newsTextArea [data-testid="news-title-input"] [contenteditable="true"]` |
| 正文编辑器 | `window.editor`（UEditor 全局对象，`setContent/getContent/getContentTxt`） |
| 工具栏插图按钮 | `.edui-for-insertimage` |
| 图片上传 input | `input[type=file][accept*=image]`（取最后一个） |
| 插图/封面弹窗 | `[role=dialog]`（外层 `.cheetah-modal-wrap`；插图弹窗按钮文案是「确认」） |
| 发布按钮 | `button[data-testid="publish-btn"]` |
| 弹出层 tab | `[role=tab]` |
| 错误元素 | `[class*=error]` |
| 残留遮罩 | `.cheetah-modal-wrap`（关弹窗后要无条件 `display:none`） |
