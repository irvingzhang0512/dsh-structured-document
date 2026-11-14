# Spec Delta

## ADDED Requirements

### Requirement: 0.2.2 rc3 固定兼容交付

插件 SHALL 在 DSH Desktop 0.2.2-rc.3 上以完整版本 0.2.2-rc.3+rev.1 和完整 Git SHA 交付，保持结构化文档域、工具与存储的既有契约。

#### Scenario: 在原生宿主加载固定提交

- **WHEN** 目标宿主按固定版本安装并启动
- **THEN** 运行资源与提交匹配，目标宿主加载后通过本变更设计列出的领域验收

#### Scenario: 更新含既有设置或资料的环境

- **WHEN** 既有用户升级并重新打开插件
- **THEN** 原配置选择、凭据引用与业务数据保持可用，原始覆盖的读取和写入语义保持
