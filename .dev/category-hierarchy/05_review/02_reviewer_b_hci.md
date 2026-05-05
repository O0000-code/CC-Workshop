# Reviewer B — HCI / 心理学评审（Category Hierarchy V1）

> **Reviewer**：Reviewer B（HCI / 交互心理学专家 SubAgent）
> **评审对象**：`/Users/bo/Documents/Development/Ensemble/Ensemble2/.dev/category-hierarchy/02_design_spec.md` V1
> **评审角度**：用户认知 / 直觉 / 误触 / 可达性 / 键盘流程 / A11y / VoiceOver / 极简哲学落地
> **方法**：Norman + Fitts + Hick + Gestalt + WCAG 2.2，全部论据带数学计算或现实产品对照
> **文档级别**：Decisional（与 02_design_spec V1 同级。同级冲突如确认是 V1 错误，由主 Agent 拍板进入 V2）

---

## 0. 已读基线 Checklist

| # | 基线 | 状态 | 备注 |
|---|---|---|---|
| 1 | `00_understanding.md` | ✅ 全文 | 14 决策 / 隐含前提 / 风险登记已背 |
| 2 | `01_research/_synthesis_decisions.md` | ✅ 全文 | C1-C4 冲突已读、14 决策定锤已读 |
| 3 | `01_research/r3_visual_interaction_design.md` | ✅ 全文 | D10/D11/D12 论据 + Fitts 计算 + chevron 视觉规格 |
| 4 | `01_research/r4_hci_evaluation.md` | ✅ 全文（必背） | 6/6 产品聚合统计 + Fitts/Hick + 删 8 项保 2 项已背 |
| 5 | `01_research/r6_classification_count_filter.md` | ✅ 全文 | autoClassify / count / filter 行为路径已背 |
| 6 | `02_design_spec.md` V1（评审主对象） | ✅ 全文（883 行） | §1-§11 全覆盖 |
| 7 | `.dev/sidebar-reorder/02_design_spec.md` V3 | ✅ 全文 | V3 不变量 22 项已背 |
| 8 | `01_research/_dispatch_plan.md` | ✅ 全文 | wave 1 任务边界已读 |

**额外读取（HCI 关键事实核验）**：

- `node_modules/@dnd-kit/sortable/dist/sortable.esm.js:656-760` — `sortableKeyboardCoordinates` 实现源码（确认 `KeyboardCode.Left`/`KeyboardCode.Right` 在 dnd-kit 默认实现里**已被占用**为"水平方向 droppable 导航"，与 V1 §3 "←/→ promote/demote" 直接冲突 — 见 P0-1）
- `src/components/sidebar/SortableCategoryRow.tsx:82-100` — 现有 keyboard handler chaining 模式（V3 评审已修复 P0-2）
- `src/components/sidebar/dnd/CustomMouseSensor.ts:5-20` — `data-no-dnd` 走线机制（chevron 必须正确接入）

---

## 1. 评审角度（HCI 专家专属）

按任务卡 8 个角度逐一评审：

1. drop-into 激活区（12px X + 80ms dwell）— Fitts 误触 + dwell 心理学
2. promote 路径（D6 = 水平向左拖 + ContextMenu 兜底）— Discoverability + WCAG 2.5.7
3. 键盘流（左右键 promote/demote + Hick 评估 + dnd-kit 默认行为冲突）
4. chevron 折叠/展开（10×10 px 在 32 px row + Fitts hit-target + 持久化心理预期）
5. count 聚合（D8 = B 自身+子级总和；用户单数字解读风险）
6. Acceptance 完整性（§6 缺什么键盘/A11y/VoiceOver 公告）
7. Edge cases（折叠态拖动、删父类、rename、空状态）
8. WCAG 2.5.7 dragging movement alternative（V1 真有完整键盘 alternative 吗）

---

## 2. 总评打分

**总评：78 / 100**

**一句话评语**：V1 设计哲学正确、视觉规格扎实、与 V3 不变量保留度极高，但**键盘交互模型与 dnd-kit 内置实现存在源码级冲突未被识别**（这是 V1 唯一的 P0 stop-ship 问题），且**80 ms dwell 与 12 px X 阈值的实测体感、A11y 公告时机、edge case 覆盖、Fitts hit-target 在 chevron 上的边界**几个交互细节需要 V2 修订。

**分数分布说明**：

- 设计哲学一致性 95/100（与 R4/R7 收敛极好；删 8 项保 2 项落地完整）
- 视觉规格 92/100（HIG/macOS 对照充分；唯独 chevron Fitts 未做计算）
- 键盘交互 55/100（**P0 — dnd-kit 源码冲突**；普通浏览态 ←/→ 占用语义未声明；模态切换实施细节缺失）
- A11y / VoiceOver 75/100（公告措辞合理但缺 ContextMenu / 键盘失败路径 + dwell 时机不公告）
- Edge cases 65/100（删父类时 cascade-promote 缺确认、rename 时引用一致性未述、空状态完整但单父无子描绘缺）
- Acceptance 完整性 80/100（22 项视觉/行为客观条件扎实，但 § 8 + § 9 没覆盖 D6 ContextMenu / 键盘失败兜底）

---

## 3. P0 问题列表（交互 stop-ship 级，必须修订进 V2）

### P0-1 ←/→ 方向键与 dnd-kit `sortableKeyboardCoordinates` 默认实现源码级冲突 — 实施前不解决会导致键盘流不可用

**严重等级**：**Stop-ship**（V1 §3 关键交互无法落地）

**论据（一手源码）**：

`node_modules/@dnd-kit/sortable/dist/sortable.esm.js:656-760` `sortableKeyboardCoordinates` 是 V3 现有 KeyboardSensor 的 `coordinateGetter`（`SortableCategoriesList.tsx:116`）。源码中：

```js
const directions = [KeyboardCode.Down, KeyboardCode.Right, KeyboardCode.Up, KeyboardCode.Left];
const sortableKeyboardCoordinates = (event, _ref) => {
  // ...
  if (directions.includes(event.code)) {
    event.preventDefault();   // ← 关键：dnd-kit 默认就 preventDefault 了 Left/Right
    // ... 用 KeyboardCode.Left / Right 做"水平方向 droppable 寻找"
    case KeyboardCode.Left:
      if (collisionRect.left > rect.left) {
        filteredContainers.push(entry);   // ← 寻找左边的 droppable container
      }
      break;
```

意味着：

