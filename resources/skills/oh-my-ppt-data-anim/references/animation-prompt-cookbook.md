# 动画提示词速查手册

直接复制、直接用。每条提示词都能在 Oh My PPT 里稳定生成对应动画，且可导出为可编辑 PPTX。

---

## 入场动画（元素出现）

### fade — 纯淡入

最安静的方式，文字、注释、辅助信息首选。

```html
<p data-anim="fade">辅助说明文字</p>
```

视觉：从透明渐变到可见，没有位移。像一个声音从远处慢慢变清晰。

---

### fade-up — 标准上浮淡入

最常用的入场动画。卡片、标题、列表项默认选它。

```html
<h2 data-anim="fade-up">季度营收</h2>
<p data-anim="fade-up" data-anim-stagger="90">用户增长 42%</p>
<p data-anim="fade-up" data-anim-stagger="90">留存率 86%</p>
```

视觉：从下方 20px 处一边上移一边淡入。像卡片从桌面浮起。

---

### fade-down — 下沉淡入

从上方落下，适合倒计时、从顶部"降落"的信息。

```html
<div data-anim="fade-down">⏱ 倒计时 3 秒</div>
```

视觉：从上方 20px 处下移 + 淡入。像纸片从上方飘落到位。

---

### fade-left / fade-right — 侧向淡入

从右侧 / 左侧滑入淡入。适合对比布局的左右两栏。

```html
<div class="grid grid-cols-2 gap-6">
  <div data-anim="fade-left">当前方案</div>
  <div data-anim="fade-right">优化方案</div>
</div>
```

视觉：fade-left 从右侧 20px 滑入，fade-right 从左侧 20px 滑入。像两张卡片各从一侧合拢。

---

### scale-in — 缩放淡入

比 zoom-in 温和，从 85% 放大到 100% + 淡入。适合图标、小卡片。

```html
<div data-anim="scale-in">🧩 核心模块</div>
```

视觉：从小一点点放大到正常尺寸 + 淡入。像一张照片从缩略图展开。

---

### slide-up / slide-down — 大幅滑动

比 fade-up 位移更大（40px vs 20px），视觉冲击更强。适合需要明确"运动感"的场景。

```html
<div data-anim="slide-up">重大公告</div>
<div data-anim="slide-down">下拉刷新提示</div>
```

视觉：slide-up 从下方 40px 大幅上移，slide-down 从上方 40px 大幅下移。比 fade-up 更有"推入"的力量感。

---

### slide-left / slide-right — 大幅侧滑

比 fade-left/fade-right 位移更大（40px vs 20px），适合全宽卡片、大面板的入场。

```html
<div data-anim="slide-left">右侧面板内容</div>
<div data-anim="slide-right">左侧面板内容</div>
```

视觉：slide-left 从右侧 40px 推入，slide-right 从左侧 40px 推入。像抽屉被拉出来。

---

### fly-in — 方向飞入

配合 `data-anim-from` 指定飞行方向。适合指标从屏幕边缘飞入。

```html
<div data-anim="fly-in" data-anim-from="left">挑战</div>
<div data-anim="fly-in" data-anim-from="right">方案</div>
<div data-anim="fly-in" data-anim-from="top">顶部指标</div>
<div data-anim="fly-in" data-anim-from="bottom">底部数据</div>
```

视觉：从指定方向 40px 外飞入 + 淡入。像弹幕/飞行文字效果。

> `data-anim-from="center"` 会变成缩放入场（scale 0.9→1），不做位移。

---

### wipe — 擦除显现

配合 `data-anim-from` 指定擦除方向。适合进度条、时间线段、横幅。

```html
<div data-anim="wipe" data-anim-from="left">进度 75%</div>
<div data-anim="wipe" data-anim-from="right">反向揭示</div>
<div data-anim="wipe" data-anim-from="top">从顶部展开</div>
<div data-anim="wipe" data-anim-from="bottom">从底部展开</div>
```

视觉：clip-path 从一侧裁切区域逐渐展开到全部可见。像幕布被拉开。

---

### zoom-in — 强力缩放

从 75% 放大到 100% + 淡入，视觉冲击最大。适合英雄数字、关键指标。

