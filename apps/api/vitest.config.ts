import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    // Force serial execution to avoid data races in shared Postgres DB
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      'sim-core': path.resolve(__dirname, '../../services/sim-core/dist/index.js'),
      'llm-proxy': path.resolve(__dirname, '../../services/llm-proxy/dist/index.js'),
      'etl-azgaar': path.resolve(__dirname, '../../services/etl-azgaar/dist/index.js'),
    },
  },
})
