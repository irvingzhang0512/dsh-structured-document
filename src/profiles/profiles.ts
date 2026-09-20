/**
 * 场景模板(Profile):为文档提供角色(Role)与属性(Properties)的推荐范围。
 *
 * V0.1 内置三类模板(requirements.md 第 5、9 章):
 *   meeting   会议纪要
 *   project   项目管理
 *   thinking  思路整理
 *
 * 每个模板额外内置通用角色 note(笔记)作为默认角色:从既有 Markdown 解析出的
 * 节点在没有明确角色依据时一律记为 note,保证任意结构化文档都能无损装载。
 */
import type { ProfileDefinition, RoleDefinition } from '../model/types.ts'
import { DocumentOperationError } from '../model/errors.ts'

/** 通用角色:笔记(所有模板共有,作为默认角色)。 */
function noteRole(): RoleDefinition {
  return {
    name: 'note',
    label: '笔记',
    description: '通用内容节点,未指定角色时的默认角色。',
    properties: [],
  }
}

/** 会议纪要模板(meeting)。 */
export const MEETING_PROFILE: ProfileDefinition = {
  id: 'meeting',
  name: '会议纪要',
  description: '整理会议结构:议题、讨论、问题、结论、决定、待办。',
  roles: [
    noteRole(),
    { name: 'topic', label: '议题', description: '会议讨论的一个话题。', properties: [] },
    { name: 'discussion', label: '讨论', description: '围绕议题的讨论内容。', properties: [] },
    { name: 'problem', label: '问题', description: '讨论中发现的问题。', properties: [] },
    { name: 'conclusion', label: '结论', description: '讨论形成的结论。', properties: [] },
    { name: 'decision', label: '决定', description: '会议做出的决定。', properties: [] },
    {
      name: 'action_item', label: '待办', description: '会议派生的待办事项。',
      properties: [
        { key: 'owner', label: '负责人', type: 'string', description: '待办的负责人。' },
        { key: 'status', label: '状态', type: 'enum', values: ['未开始', '进行中', '已完成', '已取消'], description: '待办状态。' },
        { key: 'due_date', label: '截止时间', type: 'string', description: '截止时间,保留用户原始表述(如“周五”“2026-09-12”)。' },
      ],
    },
  ],
  defaultRole: 'note',
}

/** 项目管理模板(project):状态枚举与通用属性声明(对齐防干烧项目管理 V2 的七种状态)。 */
const PROJECT_STATUS_VALUES = ['未开始', '进行中', '已完成', '已取消', '有风险', '阻塞', '暂停'] as const

function projectOwnerSpec() {
  return { key: 'owner', label: '负责人', type: 'string', description: '负责人;多人用顿号分隔,缺失写「待确认」。' } as const
}

function projectStatusSpec() {
  return { key: 'status', label: '状态', type: 'enum', values: [...PROJECT_STATUS_VALUES], description: '状态。' } as const
}

function projectStartDateSpec() {
  return { key: 'start_date', label: '计划开始', type: 'string', description: '计划开始时间,保留用户原始表述(如「2026-09-01」「待确认」)。' } as const
}

function projectDueDateSpec() {
  return { key: 'due_date', label: '截止日期', type: 'string', description: '计划完成/截止时间,保留用户原始表述(如「2026-09-30」「待确认」)。' } as const
}

