import { create } from 'zustand'

export interface Theme {
  id: string
  name: string
  source_url: string | null
  screenshot_path: string | null
  tokens_json: string
  css_variables: string
  tailwind_theme: string
  design_doc: string
  tags: string
  is_builtin: number
  is_favorite: number
  created_at: string
  updated_at: string
}

interface ThemeStore {
  themes: Theme[]
  loading: boolean
  activeThemeId: string | null
  setActiveTheme: (id: string | null) => void
  fetchThemes: () => Promise<void>
  deleteTheme: (id: string) => Promise<void>
  toggleFavorite: (id: string) => Promise<void>
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  themes: [],
  loading: false,
  activeThemeId: null,

  setActiveTheme: (id) => set({ activeThemeId: id }),

  fetchThemes: async () => {
    set({ loading: true })
    try {
      const themes = await window.electronAPI.getThemes()
      set({ themes })
    } finally {
      set({ loading: false })
    }
  },

  deleteTheme: async (id) => {
    await window.electronAPI.deleteTheme(id)
    set({ themes: get().themes.filter((t) => t.id !== id) })
  },

  toggleFavorite: async (id) => {
    const updated = await window.electronAPI.toggleFavorite(id)
    set({
      themes: get().themes.map((t) => (t.id === id ? updated : t)),
    })
  },
}))
