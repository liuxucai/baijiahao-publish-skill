// publish.js — 百家号一键发布（2026-09-10 实测可用版）
// 自包含：仅依赖 ./cdp_lib.js + node_modules/ws，不依赖 xbrowser。
// 浏览器由 isolated-browser skill 拉起（node skills/isolated-browser/scripts/launch.js），CDP 直连 9222。
// 所有点击用 CDP 真实鼠标坐标（Input.dispatchMouseEvent），坐标动态取 getBoundingClientRect 中心，禁硬编码。
//
// ⚠️ 封面：仅用 AI 封面（用户禁用本地上传兜底）。AI 封面失败即主动中止发布，绝不带病发布。
const path = require('path');
const cdpLib = require('./cdp_lib.js');

const HOME = process.env.USERPROFILE;
const SAVE = path.join(HOME, '.qclaw', 'baijiahao_skill') + '\\';
const EDIT_URL = 'https://baijiahao.baidu.com/builder/rc/edit?type=news';

// ===================== 配置区（每次发布改这里） =====================
const CONFIG = {
  title: '诗词不是远方，是此刻可以停靠的自己',
  bodyHtml: [
    '<p>我们总把诗词想得很远:远在课本里，远在考试后就被合上的册页里，远在某个“有文化的人”才配谈论的架子上。可诗词最初从来不是摆设，它是古人把日子过出来的回声——是困顿时的一声长叹，是欢喜时的一句脱口，是看见月亮、看见落花、看见老友时，忍不住想说点什么的那点真心。</p>',
    '<p>苏轼在被贬黄州的深夜写“小舟从此逝，江海寄余生”，不是真要弃官而去，而是把压在心头的委屈，轻轻交给了江风。王维在“空山新雨后”里待着，也不是逃避人间，而是给自己腾出一处不被琐事塞满的安静。诗词于他们，是一处可以停靠的自己，而非逃离世界的船。</p>',
    '<p>所以读诗词，不必先背作者生平、不必先查典故出处。最先该做的，是让一句诗撞到你身上。李白说“举杯邀明月，对影成三人”，你若也曾独自喝酒、对着窗外出神，便懂那份热闹里的孤单;杜甫写“随风潜入夜，润物细无声”，你若也在某个春夜听过雨，便知道什么叫温柔地活着。诗词的门，是用你自己的经历推开的。</p>',
    '<p>很多人觉得诗词“用不上”。可生活里那些说不清的时刻，往往一句诗就接住了。想念一个人，是“一种相思，两处闲愁”;劝自己放宽，是“竹杖芒鞋轻胜马，谁怕”;看透得失，是“古今多少事，都付笑谈中”。它们不是装饰，而是前人替我们攒下的情绪词典，让模糊的感受有了形状。</p>',
    '<p>也不必非读唐诗宋词才算亲近诗词。一首好的现代诗，一段打动你的歌词，甚至朋友圈里某人写的一句话，只要它让你心里一动，便有诗词的魂。重要的是那点“被说中”的瞬间——你忽然觉得，原来不只是我这么想，原来这种说不清的东西，有人早就说过了。</p>',
    '<p>若想真的把诗词读进去，最好的法子不是背诵，而是“对上号”。今天堵车烦了，翻翻苏轼;今天想念谁了，翻翻李清照;今天想躺平，翻翻陶渊明。让诗词跟着你的日子走，而不是把它供在书架上。日子久了，那些句子会自己长进你心里，在某个人生路口悄悄冒出来，替你撑一把。</p>',
    '<p>说到底，诗词不是远方，也不是考点，而是此刻可以停靠的自己。它不教你怎么成功，却教你怎么在成败之间，还留得住一份从容;不替你解决难题，却在你最难言说时，递来一句刚刚好的懂得。忙完今天，不妨读一句诗——不为别的，就为和那个被生活推着走的自己，重逢片刻。</p>',
  ].join(''),
  coverMode: 'ai',
  cdpPort: process.env.ISOB_CDP_PORT || 9222,
};
// ====================================================================

