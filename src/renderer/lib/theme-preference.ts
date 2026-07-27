import { builtinThemes, useSkinStore } from '../stores/skin-store'
import { getThemePreference, setThemePreference } from './preferences'

function saveCurrentTheme(themeId: string): void {
  const builtin = builtinThemes.find((theme) => theme.id === themeId)
  if (builtin) {
    setThemePreference({ kind: 'builtin', id: builtin.id })
    return
  }

  if (themeId === 'custom') {
    queueMicrotask(() => {
      if (useSkinStore.getState().currentThemeId !== 'custom') return
      setThemePreference({
        kind: 'custom',
        css: document.documentElement.style.cssText,
      })
    })
  }
}

export function initThemePreference(): void {
  const preference = getThemePreference()
  if (preference?.kind === 'builtin' && preference.id) {
    useSkinStore.getState().setTheme(preference.id)
  } else if (preference?.kind === 'custom' && preference.css) {
    useSkinStore.getState().applyCustomCss(preference.css)
  }

  useSkinStore.subscribe((state, previousState) => {
    if (state.currentThemeId !== previousState.currentThemeId) saveCurrentTheme(state.currentThemeId)
  })
}
