const form = document.forms.font;

let name = '';
let glyphs = [];
let unitsPerEm = 0;

form.file.onchange = ({ target }) =>
  compute(target.files[0], target.files[0].name);

form.download.onclick = () => download(name, glyphs, unitsPerEm);

const fontData = sessionStorage.getItem('fontData');
if (fontData) {
  const font = base64ToArrayBuffer(fontData);
  loadFont(font);
}

//

async function compute(file, name) {
  const isWoff2 = name.endsWith('.woff2');
  if (isWoff2) await loadWAWOFF2();

  try {
    const data = await file.arrayBuffer();
    let error;

    try {
      const base64String = arrayBufferToBase64(data);
      sessionStorage.setItem('fontData', base64String);
    } catch (err) {
      print(err.toString());
      error = err;
    }

    const font = isWoff2 ? Module.decompress(data) : data;
    loadFont(font);
  } catch (err) {
    print(err.toString());
    console.error(err);
    throw err;
  }
}

function loadFont(font) {
  try {
    const parsed = opentype.parse(font, { lowMemory: true });
    if (!parsed) throw new Error(`error parsing font!`);

    name = getName(parsed);
    unitsPerEm = getUnitsPerEm(parsed);
    glyphs = getGlyphs(parsed);

    renderGrid(glyphs);
    form.download.disabled = false;

    print([`loaded: ${name}`, `unitsPerEm: ${unitsPerEm}`].join(' | '));
  } catch (error) {
    print(error.toString().toLowerCase());
    form.download.disabled = true;
  }
}

function getName(font) {
  return font.names.postScriptName.en;
}

function getUnitsPerEm(font) {
  return font.unitsPerEm;
}

function getGlyphs(font) {
  const glyphs = [];

  for (let index = 0; index < font.numGlyphs; index++) {
    const glyph = font.glyphs.get(index);
    if (index === 2) console.log(glyph);
    glyphs.push({
      index,
      name: glyph.name,
      unicode: glyph.unicode,
      width: glyph.advanceWidth || 0,
    });
  }

  return glyphs;
}

//

function generateFontMetrics(glyphs, unitsPerEm) {
  const charWidths = {};

  for (const glyph of glyphs) {
    charWidths[glyph.unicode] = glyph.width;
  }

  const widthGroups = {};
  let totalWidth = 0;
  let charCount = 0;

  const sortedChars = Object.entries(charWidths)
    .map(([char, width]) => [parseInt(char, 10), width])
    .sort((a, b) => a[0] - b[0]);

  for (const [charCode, width] of sortedChars) {
    if (!widthGroups[width]) {
      widthGroups[width] = [];
    }

    const currentRanges = widthGroups[width];
    const lastRange = currentRanges[currentRanges.length - 1];

    if (!lastRange || lastRange[1] !== charCode - 1) {
      currentRanges.push([charCode, charCode]);
    } else {
      lastRange[1] = charCode;
    }

    totalWidth += width;
    charCount++;
  }

  // 120 is charCode for 'x', 88 for 'X'
  const defaultWidth = charWidths['120'] || charWidths['88'] || 500;

  return {
    unitsPerEm,
    defaultWidth,
    widthGroups,
  };
}

//

function download(name, glyphs, unitsPerEm) {
  const data = generateFontMetrics(glyphs, unitsPerEm);
  const json = JSON.stringify(data);

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.json`;
  a.click();

  URL.revokeObjectURL(url);
}

function renderGrid(glyphs) {
  const grid = document.getElementById('glyph-grid');

  glyphs.forEach(({ name, unicode, width, index }) => {
    const cell = document.createElement('div');
    cell.classList.add('glyph-cell');
    cell.setAttribute('title', name);

    const glyphEl = document.createElement('div');
    glyphEl.classList.add('glyph');
    glyphEl.textContent = String.fromCharCode(unicode);

    const indexEl = document.createElement('div');
    indexEl.classList.add('index');
    indexEl.textContent = index;

    const unicodeEl = document.createElement('div');
    unicodeEl.classList.add('unicode');
    unicodeEl.textContent = unicode || '\u00A0';

    const widthEl = document.createElement('div');
    widthEl.classList.add('width');
    widthEl.textContent = width;

    cell.appendChild(indexEl);
    cell.appendChild(glyphEl);
    cell.appendChild(unicodeEl);
    cell.appendChild(widthEl);

    grid.appendChild(cell);
  });
}

//

async function loadWAWOFF2() {
  if (!window.Module) {
    await new Promise((onRuntimeInitialized) => {
      window.Module = { onRuntimeInitialized };
    });
  }
}

function print(message) {
  const pre = document.getElementById('message');
  pre.innerHTML = message;
}

function arrayBufferToBase64(buffer) {
  const CHUNK_SIZE = 8192;
  let result = '';
  const uintArray = new Uint8Array(buffer);

  for (let i = 0; i < uintArray.length; i += CHUNK_SIZE) {
    const chunk = uintArray.subarray(i, i + CHUNK_SIZE);
    result += String.fromCharCode.apply(null, chunk);
  }

  return btoa(result);
}

function base64ToArrayBuffer(base64) {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
}
