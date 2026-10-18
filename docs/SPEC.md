# dsh-structured-document 当前功能规格

本次升级文档版：`dsh-upgrade-20261011-v1`（2026-10-11，待用户确认）。F007–F011；回归 F001–F006 的目标宿主适配与迁移验收见 [DSH 升级适配契约](DSH-UPGRADE-20261011.md)；本次变更待实现，尚未通过目标版本验证。其余功能与原有待确认设计保持原状态，下面的历史证据不自动证明 DSH 0.2.0-rc.2 兼容。

基线日期：2026-10-03；包版本：0.1.0；核对的源码提交：`2df8d3348a7f668330bf8e680a68001478f93418`。此提交是首次整理前的实现基线，后续文档提交不提高包版本。

2026-10-10 增量：新增 F010（设置页插件配置卡与配置分层），技术契约同步到 [architecture.md](architecture.md) 的「配置契约」。该版经用户确认后已实现并验证，包版本提高到 0.2.0；本插件的浏览器半边（`src/client/`、`tsdown.config.ts`、`package.json` 的 `dsh.client`）随 F010 首次引入，用户已于 2026-10-10 确认授权新增该结构。

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

- 实现状态：已实现（2026-10-10 按用户确认的该版文档落地；包版本提高到 0.2.0）。
- 场景与预期：配置分两层——组装配置（`cordis.patch.yml` 的 `config`）注册为设置命名空间的 `base`，设置页用户覆盖位于其上；解析顺序为 schema 默认 → 组装 `base` → 用户层。插件在「设置 → 插件 → 插件配置」提供一张卡片，namespace 为 `dsh-structured-document`，`applies: 'live'`（保存后按当前值即时生效，插件经 `getConfig()` 读取）。卡片字段：`defaultProfile`（select：`meeting`／`project`／`thinking`，默认 `meeting`）、`autoSave`（switch，默认 `true`）、`maxUndoSteps`（number，默认 `100`，最小 1）。
- 边界与异常：`currentFile` 不进卡片，也不进该命名空间的 schema——它是外部集成接缝（谁提供“当前文件”），继续只在组装层配置，运行时的当前文件仍由 `CurrentFileProvider`／工作台绑定决定，静态值只是兜底。设置服务是软依赖：`settings` 不写进插件的必需 `inject`，用 `ctx.inject(['settings'], sctx => …)` 在服务可用时接入（`register` 或 `installSection`）；服务缺失时回退到只读的组装配置，插件照常挂载、工具与 Skill 照常工作。客户端半边的 `settingsScope` 同样是软依赖：服务不存在或该 namespace 未被宿主服务时不渲染卡片，也不影响插件其它能力。写入走设置文档、按用户持久化，能标记“被覆盖”并把字段重置为组装默认值；写入受 revision 围栏保护，用旧快照保存被拒（`SettingsConflictError`）而不是覆盖较新值，失败时保留草稿。字段非法取值由 schema 拒绝并明确报错（如 `defaultProfile: 'weekly'`、`maxUndoSteps: 0`），不静默当作默认值。卡片自己拥有控件与文案：官方只提供 `numberField`／`textField` 与 `ValueField`／`SecretField`，select 与 switch 需卡片自建 `format`／`parse` 与控件，保存仍走共享的 `CardForm` 单点写入。
- 验收条件：设置页出现本插件卡片且字段与上面清单一致；`defaultProfile` 保存后，装载无 sidecar 历史的文档使用新模板；`autoSave` 关闭后普通修改保持脏状态、需手动 `save_document`，重新打开后恢复自动保存；`maxUndoSteps` 设为 1 时只保留最近一步撤销，设为 0 或非整数被拒并给出错误；被覆盖字段有“已覆盖”标记，重置后回到组装值（组装未设则回 schema 默认）；用旧 revision 保存被拒并保留草稿；设置文档中的非法值被 schema 拒绝、插件不静默改变行为；`currentFile` 不出现在卡片，卡片保存后组装层的 `currentFile` 语义不变；设置服务缺失时插件仍挂载、工具可用且不渲染卡片；用户未覆盖时用组装值，覆盖后组装值不再生效，重置后重新生效。
- 实现依据：[../src/plugin/config.ts](../src/plugin/config.ts)（`SETTINGS_NAMESPACE`／`PROFILE_IDS`／`SettingsConfig`／`resolveConfig`，`currentFile` 不进入设置 schema）、[../src/index.ts](../src/index.ts)（软依赖 `ctx.inject(['settings'], …)`、组装 `base` 注册、`KernelOptions` 三字段 getter 与 `readLiveConfig` 读取侧兜底）、[../src/context-types.ts](../src/context-types.ts)（`SettingsServiceFace`／`SettingsScopeFace`／`SettingsConsumerContext` 结构镜像）、[../src/client/index.tsx](../src/client/index.tsx)（`settings.plugin.item` 卡片，key = 命名空间；`ctx.inject(['settingsScope'], …)` 软挂载）、[../tsdown.config.ts](../tsdown.config.ts)（客户端 bundle，loader id 等于包名）、[../package.json](../package.json)（`dsh.client` 与 `exports["./client"]`）。
- 验证记录：2026-10-10 本次执行——`npx vitest run` 通过（11 个文件、119 个用例全绿，含新增的 [../tests/unit/settings-config.spec.ts](../tests/unit/settings-config.spec.ts) 12 项）；`npm run typecheck` 通过（零错误）；`npm run build` 通过（`tsc` 产物 + `tsdown` 客户端 bundle `lib/client.js` 16.43 kB）。未执行项：未在真实 DSH web profile 中打开设置页做 GUI 目视核对，未验证写入围栏（`SettingsConflictError`）在真实宿主的端到端表现——这两项留待安装验证，本记录不宣称通过。构建产物 `lib/` 由 `.gitignore` 忽略，未纳入跟踪。

