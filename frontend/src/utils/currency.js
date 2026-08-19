/** Centavos (int, como vêm de GET /public/plans) -> string formatada em
 * BRL, seguindo a pontuação do idioma da interface. Extraído de
 * PricingSection.jsx pra ser reaproveitado no modal de convite (AuthGate),
 * que também mostra planos reais. A moeda de cobrança é sempre BRL. */
export function centavosParaMoeda(cents, locale) {
  return (cents / 100).toLocaleString(locale, { style: 'currency', currency: 'BRL' })
}
