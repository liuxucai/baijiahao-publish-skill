/**
 * 百家号文章发布 - xb CLI 封装库（v6 - CDP 增强版）
 * 
 * 新增 CDP WebSocket 直连方案，用于处理 Ant Design 组件点击（PointerEvent）、
 * 文件上传（DOM.setFileInputFiles）和模态遮罩层移除。
 * 
 * 用法：
 * const { xb, fillTitle, fillBody, setCoverViaUpload, setAICover, publish, cleanup, sleep, killOverlays, ensureCDP } = require('./lib.js');
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const XB = 'C:\\Users\\菠萝\\.qclaw\\skills\\xbrowser\\scripts\\xb.cjs';
const WORKSPACE = 'C:\\Users\\菠萝\\.qclaw\\workspace-agent-3af8d089';
const SCREENSHOT_DIR = 'C:\\Users\\菠萝\\.agent-browser\\tmp\\screenshots';
const COVER_IMG = path.join(WORKSPACE, 'cover.jpg');

// ========================= CDP 连接管理 =========================

let _cdpSock = null;
let _cdpMid = 0;
let _cdpPend = {};

/**
 * 尝试连接 CDP WebSocket（端口 9222~9225）
 */
function getCDPUrl(port) {
  return new Promise((rs) => {
    http.get('http://127.0.0.1:' + port + '/json', (res) => {
      let d = '';
      res.on('data', c => d += c.toString());
      res.on('end', () => {
        try {
          const list = JSON.parse(d);
          const page = list.find(t => t.type === 'page');
          rs(page ? page.webSocketDebuggerUrl : null);
        } catch (e) { rs(null); }
      });
    }).on('error', () => rs(null));
  });
}

/**
 * 确保 CDP 连接已建立
 * @returns {boolean} true=可用
 */
async function ensureCDP() {
  if (_cdpSock && _cdpSock.readyState === 1) return true;
  
  const wsUrl = await getCDPUrl(9222) || await getCDPUrl(9223) || await getCDPUrl(9224) || await getCDPUrl(9225);
  if (!wsUrl) return false;
  
  const ws = require('ws');
  return new Promise((rs) => {
    _cdpSock = new ws(wsUrl);
    _cdpMid = 0;
    _cdpPend = {};
    
    _cdpSock.on('message', (d) => {
      const msg = JSON.parse(d.toString());
      if (msg.id && _cdpPend[msg.id]) {
        _cdpPend[msg.id](msg);
        delete _cdpPend[msg.id];
      }
    });
    _cdpSock.on('open', () => rs(true));
    _cdpSock.on('error', () => rs(false));
    setTimeout(() => rs(false), 5000);
  });
}

/**
 * 执行 CDP 命令
 */
function cdp(method, params = {}) {
  return new Promise((rs, rj) => {
    if (!_cdpSock || _cdpSock.readyState !== 1) {
      return rj(new Error('CDP not connected'));
    }
    const id = ++_cdpMid;
    _cdpPend[id] = rs;
    _cdpSock.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (_cdpPend[id]) { delete _cdpPend[id]; rj(new Error('CDP timeout: ' + method)); }
    }, 30000);
  });
}

/**
 * CDP Runtime.evaluate 快捷方式
 */
function cdpEval(expression) {
  return cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    .then(r => r && r.result && r.result.result ? r.result.result.value : null);
}

/**
 * CDP 真实鼠标点击（isTrusted=true，穿透遮罩层）
 */
function cdpClick(x, y) {
  return cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
    .then(() => sleep(50))
    .then(() => cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }));
}

/**
 * 通过 JS 表达式获取元素坐标后 CDP 点击
 */
async function cdpClickBy(jsFind) {
  const posStr = await cdpEval(jsFind);
  if (!posStr || posStr === 'NF') return false;
  try {
    const xy = JSON.parse(posStr);
    await cdpClick(xy.x, xy.y);
    return true;
  } catch (e) { return false; }
}

// ========================= Overlay 移除 =========================

/**
 * 暴力移除所有 fixed/sticky 高 z-index 元素（遮罩层）
 */
async function killOverlays() {
  return cdpEval(`(function(){
    var all = document.body.querySelectorAll("*");
    all.forEach(function(el){
      try{
        var s = window.getComputedStyle(el);
        if(s.position === "fixed" || s.position === "sticky"){
          el.remove();
        }
      }catch(e){}
    });
    return "OK";
  })()`);
}

/**
 * 更安全的移除方式：只移除高 z-index 遮罩（不删 dialog 本身）
 */
