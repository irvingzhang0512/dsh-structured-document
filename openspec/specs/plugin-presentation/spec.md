# F015 插件列表与详情的显示名称

## Purpose

为 dsh-structured-document 的插件列表与详情的显示名称维护唯一可编辑的行为与验收规格，保留原编号 F015，区分当前预期、尚未实现设计和历史验证；原始需求、项目资料及旧文档继续原位只读保留。

## Requirements

### Requirement: F015 插件列表与详情的显示名称

系统 SHALL 按下列完整场景落实插件列表与详情的显示名称的预期、边界与验收。本节迁入已有功能规则；本次仅迁移文档，没有重新执行产品验收。

#### Scenario: F015-S01 场景与预期

- **WHEN** 宿主显示插件列表、详情或成员行
- **THEN** 场景与预期：中文显示「Irving · 结构化文档」，英文显示「Irving · Structured Documents」；保留完整包名 dsh-structured-document 与全部运行标识。

#### Scenario: F015-S02 中文简介

- **WHEN** 宿主显示插件列表、详情或成员行
- **THEN** 中文简介：按节点和层级组织文档，支持 Agent 在讨论中通过工具定位、修改和重组内容。

#### Scenario: F015-S03 英文简介

- **WHEN** 宿主显示插件列表、详情或成员行
- **THEN** 英文简介：Organize documents by nodes and hierarchy so Agents can locate, edit, and restructure content through tools during a discussion.

#### Scenario: F015-S04 技术契约

- **WHEN** 宿主显示插件列表、详情或成员行
- **THEN** 技术契约：导出 locale/en.json 与 locale/zh.json 的 meta.title／meta.description；exports["./locale/*.json"] 指向对应资源，files 分发 locale，package.description 使用中文简介兜底。客户端设置／详情标题同步；功能导航不强制改名。

#### Scenario: F015-S05 验收

- **WHEN** 宿主显示插件列表、详情或成员行
- **THEN** 验收：目标宿主从固定 tgz 解析两语言名称／简介，原生列表、详情、成员行一致；无新增布局溢出，原工具／配置／存储保持。新套件成员在隔离验证后交付日常。
