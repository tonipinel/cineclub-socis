import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { carnetPayload } from '../lib/carnet';

export default function CarnetQR({ soci }) {
  const [dataUrl, setDataUrl] = useState(null);

  useEffect(() => {
    let activa = true;
    QRCode.toDataURL(carnetPayload(soci), { width: 320, margin: 1 }).then((url) => {
      if (activa) setDataUrl(url);
    });
    return () => { activa = false; };
  }, [soci.id]);

  if (!dataUrl) return <p>Generant carnet…</p>;

  return (
    <div className="carnet-qr">
      <img className="carnet-qr__imatge" src={dataUrl} alt={`Carnet QR de ${soci.nom} ${soci.cognoms}`} />
      <a className="btn" href={dataUrl} download={`carnet-${soci.numeroSoci ?? soci.id}.png`}>
        Descarregar carnet
      </a>
    </div>
  );
}
