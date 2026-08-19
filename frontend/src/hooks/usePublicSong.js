import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import api from '../services/api'

/** Busca uma música pública (`GET /public/songs/:slug`) + transposição-
 * prévia (`POST /public/songs/:slug/transpose`, sempre `save=False` no
 * servidor — nunca persiste). Extraído de PublicSongView.jsx. A prévia fica
 * só em estado local, nunca escrita de volta no cache de `data`, então um F5
 * (ou trocar de música e voltar) sempre mostra o tom real salvo. */
export function usePublicSong(slug) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-song', slug],
    queryFn: () => api.get(`/public/songs/${slug}`).then((r) => r.data),
    enabled: Boolean(slug),
    retry: false,
  })

  const [preview, setPreview] = useState(null)
  const transpose = useMutation({
    mutationFn: (payload) => api.post(`/public/songs/${slug}/transpose`, payload).then((r) => r.data),
    onSuccess: (r) => setPreview(r),
  })

  const header = preview?.header || data?.header
  const body = preview?.body || data?.body

  return { data, isLoading, isError, header, body, transpose }
}

export async function exportPublicSongTxt(slug, titulo) {
  const { data } = await api.get(`/public/songs/${slug}/export`, { responseType: 'blob' })
  const url = URL.createObjectURL(data)
  const a = document.createElement('a')
  a.href = url
  a.download = `${titulo || slug}.txt`
  a.click()
  URL.revokeObjectURL(url)
}
