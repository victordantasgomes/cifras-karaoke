// Afinações padrão por instrumento — cada corda guarda só nota+oitava,
// NUNCA um Hz fixo: a frequência real é calculada em utils/pitchDetect.js
// (noteToFreq) a partir da referência A4 escolhida pelo usuário no
// Afinador, senão mudar a referência não teria efeito nenhum sobre as
// cordas de uma afinação específica.
function s(note, octave) {
  return { note, octave }
}

export const INSTRUMENTS = [
  {
    id: 'guitar',
    labelKey: 'instruments.guitar',
    tunings: [
      { id: 'standard', labelKey: 'tunings.guitarStandard', strings: [s('E', 2), s('A', 2), s('D', 3), s('G', 3), s('B', 3), s('E', 4)] },
      { id: 'dropD', labelKey: 'tunings.guitarDropD', strings: [s('D', 2), s('A', 2), s('D', 3), s('G', 3), s('B', 3), s('E', 4)] },
      { id: 'halfStepDown', labelKey: 'tunings.guitarHalfStepDown', strings: [s('D#', 2), s('G#', 2), s('C#', 3), s('F#', 3), s('A#', 3), s('D#', 4)] },
    ],
  },
  {
    id: 'bass',
    labelKey: 'instruments.bass',
    tunings: [
      { id: '4string', labelKey: 'tunings.bass4', strings: [s('E', 1), s('A', 1), s('D', 2), s('G', 2)] },
      { id: '5string', labelKey: 'tunings.bass5', strings: [s('B', 0), s('E', 1), s('A', 1), s('D', 2), s('G', 2)] },
      { id: '6string', labelKey: 'tunings.bass6', strings: [s('B', 0), s('E', 1), s('A', 1), s('D', 2), s('G', 2), s('C', 3)] },
    ],
  },
  {
    id: 'ukulele',
    labelKey: 'instruments.ukulele',
    tunings: [
      { id: 'standard', labelKey: 'tunings.ukuleleStandard', strings: [s('G', 4), s('C', 4), s('E', 4), s('A', 4)] },
    ],
  },
  {
    id: 'violin',
    labelKey: 'instruments.violin',
    tunings: [
      { id: 'standard', labelKey: 'tunings.violinStandard', strings: [s('G', 3), s('D', 4), s('A', 4), s('E', 5)] },
    ],
  },
  {
    id: 'chromatic',
    labelKey: 'instruments.chromatic',
    tunings: [
      { id: 'chromatic', labelKey: 'tunings.chromatic', strings: null },
    ],
  },
]
