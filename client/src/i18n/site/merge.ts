type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** Deep-merges copy modules the way i18next's addResourceBundle(deep) would (later modules win). */
export const deepMerge = (parts: object[]): Obj => {
  const out: Obj = {};
  const into = (target: Obj, src: Obj) => {
    for (const [k, v] of Object.entries(src)) {
      if (isObj(v) && isObj(target[k])) into(target[k] as Obj, v);
      else target[k] = isObj(v) ? into({}, v) : v;
    }
    return target;
  };
  for (const p of parts) into(out, p as Obj);
  return out;
};