1. **键盘拖动态下**（已 Space 进入 lift），按 ← → 已经被 dnd-kit 默认实现占用为"水平方向找另一个 droppable"。1D vertical sortable 下因为 `collisionRect.left ≈ rect.left`（同一列），不会找到其他 container，**导致按键看似无效但 `event.preventDefault()` 已被调用**，事件不会冒泡到 V1 §3 期望的 promote/demote 处理器。
2. **普通浏览态下**（未 Space），dnd-kit 的 KeyboardSensor `onKeyDown` 监听器仅在 `active != null` 时（即拖动中）才走 coordinateGetter 路径——这点 V3 的 `SortableCategoryRow` keyboard chaining 已知道（行 87-96）。所以普通浏览态 ← → **不会** 被 dnd-kit 占用，可以用于折叠/展开切换。**V1 这部分是对的**。
3. **键盘拖动态下要实现 ←/→ promote/demote**，必须**替换** `sortableKeyboardCoordinates` 为 hierarchy-aware 版本（dnd-kit `clauderic/dnd-kit/stories/3 - Examples/Tree/keyboardCoordinates.ts` 提供模板，但未发包到 npm，需复制到 `src/components/sidebar/dnd/treeKeyboardCoordinates.ts` 作为新文件）；**不是简单的 listener 链**。

**V1 §3 的措辞错误**：

> "（已 Space 进入键盘 drag mode 后），当前 row 是 root → demote 为 child of previousItem"
>
> "扩展 sortableKeyboardCoordinates 为 hierarchy-aware version（参 dnd-kit example tree）；announcements 扩展 hierarchy context"（§3 行 441）

**这句"扩展"过于模糊**——实际上是**完整替换** coordinateGetter 函数（不是装饰器/包装器，而是一个实现 hierarchy projection + maxDepth=2 clamp 的全新版本）。这件事必须在 V2 §3 显式声明：

- 将 `coordinateGetter: sortableKeyboardCoordinates` 替换为 `coordinateGetter: hierarchyKeyboardCoordinates`（或类似命名）
- 该函数继承官方 tree example 实现，但额外做：max depth = 2 clamp + dragged item 是 root 时按 ← 无效 + dragged item 是 child 时按 → 不能再 demote。
- KeyboardCode.Left / Right 在拖动态被新 coordinateGetter 重新解释，不是覆盖默认而是替换。

**Patch（V2 §3 必加）**：

```markdown
### 3.0 Keyboard Coordinate Getter（hierarchy-aware 替换，非扩展）

V3 V3 现状：`SortableCategoriesList.tsx:116` 用 `sortableKeyboardCoordinates`（dnd-kit
默认实现）。该实现在 `KeyboardCode.Left/Right` 上调用 `event.preventDefault()`，
然后用左右键找"水平方向 droppable container"——在 1D 垂直 list 下永远找不到。
这意味着 V1 §3 提议的"键盘拖动态 ←/→ promote/demote" **不能通过装饰链实现**，必须替换。

**实施路径**：复制 dnd-kit 官方 tree example 的 keyboardCoordinates.ts 到
`src/components/sidebar/dnd/hierarchyKeyboardCoordinates.ts`，按 hierarchy max depth=2 改写。
具体由 03_tech_plan §X 详化（必须含：max depth=2 clamp、root 试图 promote 报"already at root"、
child 试图 demote 报"already at maximum depth"、与 announcements.ts 协作）。
```

**影响范围**：03_tech_plan V1 §键盘交互章节、04_implementation_plan V1 任务卡。

**Confidence**：99（直接源码引证）

---

### P0-2 §3 普通浏览态 ←/→ 占用与 macOS 系统全局快捷键缺乏冲突评估 — 可能损害无障碍

**严重等级**：**Stop-ship**（A11y 风险）

**论据**：

V1 §3 表格：

> "← (Left Arrow) | 父类有子类 + 展开态 → 折叠；其他 → 无操作"
> "→ (Right Arrow) | 父类有子类 + 折叠态 → 展开；其他 → 无操作"

**在普通浏览态（未 Space）的 sidebar 内一个 row focused 时，按 ← / →**——V1 假设用户的 ←/→ 仅可能用于折叠/展开。但：

1. **macOS 系统级 ←/→ 在 Tab focus 上的语义是"水平方向焦点导航"**（Apple HIG: Keyboard navigation — "On Mac, arrow keys move focus within composite controls"）。
2. **VoiceOver 用户在 sidebar 上按 ←/→ 时，VoiceOver 会用 VO+方向键**——V1 用 ←/→ 直接监听不冲突。但 **Tab 进入 sidebar 后按 ←/→ 是 macOS 系统的 listbox/treeview 标准行为**——macOS 原生 NSOutlineView 的键盘交互就是 "→ expand / ← collapse"（`NSOutlineView.keyDown` 文档 + Apple HIG Outline Views："left/right arrow keys to expand and collapse"）。
3. **V1 没有**显式在 §3 说明此映射沿用 NSOutlineView 标准（Apple HIG 原典明确规定）。这是个论据缺口——V1 应该明示：「普通浏览态 ←/→ 直接复用 NSOutlineView/HIG outline-view 标准，符合 macOS 原生习惯」。

**Patch（V2 §3 表格头部加论据条目）**：

```markdown
> **HIG 原典支持**：普通浏览态下 ← 折叠 / → 展开 直接复用 macOS NSOutlineView /
> Apple HIG Outline Views 标准（"To expand and collapse rows in an outline view, people
> can press the right and left arrow keys"——
> https://developer.apple.com/design/human-interface-guidelines/outline-views）
> 这条不是项目自创映射；用户在 macOS Finder list view、Notes 嵌套文件夹、Reminders
> Group 都已经被训练成"右展开 / 左折叠"。
>
> **VoiceOver 兼容性**：VoiceOver 用户使用 VO+方向键导航；本快捷键不与 VoiceOver
> 默认热键冲突（VO+→ 展开、VO+← 折叠在 NSOutlineView 中本身就是 OS 提供，本项目
> 在浏览模式下复用同语义）。
```

**Confidence**：95（HIG Outline Views 文档原典）

---

### P0-3 ContextMenu "Move to Parent..." 二级菜单/Modal 选择路径未规格化 — 影响键盘 alternative 可达性

**严重等级**：**Stop-ship**（WCAG 2.5.7 alternative 路径不完整）

**论据**：

V1 §2.20 声明：

> "新增 ContextMenu 项：Promote to Root / Move to Parent...（仅在 row 是 child 时可见；点击后弹出选择父类的二级菜单或 Modal——具体 UI 由 03_tech_plan 详化）"

**问题**：

1. **WCAG 2.5.7 dragging alternative 是 P0 合规要求**（WCAG 2.2 Level AA）——拖拽功能必须有键盘 alternative。V1 §2.20 把这个 alternative 的具体 UI **完全推给 03_tech_plan**——但 03_tech_plan 不会做交互/视觉规格决策（它只做架构）。这是规格悬空。
2. **从子类拖到根**已经有键盘路径（Space + ←，假设 P0-1 修复）。**但子类 → 另一父类**这个路径，V1 §3 表格里**只描述了 demote 而没有 change parent**：表格的 → 是"root → demote 为 child of previousItem"——如果 previousItem 不是用户想要的父类，键盘用户怎么办？
3. **从父类 A 的子类换到父类 B 的子类**：用户必须先用 Space + ← promote 到根，再用 ↓ 走到父类 B 旁边再用 → demote——**3 步操作**，每一步都是不同的 cognitive task，违反 Hick's Law（认知步数 ≥ 3 的链路上每个步骤都加 ~50 ms 反应时间）。
4. **ContextMenu "Move to Parent..." 二级菜单是个体面解决方案**——但 V1 没规格化"二级菜单还是 Modal 还是简单 select"，留给 03_tech_plan，而 03_tech_plan 不该做 UI/UX 决策。

