[English](README.md) | **简体中文**

# dsh-structured-document

DSH(DeepSeek Harness)结构化文档插件:让 Agent 通过**正常的中文**稳定地读取、定位、修改和重组结构化文档(会议纪要 / 项目管理 / 思路整理),而不是把 Markdown 当纯文本瞎猜着改。

## 它解决什么问题

直接编辑 Markdown 对 Agent 有三个天然坑:**指代失效**("刚才那个""上一条"没有着落)、**结构破坏**(层级/编号/缩进被改错)、**无法撤销**。本插件用一层结构化文档 IR 把这三件事变成确定性操作:

- 每个节点有稳定 ID(`node_001`、`node_002` …),移动、改名后引用依然有效;
- 所有修改走「结构校验 → 自动保存 → 版本递增 → 状态更新」管线,任何一步失败都整体回滚到操作前快照;
- 每一步都可撤销(`undo`),中文指代("这个 / 刚才那个 / 刚加的 / 上一条 / 第二个")有明确、成文的语义。

**边界**:插件不负责文件树 / 文件选择 / 文件切换——"当前文件"由运行环境注入(见[当前文件集成](#当前文件集成))。

## 特性

- **稳定节点 ID** — ID 在解析时分配、之后永不变更;计数器单调递增,撤销后不复用 ID。根节点固定为 `node_001`(承载文档标题,不可删除、不可移动)。
- **确定性修改管线** — 每次写入都走:快照 → 工作副本变更 → 结构校验 → 持久化(版本 +1、完整业务数据写回 Markdown、临时文件原子写、sidecar 刷新)→ 状态更新 + 撤销快照入栈。校验失败或保存失败时回滚到快照,不留半完成状态。
- **全部可撤销** — 每次成功修改(含 `undo` 本身)都把快照压入撤销栈(默认 100 步);版本号与 ID 计数器只增不减。
- **中文指代语义明确** — `@selected`(这个/当前)、`@last_edited`(刚才改的)、`@last_created`(刚加的)、`@root`(整个文档)、`occurrence`(第二个/第三条/最后一个)以及相对定位(`previous_sibling` / `next_sibling` / `parent` / `first_child` / `last_child`)。
- **Markdown 是业务事实来源(sidecar v2)** — 文档 Profile、节点角色与业务属性(负责人 / 状态 / 截止日期 / 进度)全部写回**用户可见的 Markdown**:Profile 写入 YAML Front Matter(`dsh_profile:`),角色与属性以带 `<!-- dsh:node-properties -->` 标记的可见表格呈现(表头为中文:类型 / 负责人 / 状态 / 截止日期 / 进度)。`.sdoc.json` 只保存稳定 Node ID 与会话状态(选中 / 最近修改 / 最近新增);删除 sidecar 不丢业务结构——完整业务数据可从 Markdown 恢复,损失的只是跨会话 ID 延续。
- **兼容读取 v1 sidecar** — 旧版 v1 sidecar 打开时可读;首次**业务修改**时才迁移为 v2(单纯选择节点不会提前覆盖 v1)。
- **歧义绝不乱猜** — 标题命中多个节点时,工具返回 `MULTIPLE_NODES_FOUND` + `candidates` 候选列表(含 ID / 标题 / 角色 / 路径),由 Agent 向用户确认,**绝不随机选择**。
- **外部修改以磁盘为准** — 每次工具调用前比对文件哈希;会话外改动后以磁盘为准重新解析(撤销栈与状态指针清空)。
- **会话隔离** — 每个 Agent 会话一个文档工作区,懒绑定到会话的当前文件与工作目录。
- **捆绑中文技能** — `structured-document` 技能随包发布,教会模型"中文说法 → 工具调用"的精确映射(见[工具与技能](#工具与技能))。

## 安装

以 DSH profile bundle 形式安装(插件包内带 `cordis.patch.yml`,自动应用):

```sh
npm install dsh-structured-document
```

或通过 DSH CLI:

```sh
dsh plugin --profile <name> add dsh-structured-document@<version>
```

需要 Node.js >= 20;peer 依赖 `@deepseek-ai/cordis`(>=4.0.2)、`@deepseek-ai/dsh-tools`(>=0.1.2-rc.1)、`@deepseek-ai/schemastery`(>=3.18.2)。

插件挂载后自动注册:

- **14 个 Document Tools**(见下方工具表);
- 捆绑中文技能 **`structured-document`** —— `SKILL.md` 随 npm 包发布(`files` 含 `skills/`),插件挂载时自动注册进 `ctx.skills`(bundled),卸载时随插件自动注销。**无需单独安装技能。** 该生命周期有端到端测试保障(`tests/e2e/skill-install.spec.ts`,真实 cordis + 真实 SkillRegistry)。

## 快速上手

1. 在 DSH 中打开一个 Markdown 文档(示例见 [`examples/`](examples/):`examples/meeting/weekly-meeting.md`、`examples/project/person-detection.md`、`examples/thinking/report-outline.md`);
2. 直接用中文说:

```text
看看现在的结构                    → get_outline
进入「当前算法问题」              → select_node
加一条讨论:误报集中在低功率档位   → add_node (role=discussion)
刚才这条改成结论                  → change_role (node=@last_created, role=conclusion)
加个待办:负责人张三,周五完成      → add_node (role=action_item, properties={owner, due_date})
状态改成进行中                    → update_property (key=status)
撤销                              → undo
```

完整的说法映射见技能正文 [`skills/structured-document/SKILL.md`](skills/structured-document/SKILL.md)。

## 配置

全部配置项均有默认值(定义于 [`src/plugin/config.ts`](src/plugin/config.ts)):

| 配置 | 默认 | 说明 |
|---|---|---|
| `defaultProfile` | `meeting` | 打开无 sidecar 历史的新 Markdown 时使用的场景模板:`meeting` / `project` / `thinking` |
| `autoSave` | `true` | 修改经结构校验后立即写盘(临时文件 + 原子替换);关闭后需用 `save_document` 手动保存 |
| `currentFile` | 空 | 可选:静态指定当前文件(绝对路径,或相对会话工作目录);留空表示由运行环境注入 |
| `maxUndoSteps` | `100` | 撤销栈深度 |

## 工具与技能

### 工具一览(14 个)

所有工具共用结果 envelope:成功 `{ success, action, message, revision?, ... }`,失败 `{ success: false, error, message, candidates? }`;所有修改自动保存、可撤销。结果中的 `message` 一律中文,并带 `markdownUpdated` / `sidecarSaved` 标记,便于向用户如实说明持久化情况。

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

节点引用格式:`node_007` / 标题(先精确后包含)/ `@selected` / `@last_edited` / `@last_created` / `@root`,配合 `occurrence`(第几个,从 1 起;负数从末尾计数)与相对定位(`previous_sibling` 等)。歧义时绝不猜选。

### 捆绑技能 structured-document

技能是模型侧「中文自然语言 → 工具调用」的映射说明:指代表、工具选择、歧义规则、错误应对。技能**只做映射,不承担业务逻辑**——角色合法性、属性校验、歧义检测全部由内核与工具层强制执行,说错会被结构化错误码如实拒绝,不会污染文档。

## 当前文件集成

插件刻意不做文件树 / 文件选择 / 文件切换。会话的"当前文件"经 `CurrentFileProvider` 接缝注入(见 [`src/plugin/current-file.ts`](src/plugin/current-file.ts)):

- 插件对外提供 `ctx.structuredDocument`,其可写内存存储允许集成方(如侧边栏 / 编辑器插件)通过 `setCurrentFile(sessionId, path)` 推送当前文件变化;
- `config.currentFile` 提供静态兜底(调试用);
- 未注入提供者时,工具返回 `NO_CURRENT_FILE`,引导用户先打开文档。

与具体侧边栏 / 编辑器的桥接属于集成层 TODO,跟踪于 [`docs/architecture.md`](docs/architecture.md)。

## 文档

以下文档均为中文:

| 文档 | 内容 |
|---|---|
| [docs/usage.md](docs/usage.md) | 使用手册:状态、指代、歧义、撤销、保存 |
| [docs/architecture.md](docs/architecture.md) | 架构与设计决策(管线、sidecar、当前文件集成) |
| [docs/ir.md](docs/ir.md) | 文档 IR:节点 / 角色 / 属性 / 元数据 |
| [docs/tools.md](docs/tools.md) | 14 个工具的参数与结果格式 |
| [docs/profiles.md](docs/profiles.md) | 三类模板的角色与属性表 |
| [docs/skill.md](docs/skill.md) | SKILL.md 的装载、结构与映射规则 |
| [docs/release-checklist.md](docs/release-checklist.md) | 发布检查(对照需求 28 条验收标准) |

## 开发

```sh
npm install
npm run typecheck   # 类型检查
npm test            # vitest(单元 / 集成 / 场景 / 端到端)
npm run build       # 构建到 lib/
```

测试分层:`tests/unit/`(IR、Markdown 适配器、内核、SKILL 装载)、`tests/integration/`(14 个工具经真实 `defineTool` 管线的集成行为)、`tests/scenarios/`(会议纪要 / 项目管理 / 思路整理三场景端到端:多轮中文指代、歧义、撤销、非法输入、保存失败、外部修改)、`tests/e2e/`(真实 cordis + 真实 SkillRegistry:SKILL 与工具随插件安装 / 卸载的生命周期)。

## 许可

MIT,见 [LICENSE](LICENSE)。
