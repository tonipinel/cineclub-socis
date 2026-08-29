import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { carnetPayload } from '../lib/carnet';

function formatDataISO(iso) {
  if (!iso) return '—';
  const [any, mes, dia] = iso.split('-').map(Number);
  return new Date(any, mes - 1, dia).toLocaleDateString('ca-ES');
}

export default function CarnetQR({ soci }) {
  const [dataUrl, setDataUrl] = useState(null);

  useEffect(() => {
    let activa = true;
    QRCode.toDataURL(carnetPayload(soci), { width: 400, margin: 0 }).then((url) => {
      if (activa) setDataUrl(url);
    });
    return () => { activa = false; };
  }, [soci.id]);

  if (!dataUrl) return <p>Generant carnet…</p>;

  return (
    <div className="carnet-wrapper">
      <button type="button" className="btn carnet-wrapper__accio" onClick={() => window.print()}>
        Imprimir o desar com a PDF
      </button>
      <div className="carnet">
        <div className="carnet__info">
          <img className="carnet__logo" src="/logo-cineclub.png" alt="Cineclub Roda de Berà" />
          <p className="carnet__etiqueta">Carnet de soci/a</p>
          <p className="carnet__nom">{soci.nom} {soci.cognoms}</p>
          <p className="carnet__detall">Núm. {soci.numeroSoci || '—'}</p>
          <p className="carnet__detall">Soci des de {formatDataISO(soci.dataAlta)}</p>
        </div>
        <img className="carnet__qr" src={dataUrl} alt={`Codi QR del carnet de ${soci.nom} ${soci.cognoms}`} />
      </div>
    </div>
  );
}
