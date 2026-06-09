// Importing this module patches global indexedDB with fake-indexeddb.
// Use in tests that need IndexedDB without a browser environment.
import 'fake-indexeddb/auto'

// For test isolation, each test should use the localDraft service
// which opens its own database instance. The fake-indexeddb auto-polyfill
// handles this transparently.
export {}
