// check_title.js — 填标题前先校验（纯规则，不连浏览器）
// 用法： node check_title.js "你的标题"
// 平台已知硬规则：占位符原文「请输入标题(2-64字)」；空/超长会被静默拦截（v7 实测）。
const TITLE_MIN = 2, TITLE_MAX = 64;
function validateTitle(title) {
  const errors = [];
  if (title == null || typeof title !== 'string') { errors.push('标题未定义'); return { ok: false, errors, len: 0 }; }
  const t = title.trim();
  if (t.length === 0) errors.push('标题为空');
  const n = [...t].length;
  if (n < TITLE_MIN) errors.push('不足 ' + TITLE_MIN + ' 字（当前 ' + n + '）');
  if (n > TITLE_MAX) errors.push('超过 ' + TITLE_MAX + ' 字（当前 ' + n + '）——服务端拦截+草稿累积乱码');
  if (title !== t) errors.push('首尾含空白');
  if (/\s{2,}/.test(title)) errors.push('含连续空白');
  return { ok: errors.length === 0, errors, len: n };
}
function main() {
  const arg = process.argv.slice(2).join(' ');
  if (!arg) { console.log('用法: node check_title.js "标题"'); process.exit(2); }
  const r = validateTitle(arg);
  if (r.ok) { console.log('✅ 通过校验（' + r.len + ' 字）: ' + arg); process.exit(0); }
  console.log('❌ 未通过校验:');
  r.errors.forEach(e => console.log('  • ' + e));
  process.exit(1);
}
if (require.main === module) main();
module.exports = { validateTitle };
