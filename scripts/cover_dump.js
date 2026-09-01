// cover_dump.js — 诊断封面弹窗真实 DOM 状态（点击 AI封图 tab 后）
const cdpLib = require('./cdp_lib.js');
const path = require('path');
const OUT = 'C:\\Users\\菠萝\\.qclaw\\baijiahao_skill';
const CDP_PORT = 9222;
function log(m){console.log('['+new Date().toLocaleTimeString()+'] '+m);}
function sl(ms){return new Promise(r=>setTimeout(r,ms));}
async function shot(sock,name){log('截图 '+name+': '+await cdpLib.cdpShot(sock,path.join(OUT,name)));}
async function clickEl(sock,finderExpr){
  const rc=await cdpLib.cdpEval(sock,"(function(){try{var e=("+finderExpr+");if(!e||e.offsetWidth===0)return 'NF';if(e.scrollIntoView)e.scrollIntoView({block:'center'});var r=e.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});}catch(ex){return 'ERR';}})()");
  if(typeof rc==='string'&&rc.indexOf('{')===0){const p=JSON.parse(rc);await cdpLib.cdpClickXY(sock,p.x,p.y);await sl(900);return true;}
  log('  clickEl 未命中: '+rc);return false;
}
const COVER_FINDER = "(function(){var els=Array.from(document.querySelectorAll('*'));var cand=els.filter(function(e){return (e.textContent||'').trim()==='选择封面'&&e.getBoundingClientRect().width>100&&e.getBoundingClientRect().width<400;});if(!cand.length)return null;cand.sort(function(a,b){return a.getBoundingClientRect().width-b.getBoundingClientRect().width;});return cand[0];})()";
const COVER_MODAL = "Array.from(document.querySelectorAll('[role=dialog]')).find(function(d){return d.innerText.indexOf('AI封图')!==-1||d.innerText.indexOf('本地上传')!==-1;})";
async function dump(sock){
  const d=await cdpLib.cdpEval(sock,"(function(){var c=("+COVER_MODAL+");if(!c)return 'NO_MODAL';var b=Array.from(c.querySelectorAll('button')).map(function(x){var r=x.getBoundingClientRect();return {t:(x.textContent||'').trim().substring(0,16),dis:x.disabled,aw:x.offsetWidth,ay:Math.round(r.y)};});var gen=Array.from(c.querySelectorAll('*')).filter(function(e){return (e.textContent||'').indexOf('生成')!==-1&&e.offsetWidth<300&&e.offsetWidth>0;}).map(function(e){return (e.textContent||'').trim().substring(0,20);});var tabs=Array.from(c.querySelectorAll('[role=tab]')).map(function(t){return (t.textContent||'').trim();});var sel=Array.from(c.querySelectorAll('img')).filter(function(i){return i.offsetWidth>40;}).length;return JSON.stringify({buttons:b,gen:gen,tabs:tabs,imgs:sel,innerText:c.innerText.replace(/\\s+/g,' ').substring(0,160)});})()");
  log('弹窗状态: '+d);
}
async function main(){
  const sock=await cdpLib.cdpConnect(CDP_PORT);
  if(!sock){log('❌ CDP');return;}
  await sl(2500);
  // 若弹窗已开先关
  await cdpLib.cdpEval(sock,"(function(){var c=("+COVER_MODAL+");if(c){var b=Array.from(c.querySelectorAll('button')).find(function(x){return x.textContent.indexOf('取消')!==-1;});if(b)b.click();}})()");
  await sl(1500);
  await cdpLib.cdpEval(sock,'window.scrollTo(0,0)');await sl(400);
  await cdpLib.cdpEval(sock,'window.scrollTo(0,1400)');await sl(2200);
  log('点开封面弹窗');
  if(!await clickEl(sock,COVER_FINDER)){log('未找到占位');return;}
  await sl(2500);
  await dump(sock); await shot(sock,'d1_open.png');
  log('切 AI封图 tab');
  await clickEl(sock,"("+COVER_MODAL+").querySelector('[role=tab]')"); // 第一个 tab? 改为按文本
  // 按文本点 AI封图
  await clickEl(sock,"Array.from(("+COVER_MODAL+").querySelectorAll('[role=tab]')).find(function(t){return t.textContent.indexOf('AI封图')!==-1;})");
  await sl(3000);
  await dump(sock); await shot(sock,'d2_aitab.png');
  // 等 25s 看生成
  for(let i=0;i<5;i++){await sl(5000);log('-- '+((i+1)*5)+'s --');await dump(sock);}
  await shot(sock,'d3_wait.png');
  sock.close();
}
main().catch(e=>log('FATAL: '+e.message));
