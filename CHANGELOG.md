# Changelog

本插件遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## Unreleased

- Markdown 升级为业务事实来源：Profile 写入 Front Matter，角色与属性写入可见表格并支持双向解析。
- sidecar 升级为 v2，只保存稳定 Node ID 与运行时状态；兼容读取 v1，并在首次业务修改时迁移。
- 修改工具返回 `markdownUpdated` 与 `sidecarSaved`，sidecar 写入失败不再回滚已成功保存的 Markdown 业务数据。
- 新增 Markdown 独立恢复、v1 迁移、属性转义和 sidecar 故障测试。

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
