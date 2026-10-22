import { ItemNotes } from "./ItemDetails";
export function TeamNotes({ notes, intakeNotes }: { notes: string | null; intakeNotes?: string | null }) {
  const original = intakeNotes?.trim();
  const current = notes?.trim();
  return <section className="card team-notes" aria-label="Notes for the team">
    <h2 className="section-label">Notes for the team</h2>
    {current || original ? <ItemNotes item={{ notes: current || original }} /> : <p className="text-sm text-gray-dark">No notes for the team yet.</p>}
    {original && current && original !== current && <div className="mt-4"><h3 className="text-xs font-medium text-gray-dark">Original intake notes</h3><div className="mt-2"><ItemNotes item={{ notes: original }} /></div></div>}
  </section>;
}
