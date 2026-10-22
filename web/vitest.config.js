import { getViteConfig } from 'astro/config';

// getViteConfig permet que els tests carreguin components .astro (AstroContainer).
// Els *.test.js corren en Node; els *.test.jsx (illes de React) demanen jsdom amb
// `// @vitest-environment jsdom` a la primera línia (vitest 5 ja no té environmentMatchGlobs).
export default getViteConfig({
  test: {
    include: ['tests/**/*.test.{js,jsx}'],
    setupFiles: ['./tests/setup-jsdom.js'],
  },
});
