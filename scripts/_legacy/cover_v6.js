/**
 * 封面设置独立模块（v6 CDP 增强版）
 * 
 * 用法：
 * node skills/baijiahao-publisher/scripts/cover.js
 * 
 * 前置：npm install ws
 * 浏览器需带 CDP 端口启动（或让脚本自动连接 xb 启动的浏览器）
 */
const { open, setCoverViaUpload, setAICover, closeCDP, ensureCDP } = require('./lib.js');

async function main() {
  console.log('=== 封面设置 ===\n');
  
  console.log('[0] 连接 CDP...');
  const cdpOk = await ensureCDP();
  console.log('  CDP:', cdpOk ? '✅' : '❌');
  
  console.log('[1] 打开发布页...');
  await open('https://baijiahao.baidu.com/builder/rc/edit?type=news&t=' + Date.now());
  
  console.log('[2] 设置封面...');
  await setCoverViaUpload();
  
  closeCDP();
  console.log('\n✅ 封面已设置');
  console.log('浏览器已打开，请在页面中完成发布。');
}

main().catch((e) => {
  console.error('\n❌ 失败:', e.message);
  closeCDP();
  process.exit(1);
});
