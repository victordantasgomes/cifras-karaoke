import { Fragment } from 'react'

/**
 * Renderiza uma janela de passos (ver utils/steps.js::buildStepWindow) como
 * divs `.k-line` — usado tanto pelo palco cheio (KaraokePlayer) quanto pelo
 * preview de sincronização do editor (SyncWorkspace), garantindo que os dois
 * mostrem passos agrupados (par acorde+letra, bloco de solo/riff/tab)
 * exatamente da mesma forma.
 *
 * A varredura CDG (classe `sweep`) não depende mais de um ref por linha —
 * `useAudioSync` escreve `--sweep-pct` uma vez no contêiner ancestral
 * (`sweepRootRef`, ver KaraokePlayer.jsx/SyncWorkspace.jsx), herdado por
 * qualquer linha marcada `.sweep` aqui. Isso é o que permite um passo
 * `block` acender N linhas simultaneamente sem custo extra.
 *
 * - Passo `pair`: duas divs (acorde acima, letra abaixo) — só a letra
 *   recebe `sweep` quando o passo está ativo (a varredura é sobre texto
 *   cantado; o acorde só fica em âmbar sólido via `active`).
 * - Passo `block` (solo/riff/tab): todas as linhas do bloco recebem
 *   `active`+`sweep` juntas quando o passo está ativo — são tocadas ao
 *   mesmo tempo, não em sequência.
 * - Passo `single`: uma div; só recebe `sweep` se `tipo==='letra'` — um
 *   rótulo de seção ou observação visível fica em destaque sólido (active)
 *   quando é a vez dele, mas não finge progresso de canto.
 *
 * Todas as linhas de um mesmo passo compartilham a classe `pos-N` (mesmo
 * desvanecimento por distância do passo ativo).
 */
export default function KaraokeLines({ window, sweep, keyPrefix }) {
  return window.map((step, stepIdx) => {
    const isActive = stepIdx === 0
    const posClass = `pos-${stepIdx}`

    if (step.kind === 'pair') {
      return (
        <Fragment key={`${keyPrefix}-${stepIdx}`}>
          <div className={`k-line ${posClass}${isActive ? ' active' : ''} acorde`}>
            {step.chord.text || ' '}
          </div>
          <div className={`k-line ${posClass}${isActive ? ' active' : ''}${isActive && sweep ? ' sweep' : ''}`}>
            {step.lyric.text || ' '}
          </div>
        </Fragment>
      )
    }

    if (step.kind === 'block') {
      return (
        <Fragment key={`${keyPrefix}-${stepIdx}`}>
          {step.lines.map((line, i) => (
            <div key={i}
              className={`k-line ${posClass}${isActive ? ' active' : ''}${isActive && sweep ? ' sweep' : ''} ${line.tipo}`}>
              {line.text || ' '}
            </div>
          ))}
        </Fragment>
      )
    }

    const { line } = step
    // a varredura (sweep) representa texto sendo CANTADO — um rótulo de
    // seção ou uma observação visível não é letra, então só fica em
    // destaque sólido (active), sem fingir progresso de canto.
    const canSweep = sweep && line.tipo === 'letra'
    return (
      <div key={`${keyPrefix}-${stepIdx}`}
        className={`k-line ${posClass}${isActive ? ' active' : ''}${isActive && canSweep ? ' sweep' : ''}${line.tipo !== 'letra' ? ' ' + line.tipo : ''}`}>
        {line.text || ' '}
      </div>
    )
  })
}
