import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { IconBell } from './icons'

/** Sino de alertas — anúncios ativos do mural que batem cidade + instrumento
 * com o perfil do usuário (ver ProfileModal.jsx::AlertProfileSection).
 * Contagem computada ao vivo (sem tabela de notificação persistida, ver
 * alerts_service.py), atualizada por polling — mesmo raciocínio de
 * intervalo do useActivityPing.js, aqui via refetchInterval do react-query
 * em vez de um hook próprio. */
export default function AlertsBell() {
  const { t } = useTranslation('alerts')
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const { data: alerts } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => api.get('/me/alerts').then((r) => r.data),
    refetchInterval: 60_000,
  })

  const dismiss = useMutation({
    mutationFn: (postId) => api.post(`/me/alerts/${postId}/dismiss`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  })

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const count = alerts?.length || 0

  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className="theme-toggle alerts-bell" onClick={() => setOpen((o) => !o)}
        aria-label={t('badgeLabel', { count })}>
        <IconBell />
        {count > 0 && <span className="alerts-badge">{count > 9 ? '9+' : count}</span>}
      </button>
      {open && (
        <div className="user-menu-panel alerts-panel">
          <h4 className="alerts-panel-title">{t('title')}</h4>
          {!alerts?.length && <div className="empty" style={{ padding: '18px 0' }}>{t('empty')}</div>}
          {alerts?.map((a) => (
            <div key={a.id} className="alerts-item">
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{a.band_name}</strong>
                <div className="page-sub" style={{ margin: 0 }}>
                  {[a.city, a.genero].filter(Boolean).join(' · ')}
                </div>
                <Link to="/mural" className="btn" style={{ marginTop: 6 }} onClick={() => setOpen(false)}>
                  {t('viewAd')}
                </Link>
              </div>
              <button type="button" className="alerts-dismiss" disabled={dismiss.isPending}
                onClick={() => dismiss.mutate(a.id)} aria-label={t('dismiss')}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
