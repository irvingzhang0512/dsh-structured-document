# dsh-structured-document 当前功能规格

基线日期：2026-10-03；包版本：0.1.0；核对的源码提交：`2df8d3348a7f668330bf8e680a68001478f93418`。此提交是首次整理前的实现基线，后续文档提交不提高包版本。

2026-10-10 增量：新增 F010（设置页插件配置卡与配置分层），技术契约同步到 [architecture.md](architecture.md) 的「配置契约」。该版为待用户确认的规格增量，尚未实现；包版本仍为 0.1.0。

本规格可编辑，功能任务先改预期与验收及相关技术契约，交用户明确确认该版文档后再开发；确认前不得修改对应源码／测试实现或运行配置。用户已明确要求按同一版文档实现且含义未变时，不重复询问；新增语义差异须重新确认，确认范围写入规格变更或任务交付记录。Bug 按已有且不变的预期直接定位源码。流程见 [根文档驱动开发规范](../../docs/DOC-DRIVEN-DEVELOPMENT.md)。原始需求保持只读，技术文档保留现有名称。

依据与技术入口：[../requirements.txt](../requirements.txt)、[architecture.md](architecture.md)、[ir.md](ir.md)、[profiles.md](profiles.md)、[tools.md](tools.md)。

实现状态与验证状态分别记录。“已实现”表示有当前源码依据，不表示本次已通过运行测试。下面的测试链接是核对过的现有验证入口；2026-10-03 本次只静态核对源码、测试与文档，没有运行产品测试、构建、GUI 或外部服务验证。具体遗漏见条目与末尾待办。

## F001 统一文档 IR 与 Profile

- 实现状态：已实现。
- 场景与预期：会议、项目、思路整理等文档使用同一节点树 IR：稳定 id、标题、正文、角色、属性与有序子节点；Profile 约束角色与属性。
- 边界与异常：根节点及父子关系受校验；属性类型／枚举按 Profile，不能绕过模型写非法状态；插件不拥有文件树。
- 验收条件：各 Profile 的有效文档可读；非法角色／属性拒绝；保存重载保持节点 id。
- 实现依据：[../src/model/document.ts](../src/model/document.ts)、[../src/model/validation.ts](../src/model/validation.ts)、[../src/profiles/profiles.ts](../src/profiles/profiles.ts)。
- 验证记录：2026-10-03 静态核对；已有测试入口：[../tests/unit/ir.spec.ts](../tests/unit/ir.spec.ts)、[../tests/scenarios/meeting.spec.ts](../tests/scenarios/meeting.spec.ts)、[../tests/scenarios/project.spec.ts](../tests/scenarios/project.spec.ts)、[../tests/scenarios/thinking.spec.ts](../tests/scenarios/thinking.spec.ts)（覆盖范围以用例为准，本次未执行）。

## F002 查询、定位与中文指代

- 实现状态：已实现。
- 场景与预期：读取文档与大纲、搜索节点、选择／读取选择；支持节点 id、标题、@root、@selected、@last_edited、@last_created 等引用。
- 边界与异常：同名多候选要反馈歧义，不随机选；删除节点清理相关指针；无选择时不能猜测“这个”。
- 验收条件：选择后指代可命中；同名返回候选；删除后旧选择引用明确失败。
- 实现依据：[../src/state/references.ts](../src/state/references.ts)、[../src/state/kernel.ts](../src/state/kernel.ts)、[../src/tools/query-tools.ts](../src/tools/query-tools.ts)。
- 验证记录：2026-10-03 静态核对；已有测试入口：[../tests/unit/kernel.spec.ts](../tests/unit/kernel.spec.ts)、[../tests/integration/tools.spec.ts](../tests/integration/tools.spec.ts)（覆盖范围以用例为准，本次未执行）。

## F003 节点与属性修改

