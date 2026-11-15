import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync } from 'fs';

// `vite preview` serves the same security headers as production (vercel.json).
const securityHeaders = Object.fromEntries(JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')).headers[0].headers.filter(h => h.key !== 'Strict-Transport-Security').map(h => [h.key, h.key === 'Content-Security-Policy' ? h.value.replace('; upgrade-insecure-requests', '') : h.value]));

export default defineConfig({
  plugins: [{
    name: 'acurion-render-ready-navigation',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        // Vite rebuilds entry script tags. Keep the first paint behind entry
        // evaluation so navigation reveals the application, not a blank root.
        return html.replace(/<script\b(?=[^>]*type="module")([^>]*)>/g, (tag, attributes) =>
          attributes.includes('blocking=') ? tag : `<script${attributes} blocking="render">`);
      },
    },
  }],
  preview: { headers: securityHeaders },
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        alerts: resolve(__dirname, 'alerts.html'),
        transactions: resolve(__dirname, 'transactions.html'),
        graph: resolve(__dirname, 'graph.html'),
        reports: resolve(__dirname, 'reports.html'),
        login: resolve(__dirname, 'login.html'),
        compliance: resolve(__dirname, 'compliance.html'),
        system: resolve(__dirname, 'system.html'),
        signup: resolve(__dirname, 'signup.html'),
        forgotPassword: resolve(__dirname, 'forgot-password.html'),
        verifyEmail: resolve(__dirname, 'verify-email.html'),
        authAction: resolve(__dirname, 'auth-action.html'),
      },
    },
  },
});
