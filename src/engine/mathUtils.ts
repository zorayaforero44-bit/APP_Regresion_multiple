// Exact numerical, statistical distribution, and linear algebra utilities

export function createSeededRng(seed: number): () => number {
  let state = (seed >>> 0) || 123456789;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sampleNormal(rng: () => number, mean = 0, std = 1): number {
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + std * z;
}

export function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  return sum / arr.length;
}

export function variance(arr: number[], ddof = 1): number {
  if (arr.length <= ddof) return 0;
  const m = mean(arr);
  let ss = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - m;
    ss += d * d;
  }
  return ss / (arr.length - ddof);
}

export function std(arr: number[], ddof = 1): number {
  return Math.sqrt(Math.max(0, variance(arr, ddof)));
}

export function quantile(sortedOrUnsorted: number[], q: number, alreadySorted = false): number {
  if (sortedOrUnsorted.length === 0) return 0;
  const arr = alreadySorted ? sortedOrUnsorted : [...sortedOrUnsorted].sort((a, b) => a - b);
  if (arr.length === 1) return arr[0];
  const pos = (arr.length - 1) * Math.max(0, Math.min(1, q));
  const base = Math.floor(pos);
  const rest = pos - base;
  if (base + 1 < arr.length) {
    return arr[base] + rest * (arr[base + 1] - arr[base]);
  }
  return arr[base];
}

export function median(arr: number[]): number {
  return quantile(arr, 0.5);
}

export function skewness(arr: number[]): number {
  const n = arr.length;
  if (n < 3) return 0;
  const m = mean(arr);
  const s = std(arr, 1);
  if (s === 0) return 0;
  let sum3 = 0;
  for (let i = 0; i < n; i++) {
    sum3 += Math.pow((arr[i] - m) / s, 3);
  }
  return (n / ((n - 1) * (n - 2))) * sum3;
}

export function excessKurtosis(arr: number[]): number {
  const n = arr.length;
  if (n < 4) return 0;
  const m = mean(arr);
  const s = std(arr, 0);
  if (s === 0) return 0;
  let sum4 = 0;
  for (let i = 0; i < n; i++) {
    sum4 += Math.pow((arr[i] - m) / s, 4);
  }
  return sum4 / n - 3;
}

export function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function pearsonCorr(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const mx = mean(x);
  const my = mean(y);
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? 0 : Math.max(-1, Math.min(1, num / denom));
}

function rankArray(arr: number[]): number[] {
  const indexed = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(arr.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[indexed[k].i] = avgRank;
    i = j + 1;
  }
  return ranks;
}

export function spearmanCorr(x: number[], y: number[]): number {
  if (x.length < 2) return 0;
  return pearsonCorr(rankArray(x), rankArray(y));
}

export function kendallTau(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  let concordant = 0;
  let discordant = 0;
  let tiesX = 0;
  let tiesY = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = x[i] - x[j];
      const dy = y[i] - y[j];
      if (dx === 0 && dy === 0) continue;
      if (dx === 0) {
        tiesX++;
      } else if (dy === 0) {
        tiesY++;
      } else if (dx * dy > 0) {
        concordant++;
      } else {
        discordant++;
      }
    }
  }
  const denom = Math.sqrt((concordant + discordant + tiesX) * (concordant + discordant + tiesY));
  return denom === 0 ? 0 : (concordant - discordant) / denom;
}

export function cramersV(a: string[], b: string[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const rows = Array.from(new Set(a));
  const cols = Array.from(new Set(b));
  const r = rows.length;
  const c = cols.length;
  if (r <= 1 || c <= 1) return 0;

  const rowIdx = new Map(rows.map((v, i) => [v, i]));
  const colIdx = new Map(cols.map((v, i) => [v, i]));
  const table = Array.from({ length: r }, () => new Array<number>(c).fill(0));
  const rowTotals = new Array<number>(r).fill(0);
  const colTotals = new Array<number>(c).fill(0);

  for (let i = 0; i < n; i++) {
    const ri = rowIdx.get(a[i])!;
    const ci = colIdx.get(b[i])!;
    table[ri][ci]++;
    rowTotals[ri]++;
    colTotals[ci]++;
  }

  let chi2 = 0;
  for (let i = 0; i < r; i++) {
    for (let j = 0; j < c; j++) {
      const expected = (rowTotals[i] * colTotals[j]) / n;
      if (expected > 0) {
        const diff = table[i][j] - expected;
        chi2 += (diff * diff) / expected;
      }
    }
  }
  const minDim = Math.min(r - 1, c - 1);
  return minDim <= 0 ? 0 : Math.min(1, Math.sqrt(chi2 / (n * minDim)));
}

export function etaSquared(categories: string[], values: number[]): number {
  const n = Math.min(categories.length, values.length);
  if (n < 2) return 0;
  const grandMean = mean(values);
  let ssTotal = 0;
  for (let i = 0; i < n; i++) {
    const d = values[i] - grandMean;
    ssTotal += d * d;
  }
  if (ssTotal === 0) return 0;

  const groups = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const list = groups.get(categories[i]) ?? [];
    list.push(values[i]);
    groups.set(categories[i], list);
  }

  let ssBetween = 0;
  for (const grp of groups.values()) {
    const gm = mean(grp);
    const d = gm - grandMean;
    ssBetween += grp.length * d * d;
  }
  return Math.max(0, Math.min(1, ssBetween / ssTotal));
}

