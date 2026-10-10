import { defineConfig } from 'vite';

// Game art lives in ./assets and is served from the site root (e.g. /soldier/Black_Soldier.png).
export default defineConfig({
  base: './',
  publicDir: 'assets',
  server: { port: 5173 },
  build: { target: 'es2022' }, // main.js uses top-level await
});
