export { parsePositiveInteger } from '../common/numbers.js';

export function validateProduct(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const keys = Object.keys(body);
  const allowed = ['pname', 'price', 'quantity'];
  if (keys.length === 0 || keys.some(key => !allowed.includes(key))) return null;
  if (!partial && allowed.some(key => !Object.hasOwn(body, key))) return null;
  const data = {};
  if (Object.hasOwn(body, 'pname')) {
    if (typeof body.pname !== 'string') return null;
    data.pname = body.pname.trim();
    if (!data.pname || [...data.pname].length > 100) return null;
  }
  if (Object.hasOwn(body, 'price')) {
    // String decimal avoids converting money through floating-point numbers.
    if (typeof body.price !== 'string' || !/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(body.price)) return null;
    data.price = body.price;
  }
  if (Object.hasOwn(body, 'quantity')) {
    if (!Number.isInteger(body.quantity) || body.quantity < 0 || body.quantity > 2147483647) return null;
    data.quantity = body.quantity;
  }
  return data;
}

export function serializeProduct(product) {
  return { pid: product.pid, pname: product.pname, price: product.price.toFixed(2), quantity: product.quantity };
}

