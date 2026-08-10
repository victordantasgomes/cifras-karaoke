import { useTranslation } from 'react-i18next'

// true = tem o recurso, false = não tem, 'partial' = parcial (usado só
// pra planilha/PDF avulso, que tecnicamente "compartilha" por e-mail).
const ROWS = [
  { key: 'row1', product: true, spreadsheet: false, generic: 'partial' },
  { key: 'row2', product: true, spreadsheet: false, generic: false },
  { key: 'row3', product: true, spreadsheet: 'partial', generic: 'partial' },
  { key: 'row4', product: true, spreadsheet: false, generic: 'partial' },
  { key: 'row5', product: true, spreadsheet: false, generic: 'partial' },
  { key: 'row6', product: true, spreadsheet: false, generic: false },
]

function Mark({ value }) {
  if (value === true) return <span className="landing-check">✓</span>
  if (value === 'partial') return <span className="landing-cross">~</span>
  return <span className="landing-cross">—</span>
}

/** Tabela comparativa: produto vs. planilha/PDF avulso vs. app de cifras
 * genérico. Os dados de cada linha ficam em ROWS acima (traduzidos por
 * chave em landing.json::comparison). */
export default function Comparison() {
  const { t } = useTranslation('landing')

  return (
    <section id="comparativo">
      <div className="landing-container">
        <div className="landing-section-head">
          <h2 className="landing-section-title">{t('comparison.title')}</h2>
          <p className="landing-section-sub">{t('comparison.subtitle')}</p>
        </div>
        <div className="landing-comparison-scroll">
          <table className="landing-comparison-table">
            <thead>
              <tr>
                <th>{t('comparison.colFeature')}</th>
                <th className="product">{t('comparison.colProduct')}</th>
                <th>{t('comparison.colSpreadsheet')}</th>
                <th>{t('comparison.colGeneric')}</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.key}>
                  <td>{t(`comparison.${row.key}`)}</td>
                  <td className="product"><Mark value={row.product} /></td>
                  <td><Mark value={row.spreadsheet} /></td>
                  <td><Mark value={row.generic} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
