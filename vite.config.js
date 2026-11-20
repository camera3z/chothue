import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export default defineConfig({
  plugins: [{
    name: 'rentbook-pwa-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      // Every code/CSS release changes the worker, enabling an explicit update.
      const hash = createHash('sha256');
      for (const [name, file] of Object.entries(bundle).sort(([a], [b]) => a.localeCompare(b))) {
        hash.update(name); hash.update(file.type === 'chunk' ? file.code : file.source);
      }
      const worker = readFileSync(new URL('./src/pwa-worker.js', import.meta.url), 'utf8');
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: worker.replace('__RENTBOOK_RELEASE__', hash.digest('hex').slice(0, 20)) });
    },
  }],
});