- 实现状态：已实现。
- 场景与预期：新增、更新、删除、移动、同级重排节点，改变角色和属性；所有操作经内核校验，默认自动保存（关闭策略见 F009）。
- 边界与异常：禁止把节点移入自身后代，根节点受专门限制；失败不提交半个修改；单一工具职责不能合并成万能 command。
- 验收条件：操作后结构／顺序符合请求；环形移动和非法属性拒绝且文档不变。
- 实现依据：[../src/operations/ops.ts](../src/operations/ops.ts)、[../src/state/kernel.ts](../src/state/kernel.ts)、[../src/tools/mutation-tools.ts](../src/tools/mutation-tools.ts)。
- 验证记录：2026-10-03 静态核对；已有测试入口：[../tests/unit/kernel.spec.ts](../tests/unit/kernel.spec.ts)、[../tests/integration/tools.spec.ts](../tests/integration/tools.spec.ts)（覆盖范围以用例为准，本次未执行）。

## F004 撤销与单调版本

- 实现状态：已实现。
- 场景与预期：默认自动保存时，成功修改与撤销均增加 revision；undo 恢复前一个快照，节点 id 分配保持单调。
- 边界与异常：撤销历史在宿主内存，重启不保证保留；没有 redo 承诺；不可复用已经发出的 id 或回退 revision。autoSave 关闭时普通修改只改变内存，版本在后续保存时推进，不能将默认模式的每步写盘规则套用到关闭模式。
- 验收条件：撤销后内容恢复但 revision 增加；再新增 id 不与已删除节点冲突；无历史时明确反馈。
- 实现依据：[../src/state/kernel.ts](../src/state/kernel.ts)、[../src/state/document-state.ts](../src/state/document-state.ts)、[../src/tools/history-tools.ts](../src/tools/history-tools.ts)。
- 验证记录：2026-10-03 静态核对；已有测试入口：[../tests/unit/kernel.spec.ts](../tests/unit/kernel.spec.ts)（覆盖范围以用例为准，本次未执行）。

## F005 Markdown 与 sidecar 存储

- 实现状态：已实现。
- 场景与预期：Markdown 为内容事实源，sidecar 维护稳定 id／元数据；加载可检测外部文件变化并重解析，修改后保存。
- 边界与异常：只按适配器支持的 Markdown 子集解释；hash 不符不能盲用旧 sidecar；Markdown 已保存但 sidecar 失败要反馈 sidecarSaved，而非宣称完整原子成功。
- 验收条件：往返保存节点内容／id稳定；外部修改被识别；sidecar 写失败有准确结果。
- 实现依据：[../src/storage/markdown-adapter.ts](../src/storage/markdown-adapter.ts)、[../src/storage/storage.ts](../src/storage/storage.ts)、[../src/integration/service.ts](../src/integration/service.ts)。
- 验证记录：2026-10-03 静态核对；已有测试入口：[../tests/unit/markdown-adapter.spec.ts](../tests/unit/markdown-adapter.spec.ts)、[../tests/unit/service.spec.ts](../tests/unit/service.spec.ts)（覆盖范围以用例为准，本次未执行）。

## F006 新建、替换与批量事务

- 实现状态：已实现。
- 场景与预期：create_document 新建文件（重名可取后缀）；replace_document 与 apply_document_patch 在一次事务内替换或批量修改。
- 边界与异常：校验 expected_file、expected_revision 和请求 id；同文件跨会话串行；批量校验失败不部分写入，默认保存成功只增加一次 revision／一次撤销记录；保存失败边界见 F005。
- 验收条件：旧 revision 拒绝；请求幂等；混合合法／非法批次不改变内容；成功批次可一次撤销。
- 实现依据：[../src/tools/transaction-tools.ts](../src/tools/transaction-tools.ts)、[../src/integration/service.ts](../src/integration/service.ts)、[../src/state/kernel.ts](../src/state/kernel.ts)。
- 验证记录：2026-10-03 静态核对；已有测试入口：[../tests/unit/service.spec.ts](../tests/unit/service.spec.ts)、[../tests/integration/tools.spec.ts](../tests/integration/tools.spec.ts)（覆盖范围以用例为准，本次未执行）。

## F007 当前文档服务接缝

