// Usage: npx tsx scripts/legalSeed.ts   (rewrites legal/LG_02_DOCS_SEED.sql from lib/legalDocs.ts)
import { writeFileSync } from "fs";
import { join } from "path";
import { legalSeedSql } from "../lib/legalSeed";
const file = join(__dirname, "..", "legal", "LG_02_DOCS_SEED.sql");
writeFileSync(file, legalSeedSql());
console.log("written", file);
