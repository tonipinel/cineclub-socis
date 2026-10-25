// Afegeix `where(camp, '==', valor)` a una col·lecció falsa que només té `get()`: filtra els documents.
export const conWhere = (col) => ({
  where: (camp, op, valor) => ({
    get: async () => {
      const resultat = await col.get();
      return { ...resultat, docs: resultat.docs.filter((d) => d.data()[camp] === valor) };
    },
  }),
  ...col,
});
