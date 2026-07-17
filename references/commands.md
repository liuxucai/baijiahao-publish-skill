# 命令参考（v6，2026-07-07；2026-07-15 更新浏览器启用方式）

## 启用浏览器（isolated-browser，非 xb）

> 本 skill 的浏览器**统一由 isolated-browser skill 拉起**,不再依赖 xb 托管 Chrome。xb 有安全锁:检测到用户已在跑 Chrome/Edge 会拒绝另起实例,因此改走隔离实例 + CDP 直连路线。

```bash
# 拉起隔离 Chrome(固定 profile ~/.chrome_qclaw_stable + CDP 端口 9222 常驻),手动登录百家号
node skills/isolated-browser/scripts/launch.js
```

隔离 Chrome 以 `--remote-debugging-port=9222` 常驻提供 CDP;后续发布脚本经 `ws://127.0.0.1:9222` 直连驱动。

## 版本

- 启用浏览器: `isolated-browser` skill(via `skills/isolated-browser/scripts/launch.js`)
- CDP 驱动: Node.js `ws` 模块
- 以下 xb CLI 参考保留作诊断/备选(正式流程不以 xb 启动浏览器)

## xb CLI 命令（诊断/备选，非正式流程）

```bash
node xb.cjs run --browser chrome open <url>      # 打开 URL（xb 不支持 navigate，需用户先关自己 Chrome）
node xb.cjs run --browser chrome screenshot        # 截图
node xb.cjs run --browser chrome snapshot          # 快照（获取 ref + 页面结构）
node xb.cjs run --browser chrome click <ref|selector> # 点击元素
node xb.cjs run --browser chrome type <ref> "文本" # 输入文本（保留格式，替换选区）
node xb.cjs run --browser chrome fill <ref> "文本" # 填入（中文编码有问题）
node xb.cjs run --browser chrome press <ref> <key> # 按键（如 Control+a）
node xb.cjs run --browser chrome get url           # 获取当前 URL
node xb.cjs run --browser chrome get text <ref>    # 获取元素文本
node xb.cjs run --browser chrome eval --base64 <b64> # 执行 JS（需要 IIFE + base64 编码）
node xb.cjs run --browser chrome iframe <ref> action <selector> # iframe 内操作
node xb.cjs config show                            # 查看配置
node xb.cjs config set browser=chrome              # 切到正式 Chrome
node xb.cjs config set headed=true                 # 非 headless
```

## 不支持的 xb 命令

- `navigate` — 不存在，用 `open` 代替
- `evaluate` — 不存在，用 `eval --base64` + base64(IIFE) 代替
- `--selector` 参数 — 不存在，但支持 CSS selector 内嵌语法如 `click iframe body`

## CDP WebSocket 命令（ws://127.0.0.1:9222/json）

```javascript
// 连接示例
const ws = require('ws');
const http = require('http');

// 获取 WebSocket URL
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
cdp('Runtime.evaluate', { expression: 'JS code', returnByValue: true, awaitPromise: true });
cdp('DOM.getDocument', {});
cdp('DOM.querySelector', { nodeId: rootId, selector: 'input[type="file"]' });
cdp('DOM.setFileInputFiles', { files: ['path/to/img.jpg'], nodeId: 64 });
cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', modifiers: 2, windowsVirtualKeyCode: 65, key: 'a' });
cdp('Input.insertText', { text: '标题内容' });
```

## CSS 选择器速查

| 目标 | 选择器 |
|------|--------|
| 标题输入 | `#newsTextArea [data-testid="news-title-input"] [contenteditable="true"]` |
| 正文 iframe | `#ueditor_0` |
| 发布按钮 | `button[data-testid="publish-btn"]` |
| 文件上传 input | `input[type="file"]` |
| 弹出层 tab | `[role=tab]` |
| dialog 容器 | `[role=dialog]` |
| 错误元素 | `[class*=error]` |
| 遮罩层 | `position: fixed` |
