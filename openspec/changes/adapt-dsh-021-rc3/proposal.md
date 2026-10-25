# Proposal

文档版：rc3-compat-v1；本库是根 upgrade-dsh-021-rc3-v2 的同版兼容适配，用户于 2026-10-25 在根 v2 交付后要求继续实施。未扩展业务能力，具体源码／验证单独记录。

## Why

目标 Desktop 已升级 rc3，本库仍绑定 rc2；需按已确认组合更新依赖与完整产物，保留原配置和业务数据。

## What Changes

- 宿主目标 0.2.1-rc.3，包目标 0.2.1-rc.3+rev.1；精确 peer、运行门禁及完整资源与实际宿主一致。
- 按原规格回归服务、配置、客户端和生命周期；第三方组合为 Better Sidebar 0.28.0、IM 5.6.0、OpenCode Go 0.1.24、已确认目标市场版本。
- 仅兼容适配，不自动重置用户配置、业务资料或凭据；公开推送另行授权。

## Capabilities

### New Capabilities

无新增独立能力。

### Modified Capabilities

- fixed-delivery：更新当前宿主／完整版本和固定交付基线，保留旧编号及全部原验收场景。

## Impact

本库 manifest、锁、受影响源码／测试、完整 lib 及使用／技术说明。原需求和旧 SPEC 冻结；当前业务规格依本库迁移索引，根维护与跨电脑能力不复制到本库。
