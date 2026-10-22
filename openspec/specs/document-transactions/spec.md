# F006 新建、替换与批量事务

## Purpose

为 dsh-structured-document 的新建、替换与批量事务维护唯一可编辑的行为与验收规格，保留原编号 F006，区分当前预期、尚未实现设计和历史验证；原始需求、项目资料及旧文档继续原位只读保留。

## Requirements

### Requirement: F006 新建、替换与批量事务

系统 SHALL 按下列完整场景落实新建、替换与批量事务的预期、边界与验收。本节迁入已有功能规则；本次仅迁移文档，没有重新执行产品验收。

#### Scenario: F006-S01 场景与预期

- **WHEN** 用户创建、替换或批量修改文档
- **THEN** 场景与预期：create_document 新建文件（重名可取后缀）；replace_document 与 apply_document_patch 在一次事务内替换或批量修改。

#### Scenario: F006-S02 边界与异常

- **WHEN** 用户创建、替换或批量修改文档
- **THEN** 边界与异常：校验 expected_file、expected_revision 和请求 id；同文件跨会话串行；批量校验失败不部分写入，默认保存成功只增加一次 revision／一次撤销记录；保存失败边界见 F005。

#### Scenario: F006-S03 验收条件

- **WHEN** 用户创建、替换或批量修改文档
- **THEN** 验收条件：旧 revision 拒绝；请求幂等；混合合法／非法批次不改变内容；成功批次可一次撤销。
