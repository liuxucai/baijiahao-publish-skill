// publish_with_image.js — 百家号发布统一入口：标题 + 正文段间插图 + AI封面 + 发布
// （2026-09-29 实测跑通《婚车租车避坑指南》，见 references/troubleshooting.md 第十章）
//
// 用法：
//   node scripts/publish_with_image.js [article文件路径]
//   不传参数时默认使用 templates/article_example.js
//   article 文件为 CommonJS 模块，导出：{ title, partA, partB, image, tags }
//     - partA：插图之前的段落 HTML（<p> 拼接）
//     - partB：插图之后的段落 HTML
//     - image：配图绝对路径（将上传并插在 partA/partB 之间）
//
// 依赖：同目录 cdp_lib.js（CDP 封装）、publish.js（ensureTitle/setCoverAI 复用）
// 前置：isolated-browser 拉起的隔离 Chrome（CDP 9222，launch.js 已内置防节流参数），
//       百家号已登录。
//
// 流程：强刷编辑页（复位弹窗组件状态）→ 关残留弹窗/遮罩 → ensureTitle
//   → setContent(partA) → 光标定位段尾 → 点工具栏「插图」→ 上传 image
//   → 等「确认」enabled → 真实鼠标点确认 → getContent 拼 partB setContent
//   → setCoverAI（AI封面，失败即中止）→ 点发布 → 轮询成功信号
const path = require('path');
const fs = require('fs');
const cdpLib = require('./cdp_lib.js');
const pub = require('./publish.js');

const ARTICLE_FILE = process.argv[2] || path.join(__dirname, '..', 'templates', 'article_example.js');
const ART = require(path.resolve(ARTICLE_FILE));

const HOME = process.env.USERPROFILE;
const SAVE = path.join(HOME, '.qclaw', 'baijiahao_skill') + '\\';
fs.mkdirSync(SAVE, { recursive: true });
const EDIT_URL = 'https://baijiahao.baidu.com/builder/rc/edit?type=news';

function log(m){ console.log('[' + new Date().toLocaleTimeString() + '] ' + m); }
function sl(ms){ return new Promise(r => setTimeout(r, ms)); }
function scr(sock, n){ return cdpLib.cdpShot(sock, SAVE + 'bjh_' + n + '.png').catch(function(){}); }

// ── 插图弹窗（2026-09-29 实测）：是 [role=dialog]（外层 .cheetah-modal-wrap），
//    tab 文案（本地图片/AI配图/网盘图片 等）会变，勿写死；
//    右下角按钮文案是「确认」不是「确定」（封面弹窗才是「确定 (1)」）──
const IMG_DLG = "(function(){var ds=Array.from(document.querySelectorAll('[role=dialog]'));for(var i=0;i<ds.length;i++){var d=ds[i];if(d.offsetWidth>0){var t=d.innerText||'';if(t.indexOf('取消')!==-1&&(t.indexOf('确定')!==-1||t.indexOf('确认')!==-1)&&(t.indexOf('上传')!==-1||t.indexOf('图库')!==-1||t.indexOf('AI配图')!==-1)&&t.length<800)return d;}}return null;})()";

// 弹窗内「确认/确定」按钮状态 / 坐标（都在 IMG_DLG 根节点内找）
function okBtnText(){ return "(b.textContent.trim()==='确认'||b.textContent.trim()==='确定')"; }
function finderImgDlgOkState(){
  return "(function(){var d=(" + IMG_DLG + ");if(!d)return 'NF';var bs=Array.from(d.querySelectorAll('button')).filter(function(b){return " + okBtnText() + "&&b.offsetWidth>0;});if(!bs.length)return 'NF';return bs[0].disabled?'DISABLED':'ENABLED';})()";
}
function finderImgDlgOkRect(){
  return "(function(){var d=(" + IMG_DLG + ");if(!d)return 'NF';var bs=Array.from(d.querySelectorAll('button')).filter(function(b){return " + okBtnText() + "&&b.offsetWidth>0;});if(!bs.length)return 'NF';var r=bs[0].getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});})()";
}

