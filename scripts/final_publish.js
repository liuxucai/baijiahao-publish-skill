// final_publish.js — 修正版：设封面(点缩略图选图) + 发布。不重新导航(保留已填草稿)。
const cdpLib = require('./cdp_lib.js');
const path = require('path');
const fs = require('fs');
const OUT = 'C:\\Users\\菠萝\\.qclaw\\baijiahao_skill';
const CDP_PORT = 9222;
function log(m){console.log('['+new Date().toLocaleTimeString()+'] '+m);}
function sl(ms){return new Promise(r=>setTimeout(r,ms));}
function byText(tag,txt,exact){const pred=exact?"e.textContent.trim()==='"+txt+"'":"e.textContent.indexOf('"+txt+"')!==-1";return "Array.from(document.querySelectorAll('"+tag+"')).find(function(e){return "+pred+"&&e.offsetWidth>0;})";}
const COVER_FINDER = "(function(){var els=Array.from(document.querySelectorAll('*'));var cand=els.filter(function(e){return (e.textContent||'').trim()==='选择封面'&&e.getBoundingClientRect().width>100&&e.getBoundingClientRect().width<400;});if(!cand.length)return null;cand.sort(function(a,b){return a.getBoundingClientRect().width-b.getBoundingClientRect().width;});return cand[0];})()";
const COVER_MODAL = "Array.from(document.querySelectorAll('[role=dialog]')).find(function(d){return d.innerText.indexOf('AI封图')!==-1||d.innerText.indexOf('本地上传')!==-1;})";
async function clickEl(sock,finderExpr){
  const rc=await cdpLib.cdpEval(sock,"(function(){try{var e=("+finderExpr+");if(!e||e.offsetWidth===0)return 'NF';if(e.scrollIntoView)e.scrollIntoView({block:'center'});var r=e.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});}catch(ex){return 'ERR';}})()");
  if(typeof rc==='string'&&rc.indexOf('{')===0){const p=JSON.parse(rc);await cdpLib.cdpClickXY(sock,p.x,p.y);await sl(900);return true;}
  log('  clickEl 未命中: '+rc);return false;
}
async function pageText(sock){return (await cdpLib.cdpEval(sock,'(document.body.innerText||"").replace(/\\s+/g," ")'))||'';}
async function coverState(sock){return await cdpLib.cdpEval(sock,"(function(){var els=Array.from(document.querySelectorAll('*'));var ph=els.some(function(e){return (e.textContent||'').trim()==='选择封面';});var im=Array.from(document.querySelectorAll('img')).filter(function(i){return i.offsetWidth>60&&i.offsetHeight>40;});return JSON.stringify({ph:ph,imgs:im.length});})()");}
async function modalOpen(sock){return await cdpLib.cdpEval(sock,"(function(){return ("+COVER_MODAL+")?'OPEN':'CLOSED';})()");}

