# F008 模型工具与中文 Skill

## Purpose

为 dsh-structured-document 的模型工具与中文 Skill维护唯一可编辑的行为与验收规格，保留原编号 F008，区分当前预期、尚未实现设计和历史验证；原始需求、项目资料及旧文档继续原位只读保留。

## Requirements

### Requirement: F008 模型工具与中文 Skill

系统 SHALL 按下列完整场景落实模型工具与中文 Skill的预期、边界与验收。本节迁入已有功能规则；本次仅迁移文档，没有重新执行产品验收。

#### Scenario: F008-S01 场景与预期

- **WHEN** Agent 使用文档工具或中文 Skill
- **THEN** 场景与预期：17 个文档工具覆盖查询、节点修改、撤销、保存和文档事务；中文 Skill 将自然语言映射到工具参数。

#### Scenario: F008-S02 边界与异常

- **WHEN** Agent 使用文档工具或中文 Skill
- **THEN** 边界与异常：Skill 不代替内核规则；LLM 不直接改底层 Markdown／JSON；结构化错误包含可处理的信息。

#### Scenario: F008-S03 验收条件

- **WHEN** Agent 使用文档工具或中文 Skill
- **THEN** 验收条件：17 工具注册且信封符合约定；技能可导入；会议／项目／思路场景通过内核执行。
