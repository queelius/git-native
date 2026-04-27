import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'adapters/github/index': 'src/adapters/github/index.ts',
    'adapters/local/index': 'src/adapters/local/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
});
