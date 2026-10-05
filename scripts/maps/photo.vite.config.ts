import base from '../../vite.config';

// A stable development snapshot for captures: workspace edits cannot reload it.
export default {
  ...base,
  cacheDir: 'node_modules/.vite-photo',
  server: {
    ...base.server,
    host: '127.0.0.1', port: 5174, strictPort: true,
    hmr: false, watch: null,
    headers: { 'X-Arena-Photo': '1' },
  },
};
