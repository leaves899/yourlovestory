import { createCrudStore } from './createCrudStore'
import crushService from '../services/crushService'

export interface Crush {
  slug: string
  name: string
  nickname: string
  gender?: string
  description?: string
  created_at: string
  updated_at: string
}

const mutations = {
  create: (params: {
    name: string
    nickname: string
    slug?: string
    gender?: string
    description?: string
    initialPhase?: number
  }) => crushService.create(params),
  update: (slug: string, name?: string, nickname?: string) =>
    crushService.update(slug, name, nickname),
  delete: (slug: string) => crushService.delete(slug),
}

export const useCrushStore = createCrudStore<Crush, [], typeof mutations>({
  list: () => crushService.list(),
  mutations,
})