// ===================== 标题校验（填入前先检查，避免被静默拦截白跑全流程） =====================
// 平台已知规则：占位符原文「请输入标题(2-64字)」。标题为空/超长会被“标题必填/最多64字”校验静默拦截，
// 表现像按钮失灵（v7 实测）。这里在 fillTitle 之前先做静态校验，不合规直接中止并报原因。
const TITLE_MIN = 2;   // 最少字数（含）
const TITLE_MAX = 64;  // 最多字数（含）
function validateTitle(title) {
  const errors = [];
  if (title == null || typeof title !== 'string') {
    errors.push('标题未定义（CONFIG.title 缺失）');
    return { ok: false, errors, len: 0 };
  }
  const t = title.trim();
  if (t.length === 0) errors.push('标题为空');
  const n = [...t].length;            // 按字符（Unicode 码点）计“字”，兼容中文/emoji
  if (n < TITLE_MIN) errors.push('标题不足 ' + TITLE_MIN + ' 字（当前 ' + n + ' 字）');
  if (n > TITLE_MAX) errors.push('标题超过 ' + TITLE_MAX + ' 字（当前 ' + n + ' 字）——服务端会拦截并累积草稿乱码');
  if (title !== t) errors.push('标题首尾含空白');
  if (/\s{2,}/.test(title)) errors.push('标题含连续空白');
  return { ok: errors.length === 0, errors, len: n };
}
// ====================================================================

function log(m) { console.log('[' + new Date().toLocaleTimeString() + '] ' + m); }
function sl(ms) { return new Promise(r => setTimeout(r, ms)); }
function scr(sock, n) { return cdpLib.cdpShot(sock, SAVE + 'pub_' + n + '.png').catch(function () {}); }

// 封面占位：精确匹配“选择封面”，筛选 width 在 100~400 的元素，取最窄者（内层 ~198px 真实可点卡片）
const COVER_FINDER = "(function(){var els=Array.from(document.querySelectorAll('*'));var c=els.filter(function(e){return (e.textContent||'').trim()==='选择封面'&&e.getBoundingClientRect().width>100&&e.getBoundingClientRect().width<400;});if(!c.length)return null;c.sort(function(a,b){return a.getBoundingClientRect().width-b.getBoundingClientRect().width;});return c[0];})()";
// 封面弹窗：含 AI封图/本地上传 的 dialog
const COVER_MODAL = "Array.from(document.querySelectorAll('[role=dialog]')).find(function(d){return d.innerText.indexOf('AI封图')!==-1||d.innerText.indexOf('AI封面')!==-1||d.innerText.indexOf('本地上传')!==-1;})";

// 在指定上下文(ctxExpr)内按 tag+文本定位元素（exact 控制精确/包含匹配），要求可见(offsetWidth>0)
function inCtx(ctxExpr, tag, txt, exact) {
  const pred = exact ? "e.textContent.trim()==='" + txt + "'" : "e.textContent.indexOf('" + txt + "')!==-1";
  return "(function(){var c=(" + ctxExpr + ");if(!c)return null;return Array.from(c.querySelectorAll('" + tag + "')).find(function(e){return " + pred + "&&e.offsetWidth>0;});})()";
}

// 在封面弹窗内按文本点击任意可见元素(不限 tag)：txt 为包含匹配，返回是否点到
async function clickByText(sock, txt) {
  const finder = "(function(){var c=(" + COVER_MODAL + ");if(!c)return null;return Array.from(c.querySelectorAll('*')).find(function(e){return e.textContent.indexOf('" + txt + "')!==-1 && e.offsetWidth>0 && e.children.length<=1;});})()";
  return await clickEl(sock, finder);
}

