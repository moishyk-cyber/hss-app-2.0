# HSS interface patterns

Keep the current paper, charcoal, Archivo/Inter identity and semantic status colors. This is an operational app: record content varies, but navigation and controls should remain predictable.

- Use `PageHeader` for collection pages. Put creation actions on the right; view selection belongs in the toolbar. Nested Admin sections use heading level 2.
- Pass `ListControls` as the `PageHeader` toolbar for a single compact heading/action row for search, additive filters, grouping where supported, result count, and removable filter chips. Declare available fields with `ListField` and parse them with `parseListQuery`. Domain fields may differ; behavior and layout should not. Put sorting in table headers with `SortHeader`; kanban ordering uses drag and drop within a lane.
- Preserve other query parameters with `QueryLink` when switching views or selecting summary filters. Reset aliases for the same field, rather than keeping conflicting status/type filters. Clear all removes filters and retains sorting. Filter changes reset pagination.
- Record links and creation/edit actions open canonical content in a right-side sliding panel during in-app navigation. Close, Escape, and browser Back return to the retained collection. View details opens the full canonical page; direct links and refresh render full pages. This applies to: businesses, contacts, deals, orders, tasks, issues, purchase orders, and deliveries. Use `DetailHeader` for return navigation, title, context, status, and contextual actions. Related-record links target details, rather than edit forms or an unfiltered queue.
- `NavigationContext` and `BackLink` preserve the originating URL and scroll position within the current tab. Direct navigation has a safe module fallback. Cancel uses the same return behavior with the standard secondary button appearance.
- Use `FormFooter` with Cancel first and the primary submit action last. Intake retains its persistent outcome summary alongside those actions. Mobile form footers remain visible while scrolling.
- Modals are for confirmations and short actions or contextual inspections. Use `useDialogAccessibility` for initial focus, Tab containment, Escape, scroll lock, and return focus. Busy confirmations cannot dismiss while an action runs.
- Keep Order's current workflow, status, owner, and next action prominent. Disclose fulfillment summaries and secondary order metadata instead of placing every field before the working tabs.
- Required issue capture comes first; business/order/item linking is optional and progressively disclosed. Explain default assignment and retain dependent picker behavior.
- Quick task entry remains an optional accelerator, with a visible submit button and Enter hint. Full creation is available in the page header. My tasks uses the signed-in server identity and URL state.
- Use the shared loading compositions for the new collection/detail routes. Empty filtered views explain how to recover; failure states retain input and display the server's actionable message.
- At phone widths, the navigation collapses into Menu. Tables may scroll within their own containers; kanban boards scroll horizontally, with vertical scrolling owned by each lane; the whole page must not overflow.

- Collection views use Spreadsheet and Kanban only where appropriate. Tasks, service, and directories use spreadsheets; pipeline, orders, and RFQ also offer kanban. Avoid summary stat strips on collection pages.
- Use `table-scroll`, sticky headers/identifiers, and `TableRows` for collection tables. Render 30 rows per page; changing filters or sorting returns to page one. Use bounded query windows and `MoreRecords` for large collections.
- Use `kanban-board`, `kanban-lane`, and `LaneItems` for boards. Each lane scrolls independently and initially renders 20 cards. Lane ordering is saved in this browser; stage transitions still run domain actions. Order stages are derived from fulfillment and only allow ordering within a lane.
- `CollectionGroup` provides shared collapse/expand behavior. RFQ supports grouping by stage, assignee, or stock status; deliveries supports workflow sections or mode; both offer an ungrouped table.
- RFQ prices commit on blur or Enter, retain validation errors, and cancel unsaved input on Escape. Blank input keeps the existing price; there is no Clear price control. Audit history stays on record/audit pages rather than in price cells.
- Closed deals are available through the Pipeline toolbar, rather than appended below the board. Overdue deliveries use a textual badge without a thick accent border.

- Each filter is independently editable/removable. Use nested All of / Any of groups for AND/OR conditions; validate and compile the same bounded filter tree on the server before pagination.

- The sidebar navigation scrolls within the viewport; the account area stays anchored below it. Horizontal gestures inside a kanban lane move its containing board.