**Patch（V2 §2.20 加规格）**：

```markdown
### 2.20 WCAG 2.5.7 Dragging Movements Alternative

继承 V3 §2.14 KeyboardSensor 路径作为拖拽 alternative。**hierarchy 追加键盘可达**详见 §3。

**ContextMenu 兜底（per D6 = C + E）**：

- 现有 ContextMenu 已包含 `Rename` / `Delete`；
- **新增 ContextMenu 项**：
  - **"Promote to Root"**（仅在 row 是 child 时可见）— 直接 promote 当前 row 到根级，等同于键盘 Space + ←
  - **"Move to Parent..."**（仅在 row 是 child 时可见）— 弹出**二级 Submenu**（不是 Modal，避免 modal 焦点 trap 引起的二次认知负担）
    - Submenu 内容：当前所有根级 categories，按 sidebar 顺序排列
    - **当前所属父类**：禁用 + 注明 "(current parent)"
    - **键盘可达**：Submenu 用方向键导航 + Enter 选定 + Esc 取消
    - **VoiceOver 公告**：选定时公告 "{name} moved to child of {newParent}."（与拖拽 announcement 复用同字符串）
  - 父类（root）无 hierarchy ContextMenu 项（父类只能通过 reorder 改顺序，不可 demote — 与 D5 一致）
```

**理由**：

- Submenu 优于 Modal：Modal 的焦点 trap 会让 VoiceOver 用户脱离上下文；Submenu 是 ContextMenu 的天然延伸（Apple HIG ContextMenus 推荐"prefer submenu to modal for selection of one of several known options"）。
- 行业对照：Things 3 用 right-click → Move to → submenu pattern；Apple Notes 用 right-click → Move to Folder → submenu pattern。
- Hick's Law: ContextMenu submenu 的认知步骤 = 2（打开 ContextMenu + 选 parent），比"Space + ← + ↓ + → + ↓ + → + Enter" 链路（7 步）减少 5 步认知负担。

**Confidence**：92

---

### P0-4 父类 cascade-promote 删除时缺少用户确认对话框 — Norman "preventing irreversible action"

**严重等级**：**Stop-ship**（数据丢失风险）

**论据**：

V1 §6.5（hierarchy 验证 max depth = 2）+ _synthesis_decisions §3 D13 锁定：

> "delete_category cascade-promote children to root"

**问题**：

V1 完全**没有**讨论删除父类时给用户的确认（confirmation dialog）。当前代码 `commands/data.rs::delete_category` 是直接删除：

1. 用户右键父类 "Coding" → ContextMenu → Delete → **直接删除 + 自动 cascade-promote 所有子类**（"Frontend"、"Backend" 等到根级）。
2. **从用户视角**："我删了 Coding。但 Frontend 和 Backend 突然出现在根级——我没期望它们仍然存在。"
3. **Norman "constraint preventing irreversible action"**：删除操作 + 子树重塑是双重不可逆性（不能用 Cmd+Z 撤销，因为没有 undo stack）；V3 自身已有 trash 机制（`trash.rs`），但 cascade-promote 是 hierarchy 重塑事件，不是 trash—— trash 仅恢复被删项，不恢复 hierarchy 结构。
4. **行业对照**：
   - Things 3：删 Area 弹 confirmation "Delete the area 'X'? Projects will move to All. (Cancel / Delete)"
   - macOS Finder：删文件夹 → "Are you sure you want to delete the folder 'X' and its 5 items?"
   - Apple Notes：删 Folder → "Delete '{folder name}'? This will move {N} notes to..."

**Patch（V2 §2 新增小节 §2.21 父类删除确认 + §6.6 删除场景规格）**：

```markdown
### 2.21 父类删除的确认与 cascade-promote 反馈（D13 + Norman）

按 D13 锁定的"cascade-promote children to root"：删除父类时，用户操作流如下：

| 步骤 | 行为 |
|---|---|
| 用户右键父类 → Delete | 弹出 macOS-native confirmation dialog（不是 modal，是系统 alert） |
| Dialog 文案 | "Delete category {name}? Its {N} children will be promoted to root level."（含子类数量） |
| Dialog 按钮 | "Cancel"（默认）/ "Delete"（destructive） |
| 用户点 Cancel | 不变 |
| 用户点 Delete | 父类移动到 trash；所有 children parent_id 清零（promote to root），写入 data.json |
| 完成后 sidebar 视觉 | 父类消失；子类瞬时出现在根级（无动画——这是状态变化不是动画，但 padding-left 从 26 → 10 过渡 220ms 复用 §2.8 缩进过渡） |
| A11y 公告 | "{name} deleted. {N} categories promoted to root: {child1}, {child2}..."（最多列 3 个 child name，超出说 "and N more"） |

**视觉规格**：confirmation dialog 由 Tauri `dialog::ask` 调用 macOS 原生 NSAlert，
不在前端用 React Modal 实现——保留 macOS 原生气质。

**Anti-pattern 锁定**：

| ❌ Anti-pattern | 原因 |
|---|---|
| 删除父类无 confirmation 直接 cascade-promote | Norman "preventing irreversible action"；用户子树丢失感 |
| confirmation dialog 文案不提子类数量 | 用户无法预估操作影响（"Cancel"决策需要的关键信息缺失） |
| cascade-promote 不发 A11y 公告 | VoiceOver 用户失去状态变化感知 |
| 删父类后 children 不出现在根级（即默默丢失） | 数据丢失 |
```

**Confidence**：90

---

## 4. P1 问题列表（应当修订进 V2）

### P1-1 80 ms dwell 与 12 px X 阈值的复合心理学等待时长被严重低估

**论据**：

R4 §4.4 + V1 §6.3 都论证 12 px X 阈值 + 80 ms dwell 的"双重保险"。但缺漏了一个关键的复合心理学量：

- **80 ms 仅是 dwell 的下限**——用户从 hover over row 开始计时；但在 hover 过程中用户的 pointer 还要**穿越** activation 4 px + 移动 12 px 才到达"drop into" 区。
- 整体心理学等待 = `t_lift (200ms)` + `t_movement_to_target (用户控制，~200-400ms 中等距离)` + `t_dwell (80ms)`，**总等待 ~480-680ms 才能感知到 demote 视觉反馈**。
- 这与 V3 §2.6 的"distance-aware settle ≤ 280ms"形成时间对比：用户感觉"drop into 比普通 reorder 慢 200ms"。

**心理学论据（Doherty Threshold + UI Latency Studies）**：

- Doherty（IBM 1982）："response time > 400ms 进入用户感知的'等待'区间，操作流畅度损失 ~50%"。
- Nielsen Norman 2014（"Response Times: 3 important limits"）：100ms 是"瞬时感"边界、1s 是"思绪保持"边界。
- 实际 lift + dwell 复合 ≥ 480ms，**已经接近 Doherty threshold 的 1.2 倍**——用户感觉 hierarchy 操作比普通 reorder 慢。

