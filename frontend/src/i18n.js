import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import ptBRCommon from './locales/pt-BR/common.json'
import ptBRErrors from './locales/pt-BR/errors.json'
import ptBRDashboard from './locales/pt-BR/dashboard.json'
import ptBRSongs from './locales/pt-BR/songs.json'
import ptBRSetlists from './locales/pt-BR/setlists.json'
import ptBRSetlistDetail from './locales/pt-BR/setlistDetail.json'
import ptBRProfile from './locales/pt-BR/profile.json'
import ptBRKaraokeHome from './locales/pt-BR/karaokeHome.json'
import ptBRHistory from './locales/pt-BR/history.json'
import ptBRPricing from './locales/pt-BR/pricing.json'
import ptBRSettings from './locales/pt-BR/settings.json'
import ptBRSongEditor from './locales/pt-BR/songEditor.json'
import ptBRKaraokeStage from './locales/pt-BR/karaokeStage.json'
import ptBRScrollPlayer from './locales/pt-BR/scrollPlayer.json'
import ptBRChordDictionary from './locales/pt-BR/chordDictionary.json'
import ptBRSyncWorkspace from './locales/pt-BR/syncWorkspace.json'
import ptBRLanding from './locales/pt-BR/landing.json'
import ptBRBandBoard from './locales/pt-BR/bandBoard.json'
import ptBRMetronome from './locales/pt-BR/metronome.json'
import ptBRTuner from './locales/pt-BR/tuner.json'
import ptBRAdminTools from './locales/pt-BR/adminTools.json'
import ptBRAdminSales from './locales/pt-BR/adminSales.json'
import ptBRProfileModal from './locales/pt-BR/profileModal.json'
import ptBRInstruments from './locales/pt-BR/instruments.json'
import ptBRAlerts from './locales/pt-BR/alerts.json'
import ptBRPublicHome from './locales/pt-BR/publicHome.json'
import ptBRLanding2 from './locales/pt-BR/landing2.json'
import ptBRPedalSetup from './locales/pt-BR/pedalSetup.json'
import ptBRPublicFeedback from './locales/pt-BR/publicFeedback.json'

import ptPTCommon from './locales/pt-PT/common.json'
import ptPTErrors from './locales/pt-PT/errors.json'
import ptPTDashboard from './locales/pt-PT/dashboard.json'
import ptPTSongs from './locales/pt-PT/songs.json'
import ptPTSetlists from './locales/pt-PT/setlists.json'
import ptPTSetlistDetail from './locales/pt-PT/setlistDetail.json'
import ptPTProfile from './locales/pt-PT/profile.json'
import ptPTKaraokeHome from './locales/pt-PT/karaokeHome.json'
import ptPTHistory from './locales/pt-PT/history.json'
import ptPTPricing from './locales/pt-PT/pricing.json'
import ptPTSettings from './locales/pt-PT/settings.json'
import ptPTSongEditor from './locales/pt-PT/songEditor.json'
import ptPTKaraokeStage from './locales/pt-PT/karaokeStage.json'
import ptPTScrollPlayer from './locales/pt-PT/scrollPlayer.json'
import ptPTChordDictionary from './locales/pt-PT/chordDictionary.json'
import ptPTSyncWorkspace from './locales/pt-PT/syncWorkspace.json'
import ptPTLanding from './locales/pt-PT/landing.json'
import ptPTBandBoard from './locales/pt-PT/bandBoard.json'
import ptPTMetronome from './locales/pt-PT/metronome.json'
import ptPTTuner from './locales/pt-PT/tuner.json'
import ptPTAdminTools from './locales/pt-PT/adminTools.json'
import ptPTAdminSales from './locales/pt-PT/adminSales.json'
import ptPTProfileModal from './locales/pt-PT/profileModal.json'
import ptPTInstruments from './locales/pt-PT/instruments.json'
import ptPTAlerts from './locales/pt-PT/alerts.json'
import ptPTPublicHome from './locales/pt-PT/publicHome.json'
import ptPTLanding2 from './locales/pt-PT/landing2.json'
import ptPTPedalSetup from './locales/pt-PT/pedalSetup.json'
import ptPTPublicFeedback from './locales/pt-PT/publicFeedback.json'

