// Vocabulário fechado de instrumentos — espelha backend/utils/instruments.py
// (mesmos ids dos dois lados). Usado no perfil do usuário (quais
// instrumentos ele toca) e nos "instrumentos buscados" de um anúncio do
// mural — precisa ser o mesmo vocabulário nos dois lugares pra alertas por
// instrumento funcionarem (comparação de array, não de texto aproximado).
//
// Não confundir com ./tunings.js::INSTRUMENTS (só 5 instrumentos, específico
// do Afinador/tuner, formato {id, labelKey, tunings}).
export const INSTRUMENTS = [
  'guitar', 'bass', 'drums', 'vocals', 'keys', 'piano',
  'saxophone', 'violin', 'ukulele', 'percussion', 'other',
]

// mesma escala já usada em bandBoard.json::form.skillLevels (nível da banda
// como um todo) — cópia própria pro nível técnico POR instrumento do
// usuário (ver Fase 1 do plano: mantidas independentes de propósito).
export const SKILL_LEVELS = ['iniciante', 'intermediario', 'avancado', 'profissional']