// 自实现：对 accept=image 的 file input 设置文件
// （cdp_lib.setFileInputFiles 固定选页面上第一个 input[type=file]——那是 video 的，会选错）
// 带 DOM.getDocument 初始化 + 重试（不先 getDocument 会拿 NO_NODE；React 重渲染会让节点失效）
// ⚠️ 只 set 一次即可：设置后 input.files.length 读出恒 0 是假象（上传实际已触发），
//    反复重设会插入 N 张重复图。成功与否以「确认」按钮变 enabled 为准。
async function setImgFile(sock, filePath){
  await cdpLib.cdp(sock, 'DOM.getDocument', { depth: 0 }).catch(function(){});
  for (let t = 0; t < 6; t++) {
    const r = await cdpLib.cdp(sock, 'Runtime.evaluate', {
      expression: "(function(){var ins=Array.from(document.querySelectorAll('input[type=file]')).filter(function(i){return (i.accept||'').indexOf('image')!==-1;});return ins.length?ins[ins.length-1]:null;})()",
      returnByValue: false
    });
    const oid = r && r.result && r.result.result && r.result.result.objectId;
    if (oid) {
      const rn = await cdpLib.cdp(sock, 'DOM.requestNode', { objectId: oid });
      const nodeId = rn && rn.result && rn.result.nodeId;
      if (nodeId) {
        await cdpLib.cdp(sock, 'DOM.setFileInputFiles', { nodeId: nodeId, files: [filePath] });
        return 'SET';
      }
    }
    await sl(1000);
  }
  return 'FAIL';
}

// 关闭已打开的图片弹窗（真实鼠标点取消），并清理残留透明遮罩
async function closeImgDlg(sock){
  for (let round = 0; round < 3; round++) {
    const open = await cdpLib.cdpEval(sock, "(" + IMG_DLG + ")?'OPEN':'CLOSED'");
    if (open === 'OPEN') {
      log('发现已打开的插图弹窗，点取消 (' + (round + 1) + ')');
      const cancelF = "(function(){var d=(" + IMG_DLG + ");if(!d)return null;var bs=Array.from(d.querySelectorAll('button')).filter(function(b){return b.textContent.trim()==='取消'&&b.offsetWidth>0;});return bs[0]||null;})()";
      await cdpLib.cdpClickEl(sock, cancelF);
      await sl(1500);
    } else break;
  }
  // 弹窗关了但可能残留透明 .cheetah-modal-wrap 遮罩（会盖住工具栏/标题框吞点击）——无条件隐藏
  const clr = await cdpLib.cdpEval(sock, "(function(){var n=0;Array.from(document.querySelectorAll('.cheetah-modal-wrap')).forEach(function(w){if(w.offsetWidth>0){w.style.display='none';n++;}});return 'hid='+n;})()");
  log('清理 cheetah 遮罩: ' + clr);
  if (clr !== 'hid=0') await sl(600);
}

