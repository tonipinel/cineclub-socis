import { feedProgramacio, respostaFeed } from '../../lib/feeds.js';

export const GET = async () => respostaFeed(await feedProgramacio());
