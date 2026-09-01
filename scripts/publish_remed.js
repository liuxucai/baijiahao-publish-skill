// publish_remed.js — 收尾：封面已设好，确认无全屏弹窗遮挡后点击发布并轮询成功
const path = require('path');
const cdpLib = require('./cdp_lib.js');
const CDP_PORT = 9222;
const OUT = 'C:\\Users\\菠萝\\.qclaw\\baijiahao_skill';
function log(m){console.log('['+new Date().toLocaleTimeString()+'] '+m);}
function sl(ms){return new Promise(r=>setTimeout(r,ms));}
function byText(tag,txt,exact){const pred=exact?"e.textContent.trim()==='"+txt+"'":"e.textContent.indexOf('"+txt+"')!==-1";return "Array.from(document.querySelectorAll('"+tag+"')).find(function(e){return "+pred+"&&e.offsetWidth>0;})";}
async function clickEl(sock,finderExpr){
  const rc=await cdpLib.cdpEval(sock,"(function(){try{var e=("+finderExpr+");if(!e||e.offsetWidth===0)return 'NF';if(e.scrollIntoView)e.scrollIntoView({block:'center'});var r=e.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});}catch(ex){return 'ERR:'+ex.message;}})()");
  if(typeof rc==='string'&&rc.indexOf('{')===0){const p=JSON.parse(rc);await cdpLib.cdpClickXY(sock,p.x,p.y);await sl(900);return true;}
  log('  clickEl 未命中: '+rc);return false;
}
async function pageText(sock){return (await cdpLib.cdpEval(sock,'(document.body.innerText||"").replace(/\\s+/g," ")'))||'';}

async function diagDialogs(sock){
  const info=await cdpLib.cdpEval(sock,"(function(){var ds=Array.from(document.querySelectorAll('[role=dialog]'));return ds.map(function(d){return (d.innerText||'').replace(/\\s+/g,' ').substring(0,40);});})()");
  return info||[];
}

async function main(){
  log('=== 收尾发布（封面已设）===');
  const sock=await cdpLib.cdpConnect(CDP_PORT);
  if(!sock){log('❌ CDP 连接失败');return;}
  await sl(2500);
  await cdpLib.cdpEval(sock,'window.scrollTo(0,0)');await sl(600);
  const shot1=path.join(OUT,'remed_before.png');
  log('截图: '+await cdpLib.cdpShot(sock,shot1));
  let dlg=await diagDialogs(sock);
  log('当前 dialog 数: '+dlg.length); dlg.forEach((t,i)=>log('  dlg['+i+']: '+t));
  // 若封面全屏弹窗还在，先点确定关掉
  const coverStillOpen=dlg.some(function(t){return t.indexOf('AI封图')!==-1||t.indexOf('本地上传')!==-1;});
  if(coverStillOpen){
    log('封面弹窗仍开着，点确定关闭...');
    await clickEl(sock,"Array.from(document.querySelectorAll('[role=dialog]')).find(function(d){return (d.innerText.indexOf('AI封图')!==-1||d.innerText.indexOf('本地上传')!==-1);}).querySelector('button')");
    await sl(2500);
    let dlg2=await diagDialogs(sock);
    log('关后 dialog 数: '+dlg2.length); dlg2.forEach((t,i)=>log('  dlg['+i+']: '+t));
  }
  // 点击发布
  log('点击发布按钮...');
  if(!await clickEl(sock,byText('button','发布',true))){log('❌ 未找到发布按钮');return;}
  await sl(3000);
  let body=await pageText(sock);
  if(body.indexOf('确认发布')!==-1||body.indexOf('原创声明')!==-1){
    log('出现确认对话框，点确认发布');
    await clickEl(sock,byText('button','确认发布',false));
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
  const shot2=path.join(OUT,'remed_after.png');
  log('截图: '+await cdpLib.cdpShot(sock,shot2));
  log(ok?'✅ 文章已发布/提交':'⚠️ 仍未检测到成功信号，需人工确认');
  sock.close();
}
main().catch(e=>log('FATAL: '+e.message));
