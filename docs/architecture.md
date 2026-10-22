# 架构与设计决策

## Desktop 工作流目标契约（待确认／待实现）

新增 [discussion-desktop-workflows-20261014-v1](DESKTOP-WORKFLOWS-20261014.md)，承接 SPEC F012–F014：宿主固定绑定 lease、三个即时 Config 字段、实际 entry／configForms、配置迁移、17 工具的模型投影与三场景无损回归。本版相关预期优先于下面旧升级草案与旧 settings namespace 说明；具体文件待确认，未改运行实现。

目标版技术契约：见 [DSH 0.2.0-rc.2 升级适配](DSH-UPGRADE-20261011.md)（`dsh-upgrade-20261011-v1`，待确认／待实现）。本文原宿主 API 和设置存储说明保留作为当前组合基线；目标版采用该补充中的接口、配置迁移与验收边界，不将旧 API 继续当作目标版可用接口。

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
├── tools/             17 个 Document Tools(envelope、渲染、注册)
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

校验或 Markdown 保存失败:文档回滚到快照并返回结构化错误码。Markdown 已成功写入后,sidecar 写失败不会回滚业务数据,结果返回 `markdownUpdated: true`、`sidecarSaved: false`;这是内核明确处理的边界,由 `tests/unit/kernel.spec.ts` 的 sidecar 失败用例覆盖。不得把两个文件的写入描述为一个不可分割事务。

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

### 7. 当前文件集成(Current File Integration)

**边界**:插件不做文件树 / 文件选择。会话的"当前文件"通过 `CurrentFileProvider` 接缝注入(`WorkspaceRegistry.attachCurrentFileProvider`),并由 `StructuredDocumentService.bindCurrentFile` 提供可等待的会话绑定。Controller / View / 工作台负责选择来源;`config.currentFile` 仅提供静态调试通道。后续仍可增强:

- 更多编辑器来源的文件切换事件;
- 编辑器原位编辑(非工具路径)后的实时冲突提示;
- Sidebar 大纲视图与 IR 的双向联动。

提供者返回空且工作台未固定目标时,工具如实返回 `NO_CURRENT_FILE`,引导用户先指定文档。

### 8. 工具粒度:17 个明确职责工具,拒绝万能 command

需求第 23 章明确禁止 `document command` 式万能工具(参数黑洞、校验稀薄、权限不可分)。17 个工具各自有精确的参数 schema(DSH `defineTool` const 字面量推断)与输出 schema;三个事务工具分别承担新建、整篇整理和局部批量修改,单节点工具继续处理细粒度操作。

### 9. Skill 只做映射,不承担业务逻辑

SKILL.md 是"中文自然语言 → 工具参数"的映射规范(指代表、工具清单、歧义规则、错误应对),不含任何业务规则;业务规则(角色合法、属性校验、歧义检测)全部在内核与工具层强制执行——Skill 说错时,内核兜底。

### 10. schema 管线与 dsh-tools 的 const 泛型推断

`defineTool<const S, const O>` 依赖字面量类型推断出精确的 execute 返回类型;共享 schema 常量必须以 `as const satisfies` 传入(宽化为 `ValueSchemaSpec` 会让推断塌缩为 `never`)。工具层用 `outputSchema()` 泛型函数保持字面量;`defineTool` 在注册时把参数 DSL 编译为 raw JSON Schema,`execute` 内置参数校验(非法参数抛 `ToolArgsError`)。

## 配置契约

本节是 F010（设置页插件配置卡与配置分层）的技术契约，实现前先按此固定字段名、层面与写入语义。

### 两层配置

配置有两个来源，解析顺序为 **schema 默认值 → 组装 `base` → 用户层**（后者覆盖前者）：

| 层 | 来源 | 由谁写入 |
| --- | --- | --- |
| schema 默认 | 插件 schema 的 `.default()` | 插件 |
| 组装 `base` | 插件行 `cordis.patch.yml` 的 `config`（含 profile 覆盖） | 部署者 / profile |
| 用户层 | 设置文档中该命名空间的分节 | 用户在设置页保存 |

命名空间是包名 `dsh-structured-document`，`applies: 'live'`：保存后立即对插件生效，插件经 `getConfig()` 读取当前值，不需要重启。

该命名空间为本次新增，设置文档里不存在遗留分节，因此没有旧持久配置需要迁移或清理；组装配置的四个字段含义与现状一致（`currentFile` 仍只在组装层生效）。

### 设置页卡片字段

「设置 → 插件 → 插件配置」的卡片由本插件浏览器半边注册在 `settings.plugin.item` slot 上，**key 即命名空间**（该 slot 的类型由 `@deepseek-ai/dsh-client-ui-settings-plugins` 声明；设置页把宿主服务的命名空间与该 key 配对）。卡片可编辑字段：

