// publish_remed2.js — 精准找并真实点击「发布」按钮，轮询成功
const cdpLib = require('./cdp_lib.js');
const CDP_PORT = 9222;
function log(m){console.log('['+new Date().toLocaleTimeString()+'] '+m);}
function sl(ms){return new Promise(r=>setTimeout(r,ms));}
async function clickEl(sock,finderExpr){
  const rc=await cdpLib.cdpEval(sock,"(function(){try{var e=("+finderExpr+");if(!e||e.offsetWidth===0)return 'NF';if(e.scrollIntoView)e.scrollIntoView({block:'center'});var r=e.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});}catch(ex){return 'ERR:'+ex.message;}})()");
  if(typeof rc==='string'&&rc.indexOf('{')===0){const p=JSON.parse(rc);await cdpLib.cdpClickXY(sock,p.x,p.y);await sl(900);return true;}
  log('  clickEl 未命中: '+rc);return false;
}
async function pageText(sock){return (await cdpLib.cdpEval(sock,'(document.body.innerText||"").replace(/\\s+/g," ")'))||'';}
async function dumpPublish(sock){
  const info=await cdpLib.cdpEval(sock,"(function(){var bs=Array.from(document.querySelectorAll('button'));return bs.filter(function(b){return (b.textContent||'').indexOf('发布')!==-1;}).map(function(b){var r=b.getBoundingClientRect();return {t:(b.textContent||'').trim().substring(0,12),x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),vis:b.offsetWidth>0};});})()");
  return info||[];
}
async function main(){
  log('=== 精准发布 ===');
  const sock=await cdpLib.cdpConnect(CDP_PORT);
  if(!sock){log('❌ CDP 连接失败');return;}
  await sl(2500);
  await cdpLib.cdpEval(sock,'window.scrollTo(0,0)');await sl(500);
  let arr=await dumpPublish(sock);
  log('候选发布按钮数: '+arr.length);
  arr.forEach((b,i)=>log('  ['+i+'] "'+b.t+'" x='+b.x+' y='+b.y+' w='+b.w+' h='+b.h+' vis='+b.vis));
  // 选择可见且最靠下的发布按钮（编辑页底部发布条）
  const cand=arr.filter(b=>b.vis).sort((a,b)=>b.y-a.y);
  if(!cand.length){log('❌ 未找到可见发布按钮');return;}
  const bt=cand[0];
  log('点击发布: '+JSON.stringify(bt));
  await cdpLib.cdpClickXY(sock,bt.x+bt.w/2,bt.y+bt.h/2);
  await sl(3000);
  let body=await pageText(sock);
  if(body.indexOf('确认发布')!==-1||body.indexOf('原创声明')!==-1){
    log('出现确认对话框，点确认发布');
    await clickEl(sock,"Array.from(document.querySelectorAll('button')).find(function(b){return b.textContent.indexOf('确认发布')!==-1&&b.offsetWidth>0;})");
    await sl(3000);
  }
  let ok=false;
  for(let i=0;i<15;i++){
    await sl(3000);
    const u=await cdpLib.cdpEval(sock,'location.href');
    const s=await pageText(sock);
    const done=(s&&(s.indexOf('发布成功')!==-1||s.indexOf('审核中')!==-1||s.indexOf('已发布')!==-1||s.indexOf('已提交')!==-1))||u.indexOf('manage')!==-1||u.indexOf('success')!==-1||u.indexOf('articleId')!==-1;
    log('  ['+((i+1)*3)+'s] url='+u.substring(0,55)+' ok='+done);
    if(done){ok=true;break;}
  }
  log(ok?'✅ 文章已发布/提交':'⚠️ 仍未检测到成功信号，需人工确认');
  sock.close();
}
main().catch(e=>log('FATAL: '+e.message));
