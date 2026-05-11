# Measure Before Iterative Tuning

## When This Applies

任何需要决定一个数值 / 维度 / 视觉细节的 fix:像素 offset、动画 duration / easing、尺寸阈值、颜色匹配、字体度量、间距等。Trigger:**第一次 guess 没满足用户,正准备 "再试一个值"**。

## The Rule

第一次 guess 失败后,**不要继续 guess**,改成 measure 真实渲染或真实 runtime state。任何"调一个数字直到看着对"的 fix,如果方向 / 大小不靠 measurement 推导,迭代成本会快速线性累加 — verification 回合 × N + 用户对方法的信任流失。一次 measurement(用 DevTools / 浏览器自动化注入测试件 / `getBoundingClientRect` / `getComputedStyle` / canvas `TextMetrics` / 数据 logging / 实测响应 / 任何 runtime introspection 方式)通常比单次额外迭代更便宜。

**Trigger 信号 = stop-and-measure 信号**:"第一次 guess 错,我准备 try another guess" 那一刻就是该 measure 的时刻。Backslide 到"再 guess 一次"是常见诱惑 — 直接量比再猜一次更便宜。

## Why

迭代盲调有 3 个隐性成本同时累计:(1) 每次迭代需要用户验证 — 回合延迟 × N;(2) 用户对方法论失信,即使最终值对了,过程信任已损;(3) 一次 measurement 的实际成本通常等于或低于一次 iteration(因为 iteration 含 build / reload / 用户重看),所以"再 guess 一次" 从来不是更便宜的选项,只是更熟悉的选项。

## 与既有 Rule 的边界

- `Investigate Before Answering`(Global Rules)覆盖 static code / config 读取,**不**覆盖 runtime 渲染 / 实测 introspection — 本 Rule 互补。
- `validate-numerical-equivalence-claims.md` 关注 spec / doc 写作时的数值精度声明,本 Rule 关注 debugging / fix 阶段的策略,二者不重复。
