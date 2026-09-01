// cover_publish.js - 补封面 + 发布（最终修正版 v3, 2026-08-21）
// 草稿已填标题/正文，仅补封面。自包含：仅依赖 ./cdp_lib.js + node_modules/ws，不再依赖 xbrowser。
// 所有点击用 CDP 真实鼠标坐标（Input.dispatchMouseEvent），坐标动态取 getBoundingClientRect 中心。
//
// ⚠️ 核心修正（2026-08-21 实测）：封面占位真实可点元素不是“选择封面”文字向上找的 -default 外层(612×134 容器)，
//   而是该文字所在的【内层 ~198×134 卡片】本身。querySelectorAll('*') 的遍历顺序是外层先于内层，
//   若用“向上找 -default 祖先”会停在 612px 非可点容器，导致点不中。正确 finder：
//   精确匹配 textContent==='选择封面' 且 width 在 100~400 之间的元素，取 width 最小者（即最内层卡片）。
const cdpLib = require('./cdp_lib.js');
const path = require('path');
const fs = require('fs');

const HOME = process.env.USERPROFILE;
const SAVE = path.join(HOME, '.qclaw', 'baijiahao_skill') + '\\';
const CDP_PORT = process.env.ISOB_CDP_PORT || 9222;
const EDIT_URL = 'https://baijiahao.baidu.com/builder/rc/edit?type=news';

function log(m) { console.log('[' + new Date().toLocaleTimeString() + '] ' + m); }
function sl(ms) { return new Promise(r => setTimeout(r, ms)); }
function scr(sock, n) { return cdpLib.cdpShot(sock, SAVE + 'cp_' + n + '.png').catch(function () {}); }