async function getRect(sock, finderExpr) {
  const expr = "(function(){try{var e=(" + finderExpr + ");if(!e||e.offsetWidth===0)return 'NF';e.scrollIntoView({block:'center'});var r=e.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});}catch(ex){return 'ERR:'+ex.message;}})()";
  const rc = await cdpLib.cdpEval(sock, expr);
  if (typeof rc === 'string' && rc.indexOf('{') === 0) return JSON.parse(rc);
  return null;
}
async function clickEl(sock, finderExpr) {
  const p = await getRect(sock, finderExpr);
  if (!p) return false;
  await cdpLib.cdpClickXY(sock, p.x, p.y);
  await sl(900);
  return true;
}

// 关闭“我知道了”引导弹窗（若有）
async function closeGuide(sock) {
  const done = await cdpLib.cdpEval(sock, "(function(){var b=Array.from(document.querySelectorAll('button'));for(var i=0;i<b.length;i++){if(b[i].textContent.trim().indexOf('我知道了')!==-1&&b[i].offsetWidth>0){b[i].click();return 'CLOSED';}}return 'NONE';})()");
  if (done === 'CLOSED') { log('已关闭引导弹窗'); await sl(800); }
}

// 读取标题框“真实内容”：忽略 Lexical 占位符节点（class 含 placeholder、child:0），只取非占位符文本。
// ⚠️ 空框时 input-box 的 innerText 会显示占位符「请输入标题（2-64字）」，那不是真实内容（2026-09-08 实测）。
async function getRealTitle(sock) {
  const r = await cdpLib.cdpEval(sock, "(function(){var e=document.querySelector('.input-box')||document.querySelector('[data-testid=news-title-input]')||document.querySelector('.title-input__inner');if(!e)return 'NO_EL';var real='';for(var i=0;i<e.childNodes.length;i++){var n=e.childNodes[i];if(n.nodeType===3){real+=n.textContent;}else if(n.className&&n.className.indexOf('placeholder')===-1){real+=(n.innerText||'');}}return real.trim();})()");
  return r === 'NO_EL' ? null : r;
}

// 填标题（CDP 坐标点标题框 → Ctrl+A → Input.insertText）。text 默认 CONFIG.title。
async function fillTitle(sock, text) {
  const title = (text != null) ? text : CONFIG.title;
  await cdpLib.cdpEval(sock, 'window.scrollTo(0,0)'); await sl(500);
  const tpos = await cdpLib.cdpEval(sock, "(function(){var e=document.querySelector('[data-testid=news-title-input]')||document.querySelector('.title-input__inner')||document.querySelector('.input-box');if(!e)return 'NO_EL';var r=e.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});})()");
  if (tpos === 'NO_EL') { log('❌ 找不到标题输入框'); return false; }
  const tp = JSON.parse(tpos);
  await cdpLib.cdpClickXY(sock, tp.x, tp.y); await sl(400);
  await cdpLib.cdp(sock, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Control', code: 'ControlLeft', modifiers: 2 });
  await cdpLib.cdp(sock, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'a', code: 'KeyA', modifiers: 2 });
  await cdpLib.cdp(sock, 'Input.dispatchKeyEvent', { type: 'rawKeyUp', key: 'a', code: 'KeyA', modifiers: 2 });
  await cdpLib.cdp(sock, 'Input.dispatchKeyEvent', { type: 'rawKeyUp', key: 'Control', code: 'ControlLeft', modifiers: 0 });
  await sl(300);
  await cdpLib.cdpInsertText(sock, title);
  await sl(800);
  log('标题已填（预期 ' + [...title].length + ' 字）');
  return true;
}