```html
<div data-anim="zoom-in" data-anim-duration="800">
  <p class="text-5xl font-bold">42%</p>
  <p class="text-lg text-gray-500">市场增长率</p>
</div>
```

视觉：从远到近快速放大 + 淡入。像电影里的"推镜头"。

---

### spin-in — 旋转缩放

旋转 -12° + 缩放 92%→100% + 淡入。有趣但不宜多用。

```html
<div data-anim="spin-in" data-anim-duration="600">🎯 目标达成</div>
```

视觉：微微旋转着放大到位。像陀螺停下来的感觉。

---

### path — 路径运动

沿线性路径移动，适合图示流动、箭头动画。

```html
<div data-anim="path" data-anim-path="M 0 0 L 120 30">→ 流向目标</div>
<div data-anim="path" data-anim-path="M 0 0 L -80 -60">↖ 回溯</div>
<div data-anim="path" data-anim-path="M 0 0 L 0 -150">↑ 上升</div>
```

视觉：沿指定直线方向平移。`M 0 0 L 120 30` 表示向右 120px、向下 30px。

> 路径格式只支持 `M x y L dx dy`，不支持曲线。小数也可以：`M 0 0 L 12.5 3.25`。

---

## 强调动画（元素已在屏幕上）

强调动画不会改变元素的可见性，只是让它"动一下"吸引注意。播放后元素回到原位。

### pulse-soft — 极轻柔脉冲

几乎察觉不到的缩放（1→1.03→1），适合 KPI 数字打磨、低调提示。

```html
<div data-anim="pulse-soft" data-anim-duration="600">
  <p class="text-2xl font-semibold">99.9%</p>
  <p class="text-lg text-gray-500">可用性</p>
</div>
```

视觉：微微鼓起一点点然后复原，不仔细看几乎感觉不到。

---

### pulse — 标准脉冲

缩放 1→1.06→1，适合关键指标、需要温和但明确关注的内容。

```html
<div data-anim="pulse" data-anim-duration="600">
  <p class="text-xl font-bold text-red-600">关键风险</p>
  <p class="text-lg">Q3 前需行动</p>
</div>
```

视觉：轻轻鼓起再缩回，像心跳一下。

---

### pulse-strong — 强脉冲

缩放 1→1.10→1，视觉上明显放大。适合紧急告警、需立即关注的内容。

```html
<div data-anim="pulse-strong" data-anim-trigger="click">
  <p class="text-xl font-bold text-red-700">⚠ 紧急</p>
</div>
```

视觉：明显放大再弹回，像被戳了一下。配合 click 触发效果更好。

---

### grow-shrink-soft — 温和缩放

先缩小到 0.95，再放大到 1.04，回到 1。像"深呼吸一下"的感觉。

```html
<div data-anim="grow-shrink-soft" data-anim-duration="800">确认提交</div>
```

视觉：先微缩再微扩再复原，有呼吸感。

---

### grow-shrink — 标准缩放

先缩小到 0.9，再放大到 1.08，回到 1。比 grow-shrink-soft 明显。

```html
<div data-anim="grow-shrink" data-anim-duration="800">重要提醒</div>
```

视觉：先缩小再放大再复原，像弹簧压下去再弹回来。

---

### grow-shrink-strong — 强力缩放

先缩小到 0.85，再放大到 1.12，回到 1。视觉冲击最强的强调动画。

```html
<div data-anim="grow-shrink-strong" data-anim-duration="900">
  <p class="text-3xl font-bold">里程碑达成！</p>
</div>
```

视觉：大幅缩小再大幅放大再复原，很有戏剧感。慎用，一页最多一处。

---

## 退场动画（元素离开）

### exit-fade — 淡出

最安静的离场方式。

```html
<div data-anim="exit-fade" data-anim-duration="400">旧内容消失</div>
```

视觉：从可见渐变到透明。像画面慢慢隐去。

---

### exit-scale — 缩小淡出

温和的缩放离场（scale 1→0.85 + fade out），适合低调移除次要元素。

```html
<div data-anim="exit-scale">已完成项</div>
```

视觉：微微缩小 + 淡出。像一张卡片悄悄收起。

---

### exit-zoom — 强缩放离场

强力缩放离场（scale 1→0.75 + fade out），戏剧感强。

