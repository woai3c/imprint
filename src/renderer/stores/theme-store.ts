import { create } from 'zustand'

import type { ThemeRecord } from '../../shared/ipc-contract'

interface ThemeStore {
  themes: ThemeRecord[]
  loading: boolean
  fetchThemes: () => Promise<void>
  toggleFavorite: (id: string) => Promise<void>
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  themes: [],
  loading: false,

  fetchThemes: async () => {
    set({ loading: true })
    try {
      const themes = await window.electronAPI.getThemes()
      set({ themes })
    } finally {
      set({ loading: false })
    }
  },

  toggleFavorite: async (id) => {
    const updated = await window.electronAPI.toggleFavorite(id)
    set({
      themes: get().themes.map((t) => (t.id === id ? updated : t)),
    })
  },
}))