async function hideOverlays() {
  return cdpEval(`(function(){
    document.body.querySelectorAll("*").forEach(function(el){
      try{
        var s = window.getComputedStyle(el);
        if(s.position === "fixed" && (parseInt(s.zIndex) >= 1000 || s.zIndex === "auto")){
          el.style.display = "none";
        }
      }catch(e){}
    });
    return "OK";
  })()`);
}

/**
 * 检查发布按钮是否被遮挡
 * @returns {object|null} {same, found}
 */
async function checkPublishBtnBlocked() {
  const info = await cdpEval(`(function(){
    var b = document.querySelector("button[data-testid='publish-btn']");
    if(!b) return "NF";
    var r = b.getBoundingClientRect();
    var cx = Math.round(r.x + r.width/2);
    var cy = Math.round(r.y + r.height/2);
    var top = document.elementFromPoint(cx, cy);
    return JSON.stringify({
      same: top === b,
      found: top ? top.tagName + "." + ((top.className||"").substring(0,30)) : "null"
    });
  })()`);
  return info && info !== 'NF' ? JSON.parse(info) : null;
}

// ========================= xb 原生操作 =========================

/**
 * 执行 xb CLI 命令
 */
function xb(args, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [XB, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let out = '';
    const timer = setTimeout(() => {
      try { proc.kill(); } catch (e) {}
      reject(new Error('xb timeout: ' + args.join(' ')));
    }, timeout);
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
    proc.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * 获取当前页面 snapshot
 */
async function snapshot() {
  const r = await xb(['run', '--browser', 'chrome', 'snapshot'], 20000);
  const parsed = JSON.parse(r.out);
  if (!parsed.data || !parsed.data.result || !parsed.data.result.data) {
    throw new Error('Invalid snapshot response: ' + r.out.substring(0, 200));
  }
  return parsed.data.result.data;
}

/**
 * 打开 URL
 */
async function open(url) {
  const r = await xb(['run', '--browser', 'chrome', 'open', url], 20000);
  await sleep(3000);
  return r;
}

/**
 * 获取当前 URL
 */
async function getUrl() {
  const r = await xb(['run', '--browser', 'chrome', 'get', 'url'], 15000);
  const parsed = JSON.parse(r.out);
  return parsed.data.result.data.url;
}

// ========================= 发布流程函数 =========================

/**
 * 关闭所有引导弹窗（"我知道了"等）
 */
async function closeGuide() {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const data = await snapshot();
      const refs = data.refs || {};
      let found = false;
      for (const [ref, v] of Object.entries(refs)) {
        if (v.role === 'button' && v.name && v.name.includes('我知道了')) {
          await xb(['run', '--browser', 'chrome', 'click', ref], 15000);
          await sleep(1500);
          found = true;
          console.log('  Guide popup closed (ref=' + ref + ')');
          break;
        }
      }
      // 如果已经连上 CDP，用 CDP 再查一次 AI 弹窗
      if (await ensureCDP()) {
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
        if (ikPos && ikPos !== 'NF') {
          const ik = JSON.parse(ikPos);
          await cdpClick(ik.x, ik.y);
          await sleep(1500);
          found = true;
          console.log('  Guide popup closed via CDP');
          break;
        }
      }
      if (!found) break;
    } catch (e) {
      break;
    }
  }
}

/**
 * 填写标题（Lexical 编辑器）
 * 
 * 关键约束：
 * - 不能用 Delete（Lexical 忽略 execCommand('delete')）
 * - 只用 Ctrl+A → type（xb type 替换选区）
 * - 首次加载后标题可能有 1 个空字符残留（来自服务端草稿），不影响发布
 */
