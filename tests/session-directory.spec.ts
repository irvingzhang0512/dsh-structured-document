import { describe, expect, it, vi } from 'vitest'
import { sessionDirectory } from '../src/session-directory.ts'
describe('会话工作目录', () => {
  it('未激活的持久会话使用只读检查，不退回宿主 profile', async () => {
    const inspect = vi.fn(async () => ({ meta: { cwd: '/workspace/cold' } }))
    expect(await sessionDirectory({ sessions: { get: () => undefined }, sessionController: { inspect } }, 'cold')).toBe('/workspace/cold')
    expect(inspect).toHaveBeenCalledWith('cold')
  })
  it('活动会话保留原目录，不额外读取', async () => {
    const inspect = vi.fn()
    expect(await sessionDirectory({ sessions: { get: () => ({ header: { cwd: '/workspace/live' } }) }, sessionController: { inspect } }, 'live')).toBe('/workspace/live')
    expect(inspect).not.toHaveBeenCalled()
  })
  it('元数据缺失或读取失败时拒绝退回错误目录', async () => {
    await expect(sessionDirectory({ sessions: { get: () => undefined }, sessionController: { inspect: async () => ({ meta: {} }) } }, 'missing')).rejects.toThrow('工作目录')
    await expect(sessionDirectory({ sessions: { get: () => undefined }, sessionController: { inspect: async () => { throw Error('read failed') } } }, 'missing')).rejects.toThrow('read failed')
  })
})
