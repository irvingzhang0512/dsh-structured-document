# dsh-structured-document OpenSpec 迁移索引

迁移日期：2026-10-22。范围是开发需求与规格的文档整理；不修改原始需求、旧 docs、项目内容、examples、运行 Skill、源码、测试、配置或版本。README 与 AGENTS 只更新路由。

## 唯一规格源与使用规则

- 当前行为以本库 openspec/specs 为唯一可编辑规格；旧 docs/SPEC.md 原位冻结，其中“可编辑”及旧开发入口描述不再作为维护入口。
- 未实现或待确认设计在 openspec/changes，批准、实施与验证分别登记；本轮整理授权不等于批准业务开发。
- 旧 SPEC、原始需求及既有历史证据冻结保留；ARCHITECTURE、CONFIG、tools、usage 等当前技术与使用文档仅本轮保持字节不变。后续功能的契约变化先写 change/design，与规格一起审阅；实现后可同步当前技术／使用说明，保持引用一致，不改写原始需求或既有历史证据。个人项目资料不因开发需求整理而修改。
- 新功能：proposal/specs/design/tasks → 具体版本确认 → 实现与验证 → 同步主规格并归档。预期不变的 Bug 按现行规格修复。
- 使用维护仓库固定 OpenSpec 1.14.3 CLI 校验本库，不安装第二套开发依赖、不新增运行 Skill。

## 原文档分类

| 原文件 | 分类与处理 |
|---|---|
| [docs/DESKTOP-WORKFLOWS-20261014.md](../docs/DESKTOP-WORKFLOWS-20261014.md) | 原待确认技术设计；完整规则迁入对应 change |
| [AGENTS.md](../AGENTS.md) | 开发／阅读入口；仅追加 OpenSpec 路由 |
| [CHANGELOG.md](../CHANGELOG.md) | 本轮原位保留；当前技术／使用说明后续可随已确认实现同步，历史证据保持原记录 |
| [README.md](../README.md) | 开发／阅读入口；仅追加 OpenSpec 路由 |
| [README.zh-CN.md](../README.zh-CN.md) | 开发／阅读入口；仅追加 OpenSpec 路由 |
| [docs/DSH-UPGRADE-20261011.md](../docs/DSH-UPGRADE-20261011.md) | 本轮原位保留；当前技术／使用说明后续可随已确认实现同步，历史证据保持原记录 |
| [docs/DSH-UPGRADE-20261017.md](../docs/DSH-UPGRADE-20261017.md) | 本轮原位保留；当前技术／使用说明后续可随已确认实现同步，历史证据保持原记录 |
| [docs/SPEC.md](../docs/SPEC.md) | 旧规格；原文冻结，编号已迁入下表 |
| [docs/VERIFICATION-OFFICE-20261018.md](../docs/VERIFICATION-OFFICE-20261018.md) | 本轮原位保留；当前技术／使用说明后续可随已确认实现同步，历史证据保持原记录 |
| [docs/architecture.md](../docs/architecture.md) | 本轮原位保留；当前技术／使用说明后续可随已确认实现同步，历史证据保持原记录 |
| [docs/ir.md](../docs/ir.md) | 本轮原位保留；当前技术／使用说明后续可随已确认实现同步，历史证据保持原记录 |
| [docs/profiles.md](../docs/profiles.md) | 本轮原位保留；当前技术／使用说明后续可随已确认实现同步，历史证据保持原记录 |
| [docs/release-checklist.md](../docs/release-checklist.md) | 本轮原位保留；当前技术／使用说明后续可随已确认实现同步，历史证据保持原记录 |
| [docs/skill.md](../docs/skill.md) | 本轮原位保留；当前技术／使用说明后续可随已确认实现同步，历史证据保持原记录 |
| [docs/tools.md](../docs/tools.md) | 本轮原位保留；当前技术／使用说明后续可随已确认实现同步，历史证据保持原记录 |
| [docs/usage.md](../docs/usage.md) | 本轮原位保留；当前技术／使用说明后续可随已确认实现同步，历史证据保持原记录 |
| [examples/meeting/weekly-meeting.md](../examples/meeting/weekly-meeting.md) | 项目／业务示例，原位保护 |
| [examples/project/person-detection.md](../examples/project/person-detection.md) | 项目／业务示例，原位保护 |
| [examples/thinking/report-outline.md](../examples/thinking/report-outline.md) | 项目／业务示例，原位保护 |
| [requirements.txt](../requirements.txt) | 原始需求，只读历史 |
| [skills/structured-document/SKILL.md](../skills/structured-document/SKILL.md) | 运行 Skill，原位保护 |

## 稳定编号、Requirement 与场景映射

每条 F 编号对应同名 Requirement；场景编号为 Fxxx-S01 起顺序，完整保留原行为、边界和验收段落。迁移不把旧测试结果改记为本轮运行通过。

