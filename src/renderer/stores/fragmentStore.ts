import { createCrudStore } from './createCrudStore'
import fragmentService from '../services/fragmentService'

export interface Fragment {
  id: string
  slug: string
  origin: string
  mood: string
  content: string
  env_tags: string[]
  behavior_tags: string[]
  created_at: string
  updated_at: string
}

const mutations = {
  record: (
    slug: string,
    origin: string,
    mood: string,
    content: string,
    envTags?: string[],
    behaviorTags?: string[],
  ) => fragmentService.record(slug, origin, mood, content, envTags, behaviorTags),
  update: (
    slug: string,
    fragmentId: string,
    content?: string,
    envTags?: string[],
    behaviorTags?: string[],
  ) => fragmentService.update(slug, fragmentId, content, envTags, behaviorTags),
  delete: (slug: string, fragmentId: string) =>
    fragmentService.delete(slug, fragmentId),
}

export const useFragmentStore = createCrudStore<Fragment, [slug: string], typeof mutations>({
  list: (slug: string) => fragmentService.list(slug),
  mutations,
})
