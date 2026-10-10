/**
 * dsh-structured-document —— 浏览器半边(F010 设置页插件配置卡)。
 *
 * 卡片注册在 `settings.plugin.item` slot 上,**key 即设置命名空间**(= 包名);
 * 设置页把宿主服务注册的命名空间与该 key 配对派发,因此卡片自己拥有控件与文案。
 *
 * 读写都经 `ctx.settingsScope.bind({ namespace })`:
 *  - 读:快照的 `status` / `value` / `base` / `user` / `revision` / `writable`;
 *  - 写:`mutate`(一次保存提交一条有序 mutation,带 `expectedRevision` 栅栏)。
 *
 * 软依赖:`settingsScope` **不**写进 `exports.inject`(缺服务会让整个客户端半边不
 * 挂载),改用 `ctx.inject(['settingsScope'], …)` 在服务可用时才注册卡片;服务
 * 缺失或命名空间未被宿主服务时不渲染卡片,也不影响插件其它能力。
 *
 * 命名空间字符串在此重复声明而不从宿主代码 import:浏览器半边不得依赖宿主模块
 * (客户端 bundle 的纯度门禁禁止跨半边 value import)。一致性由
 * `tests/unit/client-bundle.spec.ts` 对照宿主常量断言。
 */
import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'

/** 设置命名空间 = 包名(与宿主 `src/plugin/config.ts` 的 `SETTINGS_NAMESPACE` 一致)。 */
const NAMESPACE = 'dsh-structured-document'

/** 卡片可编辑的字段名。 */
type FieldName = 'defaultProfile' | 'autoSave' | 'maxUndoSteps'

/** 场景模板标识(与宿主 schema 的枚举一致)。 */
type ProfileId = 'meeting' | 'project' | 'thinking'

/** 设置命名空间的解析值。 */
interface StudioSettings {
  defaultProfile: ProfileId
  autoSave: boolean
  maxUndoSteps: number
}

/** 客户端看到的命名空间快照(对应 SettingsScopeSnapshot)。 */
interface ScopeSnapshot {
  status: 'loading' | 'ready' | 'unavailable'
  value: StudioSettings | undefined
  /** 组装层(宿主 provider 解析 value 时所覆盖的那一层)。 */
  base: unknown
  /** 原始用户层:字段**出现**在这里才是“被覆盖”,不比较值。 */
  user: unknown
  /** 写入围栏;首次 Host 视图到达前为 undefined。 */
  revision: number | undefined
  /** 宿主设置文档是否接受写入。 */
  writable: boolean
}

/** 一条按路径寻址的写入(mutate 的元素形状)。 */
type PathOp = { op: 'set', path: string[], value: unknown } | { op: 'unset', path: string[] }

/** 一个命名空间的读写面(对应 SettingsScope)。 */
interface SettingsScope {
  getSnapshot(): ScopeSnapshot
  subscribe(listener: () => void): () => void
  mutate(ops: readonly PathOp[], expectedRevision?: number): Promise<void>
}

/** `ctx.settingsScope` 服务面。 */
interface SettingsScopeBinder {
  bind<T>(spec: { namespace: string }): SettingsScope
}

/** `ctx.inject(['settingsScope'], …)` 回调收到的子 context。 */
interface SettingsScopeConsumerContext {
  settingsScope?: SettingsScopeBinder
}

/** 浏览器侧 context 中本插件用到的表面。 */
interface ClientContext {
  slots: {
    inject(name: string, callback: () => void): void
    register(spec: { name: string, key: string }, component: () => ReactElement | null): () => void
  }
  inject(deps: string[], callback: (ctx: unknown) => void): unknown
}

/** 必需服务:`slots` 是浏览器半边的立足点(没有它就没有 UI)。 */
export const inject = ['slots']

/**
 * 挂载浏览器半边。
 * @param ctx - 浏览器侧 cordis context。
 */
export function apply(ctx: ClientContext): void {
  injectStyle()
  // settingsScope 是软依赖:不写进 exports.inject,缺服务时卡片整块不挂载,
  // 插件其它能力(宿主工具 / Skill)完全不受影响。
  ctx.inject(['settingsScope'], (sctx) => {
    const binder = (sctx as SettingsScopeConsumerContext).settingsScope
    if (binder === undefined) return
    const scope = binder.bind<StudioSettings>({ namespace: NAMESPACE })
    ctx.slots.inject('settings.plugin.item', () => ctx.slots.register(
      { name: 'settings.plugin.item', key: NAMESPACE },
      () => <SettingsCard scope={scope} />,
    ))
  })
}

