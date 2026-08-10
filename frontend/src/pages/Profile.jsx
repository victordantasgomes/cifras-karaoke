import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../store/authStore'

export default function Profile() {
  const { t } = useTranslation('profile')
  const user = useAuthStore((s) => s.user)
  return (
    <>
      <h1 className="page-title">{t('title')}</h1>
      <div className="page-sub">{t('subtitle')}</div>
      <div className="card" style={{ maxWidth: 420 }}>
        <div className="field"><label>{t('name')}</label><div>{user?.name}</div></div>
        <div className="field"><label>{t('username')}</label><div>{user?.username}</div></div>
        <div className="field"><label>{t('id')}</label><div style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{user?.id}</div></div>
      </div>
    </>
  )
}
