import type { DateTimeStr } from '@/shared/types/common'

/** 性别(保密为默认值) */
export type Gender = 'secret' | 'male' | 'female'

/** 头像 emoji 固定候选(12 选 1,不做图片上传) */
export const avatarOptions = ['🧑‍💻', '👩', '👨‍🦰', '👩‍🦳', '🧕', '🐱', '🐰', '🦊', '🐻', '🌻', '☘️', '🌙'] as const

/** 个人档案(yiyu-user 登录态的扩展;昵称/头像持久化,其余刷新重置) */
export interface Profile {
  id: string
  username: string
  nickname: string
  avatar: string
  bio: string
  gender: Gender
  /** YYYY-MM-DD,空串表示未填写 */
  birthday: string
  region: string
  /** 加入日期(YYYY-MM-DD),用于计算"已加入 N 天" */
  joinedAt: string
  updatedAt: DateTimeStr
}