// Special mathematical functions for exact p-values & critical values
export function logGamma(z: number): number {
  const g = 7;
  const p = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  z -= 1;
  let x = p[0];
  for (let i = 1; i < g + 2; i++) {
    x += p[i] / (z + i);
  }
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200;
  const EPS = 3e-12;
  const FPMIN = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

export function betaInc(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  );
  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betacf(a, b, x)) / a;
  }
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

export function erf(x: number): number {
  const sign = x >= 0 ? 1 : -1;
  const ax = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

export function normalQuantile(p: number): number {
  // Acklam's inverse normal CDF approximation
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

export function studentTCdf(t: number, df: number): number {
  if (df <= 0) return 0.5;
  const x = df / (df + t * t);
  const ib = betaInc(df / 2, 0.5, x);
  if (t >= 0) return 1 - 0.5 * ib;
  return 0.5 * ib;
}

export function studentTPValue(t: number, df: number): number {
  if (!Number.isFinite(t) || df <= 0) return 1;
  return Math.max(0, Math.min(1, 2 * (1 - studentTCdf(Math.abs(t), df))));
}

export function studentTQuantile(p: number, df: number): number {
  if (df <= 0) return normalQuantile(p);
  if (p === 0.5) return 0;
  // Bisection + Newton polish
  let lo = -100;
  let hi = 100;
  if (p < 0.5) {
    hi = 0;
  } else {
    lo = 0;
  }
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const cdf = studentTCdf(mid, df);
    if (cdf < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function fDistPValue(fStat: number, df1: number, df2: number): number {
  if (!Number.isFinite(fStat) || fStat <= 0 || df1 <= 0 || df2 <= 0) return 1;
  const x = df2 / (df2 + df1 * fStat);
  return Math.max(0, Math.min(1, betaInc(df2 / 2, df1 / 2, x)));
}

function gammaLowerInc(s: number, x: number): number {
  if (x <= 0) return 0;
  if (x < s + 1) {
    let sum = 1 / s;
    let term = sum;
    for (let k = 1; k < 200; k++) {
      term *= x / (s + k);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-12) break;
    }
    return sum * Math.exp(-x + s * Math.log(x) - logGamma(s));
  }
  // Continued fraction
  let b = x + 1 - s;
  let c = 1 / 1e-30;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 200; i++) {
    const an = -i * (i - s);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = b + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return 1 - Math.exp(-x + s * Math.log(x) - logGamma(s)) * h;
}

export function chiSquarePValue(chi2: number, df: number): number {
  if (!Number.isFinite(chi2) || chi2 <= 0 || df <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - gammaLowerInc(df / 2, chi2 / 2)));
}

// Matrix Algebra
export function transpose(A: number[][]): number[][] {
  if (A.length === 0) return [];
  const rows = A.length;
  const cols = A[0].length;
  const T = Array.from({ length: cols }, () => new Array<number>(rows));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      T[j][i] = A[i][j];
    }
  }
  return T;
}

export function matMul(A: number[][], B: number[][]): number[][] {
  const m = A.length;
  const k = A[0]?.length ?? 0;
  const n = B[0]?.length ?? 0;
  const C = Array.from({ length: m }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < m; i++) {
    const ai = A[i];
    const ci = C[i];
    for (let l = 0; l < k; l++) {
      const ail = ai[l];
      if (ail === 0) continue;
      const bl = B[l];
      for (let j = 0; j < n; j++) {
        ci[j] += ail * bl[j];
      }
    }
  }
  return C;
}

export function matVecMul(A: number[][], v: number[]): number[] {
  const m = A.length;
  const out = new Array<number>(m).fill(0);
  for (let i = 0; i < m; i++) {
    let s = 0;
    const ai = A[i];
    for (let j = 0; j < v.length; j++) s += ai[j] * v[j];
    out[i] = s;
  }
  return out;
}

export function invertMatrix(M: number[][], ridgeEps = 0): number[][] | null {
  const n = M.length;
  if (n === 0) return [];
  const A = M.map((row, i) =>
    row.map((val, j) => (i === j ? val + ridgeEps : val))
  );
  const I = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (__, j) => (i === j ? 1 : 0))
  );

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxVal = Math.abs(A[col][col]);
    for (let r = col + 1; r < n; r++) {
      const av = Math.abs(A[r][col]);
      if (av > maxVal) {
        maxVal = av;
        pivotRow = r;
      }
    }
    if (maxVal < 1e-12) return null;
    if (pivotRow !== col) {
      [A[col], A[pivotRow]] = [A[pivotRow], A[col]];
      [I[col], I[pivotRow]] = [I[pivotRow], I[col]];
    }
    const pivot = A[col][col];
    for (let j = 0; j < n; j++) {
      A[col][j] /= pivot;
      I[col][j] /= pivot;
    }
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = A[r][col];
      if (factor === 0) continue;
      for (let j = 0; j < n; j++) {
        A[r][j] -= factor * A[col][j];
        I[r][j] -= factor * I[col][j];
      }
    }
  }
  return I;
}

export function solveLinearSystem(A: number[][], b: number[], ridgeEps = 0): number[] | null {
  const inv = invertMatrix(A, ridgeEps);
  if (!inv) return null;
  return matVecMul(inv, b);
}

export function formatNum(val: number | null | undefined, decimals = 2): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  return val.toLocaleString('es-CO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatCompact(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  const abs = Math.abs(val);
  if (abs >= 1e6) return `${(val / 1e6).toFixed(2)}M`;
  if (abs >= 1e3 && abs < 1e6) return val.toLocaleString('es-CO', { maximumFractionDigits: 1 });
  if (abs > 0 && abs < 0.01) return val.toExponential(3);
  return val.toLocaleString('es-CO', { maximumFractionDigits: 3 });
}
