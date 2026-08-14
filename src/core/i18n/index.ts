import i18next, { type TOptions } from 'i18next'

import en from './locales/en.json' with { type: 'json' }
import zhCN from './locales/zh-CN.json' with { type: 'json' }

export type CoreLanguage = 'en' | 'zh-CN'

const instance = i18next.createInstance()

void instance.init({
  resources: {
    en: { translation: en },
    'zh-CN': { translation: zhCN },
  },
  lng: 'en',
  fallbackLng: 'en',
  initAsync: false,
  interpolation: {
    escapeValue: false,
  },
})

export function coreT(language: CoreLanguage, key: string, options: TOptions = {}): string {
  return instance.t(key, { ...options, lng: language })
}

export function coreTranslator(language: CoreLanguage, namespace?: string) {
  return (key: string, options: TOptions = {}): string =>
    coreT(language, namespace ? `${namespace}.${key}` : key, options)
}
