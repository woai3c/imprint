import i18n from 'i18next'

import { initReactI18next } from 'react-i18next'

import { getLanguagePreference, initPreferences, setLanguagePreference } from '../lib/preferences'
import en from './locales/en.json'
import zhCN from './locales/zh-CN.json'

const resources = {
  en: { translation: en },
  'zh-CN': { translation: zhCN },
}

i18n.on('languageChanged', setLanguagePreference)

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
})

initPreferences()
  .then(() => {
    const lang = getLanguagePreference(navigator.language)
    if (i18n.language !== lang) {
      void i18n.changeLanguage(lang)
    }
  })
  .catch(() => {})

export default i18n