// 清空标题框（恢复用）：真实鼠标点框 → Ctrl+A 全选 → Input.insertText("") 替换选区为空白
// ⚠️ 不要用 Ctrl+A + Delete/Backspace：Lexical 忽略删除并追加（troubleshooting T1 实测）。
async function clearTitle(sock) {
  await cdpLib.cdpEval(sock, 'window.scrollTo(0,0)'); await sl(500);
  const tpos = await cdpLib.cdpEval(sock, "(function(){var e=document.querySelector('[data-testid=news-title-input]')||document.querySelector('.title-input__inner')||document.querySelector('.input-box');if(!e)return 'NO_EL';var r=e.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});})()");
  if (tpos === 'NO_EL') { log('❌ 找不到标题输入框，无法清空'); return false; }
  const tp = JSON.parse(tpos);
  await cdpLib.cdpClickXY(sock, tp.x, tp.y); await sl(400);
  await cdpLib.cdp(sock, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Control', code: 'ControlLeft', modifiers: 2 });
  await cdpLib.cdp(sock, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'a', code: 'KeyA', modifiers: 2 });
  await cdpLib.cdp(sock, 'Input.dispatchKeyEvent', { type: 'rawKeyUp', key: 'a', code: 'KeyA', modifiers: 2 });
  await cdpLib.cdp(sock, 'Input.dispatchKeyEvent', { type: 'rawKeyUp', key: 'Control', code: 'ControlLeft', modifiers: 0 });
  await sl(300);
  await cdpLib.cdpInsertText(sock, '');
  await sl(500);
  const real = await getRealTitle(sock);
  log('标题已清空: ' + (real === '' ? '（空）' : '「' + real + '」'));
  return true;
}

// 填后复核：读出框内真实内容，既验证“符合要求”也验证“与预期一致”（防编辑器静默截断/串字）
async function postCheckTitle(sock, expected) {
  const real = await getRealTitle(sock);
  if (real == null) return { ok: false, real: null, v: { ok: false, errors: ['读不到标题框'] } };
  const v = validateTitle(real);
  const match = real === expected;
  return { ok: v.ok && match, real: real, v: v, match: match };
}

// 重构标题：针对已知可自动修复的不合规做确定性修复；无法修复（如过短/与预期不符）返回 null 交人工。
function reconstructTitle(title, post) {
  if (title == null) return null;
  const norm = title.trim().replace(/\s{2,}/g, ' ');   // 修首尾/连续空白
  if (norm !== title) { log('↳ 重构：规范化空白 → 「' + norm + '」'); return norm; }
  const chars = [...norm];
  if (chars.length > TITLE_MAX) {                       // 超长：截断到上限
    const cut = chars.slice(0, TITLE_MAX).join('');
    log('↳ 重构：截断至 ' + TITLE_MAX + ' 字 → 「' + cut + '」');
    return cut;
  }
  if (chars.length < TITLE_MIN) {                       // 过短：无法自动补齐，交人工
    log('⚠️ 标题过短（' + chars.length + ' 字），无法自动重构，请人工提供合规标题');
    return null;
  }
  if (post && !post.match) {                            // 长度合规但与预期不符，无更多自动策略
    log('⚠️ 填后内容与预期不一致且无法自动修复，请人工确认');
    return null;
  }
  return null;
}

// 标题闭环（2026-09-08 优化）：填前校验 → 填入 → 填后复核 → 不合规则清空+重构+再填（上限 MAX_TITLE_RETRIES 轮）
const MAX_TITLE_RETRIES = 3;
async function ensureTitle(sock, title) {
  let current = title;
  for (let attempt = 1; attempt <= MAX_TITLE_RETRIES; attempt++) {
    const pre = validateTitle(current);
    if (!pre.ok) {
      log('[' + attempt + '] 填前校验不通过：' + pre.errors.join('；'));
      const fixed = reconstructTitle(current);
      if (!fixed) { log('❌ 标题无法自动修复，中止'); return false; }
      current = fixed; continue;
    }
    await fillTitle(sock, current);
    const post = await postCheckTitle(sock, current);
    if (post.ok) { log('[' + attempt + '] ✅ 填后复核通过：' + post.real); return true; }
    log('[' + attempt + '] 填后复核不通过：' + (post.match ? post.v.errors.join('；') : '实际「' + post.real + '」≠预期「' + current + '」'));
    await clearTitle(sock);
    const fixed = reconstructTitle(current, post);
    if (!fixed) { log('❌ 标题无法自动修复，中止'); return false; }
    current = fixed;
  }
  log('❌ 超过 ' + MAX_TITLE_RETRIES + ' 轮仍未合规，中止');
  return false;
}