| 字段 | 控件 | 默认 | 约束 |
| --- | --- | --- | --- |
| `defaultProfile` | select：`meeting` / `project` / `thinking` | `meeting` | 枚举；非法值由 schema 拒绝 |
| `autoSave` | switch | `true` | 布尔 |
| `maxUndoSteps` | number | `100` | 整数且 ≥ 1 |

`currentFile` **不在这张卡片、也不在该命名空间的 schema 里**：它是外部集成接缝（谁提供“当前文件”），继续只在组装层配置。运行时的当前文件仍由 `CurrentFileProvider` / 工作台绑定决定，静态值只是兜底（见设计决策 7）。把该字段排除在 schema 之外，是为了让用户层无法从设置文档顶掉这个集成接缝。

卡片控件由本插件自己实现：官方只提供 `numberField` / `textField` 两个字段规格与 `ValueField` / `SecretField` 两个呈现件，select 与 switch 需要自建 `format` / `parse` 与控件；保存统一走共享的 `CardForm`，它是这份表单唯一的写入点（控件只暂存草稿，从不自行落盘）。

**外观约定（F011）**：卡片容器由插件自己绘制（宿主只提供 flex 列容器与 `settings.plugin.item` 派发），因此外观必须**镜像宿主 `PluginCard` 的布局语法**，不得自创盒子——可折叠头部 `<button>`（`aria-expanded` + `aria-controls`）、带 `border-top` 分隔线的设置行（标签列 `flex:1`、控件 `flex:none` 行内右对齐）、右下角操作行，配色一律用真实存在的 `--dsw-alias-*` 令牌并给兜底值。**卡片 chrome 的数值以宿主 `PluginCard` 的真实规则为准**（本插件卡片与宿主内置卡片同页并列，比对基准是宿主）：`.5px solid --dsw-alias-border-l4` + `background:bg-layer-3` + `border-radius:16px`，展开态 `background:bg-layer-2` + `border-color:label-dimmed`；主体／设置行／操作行分隔线同为 `.5px --dsw-alias-border-l2`。其余布局数值照 [开发 Skill 的 config-ui.md §8「卡片外观：镜像宿主 PluginCard，不要自创盒子」](../../.agents/skills/dsh-plugin-develop/references/config-ui.md#8-卡片外观镜像宿主-plugincard不要自创盒子)。实现位于 [`../src/client/index.tsx`](../src/client/index.tsx) 的 `injectStyle()`，由 [`../tests/unit/client-card.spec.ts`](../tests/unit/client-card.spec.ts) 逐条核对（含"不得残留市场近似值 `1px` + `border-l2` + `radius:12px`"的负向断言）。两条配套约定：头部写清"哪个插件的哪个配置"（插件名 + 版本号 + 副标题，版本号由构建期注入，见 `tsdown.config.ts` 的 `__DSD_VERSION__`）；保存与放弃放在右下角操作行，沿用草稿 + 保存模型（控件即时写入会破坏 F010 的 revision 栅栏语义）。

### 软依赖

设置服务是可选依赖，写法要求：

- `settings` **不写进插件的必需 `inject`**（`src/index.ts` 的 `export const inject` 与 `cordis.patch.yml` 入口的 `inject` 两处保持一致）。cordis 把入口 `inject` 当硬前置：任一服务不可用时 fiber 不进入激活状态并执行卸载（`Fiber._refresh` → `_setEpoch(INACTIVE)` → `_unload()`），插件的 `apply` 根本不会被调用；服务出现后才重新激活。只有不列进去，才能满足“设置服务缺失时插件照常挂载与工作”。参照实现 `dsh-automation` 在入口 `inject` 里列了 `settings`，按上述语义那会让设置服务变成硬前置；本插件以本节为准。
- 接入用方法形式 `ctx.inject(['settings'], (sctx) => …)`：服务可用时才回调，不在时回调不发生，插件其余部分照常运行。注册有两种形式——`sctx.settings.register(ns, schema, { base, applies: 'live' })` 返回 owner scope，由插件自己读取并 watch（`dsh-automation` 的写法）；或 `installSection(owner, ns, schema, entry, hooks)`，这是官方给可选消费者的形式：服务在场时把组装 `entry` 当 `base` 注册，服务摘除时自动回退到该 `entry`，并通过 `hooks.setSource` / `onChange` 通知重判。
- 回调内注册的清理 effect 负责把 `getConfig()` 还原成组装配置，保证服务摘除后不留悬挂读取。
- 客户端半边同理：`settingsScope` 缺失或该命名空间未被宿主服务时，卡片不渲染（`CardShell.available === false`），不影响插件其它能力。

### 用户覆盖的写入与冲突

- 卡片各字段先暂存草稿，只有“保存”才写入；一次保存把该卡片的多个字段作为有序 mutation 提交，不是每个控件各自落盘。保存后从宿主接受的结果回读，未落地的保留草稿并标记失败。
- 字段是否“被覆盖”取决于它**是否出现在原始 `user` 层**，不比较值：覆盖值恰好等于组装值仍然是覆盖。重置＝清除该字段，使其重新继承组装层（组装未设则回 schema 默认）。
- 写入带 `expectedRevision` 围栏：拿旧快照保存会被拒（`SettingsConflictError`），不覆盖较新的值。
- 非法取值由 schema 拒绝并明确报错，不静默退化为默认值。外部直接编辑设置文档写入非法分节时，该命名空间保留最后一次有效值并告警，其它命名空间照常提交。

### 契约来源

以上 API 事实核对自本机 DSH `0.1.5-rc.2`：`@deepseek-ai/dsh-settings`（`register` / `installSection` / `applies` / 解析顺序 / revision 围栏）、`@deepseek-ai/dsh-client-ui-settings`（`ctx.settingsScope.bind`，快照的 `status` / `value` / `base` / `user` / `revision` / `writable` / `mode`）、`@deepseek-ai/dsh-client-ui-settings-plugins`（`settings.plugin.item` slot 与 `CardForm` / `numberField` / `textField` / `ValueField` / `SecretField`）。

### 实现位置

| 契约部分 | 实现 |
| --- | --- |
| 命名空间常量、卡片字段 schema（`SETTINGS_NAMESPACE` / `PROFILE_IDS` / `SettingsConfig`）、组装层 `Config`、解析顺序（`resolveConfig`） | [`../src/plugin/config.ts`](../src/plugin/config.ts) |
| 软依赖接入（`ctx.inject(['settings'], …)`）、组装 `base` 注册、`applies: 'live'`、`KernelOptions` 三字段 getter、读取侧兜底 `readLiveConfig` | [`../src/index.ts`](../src/index.ts) |
| settings 服务面结构镜像（`SettingsServiceFace` / `SettingsScopeFace` / `SettingsConsumerContext`） | [`../src/context-types.ts`](../src/context-types.ts) |
| 设置卡片（`settings.plugin.item`，key = 命名空间；`ctx.inject(['settingsScope'], …)` 软挂载、草稿 + 单点 `mutate` 保存；F011 外观按宿主 `PluginCard` 镜像） | [`../src/client/index.tsx`](../src/client/index.tsx) |
| 卡片外观配方核对（chrome / 折叠头部 / 行 / 操作行 / 纯度与主题令牌） | [`../tests/unit/client-card.spec.ts`](../tests/unit/client-card.spec.ts)、[`../tests/unit/hook-runtime.ts`](../tests/unit/hook-runtime.ts) |
| 客户端半边 bundle（loader id = 包名） | [`../tsdown.config.ts`](../tsdown.config.ts) |
| `dsh.client`、`exports["./client"]` 与客户端构建步骤 | [`../package.json`](../package.json) |
| 端到端用例（解析顺序、schema 拒绝、软依赖在场/缺失/摘除、用户覆盖生效） | [`../tests/unit/settings-config.spec.ts`](../tests/unit/settings-config.spec.ts) |

**惰性校验与读取侧兜底**：宿主 provider 在 `register` 时不解析 `base`，第一次 `get()` 才把 base 与用户层合并后交给 schema。因此越界的组装值（如 `defaultProfile: 'weekly'`）报错点在**读取**而非注册。`getConfig()` 经 `readLiveConfig()` 读取：解析抛错时告警一次并退回组装配置，插件照常挂载；越界值不静默改成 schema 默认值，仍由内核按原有语义明确报错（装载文档时 `requireProfile` 抛“场景模板不合法”）。注册阶段抛错的 provider 也保留同样的回退分支。


## 2026-10-18 统一展示与套件交付契约

依据用户已确认的 office-suite-implementation-20261018-v1。Irving · 结构化文档／Irving · Structured Documents，包 dsh-structured-document 统一 0.2.1-rc.2+rev.1。展示资源通过 locale 导出提供；原条目 id、服务／工具／客户端身份、配置及存储保持。组合分组为 dsh-office-bundle-members；保留本成员原始 patch 行，用户覆盖继续按原 id 命中；子开关不因总开关恢复而重置。版本按完整字符串与固定散列核对；本节不授权原先待确认的业务扩展。