- 实现状态：已实现。
- 场景与预期：CurrentFileProvider 和 structuredDocument 服务提供绑定、查询、分发及选择；工作台可以固定目标，外部侧边栏／视图提供当前文件。
- 边界与异常：绑定责任在外部协调者，浏览器随意切换不能越过固定目标约定；路径须满足服务的工作区校验；插件不自己实现文件树或通用编辑器。
- 验收条件：绑定后工具和查询读同一文档；解绑后操作明确失败；外部文件选择可通过服务接入。
- 实现依据：[../src/plugin/current-file.ts](../src/plugin/current-file.ts)、[../src/integration/service.ts](../src/integration/service.ts)、[../src/index.ts](../src/index.ts)。
- 验证记录：2026-10-03 静态核对；已有测试入口：[../tests/unit/service.spec.ts](../tests/unit/service.spec.ts)（覆盖范围以用例为准，本次未执行）。

## F008 模型工具与中文 Skill

- 实现状态：已实现。
- 场景与预期：17 个文档工具覆盖查询、节点修改、撤销、保存和文档事务；中文 Skill 将自然语言映射到工具参数。
- 边界与异常：Skill 不代替内核规则；LLM 不直接改底层 Markdown／JSON；结构化错误包含可处理的信息。
- 验收条件：17 工具注册且信封符合约定；技能可导入；会议／项目／思路场景通过内核执行。
- 实现依据：[../src/tools/register-tools.ts](../src/tools/register-tools.ts)、[../src/tools/envelope.ts](../src/tools/envelope.ts)、[../src/plugin/skill.ts](../src/plugin/skill.ts)。
- 验证记录：2026-10-03 静态核对；已有测试入口：[../tests/integration/tools.spec.ts](../tests/integration/tools.spec.ts)、[../tests/unit/skill.spec.ts](../tests/unit/skill.spec.ts)、[../tests/e2e/skill-install.spec.ts](../tests/e2e/skill-install.spec.ts)（覆盖范围以用例为准，本次未执行）。

## F009 内核配置与保存策略

- 实现状态：已实现。
- 场景与预期：配置默认 Profile、autoSave、静态 currentFile 和 maxUndoSteps；默认自动保存，关闭 autoSave 时需手动 save_document。
- 边界与异常：静态 currentFile 是外部文件提供者的兜底；撤销深度受配置限制；业务属性保存到 Markdown，sidecar v1 在业务修改时迁移，选择不提前迁移。配置来源分层（组装 `base` 与设置页用户覆盖）及 `currentFile` 只在组装层的边界见 F010。
- 验收条件：关闭自动保存时修改保持脏状态，手动保存后文件更新；未指定文档 Profile 使用默认值；v1 选择不改旧 sidecar。
- 实现依据：[../src/plugin/config.ts](../src/plugin/config.ts)、[../src/state/kernel.ts](../src/state/kernel.ts)、[../src/storage/storage.ts](../src/storage/storage.ts)。
- 验证记录：2026-10-03 静态核对；已有测试入口：[../tests/unit/kernel.spec.ts](../tests/unit/kernel.spec.ts)、[../tests/unit/markdown-adapter.spec.ts](../tests/unit/markdown-adapter.spec.ts)（覆盖范围以用例为准，本次未执行）。

## F010 设置页插件配置卡与配置分层