| 编号 | 唯一编辑位置 | 场景与状态 |
|---|---|
| F001 统一文档 IR 与 Profile | [规格](specs/document-ir/spec.md) | F001-S01–S03；既有行为；验证按历史证据分层 |
| F002 查询、定位与中文指代 | [规格](specs/document-query/spec.md) | F002-S01–S03；既有行为；验证按历史证据分层 |
| F003 节点与属性修改 | [规格](specs/document-mutation/spec.md) | F003-S01–S03；既有行为；验证按历史证据分层 |
| F004 撤销与单调版本 | [规格](specs/document-history/spec.md) | F004-S01–S03；既有行为；验证按历史证据分层 |
| F005 Markdown 与 sidecar 存储 | [规格](specs/document-storage/spec.md) | F005-S01–S03；既有行为；验证按历史证据分层 |
| F006 新建、替换与批量事务 | [规格](specs/document-transactions/spec.md) | F006-S01–S03；既有行为；验证按历史证据分层 |
| F007 当前文档服务接缝 | [规格](specs/document-binding/spec.md) | F007-S01–S03；既有行为；验证按历史证据分层 |
| F008 模型工具与中文 Skill | [规格](specs/document-tools-skill/spec.md) | F008-S01–S03；既有行为；验证按历史证据分层 |
| F009 内核配置与保存策略 | [规格](specs/document-configuration/spec.md) | F009-S01–S03；既有行为；验证按历史证据分层 |
| F010 设置页插件配置卡与配置分层 | [规格](specs/configuration-card/spec.md) | F010-S01–S03；既有行为；验证按历史证据分层 |
| F011 设置卡外观对齐宿主卡片 | [规格](specs/configuration-card-presentation/spec.md) | F011-S01–S04；既有行为；验证按历史证据分层 |
| F012 宿主固定绑定所有权 | [规格](changes/desktop-document-workflows/specs/fixed-binding-ownership/spec.md) | F012-S01–S03；待确认／未实现 |
| F013 Desktop 即时配置与旧配置迁移 | [规格](changes/desktop-document-workflows/specs/desktop-live-configuration/spec.md) | F013-S01–S03；待确认／未实现 |
| F014 三场景工具投影与项目无损回归 | [规格](changes/desktop-document-workflows/specs/document-workflow-projection/spec.md) | F014-S01–S03；待确认／未实现 |
| F015 插件列表与详情的显示名称 | [规格](specs/plugin-presentation/spec.md) | F015-S01–S05；既有行为；验证按历史证据分层 |
| F016 统一版本与固定交付 | [规格](specs/fixed-delivery/spec.md) | F016-S01–S05；既有行为；验证按历史证据分层 |

## 原始需求章节去向

原始需求中的样例、个人项目正文、图示与建议接口原位保留；下表逐组区分已承接、被替代、明确边界和历史候选，不宣称原需求全数实现。

| 原章节 | 内容 | 去向 | 状态与差异 |
|---|---|---|---|
| 1–5 | 名称、定位、语言、链路和三场景 | F001/F008/F015 | 当前 IR/工具/Skill 承接；示例项目内容原位保护。 |
| 6–11 | Document/Node/标题/正文/Role/Properties/Metadata | F001/F005 | 角色属性按实际 Profile；编号与业务叙述原样保存，不将示例属性推广为全部项目必须字段。 |
| 12 | 当前文件与中文引用状态 | F002/F007；desktop-document-workflows | 原 Current File TODO 已有服务接缝；宿主 lease 固定绑定是待确认增量。 |
| 13 | 编辑状态 | F007；future-document-editing | 当前文件存在即可操作；纯语音开始/结束编辑仍历史候选。 |
| 14–17 | 单职责查询和修改工具 | F002/F003/F008 | 读取、查找、选择、增删改、移动、重排、角色及属性覆盖；不存在万能 command。 |
| 18 | undo/redo | F004；future-document-editing | undo 已有且版本单调；redo 未交付，单列待讨论。 |
| 19 | 合并、拆分、批量编辑 | F006；future-document-editing | apply_document_patch 承接批量事务；merge_nodes/split_node 专用语义未交付。 |
| 20 | 自动保存 | F005/F009 | Markdown 已保存但 sidecar 失败不回滚正文；手动保存模式不套用每步 revision 增加。 |
| 21–23 | Skill 与中文自然语言 | F002/F008 | 先查询、歧义返回候选、组合单职责工具；运行 Skill 原样保留。 |
| 24–26 | 工具信封、错误码与结构校验 | F001/F003/F008 | 以现有工具/IR契约为准；现有结构化错误与正文不会在文档迁移时改写。 |
| 27 | V0.1 暂不实现 | F007；future-document-editing | 文件树、Sidebar、复杂富文本等保持边界；后续新增事务已由 F006 明确，不以旧阶段列表否定已落地内容。 |
| 28–32 | 发布、README、结构与测试要求 | F008/F015/F016；迁移索引 | 属于开发/交付与历史测试设计，不是本次产品测试通过证据；原release-checklist保持。 |
| 33 | 会议十个场景用例 | F001–F004/F008；R033 | 大纲、议题、内容、结论、决定、待办、负责人、移动、撤销映射当前内核；原姓名与业务样本不复制。 |
| 34 | 项目十个场景用例 | F001–F004/F008；R034；desktop-document-workflows | 选阶段、加任务、负责人/状态、风险、移动/排序、目标标题、删除/撤销；原进度例子不是把业务文字改整数的授权。 |
| 35 | 思路八个场景用例 | F001–F004/F008；R035 | 想法、方案、疑问、位置、标题、结构与连续指代映射当前工具。 |
| 36–38 | 多轮、歧义、真实体验 | F002/F008；desktop-document-workflows | 保留原验收设计；测试存在不等于本轮执行，真实Desktop验证独立。 |
| 39–42 | 开发流程、顺序、验收与定义 | F001–F016；迁移索引 | 后续流程采用OpenSpec；原流程及项目文档冻结留存，不修改原信息。 |

