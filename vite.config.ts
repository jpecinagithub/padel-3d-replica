/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Configuración de Vite (build) + Vitest (tests unitarios en entorno node;
// el store acepta un Storage inyectable, así que no hace falta jsdom).
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
  },
});
