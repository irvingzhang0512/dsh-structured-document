---
name: structured-document
description: 用中文自然语言读取、定位、修改和重组结构化文档(会议纪要 / 项目管理 / 思路整理),支持"这个、刚才那个、刚加的、上一条、第二个"等指代,所有修改自动保存、可撤销。
when-to-use: 用户在讨论会议纪要、项目管理文档、思路/方案整理,或要求增删改、移动、排序、标状态、改负责人、撤销刚才的修改等文档操作时使用;只要用户说的是"文档里的内容"且当前文件是 Markdown 结构化文档,就应使用本技能而不是直接编辑文件。
---

# 结构化文档操作(structured-document)

你正在通过 dsh-structured-document 插件操作当前打开的结构化文档(Markdown 文件 + 结构化 IR)。用户说的是中文自然语言,你的职责是**把它翻译成正确的工具调用**——不做任何绕过工具的文件编辑。

## 一、铁律(每轮都适用)

1. **所有读取和修改都必须通过本插件的 17 个工具**,禁止直接读改文件内容、禁止直接改 JSON/sidecar、禁止用通用文件工具代替文档工具。
2. **先定位,再动手**:不确定目标节点时,先用 `get_outline`(看结构)或 `find_node`(按关键词/角色/属性找),禁止凭猜测直接改。
3. **多同名节点绝不随机选择**:工具返回 `candidates`(候选列表)或 `ambiguous: true` 时,把候选列表原样呈现给用户,让用户用「第几个 / 节点 ID / 更完整的标题」确认后重试。宁可多问一句,不可错改一处。
4. **一句话说完的事一次做全**:用户说"加一个待办,负责人张三,周五完成"→ 一次 `add_node` 带全 `role` 和 `properties`,不要拆成加节点+改属性两次调用。
5. **修改即自动保存**:成功调用的返回里有 `revision`(版本号);失败时文档保持原状,直接向用户解释错误即可。只有 `markdownUpdated: true` 时才能明确告诉用户完整业务信息已写入 Markdown；`sidecarSaved: false` 只表示内部状态同步失败，Markdown 业务数据仍已保存，应如实提醒用户。
6. **用户反悔就用 `undo`**:"撤销/不对/恢复/刚才那步不要了"→ `undo`(可连续撤销多步)。
7. **尊重角色与属性约束**:角色和属性键值必须属于当前模板;工具报 `INVALID_ROLE` / `INVALID_PROPERTY` 时,对照模板表纠正,不要硬塞。

## 二、中文指代 → 工具参数映射(核心)

| 用户说法 | 含义 | 工具调用方式 |
|---|---|---|
| 这个 / 这一条 / 当前(的) | 当前节点 Selected Node | `node` 省略(默认即 @selected);或显式 `node: "@selected"` |
| 刚才改的 / 刚刚修改的那条 | 最近修改节点 Last Edited Node | `node: "@last_edited"` |
| 刚加的 / 刚才新增的 / 那个新任务 | 最近新增节点 Last Created Node | `node: "@last_created"` |
| 上一条 / 前面那条 | 前一个兄弟节点 | `relative: "previous_sibling"` |
| 下一条 / 后面那条 | 后一个兄弟节点 | `relative: "next_sibling"` |
| 父级 / 上面那级 / 它所属的 | 父节点 | `relative: "parent"` |
| 它下面的第一个 / 头一条 | 第一个子节点 | `relative: "first_child"` |
| 最后一条 / 收尾那条 | 最后一个子节点 | `relative: "last_child"` |
| 第二个 / 第三条 / 第 N 个 | 同名/同组中的序号 | `occurrence: 2`(从 1 起;`-1` 表示最后一个) |
| 整个文档 / 文档标题 | 根节点 | `node: "@root"` |
| 明确点名的标题 | 标题匹配 | `node: "<标题>"`(先精确后包含;多个候选会返回 candidates) |
| 节点 ID(工具结果里给的) | 精确引用 | `node: "node_007"`(最可靠,优先复用结果里的 ID) |

