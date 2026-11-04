# Changelog

## 0.2.1-rc.5+rev.1（2026-11-04）

更新rc5宿主依赖、完整运行产物及实际受影响兼容检查，侧栏目标0.28.2；保留原业务配置和数据。适用类型检查／测试／构建通过，原生与外部服务另记。


## 0.2.1-rc.3+rev.1（2026-10-25）

- 官方依赖和产物对齐 rc3；合成数据测试覆盖原文档读写、历史与撤销，不改变个人资料或存储格式。
- 目标 SDK 下代码检查通过（144 项测试）；完整资源随固定提交提供，原生／日常／试用证据另行登记，见 [升级记录](docs/DSH-RC3-20261025.md)。

## 0.2.1-rc.2+rev.1（2026-10-18）

- 按已确认方案统一中英文显示名称、简介、完整修订版本及分发元信息；办公成员支持套件接管，保留原运行身份和业务数据。
- 当前实现及验证状态见 docs/SPEC.md 与本版独立验收记录；未公开发布。

## 2026-10-14 Desktop 工作流规格（文档阶段）

- 新增 SPEC F012–F014 与 `discussion-desktop-workflows-20261014-v1` 服务／配置契约，包含宿主绑定 lease、即时设置迁移和三场景工具／无损回归。
- 具体文件待用户确认，目标适配待实现；没有源码／测试／配置变化、不提高 0.2.0 包版本、不登记兼容通过。

## 2026-10-03 补齐需求文档确认（不变更包版本）

- 功能任务先改规格与相关技术契约，用户明确确认该版文档后再开发；未确认不改对应源码／测试实现或运行配置，已确认同一版不重复询问。
- 新增语义差异重新确认；预期不变的 Bug 可直接修复。本次只修改维护文档。

## 2026-10-03 文档基线（不变更包版本）

- 新增 [当前功能规格](docs/SPEC.md)，建立功能与 Bug 两条开发入口，记录实现依据、现有验证入口和待办。
- 本次只修改维护文档，不变更公开 API、数据格式或运行逻辑；静态核对不代替产品测试及 GUI 兼容验证。


本插件遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## Unreleased

- project 模板完整对齐防干烧项目管理 V2：状态枚举扩为七值(未开始/进行中/已完成/已取消/有风险/阻塞/暂停,仅 project;meeting 不变);新增 goal(成果)/strategy(策略)/measure(验收)/module(模块)/decision(决策)角色;milestone/risk/issue/objective/key_result 补 owner/status/due_date 等属性,task 新增 start_date,里程碑新增 actual_date,风险与问题新增 level(高/中/低)。
- Markdown 属性表列集扩展为 role/owner/status/start_date/due_date/actual_date/progress/level;列集之外的属性键序列化时抛 VALIDATION_FAILED,防止静默丢数据;旧文档(无新列)正常兼容。
- find_node 新增 properties 对象参数,多属性 AND 组合查询(与 role 组合同为 AND);旧参数 property_key/property_value 不变。
- Markdown 升级为业务事实来源：Profile 写入 Front Matter，角色与属性写入可见表格并支持双向解析。
- sidecar 升级为 v2，只保存稳定 Node ID 与运行时状态；兼容读取 v1，并在首次业务修改时迁移。
- 修改工具返回 `markdownUpdated` 与 `sidecarSaved`，sidecar 写入失败不再回滚已成功保存的 Markdown 业务数据。
- 新增 Markdown 独立恢复、v1 迁移、属性转义和 sidecar 故障测试。

## 0.2.0(2026-10-10)

F010:设置页插件配置卡与配置分层。

### 新增

- **设置页插件配置卡**(本插件的浏览器半边):在「设置 → 插件 → 插件配置」注册一张卡片,key 即设置命名空间 `dsh-structured-document`,`applies: 'live'`(保存后即时生效)。字段:`defaultProfile`(select:会议纪要 / 项目管理 / 思路整理)、`autoSave`(switch)、`maxUndoSteps`(number,整数且 ≥ 1)。
- **配置分层**:解析顺序为 schema 默认 → 组装 `base`(插件行 `cordis.patch.yml` 的 `config`)→ 用户层(设置页保存),后者覆盖前者;逐字段兜底,组装层缺字段时不会被整体跳过。
- **卡片控件与写入**:控件自建(官方只提供 `numberField` / `textField` 两个字段规格与 `ValueField` / `SecretField` 两个呈现件);先暂存草稿、点保存才一次提交多条有序 mutation,带 revision 围栏,冲突被拒并保留草稿;被覆盖字段显示「已覆盖」标记,可重置回组装值。
- **客户端构建**:新增 `src/client/index.tsx`、`tsdown.config.ts` 与 `package.json` 的 `dsh.client` / `exports["./client"]`,构建产出 `lib/client.js`。

### 变更

