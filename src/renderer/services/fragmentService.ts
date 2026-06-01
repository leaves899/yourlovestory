const fragmentService = {
  async record(slug: string, origin: string, mood: string, content: string, envTags?: string[], behaviorTags?: string[]) {
    const response = await window.electronAPI.recordFragment({
      slug,
      origin,
      mood,
      content,
      env_tags: envTags,
      behavior_tags: behaviorTags,
    })
    return response
  },

  async list(slug: string, date?: string, page?: number, pageSize?: number) {
    const response = await window.electronAPI.getFragments({
      slug,
      date,
      page,
      page_size: pageSize,
    })
    return response
  },

  async get(slug: string, fragmentId: string) {
    const response = await window.electronAPI.getFragment({
      slug,
      fragment_id: fragmentId,
    })
    return response
  },

  async update(slug: string, fragmentId: string, content?: string, envTags?: string[], behaviorTags?: string[]) {
    const response = await window.electronAPI.updateFragment({
      slug,
      fragment_id: fragmentId,
      content,
      env_tags: envTags,
      behavior_tags: behaviorTags,
    })
    return response
  },

  async delete(slug: string, fragmentId: string) {
    const response = await window.electronAPI.deleteFragment({
      slug,
      fragment_id: fragmentId,
    })
    return response
  },

  async integrate(slug: string, date: string) {
    const response = await window.electronAPI.integrateFragments({
      slug,
      date,
    })
    return response
  },
}

export default fragmentService