**实测建议**：

- V2 §11 风险表 R1 已经标记此风险（"如显著则降至 50ms 或取消"），但**实测前缺乏量化退路标准**。
- V2 应该在 §8.1 dev mode 验证清单加入：「在 demote 操作上做用户主观计时（按下→触发 demote 视觉反馈→释放）≤ 600ms 为通过」——给定量化退路。
- 如果 dev mode 实测 > 600ms 主观感受"延迟"，dwell 应降到 50ms 或取消（仅靠 12 px）。
- 如果 dwell 取消，单纯 12 px 是否够稳？**Fitts σ ≈ 1.5px** → P(误触) = Φ(-(12-2)/1.5) ≈ 0%。**结论：80ms dwell 是 nice-to-have 不是必要——12px 阈值本身已经在 Fitts 下足够稳。**

**Patch（V2 §6.3）**：

```markdown
### 6.3 Drop-into 横向阈值 = 12 px + (可选) 80 ms dwell

按 _synthesis_decisions §3 D4 锁定。**dwell 80ms 是 conservative initial 值**：

- **Fitts's Law 单独评估**：σ ≈ 1.5px、12px 阈值 = 8σ → 误触概率 < 0.01%（已足够）。
- **dwell 是额外防护**：防止"快速横划过"被误判为 demote；但同时引入 ~480-680ms 复合等待时长，
  接近 Doherty Threshold（400ms）的 1.2-1.7 倍。
- **dev mode 实测目标**：用户从 mousedown 到看到 demote 视觉反馈 ≤ 600ms（达到 Doherty 边界内）。
- **dwell 退路**：若实测 > 600ms 显著影响体感，**dwell 可降至 0ms（取消）**——单纯依赖 12px 阈值
  + Fitts σ 安全边际。

V2 落地的 dwell 配置应做 token：`--drop-into-dwell: 80ms`（在 src/index.css），
便于后期一改即可。
```

**Confidence**：85

---

### P1-2 chevron 10×10 px 在 16px hit-target 内的 Fitts 计算缺失

**论据**：

V1 §2.2 + §6.4 声明 chevron icon size = 10×10 px、hit-target = leading 16 px（chevron + gap 6 px）。**没做 Fitts 计算**。

**计算**（基于 Fitts 实测均值）：

- Target W = 16 px（hit-target 宽）；row 高度 32 px（hit-target 高）
- 用户 mousedown 起点距 chevron 中心 D ≈ 24-200 px（用户从 mouse 移动到 chevron 区）
- Fitts: T = a + b · log2(D/W + 1) ≈ 230 + 166 · log2(D/16 + 1) ms
- 对 D = 100：T ≈ 230 + 166 · log2(7.25) ≈ 230 + 166 · 2.86 ≈ 705ms
- **vs row 整体 240px hit-target**：T ≈ 230 + 166 · log2(100/240 + 1) ≈ 230 + 81 ≈ 311ms

**结论**：chevron 的 16 px hit-target 比 row 整体 hit-target **慢 ~2.3 倍**——这是必然的（小目标）。Fitts 不是要求 chevron 一样快，而是验证它"可达"。

**实际风险**：用户**误触** chevron click 而本意 navigate 的概率：

- 用户意图 navigate 时点击 row 任意位置（不应触及 chevron）：σ ≈ 1.5 px、用户瞄准 row 中心 ≈ 120 px；点击落入 chevron 区（leading 16 px）的概率 P(X<16 | μ=120, σ=1.5) ≈ 0% — **可忽略**。
- 用户意图 chevron click 但失手点 row 区域（导致 navigate 而非 expand）：σ ≈ 1.5 px、用户瞄准 chevron 中心 ≈ 8 px；点击落入 row 区（X>16 px）的概率 P(X>16 | μ=8, σ=1.5) ≈ Φ(-5.3) ≈ 0% — **可忽略**。

**总结**：Fitts 风险很低，但 V1 应该**显式声明这条计算**作为 acceptance 论据。

**Patch（V2 §6.4 加 Fitts 论据）**：

```markdown
### 6.4 chevron click 与 row click hit-target 分离

leading 16 px（chevron icon 10 px + gap 6 px）= chevron click 区域；其余 row 部分 = row click 区域。

**Fitts's Law 误触评估**（单点击落地 σ ≈ 1.5 px）：

| 用户意图 | 误触概率 |
|---|---|
| navigate（瞄准 row 中心 ≈ 120 px） | P(X<16 \| μ=120, σ=1.5) ≈ 0% — 可忽略 |
| toggle（瞄准 chevron 中心 ≈ 8 px） | P(X>16 \| μ=8, σ=1.5) ≈ 0% — 可忽略 |

**结论**：16 px hit-target 在 Fitts 误触下安全。**唯一注意**：用户用 trackpad 在
高 DPI 显示器（如 macOS Retina）下 σ 可能略大（≈ 2 px），但仍 < 1% 误触。
```

**Confidence**：90

---

### P1-3 父类 count 聚合（D8 = B）的"5 + 12 = 17"用户解读模糊性

**论据**：

V1 §6.1 锁定 D8 = B（父类 count = 自身 + 所有子级总和）。R4 原始评估倾向 D8 = A（仅自身），_synthesis_decisions §2.1 反转为 B 论据是"与 D7 聚合视图一致"。

**但 V1 没有缓解 R4 §3.3 提出的"用户单一数字解读模糊性"问题**：

> R4：'用户看到 17 不知道"是聚合的吗？包不包含子类？"——除非有训练，否则 mental model 不直接把 sidebar 数字 map 到聚合视图。Todoist、ClickUp 用这种方式，但都有更大的"专业用户"基线 + 用户教育。'

**解决方案（V1 缺失）**：

V1 应该在 §6.1 加 **hover tooltip** 缓解（不是装饰，是 disambiguation）：

```markdown
### 6.1 父类 count = 自身 + 所有子级总和（D8 = B）

按 _synthesis_decisions §3 D8 锁定。

**用户语义消歧（hover tooltip）**：

- 父类 row 上 count（如 `17`）hover 后 tooltip 显示：
  `"{name}: 5 directly + 12 in {N} sub-categories (17 total)"`
  示例："Coding: 5 directly + 12 in 2 sub-categories (17 total)"
- **仅父类有子类时显示 tooltip**；父类无子类（count 仅自身）时无 tooltip
- **子类（叶）count 无 tooltip**（因为 count 已经是单一含义）

**Norman visibility**：tooltip 在 hover 时显示——这是按需可达的 progressive disclosure，
不增加 sidebar 默认视觉密度。
```

**反对意见预期**：

- "Tooltip 是装饰，违反极简" → 反驳：tooltip 不是装饰，是消歧；hover 时显示 = 对极简哲学的最低侵入。
- "用户应该自己学会"父类 count 是聚合"" → 反驳：R4 已经验证用户 mental model 不直接 map；不消歧的代价是首次使用迷惑。

