// SHA-256 of a legal document's canonical text (Node only: the seed script and tests use it; screens never need it, the database stores the hash).
import { createHash } from "crypto";
import { canonicalText, type LegalDoc } from "./legalDocs";
export const docHash = (doc: LegalDoc) => createHash("sha256").update(canonicalText(doc), "utf8").digest("hex");
