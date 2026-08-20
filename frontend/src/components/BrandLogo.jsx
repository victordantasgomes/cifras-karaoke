import { useCurrentTheme } from '../hooks/useTheme'
import logoPreta from '../assets/logo-horizontal-preta.png'
import logoBranca from '../assets/logo-horizontal-branca.png'

/** Logo horizontal da marca (fundo transparente nos dois PNGs) — escolhe
 * a versão preta ou branca conforme o tema atual do visitante. Sidebar,
 * login, cadastro e a landing (`/`) usam as artes novas fixas (fundo preto
 * próprio, não alternam por tema — ver logo-tumtumpa-banner.png/
 * logo-tumtumpa-login.png) direto, sem este componente. Continua em uso no
 * mural (BandBoard.jsx), na cifra pública (PublicHeader.jsx) e em /sobre2
 * (Header2.jsx) — telas que ainda alternam a logo pelo tema. */
export default function BrandLogo({ className, alt = 'TumTumPa' }) {
  const theme = useCurrentTheme()
  return <img src={theme === 'dark' ? logoBranca : logoPreta} alt={alt} className={className} />
}
