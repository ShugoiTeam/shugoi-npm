import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'next/index': 'src/next/index.ts',
    obfuscate: 'src/obfuscate.ts',
  },
  format: ['esm', 'cjs'],
  dts: false,
  sourcemap: true,
  clean: true,
  target: 'node20',
  splitting: false,
  external: ['next'],
});
