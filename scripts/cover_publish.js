// cover_publish.js - 补封面 + 发布（最终修正版 v2）
// 草稿已填标题/正文，仅补封面。真实鼠标坐标点击，全部动态取 rect，不依赖百家号运行时 class hash。
const cp = require('child_process');
const path = require('path');
const cdpLib = require('./cdp_lib.js');

const HOME = process.env.USERPROFILE;
const XB = path.join(HOME, '.qclaw', 'skills', 'xbrowser', 'scripts', 'xb.cjs');
const SAVE = path.join(HOME, '.qclaw', 'workspace-agent-d0d04e07') + '\\';
const CDP_PORT = 9222;
const EDIT_URL = 'https://baijiahao.baidu.com/builder/rc/edit?type=news';

function b64(js) { return Buffer.from(js).toString('base64'); }
function xbEval(js) {
  try {
    const r = cp.execFileSync('node', [XB, 'run', '--browser', 'chrome', 'eval', '--base64', b64(js)], { encoding: 'utf8', timeout: 20000 });
    try { const o = JSON.parse(r); return o.data && o.data.result && o.data.result.data && o.data.result.data.result; }
    catch (e) { return (r || 'NF').toString().substring(0, 200); }
  } catch (e) { return 'EX:' + e.message.substring(0, 60); }
}
function scr(n) { try { cp.execFileSync('node', [XB, 'run', '--browser', 'chrome', 'screenshot', SAVE + 'cp_' + n + '.png'], { encoding: 'utf8', timeout: 15000 }); } catch (e) {} }
function log(m) { console.log('[' + new Date().toLocaleTimeString() + '] ' + m); }
function sl(ms) { return new Promise(r => setTimeout(r, ms)); }

// 封面占位：文本"选择封面" -> 向上找 -default 祖先（动态，不依赖 hash）
const COVER_FINDER = "(function(){var els=Array.from(document.querySelectorAll('*'));var t=els.find(function(e){return e.textContent.trim()==='选择封面';});if(!t)return null;var p=t;while(p&&!(p.className&&p.className.toString().indexOf('-default')!==-1)){p=p.parentElement;}return p||t;})()";
// 封面弹窗：含 AI封图/本地上传 的 dialog
const COVER_MODAL = "Array.from(document.querySelectorAll('[role=dialog]')).find(function(d){return d.innerText.indexOf('AI封图')!==-1||d.innerText.indexOf('本地上传')!==-1;})";

// 全局文本匹配 finder
function byText(tag, txt, exact) {
  const pred = exact ? "e.textContent.trim()==='" + txt + "'" : "e.textContent.indexOf('" + txt + "')!==-1";
  return "Array.from(document.querySelectorAll('" + tag + "')).find(function(e){return " + pred + "&&e.offsetWidth>0;})";
}
// 限定在 ctx 上下文内的文本匹配 finder
function inCtx(ctxExpr, tag, txt, exact) {
  const pred = exact ? "e.textContent.trim()==='" + txt + "'" : "e.textContent.indexOf('" + txt + "')!==-1";
  return "(function(){var c=(" + ctxExpr + ");if(!c)return null;return Array.from(c.querySelectorAll('" + tag + "')).find(function(e){return " + pred + "&&e.offsetWidth>0;});})()";
}

// 在页面内 scrollIntoView + 取中心坐标，返回 {x,y} 或 null
async function getRect(sock, finderExpr) {
  const expr = "(function(){try{var e=(" + finderExpr + ");if(!e||e.offsetWidth===0)return 'NF';e.scrollIntoView({block:'center'});var r=e.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});}catch(ex){return 'ERR:'+ex.message;}})()";
  const rc = await cdpLib.cdpEval(sock, expr);
  if (typeof rc === 'string' && rc.indexOf('{') === 0) return JSON.parse(rc);
  log('  getRect 未命中: ' + rc);
  return null;
}
async function clickEl(sock, finderExpr) {
  const p = await getRect(sock, finderExpr);
  if (!p) return false;
  await cdpLib.cdpClickXY(sock, p.x, p.y);
  await sl(900);
  return true;
}

