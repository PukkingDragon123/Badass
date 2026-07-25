/* BADASS APOCALYPSE - hand-drawn pixel art icons, rasterised at runtime.
   Each icon is a 16x16 character grid plus a per-icon palette. Rows shorter
   than 16 are padded, so a miscounted row degrades instead of exploding. */
(function () {
  'use strict';

  const SIZE = 16;
  const K = '#140c11';        // shared outline
  const W = '#ffffff';

  const ICONS = {
    /* ---------------------------------------------------------- weapons */
    spikes: {
      p: { k: K, s: '#e8eef7', S: '#9fb0c6', d: '#5c6a7d', m: '#8a2b22', M: '#c4382c' },
      g: [
        '       kk       ',
        '      ksSk      ',
        '  kk  ksSk  kk  ',
        ' ksSk ksSk ksSk ',
        ' ksSk ksSk ksSk ',
        'ksSSk ksSk ksSSk',
        'ksSSk ksSk ksSSk',
        'ksSSkkksSkkksSSk',
        'kkkkkkkkkkkkkkkk',
        'kMMMMMMMMMMMMMMk',
        'kMmmMmmMmmMmmMMk',
        'kMMMMMMMMMMMMMMk',
        'kkkkkkkkkkkkkkkk',
        '  kdk      kdk  ',
        '  kdk      kdk  ',
        '  kkk      kkk  ',
      ],
    },
    rocket: {
      p: { k: K, r: '#e8492f', R: '#ff8a5c', w: W, g: '#b9c6d8', f: '#ffd23a', o: '#ff8a1e' },
      g: [
        '       kk       ',
        '      kwwk      ',
        '      kwwk      ',
        '     krRRk      ',
        '     krRRk      ',
        '     krRRk      ',
        '    kkrRRkk     ',
        '   kggkRRkggk   ',
        '  kgggkRRkgggk  ',
        '  kggkkRRkkggk  ',
        '  kkk krrk kkk  ',
        '      kkkk      ',
        '      kffk      ',
        '     kfoofk     ',
        '     kfoofk     ',
        '      koak      ',
      ],
    },
    saw: {
      p: { k: K, s: '#dbe4f0', S: '#95a5bb', d: '#4c586a', r: '#b8202a' },
      g: [
        '   k        k   ',
        '  kSk  kk  kSk  ',
        '  kSkkksskkkSk  ',
        ' kkSssssssssSkk ',
        ' kssssSSSSssssk ',
        'kkssSSddddSSsskk',
        'ksssSdd  ddSsssk',
        'ksssSd    dSsssk',
        'ksssSd    dSsssk',
        'ksssSdd  ddSsssk',
        'kkssSSddddSSsskk',
        ' kssssSSSSssssk ',
        ' kkSssssssssSkk ',
        '  kSkkksskkkSk  ',
        '  kSk  kk  kSk  ',
        '   k   rr   k   ',
      ],
    },
    flame: {
      p: { k: K, y: '#ffe45c', o: '#ff9c1e', r: '#ef4423', d: '#8f1a10' },
      g: [
        '       kk       ',
        '      krrk      ',
        '     krrrrk     ',
        '  k  krorrk  k  ',
        ' krk krorrk krk ',
        ' krrkkroorkkrrk ',
        'krorrkroyorkrrok',
        'kroorkryyyrkroor',
        'krooorryyyrrooor',
        'kroooooyyyooooor',
        'kdooooyyyyyoooodk',
        ' kdoooyywyyooodk',
        ' kkdooyywyyoodkk',
        '  kkdoooyoooddk ',
        '    kkdoooodkk  ',
        '      kkddkk    ',
      ],
    },
    minigun: {
      p: { k: K, g: '#8d99ab', G: '#c3ceda', d: '#464f5d', y: '#ffd23a', o: '#ff8a1e' },
      g: [
        '                ',
        '            kkkk',
        '        kkkkgGGk',
        '     kkkgggggGGk',
        'y   kdGGGGGGGGGk',
        'yo kkdGGkkkkkkkk',
        'yookdGGkkkkkkkk ',
        ' okdGGGGGGGGGk  ',
        '  kdGGkkkkkkk   ',
        '  kdGGk kkkk    ',
        '  kkdGGGGGGk    ',
        '   kkddGGddk    ',
        '     kkdddk     ',
        '      kddk      ',
        '     kkddkk     ',
        '     kkkkkk     ',
      ],
    },
    tesla: {
      p: { k: K, b: '#63d3ff', B: '#bff0ff', w: W, d: '#1b6f9c' },
      g: [
        '        kk      ',
        '       kBBk     ',
        '      kBBbk     ',
        '     kBBbdk     ',
        '    kBBbbdk     ',
        '   kBBbbddk     ',
        '  kBBbbdddk     ',
        ' kBBbbkkkkkkkk  ',
        ' kbbkkkkbbBBBk  ',
        ' kkk   kbbBBk   ',
        '      kbbBBk    ',
        '     kbbBBk     ',
        '    kbbBBk      ',
        '   kbbBBk       ',
        '   kbBBk        ',
        '   kkkk         ',
      ],
    },
    mine: {
      p: { k: K, d: '#2b2f38', g: '#525a68', w: W, o: '#ff8a1e', y: '#ffe45c' },
      g: [
        '            kyk ',
        '           kyok ',
        '          kokk  ',
        '     kkk kok    ',
        '   kkgggkkk     ',
        '  kgggggggk     ',
        ' kggwwggggkk    ',
        ' kgwwgggggdk    ',
        'kggwggggggddk   ',
        'kgggggggggddk   ',
        'kggggggggdddk   ',
        'kgggggggdddkk   ',
        ' kggggddddk     ',
        ' kkgdddddkk     ',
        '  kkddddkk      ',
        '    kkkk        ',
      ],
    },
    slam: {
      p: { k: K, p: '#c68bff', P: '#e9d3ff', b: '#7a4bd0', w: W },
      g: [
        '   k   kk   k   ',
        '   kp  kPk  pk  ',
        '    kp kPk pk   ',
        ' k   kpkPkpk   k',
        ' kp   kPPPk   pk',
        '  kpp kPwPk ppk ',
        '   kppkPwPkppk  ',
        'kkkkkppkwkppkkkk',
        'kPPPPPwwwwwPPPPk',
        'kkkkkppkwkppkkkk',
        '   kppkPwPkppk  ',
        '  kpp kPwPk ppk ',
        ' kp   kPPPk   pk',
        ' k   kpkPkpk   k',
        '    kp kPk pk   ',
        '   k   kPk   k  ',
      ],
    },

    /* --------------------------------------------------------- passives */
    engine: {
      p: { k: K, r: '#e8382c', R: '#ff7a5c', d: '#7a1a12', g: '#98a4b5', y: '#ffd23a' },
      g: [
        '                ',
        '   kk      kk   ',
        '  kggk    kggk  ',
        '  kggkkkkkggk   ',
        ' kkRRRRRRRRRkk  ',
        'kRRRRRRRRRRRRRk ',
        'kRRkyykRRkyykRk ',
        'kRRkyykRRkyykRk ',
        'krrrrrrrrrrrrrk ',
        'krrddrrrrddrrrk ',
        'kkrrrrrrrrrrrkk ',
        ' kkdddddddddkk  ',
        '  kkgkkkkkgkk   ',
        '   kggk  kggk   ',
        '   kkkk  kkkk   ',
        '                ',
      ],
    },
    turbo: {
      p: { k: K, b: '#4dd2ff', B: '#c2f0ff', d: '#1c6f96', g: '#9aa7b8' },
      g: [
        '     kkkkkk     ',
        '   kkBBBBBBkk   ',
        '  kBBbbbbbbBBk  ',
        ' kBBbbddddbbBBk ',
        ' kBbbdd  ddbbBk ',
        'kBBbd  kk  dbBBk',
        'kBbbd kBBk dbbBk',
        'kBbd  kBBk  dbBk',
        'kBbd  kBBk  dbBk',
        'kBbbd kBBk dbbBk',
        'kBBbd  kk  dbBBk',
        ' kBbbdd  ddbbBk ',
        ' kBBbbddddbbBBk ',
        '  kBBbbbbbbBBk  ',
        '   kkBBBBBBkk   ',
        '     kkkkkk     ',
      ],
    },
    grip: {
      p: { k: K, d: '#22262e', g: '#3b4250', s: '#c8d2e0', S: '#8d99ab' },
      g: [
        '    kkkkkkkk    ',
        '  kkddddddddkk  ',
        ' kdgdgdgdgdgddk ',
        'kddddddddddddddk',
        'kdgdkkkkkkkkgddk',
        'kddkkSSSSSSkkddk',
        'kdgkSSsssSSSkgdk',
        'kddkSsskkssSkddk',
        'kddkSsskkssSkddk',
        'kdgkSSsssSSSkgdk',
        'kddkkSSSSSSkkddk',
        'kdgdkkkkkkkkgddk',
        'kddddddddddddddk',
        ' kdgdgdgdgdgddk ',
        '  kkddddddddkk  ',
        '    kkkkkkkk    ',
      ],
    },
    armor: {
      p: { k: K, g: '#7fd18f', G: '#c8f0d0', d: '#2f7a45', s: '#dbe4f0' },
      g: [
        '    kkkkkkkk    ',
        '  kkGGGGGGGGkk  ',
        ' kGGGggggggGGGk ',
        'kGGgggggggggggGk',
        'kGgggggddgggggGk',
        'kGggggdddgggggGk',
        'kgggddddddddgggk',
        'kgggddddddddgggk',
        'kgggggdddgggggkk',
        'kdggggdddgggggk ',
        'kddgggddgggggdk ',
        ' kddggggggggdk  ',
        '  kddggggggdk   ',
        '   kkddggddk    ',
        '     kkddkk     ',
        '       kk       ',
      ],
    },
    magnet: {
      p: { k: K, r: '#ff5c7a', R: '#ffb0c0', s: '#dbe4f0', S: '#95a5bb', b: '#63d3ff' },
      g: [
        '     kkkkkk     ',
        '   kkRRRRRRkk   ',
        '  kRRrrrrrrRRk  ',
        ' kRRrrkkkkrrRRk ',
        ' kRrrk    krrRk ',
        'kRRrk      krRRk',
        'kRrrk      krrRk',
        'kRrrk      krrRk',
        'kRrrk      krrRk',
        'kRrrk      krrRk',
        'kSSSk      kSSSk',
        'kssSk      kSssk',
        'kssSk      kSssk',
        'kkkkk      kkkkk',
        '  b          b  ',
        ' b b        b b ',
      ],
    },
    overdrive: {
      p: { k: K, w: W, s: '#d8dee8', d: '#8a93a3', r: '#ff3b30' },
      g: [
        '    kkkkkkkk    ',
        '  kkwwwwwwwwkk  ',
        ' kwwwwwwwwwwwwk ',
        'kwwwwwwwwwwwwwwk',
        'kwwkkkwwwkkkwwwk',
        'kwkrrrkwkrrrkwwk',
        'kwkrrrkwkrrrkwwk',
        'kwwkkkwwwkkkwwsk',
        'kwwwwwkkkwwwwwsk',
        'kswwwwwwwwwwwssk',
        ' kswwkwkwkwwssk ',
        '  kkswwwwwwskk  ',
        '   kkskwkwkkk   ',
        '    kkdkdkdk    ',
        '      kkkk      ',
        '                ',
      ],
    },
    coolant: {
      p: { k: K, b: '#9fe8ff', B: '#e6faff', d: '#2f8fb8', w: W },
      g: [
        '       kk       ',
        '   k  kBBk  k   ',
        '   kb kBBk bk   ',
        '    kbkBBkbk    ',
        '  kkkbbBBbbkkk  ',
        '   kkbbBBbbkk   ',
        '  kbbbbBBbbbbk  ',
        'kkbbbbbwwbbbbbkk',
        'kBBBBBwwwwBBBBBk',
        'kkbbbbbwwbbbbbkk',
        '  kbbbbBBbbbbk  ',
        '   kkbbBBbbkk   ',
        '  kkkbbBBbbkkk  ',
        '    kbkBBkbk    ',
        '   kb kBBk bk   ',
        '   k  kkkk  k   ',
      ],
    },
    lucky: {
      p: { k: K, w: W, s: '#cfd6e2', d: '#7b8494', r: '#d2a6ff', b: '#2a2f38' },
      g: [
        '                ',
        '    kkkkkkkk    ',
        '   kwwwwwwwwk   ',
        '  kwwbwwwwbwwk  ',
        ' kwwwbwwwwbwwwk ',
        ' kwwwwwbbwwwwwk ',
        ' kwwwwwbbwwwwwk ',
        ' kwwbwwwwwwbwwk ',
        ' kwwbwwwwwwbwsk ',
        ' kwwwwwwwwwwssk ',
        ' kswwwwwwwwsssk ',
        '  kssswwwsssdk  ',
        '   kkssssssdk   ',
        '    kkddddkk    ',
        '  r   kkkk   r  ',
        ' r r        r r ',
      ],
    },
    hydraulics: {
      p: { k: K, g: '#9aa7b8', G: '#dbe4f0', d: '#4a5462', t: '#7fffd4' },
      g: [
        '   kkkkkkkkkk   ',
        '   kGGGGGGGGk   ',
        '   kkdddddddk   ',
        '     kgGGgk     ',
        '   kkkgGGgkkk   ',
        '  kGGgggggggGk  ',
        '  kkkkgGGgkkkk  ',
        '   kkkgGGgkkk   ',
        '  kGGgggggggGk  ',
        '  kkkkgGGgkkkk  ',
        '   kkkgGGgkkk   ',
        '  kGGgggggggGk  ',
        '   kkkgGGgkkk   ',
        '   kkdddddddk   ',
        '   kGGGGGGGGk   ',
        '   kkkkkkkkkk   ',
      ],
    },
    ramplate: {
      p: { k: K, o: '#e0a06a', O: '#ffd0a0', d: '#8a5a30', s: '#c8d2e0' },
      g: [
        '                ',
        '  kkkkkkkkkkkk  ',
        ' kOOOOOOOOOOOOk ',
        ' kOooooooooooOk ',
        ' kOodoooooodoOk ',
        ' kOoooooooooOk  ',
        ' kkOooooooooOk  ',
        '  kkOoooooooOk  ',
        '   kkOooooooOk  ',
        '    kkOoooooOk  ',
        '     kkOooooOk  ',
        '      kkOoooOk  ',
        '   kss kkOooOk  ',
        '   kss  kkOoOk  ',
        '   kss   kkOkk  ',
        '   kkk    kkk   ',
      ],
    },
    repair: {
      p: { k: K, s: '#d8dee8', S: '#98a4b5', g: '#7dffa0', d: '#4a5462' },
      g: [
        '        kkkk    ',
        '       kssskk   ',
        '      kssk kk   ',
        '      ksk       ',
        '      kssk  kk  ',
        '   kk  ksskssk  ',
        '  kSSk  ksssk   ',
        '  kSSSk  kkk    ',
        '   kSSSk        ',
        '    kSSSk       ',
        '     kSSSk      ',
        '      kSSSk     ',
        '       kSSSk    ',
        '  g     kSSk    ',
        ' g g     kkk    ',
        '  g             ',
      ],
    },
    gas: {
      p: { k: K, r: '#e8492f', R: '#ff8a5c', d: '#8f1a10', y: '#ffd23a', s: '#c8d2e0' },
      g: [
        '     kkkk       ',
        '    ksskk       ',
        '  kkkkkkkkkkk   ',
        ' kRRRRRRRRRRRk  ',
        'kkRRRRRRRRRRRkk ',
        'krRRRRRRRRRRRrk ',
        'krRRkyyyykRRRrkk',
        'krRRkyyyykRRRrrk',
        'krRRRkyykRRRRrrk',
        'krRRRRkkRRRRRrrk',
        'krrRRRRRRRRRrrkk',
        'kdrrRRRRRRRrrdk ',
        'kddrrrrrrrrrddk ',
        'kkddddddddddkkk ',
        ' kkkkkkkkkkkk   ',
        '                ',
      ],
    },
  };

  const cache = new Map();

  function render(id, scale) {
    const key = id + '@' + scale;
    if (cache.has(key)) return cache.get(key);
    const def = ICONS[id];
    if (!def) return '';

    const src = document.createElement('canvas');
    src.width = src.height = SIZE;
    const sctx = src.getContext('2d');
    const img = sctx.createImageData(SIZE, SIZE);

    for (let y = 0; y < SIZE; y++) {
      const row = def.g[y] || '';
      for (let x = 0; x < SIZE; x++) {
        const ch = row[x] || ' ';
        const hex = def.p[ch];
        const o = (y * SIZE + x) * 4;
        if (!hex) { img.data[o + 3] = 0; continue; }
        img.data[o] = parseInt(hex.slice(1, 3), 16);
        img.data[o + 1] = parseInt(hex.slice(3, 5), 16);
        img.data[o + 2] = parseInt(hex.slice(5, 7), 16);
        img.data[o + 3] = 255;
      }
    }
    sctx.putImageData(img, 0, 0);

    const out = document.createElement('canvas');
    out.width = out.height = SIZE * scale;
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = false;
    octx.drawImage(src, 0, 0, out.width, out.height);
    const url = out.toDataURL('image/png');
    cache.set(key, url);
    return url;
  }

  BA.icons = {
    url: (id, scale) => render(id, scale || 4),
    img: (id, px, cls) => {
      const url = render(id, 4);
      if (!url) return '';
      return `<img class="pxi${cls ? ' ' + cls : ''}" src="${url}" width="${px}" height="${px}" alt="">`;
    },
    has: (id) => !!ICONS[id],
    ids: () => Object.keys(ICONS),
  };
})();
