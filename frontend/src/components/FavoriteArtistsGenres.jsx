import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'

/**
 * Favoritos de artista/gênero (Fase 6) — complementa favoritar música por
 * música: favoritar "Legião Urbana" aqui traz toda a discografia dela pra
 * /favoritas (ver GET /songs?favoritas=1, que agora inclui OR de artista/
 * gênero favorito — favorites_service.py + search_service.py). Só aparece
 * na tela /favoritas (ver Songs.jsx).
 */
export default function FavoriteArtistsGenres() {
  const { t } = useTranslation('songs')
  const qc = useQueryClient()

  const { data: favorites } = useQuery({
    queryKey: ['favorites'],
    queryFn: () => api.get('/favorites').then((r) => r.data),
  })
  const { data: facets } = useQuery({ queryKey: ['facets'], queryFn: () => api.get('/songs/facets').then((r) => r.data) })

  const toggleArtist = useMutation({
    mutationFn: ({ name, value }) => api.post('/favorites/artists', { name, value }).then((r) => r.data),
    onSuccess: (data) => {
      qc.setQueryData(['favorites'], data)
      qc.invalidateQueries({ queryKey: ['songs'] })
    },
  })
  const toggleGenre = useMutation({
    mutationFn: ({ name, value }) => api.post('/favorites/genres', { name, value }).then((r) => r.data),
    onSuccess: (data) => {
      qc.setQueryData(['favorites'], data)
      qc.invalidateQueries({ queryKey: ['songs'] })
    },
  })

  const artists = favorites?.artists || []
  const genres = favorites?.genres || []
  const availableArtists = (facets?.interpretes || []).filter((a) => !artists.includes(a))
  const availableGenres = (facets?.generos || []).filter((g) => !genres.includes(g))

  return (
    <div className="card no-print" style={{ marginBottom: 16 }}>
      <h3 style={{ marginBottom: 4 }}>{t('favorites.title')}</h3>
      <p style={{ color: 'var(--muted)', margin: '0 0 14px' }}>{t('favorites.description')}</p>

      <div className="field">
        <label>{t('favorites.artistsLabel')}</label>
        <div className="row" style={{ gap: 8, marginBottom: 8 }}>
          {artists.length === 0 && <span className="page-sub" style={{ margin: 0 }}>{t('favorites.noneArtists')}</span>}
          {artists.map((name) => (
            <button key={name} type="button" className="chip" style={{ cursor: 'pointer', border: 'none' }}
              title={t('favorites.remove', { name })}
              onClick={() => toggleArtist.mutate({ name, value: false })}>
              {name} ×
            </button>
          ))}
        </div>
        <select className="input" style={{ maxWidth: 280 }} value=""
          onChange={(e) => e.target.value && toggleArtist.mutate({ name: e.target.value, value: true })}>
          <option value="">{t('favorites.addArtistPlaceholder')}</option>
          {availableArtists.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label>{t('favorites.genresLabel')}</label>
        <div className="row" style={{ gap: 8, marginBottom: 8 }}>
          {genres.length === 0 && <span className="page-sub" style={{ margin: 0 }}>{t('favorites.noneGenres')}</span>}
          {genres.map((name) => (
            <button key={name} type="button" className="chip" style={{ cursor: 'pointer', border: 'none' }}
              title={t('favorites.remove', { name })}
              onClick={() => toggleGenre.mutate({ name, value: false })}>
              {name} ×
            </button>
          ))}
        </div>
        <select className="input" style={{ maxWidth: 280 }} value=""
          onChange={(e) => e.target.value && toggleGenre.mutate({ name: e.target.value, value: true })}>
          <option value="">{t('favorites.addGenrePlaceholder')}</option>
          {availableGenres.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>
    </div>
  )
}