async function main() {
  log('=== 补封面 + 发布 ===');
  const sock = await cdpLib.cdpConnect(CDP_PORT);
  if (!sock) { log('CDP 连接失败'); return; }

  // 关掉可能误开的小对话框 / 手机预览遮罩
  await cdpLib.cdp(sock, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', modifiers: 0 });
  await cdpLib.cdp(sock, 'Input.dispatchKeyEvent', { type: 'rawKeyUp', key: 'Escape', code: 'Escape', modifiers: 0 });
  await sl(800);
  if (await clickEl(sock, byText('button', '返回编辑', true))) { log('已关闭手机预览遮罩'); await sl(1200); }

  let url = await cdpLib.cdpEval(sock, 'location.href');
  if (url.indexOf('builder/rc/edit') === -1) { log('打开编辑页...'); cp.execFileSync('node', [XB, 'run', '--browser', 'chrome', 'open', EDIT_URL]); await sl(8000); }
  await cdpLib.cdpEval(sock, 'window.scrollTo(0,0)'); await sl(600);

  // 1) 开封面弹窗
  log('点开封面弹窗...');
  if (!await clickEl(sock, COVER_FINDER)) { log('未找到封面占位，中止'); return; }
  await sl(2500);
  const dlg = xbEval("(function(){var ds=Array.from(document.querySelectorAll('[role=dialog]'));var c=ds.find(function(d){return d.innerText.indexOf('AI封图')!==-1||d.innerText.indexOf('本地上传')!==-1;});return c?'COVER_DLG':'OTHER:'+ds.map(function(d){return d.innerText.replace(/\\s+/g,' ').substring(0,18);}).join('|');})()");
  log('弹窗状态: ' + dlg);
  if (dlg !== 'COVER_DLG') { log('封面弹窗未正确打开，中止'); return; }
  log('封面弹窗已打开');

  // 隐藏蓝色提示条（可能遮挡）
  await cdpLib.cdpEval(sock, "(function(){var n=Array.from(document.querySelectorAll('*'));for(var i=0;i<n.length;i++){var e=n[i];if(e.children.length===0&&e.textContent.indexOf('标题功能已合并至文字模板')!==-1){var bar=e.closest('[class*=notice],[class*=tip],[class*=alert],[class*=bar],[class*=banner]')||e.parentElement;if(bar){bar.style.display='none';return 'HIDDEN';}}}return 'NF';})()");
  await sl(600);

  // 2) 切 AI封图 tab
  log('切 AI封图 tab...');
  if (!await clickEl(sock, inCtx(COVER_MODAL, '[role=tab]', 'AI封图', false))) {
    // 默认可能已在 AI封图，或 tab 文本不同，尝试直接找生成按钮
    log('AI封图 tab 未命中（可能默认即 AI 封面）');
  }
  await sl(2200);

  // 3) 触发 AI 生成
  log('触发 AI 生成...');
  if (!await clickEl(sock, inCtx(COVER_MODAL, 'span', '根据全文智能生成封面', false))) {
    log('未找到生成按钮，尝试其他文案...');
    await clickEl(sock, inCtx(COVER_MODAL, 'button', '智能生成', false));
  }
  log('已触发，轮询确定按钮...');

  let ok = false;
  for (let i = 0; i < 30; i++) {
    await sl(4000);
    const d = xbEval("(function(){var c=(" + COVER_MODAL + ");if(!c)return 'NOMODAL';var b=Array.from(c.querySelectorAll('button'));for(var i=0;i<b.length;i++){if(b[i].textContent.indexOf('确定')!==-1)return b[i].disabled?'DISABLED':'ENABLED';}return 'NF';})()");
    if (i % 3 === 0 || d === 'ENABLED') log('  [' + ((i + 1) * 4) + 's] 确定: ' + d);
    if (d === 'ENABLED') { ok = true; break; }
  }
  if (!ok) { log('AI 生成未就绪，中止'); return; }

  // 4) 点确定
  log('点确定...');
  await clickEl(sock, inCtx(COVER_MODAL, 'button', '确定', false));
  await sl(3000);
  scr('cover_ok');
  log('封面已设置');

  // 5) 发布（编辑器上的发布按钮，全局）
  log('点发布...');
  if (!await clickEl(sock, byText('button', '发布', true))) { log('未找到发布按钮'); return; }
  await sl(3500);
  scr('after_pub');

  const body = xbEval('document.body.innerText');
  if (body && (body.indexOf('确认发布') !== -1 || body.indexOf('原创声明') !== -1)) {
    scr('dialog');
    await clickEl(sock, byText('button', '确认发布', false));
    await sl(3000); scr('after_confirm');
  }
  for (let i = 0; i < 12; i++) {
    await sl(3000);
    const u = await cdpLib.cdpEval(sock, 'location.href');
    const s = xbEval('document.body.innerText');
    const done = (s && (s.indexOf('发布成功') !== -1 || s.indexOf('审核中') !== -1 || s.indexOf('已发布') !== -1 || s.indexOf('已提交') !== -1)) || u.indexOf('manage') !== -1 || u.indexOf('success') !== -1 || u.indexOf('articleId') !== -1;
    log('  [' + ((i + 1) * 3) + 's] url=' + u.substring(0, 55) + ' ok=' + done);
    if (done) { scr('final'); log('文章已发布/提交'); sock.close(); return; }
  }
  scr('final');
  log('未检测到成功信号，需人工确认');
  sock.close();
}
main().catch(e => log('FATAL: ' + e.message));
