const dayService = {
  async generate(slug: string, dayNumber: number, summary?: string) {
    const response = await window.electronAPI.generateDay({
      slug,
      day_number: dayNumber,
      summary,
    })
    return response
  },

  async list(slug: string, page?: number, pageSize?: number) {
    const response = await window.electronAPI.getDays({
      slug,
      page,
      page_size: pageSize,
    })
    return response
  },

  async get(slug: string, dayNumber: number) {
    const response = await window.electronAPI.getDay({
      slug,
      day_number: dayNumber,
    })
    return response
  },

  async update(slug: string, dayNumber: number, content: string) {
    const response = await window.electronAPI.updateDay({
      slug,
      day_number: dayNumber,
      content,
    })
    return response
  },

  async delete(slug: string, dayNumber: number) {
    const response = await window.electronAPI.deleteDay({
      slug,
      day_number: dayNumber,
    })
    return response
  },
}

export default dayService