import enCommon from './locales/en/common.json'
import enErrors from './locales/en/errors.json'
import enDashboard from './locales/en/dashboard.json'
import enSongs from './locales/en/songs.json'
import enSetlists from './locales/en/setlists.json'
import enSetlistDetail from './locales/en/setlistDetail.json'
import enProfile from './locales/en/profile.json'
import enKaraokeHome from './locales/en/karaokeHome.json'
import enHistory from './locales/en/history.json'
import enPricing from './locales/en/pricing.json'
import enSettings from './locales/en/settings.json'
import enSongEditor from './locales/en/songEditor.json'
import enKaraokeStage from './locales/en/karaokeStage.json'
import enScrollPlayer from './locales/en/scrollPlayer.json'
import enChordDictionary from './locales/en/chordDictionary.json'
import enSyncWorkspace from './locales/en/syncWorkspace.json'
import enLanding from './locales/en/landing.json'
import enBandBoard from './locales/en/bandBoard.json'
import enMetronome from './locales/en/metronome.json'
import enTuner from './locales/en/tuner.json'
import enAdminTools from './locales/en/adminTools.json'
import enAdminSales from './locales/en/adminSales.json'
import enProfileModal from './locales/en/profileModal.json'
import enInstruments from './locales/en/instruments.json'
import enAlerts from './locales/en/alerts.json'
import enPublicHome from './locales/en/publicHome.json'
import enLanding2 from './locales/en/landing2.json'
import enPedalSetup from './locales/en/pedalSetup.json'
import enPublicFeedback from './locales/en/publicFeedback.json'

import esCommon from './locales/es/common.json'
import esErrors from './locales/es/errors.json'
import esDashboard from './locales/es/dashboard.json'
import esSongs from './locales/es/songs.json'
import esSetlists from './locales/es/setlists.json'
import esSetlistDetail from './locales/es/setlistDetail.json'
import esProfile from './locales/es/profile.json'
import esKaraokeHome from './locales/es/karaokeHome.json'
import esHistory from './locales/es/history.json'
import esPricing from './locales/es/pricing.json'
import esSettings from './locales/es/settings.json'
import esSongEditor from './locales/es/songEditor.json'
import esKaraokeStage from './locales/es/karaokeStage.json'
import esScrollPlayer from './locales/es/scrollPlayer.json'
import esChordDictionary from './locales/es/chordDictionary.json'
import esSyncWorkspace from './locales/es/syncWorkspace.json'
import esLanding from './locales/es/landing.json'
import esBandBoard from './locales/es/bandBoard.json'
import esMetronome from './locales/es/metronome.json'
import esTuner from './locales/es/tuner.json'
import esAdminTools from './locales/es/adminTools.json'
import esAdminSales from './locales/es/adminSales.json'
import esProfileModal from './locales/es/profileModal.json'
import esInstruments from './locales/es/instruments.json'
import esAlerts from './locales/es/alerts.json'
import esPublicHome from './locales/es/publicHome.json'
import esLanding2 from './locales/es/landing2.json'
import esPedalSetup from './locales/es/pedalSetup.json'
import esPublicFeedback from './locales/es/publicFeedback.json'

import frCommon from './locales/fr/common.json'
import frErrors from './locales/fr/errors.json'
import frDashboard from './locales/fr/dashboard.json'
import frSongs from './locales/fr/songs.json'
import frSetlists from './locales/fr/setlists.json'
import frSetlistDetail from './locales/fr/setlistDetail.json'
import frProfile from './locales/fr/profile.json'
import frKaraokeHome from './locales/fr/karaokeHome.json'
import frHistory from './locales/fr/history.json'
import frPricing from './locales/fr/pricing.json'
import frSettings from './locales/fr/settings.json'
import frSongEditor from './locales/fr/songEditor.json'
import frKaraokeStage from './locales/fr/karaokeStage.json'
import frScrollPlayer from './locales/fr/scrollPlayer.json'
import frChordDictionary from './locales/fr/chordDictionary.json'
import frSyncWorkspace from './locales/fr/syncWorkspace.json'
import frLanding from './locales/fr/landing.json'
import frBandBoard from './locales/fr/bandBoard.json'
import frMetronome from './locales/fr/metronome.json'
import frTuner from './locales/fr/tuner.json'
import frAdminTools from './locales/fr/adminTools.json'
import frAdminSales from './locales/fr/adminSales.json'
import frProfileModal from './locales/fr/profileModal.json'
import frInstruments from './locales/fr/instruments.json'
import frAlerts from './locales/fr/alerts.json'
import frPublicHome from './locales/fr/publicHome.json'
import frLanding2 from './locales/fr/landing2.json'
import frPedalSetup from './locales/fr/pedalSetup.json'
import frPublicFeedback from './locales/fr/publicFeedback.json'