async function setCover(sock){
  await cdpLib.cdpEval(sock,'window.scrollTo(0,0)');await sl(400);
  await cdpLib.cdpEval(sock,'window.scrollTo(0,1400)');await sl(2200);
  log('点开封面弹窗');
  if(!await clickEl(sock,COVER_FINDER)){log('未找到占位');return false;}
  await sl(2500);
  if(await modalOpen(sock)!=='OPEN'){log('弹窗未开');return false;}
  log('切 AI封图 tab');
  await clickEl(sock,"Array.from(("+COVER_MODAL+").querySelectorAll('[role=tab]')).find(function(t){return t.textContent.indexOf('AI封图')!==-1;})");
  await sl(6000); // 自动生成
  log('点第一张缩略图以选中');
  await clickEl(sock,"(function(){var c=("+COVER_MODAL+");var imgs=Array.from(c.querySelectorAll('img')).filter(function(i){return i.getBoundingClientRect().width>40;});return imgs[0]||null;})()");
  await sl(2000);
  let dis=await cdpLib.cdpEval(sock,"(function(){var c=("+COVER_MODAL+");var b=Array.from(c.querySelectorAll('button')).find(function(x){return x.textContent.indexOf('确定')!==-1;});return b?b.disabled:null;})()");
  log('选图后 确定 disabled='+dis);
  if(dis){for(let k=1;k<6;k++){await clickEl(sock,"(function(){var c=("+COVER_MODAL+");var imgs=Array.from(c.querySelectorAll('img')).filter(function(i){return i.getBoundingClientRect().width>40;});return imgs["+k+"]||null;})()");await sl(2000);var d2=await cdpLib.cdpEval(sock,"(function(){var c=("+COVER_MODAL+");var b=Array.from(c.querySelectorAll('button')).find(function(x){return x.textContent.indexOf('确定')!==-1;});return b?b.disabled:null;})()");log('  第'+k+'张后 disabled='+d2);if(!d2)break;}}
  await clickEl(sock,"Array.from(("+COVER_MODAL+").querySelectorAll('button')).find(function(x){return x.textContent.indexOf('确定')!==-1&&x.offsetWidth>0;})");
  await sl(4000);
  return true;
}
async function publish(sock){
  for(let k=0;k<12;k++){if(await modalOpen(sock)!=='OPEN')break;log('等弹窗关闭...');await sl(1500);}
  const rc=await cdpLib.cdpEval(sock,"(function(){var bs=Array.from(document.querySelectorAll('button'));var cand=bs.filter(function(b){return b.textContent.trim()==='发布'&&b.offsetWidth>0;}).sort(function(a,b){return a.getBoundingClientRect().y-b.getBoundingClientRect().y;});var b=cand[0];if(!b)return 'NF';var r=b.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});})()");
  if(rc==='NF'){log('未找到发布');return false;}
  const p=JSON.parse(rc);log('点发布 @'+JSON.stringify(p));
  await cdpLib.cdpClickXY(sock,p.x,p.y);await sl(3500);
  let body=await pageText(sock);
  if(body.indexOf('确认发布')!==-1){log('确认对话框 → 点确认发布');await clickEl(sock,byText('button','确认发布',false));await sl(3000);}
  for(let i=0;i<15;i++){await sl(3000);const u=await cdpLib.cdpEval(sock,'location.href');const s=await pageText(sock);const done=(s&&(s.indexOf('发布成功')!==-1||s.indexOf('审核中')!==-1||s.indexOf('已发布')!==-1||s.indexOf('已提交')!==-1))||u.indexOf('manage')!==-1||u.indexOf('success')!==-1||u.indexOf('articleId')!==-1;log('  ['+((i+1)*3)+'s] url='+u.substring(0,55)+' ok='+done);if(done)return true;}
  return false;
}
async function main(){
  log('=== 最终发布（修正封面流程）===');
  const sock=await cdpLib.cdpConnect(CDP_PORT);
  if(!sock){log('❌ CDP');return;}
  await sl(2500);
  let st=JSON.parse(await coverState(sock));
  log('初始封面: '+JSON.stringify(st));
  if(st.ph){
    log('封面缺失，设置中...');
    if(!await setCover(sock)){log('⚠️ 设封面失败');sock.close();return;}
    st=JSON.parse(await coverState(sock));
    log('设后封面: '+JSON.stringify(st));
    if(st.ph){log('❌ 封面仍未设置，停止');sock.close();return;}
  } else {
    log('✅ 封面已存在，跳过设置');
    if(await modalOpen(sock)==='OPEN'){log('关掉残留弹窗');await clickEl(sock,"Array.from(("+COVER_MODAL+").querySelectorAll('button')).find(function(x){return x.textContent.indexOf('取消')!==-1;})");await sl(1500);}
  }
  const ok=await publish(sock);
  log(ok?'✅ 文章已发布/提交':'⚠️ 未检测到成功信号，需人工确认');
  await cdpLib.cdpShot(sock,path.join(OUT,'final_publish.png'));
  sock.close();
}
main().catch(e=>log('FATAL: '+e.message));
