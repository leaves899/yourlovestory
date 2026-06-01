const crushService = {
  async create(name: string, nickname: string, slug: string) {
    const response = await window.electronAPI.createCrush({
      name,
      nickname,
      slug,
    })
    return response
  },

  async list(page?: number, pageSize?: number) {
    const response = await window.electronAPI.getCrushes({
      page,
      page_size: pageSize,
    })
    return response
  },

  async get(slug: string) {
    const response = await window.electronAPI.getCrush({
      slug,
    })
    return response
  },

  async update(slug: string, name?: string, nickname?: string) {
    const response = await window.electronAPI.updateCrush({
      slug,
      name,
      nickname,
    })
    return response
  },

  async delete(slug: string) {
    const response = await window.electronAPI.deleteCrush({
      slug,
    })
    return response
  },
}

export default crushService
