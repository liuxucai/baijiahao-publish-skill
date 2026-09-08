// clear_title.js — 清空百家号标题框（恢复用，不发布）
// 用法：node clear_title.js
// 原理：真实鼠标点标题框 → Ctrl+A 全选 → Input.insertText("") 替换选区为空白
// ⚠️ 不能用 Ctrl+A + Delete/Backspace —— Lexical 忽略删除并追加（troubleshooting T1 实测）。
const cdpLib = require('./cdp_lib.js');
const EDIT_URL = 'https://baijiahao.baidu.com/builder/rc/edit?type=news';
const CDP_PORT = process.env.ISOB_CDP_PORT || 9222;
function log(m){console.log('['+new Date().toLocaleTimeString()+'] '+m);}
function sl(ms){return new Promise(r=>setTimeout(r,ms));}

async function clearTitle(sock){
  await cdpLib.cdpEval(sock,'window.scrollTo(0,0)'); await sl(500);
  const tpos=await cdpLib.cdpEval(sock,"(function(){var e=document.querySelector('[data-testid=news-title-input]')||document.querySelector('.title-input__inner')||document.querySelector('.input-box');if(!e)return 'NO_EL';var r=e.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});})()");
  if(tpos==='NO_EL'){log('❌ 找不到标题输入框');return false;}
  const tp=JSON.parse(tpos);
  await cdpLib.cdpClickXY(sock,tp.x,tp.y); await sl(400);
  await cdpLib.cdp(sock,'Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Control',code:'ControlLeft',modifiers:2});
  await cdpLib.cdp(sock,'Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',code:'KeyA',modifiers:2});
  await cdpLib.cdp(sock,'Input.dispatchKeyEvent',{type:'rawKeyUp',key:'a',code:'KeyA',modifiers:2});
  await cdpLib.cdp(sock,'Input.dispatchKeyEvent',{type:'rawKeyUp',key:'Control',code:'ControlLeft',modifiers:0});
  await sl(300);
  await cdpLib.cdpInsertText(sock,'');
  await sl(500);
  const tnow=await cdpLib.cdpEval(sock,"(function(){var e=document.querySelector('[data-testid=news-title-input]')||document.querySelector('.title-input__inner')||document.querySelector('.input-box');return e?(e.innerText||'').trim():'NO_EL';})()");
  log('标题已清空: '+(tnow==='NO_EL'?tnow:'「'+tnow+'」'));
  return true;
}

async function main(){
  const sock=await cdpLib.cdpConnect(CDP_PORT);
  if(!sock){log('❌ CDP 连接失败（端口 '+CDP_PORT+'）');return;}
  const url=await cdpLib.cdpEval(sock,'location.href');
  if(url.indexOf('builder/rc/edit')===-1){log('打开编辑页...');await cdpLib.cdp(sock,'Page.navigate',{url:EDIT_URL+'&t='+Date.now()});await sl(9000);}
  await clearTitle(sock);
  // 确认清空结果
  const final=await cdpLib.cdpEval(sock,"(function(){var e=document.querySelector('[data-testid=news-title-input]')||document.querySelector('.title-input__inner')||document.querySelector('.input-box');return e?(e.innerText||'').trim():'NO_EL';})()");
  log(final===''?'✅ 标题框已空':'⚠️ 标题框仍有内容: 「'+final+'」');
  sock.close();
}
main().catch(e=>log('FATAL: '+e.message));
