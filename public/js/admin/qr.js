// Gerador de QR code (modo byte, correção de erros nível M, versões 1 a 40), sem biblioteca externa.
// Uso: makeQr('https://...') devolve uma matriz de booleanos (true = módulo escuro). O painel desenha essa matriz em SVG.
// Baseado no algoritmo da especificação ISO/IEC 18004; o teste (qr.test.js) confere a leitura com decodificador real.
(function (root) {
  const ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
  const NUM_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];
  const rawModules = ver => {
    let r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const n = Math.floor(ver / 7) + 2;
      r -= (25 * n - 10) * n - 55;
      if (ver >= 7)
        r -= 36;
    }
    return r;
  };
  const dataCodewords = ver => Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];
  // Aritmética de Reed-Solomon sobre GF(256), polinômio 0x11D.
  const gfMul = (x, y) => {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  };
  const rsDivisor = degree => {
    const result = new Array(degree).fill(0);
    result[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < result.length; j++) {
        result[j] = gfMul(result[j], root);
        if (j + 1 < result.length)
          result[j] ^= result[j + 1];
      }
      root = gfMul(root, 0x02);
    }
    return result;
  };
  const rsRemainder = (data, divisor) => {
    const result = divisor.map(() => 0);
    for (const b of data) {
      const factor = b ^ result.shift();
      result.push(0);
      divisor.forEach((coef, i) => { result[i] ^= gfMul(coef, factor); });
    }
    return result;
  };
  const utf8 = text => Array.from(new TextEncoder().encode(text));
  function encodeData(bytes, ver) {
    const bits = [];
    const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    push(0x4, 4);
    push(bytes.length, ver <= 9 ? 8 : 16);
    bytes.forEach(b => push(b, 8));
    const capacity = dataCodewords(ver) * 8;
    push(0, Math.min(4, capacity - bits.length));
    push(0, (8 - bits.length % 8) % 8);
    for (let pad = 0xEC; bits.length < capacity; pad ^= 0xEC ^ 0x11)
      push(pad, 8);
    const out = [];
    for (let i = 0; i < bits.length; i += 8)
      out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
    return out;
  }
  function addEcc(data, ver) {
    const numBlocks = NUM_BLOCKS[ver], eccLen = ECC_PER_BLOCK[ver], raw = Math.floor(rawModules(ver) / 8);
    const numShort = numBlocks - raw % numBlocks, shortLen = Math.floor(raw / numBlocks);
    const divisor = rsDivisor(eccLen), blocks = [];
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
      k += dat.length;
      const ecc = rsRemainder(dat, divisor);
      if (i < numShort)
        dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    const result = [];
    for (let i = 0; i < blocks[0].length; i++)
      blocks.forEach((block, j) => { if (i !== shortLen - eccLen || j >= numShort) result.push(block[i]); });
    return result;
  }
  const alignPositions = ver => {
    if (ver === 1)
      return [];
    const n = Math.floor(ver / 7) + 2, size = ver * 4 + 17;
    const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
    const result = [6];
    for (let pos = size - 7; result.length < n; pos -= step)
      result.splice(1, 0, pos);
    return result;
  };
  function build(codewords, ver, mask) {
    const size = ver * 4 + 17;
    const mod = Array.from({ length: size }, () => new Array(size).fill(false));
    const fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, dark) => { mod[y][x] = dark; fn[y][x] = true; };
    for (let i = 0; i < size; i++) {
      set(6, i, i % 2 === 0);
      set(i, 6, i % 2 === 0);
    }
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++)
        for (let dx = -4; dx <= 4; dx++) {
          const dist = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
          if (x >= 0 && x < size && y >= 0 && y < size)
            set(x, y, dist !== 2 && dist !== 4);
        }
    };
    finder(3, 3);
    finder(size - 4, 3);
    finder(3, size - 4);
    const pos = alignPositions(ver);
    pos.forEach((px, i) => pos.forEach((py, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0))
        return;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
          set(px + dx, py + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));
    // Formato (nível M = 0b00) e versão.
    const drawFormat = m => {
      const data = (0 << 3) | m;
      let rem = data;
      for (let i = 0; i < 10; i++)
        rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const bits = ((data << 10) | rem) ^ 0x5412, bit = i => ((bits >>> i) & 1) !== 0;
      for (let i = 0; i <= 5; i++) set(8, i, bit(i));
      set(8, 7, bit(6));
      set(8, 8, bit(7));
      set(7, 8, bit(8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
      set(8, size - 8, true);
    };
    drawFormat(0);
    if (ver >= 7) {
      let rem = ver;
      for (let i = 0; i < 12; i++)
        rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      const bits = (ver << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const dark = ((bits >>> i) & 1) !== 0, a = size - 11 + i % 3, b = Math.floor(i / 3);
        set(a, b, dark);
        set(b, a, dark);
      }
    }
    // Dados em zigue-zague.
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6)
        right = 5;
      for (let vert = 0; vert < size; vert++)
        for (let j = 0; j < 2; j++) {
          const x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert;
          if (!fn[y][x] && i < codewords.length * 8) {
            mod[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
        }
    }
    return { mod, fn, size, drawFormat };
  }
  const maskFn = [
    (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0,
    (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0
  ];
  function penalty(mod, size) {
    let score = 0, dark = 0;
    const run = line => {
      let s = 0, runLen = 1;
      for (let i = 1; i < line.length; i++) {
        if (line[i] === line[i - 1]) {
          runLen++;
          if (runLen === 5) s += 3;
          else if (runLen > 5) s++;
        }
        else
          runLen = 1;
      }
      return s;
    };
    for (let y = 0; y < size; y++) {
      score += run(mod[y]);
      score += run(mod.map(row => row[y]));
    }
    for (let y = 0; y < size - 1; y++)
      for (let x = 0; x < size - 1; x++)
        if (mod[y][x] === mod[y][x + 1] && mod[y][x] === mod[y + 1][x] && mod[y][x] === mod[y + 1][x + 1])
          score += 3;
    const pat = [true, false, true, true, true, false, true, false, false, false, false];
    const finderLike = line => {
      let s = 0;
      for (let i = 0; i + 11 <= line.length; i++) {
        if (pat.every((v, k) => line[i + k] === v) || pat.every((v, k) => line[i + 10 - k] === v))
          s += 40;
      }
      return s;
    };
    for (let y = 0; y < size; y++) {
      score += finderLike(mod[y]);
      score += finderLike(mod.map(row => row[y]));
      dark += mod[y].filter(Boolean).length;
    }
    const total = size * size;
    score += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;
    return score;
  }
  function makeQr(text) {
    const bytes = utf8(String(text));
    let ver = 1;
    for (;; ver++) {
      if (ver > 40)
        throw new Error('Texto grande demais para o QR code.');
      if (4 + (ver <= 9 ? 8 : 16) + bytes.length * 8 <= dataCodewords(ver) * 8)
        break;
    }
    const codewords = addEcc(encodeData(bytes, ver), ver);
    let best = null, bestScore = Infinity;
    for (let m = 0; m < 8; m++) {
      const q = build(codewords, ver, m);
      for (let y = 0; y < q.size; y++)
        for (let x = 0; x < q.size; x++)
          if (!q.fn[y][x] && maskFn[m](x, y))
            q.mod[y][x] = !q.mod[y][x];
      q.drawFormat(m);
      const score = penalty(q.mod, q.size);
      if (score < bestScore) {
        bestScore = score;
        best = q.mod;
      }
    }
    return best;
  }
  // SVG pronto (com a "zona silenciosa" de 4 módulos). `px` é o tamanho de cada módulo.
  function qrSvg(text, px) {
    const m = makeQr(text), n = m.length, quiet = 4, size = n + quiet * 2, cell = px || 6;
    let path = '';
    m.forEach((row, y) => row.forEach((dark, x) => { if (dark) path += `M${x + quiet},${y + quiet}h1v1h-1z`; }));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size * cell}" height="${size * cell}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
  }
  root.makeQr = makeQr;
  root.qrSvg = qrSvg;
  if (typeof module !== 'undefined' && module.exports)
    module.exports = { makeQr, qrSvg };
})(typeof window !== 'undefined' ? window : globalThis);
