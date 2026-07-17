// finish_publish.js - 收尾：关闭封面选择弹窗 -> 点编辑页发布 -> 处理确认
const path = require('path');
const cp = require('child_process');
const cdpLib = require('./cdp_lib.js');
const HOME = process.env.USERPROFILE;
const XB = path.join(HOME, '.qclaw', 'skills', 'xbrowser', 'scripts', 'xb.cjs');
const SAVE = path.join(HOME, '.qclaw', 'baijiahao_skill') + '\\';
const CDP_PORT = 9222;
function b64(js){return Buffer.from(js).toString('base64');}
function xbEval(js){try{const r=cp.execFileSync('node',[XB,'run','--browser','chrome','eval','--base64',b64(js)],{encoding:'utf8',timeout:20000});try{const o=JSON.parse(r);return o.data&&o.data.result&&o.data.result.data&&o.data.result.data.result;}catch(e){return (r||'NF').toString().substring(0,200);}}catch(e){return 'EX:'+e.message.substring(0,60);}}
function scr(n){try{cp.execFileSync('node',[XB,'run','--browser','chrome','screenshot',SAVE+'fp_'+n+'.png'],{encoding:'utf8',timeout:15000});}catch(e){}}
function log(m){console.log('['+new Date().toLocaleTimeString()+'] '+m);}
function sl(ms){return new Promise(r=>setTimeout(r,ms));}
const COVER_MODAL = "Array.from(document.querySelectorAll('[role=dialog]')).find(function(d){return d.innerText.indexOf('AI封图')!==-1||d.innerText.indexOf('本地上传')!==-1;})";
function isModalOpen(){return xbEval("(" + COVER_MODAL + ")?'true':'false'");}
function byText(tag,txt,exact){const pred=exact?"e.textContent.trim()==='"+txt+"'":"e.textContent.indexOf('"+txt+"')!==-1";return "Array.from(document.querySelectorAll('"+tag+"')).find(function(e){return "+pred+"&&e.offsetWidth>0;})";}
function inCtx(ctxExpr,tag,txt,exact){const pred=exact?"e.textContent.trim()==='"+txt+"'":"e.textContent.indexOf('"+txt+"')!==-1";return "(function(){var c=("+ctxExpr+");if(!c)return null;return Array.from(c.querySelectorAll('"+tag+"')).find(function(e){return "+pred+"&&e.offsetWidth>0;});})()";}
async function clickEl(sock,finderExpr,noScroll){
  const sc = noScroll ? "" : "e.scrollIntoView({block:'center'});";
  const expr = "(function(){try{var e=(" + finderExpr + ");if(!e||e.offsetWidth===0)return 'NF';" + sc + "var r=e.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});}catch(ex){return 'ERR:'+ex.message;}})()";
  const rc=await cdpLib.cdpEval(sock,expr);
  if(typeof rc==='string'&&rc.indexOf('{')===0){const p=JSON.parse(rc);await cdpLib.cdpClickXY(sock,p.x,p.y);await sl(900);return true;}
  log('  getRect 未命中: '+rc);
  return false;
}
async function main(){
  log('=== 收尾发布 ===');
  const sock=await cdpLib.cdpConnect(CDP_PORT);
  if(!sock){log('CDP 失败');return;}

  // 1) 关封面弹窗
  if(isModalOpen()==='true'){
    log('封面弹窗开着，尝试关闭...');
    // ESC 先试
    await cdpLib.cdp(sock,'Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Escape',code:'Escape',modifiers:0});
    await cdpLib.cdp(sock,'Input.dispatchKeyEvent',{type:'rawKeyUp',key:'Escape',code:'Escape',modifiers:0});
    await sl(1500);
    if(isModalOpen()==='true'){
      // 点弹窗确定
      for(let attempt=0;attempt<4;attempt++){
        log('  点弹窗确定 (尝试'+(attempt+1)+')');
        await clickEl(sock, inCtx(COVER_MODAL,'button','确定',false), true);
        await sl(2000);
        if(isModalOpen()==='false') break;
      }
    }
    for(let i=0;i<10;i++){
      await sl(1000);
      if(isModalOpen()==='false'){log('封面弹窗已关闭');break;}
      if(i===9) log('封面弹窗仍未关闭');
    }
  } else {
    log('封面弹窗未开（可能已关）');
  }
  await sl(1000);

  // 2) 点编辑页发布
  log('点编辑页发布...');
  if(!await clickEl(sock, byText('button','发布',true), false)){log('未找到发布按钮');return;}
  await sl(3500);
  scr('after_pub');
  const body=xbEval('document.body.innerText');
  if(body&&(body.indexOf('确认发布')!==-1||body.indexOf('原创声明')!==-1)){
    log('出现确认对话框，点确认发布');
    scr('dialog');
    await clickEl(sock, byText('button','确认发布',false), false);
    await sl(3000); scr('after_confirm');
  }
  for(let i=0;i<12;i++){
    await sl(3000);
    const u=await cdpLib.cdpEval(sock,'location.href');
    const s=xbEval('document.body.innerText');
    const done=(s&&(s.indexOf('发布成功')!==-1||s.indexOf('审核中')!==-1||s.indexOf('已发布')!==-1||s.indexOf('已提交')!==-1))||u.indexOf('manage')!==-1||u.indexOf('success')!==-1||u.indexOf('articleId')!==-1;
    log('  ['+((i+1)*3)+'s] url='+u.substring(0,55)+' ok='+done);
    if(done){scr('final');log('文章已发布/提交');sock.close();return;}
  }
  scr('final');
  log('未检测到成功信号，需人工确认');
  sock.close();
}
main().catch(e=>log('FATAL: '+e.message));
