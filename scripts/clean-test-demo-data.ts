// One-time data cleanup (Moishy, Sep 2): purges the test/demo/duplicate
// records identified in a full read-only audit of production data —
// (1) "test"/"TEST"/"Klyne Test" companies, contacts, and orders left over
//     from the Aug 19 monday.com migration, plus its fake "HSS Kitchens"
//     team-member row (deactivated, not deleted -- it has real historical
//     assignments) and its two monday-starter-template sample contacts
//     that had no real linkage,
// (2) a separate, earlier synthetic demo seed batch (18 fake companies +
//     their contacts/opportunities/orders/line items/POs/payments/tasks,
//     all marked "[demo]" in notes) -- except the handful of records real
//     work has since been built on top of (Mendel's Catering, Lakewood
//     Kosher Provisions, Sabra Grill, Bais Medrash Govoha Dining, and
//     suppliers Hudson Valley Equipment Supply / Empire Refrigeration
//     Distributors), which are kept with the "[demo]" markers stripped,
// (3) three duplicate-company groups (YH Management x3, mechys the shope
//     x2, Hechal Shemuel x2), merged onto the copy with real history,
// (4) two ad-hoc scratch supplier companies ("kl", "New One"),
// (5) the Aug 17 week's IntakeSubmission rows (raw monday.com form
//     answers that landed in one week purely because that's when the
//     migration ran, not organic new leads).
//
// One contact ("Robert Thompson", robert@amazon.com -- a monday-starter-
// template sample) was found to be the primary contact on a real,
// currently-open Bakers Best opportunity/order and was deliberately left
// alone rather than deleted.
//
// Idempotent -- every step matches by explicit ID or by the literal
// "[demo]"/"test" content pattern, so re-running this after the records
// are already gone is a no-op.
// Run: npx tsx --tsconfig tsconfig.json scripts/clean-test-demo-data.ts

import { prisma } from "@/lib/prisma";

const TEST_COMPANY_IDS = [
  "cmt066deq0006v4wggy3wto7q", "cmt066djq0007v4wgfd6x1fxw", "cmt066dou0008v4wgsmjtjcc2",
  "cmt066dtq0009v4wg6ifgq61m", "cmt066dyg000av4wgvujaj9fq", "cmt066exq000hv4wgdi3bv4yr",
  "cmt066f2q000iv4wgu3300een", "cmt066g6a000qv4wgoc82ix97", "cmt066gvf000vv4wgo8zbrt4e",
  "cmt066e3u000bv4wgqkipyo3a", "cmt066fw5000ov4wgb3rc21im",
  "cmt066e8t000cv4wgzvwlt3x4", "cmt066fma000mv4wg9ncard78", "cmt066gg9000sv4wg3bin3ha1",
  "cmt066edq000dv4wgzsk9hg76", "cmt066g1a000pv4wgb5lctbrr",
  "cmt066eit000ev4wgdudhz4wa", "cmt066f7k000jv4wgmjprp9qq", "cmt066gb6000rv4wg59f9bw05",
  "cmt066h09000wv4wgsnvtfx26", "cmt066h5g000xv4wgafobgmm6", "cmt066hf9000zv4wgbxtm4oor",
  "cmt066haj000yv4wgmmpwy7v9", "cmt066hk90010v4wg98hwdq35", "cmt066hoz0011v4wgc4g3qmwj",
  "cmt066enq000fv4wgufw3o6qf", "cmt066et0000gv4wgr7gpss8m",
  "cmt066fhp000lv4wg2w4p09pz", "cmt066glj000tv4wg1031d462",
  "cmt066fcu000kv4wggbw3bkuv", "cmt066gqf000uv4wgjkz02csn",
  "cmt066frf000nv4wgnaybgy6g",
];

