import { feedTerme, respostaFeed } from '../../../lib/feeds.js';

// /directors/<terme>/index.xml: 404 si el terme no té cap sessió publicada.
export const GET = async ({ params }) => respostaFeed(await feedTerme('directors', params.terme));
