import { feedTaxonomia, respostaFeed } from '../../lib/feeds.js';

export const GET = async () => respostaFeed(await feedTaxonomia('generes'));
