// Espelha backend/utils/slug.py — usado no editor para casar o texto de uma
// linha "[@sample] nome" com o id (slug) de um sample já cadastrado, do
// mesmo jeito que karaoke_service.py::payload faz no servidor.
const COMBINING_MARKS_RE = /[̀-ͯ]/g

export function slugify(text) {
  const folded = (text || '').normalize('NFKD').replace(COMBINING_MARKS_RE, '')
  const cleaned = folded.replace(/[^\w\s-]/g, '').trim().toLowerCase()
  return cleaned.replace(/[\s_]+/g, '-')
}