// 填正文（UEditor setContent，经 CDP eval）
async function fillBody(sock) {
  const js = "(function(){if(typeof editor!=='undefined'&&editor.setContent){editor.setContent(" + JSON.stringify(CONFIG.bodyHtml) + ");return 'OK:'+editor.getContent().length;}return 'NO_EDITOR';})()";
  const r = await cdpLib.cdpEval(sock, js);
  log('正文: ' + r);
  return typeof r === 'string' && r.indexOf('OK') === 0;
}

// 封面-AI生成（cheetah 自研组件，真实鼠标点击）
async function setCoverAI(sock) {
  await cdpLib.cdpEval(sock, 'window.scrollTo(0,0)'); await sl(400);
  await cdpLib.cdpEval(sock, 'window.scrollTo(0,1200)'); await sl(2200);
  // 1) 开封面弹窗：真实鼠标点“选择封面”内层卡片（点击可能瞬时 ERR，重试至弹窗打开）
  let opened = false;
  for (let ci = 0; ci < 3 && !opened; ci++) {
    await clickEl(sock, COVER_FINDER);
    for (let wi = 0; wi < 4; wi++) {
      await sl(1000);
      const dd = await cdpLib.cdpEval(sock, "(function(){var ds=Array.from(document.querySelectorAll('[role=dialog]'));var c=ds.find(function(d){return d.innerText.indexOf('AI封图')!==-1||d.innerText.indexOf('AI封面')!==-1||d.innerText.indexOf('本地上传')!==-1;});return c?'COVER_DLG':'OTHER';})()");
      if (dd === 'COVER_DLG') { opened = true; break; }
    }
    if (!opened) log('  封面占位点击重试 (' + (ci + 1) + ')');
  }
  if (!opened) { log('⚠️ 未找到封面占位/弹窗未打开'); return false; }
  log('封面弹窗已打开');
  // 隐藏蓝色提示条
  await cdpLib.cdpEval(sock, "(function(){var n=Array.from(document.querySelectorAll('*'));for(var i=0;i<n.length;i++){var e=n[i];if(e.children.length===0&&e.textContent.indexOf('标题功能已合并至文字模板')!==-1){var bar=e.closest('[class*=notice],[class*=tip],[class*=alert],[class*=bar],[class*=banner]')||e.parentElement;if(bar){bar.style.display='none';return 'HIDDEN';}}}return 'NF';})()");
  await sl(700);
  // 2) 切 AI封面 tab（2026-09-10 新 UI：tab 文本为“AI封面”）
  await clickEl(sock, inCtx(COVER_MODAL, '[role=tab]', 'AI封面', false));
  await sl(2000);
  // 3) 点 AI 生成封面入口（id=ai-cover-tab-v2-step-1，role=button，即“来试试AI生成封面”/从正文总结生成）
  log('点「AI生成封面」(step-1)...');
  if (!await cdpLib.cdpClickEl(sock, "document.getElementById('ai-cover-tab-v2-step-1')")) { log('⚠️ 未找到 AI 生成入口'); return false; }
  // 轮询封面图生成（最多 ~2min，失败则重试点击 step-1）
  let genOk = false;
  for (let i = 0; i < 40; i++) {
    await sl(3000);
    const cnt = await cdpLib.cdpEval(sock, "(function(){var c=(" + COVER_MODAL + ");if(!c)return -1;return Array.from(c.querySelectorAll('img')).filter(function(img){return img.getBoundingClientRect().width>40;}).length;})()");
    if (cnt > 0) { log('封面图已生成: ' + cnt + ' 张 (' + ((i + 1) * 3) + 's)'); genOk = true; break; }
    const fail = await cdpLib.cdpEval(sock, "(function(){var c=(" + COVER_MODAL + ");return c&&/生成失败|重试|生成出错/.test(c.innerText)?1:0;})()");
    if (fail) { log('  检测到生成失败，重试(' + ((i + 1) * 3) + 's)'); await cdpLib.cdpClickEl(sock, "document.getElementById('ai-cover-tab-v2-step-1')"); }
    if (i % 10 === 0) log('  等待封面生成 (' + ((i + 1) * 3) + 's)...');
  }
  if (!genOk) { log('⚠️ 封面图未生成，AI 封面失败，中止发布（用户禁用本地上传兜底）'); return false; }
  // 4) 点第一张缩略图（70×52 的 img 本身，width 41~200；勿点 336 大预览）→ 触发选中态(-selected)，确定 (1) 启用
  // 选中可能异步，未启用则重点（重新取坐标）最多 3 次，每次轮询 ~6s。
  const THUMB = "(function(){var c=(" + COVER_MODAL + ");if(!c)return null;var imgs=Array.from(c.querySelectorAll('img')).filter(function(img){var w=img.getBoundingClientRect().width;return w>40&&w<200;});return imgs[0]||null;})()";
  let ready = 'DISABLED';
  for (let pick = 0; pick < 3 && ready !== 'ENABLED'; pick++) {
    log('点选缩略图(第' + (pick + 1) + '次)...');
    if (!await clickEl(sock, THUMB)) { log('⚠️ 未找到缩略图'); break; }
    for (let ri = 0; ri < 3; ri++) {
      await sl(2000);
      ready = await cdpLib.cdpEval(sock, "(function(){var c=(" + COVER_MODAL + ");var b=Array.from(c.querySelectorAll('button')).find(function(x){return x.textContent.indexOf('确定')!==-1;});return b?(b.disabled?'DISABLED':'ENABLED'):'NF';})()");
      if (ready === 'ENABLED') break;
    }
  }
  if (ready !== 'ENABLED') { log('⚠️ 确定按钮未启用(当前=' + ready + ')，AI 封面失败，中止发布（用户禁用本地上传兜底）'); return false; }
  log('已选图，确定可用');
  // 用精确坐标真实鼠标点击“确定 (1)”按钮（clickByText 曾命中弹窗外同名按钮导致弹窗未关）
  const rc = await cdpLib.cdpEval(sock, "(function(){var c=(" + COVER_MODAL + ");var b=Array.from(c.querySelectorAll('button')).find(function(x){return x.textContent.indexOf('确定')!==-1&&x.offsetWidth>0;});if(!b)return 'NF';var r=b.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});})()");
  if (rc.indexOf('{') === 0) { const p = JSON.parse(rc); await cdpLib.cdpClickXY(sock, p.x, p.y); }
  // 轮询弹窗关闭（最多 ~10s）
  let closed = false;
  for (let ci = 0; ci < 5; ci++) {
    await sl(2000);
    const still = await cdpLib.cdpEval(sock, "(function(){var ds=Array.from(document.querySelectorAll('[role=dialog]'));return ds.some(function(d){return d.innerText.indexOf('AI封面')!==-1||d.innerText.indexOf('本地上传')!==-1;});})()");
    if (!still) { closed = true; break; }
  }
  await scr(sock, 'cover_ok');
  if (!closed) { log('⚠️ 封面弹窗未关闭，AI 封面失败，中止发布（用户禁用本地上传兜底）'); return false; }
  log('✅ AI封面已设置');
  return true;
}