/** 设置卡片:三段控件 + 单一保存点。 */
function SettingsCard({ scope }: { scope: SettingsScope }): ReactElement | null {
  const [snapshot, setSnapshot] = useState<ScopeSnapshot>(() => scope.getSnapshot())
  // 未保存草稿:undefined 表示该字段未编辑,显示已存值。
  const [profileDraft, setProfileDraft] = useState<string | undefined>(undefined)
  const [autoSaveDraft, setAutoSaveDraft] = useState<boolean | undefined>(undefined)
  const [undoDraft, setUndoDraft] = useState<string | undefined>(undefined)
  /** 已暂存“重置”的字段:保存时 unset,重新继承组装层。 */
  const [resetFields, setResetFields] = useState<readonly FieldName[]>([])
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState('')

  useEffect(() => scope.subscribe(() => setSnapshot(scope.getSnapshot())), [scope])

  // 命名空间未被宿主服务(或连接为进程内 memory 模式)时不渲染无法操作的卡。
  if (snapshot.status === 'unavailable') return null

  const stored = snapshot.value
  const base = recordOf(snapshot.base)
  const disabled = !snapshot.writable || snapshot.status === 'loading' || saving
  const staged = (field: FieldName): string | boolean | undefined =>
    field === 'defaultProfile' ? profileDraft : field === 'autoSave' ? autoSaveDraft : undoDraft
  const isReset = (field: FieldName): boolean => resetFields.includes(field)
  /** 是否“被覆盖”:暂存的写入预告保存结果,否则看该字段是否出现在原始用户层。 */
  const overridden = (field: FieldName): boolean =>
    isReset(field) ? false : staged(field) !== undefined ? true : field in (recordOf(snapshot.user))

  const profileShown = isReset('defaultProfile')
    ? inheritedString(base, 'defaultProfile', 'meeting')
    : profileDraft ?? stored?.defaultProfile ?? inheritedString(base, 'defaultProfile', 'meeting')
  const autoSaveShown = isReset('autoSave')
    ? inheritedBoolean(base, 'autoSave', true)
    : autoSaveDraft ?? stored?.autoSave ?? inheritedBoolean(base, 'autoSave', true)
  const undoShown = isReset('maxUndoSteps')
    ? String(inheritedNumber(base, 'maxUndoSteps', 100))
    : undoDraft ?? String(stored?.maxUndoSteps ?? inheritedNumber(base, 'maxUndoSteps', 100))

  const undoInvalid = !isReset('maxUndoSteps') && undoDraft !== undefined && !isUndoSteps(undoDraft)
  const dirty = profileDraft !== undefined || autoSaveDraft !== undefined || undoDraft !== undefined || resetFields.length > 0

  const stage = (field: FieldName, value: string | boolean): void => {
    if (field === 'defaultProfile') setProfileDraft(String(value))
    else if (field === 'autoSave') setAutoSaveDraft(Boolean(value))
    else setUndoDraft(String(value))
    setResetFields(current => current.filter(item => item !== field))
    setFailure('')
  }
  const resetField = (field: FieldName): void => {
    if (field === 'defaultProfile') setProfileDraft(undefined)
    else if (field === 'autoSave') setAutoSaveDraft(undefined)
    else setUndoDraft(undefined)
    setResetFields(current => current.includes(field) ? current : [...current, field])
    setFailure('')
  }
  const clearDrafts = (): void => {
    setProfileDraft(undefined)
    setAutoSaveDraft(undefined)
    setUndoDraft(undefined)
    setResetFields([])
  }
  const save = (): void => {
    if (saving) return
    // 草稿不合法时不提交,并把原因显示出来(schema 仍是最终权威)。
    if (undoInvalid) {
      setFailure('撤销深度必须是 ≥ 1 的整数。')
      return
    }
    const ops: PathOp[] = []
    if (isReset('defaultProfile')) ops.push({ op: 'unset', path: ['defaultProfile'] })
    else if (profileDraft !== undefined) ops.push({ op: 'set', path: ['defaultProfile'], value: profileDraft })
    if (isReset('autoSave')) ops.push({ op: 'unset', path: ['autoSave'] })
    else if (autoSaveDraft !== undefined) ops.push({ op: 'set', path: ['autoSave'], value: autoSaveDraft })
    if (isReset('maxUndoSteps')) ops.push({ op: 'unset', path: ['maxUndoSteps'] })
    else if (undoDraft !== undefined) ops.push({ op: 'set', path: ['maxUndoSteps'], value: Number(undoDraft.trim()) })
    if (ops.length === 0) return
    setSaving(true)
    setFailure('')
    // 一次保存 = 一条有序 mutation,带当前快照的 revision 栅栏;失败保留草稿。
    scope.mutate(ops, snapshot.revision).then(
      () => {
        setSaving(false)
        clearDrafts()
        setSnapshot(scope.getSnapshot())
      },
      (error: unknown) => {
        setSaving(false)
        setFailure(readError(error))
      },
    )
  }

  return (
    <section className="dsd-card" aria-labelledby="dsd-settings-title">
      <div className="dsd-head">
        <h3 className="dsd-title" id="dsd-settings-title">结构化文档</h3>
        <p className="dsd-desc">默认场景模板、自动保存与撤销深度。此处保存的用户值优先于插件组装配置。</p>
      </div>
      {snapshot.status === 'loading' && <p className="dsd-hint">正在读取设置…</p>}
      <div className="dsd-field">
        <label className="dsd-label" htmlFor="dsd-profile">
          <span>默认场景模板</span>
          {overridden('defaultProfile') && <span className="dsd-badge">已覆盖</span>}
        </label>
        <select
          id="dsd-profile"
          className="dsd-control"
          value={profileShown}
          disabled={disabled}
          onChange={event => stage('defaultProfile', event.target.value)}
        >
          {PROFILE_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
        <p className="dsd-hint">装载无 sidecar 历史的新文档时使用。</p>
        {overridden('defaultProfile') && (
          <button type="button" className="dsd-reset" disabled={disabled} onClick={() => resetField('defaultProfile')}>重置为组装值</button>
        )}
      </div>
      <div className="dsd-field">
        <label className="dsd-label" htmlFor="dsd-autosave">
          <span>自动保存</span>
          {overridden('autoSave') && <span className="dsd-badge">已覆盖</span>}
        </label>
        <input
          id="dsd-autosave"
          className="dsd-switch"
          type="checkbox"
          checked={autoSaveShown}
          disabled={disabled}
          onChange={event => stage('autoSave', event.target.checked)}
        />
        <p className="dsd-hint">关闭后普通修改保持脏状态,需要手动调用 save_document。</p>
        {overridden('autoSave') && (
          <button type="button" className="dsd-reset" disabled={disabled} onClick={() => resetField('autoSave')}>重置为组装值</button>
        )}
      </div>
      <div className="dsd-field">
        <label className="dsd-label" htmlFor="dsd-undo">
          <span>撤销栈深度</span>
          {overridden('maxUndoSteps') && <span className="dsd-badge">已覆盖</span>}
        </label>
        <input
          id="dsd-undo"
          className="dsd-control"
          type="number"
          min={1}
          step={1}
          value={undoShown}
          disabled={disabled}
          onChange={event => stage('maxUndoSteps', event.target.value)}
        />
        <p className={undoInvalid ? 'dsd-invalid' : 'dsd-hint'}>
          {undoInvalid ? '撤销深度必须是 ≥ 1 的整数。' : '可撤销的最近操作步数(整数,最小 1)。'}
        </p>
        {overridden('maxUndoSteps') && (
          <button type="button" className="dsd-reset" disabled={disabled} onClick={() => resetField('maxUndoSteps')}>重置为组装值</button>
        )}
      </div>
      <div className="dsd-actions">
        <button type="button" className="dsd-save" disabled={disabled || !dirty} onClick={save}>
          {saving ? '保存中…' : '保存'}
        </button>
        <button type="button" className="dsd-discard" disabled={saving || !dirty} onClick={() => { clearDrafts(); setFailure('') }}>
          放弃修改
        </button>
        {!snapshot.writable && <span className="dsd-hint">当前设置文档为只读。</span>}
        {failure !== '' && <span className="dsd-failure" role="alert">{failure}</span>}
      </div>
    </section>
  )
}

/** 场景模板选项(卡片自建 select;官方字段件只有 numberField / textField)。 */
const PROFILE_OPTIONS: ReadonlyArray<{ id: ProfileId, label: string }> = [
  { id: 'meeting', label: '会议纪要' },
  { id: 'project', label: '项目管理' },
  { id: 'thinking', label: '思路整理' },
]

/** 草稿是否为合法撤销深度(整数且 ≥ 1);最终仍由宿主 schema 判定。 */
function isUndoSteps(text: string): boolean {
  const trimmed = text.trim()
  if (!/^\d+$/.test(trimmed)) return false
  return Number(trimmed) >= 1
}

/** 读取组装层某字段(缺失或类型不符时用兜底值)。 */
function inheritedString(base: Record<string, unknown>, key: string, fallback: string): string {
  const value = base[key]
  return typeof value === 'string' && value !== '' ? value : fallback
}
function inheritedBoolean(base: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = base[key]
  return typeof value === 'boolean' ? value : fallback
}
function inheritedNumber(base: Record<string, unknown>, key: string, fallback: number): number {
  const value = base[key]
  return typeof value === 'number' ? value : fallback
}

/** 宽化读取普通对象(快照的 base / user 层)。 */
function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/** 把写入失败翻译成用户能看懂的中文,并说明草稿已保留。 */
function readError(error: unknown): string {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (code === 'SETTINGS_CONFLICT') return '设置已在别处被修改,已保留你的改动,请确认后重试。'
  return message === '' ? '保存失败,已保留你的改动。' : `保存失败,已保留你的改动:${message}`
}

/** 注入卡片样式(单一样式块,类名前缀 dsd-)。 */
function injectStyle(): void {
  if (typeof document === 'undefined' || document.getElementById('dsd-settings-style') !== null) return
  const style = document.createElement('style')
  style.id = 'dsd-settings-style'
  style.textContent = `
.dsd-card{display:flex;flex-direction:column;gap:8px;padding:12px 0;color:var(--dsw-alias-label-primary,#242933);font-size:13px;line-height:1.5}
.dsd-card *{box-sizing:border-box}
.dsd-head{display:flex;flex-direction:column;gap:2px}
.dsd-title{margin:0;font-size:14px;font-weight:600}
.dsd-desc,.dsd-hint{margin:0;color:var(--dsw-alias-label-secondary,#697180);font-size:12px}
.dsd-field{display:flex;flex-direction:column;gap:6px;padding:10px 0;border-top:1px solid var(--dsw-alias-border-l2,#e9ebef)}
.dsd-label{display:flex;gap:8px;align-items:center;color:var(--dsw-alias-label-primary,#242933);font-weight:500}
.dsd-badge{border-radius:5px;background:var(--dsw-alias-bg-layer-2,#f2f4f7);color:var(--dsw-alias-label-secondary,#697180);padding:1px 6px;font-size:11px;font-weight:400}
.dsd-control,.dsd-switch{align-self:flex-start;border:1px solid var(--dsw-alias-border-l2,#d5d8de);border-radius:6px;background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;padding:4px 8px;font:inherit}
.dsd-control:disabled,.dsd-switch:disabled{opacity:.55;cursor:not-allowed}
.dsd-switch{width:16px;height:16px;padding:0;accent-color:var(--dsw-alias-brand-primary,#4f6ef7)}
.dsd-invalid{margin:0;color:var(--dsw-alias-state-error-primary,#b52828);font-size:12px}
.dsd-reset{align-self:flex-start;border:1px solid var(--dsw-alias-border-l2,#d5d8de);border-radius:6px;background:transparent;color:inherit;padding:3px 8px;font:inherit;font-size:12px;cursor:pointer}
.dsd-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;border-top:1px solid var(--dsw-alias-border-l2,#e9ebef);padding-top:10px}
.dsd-save,.dsd-discard{border:1px solid var(--dsw-alias-border-l2,#d5d8de);border-radius:6px;background:transparent;color:inherit;padding:4px 12px;font:inherit;cursor:pointer}
.dsd-save{border-color:var(--dsw-alias-brand-primary,#4f6ef7);color:var(--dsw-alias-brand-primary,#4f6ef7)}
.dsd-save:disabled,.dsd-discard:disabled,.dsd-reset:disabled{cursor:not-allowed;opacity:.5}
.dsd-failure{color:var(--dsw-alias-state-error-primary,#b52828);font-size:12px}
`
  document.head.appendChild(style)
}
