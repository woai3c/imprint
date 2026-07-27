import { create } from 'zustand'

type FeedbackTone = 'success' | 'info' | 'error'

interface FeedbackStore {
  message: string | null
  tone: FeedbackTone
  show: (message: string, tone?: FeedbackTone) => void
  dismiss: () => void
}

let dismissTimer: ReturnType<typeof setTimeout> | undefined

export const useFeedbackStore = create<FeedbackStore>((set) => ({
  message: null,
  tone: 'success',
  show: (message, tone = 'success') => {
    if (dismissTimer) clearTimeout(dismissTimer)
    set({ message, tone })
    dismissTimer = setTimeout(() => set({ message: null }), 4000)
  },
  dismiss: () => {
    if (dismissTimer) clearTimeout(dismissTimer)
    set({ message: null })
  },
}))
