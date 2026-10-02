/** In-place radix-2 FFT. Plans cache bit reversal and twiddle factors. */
interface FFTPlan {
  reversed: Uint32Array;
  cos: Float64Array;
  sin: Float64Array;
}
const plans = new Map<number, FFTPlan>();

function planFor(size: number): FFTPlan {
  const cached = plans.get(size);
  if (cached) return cached;
  if (size < 2 || (size & (size - 1)) !== 0) throw new Error('FFT length must be a power of two.');
  const bits = Math.log2(size);
  const reversed = new Uint32Array(size);
  const cos = new Float64Array(size / 2);
  const sin = new Float64Array(size / 2);
  for (let i = 0; i < size; i++) {
    let value = i;
    let reverse = 0;
    for (let bit = 0; bit < bits; bit++) {
      reverse = (reverse << 1) | (value & 1);
      value >>>= 1;
    }
    reversed[i] = reverse;
  }
  for (let i = 0; i < size / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / size);
    sin[i] = Math.sin((2 * Math.PI * i) / size);
  }
  const plan = { reversed, cos, sin };
  plans.set(size, plan);
  return plan;
}

export function fft(real: Float64Array, imaginary: Float64Array, inverse = false): void {
  const size = real.length;
  if (imaginary.length !== size) throw new Error('FFT arrays must have equal lengths.');
  const plan = planFor(size);
  for (let i = 0; i < size; i++) {
    const other = plan.reversed[i];
    if (other > i) {
      const r = real[i];
      real[i] = real[other];
      real[other] = r;
      const im = imaginary[i];
      imaginary[i] = imaginary[other];
      imaginary[other] = im;
    }
  }
  const direction = inverse ? 1 : -1;
  for (let length = 2; length <= size; length *= 2) {
    const half = length / 2;
    const stride = size / length;
    for (let start = 0; start < size; start += length) {
      for (let j = 0; j < half; j++) {
        const twiddle = j * stride;
        const c = plan.cos[twiddle];
        const s = direction * plan.sin[twiddle];
        const first = start + j;
        const second = first + half;
        const r = real[second] * c - imaginary[second] * s;
        const im = real[second] * s + imaginary[second] * c;
        real[second] = real[first] - r;
        imaginary[second] = imaginary[first] - im;
        real[first] += r;
        imaginary[first] += im;
      }
    }
  }
  if (inverse)
    for (let i = 0; i < size; i++) {
      real[i] /= size;
      imaginary[i] /= size;
    }
}