## 历史验证与状态差异

- [原 SPEC](../docs/SPEC.md) 保留逐项实现依据、测试文件、历史批准与未验证项；[2026-10-17兼容记录](../docs/DSH-UPGRADE-20261017.md) 与 [2026-10-18交付验证](../docs/VERIFICATION-OFFICE-20261018.md) 分别记录实际通过范围。
- 本次只做文档结构、来源覆盖、链接、差异与保护散列检查，没有执行产品测试、真实模型调用、GUI、数据迁移、安装或重启；没有提高版本、提交或推送。
- 2026-10-17 已交付的冷会话/原生传输兼容修复纳入主规格；它们不代表 2026-10-14 全部工作流（F012–F014）已实现。旧 Web 设置与GUI记录不外推为目标 Desktop 配置卡可用。

### 未定事项入口

- 原 SPEC 的“差异与验证待办”原样留存；其中历史状态必须结合上面的较新证据，不重复建立已完成任务。
- 原 SPEC 的“规格变更记录”原样留存；其中历史状态必须结合上面的较新证据，不重复建立已完成任务。
- 未定义完整验收的历史候选不默认批准；实施时先补齐可审核场景，确认后再动代码。

## 原始场景逐项验收映射

[三场景与中文连续操作](specs/document-scenario-acceptance/spec.md) 承接原始第 33 章十项会议案例（R033-S01–S10）、第 34 章十项项目案例（R034-S01–S10）、第 35 章八项思路案例（R035-S01–S08）及第 36–38 章多轮/歧义/真实体验。仅将样本换为通用描述，原个人项目数据和姓名未复制。progress 数值案例仅限声明了该属性的合成任务，不把文字进展改为整数。

## 配置卡实际接入边界

2026-10-22 只读核对 src/plugin/config.ts、src/index.ts、src/client/index.tsx：仍保留 SETTINGS_NAMESPACE、settings.register、settingsScope 与 settings.plugin.item 旧接入。2026-10-17 升级记录只确认冷会话目录解析兼容修复，并明确未实施待确认工作流。主规格 F010/F011 保留已确认的层叠、冲突、软依赖、外观与草稿预期，不能据根升级记录声称当前 Desktop 卡片已接入 configForms 或完成即时保存。新 Config/volatile、实际 entry ID、configForms 与配置迁移仍在 desktop-document-workflows 的 F013；旧 API 只作原实现来源，不作为目标 Desktop 接口指令。

## 本轮文档验证

- 使用固定 OpenSpec 1.14.3 执行 validate --all --strict --no-interactive：16 项通过、零失败；git diff --check 通过。
- 与本轮开始前逐文件 SHA-256 比较：69 个原文件字节不变；只修改 AGENTS/README 路由文件并新增 openspec 文档。已有未提交文档差异保持。
- 新 OpenSpec Markdown 本地链接及锚点检查通过；未完成业务任务全部未勾选，没有产品测试、安装、迁移、提交或推送。


## 2026-11-04 rc5升级增量

[adapt-dsh-021-rc5 v1](changes/adapt-dsh-021-rc5/proposal.md) 承接本次固定组合适配；具体文档待确认、实现待实施、验证另记。既有编号及历史证据保持，未确认前不合入主规格。


## 2026-11-04 DSH 0.2.2-rc.1 升级增量

[adapt-dsh-022-rc1 v1](changes/adapt-dsh-022-rc1/proposal.md) 记录新目标的适配、迁移与验收；具体文件待确认、实现待实施，验证另记。旧编号及历史来源保持，未提前同步主规格。
