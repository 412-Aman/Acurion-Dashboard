import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        alerts: resolve(__dirname, 'alerts.html'),
        transactions: resolve(__dirname, 'transactions.html'),
        graph: resolve(__dirname, 'graph.html'),
        reports: resolve(__dirname, 'reports.html'),
        login: resolve(__dirname, 'login.html'),
      },
    },
  },
});
