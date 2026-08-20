import { useCurrentTheme } from '../hooks/useTheme'
import logoPreta from '../assets/logo-horizontal-preta.png'
import logoBranca from '../assets/logo-horizontal-branca.png'

/** Logo horizontal da marca (fundo transparente nos dois PNGs) — escolhe
 * a versão preta ou branca conforme o tema atual do visitante. Usada em
 * qualquer tela que respeita o tema salvo do usuário (sidebar, login,
 * cadastro, mural, landing) — só /sobre2 (Footer2.jsx) é sempre clara de
 * propósito e por isso importa logo-horizontal-preta.png direto, sem
 * precisar deste componente. */
export default function BrandLogo({ className, alt = 'TumTumPa' }) {
  const theme = useCurrentTheme()
  return <img src={theme === 'dark' ? logoBranca : logoPreta} alt={alt} className={className} />
}
