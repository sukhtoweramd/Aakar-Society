// Society address (multi-tenant): /<society word> shows the same app; the login page reads the word from the address (lib/societyWord.ts).
// Real pages (api, ledger, ...) are folders of their own and win over this one.
export { default } from "../page";
