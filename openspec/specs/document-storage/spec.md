# F005 Markdown 与 sidecar 存储

## Purpose

为 dsh-structured-document 的Markdown 与 sidecar 存储维护唯一可编辑的行为与验收规格，保留原编号 F005，区分当前预期、尚未实现设计和历史验证；原始需求、项目资料及旧文档继续原位只读保留。

## Requirements

### Requirement: F005 Markdown 与 sidecar 存储

系统 SHALL 按下列完整场景落实Markdown 与 sidecar 存储的预期、边界与验收。本节迁入已有功能规则；本次仅迁移文档，没有重新执行产品验收。

#### Scenario: F005-S01 场景与预期

- **WHEN** 用户读写 Markdown 和 sidecar 或外部编辑文件
- **THEN** 场景与预期：Markdown 为内容事实源，sidecar 维护稳定 id／元数据；加载可检测外部文件变化并重解析，修改后保存。

#### Scenario: F005-S02 边界与异常

- **WHEN** 用户读写 Markdown 和 sidecar 或外部编辑文件
- **THEN** 边界与异常：只按适配器支持的 Markdown 子集解释；hash 不符不能盲用旧 sidecar；Markdown 已保存但 sidecar 失败要反馈 sidecarSaved，而非宣称完整原子成功。

#### Scenario: F005-S03 验收条件

- **WHEN** 用户读写 Markdown 和 sidecar 或外部编辑文件
- **THEN** 验收条件：往返保存节点内容／id稳定；外部修改被识别；sidecar 写失败有准确结果。