指代组合示例:
- 「把**上一条**改成结论」→ `change_role { node: "@selected", relative: "previous_sibling", role: "conclusion" }`
- 「**刚才加的**那个任务,负责人改成李四」→ `update_property { node: "@last_created", key: "owner", value: "李四" }`
- 「**第二个**「热红外」往上移」→ `reorder_node { node: "热红外", occurrence: 2, direction: "up" }`
- 「**这个下面**再加一条讨论」→ `add_node { role: "discussion", title: "…", parent: "@selected" }`

连续对话中,`add_node` 成功后新节点自动成为当前节点(Selected Node);`update_node`/`delete_node`/`move_node` 等会更新"最近修改";删除会把失效指针清空——此时"刚才那个"可能已不可用,先 `get_selected_node` 确认再动手。

## 三、工具清单(何时用哪个)

### 查看(只读,随时可用)
| 工具 | 什么时候用 |
|---|---|
| `get_document` | 用户要看全文、完整结构、当前状态(结果较大,谨慎使用) |
| `get_outline` | 看结构/大纲/有哪些部分(优先于 get_document) |
| `find_node` | 按关键词、角色(如"所有待办")、属性(如"负责人是张三")查找 |
| `get_selected_node` | 确认"这个/刚才那个"现在指向谁、有没有选中 |
| `select_node` | 用户说"选中/进入/到 XX 那部分"——设置当前节点 |

### 修改(全部自动保存、可撤销)
| 工具 | 什么时候用 |
|---|---|
| `add_node` | "加/新增/补一条/记一个…"——标题、内容、角色、属性一次给全 |
| `update_node` | "把标题改成…/内容补充…" |
| `delete_node` | "删掉/不要了"(连子树;可 undo) |
| `move_node` | "把 A 移到 B 下面/换到另一个部分" |
| `reorder_node` | "上移/下移/置顶/放最后/放到第 3 条" |
| `change_role` | "这条其实是结论/改成待办/改成风险"(性质变化) |
| `update_property` | "负责人改成…/状态改成进行中/截止周五/进度 50%"(`value: null` 删除属性) |

### 历史与保存
| 工具 | 什么时候用 |
|---|---|
| `undo` | "撤销/恢复/刚才那步不要"(可连续调用) |
| `save_document` | 一般不用(自动保存);仅在确认"是否已落盘"时使用 |
| `create_document` | 根据完整结构新建 Markdown 文档;自动避开同名文件 |
| `replace_document` | 用户明确要求整体整理或重组时,一次替换并可整体撤销 |
| `apply_document_patch` | 一次用户意图包含多个明确局部变更时,合并成一个事务 |

三个事务工具必须携带稳定 `request_id`。修改已有文档还必须携带刚读取到的 `expected_file` 与 `expected_revision`;发生 `EXTERNAL_MODIFIED` 时重新读取,禁止绕过版本保护。一次用户意图只调用一次事务写入工具。

## 四、场景模板与角色属性表

文档模板决定合法角色与属性;模板 ID:meeting(会议纪要)、project(项目管理)、thinking(思路整理)。

### meeting 会议纪要
- 角色:`note` 笔记(默认)、`topic` 议题、`discussion` 讨论、`problem` 问题、`conclusion` 结论、`decision` 决定、`action_item` 待办
- `action_item` 属性:`owner` 负责人(文本)、`status` 状态(未开始/进行中/已完成/已取消)、`due_date` 截止时间(文本,保留原话如"周五")

### project 项目管理
- 角色:`note`、`objective` 目标、`key_result` 关键结果、`milestone` 阶段/里程碑、`task` 任务、`issue` 问题、`risk` 风险
- `task` 属性:`owner`、`status`(同上四值)、`due_date`、`progress` 进度(0-100 整数;用户说"50%"也传 50)

### thinking 思路整理
- 角色:`note`、`topic` 主题、`problem` 问题、`idea` 想法、`solution` 方案、`question` 疑问、`conclusion` 结论

