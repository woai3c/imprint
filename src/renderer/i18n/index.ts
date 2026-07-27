import i18n from 'i18next'

import { initReactI18next } from 'react-i18next'

import { getLanguagePreference, setLanguagePreference } from '../lib/preferences'
import en from './locales/en.json'
import zhCN from './locales/zh-CN.json'

const resources = {
  en: { translation: en },
  'zh-CN': { translation: zhCN },
}

function detectLanguage(): string {
  return getLanguagePreference(navigator.language)
}

i18n.on('languageChanged', setLanguagePreference)

i18n.use(initReactI18next).init({
  resources,
  lng: detectLanguage(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
})

export default i18n