/** 项目管理模板(project)。 */
export const PROJECT_PROFILE: ProfileDefinition = {
  id: 'project',
  name: '项目管理',
  description: '目标(O)、关键结果(KR)、成果(G)、策略(S)、验收(M)、模块、里程碑、任务、问题、风险与决策的管理结构。',
  roles: [
    noteRole(),
    {
      name: 'objective', label: '目标', description: '项目或阶段的目标(O)。',
      properties: [projectOwnerSpec(), projectStatusSpec(), projectStartDateSpec(), projectDueDateSpec()],
    },
    {
      name: 'key_result', label: '关键结果', description: '衡量目标的关键结果(KR)。',
      properties: [projectOwnerSpec(), projectStatusSpec(), projectStartDateSpec(), projectDueDateSpec()],
    },
    {
      name: 'goal', label: '成果', description: '阶段或模块完成后的关键成果(G)。',
      properties: [projectOwnerSpec(), projectStatusSpec(), projectStartDateSpec(), projectDueDateSpec()],
    },
    {
      name: 'strategy', label: '策略', description: '达成成果的关键策略(S)。',
      properties: [projectOwnerSpec(), projectStatusSpec(), projectStartDateSpec(), projectDueDateSpec()],
    },
    {
      name: 'measure', label: '验收', description: '策略对应的可检查验收结果(M)。',
      properties: [projectOwnerSpec(), projectStatusSpec(), projectDueDateSpec()],
    },
    {
      name: 'module', label: '模块', description: '模块或子项目的管理单元。',
      properties: [projectOwnerSpec(), projectStatusSpec(), projectStartDateSpec(), projectDueDateSpec()],
    },
    {
      name: 'milestone', label: '里程碑', description: '项目关键节点与验收。',
      properties: [
        projectOwnerSpec(), projectStatusSpec(), projectDueDateSpec(),
        { key: 'actual_date', label: '实际完成', type: 'string', description: '实际完成时间,保留用户原始表述。' },
      ],
    },
    {
      name: 'task', label: '任务', description: '具体执行的任务。',
      properties: [
        projectOwnerSpec(), projectStatusSpec(), projectStartDateSpec(), projectDueDateSpec(),
        { key: 'progress', label: '进度', type: 'integer', min: 0, max: 100, description: '进度百分比,0-100 的整数。' },
      ],
    },
    {
      name: 'issue', label: '问题', description: '项目执行中的问题。',
      properties: [
        projectOwnerSpec(), projectStatusSpec(), projectDueDateSpec(),
        { key: 'level', label: '等级', type: 'enum', values: ['高', '中', '低'], description: '问题等级。' },
      ],
    },
    {
      name: 'risk', label: '风险', description: '项目风险。',
      properties: [
        projectOwnerSpec(), projectStatusSpec(), projectDueDateSpec(),
        { key: 'level', label: '等级', type: 'enum', values: ['高', '中', '低'], description: '风险等级。' },
      ],
    },
    {
      name: 'decision', label: '决策', description: '项目决策及其结论。',
      properties: [projectOwnerSpec(), projectStatusSpec(), projectDueDateSpec()],
    },
  ],
  defaultRole: 'note',
}

/** 思路整理模板(thinking)。 */
export const THINKING_PROFILE: ProfileDefinition = {
  id: 'thinking',
  name: '思路整理',
  description: '汇报思路、算法方案、技术方案与日常思考的组织结构。',
  roles: [
    noteRole(),
    { name: 'topic', label: '主题', description: '思考的主题。', properties: [] },
    { name: 'problem', label: '问题', description: '要解决的问题。', properties: [] },
    { name: 'idea', label: '想法', description: '初步想法。', properties: [] },
    { name: 'solution', label: '方案', description: '成型的方案。', properties: [] },
    { name: 'question', label: '疑问', description: '待讨论或待验证的疑问。', properties: [] },
    { name: 'conclusion', label: '结论', description: '思考形成的结论。', properties: [] },
  ],
  defaultRole: 'note',
}

/** 全部内置模板。 */
export const BUILTIN_PROFILES: readonly ProfileDefinition[] = [
  MEETING_PROFILE,
  PROJECT_PROFILE,
  THINKING_PROFILE,
]

/** 按模板 ID 取模板;不存在返回 undefined。 */
export function getProfile(id: string): ProfileDefinition | undefined {
  return BUILTIN_PROFILES.find((profile) => profile.id === id)
}

/** 规范化模板 ID:兼容中文别名(会议纪要/项目管理/思路整理)。 */
export function normalizeProfileId(id: string): string | undefined {
  const direct = getProfile(id)
  if (direct !== undefined) return direct.id
  const aliased = BUILTIN_PROFILES.find((profile) => profile.name === id.trim())
  return aliased?.id
}

/** 取模板;模板不存在抛 INVALID_OPERATION(模板是文档的配置,不存在属于配置错误)。 */
export function requireProfile(id: string): ProfileDefinition {
  const profile = getProfile(id)
  if (profile === undefined) {
    throw new DocumentOperationError(
      'INVALID_OPERATION',
      `场景模板不合法:${id}(可用模板:${BUILTIN_PROFILES.map((p) => `${p.id} ${p.name}`).join('、')})。`,
    )
  }
  return profile
}
