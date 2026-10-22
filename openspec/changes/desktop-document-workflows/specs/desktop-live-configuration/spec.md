# F013 Desktop 即时配置与旧配置迁移

## Purpose

为 dsh-structured-document 的Desktop 即时配置与旧配置迁移维护唯一可编辑的行为与验收规格，保留原编号 F013，区分当前预期、尚未实现设计和历史验证；原始需求、项目资料及旧文档继续原位只读保留。

## ADDED Requirements

### Requirement: F013 Desktop 即时配置与旧配置迁移

系统 SHALL 按下列完整场景落实Desktop 即时配置与旧配置迁移的预期、边界与验收。本节为原有待实现设计的格式迁移，尚未获得实施批准，不作为现有能力。

#### Scenario: F013-S01 场景与预期

- **WHEN** 用户在 Desktop 保存配置或迁移旧设置
- **THEN** 场景与预期：三个现有可编辑字段投影为自身 volatile 配置，通过实际 entry 的 configForms 与 plugins.bundle.config 提供草稿／保存／重置；下一次相关操作采用新值，保留文档与历史。

#### Scenario: F013-S02 边界与异常

- **WHEN** 用户在 Desktop 保存配置或迁移旧设置
- **THEN** 边界与异常：currentFile 仍为普通组装字段、不进入表单；非法配置拒绝，冲突保留草稿；软依赖缺失仍有 17 工具。旧用户层／base／未知字段先预览备份，成功迁移后清理失效引用。

#### Scenario: F013-S03 验收条件

- **WHEN** 用户在 Desktop 保存配置或迁移旧设置
- **THEN** 验收条件：保存 autoSave／撤销上限不重建内核、不丢文档及撤销；Profile 只影响新装载适用文档；重置清用户覆盖；旧字段／未知值／重复迁移／失败恢复／并发冲突与原生信任检查通过。
