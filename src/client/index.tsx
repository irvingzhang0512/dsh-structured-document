/**
 * dsh-structured-document —— 浏览器半边(F010 设置页插件配置卡 + F011 外观对齐)。
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
 * `tests/unit/settings-config.spec.ts`(宿主侧 `SETTINGS_NAMESPACE`)与
 * `tests/unit/client-card.spec.ts`(卡片注册的 slot key)共同断言。
 *
 * F011 外观:不 import `@deepseek-ai/dsh-client-ui-settings-plugins` 的值(纯度门禁
 * 会拦),而是用同一套设计令牌、按宿主 `PluginCard` 的布局逐类对齐(配方见
 * `.agents/skills/dsh-plugin-develop/references/config-ui.md` §8):可折叠头部
 * (`<button>` + `aria-expanded`/`aria-controls`)、带分隔线的设置行、控件行内右对齐、
 * 保存与放弃在右下角操作行。
 */
import { useEffect, useId, useState } from 'react'
import type { ReactElement } from 'react'

/** 设置命名空间 = 包名(与宿主 `src/plugin/config.ts` 的 `SETTINGS_NAMESPACE` 一致)。 */
const NAMESPACE = 'dsh-structured-document'

/**
 * 插件版本号:由构建期 `define` 注入(见 `tsdown.config.ts` 的 `__DSD_VERSION__`)。
 *
 * 取自构建时读取的 `package.json` 的 `version`,因此不会随包版本漂移;客户端 bundle
 * 里只剩一个字符串字面量,运行时不读文件、不引入 Node 内建。未注入时(例如直接跑
 * 未打包的源码)回退为 `'0.0.0-dev'`,只影响显示,不影响任何行为。
 */
declare const __DSD_VERSION__: string | undefined

/** 卡片头部显示的版本号。 */
const PLUGIN_VERSION: string = typeof __DSD_VERSION__ === 'string' && __DSD_VERSION__ !== ''
  ? __DSD_VERSION__
  : '0.0.0-dev'

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

/**
 * 设置卡片:可折叠头部 + 三个设置行 + 右下角操作行。
 *
 * 外观按宿主 `PluginCard` 对齐;折叠是**卡片本地状态**,收起只隐藏主体——组件保持
 * 挂载,因此未保存草稿不因收起丢失。
 * @param props - 绑定的设置命名空间读写面,以及初始展开状态(默认收起,与宿主卡片一致;
 *   该参数同时让无渲染器的用例能直接断言展开态结构)。
 */