// 正文：partA → 光标段尾 → 上传插图 → 确认 → 拼 partB
async function fillBodyWithImage(sock){
  // 1) partA
  const r1 = await cdpLib.cdpEval(sock, "(function(){if(typeof editor!=='undefined'&&editor.setContent){editor.setContent(" + JSON.stringify(ART.partA) + ");return 'OK:'+editor.getContent().length;}return 'NO_EDITOR';})()");
  log('partA: ' + r1);
  if (r1 === 'NO_EDITOR') return false;
  await sl(800);
  // 2) 光标移到末尾（插图会插在当前光标处，必须先定位到段尾）
  const cur = await cdpLib.cdpEval(sock, "(function(){if(typeof editor==='undefined')return 'NO_EDITOR';editor.focus();try{var r=editor.selection.getRange();r.setStartAtLast(editor.body);r.collapse(true);r.select();return 'CURSOR_END';}catch(ex){return 'ERR:'+ex.message;}})()");
  log('光标: ' + cur);
  // 3) 打开插图弹窗（先回页面顶部，直接取 rect 真实点击；勿用 scrollIntoView——长文下会把工具栏滚乱）
  await cdpLib.cdpEval(sock, 'window.scrollTo(0,0)');
  await sl(800);
  // 移除历史遗留的隐藏插图弹窗实例（display:none 的 wrap 内还挂着旧 dialog，组件会认为已打开而不重建）
  const rm = await cdpLib.cdpEval(sock, "(function(){var n=0;Array.from(document.querySelectorAll('.cheetah-modal-wrap')).forEach(function(w){if(!w.offsetWidth&&w.querySelector('[role=dialog]')&&(w.innerText||'').indexOf('本地上传')!==-1){w.remove();n++;}});return 'rm='+n;})()");
  if (rm !== 'rm=0') { log('移除遗留弹窗实例: ' + rm); await sl(600); }
  const tbRect = await cdpLib.cdpEval(sock, "(function(){var b=document.querySelector('.edui-for-insertimage');if(!b)return 'NF';var r=b.getBoundingClientRect();var t=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),top:t?t.tagName+'.'+String(t.className).substring(0,50):'null'});})()");
  if (typeof tbRect !== 'string' || tbRect.indexOf('{') !== 0) { log('❌ insertimage 按钮找不到'); return false; }
  log('插图按钮: ' + tbRect);
  const tp = JSON.parse(tbRect);
  // 点击后轮询弹窗，未开则重试（最多 3 次）。注：有时点击只弹「添加图片/智能配图」悬浮菜单，
  // 此时需先 mouseMoved 再 press/release 真实点击菜单内「添加图片」项（见 troubleshooting I1）
  let opened = 'CLOSED';
  for (let att = 0; att < 3 && opened !== 'OPEN'; att++) {
    await cdpLib.cdpClickXY(sock, tp.x, tp.y);
    for (let i = 0; i < 5; i++) { await sl(1000); opened = await cdpLib.cdpEval(sock, "(" + IMG_DLG + ")?'OPEN':'CLOSED'"); if (opened === 'OPEN') break; }
    if (opened !== 'OPEN') log('  弹窗未开，重试(' + (att + 1) + ')');
  }
  if (opened !== 'OPEN') { log('❌ 插图弹窗未打开'); await scr(sock, 'dlg_fail'); return false; }
  log('插图弹窗已打开');
  await sl(800);
  // 4) 上传本地图片（setFileInputFiles，不走原生文件框；只 set 一次，勿反复重设）
  const up = await setImgFile(sock, ART.image);
  log('上传图(' + ART.image + '): ' + up);
  if (up !== 'SET') { log('❌ 文件设置失败'); await scr(sock, 'up_fail'); return false; }
  // 5) 等「确认」按钮 enabled（上传完成，约 10~15s；勿用 input.files 校验——恒为 0 是假象）
  let okState = 'NF';
  for (let i = 0; i < 30; i++) {
    await sl(2000);
    okState = await cdpLib.cdpEval(sock, finderImgDlgOkState());
    if (okState === 'ENABLED') break;
  }
  if (okState !== 'ENABLED') { log('❌ 上传未完成（确认=' + okState + '），中止插图'); await scr(sock, 'up_fail'); return false; }
  log('上传完成，确认已启用');
  await scr(sock, 'uploaded');
  // 6) 真实鼠标点确认（IMG_DLG 内，动态取中心）
  const okBtn = await cdpLib.cdpEval(sock, finderImgDlgOkRect());
  if (typeof okBtn === 'string' && okBtn.indexOf('{') === 0) { const p = JSON.parse(okBtn); await cdpLib.cdpClickXY(sock, p.x, p.y); }
  // 7) 等弹窗关闭 + 图片入正文
  let hasImg = false;
  for (let i = 0; i < 10; i++) {
    await sl(1500);
    const closed = await cdpLib.cdpEval(sock, "(" + IMG_DLG + ")?'OPEN':'CLOSED'");
    const cnt = await cdpLib.cdpEval(sock, "(function(){return (editor.getContent().match(/<img/g)||[]).length;})()");
    if (closed !== 'OPEN' && parseInt(cnt) > 0) { hasImg = true; break; }
  }
  if (!hasImg) { log('❌ 图片未插入正文'); await scr(sock, 'img_fail'); return false; }
  log('✅ 图片已插入正文');
  // 8) 取当前内容，拼接 partB（正文多于 1 张图时可先按 troubleshooting I5 去重）
  const r2 = await cdpLib.cdpEval(sock, "(function(){var c=editor.getContent()+" + JSON.stringify(ART.partB) + ";editor.setContent(c);return 'OK:'+editor.getContent().length;})()");
  log('拼接 partB 后正文长度: ' + r2);
  const check = await cdpLib.cdpEval(sock, "(function(){return 'imgs='+((editor.getContent().match(/<img/g)||[]).length)+' textlen='+editor.getContentTxt().length;})()");
  log('正文校验: ' + check);
  await scr(sock, 'body_ok');
  return String(check).indexOf('imgs=1') !== -1 && parseInt(String(check).match(/textlen=(\d+)/)[1]) > 500;
}

