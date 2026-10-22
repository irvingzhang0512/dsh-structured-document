# F010 设置页插件配置卡与配置分层

## Purpose

为 dsh-structured-document 的设置页插件配置卡与配置分层维护唯一可编辑的行为与验收规格，保留原编号 F010，区分当前预期、尚未实现设计和历史验证；原始需求、项目资料及旧文档继续原位只读保留。

## Requirements

### Requirement: F010 设置页插件配置卡与配置分层

系统 SHALL 按下列完整场景保留配置分层、草稿、冲突与软依赖的产品预期。本节不将旧设置 API 当作当前 Desktop 接口；原设置卡实现与历史测试保留，当前 Desktop 新配置桥的适配及验收在 F013 change，尚未完成。

#### Scenario: F010-S01 场景与预期

- **WHEN** 设置服务可用时用户编辑配置卡
- **THEN** 配置解析顺序为 schema 默认 → 组装 `base` → 用户覆盖；在具备对应配置服务的宿主提供可编辑卡片。字段为 `defaultProfile`（select：`meeting`／`project`／`thinking`，默认 `meeting`）、`autoSave`（switch，默认 `true`）、`maxUndoSteps`（number，默认 `100`，最小 1）。保存后内核按当前值读取的即时生效预期保持；新宿主接口适配与实际可达性须按 F013 单独验证，不能由旧卡片源码存在推断通过。

#### Scenario: F010-S02 边界与异常

- **WHEN** 设置服务可用时用户编辑配置卡
- **THEN** `currentFile` 是外部集成接缝，只在组装层配置，不进可编辑表单；当前文件由 `CurrentFileProvider`／工作台绑定决定，静态值只是兜底。宿主与客户端配置服务均为软依赖：服务缺失时不渲染卡片，回退组装配置，插件、17 个文档工具与 Skill 仍工作。用户覆盖按真实持久层保存，支持覆盖标记与清除后回退组装默认；旧 revision 保存拒绝，失败保留草稿，不覆盖较新值。非法字段（如 `defaultProfile: 'weekly'`、`maxUndoSteps: 0` 或非整数）由校验拒绝并报错，不静默当作默认。卡片拥有自己的标签、select/switch/number 控件与解析，写入通过宿主公开配置表单统一提交；旧接口名称仅留在原文作为历史来源。

#### Scenario: F010-S03 验收条件

- **WHEN** 设置服务可用时用户编辑配置卡
- **THEN** 验收条件：设置页出现本插件卡片且字段与上面清单一致；`defaultProfile` 保存后，装载无 sidecar 历史的文档使用新模板；`autoSave` 关闭后普通修改保持脏状态、需手动 `save_document`，重新打开后恢复自动保存；`maxUndoSteps` 设为 1 时只保留最近一步撤销，设为 0 或非整数被拒并给出错误；被覆盖字段有“已覆盖”标记，重置后回到组装值（组装未设则回 schema 默认）；用旧 revision 保存被拒并保留草稿；设置文档中的非法值被 schema 拒绝、插件不静默改变行为；`currentFile` 不出现在卡片，卡片保存后组装层的 `currentFile` 语义不变；设置服务缺失时插件仍挂载、工具可用且不渲染卡片；用户未覆盖时用组装值，覆盖后组装值不再生效，重置后重新生效。
