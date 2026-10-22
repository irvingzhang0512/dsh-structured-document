# F009 内核配置与保存策略

## Purpose

为 dsh-structured-document 的内核配置与保存策略维护唯一可编辑的行为与验收规格，保留原编号 F009，区分当前预期、尚未实现设计和历史验证；原始需求、项目资料及旧文档继续原位只读保留。

## Requirements

### Requirement: F009 内核配置与保存策略

系统 SHALL 按下列完整场景落实内核配置与保存策略的预期、边界与验收。本节迁入已有功能规则；本次仅迁移文档，没有重新执行产品验收。

#### Scenario: F009-S01 场景与预期

- **WHEN** 用户设置自动保存、模板或历史深度
- **THEN** 场景与预期：配置默认 Profile、autoSave、静态 currentFile 和 maxUndoSteps；默认自动保存，关闭 autoSave 时需手动 save_document。

#### Scenario: F009-S02 边界与异常

- **WHEN** 用户设置自动保存、模板或历史深度
- **THEN** 边界与异常：静态 currentFile 是外部文件提供者的兜底；撤销深度受配置限制；业务属性保存到 Markdown，sidecar v1 在业务修改时迁移，选择不提前迁移。配置来源分层（组装 `base` 与设置页用户覆盖）及 `currentFile` 只在组装层的边界见 F010。

#### Scenario: F009-S03 验收条件

- **WHEN** 用户设置自动保存、模板或历史深度
- **THEN** 验收条件：关闭自动保存时修改保持脏状态，手动保存后文件更新；未指定文档 Profile 使用默认值；v1 选择不改旧 sidecar。
