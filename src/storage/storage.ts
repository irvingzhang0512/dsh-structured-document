/**
 * 存储层:文件读写 + sidecar(伴随文件)。
 *
 * 源文件保持用户可读的 Markdown;节点 ID / 文档状态等插件数据保存在伴随文件
 * `<文件名>.sdoc.json` 中,并用源文件内容的 SHA-256 做一致性校验:源文件在外部
 * 被修改后,sidecar 失效,重新解析并重新分配 ID(见 docs/architecture.md)。
 */
import { createHash } from 'node:crypto'
import { readFile, writeFile, rename, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { StructuredDocument } from '../model/types.ts'

/** 存储接口(可注入替身以模拟保存失败等场景)。 */
export interface DocumentStorage {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
}

/** 基于真实文件系统的存储实现。 */
export class NodeFsStorage implements DocumentStorage {
  async readFile(path: string): Promise<string> {
    return readFile(path, 'utf8')
  }

  /** 原子写:先写临时文件再重命名,避免半写文件。 */
  async writeFile(path: string, content: string): Promise<void> {
    const temp = `${path}.sdoc-tmp-${process.pid}-${Date.now()}`
    await writeFile(temp, content, 'utf8')
    try {
      await rename(temp, path)
    } catch (error) {
      await unlink(temp).catch(() => {})
      throw error
    }
  }
}

/** 计算文本 SHA-256(十六进制)。 */
export function hashText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** sidecar 文件路径:`<文件>.sdoc.json`。 */
export function sidecarPathFor(filePath: string): string {
  return `${filePath}.sdoc.json`
}

/** 持久化的文档状态(跨会话恢复)。 */
export interface PersistedState {
  selected_node_id: string | null
  last_edited_node_id: string | null
  last_created_node_id: string | null
}

/** sidecar 文件结构。 */
export interface SidecarFile {
  format_version: 1
  plugin: 'dsh-structured-document'
  /** 生成 sidecar 时源文件内容的 SHA-256。 */
  content_hash: string
  document: StructuredDocument
  state: PersistedState
}

/** 读取并解析 sidecar;损坏或缺失返回 null。 */
export async function loadSidecar(storage: DocumentStorage, filePath: string): Promise<SidecarFile | null> {
  let raw: string
  try {
    raw = await storage.readFile(sidecarPathFor(filePath))
  } catch {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as SidecarFile
    if (parsed?.format_version !== 1 || parsed?.plugin !== 'dsh-structured-document') return null
    if (typeof parsed.content_hash !== 'string' || typeof parsed.document !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

/** 写入 sidecar(尽力而为:失败不阻断主流程,下次保存重试)。 */
export async function saveSidecar(storage: DocumentStorage, filePath: string, sidecar: SidecarFile): Promise<void> {
  const target = sidecarPathFor(filePath)
  await storage.writeFile(target, JSON.stringify(sidecar, null, 2) + '\n')
}

/** sidecar 所在目录(供上层做目录级操作)。 */
export function sidecarDir(filePath: string): string {
  return dirname(filePath)
}
