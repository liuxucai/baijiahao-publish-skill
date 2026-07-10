# xb CLI 命令参考（v6，2026-07-07）

## 版本

- xb CLI: `0.25.3`
- 路径: `C:\Users\菠萝\.qclaw\skills\xbrowser\scripts\xb.cjs`

## xb CLI 命令

```bash
node xb.cjs run --browser chrome open <url>      # 打开 URL（xb 不支持 navigate）
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