// 发布（CDP 真实鼠标坐标点击，禁 in-page button.click）
async function publish(sock) {
  if (!await clickEl(sock, "(function(){var b=Array.from(document.querySelectorAll('button'));for(var i=0;i<b.length;i++){if(b[i].textContent.trim()==='发布'&&b[i].offsetWidth>0)return b[i];}return null;})()")) {
    log('未找到发布按钮'); return false;
  }
  log('已触发发布');
  await sl(3500);
  await scr(sock, 'after_pub');
  const body = await cdpLib.cdpEval(sock, 'document.body.innerText');
  if (body && (body.indexOf('确认发布') !== -1 || body.indexOf('原创声明') !== -1)) {
    await scr(sock, 'dialog');
    await clickEl(sock, "(function(){var b=Array.from(document.querySelectorAll('button'));for(var i=0;i<b.length;i++){var t=b[i].textContent.trim();if((t.indexOf('确认发布')!==-1||t==='确定')&&b[i].offsetWidth>0)return b[i];}return null;})()");
    await sl(3000); await scr(sock, 'after_confirm');
  }
  for (let i = 0; i < 12; i++) {
    await sl(3000);
    const url = await cdpLib.cdpEval(sock, 'location.href');
    const s = await cdpLib.cdpEval(sock, 'document.body.innerText');
    const ok = s && (s.indexOf('发布成功') !== -1 || s.indexOf('审核中') !== -1 || s.indexOf('已发布') !== -1 || s.indexOf('已提交') !== -1 || url.indexOf('manage') !== -1 || url.indexOf('success') !== -1 || url.indexOf('articleId') !== -1);
    log('  [' + ((i + 1) * 3) + 's] url=' + url.substring(0, 55) + ' ok=' + ok);
    if (ok) return true;
  }
  return false;
}