async function fillTitle(title) {
  await closeGuide();
  
  const data = await snapshot();
  const snapText = data.snapshot || '';
  
  let titleRef = null;
  let inIframe = false;
  for (const line of snapText.split('\n')) {
    if (/Iframe\s*\[ref=/.test(line)) { inIframe = true; continue; }
    if (inIframe) continue;
    if (/editable\s*\[contenteditable\]/.test(line)) {
      const m = line.match(/\[ref=(e\d+)\]/);
      if (m) { titleRef = m[1]; break; }
    }
  }
  
  if (!titleRef) throw new Error('Title editable element not found in snapshot');
  
  // Ctrl+A → type（不要 Delete！）
  await xb(['run', '--browser', 'chrome', 'press', '@' + titleRef, 'Control+a'], 15000);
  await sleep(400);
  await xb(['run', '--browser', 'chrome', 'type', '@' + titleRef, '"' + title.replace(/"/g, "'") + '"'], 20000);
  await sleep(500);
  return titleRef;
}

/**
 * 填写正文（UEditor iframe）
 */
async function fillBody(body) {
  await closeGuide();
  
  const sections = Array.isArray(body) ? body : [body];
  const html = sections.map(p => '<p>' + p.trim() + '</p>').join('');
  
  const script = `(function() {
    var iframe = document.querySelector('#ueditor_0');
    if (!iframe) return 'IFRAME_NOT_FOUND';
    var doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.body.innerHTML = ${JSON.stringify(html)};
    doc.body.dispatchEvent(new Event('input', { bubbles: true }));
    return 'OK:' + doc.body.textContent.length;
  })()`;
  
  await xb(['run', '--browser', 'chrome', 'eval', '--base64', 
    Buffer.from(script).toString('base64')], 15000);
  await sleep(500);
}

/**
 * 生成测试封面图片
 */
function generateCoverImage() {
  if (fs.existsSync(COVER_IMG) && fs.statSync(COVER_IMG).size > 1000) return;
  
  const w = 800, h = 533;
  const buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      buf[i] = Math.min(255, Math.floor(180 + x / w * 75));
      buf[i+1] = Math.min(255, Math.floor(30 + y / h * 150));
      buf[i+2] = Math.floor(20 + x / w * 60);
    }
  }
  fs.writeFileSync(COVER_IMG, buf);
  console.log('  cover.jpg created: ' + buf.length + ' bytes');
}

/**
 * 设置封面 — 通过文件上传（可靠方案）
 * 
 * 优先用 CDP DOM.setFileInputFiles 上传本地图片到封面对话框。
 * 回退到 AI 封面方案。
 */
async function setCoverViaUpload() {
  // 确保 CDP 可用
  if (!await ensureCDP()) {
    console.log('  CDP not available, fallback to AI cover');
    return await setAICover();
  }
  
  // 生成封面图
  generateCoverImage();
  
  // 滚动到封面区域
  await cdpEval('window.scrollTo(0, 700)');
  await sleep(500);
  
  // 点击"选择封面"打开弹窗
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
  
  // 通过 CDP 获取 file input 并上传
  const doc = await cdp('DOM.getDocument', {});
  if (doc && doc.result && doc.result.root) {
    const inputNode = await cdp('DOM.querySelector', {
      nodeId: doc.result.root.nodeId,
      selector: 'input[type="file"]'
    });
    if (inputNode && inputNode.result && inputNode.result.nodeId) {
      console.log('  Uploading cover via CDP...');
      await cdp('DOM.setFileInputFiles', {
        files: [COVER_IMG],
        nodeId: inputNode.result.nodeId
      });
      await sleep(3000);
      
      // 检查"确定"按钮状态
      const okInfo = JSON.parse(await cdpEval(`(function(){
        var B = document.querySelectorAll("button");
        for(var b of B){
          if(b.textContent.indexOf("确定") !== -1){
            return JSON.stringify({
              disabled: b.disabled,
              x: Math.round(b.getBoundingClientRect().x + b.getBoundingClientRect().width/2),
              y: Math.round(b.getBoundingClientRect().y + b.getBoundingClientRect().height/2)
            });
          }
        }
        return '{"disabled":true}';
      })()`));
      
      if (!okInfo.disabled) {
        await cdpClick(okInfo.x, okInfo.y);
        await sleep(3000);
        console.log('  ✅ Cover confirmed');
        return;
      }
    }
  }
  
  // 回退到 AI 封面
  console.log('  Upload fallback, trying AI cover...');
  await killOverlays();
  await sleep(500);
  return await setAICover();
}

/**
 * 设置 AI 封面（通过 xb + CDP 混合）
 * 
 * 1. 点"选择封面" -> 2. 切"AI封图"tab -> 3. 点"生成" -> 4. 等 22s -> 5. 点"确定"
 */
async function setAICover() {
  // 1. 确保 CDP 可用
  if (!await ensureCDP()) {
    console.log('  CDP not available, using xb-only mode');
    return await _setAICoverXbOnly();
  }
  
  // 2. 打开弹窗
  await cdpEval('window.scrollTo(0, 700)');
  await sleep(500);
  await killOverlays();
  await sleep(500);
  
  const coverClicked = await cdpClickBy(`(function(){
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
  if (!coverClicked) throw new Error('Cover button not found');
  await sleep(3000);
  
  // 检查 tab 并切换
  const tabs = await cdpEval(`(function(){
    var T = document.querySelectorAll("[role=tab]");
    return Array.from(T).map(function(t){return t.textContent.trim();}).join("|");
  })()`);
  console.log('  Cover dialog tabs:', tabs);
  
  if (!tabs || tabs.indexOf('AI封图') === -1) {
    console.log('  AI封图 tab not found');
    return;
  }
  
  // 用 JS click（比 CDP mouseEvent 更可靠触发 Ant Design 的 tab 切换）
  const tabResult = await cdpEval(`(function(){
    var T = document.querySelectorAll("[role=tab]");
    for(var t of T){
      if(t.textContent.indexOf("AI封图") !== -1){
        t.click();
        return "CLICKED";
      }
    }
    return "NF";
  })()`);
  console.log('  AI tab clicked:', tabResult);
  await sleep(2000);
  
  // 点"根据全文智能生成封面"
  const genClicked = await cdpClickBy(`(function(){
    var A = document.querySelectorAll("a, span, div, button");
    for(var a of A){
      if(a.textContent.indexOf("根据全文智能生成") !== -1){
        var r = a.getBoundingClientRect();
        if(r.width > 0) return JSON.stringify({x:r.x+r.width/2, y:r.y+r.height/2});
      }
    }
    return "NF";
  })()`);
  console.log('  Generate clicked:', genClicked);
  
  if (genClicked) {
    console.log('  ⏳ Waiting 22s for AI generation...');
    await sleep(22000);
    
    // 点"确定"按钮
    await killOverlays();
    await sleep(500);
    
    await cdpClickBy(`(function(){
      var B = document.querySelectorAll("button");
      for(var b of B){
        if(b.textContent.indexOf("确定") !== -1 && !b.disabled){
          var r = b.getBoundingClientRect();
          if(r.width > 0) return JSON.stringify({x:r.x+r.width/2, y:r.y+r.height/2});
        }
      }
      return "NF";
    })()`);
    await sleep(3000);
    console.log('  ✅ AI cover set');
  }
}

/** @private xb-only AI cover fallback */
async function _setAICoverXbOnly() {
  let data = await snapshot();
  const refs1 = data.refs || {};
  let coverBtn = null;
  for (const [k, v] of Object.entries(refs1)) {
    if ((v.role === 'button' || v.role === 'clickable' || v.role === 'generic') && 
        v.name && v.name.includes('选择封面')) {
      coverBtn = k; break;
    }
  }
  if (!coverBtn) {
    const snapText = data.snapshot || '';
    const m = snapText.match(/StaticText "选择封面"[\s\S]*?\[ref=(e\d+)\]/) 
              || snapText.match(/generic \[ref=(e\d+)\][^\n]*StaticText "选择封面"/);
    if (m) coverBtn = m[1];
  }
  if (!coverBtn) throw new Error('Cover button not found');
  
  await xb(['run', '--browser', 'chrome', 'click', coverBtn], 15000);
  await sleep(2500);
  
  const tabScript = `(function() {
    var tabs = document.querySelectorAll('[role=tab]');
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].textContent.indexOf('AI封图') !== -1) { tabs[i].click(); return 'OK'; }
    }
    return 'NF';
  })()`;
  await xb(['run', '--browser', 'chrome', 'eval', '--base64', 
    Buffer.from(tabScript).toString('base64')], 15000);
  await sleep(2000);
  
  data = await snapshot();
  const m = data.snapshot.match(/根据全文智能生成封面[\s\S]*?\[ref=(e\d+)\]/);
  if (m) {
    await xb(['run', '--browser', 'chrome', 'click', m[1]], 15000);
    await sleep(20000);
    
    data = await snapshot();
    const refs5 = data.refs || {};
    for (const [k, v] of Object.entries(refs5)) {
      if (v.role === 'button' && v.name && /^确定/.test(v.name) && !v.disabled) {
        await xb(['run', '--browser', 'chrome', 'click', k], 15000);
        await sleep(3000);
        console.log('  ✅ AI cover set (xb-only)');
        return;
      }
    }
  }
}

/**
 * 发布文章
 * 
 * 策略（按优先级）：
 * 1. CDP Input.dispatchMouseEvent（isTrusted=true）
 * 2. 移除遮挡层后重试
 * 3. xb click 回退
 * 
 * ⚠️ 已知限制：即便 CDP isTrusted 点击，React 表单校验仍可能静默阻止发布。
 * 执行前请确保：标题 ≤ 64 字、正文 ≥ 字数、封面已绑定、无弹窗/遮罩层。
 */
async function publish() {
  const cdpAvailable = await ensureCDP();
  
  if (cdpAvailable) {
    // 1. 清除覆盖层
    await killOverlays();
    await sleep(800);
    
    // 2. 检查并清除 error 文字校验
    const errors = await cdpEval(`(function(){
      var E = document.querySelectorAll("[class*=error]");
      return Array.from(E).map(function(e){return e.textContent.substring(0,40);}).join("|");
    })()`);
    if (errors) console.log('  Errors before publish:', errors);
    
    // 3. 检查按钮是否被遮挡
    const blocked = await checkPublishBtnBlocked();
    if (blocked && !blocked.same) {
      console.log('  Button blocked by:', blocked.found, '- removing overlays...');
      await killOverlays();
      await sleep(500);
      // 再次检查
      const blocked2 = await checkPublishBtnBlocked();
      if (blocked2 && !blocked2.same) {
        console.log('  Still blocked by:', blocked2.found);
      }
    }
    
    // 4. CDP 点击发布按钮
    const btnPos = await cdpEval(`(function(){
      var b = document.querySelector("button[data-testid='publish-btn']");
      if(!b || b.disabled) return "NF";
      var r = b.getBoundingClientRect();
      return JSON.stringify({x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2)});
    })()`);
    
    if (btnPos && btnPos !== 'NF') {
      const { x, y } = JSON.parse(btnPos);
      console.log('  CDP click publish at', x, y);
      
      // Mouse move then click
      await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await sleep(100);
      await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await sleep(100);
      await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      await sleep(6000);
      
      const url = await cdpEval('window.location.href');
      console.log('  URL:', url);
      if (url && url.indexOf('/builder/rc/clue') !== -1) {
        console.log('\n  🎉 发布成功！');
        return true;
      }
      
      // 检查发布后是否有错误或弹窗
      const errAfter = await cdpEval(`(function(){
        var E = document.querySelectorAll("[class*=error]");
        return Array.from(E).map(function(e){return e.textContent.substring(0,40);}).join("|");
      })()`);
      if (errAfter) console.log('  Errors after click:', errAfter);
      
      const dialogCount = parseInt(await cdpEval('document.querySelectorAll("[role=dialog]").length') || '0');
      if (dialogCount > 0) {
        console.log('  Dialog appeared after click. Trying to close...');
        const dlgText = await cdpEval(`(function(){
          var D = document.querySelectorAll("[role=dialog]");
          return Array.from(D).map(function(d){return d.textContent.trim().substring(0,60);}).join("||");
        })()`);
        console.log('  Dialog text:', dlgText);
        
        // 如果是"确认发布"对话框，点击确认
        await killOverlays();
        await sleep(500);
        
        // 重新点击发布
        await cdpClick(x, y);
        await sleep(6000);
        
        const url2 = await cdpEval('window.location.href');
        if (url2 && url2.indexOf('/builder/rc/clue') !== -1) {
          console.log('\n  🎉 发布成功！');
          return true;
        }
      }
    }
  }
  
  // 回退：xb click
  console.log('  CDP publish failed, trying xb click...');
  const data = await snapshot();
  const refs = data.refs || {};
  for (const [k, v] of Object.entries(refs)) {
    if (v.role === 'button' && v.name === '发布') {
      await xb(['run', '--browser', 'chrome', 'click', k], 15000);
      await sleep(5000);
      console.log('  Published via xb');
      return true;
    }
  }
  
  console.log('  ❌ 发布按钮点击无响应');
  console.log('  ⚠ 请手动在浏览器中点击"发布"按钮');
  console.log('  📍 浏览器已打开在编辑器页面');
  return false;
}

/**
 * 清理截图文件
 */
async function cleanup() {
  if (fs.existsSync(SCREENSHOT_DIR)) {
    fs.readdirSync(SCREENSHOT_DIR).forEach((f) => {
      if (f.endsWith('.png') || f.endsWith('.jpg')) {
        try { fs.unlinkSync(path.join(SCREENSHOT_DIR, f)); } catch (e) {}
      }
    });
  }
  if (fs.existsSync(WORKSPACE)) {
    fs.readdirSync(WORKSPACE).forEach((f) => {
      if (f.startsWith('screenshot-') && (f.endsWith('.png') || f.endsWith('.jpg'))) {
        try { fs.unlinkSync(path.join(WORKSPACE, f)); } catch (e) {}
      }
    });
  }
}

/**
 * 关闭 CDP 连接
 */
function closeCDP() {
  try { if (_cdpSock) _cdpSock.close(); } catch (e) {}
}

module.exports = {
  xb, sleep, snapshot,
  open, getUrl,
  ensureCDP, cdp, cdpEval, cdpClick, cdpClickBy, closeCDP,
  killOverlays, hideOverlays, checkPublishBtnBlocked,
  closeGuide,
  fillTitle, fillBody,
  setCoverViaUpload, setAICover,
  publish, cleanup,
  generateCoverImage,
};
