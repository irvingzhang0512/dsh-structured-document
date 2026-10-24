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
import type { ProfileDefinition, PropertyValue, StructuredDocument } from './types.ts';
import type { PropertySpec } from './types.ts';
/** 校验单个属性值是否符合属性声明;返回错误说明(合法返回 null)。 */
export declare function checkPropertyValue(spec: PropertySpec, value: PropertyValue): string | null;
/** 找角色定义;找不到返回 undefined。 */
export declare function findRole(profile: ProfileDefinition, role: string): import('./types.ts').RoleDefinition | undefined;
/** 校验“给指定角色设置一个属性”是否合法;返回错误说明(合法返回 null)。 */
export declare function checkPropertyForRole(profile: ProfileDefinition, role: string, key: string, value: PropertyValue): string | null;
/**
 * 校验整棵文档树;返回违规说明列表(空数组 = 合法)。
 */
export declare function validateDocument(doc: StructuredDocument, profile: ProfileDefinition): string[];
