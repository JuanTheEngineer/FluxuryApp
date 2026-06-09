// Legacy compatibility shim — repo-stabilization Phase 1 boot fix (task 1.5b).
//
// This file existed historically as the OpenAPI-generated client construction
// site. The OpenAPI clients were stubs that threw at runtime; Phase 1 task 1.5
// reduced the open-api index files to type-only re-exports. Until Phase 3
// migrates the views off `@/api/api-clients`, we keep this file in the import
// graph by forwarding to the canonical real-mode wrappers in
// `@/services/api/real`. Task 4.2 deletes this file entirely.

export { sessionsApi, beatsApi } from '@/services/api/real'
