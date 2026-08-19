// Catálogo de ações que um botão (ou combinação) de pedal pode disparar —
// usado pelo seletor da tela de configuração (pages/PedalSetup.jsx) e como
// referência de quais ids o runtime (hooks/usePedalControl.js) pode
// resolver. `contexts` marca em qual(is) player(s) a ação existe de verdade
// (ScrollPlayer = modo rolagem, KaraokeStage = modo karaokê linha a linha);
// fora desses contextos o runtime simplesmente não tem esse handler e a
// ação vira no-op — mesmo princípio de "próxima linha" já não existir hoje
// em ScrollPlayer. `songModeGated`, quando presente, só anota no seletor
// ("só ativa em músicas com esse modo ligado") — a tela de configuração não
// conhece a música que vai tocar, então não dá pra esconder a opção.
export const PEDAL_ACTIONS = [
  { id: 'toggle_play', labelKey: 'actions.togglePlay', contexts: ['scrollPlayer', 'karaokeStage'] },
  { id: 'next_line', labelKey: 'actions.nextLine', contexts: ['karaokeStage'] },
  { id: 'prev_line', labelKey: 'actions.prevLine', contexts: ['karaokeStage'] },
  { id: 'scroll_nudge_up', labelKey: 'actions.scrollNudgeUp', contexts: ['scrollPlayer'] },
  { id: 'scroll_nudge_down', labelKey: 'actions.scrollNudgeDown', contexts: ['scrollPlayer'] },
  { id: 'restart', labelKey: 'actions.restart', contexts: ['scrollPlayer', 'karaokeStage'] },
  { id: 'exit', labelKey: 'actions.exit', contexts: ['scrollPlayer', 'karaokeStage'] },
  { id: 'toggle_fullscreen', labelKey: 'actions.toggleFullscreen', contexts: ['scrollPlayer', 'karaokeStage'] },
  { id: 'zoom_in', labelKey: 'actions.zoomIn', contexts: ['scrollPlayer', 'karaokeStage'] },
  { id: 'zoom_out', labelKey: 'actions.zoomOut', contexts: ['scrollPlayer', 'karaokeStage'] },
  { id: 'rate_up', labelKey: 'actions.rateUp', contexts: ['scrollPlayer', 'karaokeStage'] },
  { id: 'rate_down', labelKey: 'actions.rateDown', contexts: ['scrollPlayer', 'karaokeStage'] },
  { id: 'next_song', labelKey: 'actions.nextSong', contexts: ['scrollPlayer', 'karaokeStage'] },
  { id: 'prev_song', labelKey: 'actions.prevSong', contexts: ['scrollPlayer', 'karaokeStage'] },
  { id: 'stop_playlist', labelKey: 'actions.stopPlaylist', contexts: ['scrollPlayer', 'karaokeStage'] },
  { id: 'toggle_with_youtube', labelKey: 'actions.toggleWithYoutube', contexts: ['scrollPlayer', 'karaokeStage'] },
  { id: 'clip_queue_next', labelKey: 'actions.clipQueueNext', contexts: ['scrollPlayer', 'karaokeStage'], songModeGated: 'fila_clipes' },
  { id: 'toggle_full_track', labelKey: 'actions.toggleFullTrack', contexts: ['scrollPlayer', 'karaokeStage'], songModeGated: 'faixa_completa' },
]

export function findPedalAction(actionId) {
  return PEDAL_ACTIONS.find((a) => a.id === actionId) || null
}
