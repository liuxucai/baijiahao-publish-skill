// publish_self.js — 自包含百家号发布（仅依赖 cdp_lib.js + ws，不依赖 xbrowser）
// 用法: 改 CONFIG(title / bodyHtml) 后 node publish_self.js
const path = require('path');
const cdpLib = require('./cdp_lib.js');
const CDP_PORT = 9222;
const EDIT_URL = 'https://baijiahao.baidu.com/builder/rc/edit?type=news';
function log(m){console.log('['+new Date().toLocaleTimeString()+'] '+m);}
function sl(ms){return new Promise(r=>setTimeout(r,ms));}

// ===================== 配置区（本次发布） =====================
const CONFIG = {
  title: '把话说清楚，先学会「明确」',
  bodyHtml: [
    '<p>我们每天都在沟通，但真正“被听懂”的话，其实少得可怜。问题往往不在说得够不够多，而在于不够“明确”——同一个词，你心里的意思和对方接到的意思，常常差着一整条河。</p>',
    '<p>什么是“明确”？简单说，就是让接收方不用猜。你想表达观点，就直接给出观点，而不是铺一堆情绪等别人来提炼；你想提要求，就说清要什么、什么时候要、做到什么程度算好。模糊的沟通，看似留了余地，实则把理解的成本甩给了对方。</p>',
    '<p>不明确的背后，常常藏着三种东西。一是不敢：怕说太死显得不近人情，怕被拒绝，于是用“尽量”“差不多”给自己留退路。二是没想清：你以为自己明白了，一张嘴才发现逻辑还是乱的——能说清楚，本来就是想清楚的证明。三是怕担责：把话说含糊，出事了可以说“我当初不是这个意思”。</p>',
    '<p>想要更明确，有三个可用的小方法。第一，结论先行：先把最想让对方记住的那句话讲出来，再补理由。第二，用具体的标准代替形容词：不说“尽快”，而说“今天下班前”；不说“好看”，而说“配色统一、留白够、重点突出”。第三，给对方一个校验的机会：说完补一句“我讲清楚了吗，你理解的是不是……”，让误解在当场浮出来。</p>',
    '<p>在工作里，明确的回报最直接。一个明确的需求，能省下团队反复对齐的十几轮来回；一次明确的反馈，比十句“还行吧”更能让人进步。很多人抱怨协作累，细看往往是累在“猜”——猜领导要什么，猜同事卡在哪。把话说明白，本身就是一种效率。</p>',
    '<p>当然，明确不等于生硬。语气可以温和，边界必须清楚；可以照顾对方感受，不必牺牲信息准确。真正高明的沟通，是既让人舒服，又让人毫无疑虑地知道下一步该做什么。</p>',
    '<p>所以，下次开口或落笔前，先停一秒问自己：如果我是接收方，听到这句话，能不能不靠猜就行动起来？如果答案是不能，那就再明确一点。把“明确”变成习惯，你会发现，很多原本卡住的关系和事情，其实只是被一句清楚的话挡着了。</p>',
  ].join(''),
};
// ====================================================================

// ---- 元素查找器（动态，不依赖 class hash）----
const COVER_FINDER = "(function(){var els=Array.from(document.querySelectorAll('*'));var cand=els.filter(function(e){return (e.textContent||'').trim()==='选择封面'&&e.getBoundingClientRect().width>100&&e.getBoundingClientRect().width<400;});if(!cand.length)return null;cand.sort(function(a,b){return a.getBoundingClientRect().width-b.getBoundingClientRect().width;});return cand[0];})()";
const COVER_MODAL = "Array.from(document.querySelectorAll('[role=dialog]')).find(function(d){return d.innerText.indexOf('AI封图')!==-1||d.innerText.indexOf('本地上传')!==-1;})";
function byText(tag,txt,exact){const pred=exact?"e.textContent.trim()==='"+txt+"'":"e.textContent.indexOf('"+txt+"')!==-1";return "Array.from(document.querySelectorAll('"+tag+"')).find(function(e){return "+pred+"&&e.offsetWidth>0;})";}
function inCtx(ctxExpr,tag,txt,exact){const pred=exact?"e.textContent.trim()==='"+txt+"'":"e.textContent.indexOf('"+txt+"')!==-1";return "(function(){var c=("+ctxExpr+");if(!c)return null;return Array.from(c.querySelectorAll('"+tag+"')).find(function(e){return "+pred+"&&e.offsetWidth>0;});})()";}

async function clickEl(sock,finderExpr){
  const rc=await cdpLib.cdpEval(sock,"(function(){try{var e=("+finderExpr+");if(!e||e.offsetWidth===0)return 'NF';e.scrollIntoView({block:'center'});var r=e.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});}catch(ex){return 'ERR:'+ex.message;}})()");
  if(typeof rc==='string'&&rc.indexOf('{')===0){const p=JSON.parse(rc);await cdpLib.cdpClickXY(sock,p.x,p.y);await sl(900);return true;}
  log('  clickEl 未命中: '+rc);
  return false;
}
async function pageText(sock){return (await cdpLib.cdpEval(sock,'(document.body.innerText||"").replace(/\\s+/g," ")'))||'';}

