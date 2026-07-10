// publish.js — 百家号一键发布 v7（标题+正文+AI封面+发布，已 E2E 验证）
// 依赖: ./cdp_lib.js（CDP WebSocket 库）；xb CLI（C:\Users\菠萝\.qclaw\skills\xbrowser\scripts\xb.cjs）
// 用法:
//   1. 首次: cd C:\Users\菠萝\.qclaw\workspace-agent-3af8d089 && npm install ws
//   2. 改下方 CONFIG（title / bodyHtml / coverMode）
//   3. 浏览器已打开且 CDP 端口 9222 可用（xb 启动的 Chrome 自带）
//   4. node skills/baijiahao-publisher/scripts/publish.js

const cp = require('child_process').execFileSync;
const fs = require('fs');
const path = require('path');
const cdpLib = require('./cdp_lib.js');

const HOME = process.env.USERPROFILE;
const XB = path.join(HOME, '.qclaw', 'skills', 'xbrowser', 'scripts', 'xb.cjs');
const SAVE = path.join(HOME, '.qclaw', 'workspace-agent-3af8d089') + '\\';
const COVER_JPG = path.join(HOME, '.qclaw', 'workspace-agent-3af8d089', 'cover.jpg');
const EDIT_URL = 'https://baijiahao.baidu.com/builder/rc/edit?type=news';

// ===================== 配置区（每次发布改这里） =====================
const CONFIG = {
  title: '京东外卖强势入局',          // 标题 ≤64 字
  // 正文：HTML 字符串，每段用 <p> 包裹
  bodyHtml: [
    '<p>京东外卖的强势入局，正在重塑中国即时零售行业的竞争格局。</p>',
    '<p>依托京东成熟的供应链与仓配体系，京东外卖以“品质外卖”切入，直击用户对食品安全与配送时效的核心诉求。</p>',
  ].join(''),
  coverMode: 'ai',                    // 'ai'（AI生成）| 'upload'（本地图）| 'skip'（跳过）
  cdpPort: 9222,                       // CDP 端口（xb 启动的 Chrome 默认 9222）
};
// ====================================================================

function b64(js) { return Buffer.from(js).toString('base64'); }

function xbEval(js) {
  try {
    const r = cp('node', [XB, 'run', '--browser', 'chrome', 'eval', '--base64', b64(js)], { encoding: 'utf8', timeout: 20000 });
    try { const o = JSON.parse(r); return o.data?.result?.data?.result || 'NF'; }
    catch (e) { return (r || 'NF').toString().substring(0, 200); }
  } catch (e) { return 'EX:' + e.message.substring(0, 60); }
}

function xbSnap() {
  try {
    const r = cp('node', [XB, 'run', '--browser', 'chrome', 'snapshot', '-i'], { encoding: 'utf8', timeout: 20000 });
    const o = JSON.parse(r); return o.data?.result?.data?.snapshot || '';
  } catch (e) { return ''; }
}

function xbOpen(url) {
  try { cp('node', [XB, 'run', '--browser', 'chrome', 'open', url], { encoding: 'utf8', timeout: 20000 }); } catch (e) {}
}

function scr(n) { try { cp('node', [XB, 'run', '--browser', 'chrome', 'screenshot', SAVE + 'pub_' + n + '.png'], { encoding: 'utf8', timeout: 15000 }); } catch (e) {} }

function log(m) { console.log('[' + new Date().toLocaleTimeString() + '] ' + m); }
function sl(ms) { return new Promise(r => setTimeout(r, ms)); }

