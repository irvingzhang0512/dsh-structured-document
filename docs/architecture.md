# 架构与设计决策

本文记录 dsh-structured-document 的模块划分、数据流,以及实现过程中做出的设计决策(含与需求假设不一致处的取舍)。

## 模块总览

```
src/
├── model/            IR 与纯操作
│   ├── types.ts        DocNode / StructuredDocument / Profile / Role / PropertySpec
│   ├── errors.ts       DocumentErrorCode + DocumentOperationError(candidates)
│   ├── document.ts     ID 分配 / 遍历 / 面包屑 / 祖先判断 / 深拷贝
│   └── validation.ts   属性校验(enum/min/max)与文档级校验
├── operations/
│   └── ops.ts          七类纯操作(add/update/delete/move/reorder/changeRole/setProperty)
├── storage/
│   ├── markdown-adapter.ts  Markdown ↔ IR 双向转换(ATX 标题 + 列表 + 任务列表)
│   └── storage.ts           NodeFsStorage(原子写)、SHA-256、sidecar 读写
├── state/
│   ├── document-state.ts    状态指针(Selected / LastEdited / LastCreated / Dirty)
│   ├── references.ts        节点引用解析(ID / 标题 / @指针 / occurrence / relative)
│   └── kernel.ts            SessionWorkspace(变更管线)+ WorkspaceRegistry(会话隔离)
├── tools/             14 个 Document Tools(envelope、渲染、注册)
├── plugin/            Config、CurrentFileProvider 接缝、SKILL.md 装载
└── index.ts           Cordis 插件入口(name / inject / Config / apply)
```

## 数据流(修改路径)

```
工具调用(中文参数)
  → withWorkspace(会话解析 → requireBound 懒绑定 → 外部修改检测)
  → 引用解析(resolveNodeRef:ID / 标题 / @指针 / relative / occurrence)
  → commit(快照 deep clone → mutator 变更工作副本 → validateDocument)
  → persist(revision+1 → 完整业务信息序列化到 Markdown → 临时文件原子写 → v2 sidecar 写入 → loadedHash 更新)
  → 状态指针更新 + 撤销快照入栈 → envelope(中文 message + 结构化字段)
```

任何一步失败:文档回滚到快照,返回结构化错误码,不留半完成状态(保存失败时 Dirty 复位,内存与磁盘一致)。

## 设计决策

### 1. 通用默认角色 `note`

解析既有 Markdown 时,普通列表行没有可靠的角色依据(需求第 13 章:不能凭空猜角色)。若强行推断,同一文件每次解析角色都可能漂移,ID 与角色都不稳定。因此所有模板内置 `note`(笔记)作为默认角色:无明确依据的节点一律 `note`,保证任意 Markdown 可无损、可复现地装载。用户后续可用 `change_role` 显式升级(如 讨论 → 结论)。

### 2. Sidecar(`<file>.sdoc.json`)与内容哈希

- Markdown 是**权威数据**;sidecar 是加速与状态载体(ID 映射、状态指针、撤销外的会话状态)。
- sidecar 记录 `content_hash`(SHA-256):业务字段始终从 Markdown 解析；哈希匹配时仅恢复稳定 ID 与状态，不匹配时重新分配 ID。
- sidecar 可随时删除:删除后仅损失"跨会话 ID 延续",文档内容无损。
- v1 sidecar 在打开时兼容读取，第一次业务修改时才把可见业务属性写入 Markdown 并生成 v2；单纯选择节点不会提前覆盖 v1。

### 3. 外部修改检测的时机与冲突取舍

检测点在**工具层统一入口**(`withWorkspace`,每次工具调用 `requireBound` 之后):读文件 → 哈希对比 `loadedHash` → 不一致则以磁盘为准重新装载(撤销栈与状态指针清空)。

取舍:若内存存在未保存修改(仅在 `autoSave: false` 下有窗口)且外部同时改了文件,**以磁盘为准、丢弃内存态**。这是需求第 12 章"外部修改以外部为准"的严格落地;autoSave 开启(默认)时未保存窗口趋近于零。读取文件在每次工具调用多做一次小文件 IO,以正确性优先;文件均为笔记量级,可接受。

### 4. 撤销的实现方式:快照式

每次成功提交前对整文档 deep clone 入栈(默认 100 步)。相比命令反演(op/inverse op),快照式实现简单、任何复杂操作(子树删除、属性裁剪)都天然可逆,代价是内存占用——文档为笔记量级,可接受。撤销语义:

- **ID 计数器单调**:恢复快照后 `node_seq` bump 到当前值,撤销后再新增不复用 ID;
- **Revision 单调**:撤销恢复的是快照文档,但其 revision 先对齐到当前版本再 +1——撤销也是一次成功提交,版本号只增不减。

### 5. 版本(Revision)语义

初始导入的文档 revision = **1**(文件本身即第 1 版);此后每次成功提交(含撤销)严格 +1。保存失败不计入版本——写盘前不推进版本是失败整体回滚的一部分(revision 在写盘前 +1、写盘失败随文档一起回滚)。

### 6. Envelope 采用需求第 24 章格式

DSH 部分兄弟插件使用 `{ ok, code }` 惯例,本插件按需求采用 `{ success, action, message, revision?, ... }` / `{ success, error, message, candidates? }`:错误码、候选列表、版本号都是一等字段。`message` 一律中文(面向用户),`render` 投影给模型的也是中文。

### 7. 当前文件集成(Current File Integration)——预留接缝

**边界**:插件不做文件树 / 文件选择 / 文件切换。会话的"当前文件"通过 `CurrentFileProvider` 接缝注入(`WorkspaceRegistry.attachCurrentFileProvider`),由 Controller / Sidebar 集成方实现;`config.currentFile` 仅提供静态调试通道。TODO(后续版本,需与 Controller 协同):

- 监听编辑器文件切换事件 → 会话自动换绑;
- 编辑器原位编辑(非工具路径)后的实时冲突提示;
- Sidebar 大纲视图与 IR 的双向联动。

在接缝落地前,若提供者返回空,工具如实返回 `NO_CURRENT_FILE`,引导用户先打开文档。

### 8. 工具粒度:14 个单一职责工具,拒绝万能 command

需求第 23 章明确禁止 `document command` 式万能工具(参数黑洞、校验稀薄、权限不可分)。14 个工具各自有精确的参数 schema(DSH `defineTool` const 字面量推断)与输出 schema;`add_node` 与 `update_property` 的划分与中文说法天然对应("加一个待办…" vs "负责人改成…")。

### 9. Skill 只做映射,不承担业务逻辑

SKILL.md 是"中文自然语言 → 工具参数"的映射规范(指代表、工具清单、歧义规则、错误应对),不含任何业务规则;业务规则(角色合法、属性校验、歧义检测)全部在内核与工具层强制执行——Skill 说错时,内核兜底。

### 10. schema 管线与 dsh-tools 的 const 泛型推断

`defineTool<const S, const O>` 依赖字面量类型推断出精确的 execute 返回类型;共享 schema 常量必须以 `as const satisfies` 传入(宽化为 `ValueSchemaSpec` 会让推断塌缩为 `never`)。工具层用 `outputSchema()` 泛型函数保持字面量;`defineTool` 在注册时把参数 DSL 编译为 raw JSON Schema,`execute` 内置参数校验(非法参数抛 `ToolArgsError`)。
