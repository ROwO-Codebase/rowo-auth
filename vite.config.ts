import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {execSync} from 'child_process';
import path from 'path';
import {defineConfig} from 'vite';
import pkg from './package.json' with { type: 'json' };

export default defineConfig(() => {
  let gitCommitHash = 'unknown';
  try {
    gitCommitHash = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'html-transform',
        transformIndexHtml(html) {
          return html.replace(/%ICON_URL%/g, pkg.config.icon_url);
        },
      },
    ],
    define: {
      '__API_ENDPOINT__': JSON.stringify(pkg.config.api_endpoint),
      '__ICON_URL__': JSON.stringify(pkg.config.icon_url),
      '__GIT_COMMIT_HASH__': JSON.stringify(gitCommitHash),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
