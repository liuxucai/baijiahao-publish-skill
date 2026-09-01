// publish_diag.js — 点击精确「发布」按钮，诊断弹窗与提交
const cdpLib = require('./cdp_lib.js');
const fs = require('fs');
const OUT = 'C:\\Users\\菠萝\\.qclaw\\baijiahao_skill';
const CDP_PORT = 9222;
function log(m){console.log('['+new Date().toLocaleTimeString()+'] '+m);}
function sl(ms){return new Promise(r=>setTimeout(r,ms));}
async function pageText(sock){return (await cdpLib.cdpEval(sock,'(document.body.innerText||"").replace(/\\s+/g," ")'))||'';}
async function shot(sock,name){const p=require('path').join(OUT,name);log('截图 '+name+': '+await cdpLib.cdpShot(sock,p));return p;}
async function dumpBtns(sock){
  return await cdpLib.cdpEval(sock,"(function(){var bs=Array.from(document.querySelectorAll('button'));return bs.filter(function(b){var t=(b.textContent||'').trim();return t==='发布'||t==='确认发布'||t==='确定'||t==='原创声明'||t.indexOf('确认')!==-1;}).map(function(b){var r=b.getBoundingClientRect();return {t:(b.textContent||'').trim().substring(0,16),x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),vis:b.offsetWidth>0};});})()")||[];
}
async function main(){
  const sock=await cdpLib.cdpConnect(CDP_PORT);
  if(!sock){log('❌ CDP');return;}
  await sl(2500);
  await cdpLib.cdpEval(sock,'window.scrollTo(0,0)');await sl(400);
  // 精确「发布」按钮
  const rc=await cdpLib.cdpEval(sock,"(function(){var bs=Array.from(document.querySelectorAll('button'));var b=bs.find(function(x){return x.textContent.trim()==='发布'&&x.offsetWidth>0;});if(!b)return 'NF';var r=b.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});})()");
  log('精确发布按钮坐标: '+rc);
  if(rc==='NF'){log('未找到');return;}
  const p=JSON.parse(rc);
  await shot(sock,'diag_before.png');
  await cdpLib.cdpClickXY(sock,p.x,p.y);
  log('已点击发布');
  for(let k=1;k<=4;k++){
    await sl(k===1?1000:2000);
    const s=await pageText(sock);
    const btns=await dumpBtns(sock);
    log('['+k+'] body片段: '+s.substring(0,120));
    log('['+k+'] 关键按钮: '+JSON.stringify(btns));
    await shot(sock,'diag_'+k+'.png');
    if(btns.some(b=>b.t.indexOf('确认发布')!==-1)){
      log('  → 出现确认发布，点击它');
      await cdpLib.cdpEval(sock,"(function(){var bs=Array.from(document.querySelectorAll('button'));var b=bs.find(function(x){return x.textContent.indexOf('确认发布')!==-1&&x.offsetWidth>0;});if(b){var r=b.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});}return 'NF';})()");
      const rc2=await cdpLib.cdpEval(sock,"(function(){var bs=Array.from(document.querySelectorAll('button'));var b=bs.find(function(x){return x.textContent.indexOf('确认发布')!==-1&&x.offsetWidth>0;});if(b){var r=b.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});}return 'NF';})()");
      if(rc2!=='NF'){const q=JSON.parse(rc2);await cdpLib.cdpClickXY(sock,q.x,q.y);log('已点确认发布');}
      break;
    }
  }
  // 轮询成功
  let ok=false;
  for(let i=0;i<12;i++){
    await sl(3000);
    const u=await cdpLib.cdpEval(sock,'location.href');
    const s=await pageText(sock);
    const done=(s&&(s.indexOf('发布成功')!==-1||s.indexOf('审核中')!==-1||s.indexOf('已发布')!==-1||s.indexOf('已提交')!==-1))||u.indexOf('manage')!==-1||u.indexOf('success')!==-1||u.indexOf('articleId')!==-1;
    log('  ['+((i+1)*3)+'s] url='+u.substring(0,55)+' ok='+done);
    if(done){ok=true;break;}
  }
  await shot(sock,'diag_end.png');
  log(ok?'✅ 已发布':'⚠️ 需人工确认');
  sock.close();
}
main().catch(e=>log('FATAL: '+e.message));
