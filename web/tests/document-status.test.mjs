import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const vite = await createServer({
  configFile: 'vite.config.ts',
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
})
const { getDocumentLifecycle } = await vite.ssrLoadModule('/src/documentStatus.ts')

after(async () => vite.close())

test('keeps active and pending documents out of failure states', () => {
  assert.equal(getDocumentLifecycle('processing', 'pending'), 'processing')
  assert.equal(getDocumentLifecycle('processing', 'failed'), 'processing')
  assert.equal(getDocumentLifecycle('completed', 'pending'), 'processing')
})

test('distinguishes searchable documents from extraction and indexing failures', () => {
  assert.equal(getDocumentLifecycle('completed', 'ready'), 'searchable')
  assert.equal(getDocumentLifecycle('failed', 'pending'), 'extract_failed')
  assert.equal(getDocumentLifecycle('completed', 'failed'), 'index_failed')
})
