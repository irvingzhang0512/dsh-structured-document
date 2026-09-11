/**
 * 结构校验(Structural Validation):所有修改必须通过校验才能保存。
 *
 * 保证(requirements.md 第 26 章):
 * - Node ID 唯一
 * - Children 结构合法
 * - 不产生循环结构
 * - Role 符合当前 Profile
 * - Properties 类型合法
 * 校验失败返回违规列表;操作层把它转成 VALIDATION_FAILED。
 */
import type { DocNode, ProfileDefinition, PropertyValue, StructuredDocument } from './types.ts'
import type { PropertySpec } from './types.ts'
import { isNodeIdShape } from './document.ts'

/** 校验单个属性值是否符合属性声明;返回错误说明(合法返回 null)。 */
export function checkPropertyValue(spec: PropertySpec, value: PropertyValue): string | null {
  switch (spec.type) {
    case 'string':
      if (typeof value !== 'string') return `属性 ${spec.key}(${spec.label})应为文本。`
      return null
    case 'enum':
      if (typeof value !== 'string') return `属性 ${spec.key}(${spec.label})应为以下之一:${spec.values?.join('、')}。`
      if (!spec.values?.includes(value)) {
        return `属性 ${spec.key}(${spec.label})取值不合法:${value}(可用:${spec.values?.join('、')})。`
      }
      return null
    case 'integer':
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return `属性 ${spec.key}(${spec.label})应为数字。`
      if (spec.type === 'integer' && !Number.isInteger(value)) return `属性 ${spec.key}(${spec.label})应为整数。`
      if (spec.min !== undefined && value < spec.min) return `属性 ${spec.key}(${spec.label})不能小于 ${spec.min}。`
      if (spec.max !== undefined && value > spec.max) return `属性 ${spec.key}(${spec.label})不能大于 ${spec.max}。`
      return null
    }
  }
}

/** 找角色定义;找不到返回 undefined。 */
export function findRole(profile: ProfileDefinition, role: string): import('./types.ts').RoleDefinition | undefined {
  return profile.roles.find((definition) => definition.name === role)
}

/** 校验“给指定角色设置一个属性”是否合法;返回错误说明(合法返回 null)。 */
export function checkPropertyForRole(profile: ProfileDefinition, role: string, key: string, value: PropertyValue): string | null {
  const roleDefinition = findRole(profile, role)
  if (roleDefinition === undefined) {
    return `角色 ${role} 不在模板 ${profile.name} 中。`
  }
  const spec = roleDefinition.properties.find((property) => property.key === key)
  if (spec === undefined) {
    const allowed = roleDefinition.properties.map((property) => `${property.key}(${property.label})`).join('、')
    return allowed === ''
      ? `角色 ${roleDefinition.label} 没有可用属性,不能设置 ${key}。`
      : `角色 ${roleDefinition.label} 没有属性 ${key}(可用属性:${allowed})。`
  }
  return checkPropertyValue(spec, value)
}

/**
 * 校验整棵文档树;返回违规说明列表(空数组 = 合法)。
 */
export function validateDocument(doc: StructuredDocument, profile: ProfileDefinition): string[] {
  const violations: string[] = []
  const seenIds = new Set<string>()

  if (typeof doc.root !== 'object' || doc.root === null) {
    return ['文档缺少根节点。']
  }

  const visit = (node: DocNode, parent: DocNode | null, depth: number): void => {
    if (typeof node.id !== 'string' || !isNodeIdShape(node.id)) {
      violations.push(`节点 ID 不合法:${JSON.stringify(node.id)}(应为 node_001 形式)。`)
    } else if (seenIds.has(node.id)) {
      violations.push(`节点 ID 重复:${node.id}。`)
    } else {
      seenIds.add(node.id)
    }
    if (typeof node.title !== 'string') violations.push(`节点 ${node.id} 的 title 不是字符串。`)
    if (typeof node.content !== 'string') violations.push(`节点 ${node.id} 的 content 不是字符串。`)
    if (!Array.isArray(node.children)) violations.push(`节点 ${node.id} 的 children 不是数组。`)
    if (depth > 512) {
      violations.push(`文档层级过深(>512),疑似循环结构。`)
      return
    }
    if (parent !== null && parent.children.includes(node) === false) {
      violations.push(`节点 ${node.id} 不在其父节点 ${parent.id} 的 children 中(结构不一致)。`)
    }
    if (typeof node.role !== 'string' || node.role === '') {
      violations.push(`节点 ${node.id} 缺少角色。`)
    } else if (findRole(profile, node.role) === undefined) {
      violations.push(`节点 ${node.id} 的角色 ${node.role} 不在模板 ${profile.name} 中。`)
    }
    if (typeof node.properties !== 'object' || node.properties === null) {
      violations.push(`节点 ${node.id} 的 properties 不是对象。`)
    } else {
      const roleDefinition = findRole(profile, node.role)
      for (const [key, value] of Object.entries(node.properties)) {
        if (roleDefinition === undefined) break
        const spec = roleDefinition.properties.find((property) => property.key === key)
        if (spec === undefined) {
          violations.push(`节点 ${node.id} 的属性 ${key} 不属于角色 ${node.role}。`)
          continue
        }
        const problem = checkPropertyValue(spec, value)
        if (problem !== null) violations.push(`节点 ${node.id}:${problem}`)
      }
    }
    for (const child of node.children) visit(child, node, depth + 1)
  }

  visit(doc.root, null, 0)
  if (doc.root.id !== 'node_001') violations.push(`根节点 ID 应为 node_001,实际为 ${doc.root.id}。`)
  return violations
}
