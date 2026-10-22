export default function CartellPelicula({ proposta, className }) {
  return proposta.imatgeUrl ? (
    <img className={className} src={proposta.imatgeUrl} alt={proposta.titol} />
  ) : (
    <div className={`${className} proposta-carta__cartell-placeholder`}>{proposta.titol}</div>
  );
}