async function fillTitle(sock){
  const finder="document.querySelector('[data-testid=news-title-input]')||document.querySelector('.title-input__inner')||document.querySelector('.input-box')";
  const rc=await cdpLib.cdpEval(sock,"(function(){var e=("+finder+");if(!e)return 'NO_EL';var r=e.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});})()");
  if(rc==='NO_EL'){log('❌ 找不到标题输入框');return false;}
  const tp=JSON.parse(rc);
  await cdpLib.cdpClickXY(sock,tp.x,tp.y);await sl(400);
  await cdpLib.cdp(sock,'Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Control',code:'ControlLeft',modifiers:2});
  await cdpLib.cdp(sock,'Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',code:'KeyA',modifiers:2});
  await cdpLib.cdp(sock,'Input.dispatchKeyEvent',{type:'rawKeyUp',key:'a',code:'KeyA',modifiers:2});
  await cdpLib.cdp(sock,'Input.dispatchKeyEvent',{type:'rawKeyUp',key:'Control',code:'ControlLeft',modifiers:0});
  await sl(300);
  await cdpLib.cdpInsertText(sock,CONFIG.title);
  await sl(800);
  const tnow=await cdpLib.cdpEval(sock,"(function(){var e=("+finder+");return e?(e.innerText||e.value||'').substring(0,40):'NO_EL';})()");
  log('标题已填: '+tnow+'（'+CONFIG.title.length+'字）');
  return true;
}

async function setCoverAI(sock){
  await cdpLib.cdpEval(sock,'window.scrollTo(0,0)');await sl(400);
  await cdpLib.cdpEval(sock,'window.scrollTo(0,1400)');await sl(2200);
  log('点开封面弹窗...');
  if(!await clickEl(sock,COVER_FINDER)){log('⚠️ 未找到封面占位');return false;}
  await sl(2500);
  const dlg=await cdpLib.cdpEval(sock,"(function(){var ds=Array.from(document.querySelectorAll('[role=dialog]'));var c=ds.find(function(d){return d.innerText.indexOf('AI封图')!==-1||d.innerText.indexOf('本地上传')!==-1;});return c?'COVER_DLG':'OTHER';})()");
  if(dlg!=='COVER_DLG'){log('⚠️ 封面弹窗未正确打开');return false;}
  log('封面弹窗已打开');
  // 隐藏蓝色提示条
  await cdpLib.cdpEval(sock,"(function(){var n=Array.from(document.querySelectorAll('*'));for(var i=0;i<n.length;i++){var e=n[i];if(e.children.length===0&&e.textContent.indexOf('标题功能已合并至文字模板')!==-1){var bar=e.closest('[class*=notice],[class*=tip],[class*=alert],[class*=bar],[class*=banner]')||e.parentElement;if(bar){bar.style.display='none';return 'HIDDEN';}}}return 'NF';})()");
  await sl(600);
  // 切 AI封图 tab
  log('切 AI封图 tab...');
  await clickEl(sock,inCtx(COVER_MODAL,'[role=tab]','AI封图',false));
  await sl(2200);
  // 触发 AI 生成（span 文字按钮）
  log('触发 AI 生成...');
  if(!await clickEl(sock,inCtx(COVER_MODAL,'span','根据全文智能生成封面',false))){
    await clickEl(sock,inCtx(COVER_MODAL,'button','智能生成',false));
  }
  let ok=false;
  for(let i=0;i<30;i++){
    await sl(4000);
    const d=await cdpLib.cdpEval(sock,"(function(){var c=("+COVER_MODAL+");if(!c)return 'NOMODAL';var b=Array.from(c.querySelectorAll('button'));for(var i=0;i<b.length;i++){if(b[i].textContent.indexOf('确定')!==-1)return b[i].disabled?'DISABLED':'ENABLED';}return 'NF';})()");
    if(i%3===0||d==='ENABLED')log('  ['+((i+1)*4)+'s] 确定: '+d);
    if(d==='ENABLED'){ok=true;break;}
  }
  if(!ok){log('⚠️ AI 生成未就绪');return false;}
  await clickEl(sock,inCtx(COVER_MODAL,'button','确定',false));
  await sl(3000);
  log('✅ AI封面已设置');
  return true;
}

async function publish(sock){
  if(!await clickEl(sock,byText('button','发布',true))){log('未找到发布按钮');return false;}
  await sl(3500);
  let body=await pageText(sock);
  if(body.indexOf('确认发布')!==-1||body.indexOf('原创声明')!==-1){
    log('出现确认对话框，点确认发布');
    await clickEl(sock,byText('button','确认发布',false));
    await sl(3000);
  }
  for(let i=0;i<12;i++){
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
  log('=== 百家号自包含发布 ===');
  const sock=await cdpLib.cdpConnect(CDP_PORT);
  if(!sock){log('❌ CDP 连接失败');return;}
  await sl(3000);
  // 重新打开干净的编辑页（文章已存在草稿中，避免遗留 dialog 干扰）
  await cdpLib.cdp(sock,'Page.navigate',{url:EDIT_URL+'&t='+Date.now()});
  await sl(9000);
  // 等编辑器 ready
  for(let i=0;i<40;i++){const v=await cdpLib.cdpEval(sock,"(function(){return (typeof editor!=='undefined'&&editor.setContent)?'READY':'WAIT';})()");if(v==='READY')break;await sl(1500);}
  // 关引导弹窗
  await cdpLib.cdpEval(sock,"(function(){var b=Array.from(document.querySelectorAll('button'));for(var i=0;i<b.length;i++){if(b[i].textContent.trim().indexOf('我知道了')!==-1&&b[i].offsetWidth>0){b[i].click();return 'CLOSED';}}return 'NONE';})()");
  await sl(800);
  await fillTitle(sock);
  const r=await cdpLib.cdpEval(sock,"(function(){if(typeof editor!=='undefined'&&editor.setContent){editor.setContent("+JSON.stringify(CONFIG.bodyHtml)+");return 'OK:'+editor.getContent().length;}return 'NO_EDITOR';})()");
  log('正文: '+r);
  await sl(1000);
  await setCoverAI(sock);
  const ok=await publish(sock);
  log(ok?'✅ 文章已发布/提交':'⚠️ 未检测到成功信号，需人工确认');
  sock.close();
}
main().catch(e=>log('FATAL: '+e.message));