async function cdpClickXY(sock, x, y) {
  await cdpLib.cdp(sock, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 0 });
  await cdpLib.cdp(sock, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await cdpLib.cdp(sock, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
}

// 关闭“我知道了”引导弹窗（若有）
async function closeGuide(sock) {
  const done = await cdpLib.cdpEval(sock, "(function(){var b=Array.from(document.querySelectorAll('button'));for(var i=0;i<b.length;i++){if(b[i].textContent.trim().indexOf('我知道了')!==-1&&b[i].offsetWidth>0){b[i].click();return 'CLOSED';}}return 'NONE';})()");
  if (done === 'CLOSED') { log('已关闭引导弹窗'); await sl(800); }
}

// 填标题（CDP 坐标点标题框 → Ctrl+A → Input.insertText）
async function fillTitle(sock) {
  await cdpLib.cdpEval(sock, 'window.scrollTo(0,0)'); await sl(500);
  const tpos = await cdpLib.cdpEval(sock, "(function(){var e=document.querySelector('[data-testid=news-title-input]')||document.querySelector('.title-input__inner')||document.querySelector('.input-box');if(!e)return 'NO_EL';var r=e.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});})()");
  if (tpos === 'NO_EL') { log('❌ 找不到标题输入框'); return false; }
  const tp = JSON.parse(tpos);
  await cdpClickXY(sock, tp.x, tp.y); await sl(400);
  await cdpLib.cdp(sock, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Control', code: 'ControlLeft', modifiers: 2 });
  await cdpLib.cdp(sock, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'a', code: 'KeyA', modifiers: 2 });
  await cdpLib.cdp(sock, 'Input.dispatchKeyEvent', { type: 'rawKeyUp', key: 'a', code: 'KeyA', modifiers: 2 });
  await cdpLib.cdp(sock, 'Input.dispatchKeyEvent', { type: 'rawKeyUp', key: 'Control', code: 'ControlLeft', modifiers: 0 });
  await sl(300);
  await cdpLib.cdpInsertText(sock, CONFIG.title);
  await sl(800);
  const tnow = await cdpLib.cdpEval(sock, "(function(){var e=document.querySelector('[data-testid=news-title-input]')||document.querySelector('.title-input__inner')||document.querySelector('.input-box');return e?(e.innerText||'').substring(0,30):'NO_EL';})()");
  log('标题已填: ' + tnow + '（' + CONFIG.title.length + '字）');
  return true;
}

// 填正文（UEditor setContent，经 xb eval）
function fillBody() {
  const js = "(function(){if(typeof editor!=='undefined'&&editor.setContent){editor.setContent(" + JSON.stringify(CONFIG.bodyHtml) + ");return 'OK:'+editor.getContent().length;}return 'NO_EDITOR';})()";
  const r = xbEval(js);
  log('正文: ' + r);
  return r.indexOf('OK') === 0;
}

// 封面-AI生成（cheetah 自研组件）
async function setCoverAI(sock) {
  await cdpLib.cdpEval(sock, 'window.scrollTo(0,0)'); await sl(400);
  await cdpLib.cdpEval(sock, 'window.scrollTo(0,1200)'); await sl(2200);
  await cdpClickXY(sock, 612, 561); await sl(3000); // 点“选择封面”占位
  let snap = xbSnap();
  if (snap.indexOf('本地上传') === -1 && snap.indexOf('AI封图') === -1) { log('⚠️ 封面弹窗未打开'); return false; }
  // 隐藏蓝色提示条
  await cdpLib.cdpEval(sock, "(function(){var n=Array.from(document.querySelectorAll('*'));for(var i=0;i<n.length;i++){var e=n[i];if(e.children.length===0&&e.textContent.indexOf('标题功能已合并至文字模板')!==-1){var bar=e.closest('[class*=notice],[class*=tip],[class*=alert],[class*=bar],[class*=banner]')||e.parentElement;if(bar){bar.style.display='none';return 'HIDDEN';}}}return 'NF';})()");
  await sl(700);
  // 切 AI封图 tab
  const tabPos = await cdpLib.cdpEval(sock, "(function(){var t=document.querySelectorAll('[role=tab]');for(var i=0;i<t.length;i++){if(t[i].textContent.indexOf('AI封图')!==-1){var r=t[i].getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});}}return 'NF';})()");
  if (tabPos && tabPos !== 'NF') { const p = JSON.parse(tabPos); await cdpClickXY(sock, p.x, p.y); await sl(2200); }
  // 填提示词
  await cdpClickXY(sock, 853, 228); await sl(600);
  await cdpLib.cdpInsertText(sock, '根据全文智能生成一张新闻风格封面');
  await sl(1000);
  // 点生成按钮（DIV，非 button）
  await cdpClickXY(sock, 1153, 274);
  log('已点生成，轮询...');
  let ok = false;
  for (let i = 0; i < 24; i++) {
    await sl(5000);
    const d = xbEval("(function(){var b=document.querySelectorAll('button');for(var i=0;i<b.length;i++){if(b[i].textContent.trim().indexOf('确定')!==-1)return b[i].disabled?'DISABLED':'ENABLED';}return 'NF';})()");
    if (i % 3 === 0 || d === 'ENABLED') log('  [' + ((i + 1) * 5) + 's] 确定: ' + d);
    if (d === 'ENABLED') { ok = true; break; }
  }
  if (!ok) { log('⚠️ AI生成未果，转本地上传'); return setCoverUpload(sock); }
  await cdpClickXY(sock, 1384, 752); await sl(3000); // 点“确定 (1)”
  scr('cover_ok');
  log('✅ AI封面已设置');
  return true;
}

// 封面-本地上传（兜底）
async function setCoverUpload(sock) {
  const tabPos = await cdpLib.cdpEval(sock, "(function(){var t=document.querySelectorAll('[role=tab]');for(var i=0;i<t.length;i++){if(t[i].textContent.indexOf('本地上传')!==-1){var r=t[i].getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});}}return 'NF';})()");
  if (tabPos && tabPos !== 'NF') { const p = JSON.parse(tabPos); await cdpClickXY(sock, p.x, p.y); await sl(1500); }
  if (!fs.existsSync(COVER_JPG)) { log('⚠️ 本地封面不存在: ' + COVER_JPG + '，跳过'); return false; }
  const r = await cdpLib.setFileInputFiles(sock, COVER_JPG);
  log('文件注入: ' + r);
  await sl(3000);
  const d = xbEval("(function(){var b=document.querySelectorAll('button');for(var i=0;i<b.length;i++){if(b[i].textContent.trim().indexOf('确定')!==-1)return b[i].disabled?'DISABLED':'ENABLED';}return 'NF';})()");
  if (d === 'ENABLED') { await cdpClickXY(sock, 1384, 752); await sl(3000); log('✅ 本地封面已设置'); return true; }
  log('⚠️ 本地上传未生效'); return false;
}

// 发布（原生 button.click 触发 React 冒泡）—— 坐标点击会被内部 span 拦截
async function publish(sock) {
  const r = await cdpLib.cdpEval(sock, "(function(){var b=Array.from(document.querySelectorAll('button'));for(var i=0;i<b.length;i++){if(b[i].textContent.trim()==='发布'&&b[i].offsetWidth>0){b[i].click();return 'CLICKED';}}return 'NF';})()");
  log('触发发布: ' + r);
  await sl(3500);
  scr('after_pub');
  const body = xbEval('document.body.innerText');
  if (body.indexOf('确认发布') !== -1 || body.indexOf('原创声明') !== -1) {
    scr('dialog');
    await cdpLib.cdpEval(sock, "(function(){var b=Array.from(document.querySelectorAll('button'));for(var i=0;i<b.length;i++){if((b[i].textContent.trim().indexOf('确认发布')!==-1||b[i].textContent.trim()==='确定')&&b[i].offsetWidth>0){b[i].click();return 'CLICKED';}}return 'NF';})()");
    await sl(3000); scr('after_confirm');
  }
  for (let i = 0; i < 12; i++) {
    await sl(3000);
    const url = await cdpLib.cdpEval(sock, 'location.href');
    const snap = xbSnap();
    const ok = snap.indexOf('发布成功') !== -1 || snap.indexOf('审核中') !== -1 || snap.indexOf('已发布') !== -1 || snap.indexOf('已提交') !== -1 || url.indexOf('manage') !== -1 || url.indexOf('success') !== -1 || url.indexOf('articleId') !== -1;
    log('  [' + ((i + 1) * 3) + 's] url=' + url.substring(0, 55) + ' ok=' + ok);
    if (ok) return true;
    if (i === 4) scr('poll_mid');
  }
  return false;
}

async function main() {
  log('=== 百家号一键发布 v7 ===');
  const sock = await cdpLib.cdpConnect(CONFIG.cdpPort);
  if (!sock) { log('❌ CDP 连接失败（端口 ' + CONFIG.cdpPort + '）。确认 xb 已启动 Chrome 且端口可用。'); return; }

  // 确保在编辑页
  let url = await cdpLib.cdpEval(sock, 'location.href');
  if (url.indexOf('builder/rc/edit') === -1) { log('打开编辑页...'); xbOpen(EDIT_URL + '&t=' + Date.now()); await sl(8000); }
  // 等编辑器 ready
  for (let i = 0; i < 40; i++) {
    const v = xbEval("(function(){return (typeof editor!=='undefined'&&editor.setContent)?'READY':'WAIT';})()");
    if (v === 'READY') break; await sl(1500);
  }
  await closeGuide(sock);
  await fillTitle(sock);
  fillBody();
  if (CONFIG.coverMode !== 'skip') {
    if (CONFIG.coverMode === 'ai') await setCoverAI(sock);
    else await setCoverUpload(sock);
  }
  const ok = await publish(sock);
  scr('final');
  log(ok ? '✅ 文章已发布/提交' : '⚠️ 未检测到成功信号，需人工确认');
  sock.close();
}

main().catch(e => log('FATAL: ' + e.message));
