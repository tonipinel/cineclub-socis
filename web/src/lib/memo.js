// Memòria cau en procés de curta durada per a les lectures de Firestore: una ràfega de peticions
// (o `?query` diferents sobre la mateixa pàgina) no multiplica les lectures. Es desa la promesa,
// de manera que les peticions simultànies comparteixen una sola lectura; si falla, no es desa
// res i la següent petició torna a llegir. Cada instància de la funció té la seva memòria.
export const TTL_MS = 60 * 1000;

const memos = new Set();

// Buida totes les memòries (per als tests).
export const reiniciaMemos = () => memos.forEach((memo) => memo.reinicia());

// `clau` identifica la lectura dins de la base (`db`); bases diferents no es barregen mai.
export function creaMemo({ ttl = TTL_MS, ara = Date.now } = {}) {
  let perBase = new WeakMap();
  const memo = {
    obte(db, clau, llegeix) {
      let entrades = perBase.get(db);
      if (!entrades) perBase.set(db, (entrades = new Map()));
      const existent = entrades.get(clau);
      if (existent && existent.expira > ara()) return existent.promesa;
      for (const [k, e] of entrades) if (e.expira <= ara()) entrades.delete(k);
      const promesa = Promise.resolve().then(llegeix);
      const entrada = { promesa, expira: ara() + ttl };
      entrades.set(clau, entrada);
      promesa.catch(() => {
        if (entrades.get(clau) === entrada) entrades.delete(clau);
      });
      return promesa;
    },
    mida(db) {
      return perBase.get(db)?.size ?? 0;
    },
    reinicia() {
      perBase = new WeakMap();
    },
  };
  memos.add(memo);
  return memo;
}
