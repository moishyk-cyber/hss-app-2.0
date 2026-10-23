import { DOCUMENT_KINDS, labelFor } from "./constants";

/** Other uses the existing note field as its custom type name; standard types keep their notes. */
export function documentKindLabel(document: { kind: string; note?: string | null }): string {
  return document.kind === "other" && document.note?.trim()
    ? document.note.trim()
    : labelFor(DOCUMENT_KINDS, document.kind);
}