import deCommon from './locales/de/common.json'
import deErrors from './locales/de/errors.json'
import deDashboard from './locales/de/dashboard.json'
import deSongs from './locales/de/songs.json'
import deSetlists from './locales/de/setlists.json'
import deSetlistDetail from './locales/de/setlistDetail.json'
import deProfile from './locales/de/profile.json'
import deKaraokeHome from './locales/de/karaokeHome.json'
import deHistory from './locales/de/history.json'
import dePricing from './locales/de/pricing.json'
import deSettings from './locales/de/settings.json'
import deSongEditor from './locales/de/songEditor.json'
import deKaraokeStage from './locales/de/karaokeStage.json'
import deScrollPlayer from './locales/de/scrollPlayer.json'
import deChordDictionary from './locales/de/chordDictionary.json'
import deSyncWorkspace from './locales/de/syncWorkspace.json'
import deLanding from './locales/de/landing.json'
import deBandBoard from './locales/de/bandBoard.json'
import deMetronome from './locales/de/metronome.json'
import deTuner from './locales/de/tuner.json'
import deAdminTools from './locales/de/adminTools.json'
import deAdminSales from './locales/de/adminSales.json'
import deProfileModal from './locales/de/profileModal.json'
import deInstruments from './locales/de/instruments.json'
import deAlerts from './locales/de/alerts.json'
import dePublicHome from './locales/de/publicHome.json'
import deLanding2 from './locales/de/landing2.json'
import dePedalSetup from './locales/de/pedalSetup.json'
import dePublicFeedback from './locales/de/publicFeedback.json'

import ruCommon from './locales/ru/common.json'
import ruErrors from './locales/ru/errors.json'
import ruDashboard from './locales/ru/dashboard.json'
import ruSongs from './locales/ru/songs.json'
import ruSetlists from './locales/ru/setlists.json'
import ruSetlistDetail from './locales/ru/setlistDetail.json'
import ruProfile from './locales/ru/profile.json'
import ruKaraokeHome from './locales/ru/karaokeHome.json'
import ruHistory from './locales/ru/history.json'
import ruPricing from './locales/ru/pricing.json'
import ruSettings from './locales/ru/settings.json'
import ruSongEditor from './locales/ru/songEditor.json'
import ruKaraokeStage from './locales/ru/karaokeStage.json'
import ruScrollPlayer from './locales/ru/scrollPlayer.json'
import ruChordDictionary from './locales/ru/chordDictionary.json'
import ruSyncWorkspace from './locales/ru/syncWorkspace.json'
import ruLanding from './locales/ru/landing.json'
import ruBandBoard from './locales/ru/bandBoard.json'
import ruMetronome from './locales/ru/metronome.json'
import ruTuner from './locales/ru/tuner.json'
import ruAdminTools from './locales/ru/adminTools.json'
import ruAdminSales from './locales/ru/adminSales.json'
import ruProfileModal from './locales/ru/profileModal.json'
import ruInstruments from './locales/ru/instruments.json'
import ruAlerts from './locales/ru/alerts.json'
import ruPublicHome from './locales/ru/publicHome.json'
import ruLanding2 from './locales/ru/landing2.json'
import ruPedalSetup from './locales/ru/pedalSetup.json'
import ruPublicFeedback from './locales/ru/publicFeedback.json'

