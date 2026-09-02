import { useContext } from 'react';
import { IdentitatPublicaContext } from './IdentitatPublicaProvider';

export function useIdentitatPublica() {
  const ctx = useContext(IdentitatPublicaContext);
  if (!ctx) throw new Error('useIdentitatPublica must be used inside IdentitatPublicaProvider');
  return ctx;
}
