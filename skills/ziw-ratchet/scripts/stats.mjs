export function median(values) {
  if (!values.length || values.some((n) => !Number.isFinite(n)))
    throw new Error("median requires finite measurements");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function signTest(wins, losses) {
  if (![wins, losses].every((n) => Number.isSafeInteger(n) && n >= 0))
    throw new Error("sign test requires nonnegative integer counts");
  const n = wins + losses;
  if (!n || wins <= losses) return 1;
  // Sum in log space so large sets do not overflow binomial coefficients.
  let logTerm = -n * Math.LN2;
  let probability = Math.exp(logTerm);
  for (let k = 1; k <= losses; k++) {
    logTerm += Math.log(n - k + 1) - Math.log(k);
    probability += Math.exp(logTerm);
  }
  return Math.min(1, probability);
}

export function holm(pValues, alpha) {
  if (!(alpha > 0 && alpha < 1) || pValues.some((p) => !(p >= 0 && p <= 1)))
    throw new Error("Holm requires probabilities and 0 < alpha < 1");
  const ordered = pValues.map((p, index) => ({ p, index })).sort((a, b) => a.p - b.p);
  const rejected = pValues.map(() => false);
  for (let i = 0; i < ordered.length; i++) {
    if (ordered[i].p > alpha / (ordered.length - i)) break;
    rejected[ordered[i].index] = true;
  }
  return rejected;
}

// Acklam's inverse-normal approximation, accurate beyond the displayed intervals.
export function normalQuantile(p) {
  if (!(p > 0 && p < 1)) throw new Error("normal quantile requires 0 < p < 1");
  const a = [
    -39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472,
    2.50662827745924,
  ];
  const b = [
    -54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857,
  ];
  const c = [
    -0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373,
    4.37466414146497, 2.93816398269878,
  ];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const polynomial = (coefficients, x) =>
    coefficients.reduce((v, coefficient) => v * x + coefficient, 0);
  if (p < 0.02425) {
    const q = Math.sqrt(-2 * Math.log(p));
    return polynomial(c, q) / (polynomial(d, q) * q + 1);
  }
  if (p > 0.97575) return -normalQuantile(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return (polynomial(a, r) * q) / (polynomial(b, r) * r + 1);
}

export function wilson(successes, count, confidence = 0.9) {
  if (!(count > 0) || !(successes >= 0 && successes <= count))
    throw new Error("Wilson interval requires a nonempty unit count");
  const z = normalQuantile((1 + confidence) / 2);
  const p = successes / count;
  const denominator = 1 + (z * z) / count;
  const center = (p + (z * z) / (2 * count)) / denominator;
  const radius =
    (z * Math.sqrt((p * (1 - p)) / count + (z * z) / (4 * count * count))) / denominator;
  return { lower: Math.max(0, center - radius), upper: Math.min(1, center + radius) };
}

export function measuredStanding(criterion, value) {
  if (!Number.isFinite(value)) throw new Error("measurement must be finite");
  return Math.max(
    0,
    Math.min(10, (10 * (value - criterion.map.at0)) / (criterion.map.at10 - criterion.map.at0)),
  );
}

export function minimumUnits(setup) {
  const { alpha, confidence } = setup.thresholds;
  const target = Math.max(
    ...setup.criteria.filter((c) => c.type === "judged").map((c) => c.target),
  );
  if (target >= 10) throw new Error("a judged target of 10 cannot reach a Wilson lower bound");
  const working = Math.max(1, Math.ceil(Math.log2(3 / alpha)));
  const z = normalQuantile((1 + confidence) / 2);
  const pairs = Math.max(1, Math.ceil((target * z * z) / (10 - target)));
  return { working, validation: pairs, confirmation: pairs };
}
