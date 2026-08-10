import { useTranslation } from 'react-i18next'
import { useCurrentTheme, useChangeTheme } from '../hooks/useTheme'
import { IconSun, IconMoon } from './icons'

/** Botão de alternância claro/escuro — usado tanto no shell autenticado
 * (Layout.jsx) quanto no Mural público (BandBoard.jsx), que também respeita
 * o tema do usuário. NÃO aparece na Landing (sempre clara, de propósito —
 * useForceLightTheme) nem no palco de karaokê (sempre escuro, legibilidade
 * em apresentação) — nesses dois lugares o tema é uma escolha de design
 * fixa, não uma preferência pra alternar. */
export default function ThemeToggle({ className = '' }) {
  const { t } = useTranslation('common')
  const theme = useCurrentTheme()
  const changeTheme = useChangeTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`}
      onClick={() => changeTheme({ theme: isDark ? 'light' : 'dark' })}
      title={t(isDark ? 'theme.switchToLight' : 'theme.switchToDark')}
      aria-label={t(isDark ? 'theme.switchToLight' : 'theme.switchToDark')}
    >
      {isDark ? <IconSun /> : <IconMoon />}
    </button>
  )
}
