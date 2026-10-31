// What CLEAR TEST DOCUMENTS removes before GO LIVE (decided 31 Oct 2026). Plain data, shared with the tests.
// Database: sql-security/12_CLEAR_TEST_ALL.sql. Files: these R2 folders (test photos, minutes, posters, contracts,
// payment screenshots). Never: flats/ (flat documents), vault/, floor-plans/, backups/.
export const TEST_FILE_FOLDERS = ["notices/", "events/", "eventdocs/", "minutes/", "complaints/", "amc/", "payproofs/"] as const;
export const KEPT_FILE_FOLDERS = ["flats/", "vault/", "floor-plans/", "backups/"] as const;
