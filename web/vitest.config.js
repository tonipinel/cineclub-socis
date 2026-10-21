import { getViteConfig } from 'astro/config';

// getViteConfig permet que els tests carreguin components .astro (AstroContainer).
export default getViteConfig({
  test: { include: ['tests/**/*.test.js'] },
});