- 实现状态：待实现（2026-10-10 规格增量，用户确认该版文档后开发）。
- 场景与预期：配置分两层——组装配置（`cordis.patch.yml` 的 `config`）注册为设置命名空间的 `base`，设置页用户覆盖位于其上；解析顺序为 schema 默认 → 组装 `base` → 用户层。插件在「设置 → 插件 → 插件配置」提供一张卡片，namespace 为 `dsh-structured-document`，`applies: 'live'`（保存后按当前值即时生效，插件经 `getConfig()` 读取）。卡片字段：`defaultProfile`（select：`meeting`／`project`／`thinking`，默认 `meeting`）、`autoSave`（switch，默认 `true`）、`maxUndoSteps`（number，默认 `100`，最小 1）。
- 边界与异常：`currentFile` 不进卡片，也不进该命名空间的 schema——它是外部集成接缝（谁提供“当前文件”），继续只在组装层配置，运行时的当前文件仍由 `CurrentFileProvider`／工作台绑定决定，静态值只是兜底。设置服务是软依赖：`settings` 不写进插件的必需 `inject`，用 `ctx.inject(['settings'], sctx => …)` 在服务可用时接入（`register` 或 `installSection`）；服务缺失时回退到只读的组装配置，插件照常挂载、工具与 Skill 照常工作。客户端半边的 `settingsScope` 同样是软依赖：服务不存在或该 namespace 未被宿主服务时不渲染卡片，也不影响插件其它能力。写入走设置文档、按用户持久化，能标记“被覆盖”并把字段重置为组装默认值；写入受 revision 围栏保护，用旧快照保存被拒（`SettingsConflictError`）而不是覆盖较新值，失败时保留草稿。字段非法取值由 schema 拒绝并明确报错（如 `defaultProfile: 'weekly'`、`maxUndoSteps: 0`），不静默当作默认值。卡片自己拥有控件与文案：官方只提供 `numberField`／`textField` 与 `ValueField`／`SecretField`，select 与 switch 需卡片自建 `format`／`parse` 与控件，保存仍走共享的 `CardForm` 单点写入。
- 验收条件：设置页出现本插件卡片且字段与上面清单一致；`defaultProfile` 保存后，装载无 sidecar 历史的文档使用新模板；`autoSave` 关闭后普通修改保持脏状态、需手动 `save_document`，重新打开后恢复自动保存；`maxUndoSteps` 设为 1 时只保留最近一步撤销，设为 0 或非整数被拒并给出错误；被覆盖字段有“已覆盖”标记，重置后回到组装值（组装未设则回 schema 默认）；用旧 revision 保存被拒并保留草稿；设置文档中的非法值被 schema 拒绝、插件不静默改变行为；`currentFile` 不出现在卡片，卡片保存后组装层的 `currentFile` 语义不变；设置服务缺失时插件仍挂载、工具可用且不渲染卡片；用户未覆盖时用组装值，覆盖后组装值不再生效，重置后重新生效。
- 实现依据：待实现；预期改动 [../src/plugin/config.ts](../src/plugin/config.ts)（命名空间常量与卡片字段 schema，`currentFile` 不进入该 schema）、[../src/index.ts](../src/index.ts)（软依赖接入与 `getConfig()`）、[../src/context-types.ts](../src/context-types.ts)（settings 可选服务面）；待新增 `src/client/index.tsx`（卡片：`ctx.settingsScope.bind` + `settings.plugin.item` slot，key 为命名空间）、`tsdown.config.ts`（客户端半边 bundle，loader id 必须等于包名）；[../package.json](../package.json) 预期增加 `dsh.client`、`exports["./client"]` 与客户端构建步骤（本版文档不改动该文件）。
- 验证记录：本版为文档增量，未运行任何验证。

## 差异与验证待办

- 旧 README 的 14 个工具已过时，当前包含三个文档事务工具，共 17 个；本次同步入口说明。
- AGENTS 的 current-file TODO 引用过时，当前 Provider／服务已实现；文件树仍由外部拥有。
- 旧架构／README 泛称任何保存步骤失败都回滚，与内核和既有 sidecar 失败测试不符；本次按明确代码决策和测试澄清 F005：Markdown 已保存时不回滚业务数据，单独报告 sidecarSaved=false。
- 工具和内核测试文件是验证入口；本次不重跑全量场景，不宣称外部编辑器与跨插件 GUI 通过。
- 2026-10-10 增量：F010 尚无实现与验证。附带待同步项——`README.md`／`README.zh-CN.md` 的配置表与 `docs/usage.md` 目前只描述组装层配置，实现时需补“设置页用户覆盖优先于组装值、`currentFile` 只在组装层”的说明。本插件当前没有浏览器半边（`package.json` 无 `dsh.client`、构建只有 `tsc`），F010 会首次引入客户端 bundle 与相应构建步骤：**用户已于 2026-10-10 确认授权新增该结构**，实现时按 F010 实现依据落地。

## 规格变更记录

- 2026-10-03：首次从现行文档、实现和现有测试建立功能基线；仅修改维护文档，未变更 API、存储或运行逻辑。
- 2026-10-10：新增 F010（设置页插件配置卡与配置分层），配置契约同步到 [architecture.md](architecture.md) 的「配置契约」。本版为待用户确认的文档增量，未改动源码、测试或运行配置，未提高包版本。