## F011 设置卡外观对齐宿主卡片

- 实现状态：已实现（2026-10-10 按用户确认的该版文档落地；外观变更并入 0.2.0，不提高包版本）。
- 场景与预期：F010 的设置卡不再自绘"扁平、常展开的盒子"，改为按宿主 `PluginCard` 的布局画出**可折叠卡片**：头部（`<button>`）显示插件名 + 版本号 + 一句副标题，右侧放覆盖状态（"用户覆盖"／"继承组装层"）与 chevron（展开时旋转 180°）；主体是**带分隔线的设置行**，每行左侧为标签与说明（标签 13px/20、说明 12px/18 次级色）、**控件行内右对齐**——`默认场景模板` 行右侧为下拉、`自动保存` 行右侧为开关、`撤销栈深度` 行右侧为数字输入；保存与放弃按钮移到卡片右下角操作行。样式一律使用 `--dsw-alias-*` 主题令牌并给兜底值。**卡片 chrome 的数值以宿主 `PluginCard` 的真实规则为准**（本插件卡片与宿主内置卡片同页并列，对比基准是宿主）：`.5px solid --dsw-alias-border-l4` + `background:bg-layer-3` + `border-radius:16px`，展开态 `background:bg-layer-2` + `border-color:label-dimmed`；主体／设置行／操作行的分隔线同为 `.5px --dsw-alias-border-l2`。其余布局（头部、行、操作行、分段控件、输入框）照 [开发 Skill 的卡片外观配方](../../.agents/skills/dsh-plugin-develop/references/config-ui.md) §8。
- 边界与异常：本次只改外观与文案，**不改 F010 的配置语义**——草稿 + 保存（`settingsScope` 的 `set`／`unset`／`mutate` 与 revision 栅栏）、清除回退组装层、`currentFile` 不进卡片也不进 schema、设置服务与 `settingsScope` 软依赖，全部不变。不得 import `@deepseek-ai/dsh-client-ui-settings-plugins` 的值（客户端纯度门禁会拦）。卡片收起只隐藏主体、组件保持挂载，**未保存草稿不因收起丢失**；窄宽度下标签列与控件不得重叠或溢出。
- 验收条件：与宿主自带卡片、插件市场卡片并排时视觉语法一致（可折叠头部、行间分隔线、控件右对齐、操作按钮在右下角）；头部显示插件名、版本号与副标题；覆盖状态随"字段是否出现在用户层"变化；三行的控件类型与 F010 字段一致（下拉／开关／数字，且数字最小 1）；保存与放弃行为与 F010 相同；键盘可达（头部按钮可聚焦、`aria-expanded` 与主体 `id` 正确关联）。
- 实现依据：[../src/client/index.tsx](../src/client/index.tsx)（`SettingsCard`：`section` 外框 + `dsd-card`／`dsd-card-open`、头部 `<button>` 带 `aria-expanded` 与 `aria-controls`、三行 `dsd-row` + `dsd-label-box` + 右对齐控件、`dsd-footer` 操作行；`injectStyle()` 的卡片 chrome 按宿主 `PluginCard.module.css` 的真实数值逐条对齐（已从本机 `@deepseek-ai/dsh-client-ui-settings-plugins` 产物核对），其余布局照 §8 配方）、[../tsdown.config.ts](../tsdown.config.ts)（`readOwnVersion()` 读本包 `package.json` 的 `version`，经 `define` 注入 `__DSD_VERSION__`，构建期内联为字面量）、[../tests/unit/client-card.spec.ts](../tests/unit/client-card.spec.ts) 与 [../tests/unit/hook-runtime.ts](../tests/unit/hook-runtime.ts)（无 DOM 渲染器下的组件测试）。
- **版本号的取得方式（本次取舍）**：版本号**不硬编码**，由构建期从 `package.json` 的 `version` 读取并 `define` 注入（`__DSD_VERSION__`），浏览器 bundle 里只剩一个字符串字面量——运行时不读文件、不引入 Node 内建、不违反客户端纯度门禁。源码以 `declare const __DSD_VERSION__: string | undefined` 声明，未打包直接运行源码时回退为 `'0.0.0-dev'`（只影响显示）。已实测：`lib/client.js` 中为 `const PLUGIN_VERSION = "0.2.0";`。用例断言源码里不出现与 `package.json` 相同的版本字面量，防止发版漂移。对比方案（从 `settingsScope` 快照或宿主 API 读版本）不可行：快照只暴露设置值，不含插件版本。
- 验证记录：2026-10-10 本次执行——`npm run typecheck` 通过（零错误，含对 `src` 的严格检查；新增测试文件另用等价 tsc 参数单独检查，零错误）；`npm test` 通过（`build:client` + vitest，**12 个文件、141 个用例全绿**：F010 原有 119 项全部保持通过，新增 [../tests/unit/client-card.spec.ts](../tests/unit/client-card.spec.ts) 22 项覆盖 slot／key 与宿主命名空间一致、`aria-expanded`／`aria-controls` 关联与折叠翻转、三行控件类型与标签（下拉／`role=switch`／`number min=1`）、覆盖徽标文案随用户层变化（含"覆盖值等于组装值仍是覆盖"）、收起后草稿仍在（真实状态流：编辑 → 收起 → 再展开，且全程无写入）、保存提交带 revision 栅栏的单条 mutation、放弃修改清空草稿、**卡片 chrome 已按宿主真实数值（`.5px` + `border-l4` + `radius:16px`）对齐**、纯度与主题令牌白名单）；`npm run build` 通过（`tsc` 产物 + `tsdown` 客户端 bundle `lib/client.js`）。产物核对：`PLUGIN_VERSION = "0.2.0"` 已内联、`aria-expanded`／`aria-controls`／`dsd-footer` 存在、无 `@deepseek-ai/*` value import、无 Node 内建 `require`。**与真实宿主 CSS 的差异：无（已按宿主真实数值 `.5px` + `radius:16px` + `--dsw-alias-border-l4` 对齐；插件市场的 `1px` + `border-l2` + `radius:12px` 只是它对宿主的近似，未采用）**。**未执行项**：未在真实 DSH web profile 中打开设置页做浏览器目视核对（需用户重载页面后自行确认与宿主内置卡片的并排观感），未验证写入围栏（`SettingsConflictError`）在真实宿主的端到端表现。构建产物 `lib/` 由 `.gitignore` 忽略，未纳入跟踪。

