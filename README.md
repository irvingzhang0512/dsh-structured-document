# dsh-structured-document

DSH 结构化文档插件:让 Agent 通过**正常的中文**稳定地读取、定位、修改和重组结构化文档(会议纪要 / 项目管理 / 思路整理),而不是把 Markdown 当纯文本瞎猜着改。

## 它解决什么问题

直接编辑 Markdown 对 Agent 有三个天然坑:**指代失效**(“刚才那个”“上一条”没有着落)、**结构破坏**(层级/编号/缩进被改错)、**无法撤销**。本插件用一层结构化文档 IR 把这三件事变成确定性操作:

- 每个节点有稳定 ID(`node_NNN`),移动、改名后引用依然有效;
- 所有修改走「结构校验 → 自动保存 → 版本递增 → 状态更新」管线,失败整体回滚;
- 每一步都可撤销(`undo`),中文指代(“这个 / 刚才那个 / 刚加的 / 上一条 / 第二个”)有明确语义。

插件**不负责**文件树 / 文件选择 / 文件切换——"当前文件"由运行环境注入(见 [架构:当前文件集成](docs/architecture.md#当前文件集成current-file-integration))。

Markdown 是业务事实来源：文档 Profile、节点角色以及负责人、状态、截止日期、进度会以 Front Matter 和可见属性表写回 Markdown。`.sdoc.json` 仅用于稳定 Node ID 与会话状态；删除它不会丢失业务结构。

## 安装

以 DSH bundle 形式安装(插件包内带 `cordis.patch.yml`):

```sh
# 在 DSH profile 中安装本包(profile 的 dsh.profile.bundles 会引用它)
npm install dsh-structured-document
```

插件挂载后自动注册:

- 14 个 Document Tools(`structured_document` 前缀语义,见下表);
- 中文技能 `structured-document`(bundled,含中文指代 → 工具参数映射)。

**SKILL 无需单独安装**:SKILL.md 随 npm 包发布(`files` 含 `skills/`),插件挂载时由 `apply` 读取包内文件并注册进 `ctx.skills`——装好插件即装好技能,卸载插件时技能与工具一并自动注销。该行为有端到端测试保障(`tests/e2e/skill-install.spec.ts`,真实 cordis + 真实 SkillRegistry)。

配置项(均有默认值,见 [`src/plugin/config.ts`](src/plugin/config.ts)):

| 配置 | 默认 | 说明 |
|---|---|---|
| `defaultProfile` | `meeting` | 打开无 sidecar 的新 Markdown 时使用的场景模板 |
| `autoSave` | `true` | 修改成功后自动写盘(临时文件 + 原子替换) |
| `currentFile` | 空 | 静态指定当前文件(调试用;正式集成经 CurrentFileProvider) |
| `maxUndoSteps` | `100` | 撤销栈深度 |

## 工具一览(14 个)

| 类别 | 工具 | 用途 |
|---|---|---|
| 查看 | `get_document` | 完整文档(树、角色、属性、状态) |
| 查看 | `get_outline` | 大纲(层级 / 角色 / 子节点数) |
| 查看 | `find_node` | 按关键词 / 角色 / 属性查找(多候选如实返回) |
| 定位 | `select_node` | 设置当前节点(Selected Node) |
| 定位 | `get_selected_node` | 读取当前节点与最近修改 / 新增节点 |
| 修改 | `add_node` | 新增节点(标题 / 内容 / 角色 / 属性一次给全) |
| 修改 | `update_node` | 修改标题 / 内容 |
| 修改 | `delete_node` | 删除节点及子树(可撤销) |
| 修改 | `move_node` | 移动到另一父节点(防移进自身子树) |
| 修改 | `reorder_node` | 上移 / 下移 / 置顶 / 置底 / 指定位置 |
| 修改 | `change_role` | 修改角色(自动裁剪不再适用的属性) |
| 修改 | `update_property` | 设置 / 删除属性(枚举与范围校验) |
| 历史 | `undo` | 撤销最近一次修改(可连续) |
| 历史 | `save_document` | 手动保存(自动保存默认开启) |

节点引用格式:`node_007` / 标题(先精确后包含)/ `@selected` / `@last_edited` / `@last_created` / `@root`,配合 `occurrence`(第几个)与相对定位(`previous_sibling` 等)。多同名节点歧义时工具返回 `candidates` 候选列表,**绝不随机选择**。

## 快速上手

1. 在 DSH 中打开一个 Markdown 文档(示例见 [`examples/`](examples/));
2. 直接用中文说:

```text
看看现在的结构                    → get_outline
进入「当前算法问题」              → select_node
加一条讨论:误报集中在低功率档位   → add_node (role=discussion)
刚才这条改成结论                  → change_role (node=@last_created, role=conclusion)
加个待办:负责人张三,周五完成      → add_node (role=action_item, properties={owner,status,due_date})
状态改成进行中                    → update_property (key=status)
撤销                              → undo
```

完整的说法映射见技能正文 [`skills/structured-document/SKILL.md`](skills/structured-document/SKILL.md)。

## 文档

| 文档 | 内容 |
|---|---|
| [docs/usage.md](docs/usage.md) | 使用手册:状态、指代、歧义、撤销、保存 |
| [docs/architecture.md](docs/architecture.md) | 架构与设计决策(管线、sidecar、当前文件集成 TODO) |
| [docs/ir.md](docs/ir.md) | 文档 IR:节点 / 角色 / 属性 / 元数据 |
| [docs/tools.md](docs/tools.md) | 14 个工具的参数与结果格式 |
| [docs/profiles.md](docs/profiles.md) | 三类模板的角色与属性表 |
| [docs/skill.md](docs/skill.md) | SKILL.md 的装载、结构与映射规则 |
| [docs/release-checklist.md](docs/release-checklist.md) | 发布检查(对照需求 28 条验收标准) |

## 开发

```sh
npm install
npm run typecheck   # 类型检查
npm test            # vitest(单元 / 集成 / 场景)
npm run build       # 构建到 lib/
```

测试分层:

- `tests/unit/` — IR、Markdown 适配器、内核、SKILL 装载;
- `tests/integration/` — 14 个工具经真实 `defineTool` 管线的集成行为;
- `tests/scenarios/` — 会议纪要 / 项目管理 / 思路整理三场景端到端(多轮中文指代、歧义、撤销、非法输入、保存失败、外部修改);
- `tests/e2e/` — 真实 cordis + 真实 SkillRegistry:SKILL 与工具随插件安装/卸载的生命周期。

## 许可

MIT,见 [LICENSE](LICENSE)。
