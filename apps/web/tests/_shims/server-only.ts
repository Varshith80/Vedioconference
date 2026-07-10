// Vitest shim for the `server-only` package. Next.js ships a
// real implementation that throws if a server-only module is
// imported from client code. The shim is a no-op so unit
// tests can import server-only modules freely.
export {};
