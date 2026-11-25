import type { Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * After a production build, fill dist/sw.js's precache list with every file
 * the build produced, and version the cache by a hash of their contents, so the
 * app shell works offline and updates cleanly. No third-party service worker
 * tooling is needed.
 */
export function swManifest(): Plugin {
  let outDir = 'dist';
  return {
    name: 'estate-sw-manifest',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir.startsWith('/') ? c.build.outDir : join(c.root, c.build.outDir);
    },
    writeBundle() {
      const files: string[] = [];
      const walk = (d: string) => {
        for (const n of readdirSync(d)) {
          const f = join(d, n);
          if (statSync(f).isDirectory()) walk(f);
          else files.push(f);
        }
      };
      walk(outDir);
      const swPath = join(outDir, 'sw.js');
      const rel = files.filter((f) => f !== swPath && !f.endsWith('.map')).map((f) => './' + relative(outDir, f).split('\\').join('/'));
      const hash = createHash('sha1');
      for (const f of files) if (f !== swPath) hash.update(f).update(readFileSync(f));
      const list = ['./', ...rel];
      const src = readFileSync(swPath, 'utf8').replace('self.__PRECACHE__', JSON.stringify(list)).replace('__VERSION__', hash.digest('hex').slice(0, 10));
      writeFileSync(swPath, src);
    },
  };
}
