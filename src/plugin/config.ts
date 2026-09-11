/**
 * 插件配置(schemastery)。
 */
import z from '@deepseek-ai/schemastery'

export const Config = z.object({
  defaultProfile: z.string().default('meeting')
    .description('默认场景模板:meeting 会议纪要 / project 项目管理 / thinking 思路整理。文档首次装载且无历史记录时使用。'),
  autoSave: z.boolean().default(true)
    .description('自动保存:每次修改经结构校验后立即写盘并推进版本;关闭后需要用 save_document 手动保存。'),
  currentFile: z.string().default('')
    .description('可选:固定绑定的当前文件(绝对路径,或相对会话工作目录)。留空表示由外部集成提供(见 docs/architecture.md 的当前文件集成 TODO)。'),
  maxUndoSteps: z.number().default(100)
    .description('撤销栈深度(可撤销的最近操作步数)。'),
})

export type PluginConfig = {
  defaultProfile: string
  autoSave: boolean
  currentFile: string
  maxUndoSteps: number
}