## 差异与验证待办

- 旧 README 的 14 个工具已过时，当前包含三个文档事务工具，共 17 个；本次同步入口说明。
- AGENTS 的 current-file TODO 引用过时，当前 Provider／服务已实现；文件树仍由外部拥有。
- 旧架构／README 泛称任何保存步骤失败都回滚，与内核和既有 sidecar 失败测试不符；本次按明确代码决策和测试澄清 F005：Markdown 已保存时不回滚业务数据，单独报告 sidecarSaved=false。
- 工具和内核测试文件是验证入口；本次不重跑全量场景，不宣称外部编辑器与跨插件 GUI 通过。
- 2026-10-10 增量：F010 已实现并验证（见条目的实现依据与验证记录）。附带同步项已完成：`README.md`／`README.zh-CN.md` 的配置表与 `docs/usage.md` 已补“设置页用户覆盖优先于组装值、`currentFile` 只在组装层”的说明。本插件此前没有浏览器半边（`package.json` 无 `dsh.client`、构建只有 `tsc`），F010 首次引入客户端 bundle 与相应构建步骤（`src/client/`、`tsdown.config.ts`、`dsh.client`／`exports["./client"]`）：**用户已于 2026-10-10 确认授权新增该结构**，本次按 F010 实现依据落地。
- F010 实现中发现并修复的一处实现缺陷（不改规格语义）：`getConfig()` 原先直接把 `liveScope.get()` 的异常抛给调用方，而宿主 provider 是**惰性**校验 `base`（注册不报错、首次 `get()` 才合并用户层并过 schema），导致越界的组装值在 `apply()` 内第一次读配置时抛错、插件整块挂载失败。已按 F010 边界条款把兜底移到读取侧（`readLiveConfig`）：捕获后告警一次并退回组装配置，越界值仍由内核按原有语义明确报错，不静默改成 schema 默认值。
- 2026-10-10（F011）遗留的未执行项：未在真实 DSH web profile 中做设置页的浏览器目视核对。视觉结论（与宿主内置卡片并排是否一致）需用户重载页面后自行确认；本记录不宣称 GUI 通过。另：卡片展开态、窄宽度表现均由样式配方与结构断言保证，未做真实布局引擎下的像素核对。卡片 chrome 的数值已改用宿主 `PluginCard` 的真实规则（`.5px` + `--dsw-alias-border-l4` + `radius:16px`），不再采用插件市场的近似值（`1px` + `border-l2` + `radius:12px`）。

