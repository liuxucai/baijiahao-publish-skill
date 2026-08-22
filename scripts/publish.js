// publish.js — 百家号一键发布（最终修正版 v3, 2026-08-21）
// 自包含：仅依赖 ./cdp_lib.js + node_modules/ws，不再依赖 xbrowser。
// 浏览器由 isolated-browser skill 拉起（node skills/isolated-browser/scripts/launch.js），CDP 直连 9222。
// 所有点击用 CDP 真实鼠标坐标（Input.dispatchMouseEvent），坐标动态取 getBoundingClientRect 中心，禁硬编码。
//
// ⚠️ 封面占位真实可点元素是“选择封面”文字所在的内层 ~198×134 卡片（取 width 最小者），
//    不是向上找的 -default 外层(612×134 容器)。详见 COVER_FINDER 注释。
// ⚠️ 发布按钮必须用 CDP 真实鼠标坐标点击；in-page button.click() 对 cheetah 不提交。
const fs = require('fs');
const path = require('path');
const cdpLib = require('./cdp_lib.js');

const HOME = process.env.USERPROFILE;
const SAVE = path.join(HOME, '.qclaw', 'baijiahao_skill') + '\\';
const COVER_JPG = path.join(HOME, '.qclaw', 'baijiahao_skill', 'cover.jpg');
const EDIT_URL = 'https://baijiahao.baidu.com/builder/rc/edit?type=news';

// ===================== 配置区（每次发布改这里） =====================
const CONFIG = {
  title: '文言文之用',                // 标题 ≤64 字
  // 正文：HTML 字符串，每段用 <p> 包裹
  bodyHtml: [
    '<p>文言文者，华夏千古之雅言也。自先秦诸子以降，经史子集，皆赖此以传。</p>',
  ].join(''),
  coverMode: 'ai',                    // 'ai'（AI生成）| 'upload'（本地图）| 'skip'（跳过）
  cdpPort: process.env.ISOB_CDP_PORT || 9222,   // CDP 端口（isolated-browser 拉起的隔离 Chrome 默认 9222）
};
// ====================================================================

function log(m) { console.log('[' + new Date().toLocaleTimeString() + '] ' + m); }
function sl(ms) { return new Promise(r => setTimeout(r, ms)); }
function scr(sock, n) { return cdpLib.cdpShot(sock, SAVE + 'pub_' + n + '.png').catch(function () {}); }

// 封面占位：精确匹配“选择封面”，筛选 width 在 100~400 的元素，取最窄者（内层 ~198px 真实可点卡片）
const COVER_FINDER = "(function(){var els=Array.from(document.querySelectorAll('*'));var c=els.filter(function(e){return (e.textContent||'').trim()==='选择封面'&&e.getBoundingClientRect().width>100&&e.getBoundingClientRect().width<400;});if(!c.length)return null;c.sort(function(a,b){return a.getBoundingClientRect().width-b.getBoundingClientRect().width;});return c[0];})()";
// 封面弹窗：含 AI封图/本地上传 的 dialog
const COVER_MODAL = "Array.from(document.querySelectorAll('[role=dialog]')).find(function(d){return d.innerText.indexOf('AI封图')!==-1||d.innerText.indexOf('本地上传')!==-1;})";

