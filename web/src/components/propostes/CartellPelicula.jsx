export default function CartellPelicula({ proposta, className, loading }) {
  return proposta.imatgeUrl ? (
    <img className={className} src={proposta.imatgeUrl} alt={proposta.titol} loading={loading} />
  ) : (
    <div className={`${className} proposta-carta__cartell-placeholder`}>{proposta.titol}</div>
  );
}