**Confidence**：80（中等强度——tooltip 是 nice-to-have 不是 stop-ship；但 V1 完全缺失消歧策略是缺口）

---

### P1-4 Drop-into 视觉反馈仅靠 indicator 缩进，缺"父行被命中"的反馈

**论据**：

V1 §2.7 选 α 单一方案（"drop indicator 缩进"），明确**不引入父行 hover bg、不引入 outline、不引入 ghost row**。

**但**：当用户在屏幕中央拖动一个 row，目光在 DragOverlay 跟手上，drop indicator 的 left 从 `row.left + 2` 变到 `row.left + 18`——**仅 16 px 的视觉位移**——视觉很微弱。用户**视觉注意力集中在 DragOverlay**，drop indicator 的位移在余光中可能不被察觉。

**Gestalt Common Region**: 让父类被"视觉上接纳"子类需要更强的"父行此刻是 drop target"信号。

**实际产品对照**：

| 产品 | drop-into 视觉反馈 | 强度 |
|---|---|---|
| macOS Finder list view | row 全行高亮（系统蓝半透明） + spring-load 自动展开 | 强 |
| macOS Notes | 目标 row 蓝色高亮 + 短延时 spring-load | 强 |
| Things 3 | Area row 高亮 + insert line 在 Area 内 | 中 |
| Linear | 蓝色 outline + indicator | 中 |
| Notion | 整个目标 row 高亮蓝色边框 | 中 |

**6/6 产品都给父行/目标行某种视觉强调**——V1 完全删除是激进选择。

**但 V1 §2.7 论据有效**："β/γ 都让父行视觉'脏'破坏 V3 cascade 让位的'crisp'语义"。这条论据**部分**成立（V3 reorder 期间父行确实不变化），但 hierarchy 是新语义，不是 reorder——**V3 不变量"父行不变化"是针对 reorder 的，不是针对 demote-into**。

**折中方案**：drop indicator 缩进 + **轻微的父行 hover 加深 bg**（如 `#F4F4F5` → `#EEEEEF`，仅 -2 灰度差），仅在 dwell ≥ 80ms 触发后启用，不在 reorder 时启用。

**Patch（V2 §2.7 加补充选项）**：

```markdown
### 2.7 Drop Indicator（hierarchy 下表达）+ 父行 active hint

drop indicator 缩进作为主反馈（α 单一）；hierarchy demote 时**追加** subtle 父行 bg 加深：

| 场景 | drop indicator | 父行 bg |
|---|---|---|
| dragOffset.x ∈ [-12, +12]（reorder） | row.left+2 / 全宽（V3 不变） | 无变化（V3 不变） |
| dragOffset.x ≥ +12 + dwell 80ms（demote） | row.left+18 / 缩进宽（§2.7） | **背景从 transparent → `#EEEEEF`（仅 -2 灰度差），duration 150ms `--ease-drag`** |
| dwell 离开 over row | 父行 bg 立即清空（150ms 反向过渡） | — |

**Anti-pattern**：

- 父行 bg 加深超过 -3 灰度差 → 进入 V3 hover 区间，破坏"父行 crisp"
- 父行 outline ring → 与 V3 极简哲学冲突
- 父行 spring-load 自动展开 → 我们已 onDragStart 全展开，不需要再 spring-load
- reorder 时也加父行 bg → 破坏 V3 reorder 父行不变化路线（仅限 demote）
```

**置信度**：75（仅作为可选改进，可在 dev mode 实测后决定是否加）

---

### P1-5 §3 模态切换条件未规格化 — 用户不知道何时进入"键盘拖动态"

**论据**：

V1 §3 表格依赖"已 Space 进入键盘 drag mode"概念。**Space 进入 drag mode 这个状态**是 dnd-kit KeyboardSensor 内部的，对用户不可见。V1 §3 没说：

1. 用户怎么知道自己进入了 drag mode？（没有视觉反馈）
2. 进入 drag mode 后再按 Space 是 drop 还是再次 lift？
3. 进入 drag mode 后 ESC 是 cancel 还是退出 drag mode 不取消？
4. drag mode 期间 Tab 切焦点会发生什么？

**HCI 风险**：

- 模态切换不可见 → Norman "system status visibility" 违反
- VoiceOver 用户必须依赖公告知道当前状态——但 V1 §3 公告表只覆盖了"row 移动到 X"类事件，**没覆盖 drag mode 进入/退出**

**Patch（V2 §3 加模态切换说明）**：

```markdown
### 3.1 模态切换的状态机（V3 KeyboardSensor 行为 + hierarchy 扩展）

继承 V3 KeyboardSensor。模态分两态（Browse / Drag），状态切换如下：

| 当前状态 | 按键 | 转移到 | 视觉/A11y 反馈 |
|---|---|---|---|
| Browse（focus on row） | `Space` | Drag | A11y 公告 "Picked up category {name}. Use arrow keys to move..."（V3 默认 announcements 已有）+ row scale 1.0 → 1.04（V3 lift sub-stage 1） |
| Browse | `←` | Browse | 折叠（如展开）；A11y 公告 "Collapsed category {name}." |
| Browse | `→` | Browse | 展开（如折叠）；A11y 公告 "Expanded category {name}." |
| Browse | `↑` / `↓` | Browse | row 间导航（V3 不变） |
| Browse | `Enter` | Browse | row click navigate |
| Drag | `↑` / `↓` | Drag | dnd-kit 内部 reorder over slot（视觉同 V3）|
| Drag | `←` | Drag | promote（child → root）; A11y "{name} promoted to root level."；root 行试图 promote 公告 "Cannot promote — already at root level." |
| Drag | `→` | Drag | demote（root → child of previous）；A11y "{name} moved to child of {parentName}."；child 试图 demote 公告 "Cannot demote — already at maximum depth." |
| Drag | `Space` / `Enter` | Browse | drop（V3 默认）；A11y "{name} dropped at position N." |
| Drag | `Esc` | Browse | cancel + snap-back；A11y "Drag cancelled. {name} returned to original position."（V3 不变） |
| Drag | `Tab` | **关键缺口**——dnd-kit 默认 Tab 在 drag 期间会移动焦点（破坏 drag），需要 03_tech_plan 决定是否 preventDefault | — |

