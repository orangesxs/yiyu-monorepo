import { defineStore } from 'pinia'
import { ref } from 'vue'
import { profileApi } from '@/shared/api'
import type { Profile } from '../types'

/**
 * 个人中心:全站共享的用户档案唯一数据源(服务端 GET/PUT /profile)。
 * 子应用不得自建用户资料副本;昵称/头像修改后需同步 userStore 展示层。
 */
export const useProfileStore = defineStore('profile', () => {
  /* 空档案占位(未加载完成前视图渲染兜底) */
  const profile = ref<Profile>({
    id: '', username: '', nickname: '', avatar: '',
    bio: '', gender: 'secret', birthday: '', region: '',
    joinedAt: '', updatedAt: '',
  })
  const loaded = ref(false)

  /** 拉取档案(进入个人中心时调用) */
  async function init() {
    profile.value = await profileApi.get()
    loaded.value = true
  }

  /** 保存档案到服务端;返回更新后的档案(调用方负责同步 userStore 展示昵称/头像) */
  async function updateProfile(patch: Partial<Omit<Profile, 'id' | 'username'>>) {
    profile.value = await profileApi.update(patch)
    return profile.value
  }

  return { profile, loaded, init, updateProfile }
})