角色转换时,新角色不支持的原属性会被移除(undo 可恢复)——工具结果会说明,需要时转告用户。

## 五、常见说法 → 调用示例

会议纪要:
- 「在当前议题下记一条讨论:砂锅误报可能与灶具差异有关」→ `add_node { role: "discussion", title: "砂锅误报与灶具差异有关", parent: "@selected" }`
- 「给刚才那条待办把负责人改成张三,周五完成」→ `update_property { node: "@last_created", key: "owner", value: "张三" }` + `update_property { node: "@last_created", key: "due_date", value: "周五" }`
- 「这个待办已经做完了」→ `update_property { node: "@selected", key: "status", value: "已完成" }`
- 「把这条不是讨论,是结论」→ `change_role { node: "@selected", role: "conclusion" }`

项目管理:
- 「10 月方案实现下面加个任务:人员检测联调,李四负责,进度 30%」→ `add_node { parent: "10月方案实现", role: "task", title: "人员检测联调", properties: { owner: "李四", status: "未开始", progress: 30 } }`
- 「这个任务进度更新到一半」→ `update_property { node: "@selected", key: "progress", value: 50 }`
- 「把第三条放到第一条」→ `reorder_node { node: "@selected", direction: "top" }` 或 `position: 0`

思路整理:
- 「把刚才那个想法整理成方案」→ `change_role { node: "@last_created", role: "solution" }`
- 「这个方案后面补一条疑问:时序特征怎么提取」→ `add_node { parent: "@selected", relative: "last_child", role: "question", title: "时序特征怎么提取" }`

## 六、出错怎么办(错误码 → 应对)

| 错误码 | 含义 | 你该做的 |
|---|---|---|
| `NO_CURRENT_FILE` | 会话没有当前文件 | 告诉用户"请先打开一个 Markdown 文档",不要自行选文件 |
| `FILE_NOT_FOUND` | 文件不存在 | 同上,并确认路径是否正确 |
| `NODE_NOT_FOUND` | 引用解析不到节点 | 换 `get_outline` / `find_node` 重新定位;不要猜 |
| `MULTIPLE_NODES_FOUND` | 标题命中多个节点 | 把 `candidates` 逐条列出,请用户说「第几个」;禁止自选 |
| `INVALID_ROLE` | 角色不在当前模板 | 对照第四节模板表纠正后重试 |
| `INVALID_PROPERTY` | 属性键/值不合法 | 对照模板属性表纠正(如 progress 必须是 0-100 整数) |
| `INVALID_OPERATION` | 非法操作(如移进自己的子树、撤销栈为空) | 如实向用户解释原因 |
| `VALIDATION_FAILED` | 结构校验失败 | 检查参数后重试;文档未被改动 |
| `SAVE_FAILED` | 保存失败(磁盘/权限) | 文档已自动回滚,提醒用户检查磁盘/文件占用,不要反复重试 |

## 七、边界(不要做)

- 不负责打开/关闭/切换文件——那是编辑器的事;工具的"当前文件"由运行环境决定。
- 目标和意图明确时,用一次 `apply_document_patch` 完成批量修改;只有对象存在歧义时才请用户消歧。
- 不臆造节点 ID;只使用工具结果中出现过的 ID。
- 用户没说清"哪一个"时,先问;歧义下错误操作的代价远大于多问一句。

## 八、Markdown 是事实来源

- 文档 Profile、节点角色、负责人、状态、截止日期和进度都会写入用户可见的 Markdown；`.sdoc.json` 只保存稳定 Node ID 和选择状态等内部增强信息。
- 删除 sidecar 后，插件仍应从 Markdown 恢复完整业务结构。不要要求用户编辑 JSON，也不要把 JSON 描述为业务数据来源。
- 结构化属性在节点下以带 `<!-- dsh:node-properties -->` 标记的可见 Markdown 表格呈现；不要把该表格当普通正文增删。
