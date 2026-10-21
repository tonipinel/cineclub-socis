// Quan el títol no és en castellà ni en català, es mostra a sota, entre
// parèntesis, el títol amb què es va estrenar a Espanya.
export default function TitolLocal({ proposta, className }) {
  if (!proposta.titolLocal || proposta.titolLocal === proposta.titol) return null;
  return <span className={className}>({proposta.titolLocal})</span>;
}