const TEST1_OPPORTUNITY_ID = "cmt8s2xwo000cv4zg3q35594y";
const TEST1_ORDER_ID = "cmt8s48kp000jv4zgxibpgqg5";
const TEST1_LINE_ITEM_IDS = ["cmt8s2xwo000dv4zgrulljqhr", "cmt8s2xwo000ev4zghslrw0zl", "cmt8s2xwo000fv4zgt5uy5hqr"];
const TEST1_PAYMENT_ID = "cmt8s48rh000lv4zgf9sdglgu";

const KLYNE_TEST_55_OPPORTUNITY_IDS = ["cmt066lzq0028v4wgv3lkokv0", "cmt066m5a002av4wgpgxfaiga", "cmt066mal002cv4wg78w9z5ir"];
const KLYNE_TEST_55_ORDER_ID = "cmt066qtc0046v4wgh9853wae";

const ORPHAN_ORDER_IDS = ["cmt066q4m003wv4wgbr3cth07", "cmt066q97003yv4wg9r7aba7o"]; // "One" x2, monday import junk

// Monday-starter-template sample contacts with no real linkage found.
// "Robert Thompson" (cmt066kbh...) is deliberately excluded -- see header note.
const JUNK_CONTACT_IDS = [
  "cmt1jh2ge0005v4zgxhubu1aw", // "test"
  "cmt066kqg001rv4wg4eh23veb", // "Jane Demo (sample)"
  "cmt066kgu001nv4wgmcek7nle", // "Steven Scott" / steven@google.com
  "cmt066klq001pv4wg53fvm0ag", // "Sam Jones" / sam@apple.com
];

const DEMO_KITCHEN_CO_TASK_ID = "cmt066rqa004kv4wgoabvk5ti";
const HSS_KITCHENS_FAKE_USER_ID = "cmt066lv00026v4wgt6c99foe";

// Duplicate real companies: keep the survivor, drop the rest (+ their duplicate opp/line item).
const YH_MANAGEMENT_DUP_COMPANY_IDS = ["cmt066i3f0014v4wg286hhd9g", "cmt066i850015v4wgyah8ue5h"];
const YH_MANAGEMENT_DUP_OPPORTUNITY_IDS = ["cmt066l5q001xv4wgbpffiy4z", "cmt066laq001zv4wgexafuetz"];
const YH_MANAGEMENT_DUP_LINE_ITEM_IDS = ["cmt066nko002uv4wgd9vp5kzm", "cmt066npa002wv4wgolen0r12"];

const MECHYS_DUP_COMPANY_ID = "cmt066iml0018v4wgu21kbbqw"; // no linked records; survivor cmt066j6l001cv4wgdgyr5gw6 has the real order+PO

const HECHAL_SHEMUEL_SURVIVOR_ID = "cmt066irl0019v4wgbl9g0njy"; // has the opp+line item, was missing the address
const HECHAL_SHEMUEL_SURVIVOR_ADDRESS = "1719 Avenue P, Brooklyn, NY 11229, USA";
const HECHAL_SHEMUEL_DUP_COMPANY_ID = "cmt066iwl001av4wgwbj82yz3"; // had the address, no linked records

const SCRATCH_SUPPLIER_COMPANY_IDS = ["cmthodkiv0000ld04flhk6gdq", "cmthpdefa0000l7042sm8528e"]; // "kl", "New One"

const INTAKE_SPIKE_WEEK = "2026-08-17"; // migration-batch artifact, not organic new leads