async function main() {
  log('=== 百家号一键发布 ===');
  const sock = await cdpLib.cdpConnect(CONFIG.cdpPort);
  if (!sock) { log('❌ CDP 连接失败（端口 ' + CONFIG.cdpPort + '）。确认 isolated-browser 已拉起隔离 Chrome 且端口可用。'); return; }

  // 确保在编辑页
  let url = await cdpLib.cdpEval(sock, 'location.href');
  if (url.indexOf('builder/rc/edit') === -1) { log('打开编辑页...'); await cdpLib.cdp(sock, 'Page.navigate', { url: EDIT_URL + '&t=' + Date.now() }); await sl(9000); }
  // 等编辑器 ready
  for (let i = 0; i < 40; i++) {
    const v = await cdpLib.cdpEval(sock, "(function(){return (typeof editor!=='undefined'&&editor.setContent)?'READY':'WAIT';})()");
    if (v === 'READY') break; await sl(1500);
  }
  await closeGuide(sock);
  const titleOk = await ensureTitle(sock, CONFIG.title);
  if (!titleOk) { await scr(sock, 'title_fail'); sock.close(); return; }
  await fillBody(sock);
  if (CONFIG.coverMode !== 'skip') {
    const hasCover = await cdpLib.cdpEval(sock, "(function(){var c=document;var ph=Array.from(c.querySelectorAll('*')).some(function(e){return e.children.length===0&&e.textContent.trim()==='选择封面'&&e.offsetWidth>0&&e.getBoundingClientRect().width<400;});return !ph;})()");
    if (hasCover) { log('封面已设置，跳过设置'); }
    else {
      const coverOk = CONFIG.coverMode === 'ai' ? await setCoverAI(sock) : false;
      if (!coverOk) { log('❌ 封面未设置成功，中止发布（避免无封面被静默拦截）'); await scr(sock, 'cover_fail'); sock.close(); return; }
    }
  }
  const ok = await publish(sock);
  await scr(sock, 'final');
  log(ok ? '✅ 文章已发布/提交' : '⚠️ 未检测到成功信号，需人工确认');
  sock.close();
}

if (require.main === module) {
  main().catch(e => log('FATAL: ' + e.message));
}

module.exports = { validateTitle, reconstructTitle, ensureTitle, getRealTitle, clearTitle, fillTitle, setCoverAI, CONFIG };
