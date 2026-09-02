import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { carnetPayload, carnetQR } from '../lib/carnet';

function numeroSociFormatat(numeroSoci) {
  return String(numeroSoci ?? '').padStart(4, '0');
}

export default function CarnetCard({ soci }) {
  const [dataUrl, setDataUrl] = useState(null);

  useEffect(() => {
    if (!soci.tokenCarnet) return;
    let activa = true;
    QRCode.toDataURL(carnetQR(soci), { width: 400, margin: 0 }).then((url) => {
      if (activa) setDataUrl(url);
    });
    return () => { activa = false; };
  }, [soci]);

  if (!soci.tokenCarnet) {
    return <p className="carnet__avis-token">Aquest soci no té cap token de carnet assignat.</p>;
  }

  if (!dataUrl) return <p>Generant carnet…</p>;

  return (
    <div className="carnet">
      <div className="carnet__capcalera">
        <p className="carnet__nom">{soci.nom} {soci.cognoms}</p>
        <p className="carnet__numero">{numeroSociFormatat(soci.numeroSoci)}</p>
      </div>
      <div className="carnet__cos">
        <img className="carnet__logo" src="/logo-cineclub.png" alt="Cineclub Roda de Berà" />
        <div className="carnet__qr-bloc">
          <div className="carnet__qr-marc">
            <img className="carnet__qr" src={dataUrl} alt={`Codi QR del carnet de ${soci.nom} ${soci.cognoms}`} />
          </div>
          <p className="carnet__codi">{carnetPayload(soci)}</p>
        </div>
      </div>
    </div>
  );
}
