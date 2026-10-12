# HSS Kitchens

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

HSS's sales, purchasing, billing, design, and administration teams work from the same order records. Billing needs a central workspace for deposits and invoices.

## Product Purpose

Coordinate intake, sales, pricing, orders, billing, purchasing, delivery, and customer service. Billing tracks pending deposits before invoices are issued, then advances records through invoiced and paid.

## Capabilities and Constraints

Next.js, React, Prisma, and PostgreSQL. Billing records belong to orders and retain links to QuickBooks. The app tracks billing records; invoice issuance occurs in QuickBooks. Due dates and received-payment dates have separate meanings. Existing order workflows, permission checks, and payment confirmation controls remain authoritative.

## Evidence on Hand

Existing application routes and `docs/DATA_MODEL.md`, `docs/UI_PATTERNS.md`, and `docs/DESIGN_V2.md`. Pending-deposit tracking was confirmed by the user on October 8, 2026.
