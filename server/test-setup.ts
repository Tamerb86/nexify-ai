// Global test setup — makes the suite hermetic and deterministic.
// Tests must never reach a real database or external service: force DATABASE_URL
// empty so `getDb()` resolves to null immediately instead of attempting (and
// hanging on) a real connection. Credential-gated integration tests use
// `it.skipIf(...)` and supply their own env.
process.env.DATABASE_URL = "";