async function getRect(sock, finderExpr) {
  const expr = "(function(){try{var e=(" + finderExpr + ");if(!e||e.offsetWidth===0)return 'NF';e.scrollIntoView({block:'center'});var r=e.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});}catch(ex){return 'ERR:'+ex.message;}})()";
  const rc = await cdpLib.cdpEval(sock, expr);
  if (typeof rc === 'string' && rc.indexOf('{') === 0) return JSON.parse(rc);
  return null;
}
async function clickEl(sock, finderExpr) {
  const p = await getRect(sock, finderExpr);
  if (!p) return false;
  await cdpLib.cdpClickXY(sock, p.x, p.y);
  await sl(900);
  return true;
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
  await cdpLib.cdpClickXY(sock, tp.x, tp.y); await sl(400);
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

// 填正文（UEditor setContent，经 CDP eval）
async function fillBody(sock) {
  const js = "(function(){if(typeof editor!=='undefined'&&editor.setContent){editor.setContent(" + JSON.stringify(CONFIG.bodyHtml) + ");return 'OK:'+editor.getContent().length;}return 'NO_EDITOR';})()";
  const r = await cdpLib.cdpEval(sock, js);
  log('正文: ' + r);
  return typeof r === 'string' && r.indexOf('OK') === 0;
}

// 封面-AI生成（cheetah 自研组件，真实鼠标点击）
async function setCoverAI(sock) {
  await cdpLib.cdpEval(sock, 'window.scrollTo(0,0)'); await sl(400);
  await cdpLib.cdpEval(sock, 'window.scrollTo(0,1200)'); await sl(2200);
  if (!await clickEl(sock, COVER_FINDER)) { log('⚠️ 未找到封面占位'); return false; }
  let snap = await cdpLib.cdpEval(sock, 'document.body.innerText');
  if (snap.indexOf('本地上传') === -1 && snap.indexOf('AI封图') === -1) { log('⚠️ 封面弹窗未打开'); return false; }
  log('封面弹窗已打开');
  // 隐藏蓝色提示条
  await cdpLib.cdpEval(sock, "(function(){var n=Array.from(document.querySelectorAll('*'));for(var i=0;i<n.length;i++){var e=n[i];if(e.children.length===0&&e.textContent.indexOf('标题功能已合并至文字模板')!==-1){var bar=e.closest('[class*=notice],[class*=tip],[class*=alert],[class*=bar],[class*=banner]')||e.parentElement;if(bar){bar.style.display='none';return 'HIDDEN';}}}return 'NF';})()");
  await sl(700);
  // 切 AI封图 tab
  await clickEl(sock, inCtx(COVER_MODAL, '[role=tab]', 'AI封图', false));
  await sl(2200);
  // 触发 AI 生成：SPAN“根据全文智能生成封面”
  if (!await clickEl(sock, inCtx(COVER_MODAL, 'span', '根据全文智能生成封面', false))) {
    await clickEl(sock, inCtx(COVER_MODAL, 'button', '智能生成', false));
  }
  log('已触发 AI 生成，轮询...');
  let ok = false;
  for (let i = 0; i < 30; i++) {
    await sl(5000);
    const d = await cdpLib.cdpEval(sock, "(function(){var c=(" + COVER_MODAL + ");if(!c)return 'NOMODAL';var b=Array.from(c.querySelectorAll('button'));for(var i=0;i<b.length;i++){if(b[i].textContent.trim().indexOf('确定')!==-1)return b[i].disabled?'DISABLED':'ENABLED';}return 'NF';})()");
    if (i % 3 === 0 || d === 'ENABLED') log('  [' + ((i + 1) * 5) + 's] 确定: ' + d);
    if (d === 'ENABLED') { ok = true; break; }
  }
  if (!ok) { log('⚠️ AI生成未果，转本地上传'); return setCoverUpload(sock); }
  await clickEl(sock, inCtx(COVER_MODAL, 'button', '确定', false));
  await sl(3000);
  await scr(sock, 'cover_ok');
  log('✅ AI封面已设置');
  return true;
}

// 封面-本地上传（兜底）
async function setCoverUpload(sock) {
  // 切到本地上传 tab
  await clickEl(sock, inCtx(COVER_MODAL, '[role=tab]', '本地上传', false));
  await sl(1500);
  if (!fs.existsSync(COVER_JPG)) { log('⚠️ 本地封面不存在: ' + COVER_JPG + '，跳过'); return false; }
  const r = await cdpLib.setFileInputFiles(sock, COVER_JPG);
  log('文件注入: ' + r);
  await sl(3000);
  const d = await cdpLib.cdpEval(sock, "(function(){var c=(" + COVER_MODAL + ");if(!c)return 'NOMODAL';var b=Array.from(c.querySelectorAll('button'));for(var i=0;i<b.length;i++){if(b[i].textContent.trim().indexOf('使用')!==-1||b[i].textContent.trim().indexOf('确定')!==-1)return b[i].disabled?'DISABLED':'ENABLED';}return 'NF';})()");
  if (d === 'ENABLED') { await clickEl(sock, inCtx(COVER_MODAL, 'button', '确定', false)); await sl(3000); log('✅ 本地封面已设置'); return true; }
  log('⚠️ 本地上传未生效'); return false;
}

// 发布（CDP 真实鼠标坐标点击，禁 in-page button.click）
async function publish(sock) {
  if (!await clickEl(sock, "(function(){var b=Array.from(document.querySelectorAll('button'));for(var i=0;i<b.length;i++){if(b[i].textContent.trim()==='发布'&&b[i].offsetWidth>0)return b[i];}return null;})()")) {
    log('未找到发布按钮'); return false;
  }
  log('已触发发布');
  await sl(3500);
  await scr(sock, 'after_pub');
  const body = await cdpLib.cdpEval(sock, 'document.body.innerText');
  if (body && (body.indexOf('确认发布') !== -1 || body.indexOf('原创声明') !== -1)) {
    await scr(sock, 'dialog');
    await clickEl(sock, "(function(){var b=Array.from(document.querySelectorAll('button'));for(var i=0;i<b.length;i++){var t=b[i].textContent.trim();if((t.indexOf('确认发布')!==-1||t==='确定')&&b[i].offsetWidth>0)return b[i];}return null;})()");
    await sl(3000); await scr(sock, 'after_confirm');
  }
  for (let i = 0; i < 12; i++) {
    await sl(3000);
    const url = await cdpLib.cdpEval(sock, 'location.href');
    const s = await cdpLib.cdpEval(sock, 'document.body.innerText');
    const ok = s && (s.indexOf('发布成功') !== -1 || s.indexOf('审核中') !== -1 || s.indexOf('已发布') !== -1 || s.indexOf('已提交') !== -1 || url.indexOf('manage') !== -1 || url.indexOf('success') !== -1 || url.indexOf('articleId') !== -1);
    log('  [' + ((i + 1) * 3) + 's] url=' + url.substring(0, 55) + ' ok=' + ok);
    if (ok) return true;
  }
  return false;
}

async function main() {
  log('=== 百家号一键发布 ===');
  const sock = await cdpLib.cdpConnect(CONFIG.cdpPort);
  if (!sock) { log('❌ CDP 连接失败（端口 ' + CONFIG.cdpPort + '）。确认 isolated-browser 已拉起隔离 Chrome 且端口可用。'); return; }

  // 确保在编辑页
  let url = await cdpLib.cdpEval(sock, 'location.href');
  if (url.indexOf('builder/rc/edit') === -1) { log('打开编辑页...'); await cdpLib.cdp(sock, 'Page.navigate', { url: EDIT_URL + '&t=' + Date.now() }); await sl(9000); }
  // 等编辑器 ready
  for (let i = 0; i < 40; i++) {
    const v = await cdpLib.cdpEval(sock, "(function(){return (typeof editor!=='undefined'&&editor.setContent)?'READY':'WAIT';})()");
    if (v === 'READY') break; await sl(1500);
  }
  await closeGuide(sock);
  await fillTitle(sock);
  await fillBody(sock);
  if (CONFIG.coverMode !== 'skip') {
    if (CONFIG.coverMode === 'ai') await setCoverAI(sock);
    else await setCoverUpload(sock);
  }
  const ok = await publish(sock);
  await scr(sock, 'final');
  log(ok ? '✅ 文章已发布/提交' : '⚠️ 未检测到成功信号，需人工确认');
  sock.close();
}

main().catch(e => log('FATAL: ' + e.message));
