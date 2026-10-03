// finish_dedupe_publish.js — 接续收尾：正文图片去重 → 校验 → AI封面 → 发布
// 场景：插图上传因重试等原因插入了 N 张重复图（troubleshooting I5），正文已就位但未发布时，
//       在编辑页直接跑本脚本收尾，不用重头再来。
// 用法：确保隔离 Chrome（CDP 9222）当前停在百家号编辑页且正文已填好，然后：
//   node scripts/finish_dedupe_publish.js
const cdpLib = require('./cdp_lib.js');
const pub = require('./publish.js');

const HOME = process.env.USERPROFILE;
const fs = require('fs');
const SAVE = path.join(HOME, '.qclaw', 'baijiahao_skill') + '\\';
fs.mkdirSync(SAVE, { recursive: true });
function log(m){ console.log('[' + new Date().toLocaleTimeString() + '] ' + m); }
function sl(ms){ return new Promise(r => setTimeout(r, ms)); }
function scr(sock, n){ return cdpLib.cdpShot(sock, SAVE + 'bjh_' + n + '.png').catch(function(){}); }

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
  log('=== 接续：去重 → 封面 → 发布 ===');
  const sock = await cdpLib.cdpConnect(9222);
  if (!sock) { log('❌ CDP 连接失败'); return; }
  await cdpLib.cdp(sock, 'Page.bringToFront', {}).catch(function(){});
  await sl(1000);
  const url = await cdpLib.cdpEval(sock, 'location.href');
  log('页面: ' + url.substring(0, 70));
  if (url.indexOf('builder/rc/edit') === -1) { log('❌ 不在编辑页'); sock.close(); return; }
  for (let i = 0; i < 30; i++) {
    const v = await cdpLib.cdpEval(sock, "(typeof editor!=='undefined'&&editor.setContent)?'READY':'W'");
    if (v === 'READY') break; await sl(1500);
  }
  // 去重：只保留第一张 img（正则删掉其余 <img>，勿直接删 DOM——ProseMirror/UEditor 会回写）
  const dd = await cdpLib.cdpEval(sock, "(function(){var c=editor.getContent();var seen=0;var out=c.replace(/<img[^>]*>/g,function(m){seen++;return seen===1?m:'';});editor.setContent(out);return 'removed='+(seen-1)+' imgs='+editor.body.querySelectorAll('img').length+' textlen='+editor.getContentTxt().length;})()");
  log('去重: ' + dd);
  const chk = await cdpLib.cdpEval(sock, "(function(){return 'imgs='+editor.body.querySelectorAll('img').length+' textlen='+editor.getContentTxt().length;})()");
  log('正文校验: ' + chk);
  await scr(sock, 'dedup_ok');
  if (!(/imgs=1/.test(String(chk)) && parseInt(String(chk).match(/textlen=(\d+)/)[1]) > 500)) { log('❌ 正文校验不通过，中止'); sock.close(); return; }
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
