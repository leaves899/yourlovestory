import { createCrudStore } from './createCrudStore'
import dayService from '../services/dayService'

export interface Day {
  slug: string
  day_number: number
  content: string
  file_path?: string
}

const mutations = {
  generate: (slug: string, dayNumber: number, summary?: string) =>
    dayService.generate(slug, dayNumber, summary),
  update: (slug: string, dayNumber: number, content: string) =>
    dayService.update(slug, dayNumber, content),
  delete: (slug: string, dayNumber: number) =>
    dayService.delete(slug, dayNumber),
  get: (slug: string, dayNumber: number) =>
    dayService.get(slug, dayNumber),
}

export const useDayStore = createCrudStore<Day, [slug: string], typeof mutations>({
  list: (slug: string) => dayService.list(slug),
  mutations,
})
