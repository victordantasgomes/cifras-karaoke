import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { useColorSettings } from './hooks/useColorSettings'
import Layout from './components/Layout'
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

export default function App() {
  useColorSettings()
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<SignUp />} />
        <Route path="/karaoke/:slug" element={<KaraokePlayer />} />
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
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
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
