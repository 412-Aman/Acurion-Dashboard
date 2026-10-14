import { defineConfig } from 'vite';
import { resolve } from 'path';

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
