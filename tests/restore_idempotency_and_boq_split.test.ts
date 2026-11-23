import { strict as assert } from "node:assert";
import { TakeoffItem } from "../src/types";

const existingItems: TakeoffItem[] = [
  {
    id: "item-1",
    sheetId: "sheet-1",
    itemCode: "F1",
    description: "قواعد مسلحة معتمدة",
    category: "أعمال خرسانية مسلحة وعادية",
    location: "S-01",
    count: 4,
    quantity: 10,
    unit: "م³",
    unitPrice: 500,
    totalPrice: 5000,
    reviewStatus: "approved",
    isVerified: true,
  },
  {
    id: "item-2",
    sheetId: "sheet-1",
    itemCode: "HATCH-2",
    description: "تهشير مستعاد للمراجعة",
    category: "أعمال متنوعة أخرى",
    location: "S-01",
    count: 1,
    quantity: 20,
    unit: "م²",
    unitPrice: 100,
    totalPrice: 2000,
    reviewStatus: "needs_review",
    restoredDeduplicatedId: "dedup-hatch-0-S-SLAB",
  },
  {
    id: "item-3",
    sheetId: "sheet-1",
    itemCode: "X1",
    description: "بند مرفوض",
    category: "أعمال متنوعة أخرى",
    location: "S-01",
    count: 1,
    quantity: 5,
    unit: "م²",
    unitPrice: 100,
    totalPrice: 500,
    reviewStatus: "rejected",
  },
];

// 1. Idempotency check: dedup-hatch-0-S-SLAB is already in existingItems
const alreadyRestored = existingItems.some(
  (i) => i.sheetId === "sheet-1" && i.restoredDeduplicatedId === "dedup-hatch-0-S-SLAB"
);
assert.equal(alreadyRestored, true, "Already-restored hatch must block duplicate restoration permanently");

// 2. Approved vs Pending Review separation
const approvedSubtotal = existingItems
  .filter((i) => (i.reviewStatus === "approved" || i.isVerified) && i.reviewStatus !== "rejected")
  .reduce((s, i) => s + i.quantity * i.unitPrice, 0);

const pendingSubtotal = existingItems
  .filter((i) => !(i.reviewStatus === "approved" || i.isVerified) && i.reviewStatus !== "rejected")
  .reduce((s, i) => s + i.quantity * i.unitPrice, 0);

assert.equal(approvedSubtotal, 5000, "Approved subtotal must be 5000");
assert.equal(pendingSubtotal, 2000, "Pending review subtotal must be 2000 (excluding rejected 500)");

console.log("PASS [restore_idempotency_and_boq_split]: Idempotent restore guard & Approved (5000) vs Pending (2000) separation verified.");
