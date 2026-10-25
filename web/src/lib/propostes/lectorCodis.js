// Lector de codis QR (còpia de src/lib/lectorCodis.js de l'admin: són paquets
// separats). Si el navegador té BarcodeDetector natiu (Chrome Android) es fa
// servir aquest; si no (Safari d'iOS), el polyfill, que llegeix amb el WASM de
// zxing. El WASM s'empaqueta amb el build (Vite el copia amb hash a /_astro/,
// amb memòria cau llarga) i es demana al nostre origen, no a jsDelivr: amb poca
// cobertura o el CDN bloquejat, el lector no arrencaria.
import 'barcode-detector/polyfill';
import {
  BarcodeDetector as BarcodeDetectorPolyfill, prepareZXingModule, purgeZXingModule,
} from 'barcode-detector/ponyfill';
import urlWasm from 'zxing-wasm/reader/zxing_reader.wasm?url';

const overrides = {
  locateFile: (fitxer, prefix) => (fitxer.endsWith('.wasm') ? urlWasm : prefix + fitxer),
};
// Abans de crear cap detector: el constructor del polyfill ja comença a carregar el WASM.
prepareZXingModule({ overrides });

export const TEMPS_LIMIT_LECTOR_MS = 15000;

// Resol quan el lector pot llegir codis; rebutja si el WASM no es pot carregar
// o triga més de TEMPS_LIMIT_LECTOR_MS. Amb el detector natiu resol de seguida.
export function prepararLector() {
  if (globalThis.BarcodeDetector !== BarcodeDetectorPolyfill) return Promise.resolve();
  const carrega = prepareZXingModule({ overrides, fireImmediately: true });
  // zxing-wasm guarda la promesa (també rebutjada o penjada): s'oblida perquè
  // un nou intent torni a baixar el WASM.
  const oblidar = () => {
    purgeZXingModule();
    prepareZXingModule({ overrides });
  };
  carrega.catch(oblidar);
  let temporitzador;
  const limit = new Promise((_, reject) => {
    temporitzador = setTimeout(() => {
      oblidar();
      reject(new Error('Temps límit de càrrega del lector esgotat'));
    }, TEMPS_LIMIT_LECTOR_MS);
  });
  return Promise.race([carrega, limit]).finally(() => clearTimeout(temporitzador));
}