// Batch B: the earlier synthetic "[demo]" seed batch. Real work has since
// been built on top of these opportunities/orders -- keep them, just strip
// the "[demo]" marker instead of deleting.
const KEPT_DEMO_CONTACT_IDS = [
  "cmt9ejipr000jv4r4sb618cmb", // Menachem Weiss, Mendel's Catering
  "cmt9ejipr000ov4r4u7gr0y64", // Avrumi Schwartz, Sabra Grill
  "cmt9ejipr000pv4r4rmsyn429", // Yosef Landau, Lakewood Kosher Provisions
  "cmt9ejipr000qv4r4grc93gy3", // Berel Friedman, Bais Medrash Govoha Dining
  "cmt9ejipr000yv4r4ezm4mw9v", // Pinchas Roth, Mendel's Catering
];
const KEPT_DEMO_OPPORTUNITY_IDS = [
  "cmt9ejize0013v4r4lrn1ulcn", // Mendel's Catering - equipment refresh (real order + PO attached)
  "cmt9ejize0019v4r4lgum9mxu", // Lakewood Kosher Provisions - replacement order (real order + POs attached)
  "cmt9ejizf001nv4r47sody5a3", // Sabra Grill - kitchen buildout (real PO attached)
  "cmt9ejizf001pv4r4sldazr8d", // Bais Medrash Govoha Dining - replacement order (real payment attached)
];
const KEPT_DEMO_ORDER_IDS = [
  "cmt9ejjfe003uv4r4a0uoc252", // Sabra Grill - kitchen buildout (real PO PO-HSS-2026-043-1)
  "cmt9ejjfe003wv4r4ozsa04bm", // Bais Medrash Govoha Dining - replacement order (real $2,500 payment)
];
const KEPT_DEMO_LINE_ITEM_IDS = [
  "cmt9ejj9m001vv4r4tvl2u11b", "cmt9ejj9m001wv4r4bfdbhmiz", // Mendel's real order
  "cmt9ejj9n002dv4r4brggezky", "cmt9ejj9m002av4r4mmof3nva", "cmt9ejj9n002bv4r4lps29l22", "cmt9ejj9n002cv4r4sen74ylh", // Lakewood real order
  "cmt9ejj9o003av4r4uh0pz512", "cmt9ejj9o0039v4r4dzcz9osa", // Sabra Grill real order
  "cmt9ejj9o003gv4r4qzxqm0zs", "cmt9ejj9o003hv4r4qdvfe1pg", "cmt9ejj9o003fv4r42zotimf4", "cmt9ejj9o003ev4r4p0hangy9", // BMG real order
];

const FAKE_DEMO_COMPANY_IDS = [
  "cmt9ejiep0000v4r4fw11e9q6", // Gottlieb's Restaurant
  "cmt9ejiep0002v4r4vo491y9z", // Shloimy's Glatt Market
  "cmt9ejiep0003v4r4ars0oahe", // Congregation Bais Yaakov Kitchen
  "cmt9ejiep0004v4r4abdiky56", // Camp Morris
  "cmt9ejiep0005v4r4ffmf27qw", // The Crown Hotel Kitchen
  "cmt9ejiep0009v4r4vndve01r", // Monsey Glatt Caterers
  "cmt9ejiep000av4r4lbi8q684", // Teaneck Bagel Café
  "cmt9ejiep000bv4r4w6cajdf8", // Yeshiva of Flatbush Cafeteria
  "cmt9ejiep000cv4r4uqu5a77t", // Pomegranate Supermarket
  "cmt9ejiep000dv4r495h23x0b", // Boro Park Simcha Hall
  "cmt9ejiep000ev4r4xb4v9hmy", // Five Towns Fish & Grill
  "cmt9ejiep000fv4r46tv8nydz", // Restaurant Depot Wholesale
];

