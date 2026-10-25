// firebase/storage simulat: cap fitxer es puja ni es baixa.
export const getStorage = () => ({ app: { options: { storageBucket: 'arnes' } } });
export const ref = (_storage, path) => ({ fullPath: path });
export const uploadBytes = async (r) => ({ ref: r });
export const getDownloadURL = async () => '/logo-cineclub.webp';
export const deleteObject = async () => {};
