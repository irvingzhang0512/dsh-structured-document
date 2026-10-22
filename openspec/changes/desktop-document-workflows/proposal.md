# Desktop 文档绑定、配置与三场景工作流

## Why

原有需求与技术文档已经描述本范围，但尚未作为完整能力交付；统一迁入 OpenSpec，保持原批准边界与未完成状态，使后续讨论、实现和验收有单一入口。

## What Changes

- F012 宿主固定绑定所有权，完整行为与验收见对应 delta spec。
- F013 Desktop 即时配置与旧配置迁移，完整行为与验收见对应 delta spec。
- F014 三场景工具投影与项目无损回归，完整行为与验收见对应 delta spec。
- Desktop 文档绑定、配置与三场景工作流技术契约，完整行为与验收见对应 delta spec。
- 本次只整理文档，原始需求和项目资料不变；所有业务实施任务未完成。

## Capabilities

### New Capabilities

- `fixed-binding-ownership`：F012 宿主固定绑定所有权。
- `desktop-live-configuration`：F013 Desktop 即时配置与旧配置迁移。
- `document-workflow-projection`：F014 三场景工具投影与项目无损回归。
- `desktop-workflow-contract`：Desktop 文档绑定、配置与三场景工作流技术契约。

### Modified Capabilities

无已实现行为在本轮被修改；相关旧功能的回归要求随增量保留。

## Impact

影响本插件的领域服务、客户端或模型工具，具体接口和持久化规则见 design 与 specs。与其他插件的联调由维护仓库的协调变更安排；此公开子库不复制个人项目路径和业务正文。