- **设置卡外观对齐宿主卡片**(F011):卡片从"自绘扁平盒子"改为按宿主 `PluginCard` 的外观语法绘制——`section` 外框(`.5px solid --dsw-alias-border-l4`、`bg-layer-3`、`border-radius:16px`;展开态 `bg-layer-2` + `label-dimmed`)、可折叠头部 `<button>`(flex、gap 12、padding 14px 16px,`aria-expanded` + `aria-controls`,含插件名 + 版本号 + 副标题 + 覆盖状态徽标 + 16px chevron 展开旋转 180°)、带 `.5px` 分隔线的设置行(标签在左 `flex:1`、控件行内右对齐)、保存与放弃按钮移到右下角操作行(`justify-content:flex-end`)。卡片 chrome 的数值以宿主 `PluginCard` 的真实规则为准(插件市场的 `1px` + `border-l2` + `radius:12px` 只是它对宿主的近似,未采用)。只改外观与文案,配置语义与保存模型不变;收起只隐藏主体,组件保持挂载,未保存草稿不因收起丢失。
- **卡片版本号改为构建期注入**:头部版本号不再有硬编码漂移风险,由 `tsdown.config.ts` 的 `readOwnVersion()` 读取本包 `package.json` 的 `version` 后经 `define` 注入 `__DSD_VERSION__`,bundle 里内联为字符串字面量(运行时不读文件、不引入 Node 内建)。
- `currentFile` 不进设置卡片、也不进设置命名空间的 schema:它是外部集成接缝,只在组装层配置;运行时的当前文件仍由 `CurrentFileProvider` / 工作台绑定决定,静态值只是兜底。
- 内核的可配置字段(`defaultProfile` / `autoSave` / `maxUndoSteps`)改为经 `getConfig()` 每次读取的 getter,保证设置页保存后按 `applies: 'live'` 立即生效,而不是挂载时快照。

### 修复

- 越界组装值不再让插件整块挂载失败:宿主 provider 惰性校验 `base`(注册不报错、首次读取才过 schema),原先异常会从 `apply()` 冒出、导致 0 个工具注册。现改为在读取侧兜底——告警一次并退回组装配置,插件照常挂载;越界值不静默改成 schema 默认值,仍由内核按原有语义明确报错。

### 测试

- 新增 `tests/unit/settings-config.spec.ts` 12 项:解析顺序与逐字段兜底、`currentFile` 只在组装层、设置 schema 只声明三个字段且拒绝非法取值、软依赖在场 / 缺失 / 摘除三条路径、用户覆盖对 `autoSave` / `defaultProfile` / `maxUndoSteps` 实时生效。全量 119 项通过。
- 新增 `tests/unit/client-card.spec.ts` 22 项(F011)与配套的 `tests/unit/hook-runtime.ts`(极简 hook 运行时,不新增依赖):slot / key 与宿主命名空间一致、头部 `aria-expanded` 翻转与 `aria-controls` 关联、三行控件类型与标签(下拉 / `role=switch` / `number min=1`)、覆盖徽标文案随用户层变化、收起后草稿仍在、保存提交带 revision 栅栏的 mutation、放弃修改清空草稿、卡片 chrome 按宿主真实数值对齐、样式配方与主题令牌白名单、版本号无硬编码。全量 141 项通过。

## 0.1.0(2026-01-15)

首个版本:面向 DSH 的结构化文档插件(会议纪要 / 项目管理 / 思路整理)。

### 新增

- **文档 IR 与操作内核**
  - 树形结构化文档模型(节点:标题 / 内容 / 角色 / 属性 / 子节点 / 元数据),节点 ID(`node_NNN`)全生命周期稳定,计数器单调递增不复用。
  - 节点操作:新增 / 修改 / 删除(含子树)/ 移动(防移进自身子树)/ 排序(位置与方向)/ 改角色(属性裁剪)/ 改属性(枚举与范围校验)。
  - 撤销栈(默认 100 步),撤销后 ID 与版本号保持单调。
- **Markdown 适配器**:ATX 标题 + 列表 + 任务列表的双向转换,EOL 保留,往返幂等;既有 Markdown 解析出的节点默认 `note` 角色。
- **Sidecar 状态持久化**(`<file>.sdoc.json`):内容哈希校验,未变化时采纳持久化 IR(跨会话 ID 稳定与状态恢复);外部修改以磁盘为准重新解析。
- **14 个 Document Tools**(中文结果与中文错误说明):`get_document` / `get_outline` / `find_node` / `select_node` / `get_selected_node` / `add_node` / `update_node` / `delete_node` / `move_node` / `reorder_node` / `change_role` / `update_property` / `undo` / `save_document`。
- **节点引用体系**:`node_NNN`、标题匹配(先精确后包含)、`occurrence` 歧义消解、相对定位(上一条 / 下一条 / 父级 / 首末子节点),以及 `@selected` / `@last_edited` / `@last_created` / `@root` 指代。
- **文档状态**:当前文件、当前节点(Selected Node)、最近修改节点(Last Edited Node)、最近新增节点(Last Created Node)、Dirty、Revision(每次成功提交 +1)。
- **三类场景模板**:meeting(会议纪要)、project(项目管理)、thinking(思路整理),含通用默认角色 `note`。
- **中文 SKILL.md**(`skills/structured-document/SKILL.md`):中文指代 → 工具参数映射表、工具清单、歧义处理规则、错误应对;随插件 bundled 注册。
- **错误体系**:结构化错误码(`NO_CURRENT_FILE` / `FILE_NOT_FOUND` / `NODE_NOT_FOUND` / `MULTIPLE_NODES_FOUND` / `INVALID_ROLE` / `INVALID_PROPERTY` / `INVALID_OPERATION` / `SAVE_FAILED` / `VALIDATION_FAILED`),歧义时返回候选列表,绝不随机选择。
- **自动化测试**:单元 / 集成 / 场景三层共 79 条(会议纪要、项目管理、思路整理三场景,多轮中文指代、歧义、撤销、非法输入、保存失败、外部修改与状态恢复)。
