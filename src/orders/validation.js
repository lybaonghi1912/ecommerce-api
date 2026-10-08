export function validateOrder(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (Object.keys(body).length !== 1 || !Object.hasOwn(body, 'items')) return null;
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) return null;
  const ids = new Set();
  const items = [];
  for (const item of body.items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    if (Object.keys(item).length !== 2 || !Object.hasOwn(item, 'pid') || !Object.hasOwn(item, 'qty')) return null;
    if (!Number.isInteger(item.pid) || item.pid < 1 || item.pid > 2147483647) return null;
    if (!Number.isInteger(item.qty) || item.qty < 1 || item.qty > 1000000) return null;
    if (ids.has(item.pid)) return null;
    ids.add(item.pid);
    items.push({ pid: item.pid, qty: item.qty });
  }
  // Consistent lock order reduces deadlock risk for multi-product orders.
  return items.sort((a, b) => a.pid - b.pid);
}
