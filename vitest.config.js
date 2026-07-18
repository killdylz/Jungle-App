import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Node environment + a hand-rolled localStorage shim (see vitest.setup.js).
    // The store layer is a localStorage seam, so the API has to exist; a full DOM
    // would be a heavy dependency for one object.
    setupFiles: ['./vitest.setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
  },
})
