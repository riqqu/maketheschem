import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { minecraftSaves } from './scripts/minecraftSaves';

export default defineConfig({
  plugins: [react(), minecraftSaves()],
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
