import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node', env: { BARBAR_DATA_DIR: 'memory://' }, testTimeout: 60_000, hookTimeout: 60_000 },
})
