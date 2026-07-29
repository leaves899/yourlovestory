/**
 * Main-process re-export of pure diagnostic package construction.
 * Business logic lives in src/shared/diagnostics; this module preserves
 * existing import paths for main/IPC wiring.
 */
export {
  aggregateBackupStats,
  buildDiagnosticPackage,
  mapDiagnosticDatabaseMessage,
  type BuildDiagnosticPackageInput,
  type BuiltDiagnosticPackage,
} from '../../shared/diagnostics/buildDiagnosticPackage'
