import { resizedUrl } from '../../lib/images.js';

export default function CartellPelicula({ proposta, className, loading, ample = 400 }) {
  return proposta.imatgeUrl ? (
    <img className={className} src={resizedUrl(proposta.imatgeUrl, ample)} alt={proposta.titol} loading={loading} />
  ) : (
    <div className={`${className} proposta-carta__cartell-placeholder`}>{proposta.titol}</div>
  );
}
