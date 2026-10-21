import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'middleware' }),
  // Hugo emet totes les URLs amb barra final.
  trailingSlash: 'always',
});
