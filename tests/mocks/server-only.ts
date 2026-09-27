// Test-only stand-in for the real `server-only` package. The real package
// throws unconditionally when imported outside Next.js's "react-server"
// bundler condition (see node_modules/server-only/index.js), which would
// otherwise make every `import "server-only"` in src/lib/server/** and
// src/lib/notices/** blow up under plain Node/Vitest. Aliased in
// vitest.config.ts.
export {};
