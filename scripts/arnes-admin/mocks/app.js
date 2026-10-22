// firebase/app simulat: no es connecta enlloc.
export const initializeApp = (config) => ({ nom: 'arnes-admin', options: config ?? {} });
export const getApp = () => initializeApp();
