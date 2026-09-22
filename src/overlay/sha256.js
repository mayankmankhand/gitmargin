// A small synchronous SHA-256, for one job: hashing the sign-in's one-time code
// inside the click that opens the pop-up (issue #18).
//
// Why not the browser's own `crypto.subtle`: it is asynchronous, and anything
// awaited between the click and `window.open` invites the pop-up blocker; and it
// does not exist at all on a page served over plain http. Measured in plan step
// 1. The input here is always a short run of hex digits, so bytes are char codes.
//
// tests/sha256.test.js checks it against Node's implementation. A first
// hand-written version of this was wrong (two rotates that should have been
// shifts) and only that kind of check caught it.

let K = null;
let H0 = null;

/** The constants are fractional parts of roots of the first primes: computed, so no digit can be mistyped. */
function constants() {
  K = [];
  H0 = [];
  for (let candidate = 2, n = 0; n < 64; candidate += 1) {
    let prime = true;
    for (let d = 2; d * d <= candidate; d += 1) {
      if (candidate % d === 0) {
        prime = false;
        break;
      }
    }
    if (!prime) continue;
    if (n < 8) H0[n] = (Math.pow(candidate, 1 / 2) * 4294967296) | 0;
    K[n] = (Math.pow(candidate, 1 / 3) * 4294967296) | 0;
    n += 1;
  }
}

const rot = (value, by) => (value >>> by) | (value << (32 - by));

/** @param {string} ascii  @returns {string} 64 lowercase hex characters */
export function sha256hex(ascii) {
  if (!K) constants();
  const bytes = [];
  for (let i = 0; i < ascii.length; i += 1) bytes.push(ascii.charCodeAt(i) & 255);
  const bits = bytes.length * 8;
  bytes.push(128);
  while (bytes.length % 64 !== 56) bytes.push(0);
  bytes.push(0, 0, 0, 0, (bits >>> 24) & 255, (bits >>> 16) & 255, (bits >>> 8) & 255, bits & 255);

  const h = H0.slice(0);
  const w = [];
  for (let off = 0; off < bytes.length; off += 64) {
    for (let t = 0; t < 16; t += 1) {
      w[t] = (bytes[off + 4 * t] << 24) | (bytes[off + 4 * t + 1] << 16) | (bytes[off + 4 * t + 2] << 8) | bytes[off + 4 * t + 3];
    }
    for (let t = 16; t < 64; t += 1) {
      const s0 = rot(w[t - 15], 7) ^ rot(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rot(w[t - 2], 17) ^ rot(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let t = 0; t < 64; t += 1) {
      const t1 = (hh + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + w[t]) | 0;
      const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    [a, b, c, d, e, f, g, hh].forEach((value, i) => {
      h[i] = (h[i] + value) | 0;
    });
  }
  return h.map((word) => `00000000${(word >>> 0).toString(16)}`.slice(-8)).join('');
}