// 发布（真实鼠标坐标点击）
async function publish(sock){
  const btnF = "(function(){var b=Array.from(document.querySelectorAll('button'));for(var i=0;i<b.length;i++){if(b[i].textContent.trim()==='发布'&&b[i].offsetWidth>0)return b[i];}return null;})()";
  const rc = await cdpLib.cdpEval(sock, "(function(){var e=(" + btnF + ");if(!e)return 'NF';e.scrollIntoView({block:'center'});var r=e.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});})()");
  if (typeof rc !== 'string' || rc.indexOf('{') !== 0) { log('未找到发布按钮'); return false; }
  const p = JSON.parse(rc);
  await cdpLib.cdpClickXY(sock, p.x, p.y);
  log('已触发发布');
  await sl(3500);
  await scr(sock, 'after_pub');
  const body = await cdpLib.cdpEval(sock, 'document.body.innerText');
  if (body && (body.indexOf('确认发布') !== -1 || body.indexOf('确定发布') !== -1)) {
    await scr(sock, 'dialog');
    await cdpLib.cdpClickEl(sock, "(function(){var b=Array.from(document.querySelectorAll('button'));for(var i=0;i<b.length;i++){var t=b[i].textContent.trim();if((t.indexOf('确认发布')!==-1||t==='确定')&&b[i].offsetWidth>0)return b[i];}return null;})()");
    await sl(3000); await scr(sock, 'after_confirm');
  }
  for (let i = 0; i < 12; i++) {
    await sl(3000);
    const url = await cdpLib.cdpEval(sock, 'location.href');
    const s = await cdpLib.cdpEval(sock, 'document.body.innerText');
    const ok = s && (s.indexOf('发布成功') !== -1 || s.indexOf('审核中') !== -1 || s.indexOf('已提交') !== -1 || url.indexOf('manage') !== -1 || url.indexOf('success') !== -1 || url.indexOf('articleId') !== -1);
    log('  [' + ((i + 1) * 3) + 's] url=' + url.substring(0, 60) + ' ok=' + ok);
    if (ok) return true;
  }
  return false;
}

async function main(){
  log('=== 百家号发布（正文段间插图版）===');
  log('文章: ' + ARTICLE_FILE);
  log('标题: ' + ART.title);
  log('标签: ' + (ART.tags || []).join('、') + ' | 配图: ' + ART.image);
  const sock = await cdpLib.cdpConnect(9222);
  if (!sock) { log('❌ CDP 连接失败'); return; }
  await cdpLib.cdp(sock, 'Page.bringToFront', {}).catch(function(){});   // 窗口置前，防遮挡导致截图/点击异常
  await sl(1000);
  // 每轮强制刷新编辑页：插图弹窗是 React 受控组件，一旦进入半开状态（隐藏/残留），
  // 组件 state 认为已打开，再点 insertimage 也不会重建——刷新是唯一可靠的复位手段
  log('强制刷新编辑页（复位弹窗组件状态）...');
  await cdpLib.cdp(sock, 'Page.navigate', { url: EDIT_URL + '&t=' + Date.now() });
  await sl(9000);
  for (let i = 0; i < 40; i++) {
    const v = await cdpLib.cdpEval(sock, "(function(){return (typeof editor!=='undefined'&&editor.setContent)?'READY':'WAIT';})()");
    if (v === 'READY') break; await sl(1500);
  }
  const login = await cdpLib.cdpEval(sock, 'location.href');
  if (login.indexOf('login') !== -1) { log('❌ 百家号未登录，请先在隔离浏览器中手动登录'); sock.close(); return; }
  // 关引导弹窗 + 清残留弹窗/遮罩
  await cdpLib.cdpEval(sock, "(function(){var b=Array.from(document.querySelectorAll('button'));for(var i=0;i<b.length;i++){if(b[i].textContent.trim().indexOf('我知道了')!==-1&&b[i].offsetWidth>0){b[i].click();return 'C';}}return 'N';})()");
  await sl(600);
  await closeImgDlg(sock);
  // 标题（闭环校验，复用 publish.js 的 ensureTitle）
  const titleOk = await pub.ensureTitle(sock, ART.title);
  if (!titleOk) { log('❌ 标题未通过，中止'); await scr(sock, 'title_fail'); sock.close(); return; }
  // 正文 + 段间插图
  const bodyOk = await fillBodyWithImage(sock);
  if (!bodyOk) { log('❌ 正文/插图未通过，中止发布'); sock.close(); return; }
  // AI 封面（失败即中止，禁用本地上传兜底）
  const coverOk = await pub.setCoverAI(sock);
  if (!coverOk) { log('❌ AI 封面失败，中止发布'); await scr(sock, 'cover_fail'); sock.close(); return; }
  // 发布
  const ok = await publish(sock);
  await scr(sock, 'final');
  log(ok ? '✅ 文章已发布/提交' : '⚠️ 未检测到成功信号，需人工确认');
  sock.close();
}
main().catch(e => log('FATAL: ' + e.message));