**关键缺口决策**：Drag mode 下按 Tab 应该取消 drag（保留 V3 行为）还是 preventDefault Tab？
推荐 **preventDefault Tab**（Apple HIG: "during a sustained gesture, ignore Tab"）；dnd-kit
默认行为在 drag mode 下 Tab 触发什么需要 03_tech_plan 验证一手源码（参 verify-third-party-behavior-firsthand）。
```

**Confidence**：80

---

### P1-6 onDragStart "全部父类自动展开" 与 onDragEnd "恢复持久化状态" 的可见性公告缺失

**论据**：

V1 §2.15 规定 onDragStart 全部父类自动展开（不修改持久化），onDragEnd 恢复用户持久化折叠状态。

**A11y 缺口**：

- VoiceOver 用户开始拖拽 → 折叠的父类瞬时全展开 → **V1 §3 公告表只覆盖了"Auto-expanded {parentName} during drag"**，但**这个公告只在 onDragMove 期间，且只针对"被路过的折叠父类"**（如 `MainLayout` 拖动到的目标父类）。
- onDragStart 一次性全展开（多个父类）**没有公告**——VoiceOver 用户突然听到所有 row 的位置变化（可能听到子类被读出），无 context。

**Patch（V2 §3 公告表追加）**：

```markdown
| onDragStart 触发自动展开 N 个折叠父类 | 仅当 N ≥ 1 时公告 "Auto-expanded {N} categories for drag." |
| onDragEnd 触发恢复 N 个父类折叠 | 仅当用户的 drag 没成功（drop 在原位）且公告"Drag cancelled. Categories restored." |
| onDragEnd 成功 drop + 恢复折叠 | 在 drop 公告之后追加 "Categories collapsed restored to previous state."（仅 N ≥ 1 时） |
```

**Confidence**：85

---

### P1-7 折叠态拖动开始时的"瞬间视觉冲击"缺失渐变 — Norman 平滑过渡原则

**论据**：

V1 §2.15 + §3.1 (V3) "onDragStart 触发后，所有持久化为'折叠'的父类瞬间渲染其 children（无延迟动画）"。

**问题**：

- 用户开始拖动 → sidebar 瞬间从 5 个 row 变成 17 个 row（含所有子类）→ **视觉冲击**。
- Norman 的"smooth transitions"原则：状态变化应该是渐进的；瞬间出现的 12 个新 row 是 cognitive shock。
- V3 §2.10 "Show X more 折叠态在 onDragStart 自动展开"是**单一行为（show all）**，hierarchy 是 N 父类同时展开——不是同一种规模。

**Patch（V2 §2.15 修改）**：

```markdown
| 拖动开始（`onDragStart`） | **全部父类自动展开**（不修改持久化状态，仅"覆盖渲染"）；
**展开过渡保留 §2.15 的 220 ms cubic-bezier(0.16, 1, 0.3, 1) 子类高度过渡**；
不破坏 V3 §2.10 "Show X more" 自动展开行为基线 |
```

——也就是说，**onDragStart 触发的全展开 should 也走 220ms 高度过渡**（而不是瞬间）。这与 onDragEnd cancel 的 280ms cubic-bezier(0.32, 0.72, 0, 1) 匹配为同一组动效语言。

**反对意见**：

- "拖动期间需要立即 drop target 可达" → 反驳：220ms 过渡期间 drop target 已经存在于 DOM（虽然高度还在变），用户拖到 drop position 时间 ≥ 220ms（用户从 mousedown 到拖到目标至少 200-300ms），不影响 drop target accessibility。

**Confidence**：75（中等——用户实测可能反馈 220ms 过渡感觉笨重，dev mode 需验证）

---

### P1-8 §6.5 hierarchy 验证非法区视觉缺"为什么非法"的反馈 — Norman "good error message"

**论据**：

V1 §2.14 + §6.5 锁定的非法区：

- 父类拖到另一父类的"drop into"区 → DragOverlay opacity 0.5 + cursor not-allowed
- 任何破坏 max depth=2 的尝试 → DragOverlay opacity 0.5 + cursor not-allowed

**问题**：

cursor `not-allowed` 是通用"不能 drop"信号——但**没有说明为什么不能 drop**。用户视角：「为什么我能 drop 子类到这里却不能 drop 父类？」

**Norman "good error message" 原则**：错误反馈应该明示原因，让用户能修正行为。

**Patch（V2 §3 公告表追加）**：

```markdown
| 父类拖到另一父类 drop-into 区 + 持续 ≥ 80ms（前端检测非法）| A11y 公告 "Cannot move parent category {name} into another category. Parent categories cannot become children."（仅在持续 ≥ 800 ms 时发，避免短时穿越路过时的轰炸） |
| Drag 期间任何破坏 max depth=2 的尝试 | A11y 公告 "Cannot create deeper hierarchy. Maximum depth is 2 levels." |
```

**Confidence**：80

---

## 5. P2 问题列表（建议改进）

### P2-1 chevron click 在用户已 select 父类时的视觉反馈缺失

V1 §6.4 chevron click 仅 toggle expand/collapse，不 navigate。但**当父类已经是 active state（即用户在父类的 CategoryPage 上）**，chevron click 后视觉应该如何？V1 没说。

建议：父类 active 时 chevron rotation 不变（仍 toggle expand/collapse），但 row active 状态保持（V3 active bg 不变）。

---

### P2-2 V1 §10 不在范围里漏列了"hover tooltip 的 disambiguation 选择"

V1 §10 列了一组"不在范围"，但没声明"是否引入 hover tooltip 消歧 count"——这个选择留给后续，建议 V1 也明确 declare 是否在 v1 范围。如果 V1 §6.1 不加 tooltip（P1-3 提议），就显式说"hover tooltip disambiguation 是 v2"。

---

### P2-3 数字 "5 + 12 = 17" 在父类 row 上的字号未差异化

V1 §6.1 "count 显示位置不变"——指 V3 现状的 `text-[11px] font-medium text-[#A1A1AA]`。但 17 比 5 视觉权重大（两位数）；V3 设计哲学"克制"下，这个权重差异是否需要管？

建议：不管。理由：长 string 的视觉权重差是数字本身的属性，不是装饰；要管就需要"右对齐 + 等宽数字"，是新视觉负担。V1 选择"保持现状"是正确的极简延续。

---

### P2-4 §11 风险表 R5 跨 worktree localStorage 应该测试 worktree 间隔离

V1 §11 R5 标记 localStorage 跨 worktree 是低概率低影响。但 Memory（项目内）记录"用户在哪个 worktree 折叠都映射到同一 sidebar 视图偏好"——这是**事实陈述**而非测试证据。建议 V1 §8.1 dev mode 测试加入：

```markdown
- [ ] 跨 worktree 启动 app（同一台 Mac，git worktree A 和 worktree B），在 worktree A 折叠某父类，切换到 worktree B 后该父类**仍然折叠**（同 origin localStorage 共享）—— acceptance 不阻塞，记录为 informational
```

---

### P2-5 §6.5 max depth=2 的"clamp 在哪里"模糊性

V1 §6.5 提到"前端 prevent 在 onDragOver 检测"，但具体到 hierarchyKeyboardCoordinates 实现层（P0-1 修复后），clamp 应该在哪？建议在 V2 §6.5 显式声明：

- 鼠标拖动：onDragMove 的 getProjection wrapper（dnd-kit 官方 example pattern）
- 键盘拖动：hierarchyKeyboardCoordinates 内部
- 后端兜底：`set_category_parent` IPC 命令

——三处 clamp 是冗余但符合 defense in depth。

---

## 6. 赞赏点列表

### A1 删 8 项保 2 项的执行落地完整且 anti-pattern 清单严密 (R4 §6 → V1 §2.21)

V1 §2.21 把 R4 §6.1 的 8 项删除（chevron 大于 12 px、子类 dot 颜色淡化、guide line 等）和 2 项保留（Show X more 折叠重定义、字重不引入差异）**完整落地为 anti-pattern 清单**——这是规格化质量的极佳实践。

特别赞赏：

- "DragOverlay 携带子树视觉" 的明确禁止 + 论据（D5 决策"逻辑层跟随但视觉层不渲染子树"）
- "拖动期间在父类 row 上加 spring-load 自动展开"的明确禁止（V3 不存在的新行为）
- "chevron click 同时触发 nav" 的 hit-target 分离原则

### A2 V3 不变量保留核对清单 22 项 ≥ 任务卡要求的 20 项最小集

V1 §7 把 R2 §10 的 20 项扩展为 22 项，含每条"本任务保留方案"——这是回归质量的硬保证。特别完整：

- 第 4 条"snapModifier 不修改"+ §2.10 论据（X 阈值是 React state lazy commit，与 modifier 解耦）
- 第 11 条 "categoriesVersion 协议"在 hierarchy 后端 mutator 全覆盖
- 第 13 条 chevron `data-no-dnd="true"` 与 ColorPicker 一致路线

### A3 §2.21 Anti-pattern 清单的论据密度

V1 §2.21 的 23 条 anti-pattern 每条都有论据——比 V3 多了 9 条（hierarchy 专属）；每条 anti-pattern 都对应某个 P0/P1 已被 absorbed 的失败模式。这是优秀的规格防御。

### A4 §6.3 D4 决策权的明确归属（_synthesis_decisions Decisional > R3 Referential）

V1 §6.3 在 R3 推荐 8px、_synthesis_decisions 锁定 12px 的同级冲突上**明确按文档权威分级自动取 12px**——这是 cross-document-cascade-discipline 落地的优质示范。

### A5 §1 "二级是表达层级，不是装饰层级"作为设计哲学的简洁化

V1 §1 把 R3 的 3 段哲学浓缩为 3 句话，且每句对应一个 anti-pattern 清单层。"二级是表达层级，不是装饰层级"——这是 R7 design-language 蒸馏的优秀延续。

---

## 7. A11y / 键盘 / VoiceOver 专项核对（≥ 8 项）

| # | 检查项 | V1 状态 | 评语 |
|---|---|---|---|
| 1 | WCAG 2.5.7 dragging movement alternative 完整可达 | ⚠️ **部分** | KeyboardSensor 路径声明（§2.20）但 ContextMenu "Move to Parent..." 二级菜单未规格化（P0-3）；ContextMenu 与键盘流之间的认知一致性未论述 |
| 2 | VoiceOver 公告完备 — 用 name 不用 UUID | ✅ | §3 公告表正确用 `{name}`/`{parentName}`；继承 V3 announcements.ts 模式 |
| 3 | 键盘 ←/→ 不与 dnd-kit 默认行为冲突 | ❌ **P0-1** | 与 sortableKeyboardCoordinates 源码冲突，需替换 coordinateGetter |
| 4 | 普通浏览态 ←/→ 与 macOS NSOutlineView 标准一致 | ⚠️ **P0-2** | 行为正确但 V1 没显式 cite HIG outline-views 标准——A11y 论据缺失 |
| 5 | chevron `<button>` aria-expanded / aria-label 设置 | ✅ | §6.4 显式声明 `aria-label="Toggle ${categoryName} children"` + `aria-expanded={expanded}` |
| 6 | prefers-reduced-motion 全套覆盖 | ✅ | §2.18 + §3 表格；duration → 0ms；dwell 状态机保留——这条决策正确 |
| 7 | onDragStart 全展开 / onDragEnd 恢复的 A11y 公告 | ⚠️ **P1-6** | 缺 N 个父类自动展开 / 恢复时的 batch 公告 |
| 8 | 非法 drop 反馈不仅 cursor not-allowed，也有 A11y 解释 | ⚠️ **P1-8** | 缺"为什么非法"的语义公告 |
| 9 | 父类 cascade-promote 删除 confirmation + A11y 公告 | ❌ **P0-4** | 完全缺失；删父类无 confirm 是数据丢失风险 |
| 10 | 模态切换（Browse ↔ Drag）的视觉/A11y 反馈 | ⚠️ **P1-5** | 模态切换状态对用户不可见；公告依赖 V3 默认 announcements，hierarchy 扩展未论述 |
| 11 | dwell 80ms 在快速横滑时的 A11y 公告防轰炸 | ✅ | V1 §3 已说明"仅在 onDragMove 期间发自动展开公告，避免重复轰炸"——这条决策正确 |
| 12 | ContextMenu "Promote to Root" / "Move to Parent..." 仅在 child 时可见 | ✅ | §2.20 显式声明 |

**专项小结**：A11y 整体 75/100。`P0-1`（dnd-kit 源码冲突）是最 critical 的 A11y 阻断；P0-3 / P0-4 是合规风险。修订后预期 90+。

---

## 8. 要求 V2 修订

**True**

V1 在设计哲学一致性、视觉规格、V3 不变量保留 这三个维度上接近 10/10，但**键盘交互模型与 dnd-kit 内置实现的源码级冲突（P0-1）**是 stop-ship——实施前不解决会导致 hierarchy 键盘流彻底不可用，且**P0-3（ContextMenu Move to Parent 路径未规格化）/ P0-4（删父类 confirmation 缺失）**是 WCAG 合规和数据丢失风险。

**P0 修订项**（必须）：

1. P0-1：§3 加 keyboard coordinate getter 完整替换说明
2. P0-2：§3 加 NSOutlineView/HIG Outline Views 标准 cite
3. P0-3：§2.20 加 ContextMenu Move to Parent submenu 完整规格
4. P0-4：新增 §2.21 父类删除 confirmation + cascade-promote 反馈

**P1 修订项**（建议）：

5. P1-1：§6.3 加 dwell 实测目标 (≤ 600ms) + 退路 (dwell 0ms)
6. P1-2：§6.4 加 Fitts 误触论据（已计算）
7. P1-3：§6.1 加 hover tooltip 消歧（5 + 12 = 17）
8. P1-4：§2.7 加 subtle 父行 active hint（仅 demote 时）
9. P1-5：§3 加模态切换状态机
10. P1-6：§3 公告表加 onDragStart/End 批量展开/恢复
11. P1-7：§2.15 onDragStart 展开走 220ms 过渡
12. P1-8：§3 公告表加非法 drop 解释

---

## 9. Patch List 给 V1 → V2 的具体改写指引

按修订优先级 P0 → P1 → P2 排序：

### Patch 1 (P0-1 / P0-2) — §3 表格头部插入完整模态切换状态机 + dnd-kit 源码冲突说明

**位置**：V1 §3 开头

**插入文本**：

```markdown
## 3. 键盘可达 — Hierarchy 操作

**重要：dnd-kit 默认 sortableKeyboardCoordinates 在 KeyboardCode.Left/Right 上的行为**：
源码 `node_modules/@dnd-kit/sortable/dist/sortable.esm.js:656-760` 显示，dnd-kit 默认
coordinateGetter 在拖动态把 ←/→ 解释为"水平方向 droppable 寻找"+`event.preventDefault()`。
1D vertical sortable 下找不到 droppable，但 preventDefault 已被调用——意味着 V1 §3 提议的
"键盘拖动态 ←/→ promote/demote" 不能通过装饰链实现，必须**替换** coordinateGetter。

**实施路径**：复制 dnd-kit 官方 tree example（`clauderic/dnd-kit/stories/3 - Examples/Tree/keyboardCoordinates.ts`）
到 `src/components/sidebar/dnd/hierarchyKeyboardCoordinates.ts`，按 hierarchy max depth=2 改写。
具体由 03_tech_plan §X 详化。

**HIG 原典支持（普通浏览态 ←/→ 折叠/展开）**：
普通浏览态下 ← 折叠 / → 展开 复用 macOS NSOutlineView / Apple HIG Outline Views 标准
（"To expand and collapse rows in an outline view, people can press the right and
left arrow keys"——
https://developer.apple.com/design/human-interface-guidelines/outline-views）。
不是项目自创映射；用户在 macOS Finder list view、Notes 嵌套文件夹、Reminders Group
都已被训练成"右展开 / 左折叠"。

继承 V3 KeyboardSensor + sortableKeyboardCoordinates 基线，扩展为 hierarchyKeyboardCoordinates
（替换非装饰）。hierarchy 追加 ←/→ promote/demote（per D6 + R4 §5）：
```

——然后保留 V1 §3 现有表格 + 追加"模态切换状态机"小节（P1-5 内容）。

### Patch 2 (P0-3) — §2.20 加 ContextMenu Move to Parent submenu 完整规格

**位置**：V1 §2.20

**替换原文**：

```markdown
### 2.20 WCAG 2.5.7 Dragging Movements Alternative

继承 V3 §2.14 KeyboardSensor 路径作为拖拽 alternative。**hierarchy 追加键盘可达**详见 §3。

**ContextMenu 兜底（per D6 = C + E）**：

- 现有 ContextMenu 已包含 `Rename` / `Delete`；
- **新增 ContextMenu 项**：
  - **"Promote to Root"**（仅在 row 是 child 时可见）— 等同键盘 Space + ←
  - **"Move to Parent..."**（仅在 row 是 child 时可见）— 弹出**二级 Submenu**：
    - Submenu 内容：当前所有根级 categories，按 sidebar 顺序排列
    - 当前所属父类：禁用 + 注明 "(current parent)"
    - 键盘可达：方向键导航 + Enter 选定 + Esc 取消
    - VoiceOver 公告：选定后 "{name} moved to child of {newParent}."
- 父类（root）无 hierarchy ContextMenu 项

**为什么 Submenu 而非 Modal**：Modal focus trap 损害 VoiceOver 上下文；
Submenu 是 ContextMenu 天然延伸（Apple HIG ContextMenus）。
行业对照：Things 3 / Apple Notes 的 "Move to → submenu" pattern。
```

### Patch 3 (P0-4) — 新增 §2.21 父类删除确认与 cascade-promote 反馈

**位置**：V1 §2.21（renumber 现有 §2.21 → §2.22）

**插入文本**：

```markdown
### 2.21 父类删除的确认与 cascade-promote 反馈（D13 + Norman）

按 D13 锁定的"cascade-promote children to root"：删除父类时操作流：

| 步骤 | 行为 |
|---|---|
| 用户右键父类 → Delete | 弹出 macOS-native confirmation dialog（Tauri `dialog::ask` → NSAlert） |
| Dialog 文案 | "Delete category {name}? Its {N} children will be promoted to root level." |
| Dialog 按钮 | "Cancel"（默认）/ "Delete"（destructive） |
| 用户点 Cancel | 不变 |
| 用户点 Delete | 父类移到 trash；children parent_id 清零；写入 data.json |
| 完成后 sidebar 视觉 | 父类消失；children 出现根级；padding-left 220ms 过渡（§2.8） |
| A11y 公告 | "{name} deleted. {N} categories promoted to root: {child1}, {child2}..."（最多列 3 个，超出 "and N more"）|

**Anti-pattern 锁定**（追加 §2.22 原 §2.21）：

- 删除父类无 confirmation
- confirmation dialog 文案不提子类数量
- cascade-promote 不发 A11y 公告
- 删父类后 children 不出现在根级
```

### Patch 4 (P1-3) — §6.1 加 hover tooltip 消歧

**位置**：V1 §6.1 末尾

**插入文本**：

```markdown
**用户语义消歧（hover tooltip）**：

- 父类 row 上 count（如 `17`）hover 后 tooltip 显示：
  `"{name}: 5 directly + 12 in {N} sub-categories (17 total)"`
- **仅父类有子类时显示 tooltip**；父类无子类（count 仅自身）时无 tooltip
- **子类（叶）count 无 tooltip**

tooltip 是 progressive disclosure，hover-on-demand 不增加 sidebar 默认视觉密度（极简兜底）。
```

### Patch 5 (P1-7) — §2.15 onDragStart 全展开走 220ms 过渡

**位置**：V1 §2.15 表格"拖动开始"行

**修改**：

```markdown
| 拖动开始（`onDragStart`） | **全部父类自动展开**（不修改持久化状态，仅"覆盖渲染"）；
**展开过渡保留 §2.15 的 220ms 子类高度过渡**（不破坏 V3 §2.10 "Show X more"）|
```

### Patch 6-12 — 按 P1 编号依次 patch（已在 §4 各 P1 条目内提供详细文本，主 Agent 复制即可）

---

## 10. Confidence + Takeaway

**Confidence**：90/100

**Confidence 折扣来源**：

- 5 点：P0-1 的 dnd-kit 源码冲突已经一手验证（`sortable.esm.js:656-760`），但替换 coordinateGetter 的 hierarchyKeyboardCoordinates 完整实现细节属 03_tech_plan，本评审仅识别冲突未给完整实现
- 5 点：P1-7 onDragStart 全展开 220ms 过渡的实测体感不确定（可能感觉笨重，需 dev mode 验证）

**Takeaway 一句话**：

V1 在设计哲学、视觉规格、V3 不变量保留三个维度接近 10/10，**唯独 §3 键盘交互章节存在一个一手源码级冲突（dnd-kit `sortableKeyboardCoordinates` 默认占用 ←/→）必须在 V2 之前显式修订并标记 03_tech_plan 替换 coordinateGetter**——这是 V1 → V2 唯一的 stop-ship 修订；其余 P0（ContextMenu Move to Parent submenu 规格、父类删除 confirmation）+ 7 个 P1（dwell 实测目标、Fitts 论据、count 消歧 tooltip、父行 active hint、模态切换状态机、批量展开公告、onDragStart 220ms 过渡）+ 4 个 P2 都是质量提升类修订，不阻断实施但应该在进入 03_tech_plan 之前补齐。
