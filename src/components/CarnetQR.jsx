import CarnetCard from './CarnetCard';

export default function CarnetQR({ soci }) {
  return (
    <div className="carnet-wrapper">
      <button type="button" className="btn carnet-wrapper__accio" onClick={() => window.print()}>
        Imprimir o desar com a PDF
      </button>
      <CarnetCard soci={soci} />
    </div>
  );
}
