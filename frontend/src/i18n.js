import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import ptBRCommon from './locales/pt-BR/common.json'
import ptBRErrors from './locales/pt-BR/errors.json'
import ptPTCommon from './locales/pt-PT/common.json'
import ptPTErrors from './locales/pt-PT/errors.json'
import enCommon from './locales/en/common.json'
import enErrors from './locales/en/errors.json'
import esCommon from './locales/es/common.json'
import esErrors from './locales/es/errors.json'
import frCommon from './locales/fr/common.json'
import frErrors from './locales/fr/errors.json'
import deCommon from './locales/de/common.json'
import deErrors from './locales/de/errors.json'
import ruCommon from './locales/ru/common.json'
import ruErrors from './locales/ru/errors.json'
import zhCommon from './locales/zh/common.json'
import zhErrors from './locales/zh/errors.json'
import itCommon from './locales/it/common.json'
import itErrors from './locales/it/errors.json'

// pt-BR/pt-PT precisam ficar como códigos distintos (não colapsar pra "pt")
// — só idioma comum, região diferente na ortografia/vocabulário. Os outros
// 7 são de variante única, então "en-US"/"en-GB" etc. caem em "en" via
// nonExplicitSupportedLngs (ver abaixo).
export const SUPPORTED_LOCALES = ['pt-BR', 'pt-PT', 'en', 'es', 'fr', 'de', 'ru', 'zh', 'it']

export const LOCALE_LABELS = {
  'pt-BR': 'Português (Brasil)',
  'pt-PT': 'Português (Portugal)',
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  ru: 'Русский',
  zh: '中文',
  it: 'Italiano',
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'pt-BR': { common: ptBRCommon, errors: ptBRErrors },
      'pt-PT': { common: ptPTCommon, errors: ptPTErrors },
      en: { common: enCommon, errors: enErrors },
      es: { common: esCommon, errors: esErrors },
      fr: { common: frCommon, errors: frErrors },
      de: { common: deCommon, errors: deErrors },
      ru: { common: ruCommon, errors: ruErrors },
      zh: { common: zhCommon, errors: zhErrors },
      it: { common: itCommon, errors: itErrors },
    },
    fallbackLng: 'pt-BR',
    supportedLngs: SUPPORTED_LOCALES,
    // NÃO usar nonExplicitSupportedLngs aqui: combinado com supportedLngs,
    // uma versão instalada do i18next (26.3.6) quebra a resolução de TODA
    // chave (t() sempre devolve a chave crua, mesmo com o bundle certo
    // carregado — confirmado isolando o bug numa instância mínima). A
    // conversão de "en-US"/"de-DE"/etc. pro código suportado mais próximo
    // fica por conta própria em detection.convertDetectedLanguage abaixo.
    load: 'currentOnly',
    ns: ['common', 'errors'],
    defaultNS: 'common',
    interpolation: { escapeValue: false }, // React já escapa
    detection: {
      // localStorage primeiro (escolha explícita do usuário, inclusive
      // anônimo); navigator só como sugestão de primeiro acesso — a
      // preferência salva no servidor (settings.prefs.locale, ver
      // useLocale.js) tem prioridade sobre os dois pra quem está logado.
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'ck-locale',
      convertDetectedLanguage: (lng) => {
        if (SUPPORTED_LOCALES.includes(lng)) return lng
        const base = lng.split('-')[0].toLowerCase()
        // "pt" sozinho (sem região) é ambíguo entre BR/PT — cai no
        // fallbackLng (pt-BR) via supportedLngs, não escolhe um dos dois
        // no escuro.
        if (base === 'pt') return lng.toLowerCase() === 'pt-pt' ? 'pt-PT' : 'pt-BR'
        const match = SUPPORTED_LOCALES.find((l) => l.toLowerCase() === base)
        return match || lng
      },
    },
  })

// tradução de um error_code vindo da API (ver backend/utils/error_codes.py)
// — usa o namespace "errors", cai pro texto em PT já devolvido pela API se
// o código não estiver mapeado (defensivo, rota nova sem entrada ainda).
export function translateErrorCode(code, fallbackText) {
  if (!code) return fallbackText
  const key = `errors:${code}`
  return i18n.exists(key) ? i18n.t(key) : fallbackText
}

export default i18n
