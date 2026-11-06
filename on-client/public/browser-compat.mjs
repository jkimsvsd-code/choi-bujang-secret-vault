// Older Windows browser installations still need JSON-data snapshot support.
if (!Object.hasOwn) {
  Object.defineProperty(Object, 'hasOwn', {
    value: (object, key) => Object.prototype.hasOwnProperty.call(object, key),
    writable: true,
    configurable: true,
  });
}

export function cloneData(value) {
  if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(value);
  if (Array.isArray(value)) return value.map(cloneData);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneData(entry)]));
  }
  return value;
}
