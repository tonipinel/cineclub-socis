// firebase/storage simulat: cap fitxer es puja ni es baixa.
export const getStorage = () => ({});
export const ref = (_storage, path) => ({ fullPath: path });
export const uploadBytes = async (r) => ({ ref: r });
export const getDownloadURL = async () => '/logo-cineclub.png';
export const deleteObject = async () => {};
