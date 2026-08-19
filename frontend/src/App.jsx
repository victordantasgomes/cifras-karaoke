import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './i18n'
import { useColorSettings } from './hooks/useColorSettings'
import { useLocale } from './hooks/useLocale'
import { useTheme } from './hooks/useTheme'
import { useActivityPing } from './hooks/useActivityPing'
import Layout from './components/Layout'
import PublicHome from './pages/PublicHome'
import PublicSongView from './pages/PublicSongView'
import About from './pages/About'
import Main2 from './pages/Main2'
import Sobre2 from './pages/Sobre2'
import BandBoard from './pages/BandBoard'
import BandBoardManage from './pages/BandBoardManage'
import Login from './pages/Login'
import SignUp from './pages/SignUp'
import Dashboard from './pages/Dashboard'
import Songs from './pages/Songs'
import SongEditor from './pages/SongEditor'
import Setlists from './pages/Setlists'
import SetlistDetail from './pages/SetlistDetail'
import KaraokeHome from './pages/KaraokeHome'
import KaraokePlayer from './pages/KaraokePlayer'
import ChordDictionary from './pages/ChordDictionary'
import HistoryPage from './pages/HistoryPage'
import Settings from './pages/Settings'
import Profile from './pages/Profile'
import Pricing from './pages/Pricing'
import Metronome from './pages/Metronome'
import Tuner from './pages/Tuner'
import AdminTools from './pages/AdminTools'
import AdminSales from './pages/AdminSales'

export default function App() {
  useColorSettings()
  useLocale()
  useTheme()
  useActivityPing()
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PublicHome />} />
        <Route path="/sobre" element={<About />} />
        <Route path="/main2" element={<Main2 />} />
        <Route path="/sobre2" element={<Sobre2 />} />
        <Route path="/cifra/:slug" element={<PublicSongView />} />
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<SignUp />} />
        <Route path="/karaoke/:slug" element={<KaraokePlayer />} />
        <Route path="/mural" element={<BandBoard />} />
        <Route element={<Layout />}>
          <Route path="/painel" element={<Dashboard />} />
          <Route path="/mural/meus-anuncios" element={<BandBoardManage />} />
          <Route path="/musicas" element={<Songs />} />
          <Route path="/musicas/:slug" element={<SongEditor />} />
          <Route path="/favoritas" element={<Songs favoritesOnly />} />
          <Route path="/setlists" element={<Setlists />} />
          <Route path="/setlists/:id" element={<SetlistDetail />} />
          <Route path="/karaoke" element={<KaraokeHome />} />
          <Route path="/dicionario-acordes" element={<ChordDictionary />} />
          <Route path="/historico" element={<HistoryPage />} />
          <Route path="/configuracoes" element={<Settings />} />
          <Route path="/perfil" element={<Profile />} />
          <Route path="/planos" element={<Pricing />} />
          <Route path="/metronomo" element={<Metronome />} />
          <Route path="/afinador" element={<Tuner />} />
          <Route path="/admin/ferramenta" element={<AdminTools />} />
          <Route path="/admin/vendas" element={<AdminSales />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
