# 场景模板(Profile)

模板定义文档的**角色(Role)与属性(Properties)推荐范围**,存放于 [`src/profiles/profiles.ts`](../src/profiles/profiles.ts)。节点的 `role` 与 `properties` 必须符合所属模板；模板 ID 写入 Markdown Front Matter，重新解析时沿用。

- 中文别名:`会议纪要` → `meeting`、`项目管理` → `project`、`思路整理` → `thinking`(`normalizeProfileId`)。
- 每个模板内置通用角色 **note(笔记)** 作为默认角色:解析既有 Markdown 时无角色依据的节点一律 `note`(设计决策见 [架构](architecture.md#1-通用默认角色-note))。

## meeting 会议纪要

整理会议结构:议题、讨论、问题、结论、决定、待办。

| 角色 | 标识 | 属性 |
|---|---|---|
| 笔记(默认) | `note` | — |
| 议题 | `topic` | — |
| 讨论 | `discussion` | — |
| 问题 | `problem` | — |
| 结论 | `conclusion` | — |
| 决定 | `decision` | — |
| 待办 | `action_item` | `owner` 负责人(文本)、`status` 状态(枚举)、`due_date` 截止时间(文本,保留原话如"周五") |

## project 项目管理

目标(O)、关键结果(KR)、成果(G)、策略(S)、验收(M)、模块、里程碑、任务、问题、风险与决策的管理结构(对齐防干烧项目管理 V2 的 OKR/OGSM/WBS 层级)。

| 角色 | 标识 | 属性 |
|---|---|---|
| 笔记(默认) | `note` | — |
| 目标 | `objective` | `owner`、`status`(七值枚举)、`start_date`、`due_date` |
| 关键结果 | `key_result` | `owner`、`status`、`start_date`、`due_date` |
| 成果 | `goal` | `owner`、`status`、`start_date`、`due_date` |
| 策略 | `strategy` | `owner`、`status`、`start_date`、`due_date` |
| 验收 | `measure` | `owner`、`status`、`due_date` |
| 模块 | `module` | `owner`、`status`、`start_date`、`due_date` |
| 里程碑 | `milestone` | `owner`、`status`、`due_date`、`actual_date` 实际完成 |
| 任务 | `task` | `owner`、`status`、`start_date`、`due_date`、`progress` 进度(0-100 整数) |
| 问题 | `issue` | `owner`、`status`、`due_date`、`level` 等级(高/中/低) |
| 风险 | `risk` | `owner`、`status`、`due_date`、`level` 等级 |
| 决策 | `decision` | `owner`、`status`、`due_date` |

## thinking 思路整理

汇报思路、算法方案、技术方案与日常思考的组织结构。

| 角色 | 标识 | 属性 |
|---|---|---|
| 笔记(默认) | `note` | — |
| 主题 | `topic` | — |
| 问题 | `problem` | — |
| 想法 | `idea` | — |
| 方案 | `solution` | — |
| 疑问 | `question` | — |
| 结论 | `conclusion` | — |

## 校验规则

- **状态枚举**:meeting 的 `action_item` 状态 ∈ {未开始, 进行中, 已完成, 已取消};project 的状态 ∈ {未开始, 进行中, 已完成, 已取消, 有风险, 阻塞, 暂停}(`INVALID_PROPERTY` 拒绝其他值);
- **进度**:整数且 0 ≤ progress ≤ 100;工具层把 `"50%"` 规整为 `50`;
- **属性键**:必须在节点当前角色的属性表中;
- **角色切换**(`change_role`):新角色不支持的原属性被移除(结果里返回 `removed_properties`,撤销可恢复);
- **属性表序列化**:Markdown 属性表列集为 `role/owner/status/start_date/due_date/actual_date/progress/level`;节点属性出现列集之外的键时保存抛 `VALIDATION_FAILED`(防止静默丢数据);解析端按表头动态读取,无新列的旧文档正常兼容。

## 模板选择

有 `dsh_profile` Front Matter 时以 Markdown 为准；旧文档回退到兼容 sidecar 中的 Profile，再回退到配置 `defaultProfile`（默认 `meeting`）。切换模板仍属于后续版本能力。
