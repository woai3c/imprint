import { create } from 'zustand'

import type { ThemeSummaryRecord } from '../../shared/ipc-contract'

interface ThemeStore {
  themes: ThemeSummaryRecord[]
  loading: boolean
  error: string | null
  fetchThemes: () => Promise<void>
  renameTheme: (id: string, name: string) => Promise<void>
  deleteTheme: (id: string) => Promise<void>
}

export const useThemeStore = create<ThemeStore>((set) => ({
  themes: [],
  loading: false,
  error: null,

  fetchThemes: async () => {
    set({ loading: true, error: null })
    try {
      set({ themes: await window.electronAPI.getThemes() })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    } finally {
      set({ loading: false })
    }
  },

  renameTheme: async (id, name) => {
    const updated = await window.electronAPI.renameTheme(id, name)
    set((state) => ({ themes: state.themes.map((theme) => (theme.id === id ? updated : theme)) }))
  },

  deleteTheme: async (id) => {
    const result = await window.electronAPI.deleteTheme(id)
    if (!result.success) throw new Error('Theme not found')
    set((state) => ({ themes: state.themes.filter((theme) => theme.id !== id) }))
  },
}))
