# Desktop 文档服务与工作流协作契约

文档版：`discussion-desktop-workflows-20261014-v1`；2026-10-14；具体文档待用户确认。F012–F014 与相关既有适配待实现，目标验证未执行。与 [SPEC](SPEC.md)、[architecture](architecture.md) 配套；旧升级契约中的 settings namespace 仅属历史基线。

## 1. 保留的文档行为

- 继续注册 17 个文档工具与中文 Skill，保留 meeting／project／thinking 模板、Markdown 业务事实、稳定节点、sidecar v2 及 v1 读取。
- 读取／定位工具提供正文、节点／候选、真实文件和 revision；写工具保留 expected_file、expected_revision、稳定 request_id、跨会话同真实文件串行与整次撤销。
- create_document 的实际保存路径交给工作台后续登记；登记／打开视图失败不使已保存文档变成创建失败，也不能再次创建来重试后续动作。
- 文档保存与 sidecar 保存分开报告；普通明确新增／修改可执行，普通讨论不改正文。工作台材料与图像派生物不属于文档内核的第二份业务树。

## 2. 宿主固定绑定所有权

在 `structuredDocument` 服务追加下列同进程接口，不向 HTTP／客户端下发 lease：

```ts
interface BindingState {
  mode: 'follow' | 'fixed'
  ownerId: string | null
  filePath: string | null
}
interface BindingLease {
  bind(filePath: string): Promise<boolean>
  unbind(): Promise<void>
  release(): void
}
getBindingState(sessionId: string): BindingState
claimBinding(sessionId: string, ownerId: string): BindingLease
```

- 一个会话至多一个有效 lease。重复 claim（包括同 owner 的第二个未释放 claim）返回 BINDING_OWNED；工作台自己缓存 lease。ownerId 非空且仅在宿主服务边界使用，不能根据客户端字符串伪造所有权。
- claim 将会话置 fixed，保持当前已绑定稿；工作台随后显式 bind／unbind。旧 setCurrentFile 的浏览推送在 fixed 下不应用、不排队；旧 bindCurrentFile／unbindCurrentFile 的无 lease 外部调用返回明确拒绝，不能换掉 owner 的目标。
- lease.bind 按真实工作区路径与会话锁完成装载后才更新目标；失败保持原绑定。lease.unbind 建立固定空态，不让静态 currentFile 或浏览材料重新成为目标。
- lease.release 幂等，只解除所有权，保留当前绑定文件；不会把以前被拒的浏览消息补执行。已释放 lease 的 bind／unbind 拒绝；服务销毁清理全部所有权。
- 显式文档工具的创建行为仍按用户请求执行；创建后依 Skill 把返回路径交工作台登记。它不能被客户端浏览当作授权更换目标。普通修改、查询、撤销始终针对内核当前绑定与版本围栏。
- 工作台是否挂载、是否拥有某会话绑定以本服务状态为准；移除视图用 window 全局标记判断所有权的必要性。BindingState 随 bound／unbound 生命周期可被重新读取，不复制树或文件浏览列表。

## 3. 目标配置及 UI

| 字段 | 默认／约束 | 保存与生效 |
|---|---|---|
| defaultProfile | meeting；meeting／project／thinking | 自身 volatile 字段；下次装载无历史 Profile 文档采用，不重解释已打开文档 |
| autoSave | true；boolean | 自身 volatile 字段；下一次普通文档修改即时采用，不销毁内核或撤销栈 |
| maxUndoSteps | 100；整数且至少 1 | 自身 volatile 字段；下一次历史维护采用，只按新上限裁剪，不恢复已丢历史 |
| currentFile | 空字符串 | 普通组装／外部集成接缝，不进可编辑表单；fixed 空态优先于静态兜底 |

- 只把自己拥有的三个即时字段标 volatile；普通字段不为补 UI 强行热更新。保持每次操作读取配置 getter，不捕获启动值。
- 目标 `settings` 从 Config 投影，不再 settings.register／installSection；客户端改用 configForms.get(实际 entryId)，配置卡挂 `plugins.bundle.config`、key 为完整包名，保留折叠、草稿、中文标签和显式保存。
- 唯一 entry 通过公开 configuration／describe 与调用实例定位；缺失或不能唯一定位时只读，不能猜测第一个。卡片获得的 schema 仅含本插件允许的三个字段。
- mutate 带固定 revision；返回 false 或冲突视为保存失败，保留草稿。reset/unset 清除用户覆盖、回到组装 base，保留未知字段与 currentFile。收起、刷新上下文、视图切换都不丢草稿。
- 设置服务软依赖，缺失时组装配置有效、文档工具仍注册。合法性继续按既有规格校验，非法 Profile／撤销上限不得悄悄改为默认。

## 4. 传输、迁移与安装契约

- HTTP `/structured-document/api/config-owner` 的 GET 只描述本插件实际唯一 entry_id／字段；迁移路径 `/structured-document/api/config-migration` 聚合 GET 预览与 POST apply／restore，输入 action、expected_revision、preview_id、backup_id?，不接受任意所有者或路径。
- 路由按 path 唯一注册，403 为信任拒绝，409 为配置／备份冲突，503 为所有者能力缺失。URL 经宿主公开 hostRouteUrl；精确原生 Origin／实际 Host 通过，任意 null Origin／跨站拒绝。
- 旧 `settings.yaml` 的本插件 defaultProfile／autoSave／maxUndoSteps 对照当前 profile entry override 预览；本次不迁移 currentFile 到用户表单，不覆盖已有不同用户值，不把默认 effective 当原始覆盖。
- apply 在用户明确要求后备份原文件与写集，锁内复核预览；成功读回新条目才清理已迁移的旧字段。未知字段保留、失效分节不能继续参与生效校验；失败恢复与并发恢复冲突分别报告。
- sidecar 及 Markdown 不随配置迁移重写；旧文档只读打开不升级业务内容，首次明确修改才按既有 sidecar 契约维护。移除旧设置服务源码通路，不保留悬空 namespace 保存入口。
- 包 peer／客户端组件以实际 Desktop 携带的精确 0.2.0-rc.2 组合验证；不从旧全局凑 peer、不擅自改 client platform 字符串冒充兼容。完整构建产物进入本地安装包，安装不依赖被拒的现场构建生命周期。

## 5. 项目、会议与思路回归

- project 的稳定业务编号与叙述正文保持；不把文字进展改为整数 progress，不给已移除周期的 KR OGSM 恢复日期属性。模块、成果、策略、验收、WBS、里程碑、风险等既有角色仍按模板合法性校验。
- 修改范围由工作区 Skill 决定；文档内核不执行项目 Excel 桥、不生成另一份周报数据、不判断工作日。会议／项目切换由显式绑定决定，不根据临时打开文件推断。
- thinking 用现有模板；会话中自然语言指代依固定文档与明确选中节点，同名歧义列候选。批量修改保持未改节点 ID，产生一次版本与撤销。
- 读取、写入、恢复、创建父目录与外部文件变化以真实路径核对；controller 能打开外部文件不等于它能作为本会话写入目标。

验收：17 工具的 canonical／原生模型投影均可得必要正文、候选、路径、版本和保存标志；lease 确定性与两个会话；配置即时读取不清空历史；旧用户／base／未知字段及冲突迁移；真实会议与 project 合成夹具的无损往返、批量修改／撤销、项目桥副本回转。

本次是文档准备，尚无本版源码、测试执行或 Desktop 证据。历史测试不更新 verifiedWith。