import zhCommon from './locales/zh/common.json'
import zhErrors from './locales/zh/errors.json'
import zhDashboard from './locales/zh/dashboard.json'
import zhSongs from './locales/zh/songs.json'
import zhSetlists from './locales/zh/setlists.json'
import zhSetlistDetail from './locales/zh/setlistDetail.json'
import zhProfile from './locales/zh/profile.json'
import zhKaraokeHome from './locales/zh/karaokeHome.json'
import zhHistory from './locales/zh/history.json'
import zhPricing from './locales/zh/pricing.json'
import zhSettings from './locales/zh/settings.json'
import zhSongEditor from './locales/zh/songEditor.json'
import zhKaraokeStage from './locales/zh/karaokeStage.json'
import zhScrollPlayer from './locales/zh/scrollPlayer.json'
import zhChordDictionary from './locales/zh/chordDictionary.json'
import zhSyncWorkspace from './locales/zh/syncWorkspace.json'
import zhLanding from './locales/zh/landing.json'
import zhBandBoard from './locales/zh/bandBoard.json'
import zhMetronome from './locales/zh/metronome.json'
import zhTuner from './locales/zh/tuner.json'
import zhAdminTools from './locales/zh/adminTools.json'
import zhAdminSales from './locales/zh/adminSales.json'
import zhProfileModal from './locales/zh/profileModal.json'
import zhInstruments from './locales/zh/instruments.json'
import zhAlerts from './locales/zh/alerts.json'
import zhPublicHome from './locales/zh/publicHome.json'
import zhLanding2 from './locales/zh/landing2.json'
import zhPedalSetup from './locales/zh/pedalSetup.json'
import zhPublicFeedback from './locales/zh/publicFeedback.json'

import itCommon from './locales/it/common.json'
import itErrors from './locales/it/errors.json'
import itDashboard from './locales/it/dashboard.json'
import itSongs from './locales/it/songs.json'
import itSetlists from './locales/it/setlists.json'
import itSetlistDetail from './locales/it/setlistDetail.json'
import itProfile from './locales/it/profile.json'
import itKaraokeHome from './locales/it/karaokeHome.json'
import itHistory from './locales/it/history.json'
import itPricing from './locales/it/pricing.json'
import itSettings from './locales/it/settings.json'
import itSongEditor from './locales/it/songEditor.json'
import itKaraokeStage from './locales/it/karaokeStage.json'
import itScrollPlayer from './locales/it/scrollPlayer.json'
import itChordDictionary from './locales/it/chordDictionary.json'
import itSyncWorkspace from './locales/it/syncWorkspace.json'
import itLanding from './locales/it/landing.json'
import itBandBoard from './locales/it/bandBoard.json'
import itMetronome from './locales/it/metronome.json'
import itTuner from './locales/it/tuner.json'
import itAdminTools from './locales/it/adminTools.json'
import itAdminSales from './locales/it/adminSales.json'
import itProfileModal from './locales/it/profileModal.json'
import itInstruments from './locales/it/instruments.json'
import itAlerts from './locales/it/alerts.json'
import itPublicHome from './locales/it/publicHome.json'
import itLanding2 from './locales/it/landing2.json'
import itPedalSetup from './locales/it/pedalSetup.json'
import itPublicFeedback from './locales/it/publicFeedback.json'

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

