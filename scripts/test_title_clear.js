// test_title_clear.js — 实测：填入标题 → 清空 → 再输入（每步读回标题框真实内容）
const cdpLib = require('./cdp_lib.js');
const EDIT_URL = 'https://baijiahao.baidu.com/builder/rc/edit?type=news';
const CDP_PORT = process.env.ISOB_CDP_PORT || 9222;
const TEST_TITLE = process.argv[2] || '测试标题_填入再清空';
function log(m){console.log('['+new Date().toLocaleTimeString()+'] '+m);}
function sl(ms){return new Promise(r=>setTimeout(r,ms));}

async function titlePos(sock){
  const p=await cdpLib.cdpEval(sock,"(function(){var e=document.querySelector('[data-testid=news-title-input]')||document.querySelector('.title-input__inner')||document.querySelector('.input-box');if(!e)return 'NO_EL';var r=e.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});})()");
  return p;
}
async function readTitle(sock){
  // 注意：空框时 input-box 的 innerText 会返回 Lexical 占位符「请输入标题（2 - 64字）」，
  // 真实内容要看 input-box 下非 placeholder 节点的文本。占位符=空。
  const r=await cdpLib.cdpEval(sock,"(function(){var e=document.querySelector('.input-box')||document.querySelector('[data-testid=news-title-input]')||document.querySelector('.title-input__inner');if(!e)return 'NO_EL';var ph=e.querySelector('[class*=placeholder]');var real='';for(var i=0;i<e.childNodes.length;i++){var n=e.childNodes[i];if(n.nodeType===3){real+=n.textContent;}else if(n.className&&n.className.indexOf('placeholder')===-1){real+=n.innerText||'';}}return JSON.stringify({box:e.innerText,real:real.trim()});})()");
  try{var o=JSON.parse(r);return {box:o.box,real:o.real};}catch(e){return {box:r,real:''};}
}
async function clickTitle(sock){
  const p=await titlePos(sock); if(p==='NO_EL'){log('❌ 标题框找不到');return false;} const tp=JSON.parse(p);
  await cdpLib.cdpClickXY(sock,tp.x,tp.y); await sl(400); return true;
}
async function selectAll(sock){
  await cdpLib.cdp(sock,'Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Control',code:'ControlLeft',modifiers:2});
  await cdpLib.cdp(sock,'Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',code:'KeyA',modifiers:2});
  await cdpLib.cdp(sock,'Input.dispatchKeyEvent',{type:'rawKeyUp',key:'a',code:'KeyA',modifiers:2});
  await cdpLib.cdp(sock,'Input.dispatchKeyEvent',{type:'rawKeyUp',key:'Control',code:'ControlLeft',modifiers:0});
  await sl(300);
}
async function fillTitle(sock,text){
  await cdpLib.cdpEval(sock,'window.scrollTo(0,0)'); await sl(500);
  if(!await clickTitle(sock)) return;
  await selectAll(sock);
  await cdpLib.cdpInsertText(sock,text); await sl(800);
}
async function clearTitle(sock){
  await cdpLib.cdpEval(sock,'window.scrollTo(0,0)'); await sl(500);
  if(!await clickTitle(sock)) return;
  await selectAll(sock);
  await cdpLib.cdpInsertText(sock,''); await sl(600);
}

async function main(){
  log('=== 标题 填→清→填 实测 ===');
  const sock=await cdpLib.cdpConnect(CDP_PORT);
  if(!sock){log('❌ CDP 连接失败');return;}
  const url=await cdpLib.cdpEval(sock,'location.href');
  log('当前页: '+url);
  if(url.indexOf('login')!==-1||url.indexOf('passport')!==-1){log('⚠️ 似乎未登录（停在登录页），请先在浏览器登录');sock.close();return;}
  if(url.indexOf('builder/rc/edit')===-1){log('打开编辑页...');await cdpLib.cdp(sock,'Page.navigate',{url:EDIT_URL+'&t='+Date.now()});await sl(9000);}

  let t0=await readTitle(sock); log('初始标题框: '+(t0.box==='NO_EL'?'NO_EL':'「'+t0.box+'」'));

  // 1) 填入
  await fillTitle(sock,TEST_TITLE);
  let t1=await readTitle(sock); log('①填入后: 「'+t1.real+'」'+(t1.real===TEST_TITLE?' ✅匹配':' ❌不匹配(读='+t1.real+')'));

  // 2) 清空
  await clearTitle(sock);
  let t2=await readTitle(sock); const empty2=(t2.real===''); log('②清空后: '+(empty2?'（空）✅已清空':'「'+t2.real+'」❌仍有内容'));

  // 3) 再填入
  await fillTitle(sock,TEST_TITLE);
  let t3=await readTitle(sock); log('③再填入后: 「'+t3.real+'」'+(t3.real===TEST_TITLE?' ✅匹配':' ❌不匹配(读='+t3.real+')'));

  log(empty2&&t3.real===TEST_TITLE?'✅ 全流程通过：填→清→填 均正确':'⚠️ 存在异常，见上');
  sock.close();
}
main().catch(e=>log('FATAL: '+e.message));