export function SettingsCard({ scope, initiallyOpen = false }: {
  scope: SettingsScope
  initiallyOpen?: boolean
}): ReactElement | null {
  const [snapshot, setSnapshot] = useState<ScopeSnapshot>(() => scope.getSnapshot())
  // 未保存草稿:undefined 表示该字段未编辑,显示已存值。
  const [profileDraft, setProfileDraft] = useState<string | undefined>(undefined)
  const [autoSaveDraft, setAutoSaveDraft] = useState<boolean | undefined>(undefined)
  const [undoDraft, setUndoDraft] = useState<string | undefined>(undefined)
  /** 已暂存“重置”的字段:保存时 unset,重新继承组装层。 */
  const [resetFields, setResetFields] = useState<readonly FieldName[]>([])
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState('')
  /** 卡片本地展开状态(默认收起,与宿主卡片一致)。 */
  const [open, setOpen] = useState(initiallyOpen)
  /** 头部 `aria-controls` 指向的主体 id(useId 保证同页多实例唯一)。 */
  const bodyId = `dsd-settings-body-${useId()}`

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
  /** 任一层被用户覆盖(用于头部覆盖状态徽标)。 */
  const anyOverridden = FIELDS.some(field => overridden(field))

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
    <section className={open ? 'dsd-card dsd-card-open' : 'dsd-card'}>
      {/* 头部是自己的按钮:卡片把名称叠在说明之上,与共享披露行并排的布局不同。 */}
      <button
        type="button"
        className="dsd-head"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen(current => !current)}
      >
        <span className="dsd-head-text">
          <span className="dsd-name">
            Irving · 结构化文档<span className="dsd-version"> v{PLUGIN_VERSION}</span>
          </span>
          <span className="dsd-desc">默认场景模板、自动保存与撤销深度;此处保存的用户值优先于组装配置。</span>
        </span>
        <span className="dsd-badge"> {anyOverridden ? '用户覆盖' : '继承组装层'}</span>
        <span className={open ? 'dsd-chevron dsd-chevron-open' : 'dsd-chevron'} aria-hidden="true">
          <ChevronDown />
        </span>
      </button>
      {/* 收起只隐藏主体;组件保持挂载,未保存草稿不因收起丢失。 */}
      {open && (
        <div className="dsd-body" id={bodyId}>
          {snapshot.status === 'loading' && <p className="dsd-readonly" role="status">正在读取设置…</p>}
          {!snapshot.writable && <p className="dsd-readonly" role="status">当前设置文档为只读。</p>}
          <div className="dsd-row">
            <div className="dsd-label-box">
              <label className="dsd-label" htmlFor="dsd-profile">默认场景模板</label>
              <span className="dsd-hint">装载无 sidecar 历史的新文档时使用。</span>
            </div>
            <select
              id="dsd-profile"
              className="dsd-input"
              value={profileShown}
              disabled={disabled}
              onChange={event => stage('defaultProfile', event.target.value)}
            >
              {PROFILE_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
            {overridden('defaultProfile') && (
              <button type="button" className="dsd-reset" disabled={disabled} onClick={() => resetField('defaultProfile')}>
                重置为组装值
              </button>
            )}
          </div>
          <div className="dsd-row">
            <div className="dsd-label-box">
              <label className="dsd-label" htmlFor="dsd-autosave">自动保存</label>
              <span className="dsd-hint">关闭后普通修改保持脏状态,需要手动调用 save_document。</span>
            </div>
            <button
              id="dsd-autosave"
              type="button"
              role="switch"
              aria-checked={autoSaveShown}
              className={autoSaveShown ? 'dsd-switch dsd-switch-on' : 'dsd-switch'}
              disabled={disabled}
              onClick={() => stage('autoSave', !autoSaveShown)}
            >
              <span className="dsd-switch-knob" aria-hidden="true" />
            </button>
            {overridden('autoSave') && (
              <button type="button" className="dsd-reset" disabled={disabled} onClick={() => resetField('autoSave')}>
                重置为组装值
              </button>
            )}
          </div>
          <div className="dsd-row">
            <div className="dsd-label-box">
              <label className="dsd-label" htmlFor="dsd-undo">撤销栈深度</label>
              <span className={undoInvalid ? 'dsd-invalid' : 'dsd-hint'}>
                {undoInvalid ? '撤销深度必须是 ≥ 1 的整数。' : '可撤销的最近操作步数(整数,最小 1)。'}
              </span>
            </div>
            <input
              id="dsd-undo"
              className="dsd-input dsd-number"
              type="number"
              min={1}
              step={1}
              value={undoShown}
              disabled={disabled}
              onChange={event => stage('maxUndoSteps', event.target.value)}
            />
            {overridden('maxUndoSteps') && (
              <button type="button" className="dsd-reset" disabled={disabled} onClick={() => resetField('maxUndoSteps')}>
                重置为组装值
              </button>
            )}
          </div>
          <div className="dsd-footer">
            {failure !== '' && <p className="dsd-failure" role="alert">{failure}</p>}
            <button type="button" className="dsd-discard" disabled={saving || !dirty} onClick={() => { clearDrafts(); setFailure('') }}>
              放弃修改
            </button>
            <button type="button" className="dsd-save" disabled={disabled || !dirty} onClick={save}>
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

/** 三个可编辑字段(头部覆盖徽标据此判断)。 */
const FIELDS: readonly FieldName[] = ['defaultProfile', 'autoSave', 'maxUndoSteps']

/** 场景模板选项(卡片自建 select;官方字段件只有 numberField / textField)。 */
const PROFILE_OPTIONS: ReadonlyArray<{ id: ProfileId, label: string }> = [
  { id: 'meeting', label: '会议纪要' },
  { id: 'project', label: '项目管理' },
  { id: 'thinking', label: '思路整理' },
]

/** 头部 chevron(16px;展开时 CSS 旋转 180°)。 */
function ChevronDown(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

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

/**
 * 注入卡片样式(单一样式块,类名前缀 dsd-)。
 *
 * 卡片 chrome 的数值**以宿主 `PluginCard` 为准**(同页并列时对比的基准):`.5px` 边框 +
 * `--dsw-alias-border-l4` + `border-radius:16px`,展开态 `bg-layer-2` +
 * `border-color:label-dimmed`;主体/行/操作行的分隔线同为 `.5px border-l2`。其余布局数值
 * 照 `.agents/skills/dsh-plugin-develop/references/config-ui.md` §8 的配方。
 * 配色只用宿主真实存在的 `--dsw-alias-*` 令牌并给兜底值(兜底取自 dsh-client-ui-theme)。
 */
function injectStyle(): void {
  if (typeof document === 'undefined' || document.getElementById('dsd-settings-style') !== null) return
  const style = document.createElement('style')
  style.id = 'dsd-settings-style'
  style.textContent = `
.dsd-card{display:block;min-width:0;border:.5px solid var(--dsw-alias-border-l4,#00000029);background:var(--dsw-alias-bg-layer-3,#fff);border-radius:16px;list-style:none;transition:border-color .16s,background .16s}
.dsd-card:hover{border-color:var(--dsw-alias-label-dimmed,#e1e5ee)}
.dsd-card-open{background:var(--dsw-alias-bg-layer-2,#fff);border-color:var(--dsw-alias-label-dimmed,#e1e5ee)}
.dsd-card *{box-sizing:border-box}
.dsd-head{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;display:flex;align-items:center;gap:12px;padding:14px 16px}
.dsd-head:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4f6ef7);outline-offset:-2px}
.dsd-head-text{display:flex;flex-direction:column;flex:1;gap:4px;min-width:0}
.dsd-name{color:var(--dsw-alias-label-primary,#1f2328);font-size:15px;font-weight:600;line-height:1.4}
.dsd-version{color:var(--dsw-alias-label-tertiary,#8b93a1);font-variant-numeric:tabular-nums;font-size:12px;font-weight:400;line-height:20px}
.dsd-desc{color:var(--dsw-alias-label-tertiary,#8b93a1);font-size:13px;line-height:1.5}
.dsd-badge{flex:none;background:var(--dsw-alias-bg-layer-2,#eef0f4);color:var(--dsw-alias-label-secondary,#6b7280);border-radius:9px;padding:0 6px;font-size:11px;font-weight:600;line-height:17px;white-space:nowrap}
.dsd-chevron{display:inline-flex;flex:none;color:var(--dsw-alias-label-tertiary,#8b93a1);transition:transform .16s}
.dsd-chevron-open{transform:rotate(180deg)}
.dsd-body{border-top:.5px solid var(--dsw-alias-border-l2,#0000001a);margin:0 16px;padding-bottom:8px}
.dsd-row{display:flex;align-items:center;gap:12px;padding:12px 0}
.dsd-row+.dsd-row{border-top:.5px solid var(--dsw-alias-border-l2,#0000001a)}
.dsd-label-box{display:flex;flex-direction:column;flex:1;gap:3px;min-width:0}
.dsd-label{color:var(--dsw-alias-label-primary,#1f2328);font-size:13px;line-height:20px}
.dsd-hint{color:var(--dsw-alias-label-tertiary,#8b93a1);font-size:12px;line-height:18px}
.dsd-invalid{color:var(--dsw-alias-label-error,#dc2626);font-size:12px;line-height:18px}
.dsd-input{flex:none;max-width:40%;border:.5px solid var(--dsw-alias-border-l4,#00000029);background:var(--dsw-alias-bg-layer-3,#fff);color:var(--dsw-alias-label-primary,#1f2328);border-radius:7px;padding:6px 8px;font:inherit;font-size:12px;line-height:18px}
.dsd-number{width:84px}
.dsd-input:focus-visible{border-color:var(--dsw-alias-brand-primary,#4f6ef7);outline:none}
.dsd-switch{flex:none;position:relative;width:34px;height:20px;padding:0;border:.5px solid var(--dsw-alias-border-l4,#00000029);border-radius:10px;background:var(--dsw-alias-bg-layer-3,#fff);cursor:pointer;transition:background .16s,border-color .16s}
.dsd-switch-knob{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-label-tertiary,#8b93a1);transition:transform .16s,background .16s}
.dsd-switch-on{background:var(--dsw-alias-brand-primary,#4f6ef7);border-color:var(--dsw-alias-brand-primary,#4f6ef7)}
.dsd-switch-on .dsd-switch-knob{transform:translateX(14px);background:#fff}
.dsd-reset{flex:none;border:0;background:0 0;color:var(--dsw-alias-label-secondary,#6b7280);cursor:pointer;font:inherit;font-size:12px;line-height:18px;padding:0}
.dsd-reset:hover:not(:disabled){color:var(--dsw-alias-label-primary,#1f2328)}
.dsd-readonly{color:var(--dsw-alias-label-tertiary,#8b93a1);margin:12px 0 0;font-size:12px;line-height:1.5}
.dsd-footer{display:flex;justify-content:flex-end;align-items:center;gap:8px;border-top:.5px solid var(--dsw-alias-border-l2,#0000001a);padding:12px 0 4px}
.dsd-save,.dsd-discard{appearance:none;font:inherit;cursor:pointer;border:1px solid transparent;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}
.dsd-discard{border-color:var(--dsw-alias-border-l2,#0000001a);color:var(--dsw-alias-label-secondary,#6b7280);background:0 0}
.dsd-discard:hover:not(:disabled){color:var(--dsw-alias-label-primary,#1f2328);border-color:var(--dsw-alias-label-dimmed,#e1e5ee)}
.dsd-save{background:var(--dsw-alias-label-primary,#1f2328);color:var(--dsw-alias-bg-layer-3,#fff)}
.dsd-save:disabled,.dsd-discard:disabled,.dsd-reset:disabled,.dsd-input:disabled,.dsd-switch:disabled{cursor:not-allowed;opacity:.5}
.dsd-failure{flex:1;min-width:0;margin:0;color:var(--dsw-alias-label-error,#dc2626);font-size:12px;line-height:1.5}
`
  document.head.appendChild(style)
}
