// FIFO tồn kho thực phẩm: nhập (FoodPurchase) là lô vào kho kèm giá; xuất (FoodIssue)
// tiêu hao lô CŨ trước. Tính khi đọc — không lưu phân bổ lô.

export type PurchaseRow = { id: string; date: Date; name: string; unit: string; quantity: number; unitPrice: number; createdAt: Date };
export type IssueRow = { id: string; date: Date; name: string; unit: string; quantity: number; createdAt: Date };

const EPS = 1e-6;
const keyOf = (name: string, unit: string) => `${name.trim().toLowerCase()}__${unit.trim().toLowerCase()}`;

export type InventoryItem = { name: string; unit: string; quantity: number; value: number };

export function computeFifo(purchases: PurchaseRow[], issues: IssueRow[]) {
  type Batch = { remaining: number; unitPrice: number; date: Date; createdAt: Date };
  type Group = { name: string; unit: string; batches: Batch[]; issues: IssueRow[] };
  const groups = new Map<string, Group>();

  const ensure = (name: string, unit: string): Group => {
    const k = keyOf(name, unit);
    let g = groups.get(k);
    if (!g) { g = { name, unit, batches: [], issues: [] }; groups.set(k, g); }
    return g;
  };
  for (const p of purchases) ensure(p.name, p.unit).batches.push({ remaining: p.quantity, unitPrice: p.unitPrice, date: p.date, createdAt: p.createdAt });
  for (const i of issues) ensure(i.name, i.unit).issues.push(i);

  const issueCost = new Map<string, number>();   // issueId → giá vốn FIFO
  const shortage = new Map<string, number>();     // issueId → lượng thiếu (vượt tồn)

  for (const g of groups.values()) {
    g.batches.sort((a, b) => a.date.getTime() - b.date.getTime() || a.createdAt.getTime() - b.createdAt.getTime());
    g.issues.sort((a, b) => a.date.getTime() - b.date.getTime() || a.createdAt.getTime() - b.createdAt.getTime());
    let bi = 0;
    for (const iss of g.issues) {
      let need = iss.quantity;
      let cost = 0;
      while (need > EPS && bi < g.batches.length) {
        const b = g.batches[bi];
        if (b.remaining <= EPS) { bi++; continue; }
        const take = Math.min(need, b.remaining);
        cost += take * b.unitPrice;
        b.remaining -= take;
        need -= take;
        if (b.remaining <= EPS) bi++;
      }
      issueCost.set(iss.id, Math.round(cost));
      if (need > EPS) shortage.set(iss.id, need);
    }
  }

  const inventory: InventoryItem[] = Array.from(groups.values())
    .map((g) => ({
      name: g.name,
      unit: g.unit,
      quantity: g.batches.reduce((s, b) => s + b.remaining, 0),
      value: Math.round(g.batches.reduce((s, b) => s + b.remaining * b.unitPrice, 0)),
    }))
    .filter((r) => r.quantity > EPS)
    .sort((a, b) => a.name.localeCompare(b.name));

  return { issueCost, shortage, inventory };
}

// Tồn hiện có của 1 món (đã trừ mọi phiếu xuất) — dùng để chặn xuất vượt tồn.
export function availableQty(purchases: PurchaseRow[], issues: IssueRow[], name: string, unit: string): number {
  const { inventory } = computeFifo(purchases, issues);
  const k = keyOf(name, unit);
  const found = inventory.find((r) => keyOf(r.name, r.unit) === k);
  return found ? found.quantity : 0;
}
