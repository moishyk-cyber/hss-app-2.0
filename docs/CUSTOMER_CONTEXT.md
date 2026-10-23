# Customer context across the workflow

The compact Customer card is outside the selected workflow section, so it remains available through Intake, Supplier Quotes, Client Quote, Confirm Deal, Payment, Purchase, Delivery, and Close Out. A click expands the details. Focused requirement panels, standalone PO pages, PO acknowledgement, stock-delivery creation, and delivery editing use the same component.

The summary shows the customer, contact, and primary phone. Expanded details include contact/mobile/business phone and email, pickup addresses, the saved delivery destination and location, on-site contact, delivery type, installation and floor/access notes, and billing/account addresses. Phone and email are clickable. Missing values are explicitly marked as missing.

Contact details come from the record's contact, with saved business contact details as fallback. The delivery destination comes from the saved order/intake or selected site; the business's account address is shown separately and never substituted for an unconfirmed destination. General record cards list saved delivery pickups and supplier pickup addresses. PO/acknowledgement/delivery cards show the specific pickup for that operation. Changing a pickup in acknowledgement or delivery editing immediately updates that card.

The card uses data loaded with the record and React context for nested forms; expanding it does not fetch data, open a tab, or submit a form. No schema or permission changes are needed.

The expanded card includes a “Keep visible while scrolling” On/Off switch. It defaults to On and remembers the choice in this browser across records, workflow steps, drawers, and tabs. Turning it off restores normal scrolling. This is a personal browser preference, not a customer or account setting.

Verification: customer-data unit tests cover contact priority, mobile/account fallbacks, pickup deduplication, intake destinations, and the distinction between account and delivery addresses. Browser QA used synthetic contact/address information on `[LOAD TEST] Customer PO optional upload`; a test PO was sent, acknowledged, and its delivery created with a changed pickup while preserving the intake destination.
