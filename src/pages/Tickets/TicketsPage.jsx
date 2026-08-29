import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { codisDeLot } from '../../lib/escaneig';

export default function TicketsPage() {
  const [lot, setLot] = useState('lot1');
  const [tiquets, setTiquets] = useState([]);

  useEffect(() => {
    let activa = true;
    Promise.all(
      codisDeLot(lot).map((codi) =>
        QRCode.toDataURL(codi, { width: 150, margin: 0 }).then((url) => ({ codi, url }))
      )
    ).then((resultats) => {
      if (activa) setTiquets(resultats);
    });
    return () => { activa = false; };
  }, [lot]);

  return (
    <div className="tickets-pagina">
      <div className="tickets-pagina__capcalera">
        <h1 className="tickets-pagina__titol">Tiquets genèrics</h1>
        <select className="form__input" value={lot} onChange={(e) => setLot(e.target.value)}>
          <option value="lot1">Lot 1</option>
          <option value="lot2">Lot 2</option>
        </select>
        <button type="button" className="btn" onClick={() => window.print()}>
          Imprimir
        </button>
      </div>
      <div className="tickets-graella">
        {tiquets.map(({ codi, url }) => (
          <div className="tickets-graella__tiquet" key={codi}>
            <img className="tickets-graella__qr" src={url} alt={`Codi QR ${codi}`} />
            <p className="tickets-graella__codi">{codi}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
