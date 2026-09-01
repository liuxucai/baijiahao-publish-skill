// setcover_publish.js — 仅设封面(已确认标题正文在) + 验证封面真生效 + 发布
const cdpLib = require('./cdp_lib.js');
const fs = require('fs');
const path = require('path');
const OUT = 'C:\\Users\\菠萝\\.qclaw\\baijiahao_skill';
const CDP_PORT = 9222;
function log(m){console.log('['+new Date().toLocaleTimeString()+'] '+m);}
function sl(ms){return new Promise(r=>setTimeout(r,ms));}
function byText(tag,txt,exact){const pred=exact?"e.textContent.trim()==='"+txt+"'":"e.textContent.indexOf('"+txt+"')!==-1";return "Array.from(document.querySelectorAll('"+tag+"')).find(function(e){return "+pred+"&&e.offsetWidth>0;})";}
function inCtx(ctxExpr,tag,txt,exact){const pred=exact?"e.textContent.trim()==='"+txt+"'":"e.textContent.indexOf('"+txt+"')!==-1";return "(function(){var c=("+ctxExpr+");if(!c)return null;return Array.from(c.querySelectorAll('"+tag+"')).find(function(e){return "+pred+"&&e.offsetWidth>0;});})()";}
const COVER_FINDER = "(function(){var els=Array.from(document.querySelectorAll('*'));var cand=els.filter(function(e){return (e.textContent||'').trim()==='选择封面'&&e.getBoundingClientRect().width>100&&e.getBoundingClientRect().width<400;});if(!cand.length)return null;cand.sort(function(a,b){return a.getBoundingClientRect().width-b.getBoundingClientRect().width;});return cand[0];})()";
const COVER_MODAL = "Array.from(document.querySelectorAll('[role=dialog]')).find(function(d){return d.innerText.indexOf('AI封图')!==-1||d.innerText.indexOf('本地上传')!==-1;})";
async function clickEl(sock,finderExpr){
  const rc=await cdpLib.cdpEval(sock,"(function(){try{var e=("+finderExpr+");if(!e||e.offsetWidth===0)return 'NF';if(e.scrollIntoView)e.scrollIntoView({block:'center'});var r=e.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});}catch(ex){return 'ERR:'+ex.message;}})()");
  if(typeof rc==='string'&&rc.indexOf('{')===0){const p=JSON.parse(rc);await cdpLib.cdpClickXY(sock,p.x,p.y);await sl(900);return true;}
  log('  clickEl 未命中: '+rc);return false;
}
async function shot(sock,name){const p=path.join(OUT,name);log('截图 '+name+': '+await cdpLib.cdpShot(sock,p));return p;}
async function pageText(sock){return (await cdpLib.cdpEval(sock,'(document.body.innerText||"").replace(/\\s+/g," ")'))||'';}
async function coverState(sock){
  return await cdpLib.cdpEval(sock,"(function(){var els=Array.from(document.querySelectorAll('*'));var hasPlaceholder=els.some(function(e){return (e.textContent||'').trim()==='选择封面';});var imgs=Array.from(document.querySelectorAll('img')).filter(function(i){return i.offsetWidth>60&&i.offsetHeight>40;});return JSON.stringify({hasPlaceholder:hasPlaceholder,imgs:imgs.length});})()");
}
async function setCoverAI(sock){
  await cdpLib.cdpEval(sock,'window.scrollTo(0,0)');await sl(400);
  await cdpLib.cdpEval(sock,'window.scrollTo(0,1400)');await sl(2200);
  log('点开封面弹窗...');
  if(!await clickEl(sock,COVER_FINDER)){log('⚠️ 未找到封面占位');return false;}
  await sl(2500);
  const dlg=await cdpLib.cdpEval(sock,"(function(){var ds=Array.from(document.querySelectorAll('[role=dialog]'));var c=ds.find(function(d){return d.innerText.indexOf('AI封图')!==-1||d.innerText.indexOf('本地上传')!==-1;});return c?'COVER_DLG':'OTHER';})()");
  if(dlg!=='COVER_DLG'){log('⚠️ 封面弹窗未正确打开');await shot(sock,'cover_fail_open.png');return false;}
  log('封面弹窗已打开'); await shot(sock,'cover_modal_open.png');
  // 隐藏蓝色提示条
  await cdpLib.cdpEval(sock,"(function(){var n=Array.from(document.querySelectorAll('*'));for(var i=0;i<n.length;i++){var e=n[i];if(e.children.length===0&&e.textContent.indexOf('标题功能已合并至文字模板')!==-1){var bar=e.closest('[class*=notice],[class*=tip],[class*=alert],[class*=bar],[class*=banner]')||e.parentElement;if(bar){bar.style.display='none';return 'HIDDEN';}}}return 'NF';})()");
  await sl(600);
  // 切 AI封图 tab
  log('切 AI封图 tab...');
  await clickEl(sock,inCtx(COVER_MODAL,'[role=tab]','AI封图',false));
  await sl(2200); await shot(sock,'cover_aitab.png');
  // 触发 AI 生成
  log('触发 AI 生成...');
  if(!await clickEl(sock,inCtx(COVER_MODAL,'span','根据全文智能生成封面',false))){
    await clickEl(sock,inCtx(COVER_MODAL,'button','智能生成',false));
  }
  await shot(sock,'cover_gen.png');
  let ok=false;
  for(let i=0;i<30;i++){
    await sl(4000);
    const d=await cdpLib.cdpEval(sock,"(function(){var c=("+COVER_MODAL+");if(!c)return 'NOMODAL';var b=Array.from(c.querySelectorAll('button'));for(var i=0;i<b.length;i++){if(b[i].textContent.indexOf('确定')!==-1)return b[i].disabled?'DISABLED':'ENABLED';}return 'NF';})()");
    if(i%3===0||d==='ENABLED')log('  ['+((i+1)*4)+'s] 确定: '+d);
    if(d==='ENABLED'){ok=true;break;}
  }
  if(!ok){log('⚠️ AI 生成未就绪');await shot(sock,'cover_noready.png');return false;}
  await shot(sock,'cover_ready.png');
  // 点确定
  await clickEl(sock,inCtx(COVER_MODAL,'button','确定',false));
  await sl(4000);
  // 验证封面是否真生效
  const st=await coverState(sock);
  log('点确定后封面状态: '+st);
  await shot(sock,'cover_applied.png');
  // 若仍未生效，再尝试一次点击确定
  let stj=JSON.parse(st);
  if(stj.hasPlaceholder){
    log('⚠️ 封面仍未生效，重试点击确定');
    await clickEl(sock,inCtx(COVER_MODAL,'button','确定',false));
    await sl(4000);
    log('重试后封面状态: '+(await coverState(sock)));
    await shot(sock,'cover_applied2.png');
  }
  return true;
}
async function publish(sock){
  // 先确认封面弹窗已关闭
  for(let k=0;k<10;k++){
    const still=await cdpLib.cdpEval(sock,"(function(){var ds=Array.from(document.querySelectorAll('[role=dialog]'));return ds.some(function(d){return (d.innerText.indexOf('AI封图')!==-1||d.innerText.indexOf('本地上传')!==-1);});})()");
    if(!still)break;
    log('  封面弹窗仍开着，等待关闭...');
    await sl(1500);
  }
  const rc=await cdpLib.cdpEval(sock,"(function(){var bs=Array.from(document.querySelectorAll('button'));var b=bs.find(function(x){return x.textContent.trim()==='发布'&&x.offsetWidth>0;});if(!b)return 'NF';var r=b.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});})()");
  if(rc==='NF'){log('❌ 未找到发布按钮');return false;}
  const p=JSON.parse(rc);
  log('点击发布 @'+JSON.stringify(p));
  await cdpLib.cdpClickXY(sock,p.x,p.y);
  await sl(3500);
  let body=await pageText(sock);
  if(body.indexOf('确认发布')!==-1){
    log('出现确认对话框，点确认发布');
    await clickEl(sock,byText('button','确认发布',false));
    await sl(3000);
  }
  for(let i=0;i<15;i++){
    await sl(3000);
    const u=await cdpLib.cdpEval(sock,'location.href');
    const s=await pageText(sock);
    const done=(s&&(s.indexOf('发布成功')!==-1||s.indexOf('审核中')!==-1||s.indexOf('已发布')!==-1||s.indexOf('已提交')!==-1))||u.indexOf('manage')!==-1||u.indexOf('success')!==-1||u.indexOf('articleId')!==-1;
    log('  ['+((i+1)*3)+'s] url='+u.substring(0,55)+' ok='+done);
    if(done)return true;
  }
  return false;
}
async function main(){
  log('=== 设封面 + 发布 ===');
  const sock=await cdpLib.cdpConnect(CDP_PORT);
  if(!sock){log('❌ CDP 连接失败');return;}
  await sl(2500);
  await cdpLib.cdpEval(sock,'window.scrollTo(0,0)');await sl(400);
  const st0=await coverState(sock);
  log('初始封面状态: '+st0);
  await setCoverAI(sock);
  const st1=await coverState(sock);
  log('设封后封面状态: '+st1);
  const stj=JSON.parse(st1);
  if(stj.hasPlaceholder){
    log('❌ 封面仍未设置成功，停止发布（需人工处理）');
    await shot(sock,'cover_final_fail.png');
    sock.close();return;
  }
  log('✅ 封面已设置，开始发布');
  const ok=await publish(sock);
  log(ok?'✅ 文章已发布/提交':'⚠️ 未检测到成功信号，需人工确认');
  await shot(sock,'final.png');
  sock.close();
}
main().catch(e=>log('FATAL: '+e.message));