## 规格变更记录

- 2026-10-03：首次从现行文档、实现和现有测试建立功能基线；仅修改维护文档，未变更 API、存储或运行逻辑。
- 2026-10-10：新增 F010（设置页插件配置卡与配置分层），配置契约同步到 [architecture.md](architecture.md) 的「配置契约」。本版为待用户确认的文档增量，未改动源码、测试或运行配置，未提高包版本。
- 2026-10-10（实现收尾）：F010 按用户确认的该版文档实现并验证：实现状态改「已实现」，补实现依据与本次真实验证记录，包版本提高到 0.2.0；未变更 F001–F009 的规格语义。同步 README／README.zh-CN／usage 的配置分层说明。
- 2026-10-10（F011）：新增 F011（设置卡外观对齐宿主卡片），把 F010 的设置卡从"自绘扁平盒子"改为按宿主 `PluginCard` 外观语法绘制。**三项取舍经用户确认**：① 保存模型保持"草稿 + 右下角保存"（不改 F010 的 `settingsScope` set／unset／mutate 与 revision 栅栏）；② 本仓库无 `dock` 项，`自动保存` 用开关（分段控件配方保留在 §8，本插件的布尔项用 `role=switch` 更贴合宿主观感）；③ 头部带插件版本号，版本号由构建期从 `package.json` 注入而非硬编码。**外观数值以宿主为准**：卡片 chrome 采用宿主 `PluginCard` 的真实规则（`.5px` + `--dsw-alias-border-l4` + `radius:16px`，展开态 `bg-layer-2` + `label-dimmed`），插件市场把同一规则近似成 `1px` + `border-l2` + `radius:12px`，本插件不采用该近似（本插件卡片与宿主内置卡片同页并列，比对基准是宿主）。本次为外观与文案变更，未变更 F010 的配置语义与 F001–F009 的规格语义；包版本保持 0.2.0（该版本尚未推送发布，外观变更并入同一条目）。