async function main() {
  await prisma.$transaction(async (tx) => {
    // ---- Batch A: monday.com migration test/demo junk ----
    await tx.payment.deleteMany({ where: { id: TEST1_PAYMENT_ID } });
    await tx.lineItem.deleteMany({ where: { id: { in: TEST1_LINE_ITEM_IDS } } });
    await tx.order.deleteMany({ where: { id: { in: [TEST1_ORDER_ID, KLYNE_TEST_55_ORDER_ID, ...ORPHAN_ORDER_IDS] } } });
    await tx.opportunity.deleteMany({ where: { id: { in: [TEST1_OPPORTUNITY_ID, ...KLYNE_TEST_55_OPPORTUNITY_IDS] } } });
    await tx.contact.deleteMany({ where: { id: { in: JUNK_CONTACT_IDS } } });
    await tx.task.deleteMany({ where: { id: DEMO_KITCHEN_CO_TASK_ID } });
    await tx.company.deleteMany({ where: { id: { in: TEST_COMPANY_IDS } } });

    // HSS Kitchens fake team member: deactivate, don't delete -- it has real historical assignments.
    await tx.user.update({ where: { id: HSS_KITCHENS_FAKE_USER_ID }, data: { active: false } });

    // ---- Duplicate real companies ----
    await tx.lineItem.deleteMany({ where: { id: { in: YH_MANAGEMENT_DUP_LINE_ITEM_IDS } } });
    await tx.opportunity.deleteMany({ where: { id: { in: YH_MANAGEMENT_DUP_OPPORTUNITY_IDS } } });
    await tx.company.deleteMany({ where: { id: { in: YH_MANAGEMENT_DUP_COMPANY_IDS } } });
    await tx.company.deleteMany({ where: { id: MECHYS_DUP_COMPANY_ID } });
    await tx.company.update({
      where: { id: HECHAL_SHEMUEL_SURVIVOR_ID },
      data: { deliveryAddress: HECHAL_SHEMUEL_SURVIVOR_ADDRESS, billingAddress: HECHAL_SHEMUEL_SURVIVOR_ADDRESS },
    });
    await tx.company.deleteMany({ where: { id: HECHAL_SHEMUEL_DUP_COMPANY_ID } });

    // ---- Scratch supplier companies: null their FK on real POs first, then delete ----
    await tx.purchaseOrder.updateMany({
      where: { supplierId: { in: SCRATCH_SUPPLIER_COMPANY_IDS } },
      data: { supplierId: null },
    });
    await tx.company.deleteMany({ where: { id: { in: SCRATCH_SUPPLIER_COMPANY_IDS } } });

    // ---- Dashboard-spike IntakeSubmission batch ----
    const intakeStart = new Date(`${INTAKE_SPIKE_WEEK}T00:00:00Z`);
    const intakeEnd = new Date(intakeStart);
    intakeEnd.setUTCDate(intakeEnd.getUTCDate() + 7);
    await tx.intakeSubmission.deleteMany({ where: { submittedAt: { gte: intakeStart, lt: intakeEnd } } });

    // ---- Batch B: synthetic "[demo]" seed dataset ----
    await tx.payment.deleteMany({ where: { notes: { startsWith: "[demo]" } } });
    await tx.lineItem.deleteMany({ where: { notes: { startsWith: "[demo]" }, id: { notIn: KEPT_DEMO_LINE_ITEM_IDS } } });
    await tx.purchaseOrder.deleteMany({ where: { notes: { startsWith: "[demo]" } } });
    await tx.order.deleteMany({ where: { notes: { startsWith: "[demo]" }, id: { notIn: KEPT_DEMO_ORDER_IDS } } });
    await tx.opportunity.deleteMany({ where: { notes: { startsWith: "[demo]" }, id: { notIn: KEPT_DEMO_OPPORTUNITY_IDS } } });
    await tx.contact.deleteMany({ where: { notes: { startsWith: "[demo]" }, id: { notIn: KEPT_DEMO_CONTACT_IDS } } });
    await tx.task.deleteMany({ where: { notes: { startsWith: "[demo]" } } }); // TaskComment cascades
    await tx.company.deleteMany({ where: { id: { in: FAKE_DEMO_COMPANY_IDS } } });

    // Strip the "[demo]" markers from the kept records now that the relationship is real.
    await tx.contact.updateMany({ where: { id: { in: KEPT_DEMO_CONTACT_IDS } }, data: { notes: null } });
    await tx.opportunity.updateMany({ where: { id: { in: KEPT_DEMO_OPPORTUNITY_IDS } }, data: { notes: null } });
    await tx.order.updateMany({ where: { id: { in: KEPT_DEMO_ORDER_IDS } }, data: { notes: null } });
    await tx.lineItem.updateMany({ where: { id: { in: KEPT_DEMO_LINE_ITEM_IDS } }, data: { notes: null } });
  });

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