```html
<div data-anim="exit-zoom" data-anim-duration="600">主角退场</div>
```

视觉：大幅缩小 + 淡出。像镜头急速拉远。

---

### exit-wipe — 擦除退场

配合 `data-anim-from` 指定擦除方向。适合横幅消失、进度条归零。

```html
<div data-anim="exit-wipe" data-anim-from="left">横幅消失</div>
<div data-anim="exit-wipe" data-anim-from="right">向右擦除</div>
```

视觉：clip-path 从可见逐渐裁切到隐藏。像幕布合上。

---

### exit-fly — 飞出

配合 `data-anim-from` 指定飞出方向。

```html
<div data-anim="exit-fly" data-anim-from="left">向左飞出</div>
<div data-anim="exit-fly" data-anim-from="right">向右飞出</div>
<div data-anim="exit-fly" data-anim-from="top">向上飞出</div>
<div data-anim="exit-fly" data-anim-from="bottom">向下飞出</div>
```

视觉：沿指定方向飞出屏幕 + 淡出。像弹幕飞走。

---

## 组合模式

### 交错卡片阵列

多张卡片依次入场，每张间隔 90ms。

```html
<div class="grid grid-cols-3 gap-4">
  <div data-anim="fade-up" data-anim-stagger="90">
    <p class="text-3xl font-bold">$12M</p>
    <p class="text-lg text-gray-500">营收</p>
  </div>
  <div data-anim="fade-up" data-anim-stagger="90">
    <p class="text-3xl font-bold">86%</p>
    <p class="text-lg text-gray-500">留存</p>
  </div>
  <div data-anim="fade-up" data-anim-stagger="90">
    <p class="text-3xl font-bold">2.4x</p>
    <p class="text-lg text-gray-500">ROI</p>
  </div>
</div>
```

交错节奏参考：
- 60–80ms：紧凑、有活力（适合指标卡、小卡片）
- 90–120ms：舒适、从容（适合列表项、步骤）
- 150–200ms：戏剧、缓慢（适合关键论点、章节段落）

---

### 标题 + 内容 序列

标题先入场，辅助内容同时出现（with），证据卡片在标题完成后出现（after）。

```html
<h2 data-anim="fade-up" data-anim-duration="600">核心洞察</h2>
<p data-anim="fade" data-anim-sequence="with" data-anim-delay="80" data-anim-duration="500">
  辅助说明随标题一同出现
</p>
<div data-anim="fade-up" data-anim-sequence="after" data-anim-duration="500">
  证据卡片在标题完成后出现
</div>
```

---

### 对比飞入

左右两栏分别从两侧飞入。

```html
<div class="grid grid-cols-2 gap-6">
  <div data-anim="fly-in" data-anim-from="left">
    <h3>挑战</h3>
    <p>传统方法力不从心</p>
  </div>
  <div data-anim="fly-in" data-anim-from="right">
    <h3>方案</h3>
    <p>我们直接解决了这个问题</p>
  </div>
</div>
```

---

### 英雄数字 + 支撑卡片

大数字用 zoom-in 强调，小卡片用 fade-up 交错入场。

```html
<div class="flex flex-col gap-6">
  <div data-anim="zoom-in" data-anim-duration="800">
    <p class="text-5xl font-bold">42%</p>
    <p class="text-lg text-gray-500">市场增长</p>
  </div>
  <div class="grid grid-cols-3 gap-4">
    <div data-anim="fade-up" data-anim-stagger="80">卡片 1</div>
    <div data-anim="fade-up" data-anim-stagger="80">卡片 2</div>
    <div data-anim="fade-up" data-anim-stagger="80">卡片 3</div>
  </div>
</div>
```

---

### 点击分步揭示

用 click 触发一步一步展示内容，适合演讲演示。

```html
<div data-anim="fade-up" data-anim-trigger="click" data-anim-click-group="step-1">
  第一步：发现问题
</div>
<div data-anim="pulse-soft" data-anim-trigger="click" data-anim-click-group="step-1">
  关键指标
</div>
<div data-anim="fade-up" data-anim-trigger="click">
  第二步：分析原因
</div>
<div data-anim="fade-up" data-anim-trigger="click">
  第三步：执行方案
</div>
```

- `click-group="step-1"`：两个元素在同一次点击时一起出现
- 后续无 click-group 的元素各占一次点击

