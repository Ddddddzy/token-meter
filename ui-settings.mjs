import fs from 'node:fs';

export function normalizeUi(settings = {}) {
  const clamp = (value, fallback, min, max) => {
    const n = value == null || value === '' ? NaN : Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  return {
    scale: clamp(settings?.scale, 1, 0.8, 1.4),
    glass: clamp(settings?.glass, 0.8, 0.15, 0.9),
    blur: Math.round(clamp(settings?.blur, 50, 0, 100)),
  };
}

export function readUi(file) {
  try { return normalizeUi(JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))); }
  catch { return normalizeUi(); }
}

export function saveUi(file, updates) {
  const current = readUi(file);
  for (const key of ['scale', 'glass', 'blur']) {
    if (updates?.[key] != null) current[key] = updates[key];
  }
  const saved = normalizeUi(current);
  fs.writeFileSync(file, JSON.stringify(saved));
  return saved;
}
