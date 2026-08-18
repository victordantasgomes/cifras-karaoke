import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { usePublicApiBase } from '../utils/publicApiBase'
import KaraokeStage from './KaraokeStage'
import ScrollPlayer from './ScrollPlayer'

/**
 * Roteador entre os dois modos de execução de uma música (ver
 * SongEditor.jsx::EXECUTION_MODES e karaoke_service.py::payload):
 * "rolagem" (padrão) monta ScrollPlayer.jsx — rola a página inteira sem
 * trocar cor de nenhum caractere; "karaoke" monta o palco linha-a-linha já
 * existente (KaraokeStage.jsx). A escolha vem só do `@modoexecucao` da
 * própria música, editável na aba Editar.
 *
 * A mesma query (['karaoke', slug]) é reaproveitada por KaraokeStage sem
 * round-trip extra (staleTime: Infinity, cache já quente) — este
 * componente só precisa do payload pra decidir qual dos dois montar.
 */
export default function KaraokePlayer() {
  const { t } = useTranslation()
  const { slug } = useParams()
  const base = usePublicApiBase()
  const { data, isLoading } = useQuery({
    queryKey: ['karaoke', slug, base],
    queryFn: () => api.get(`${base}/karaoke/${slug}`).then((r) => r.data),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  if (isLoading || !data) {
    return <div className="karaoke-stage controls-visible"
      style={{ display: 'grid', placeItems: 'center' }}>{t('loadingChord')}</div>
  }

  return data.modo_execucao === 'karaoke' ? <KaraokeStage /> : <ScrollPlayer data={data} />
}
