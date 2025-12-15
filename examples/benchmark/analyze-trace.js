const fs = require('fs');

const trace = JSON.parse(fs.readFileSync('Trace-20251205T165313.json', 'utf8'));

// 统计事件
const eventStats = {};
const functionCalls = [];
const layoutEvents = [];
const paintEvents = [];
const scriptEvents = [];
const updateStyleEvents = [];
const recalcStyleEvents = [];

trace.traceEvents.forEach(event => {
  if (!event.name) return;
  
  // 统计事件类型
  eventStats[event.name] = (eventStats[event.name] || 0) + 1;
  
  // 收集函数调用（有 dur 的）
  if (event.name === 'FunctionCall' && event.dur) {
    functionCalls.push({
      name: event.args?.data?.functionName || 'anonymous',
      dur: event.dur / 1000, // 转换为毫秒
      url: event.args?.data?.url || '',
      ts: event.ts
    });
  }
  
  // 收集布局事件
  if (event.name === 'Layout' && event.dur) {
    layoutEvents.push({ 
      dur: event.dur / 1000,
      ts: event.ts
    });
  }
  
  // 收集绘制事件
  if (event.name === 'Paint' && event.dur) {
    paintEvents.push({ dur: event.dur / 1000 });
  }
  
  // 收集样式更新
  if (event.name === 'UpdateLayoutTree' && event.dur) {
    updateStyleEvents.push({
      dur: event.dur / 1000,
      ts: event.ts
    });
  }
  
  // 收集样式重算
  if (event.name === 'RecalculateStyles' && event.dur) {
    recalcStyleEvents.push({
      dur: event.dur / 1000,
      ts: event.ts
    });
  }
  
  // 收集脚本执行
  if ((event.name === 'EvaluateScript' || event.name === 'v8.compile') && event.dur) {
    scriptEvents.push({
      name: event.name,
      dur: event.dur / 1000,
      url: event.args?.data?.url || ''
    });
  }
});

console.log('=== 事件统计 (Top 20) ===');
const sortedEvents = Object.entries(eventStats)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20);
sortedEvents.forEach(([name, count]) => {
  console.log(`${name}: ${count}`);
});

console.log('\n=== 最耗时的函数调用 (Top 20) ===');
functionCalls
  .sort((a, b) => b.dur - a.dur)
  .slice(0, 20)
  .forEach(call => {
    console.log(`${call.name}: ${call.dur.toFixed(2)}ms - ${call.url.substring(0, 60)}`);
  });

console.log('\n=== 布局统计 ===');
const totalLayout = layoutEvents.reduce((sum, e) => sum + e.dur, 0);
console.log(`布局次数: ${layoutEvents.length}`);
console.log(`总布局时间: ${totalLayout.toFixed(2)}ms`);
console.log(`平均布局时间: ${layoutEvents.length > 0 ? (totalLayout / layoutEvents.length).toFixed(2) : 0}ms`);

console.log('\n=== 绘制统计 ===');
const totalPaint = paintEvents.reduce((sum, e) => sum + e.dur, 0);
console.log(`绘制次数: ${paintEvents.length}`);
console.log(`总绘制时间: ${totalPaint.toFixed(2)}ms`);

console.log('\n=== 脚本执行统计 ===');
const totalScript = scriptEvents.reduce((sum, e) => sum + e.dur, 0);
console.log(`脚本执行次数: ${scriptEvents.length}`);
console.log(`总脚本时间: ${totalScript.toFixed(2)}ms`);
scriptEvents
  .sort((a, b) => b.dur - a.dur)
  .slice(0, 10)
  .forEach(event => {
    console.log(`  ${event.name}: ${event.dur.toFixed(2)}ms`);
  });

console.log('\n=== 样式更新统计 (UpdateLayoutTree) ===');
const totalUpdateStyle = updateStyleEvents.reduce((sum, e) => sum + e.dur, 0);
console.log(`更新次数: ${updateStyleEvents.length}`);
console.log(`总时间: ${totalUpdateStyle.toFixed(2)}ms`);
console.log(`平均时间: ${updateStyleEvents.length > 0 ? (totalUpdateStyle / updateStyleEvents.length).toFixed(2) : 0}ms`);
if (updateStyleEvents.length > 0) {
  console.log(`最长: ${Math.max(...updateStyleEvents.map(e => e.dur)).toFixed(2)}ms`);
}

console.log('\n=== 样式重算统计 (RecalculateStyles) ===');
const totalRecalcStyle = recalcStyleEvents.reduce((sum, e) => sum + e.dur, 0);
console.log(`重算次数: ${recalcStyleEvents.length}`);
console.log(`总时间: ${totalRecalcStyle.toFixed(2)}ms`);
console.log(`平均时间: ${recalcStyleEvents.length > 0 ? (totalRecalcStyle / recalcStyleEvents.length).toFixed(2) : 0}ms`);

// 分析 run 函数的详细时间分布
console.log('\n=== run 函数调用分析 ===');
const runCalls = functionCalls.filter(c => c.name === 'run' && c.url.includes('main.ts'));
console.log(`run 调用次数: ${runCalls.length}`);
console.log(`run 总时间: ${runCalls.reduce((sum, c) => sum + c.dur, 0).toFixed(2)}ms`);
console.log(`run 平均时间: ${runCalls.length > 0 ? (runCalls.reduce((sum, c) => sum + c.dur, 0) / runCalls.length).toFixed(2) : 0}ms`);

// 分析每次 run 调用后的布局和样式更新
console.log('\n=== 分析 run 调用后的渲染开销 ===');
runCalls.slice(0, 5).forEach((call, idx) => {
  const layoutsAfter = layoutEvents.filter(e => e.ts > call.ts && e.ts < call.ts + 50000);
  const stylesAfter = updateStyleEvents.filter(e => e.ts > call.ts && e.ts < call.ts + 50000);
  console.log(`\nrun #${idx + 1} (${call.dur.toFixed(2)}ms):`);
  console.log(`  后续布局: ${layoutsAfter.length} 次, ${layoutsAfter.reduce((sum, e) => sum + e.dur, 0).toFixed(2)}ms`);
  console.log(`  后续样式: ${stylesAfter.length} 次, ${stylesAfter.reduce((sum, e) => sum + e.dur, 0).toFixed(2)}ms`);
});
