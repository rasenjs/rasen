# Rasen Spine 性能优化方案(目标: 与官方同档,≤1.1×)

基线(10 实例,每实例每帧): rasen 0.34ms vs 官方 0.0034ms = 100x
拆分: apply 170x | updateWorldTransform(uwt) 33x | update ~8x

## 已完成(2026-09-07 本轮)
1. duration 缓存: getAnimationDuration 每帧全表扫描所有 keyframes(~22% 总耗时),
   加 `anim.duration` 缓存字段后 pose 0.187 -> 0.113 ms/帧(node, 1 实例)
2. sample2D 轴拆分缓存: X/Y 分轴 timeline 每次采样做 .some + 两个 .filter
   (每帧 x 258 通道),改为 WeakMap 一次拆分缓存。pose -> 0.093 ms/帧
   (累计 2x 提升,离官方 0.057ms 还差 1.6x)

## 下一步优化(按 ROI 排序)

### A. apply 阶段(170x 差距,最大头)
- A1. timeline 编译期扁平化(预计 5-10x): 解析后把每条 timeline 的 keyframes
  预处理成 Float32Array [time, v0, v1...] + 预归一化 bezier 控制点,
  消除每帧的对象属性读取/typeof 检查/除法。
- A2. 采样二分查找: sampleScalar/sample2D 的线性 while 扫描换成二分
  (动画时间帧间单调递增,可缓存上次索引)。
- A3. 消除 setToSetupPose 全量 reset: applyAnimation 先 setToSetupPose
  (204 骨 x 7 属性 + 181 槽),官方只 reset 有 timeline 的属性。
  改为编译期记录每个 channel 的 setup 值,timeline 应用时直接写。
- A4. 闭包消除: _updateCache 每项是 {update: () => ...} 闭包
  (uwt 慢的主因之一),改成 type-tagged 数组 + switch。
- A5. Object.keys(bones) 每帧遍历: 解析期生成 Array<{bone, tl}> 直接迭代。

### B. uwt 阶段(33x)
- A4 覆盖大部分(闭包 -> 内联)。bone.ax/ay 7 次属性赋值/bone 可合并。

### C. 渲染端
- pose 达标后重测: rasen-webgl 每帧 4.3ms -> ~0.1ms 后与官方同档。

## 验证门禁(每步优化后)
1. npx vitest run packages/assets(runtime 22 测试必须全过)
2. node quick-pose 对照(0.093 -> 目标 <=0.06ms/帧)
3. verify-render 视觉方差测试(防渲染回归)
4. 最终 bench.js 全量重测
