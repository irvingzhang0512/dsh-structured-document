# 原始需求中的未交付文档操作

## Purpose

迁入已有文档中的原始需求中的未交付文档操作完整技术边界和验收条件，以 OpenSpec 维护待确认的行为契约；本次不改变产品规则、不写配置、不执行迁移，也不把文档结构校验当成运行通过。

## ADDED Requirements

### Requirement: deferred-document-operations-C1 R018 redo 与撤销边界

系统 SHALL 在实现本变更时遵守以下接口、状态和异常处理契约。

#### Scenario: deferred-document-operations-C1-S01 R018 redo 与撤销边界

- **WHEN** 执行R018 redo 与撤销边界相关操作
- **THEN** 满足以下全部规则，任何未实现部分保持待实现状态：

当前只提供 undo，不承诺 redo。原始第 18 章提出 redo；重新开发前 SHALL 先确认分支历史、保存失败、版本单调和节点 ID 不复用的完整规则。

验收待明确：撤销后重做恢复内容而不回退 revision；撤销后新增操作对 redo 栈的处理；自动与手动保存；重启后历史是否保留。不得把现有 undo 用例当作 redo 已实现证据。

### Requirement: deferred-document-operations-C2 R019 merge_nodes 和 split_node

系统 SHALL 在实现本变更时遵守以下接口、状态和异常处理契约。

#### Scenario: deferred-document-operations-C2-S01 R019 merge_nodes 和 split_node

- **WHEN** 执行R019 merge_nodes 和 split_node相关操作
- **THEN** 满足以下全部规则，任何未实现部分保持待实现状态：

原始第 19 章提出合并重复节点、将长内容拆成多点、按目标／方案／验证重组内容。当前 apply_document_patch 承接批量事务，但不因此声称已提供 merge_nodes 或 split_node 专用工具。

实施前 SHALL 明确合并与拆分的节点 ID、顺序、标题正文、角色属性、引用与选中指针规则。批量处理保持全部成功才提交，失败不留下半个结构，成功可一次撤销；sidecar 的独立失败仍按现行保存契约报告。

### Requirement: deferred-document-operations-C3 R013 连续语音编辑状态

系统 SHALL 在实现本变更时遵守以下接口、状态和异常处理契约。

#### Scenario: deferred-document-operations-C3-S01 R013 连续语音编辑状态

- **WHEN** 执行R013 连续语音编辑状态相关操作
- **THEN** 满足以下全部规则，任何未实现部分保持待实现状态：

原始第 13 章将「开始编辑／结束编辑」留给未来纯语音连续记录场景。当前存在 Current File 即可按工具规则操作；本次不引入新的编辑开关。

新增状态前 SHALL 明确会话隔离、重连、取消、结束后的未保存修改和普通讨论不改正文等规则，再形成可确认的实现设计。
