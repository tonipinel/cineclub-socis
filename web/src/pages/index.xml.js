import { feedPortada, respostaFeed } from '../lib/feeds.js';

export const GET = async () => respostaFeed(await feedPortada());