---

### 强调 + 确认

先标记风险（pulse），再确认应对（grow-shrink-soft）。

```html
<div data-anim="pulse" data-anim-duration="600">
  <p class="text-xl font-bold text-red-600">风险提示</p>
</div>
<div data-anim="grow-shrink-soft" data-anim-duration="800">
  <p class="text-lg text-green-600">已有应对方案</p>
</div>
```

---

### 入场 → 强调 → 退场 完整生命周期

一个元素先入场、后强调、最后退场。

```html
<div data-anim="fade-up" data-anim-duration="500">
  <p>临时通知</p>
</div>
<div data-anim="pulse-strong" data-anim-trigger="click" data-anim-click-group="notice">
  <p>临时通知</p>
</div>
<div data-anim="exit-fade" data-anim-trigger="click" data-anim-duration="300">
  <p>临时通知</p>
</div>
```

---

## 提示词复制模板

以下是直接可用的提示词，在生成幻灯片时粘贴到指令中：

### 模板 1：标准商务汇报

```
给所有卡片加 fade-up 入场动画，交错 100ms。标题用 zoom-in 800ms。关键指标用 pulse 强调。
```

### 模板 2：数据仪表盘

```
指标卡片用 fly-in from bottom，交错 80ms。大数字用 zoom-in 800ms 强调。
低于预期的指标用 pulse-strong 标红提醒。进度条用 wipe from left。
```

### 模板 3：对比分析

```
左侧用 fly-in from left，右侧用 fly-in from right，同时入场形成对比。
核心差异用 grow-shrink 强调。总结用 scale-in 入场。
```

### 模板 4：逐步演示

```
所有要点用 click 触发，每点 fade-up 入场。
同一组的相关元素用 click-group 合并到同一次点击。
最后结论用 zoom-in + pulse-strong 组合强调。
```

### 模板 5：温和叙述

```
标题用 fade-up 600ms，正文用 fade 入场。
段落之间用 data-anim-sequence="after" 形成自然阅读节奏。
关键词用 pulse-soft 轻柔提示。
```

### 模板 6：戏剧性发布

```
主数字用 zoom-in 800ms 入场后接 pulse-strong 强调。
支撑论据用 slide-up 交错 120ms。
旧数据用 exit-scale 退场，新数据用 fly-in from bottom 入场。
```

### 模板 7：流程图示

```
流程节点沿路径入场：用 path 动画，每个节点从上一个节点方向滑入。
关键节点用 grow-shrink 强调。完成节点用 exit-fade 淡出。
箭头用 wipe from left 表示方向。
```

---

## 动画选择速查表

| 我想让元素… | 选这个 | 理由 |
|---|---|---|
| 安静地出现 | `fade` | 不动，只淡入 |
| 从下方浮起 | `fade-up` | 最通用，卡片/标题默认 |
| 大幅推入 | `slide-up` | 比 fade-up 力度大一倍 |
| 从特定方向飞入 | `fly-in` + `from` | 方向感强，适合指标 |
| 幕布般揭开 | `wipe` + `from` | 适合进度条、横幅 |
| 从远到近放大 | `zoom-in` | 英雄数字、关键数据 |
| 微妙缩放 | `scale-in` | 比 zoom-in 温和 |
| 转着圈进来 | `spin-in` | 有趣但别多用 |
| 沿指定路线移动 | `path` | 流程图、箭头 |
| 轻轻鼓一下 | `pulse-soft` | 几乎感觉不到 |
| 心跳一下 | `pulse` | 温和但明确的强调 |
| 被戳一下 | `pulse-strong` | 紧急告警 |
| 深呼吸 | `grow-shrink-soft` | 先缩再扩再复原 |
| 弹簧压放 | `grow-shrink` | 比 soft 明显 |
| 大幅弹跳 | `grow-shrink-strong` | 最戏剧化的强调 |
| 安静地消失 | `exit-fade` | 淡出 |
| 缩小消失 | `exit-scale` | 温和离场 |
| 急速缩小消失 | `exit-zoom` | 强烈离场 |
| 被擦除 | `exit-wipe` + `from` | 幕布合上 |
| 飞走 | `exit-fly` + `from` | 弹幕式离场 |