## F015 插件列表与详情的显示名称

- 文档版：office-suite-implementation-20261018-v1；用户在本会话完整引用该实施方案并明确 PLEASE IMPLEMENT THIS PLAN，确认同版名称、简介、版本、组合和验收。原有其他待确认功能不在授权范围。
- 实现状态：已实现；验证另记。
- 场景与预期：中文显示「Irving · 结构化文档」，英文显示「Irving · Structured Documents」；保留完整包名 dsh-structured-document 与全部运行标识。
- 中文简介：按节点和层级组织文档，支持 Agent 在讨论中通过工具定位、修改和重组内容。
- 英文简介：Organize documents by nodes and hierarchy so Agents can locate, edit, and restructure content through tools during a discussion.
- 技术契约：导出 locale/en.json 与 locale/zh.json 的 meta.title／meta.description；exports["./locale/*.json"] 指向对应资源，files 分发 locale，package.description 使用中文简介兜底。客户端设置／详情标题同步；功能导航不强制改名。
- 验收：目标宿主从固定 tgz 解析两语言名称／简介，原生列表、详情、成员行一致；无新增布局溢出，原工具／配置／存储保持。新套件成员在隔离验证后交付日常。

## F016 统一版本与固定交付

- 实现状态：已实现；依据同版已确认实施方案。
- 包版本统一为 0.2.1-rc.2+rev.1；宿主与官方 peers 仍为实际要求的原版本。完整字符串、源码 SHA 和产物散列同时校验，不能使用忽略 build metadata 的 SemVer 判断修订升级。
- Chatty／Automation 的原比较接口保留，规范后缀改为 +rev.N，N 为无前导零的安全正整数；跨官方基线拒绝。旧版本仅由明确迁移映射及原锁／散列接管，不能把旧后缀 .1 与 rev.1 当作无需更新。
- 本包可独立安装，也可由 dsh-office-bundle 携带；套件采用 cordis:group 保留本包原条目 id、config、inject。总开关卸载全部成员，重开恢复各自 disabled；原单独 Bundle 停用选择在接管时迁移为本条目 disabled。独立入口与套件入口不能重复组装。
- 配置／数据：没有业务字段改名或存储搬迁；套件接管仅处理组合选择与既有 disabled 字段，保留未知配置、工具引用、文档和凭据。迁移 CAS／备份／冲突／回滚由根维护入口执行。
- 验收：完整产物、版本迁移、原功能回归；成员还需唯一实例、旧配置命中、总／子开关与业务资料保留。具体记录见 VERIFICATION-OFFICE-20261018.md（完成后生成）。

- 本次自动验证：144项测试通过，类型／构建或Chatty客户端／lint通过；原生固定包与日常交付尚待本次后续验收，不能复用历史结果。