// 封面占位：精确匹配“选择封面”，筛选 width 在 100~400 的元素，取最窄者（内层 ~198px 真实可点卡片）
//   千万别用“向上找 -default 祖先”——会把外层 612px 非可点容器误当目标。
const COVER_FINDER = "(function(){var els=Array.from(document.querySelectorAll('*'));var c=els.filter(function(e){return (e.textContent||'').trim()==='选择封面'&&e.getBoundingClientRect().width>100&&e.getBoundingClientRect().width<400;});if(!c.length)return null;c.sort(function(a,b){return a.getBoundingClientRect().width-b.getBoundingClientRect().width;});return c[0];})()";
// 封面弹窗：含 AI封图/本地上传 的 dialog（编辑页常驻 3 个无关 dialog，必须靠文本区分）
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
  if (url.indexOf('builder/rc/edit') === -1) { log('打开编辑页...'); await cdpLib.cdp(sock, 'Page.navigate', { url: EDIT_URL + '&t=' + Date.now() }); await sl(9000); }
  await cdpLib.cdpEval(sock, 'window.scrollTo(0,0)'); await sl(600);

  // 1) 开封面弹窗：真实鼠标点“选择封面”内层卡片
  log('点开封面弹窗...');
  if (!await clickEl(sock, COVER_FINDER)) { log('未找到封面占位，中止'); return; }
  await sl(2500);
  const dlg = await cdpLib.cdpEval(sock, "(function(){var ds=Array.from(document.querySelectorAll('[role=dialog]'));var c=ds.find(function(d){return d.innerText.indexOf('AI封图')!==-1||d.innerText.indexOf('本地上传')!==-1;});return c?'COVER_DLG':'OTHER:'+ds.map(function(d){return d.innerText.replace(/\\s+/g,' ').substring(0,18);}).join('|');})()");
  log('弹窗状态: ' + dlg);
  if (dlg !== 'COVER_DLG') { log('封面弹窗未正确打开，中止'); return; }
  log('封面弹窗已打开');

  // 隐藏蓝色提示条（可能遮挡）
  await cdpLib.cdpEval(sock, "(function(){var n=Array.from(document.querySelectorAll('*'));for(var i=0;i<n.length;i++){var e=n[i];if(e.children.length===0&&e.textContent.indexOf('标题功能已合并至文字模板')!==-1){var bar=e.closest('[class*=notice],[class*=tip],[class*=alert],[class*=bar],[class*=banner]')||e.parentElement;if(bar){bar.style.display='none';return 'HIDDEN';}}}return 'NF';})()");
  await sl(600);

  // 2) 切 AI封图 tab（真实鼠标点 [role=tab] 文本中心）
  // ⚠️ 2026-08-31 实测：当前 UI 下切到 AI封图 tab 后封面【自动生成】，
  //   不再有“根据全文智能生成封面”按钮，也无需点击触发生成。
  log('切 AI封图 tab...');
  if (!await clickEl(sock, inCtx(COVER_MODAL, '[role=tab]', 'AI封图', false))) {
    log('AI封图 tab 未命中（可能默认即 AI 封面）');
  }
  await sl(6000); // 等待自动生成完成（封面缩略图出现）

  // 3) ⚠️ 关键修正：生成完成后“确定”按钮仍为 disabled，
  //    必须【点选一张缩略图】后“确定(1)”才会可用。这是此前反复“封面没设置成功”的根因。
  log('点选第一张缩略图以启用确定...');
  if (!await clickEl(sock, "(function(){var c=(" + COVER_MODAL + ");var imgs=Array.from(c.querySelectorAll('img')).filter(function(i){return i.getBoundingClientRect().width>40;});return imgs[0]||null;})()")) {
    log('未找到缩略图');
  }
  await sl(2000);
  let dis = await cdpLib.cdpEval(sock, "(function(){var c=(" + COVER_MODAL + ");var b=Array.from(c.querySelectorAll('button')).find(function(x){return x.textContent.indexOf('确定')!==-1;});return b?b.disabled:null;})()");
  log('选图后 确定 disabled=' + dis);
  // 若仍 disabled，依次点后续缩略图
  if (dis) {
    for (let k = 1; k < 6; k++) {
      await clickEl(sock, "(function(){var c=(" + COVER_MODAL + ");var imgs=Array.from(c.querySelectorAll('img')).filter(function(i){return i.getBoundingClientRect().width>40;});return imgs[" + k + "]||null;})()");
      await sl(2000);
      const d2 = await cdpLib.cdpEval(sock, "(function(){var c=(" + COVER_MODAL + ");var b=Array.from(c.querySelectorAll('button')).find(function(x){return x.textContent.indexOf('确定')!==-1;});return b?b.disabled:null;})()");
      log('  第' + k + '张缩略图后 disabled=' + d2);
      if (!d2) break;
    }
  }
  const ready = await cdpLib.cdpEval(sock, "(function(){var c=(" + COVER_MODAL + ");var b=Array.from(c.querySelectorAll('button')).find(function(x){return x.textContent.indexOf('确定')!==-1;});return b?(b.disabled?'DISABLED':'ENABLED'):'NF';})()");
  if (ready !== 'ENABLED') { log('确定按钮未启用，中止'); return; }
  log('已选图，确定可用');

  // 4) 点确定（真实鼠标，文本含“确定”模糊匹配；按钮文本为“确定”或“确定 (1)”）
  log('点确定...');
  await clickEl(sock, inCtx(COVER_MODAL, 'button', '确定', false));
  await sl(3000);
  await scr(sock, 'cover_ok');
  log('封面已设置');

  // 5) 发布：先确认封面弹窗已消失，再真实鼠标点编辑页“发布”按钮
  log('等封面弹窗关闭...');
  for (let i = 0; i < 15; i++) {
    await sl(1000);
    const open = await cdpLib.cdpEval(sock, "(function(){return (" + COVER_MODAL + ")?'OPEN':'CLOSED';})()");
    if (open === 'CLOSED') { log('封面弹窗已关闭'); break; }
  }
  log('点发布...');
  if (!await clickEl(sock, byText('button', '发布', true))) { log('未找到发布按钮'); return; }
  await sl(3500);
  await scr(sock, 'after_pub');

  const body = await cdpLib.cdpEval(sock, 'document.body.innerText');
  if (body && (body.indexOf('确认发布') !== -1 || body.indexOf('原创声明') !== -1)) {
    await scr(sock, 'dialog');
    await clickEl(sock, byText('button', '确认发布', false));
    await sl(3000); await scr(sock, 'after_confirm');
  }
  for (let i = 0; i < 12; i++) {
    await sl(3000);
    const u = await cdpLib.cdpEval(sock, 'location.href');
    const s = await cdpLib.cdpEval(sock, 'document.body.innerText');
    const done = (s && (s.indexOf('发布成功') !== -1 || s.indexOf('审核中') !== -1 || s.indexOf('已发布') !== -1 || s.indexOf('已提交') !== -1)) || u.indexOf('manage') !== -1 || u.indexOf('success') !== -1 || u.indexOf('articleId') !== -1;
    log('  [' + ((i + 1) * 3) + 's] url=' + u.substring(0, 55) + ' ok=' + done);
    if (done) { await scr(sock, 'final'); log('文章已发布/提交'); sock.close(); return; }
  }
  await scr(sock, 'final');
  log('未检测到成功信号，需人工确认');
  sock.close();
}
main().catch(e => log('FATAL: ' + e.message));