const NS = [
  'common', 'errors', 'dashboard', 'songs', 'setlists', 'setlistDetail', 'profile',
  'karaokeHome', 'history', 'pricing', 'settings', 'songEditor', 'karaokeStage',
  'scrollPlayer', 'chordDictionary', 'syncWorkspace', 'landing', 'bandBoard', 'metronome', 'tuner',
  'adminTools', 'adminSales', 'profileModal', 'instruments', 'alerts', 'publicHome', 'landing2',
  'pedalSetup', 'publicFeedback',
]

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'pt-BR': {
        common: ptBRCommon, errors: ptBRErrors, dashboard: ptBRDashboard, songs: ptBRSongs,
        setlists: ptBRSetlists, setlistDetail: ptBRSetlistDetail, profile: ptBRProfile,
        karaokeHome: ptBRKaraokeHome, history: ptBRHistory, pricing: ptBRPricing, settings: ptBRSettings,
        songEditor: ptBRSongEditor, karaokeStage: ptBRKaraokeStage, scrollPlayer: ptBRScrollPlayer,
        chordDictionary: ptBRChordDictionary, syncWorkspace: ptBRSyncWorkspace, landing: ptBRLanding,
        bandBoard: ptBRBandBoard, metronome: ptBRMetronome, tuner: ptBRTuner, adminTools: ptBRAdminTools,
        adminSales: ptBRAdminSales, profileModal: ptBRProfileModal, instruments: ptBRInstruments,
        alerts: ptBRAlerts, publicHome: ptBRPublicHome, landing2: ptBRLanding2, pedalSetup: ptBRPedalSetup, publicFeedback: ptBRPublicFeedback,
      },
      'pt-PT': {
        common: ptPTCommon, errors: ptPTErrors, dashboard: ptPTDashboard, songs: ptPTSongs,
        setlists: ptPTSetlists, setlistDetail: ptPTSetlistDetail, profile: ptPTProfile,
        karaokeHome: ptPTKaraokeHome, history: ptPTHistory, pricing: ptPTPricing, settings: ptPTSettings,
        songEditor: ptPTSongEditor, karaokeStage: ptPTKaraokeStage, scrollPlayer: ptPTScrollPlayer,
        chordDictionary: ptPTChordDictionary, syncWorkspace: ptPTSyncWorkspace, landing: ptPTLanding,
        bandBoard: ptPTBandBoard, metronome: ptPTMetronome, tuner: ptPTTuner, adminTools: ptPTAdminTools,
        adminSales: ptPTAdminSales, profileModal: ptPTProfileModal, instruments: ptPTInstruments,
        alerts: ptPTAlerts, publicHome: ptPTPublicHome, landing2: ptPTLanding2, pedalSetup: ptPTPedalSetup, publicFeedback: ptPTPublicFeedback,
      },
      en: {
        common: enCommon, errors: enErrors, dashboard: enDashboard, songs: enSongs,
        setlists: enSetlists, setlistDetail: enSetlistDetail, profile: enProfile,
        karaokeHome: enKaraokeHome, history: enHistory, pricing: enPricing, settings: enSettings,
        songEditor: enSongEditor, karaokeStage: enKaraokeStage, scrollPlayer: enScrollPlayer,
        chordDictionary: enChordDictionary, syncWorkspace: enSyncWorkspace, landing: enLanding,
        bandBoard: enBandBoard, metronome: enMetronome, tuner: enTuner, adminTools: enAdminTools,
        adminSales: enAdminSales, profileModal: enProfileModal, instruments: enInstruments,
        alerts: enAlerts, publicHome: enPublicHome, landing2: enLanding2, pedalSetup: enPedalSetup, publicFeedback: enPublicFeedback,
      },
      es: {
        common: esCommon, errors: esErrors, dashboard: esDashboard, songs: esSongs,
        setlists: esSetlists, setlistDetail: esSetlistDetail, profile: esProfile,
        karaokeHome: esKaraokeHome, history: esHistory, pricing: esPricing, settings: esSettings,
        songEditor: esSongEditor, karaokeStage: esKaraokeStage, scrollPlayer: esScrollPlayer,
        chordDictionary: esChordDictionary, syncWorkspace: esSyncWorkspace, landing: esLanding,
        bandBoard: esBandBoard, metronome: esMetronome, tuner: esTuner, adminTools: esAdminTools,
        adminSales: esAdminSales, profileModal: esProfileModal, instruments: esInstruments,
        alerts: esAlerts, publicHome: esPublicHome, landing2: esLanding2, pedalSetup: esPedalSetup, publicFeedback: esPublicFeedback,
      },
      fr: {
        common: frCommon, errors: frErrors, dashboard: frDashboard, songs: frSongs,
        setlists: frSetlists, setlistDetail: frSetlistDetail, profile: frProfile,
        karaokeHome: frKaraokeHome, history: frHistory, pricing: frPricing, settings: frSettings,
        songEditor: frSongEditor, karaokeStage: frKaraokeStage, scrollPlayer: frScrollPlayer,
        chordDictionary: frChordDictionary, syncWorkspace: frSyncWorkspace, landing: frLanding,
        bandBoard: frBandBoard, metronome: frMetronome, tuner: frTuner, adminTools: frAdminTools,
        adminSales: frAdminSales, profileModal: frProfileModal, instruments: frInstruments,
        alerts: frAlerts, publicHome: frPublicHome, landing2: frLanding2, pedalSetup: frPedalSetup, publicFeedback: frPublicFeedback,
      },
      de: {
        common: deCommon, errors: deErrors, dashboard: deDashboard, songs: deSongs,
        setlists: deSetlists, setlistDetail: deSetlistDetail, profile: deProfile,
        karaokeHome: deKaraokeHome, history: deHistory, pricing: dePricing, settings: deSettings,
        songEditor: deSongEditor, karaokeStage: deKaraokeStage, scrollPlayer: deScrollPlayer,
        chordDictionary: deChordDictionary, syncWorkspace: deSyncWorkspace, landing: deLanding,
        bandBoard: deBandBoard, metronome: deMetronome, tuner: deTuner, adminTools: deAdminTools,
        adminSales: deAdminSales, profileModal: deProfileModal, instruments: deInstruments,
        alerts: deAlerts, publicHome: dePublicHome, landing2: deLanding2, pedalSetup: dePedalSetup, publicFeedback: dePublicFeedback,
      },
      ru: {
        common: ruCommon, errors: ruErrors, dashboard: ruDashboard, songs: ruSongs,
        setlists: ruSetlists, setlistDetail: ruSetlistDetail, profile: ruProfile,
        karaokeHome: ruKaraokeHome, history: ruHistory, pricing: ruPricing, settings: ruSettings,
        songEditor: ruSongEditor, karaokeStage: ruKaraokeStage, scrollPlayer: ruScrollPlayer,
        chordDictionary: ruChordDictionary, syncWorkspace: ruSyncWorkspace, landing: ruLanding,
        bandBoard: ruBandBoard, metronome: ruMetronome, tuner: ruTuner, adminTools: ruAdminTools,
        adminSales: ruAdminSales, profileModal: ruProfileModal, instruments: ruInstruments,
        alerts: ruAlerts, publicHome: ruPublicHome, landing2: ruLanding2, pedalSetup: ruPedalSetup, publicFeedback: ruPublicFeedback,
      },
      zh: {
        common: zhCommon, errors: zhErrors, dashboard: zhDashboard, songs: zhSongs,
        setlists: zhSetlists, setlistDetail: zhSetlistDetail, profile: zhProfile,
        karaokeHome: zhKaraokeHome, history: zhHistory, pricing: zhPricing, settings: zhSettings,
        songEditor: zhSongEditor, karaokeStage: zhKaraokeStage, scrollPlayer: zhScrollPlayer,
        chordDictionary: zhChordDictionary, syncWorkspace: zhSyncWorkspace, landing: zhLanding,
        bandBoard: zhBandBoard, metronome: zhMetronome, tuner: zhTuner, adminTools: zhAdminTools,
        adminSales: zhAdminSales, profileModal: zhProfileModal, instruments: zhInstruments,
        alerts: zhAlerts, publicHome: zhPublicHome, landing2: zhLanding2, pedalSetup: zhPedalSetup, publicFeedback: zhPublicFeedback,
      },
      it: {
        common: itCommon, errors: itErrors, dashboard: itDashboard, songs: itSongs,
        setlists: itSetlists, setlistDetail: itSetlistDetail, profile: itProfile,
        karaokeHome: itKaraokeHome, history: itHistory, pricing: itPricing, settings: itSettings,
        songEditor: itSongEditor, karaokeStage: itKaraokeStage, scrollPlayer: itScrollPlayer,
        chordDictionary: itChordDictionary, syncWorkspace: itSyncWorkspace, landing: itLanding,
        bandBoard: itBandBoard, metronome: itMetronome, tuner: itTuner, adminTools: itAdminTools,
        adminSales: itAdminSales, profileModal: itProfileModal, instruments: itInstruments,
        alerts: itAlerts, publicHome: itPublicHome, landing2: itLanding2, pedalSetup: itPedalSetup, publicFeedback: itPublicFeedback,
      },
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
    ns: NS,
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
