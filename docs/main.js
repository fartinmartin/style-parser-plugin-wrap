const ioForm = document.forms.io;
const fonts = new Set(); // should probs be a map?

ioForm.file.onchange = async ({ target }) => {
  for (const file of target.files) {
    const font = await loadFont(file);
    const metrics = getMetrics(font);
    fonts.add({ fileName: file.name, ...metrics });
  }

  render(fonts);
};

ioForm.jsx.onclick = () => downloadJSX();

const fontsForm = document.forms.fonts;

fontsForm.onchange = () => {
  const selected = fontsForm.fonts.value;
  const font = [...fonts].find((i) => i.fontName === selected);
  if (font) renderGlyphGrid(font);
};

setDisabled(true);
loadStorage();

//

async function loadFont(file) {
  const isWoff2 = file.name.endsWith('.woff2');
  if (isWoff2) await loadWAWOFF2();

  try {
    const data = await file.arrayBuffer();
    const base64String = arrayBufferToBase64(data);

    const fontMap = JSON.parse(sessionStorage.getItem('fonts') || '{}');
    fontMap[file.name] = `fontData_${file.name}`;
    sessionStorage.setItem('fonts', JSON.stringify(fontMap));
    sessionStorage.setItem(`fontData_${file.name}`, base64String);

    return isWoff2 ? Module.decompress(data) : data;
  } catch (err) {
    console.log(err);
    throw err;
  }
}

function getMetrics(font) {
  try {
    const parsed = opentype.parse(font, { lowMemory: true });
    if (!parsed) throw new Error(`error parsing font!`);

    return {
      fontName: parsed.names.postScriptName.en,
      fontFamily: parsed.names.fontFamily.en,
      fontStyle: parsed.names.fontSubfamily.en,
      unitsPerEm: parsed.unitsPerEm,
      glyphs: getGlyphs(parsed),
    };
  } catch (error) {
    setDisabled(true);
  }
}

function getGlyphs(font) {
  const glyphs = [];

  for (let index = 0; index < font.numGlyphs; index++) {
    const glyph = font.glyphs.get(index);
    if (!glyph.unicode) continue;

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

function loadStorage() {
  const fontMap = JSON.parse(sessionStorage.getItem('fonts') || '{}');

  for (const fileName in fontMap) {
    const fontKey = fontMap[fileName];
    const fontData = sessionStorage.getItem(fontKey);

    if (fontData) {
      const font = base64ToArrayBuffer(fontData);
      const metrics = getMetrics(font);
      fonts.add(metrics);
    }
  }

  render(fonts);
}

function removeFontFromStorage(fileName) {
  const fontMap = JSON.parse(sessionStorage.getItem('fonts') || '{}');
  const fontKey = fontMap[fileName];

  if (fontKey) {
    sessionStorage.removeItem(`fontData_${fileName}`);
    delete fontMap[fileName];
    sessionStorage.setItem('fonts', JSON.stringify(fontMap));
  }
}

//

function render(fonts) {
  const fontsArray = [...fonts];
  renderFontList(fontsArray);

  const selectedFont = fontsArray[0];
  if (selectedFont) {
    fontsForm.fonts.value = selectedFont.fontName;
    renderGlyphGrid(selectedFont);
  } else {
    clearGlyphGrid();
  }
}

function setDisabled(value) {
  ioForm.jsx.disabled = value;
}

function setFont({ fontName, fontFamily, fontStyle }) {
  document.documentElement.style.setProperty('--glyph-font', fontFamily);

  const combo = [fontName, fontFamily, fontStyle].join(' ').toLowerCase();
  let style = 'normal';
  if (combo.includes('italic')) style = 'italic';
  if (combo.includes('oblique')) style = 'oblique';

  document.documentElement.style.setProperty('--glyph-style', style);

  const weight = getFontWeight(combo);
  document.documentElement.style.setProperty('--glyph-weight', weight);
}

function getFontWeight(fontName) {
  // https://developer.mozilla.org/en-US/docs/Web/CSS/font-weight
  const weightMapping = {
    thin: 100,
    'extra light': 200,
    light: 300,
    normal: 400,
    regular: 400,
    medium: 500,
    'semi bold': 600,
    bold: 700,
    'extra bold': 800,
    black: 900,
    'extra black': 950,
    bolder: 'bolder',
    lighter: 'lighter',
  };

  const weightRegex =
    /\b(thin|extra[-\s]light|light|normal|regular|medium|semi[-\s]bold|bold|extra[-\s]bold|black|extra[-\s]black|bolder|lighter|\d{3})\b/i;

  const match = fontName.match(weightRegex);

  if (match) {
    const weight = match[0].toLowerCase().replace('-', ' ');
    return weightMapping[weight] || parseInt(weight, 10);
  }

  return 400;
}

//

function generateFontMetrics({ glyphs, unitsPerEm }) {
  const widthGroups = {};
  let totalWidth = 0;
  let charCount = 0;

  const sortedChars = glyphs
    .map(({ unicode, width }) => [parseInt(unicode, 10), width])
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
  const defaultWidth =
    glyphs.find((g) => g.unicode === 120)?.width ||
    glyphs.find((g) => g.unicode === 88)?.width ||
    500;

  return {
    unitsPerEm,
    defaultWidth,
    widthGroups,
  };
}

//

function getData() {
  const fontsArray = [...fonts];

  const data = fontsArray.reduce((obj, font) => {
    return { ...obj, [toPascalCase(font.fontName)]: generateFontMetrics(font) };
  }, {});

  return {
    name: fonts.size > 1 ? 'font-metrics' : fontsArray[0].fontName,
    content: JSON.stringify(data),
  };
}

function downloadJSX() {
  const { content, name } = getData();
  downloadFile(content, `${name}.jsx`, 'text/plain');
}

//

function renderFontList(fonts) {
  const list = document.getElementById('font-list');
  list.innerHTML = '';

  fonts.forEach((font, index) => {
    const fontRadio = document.createElement('input');
    fontRadio.type = 'radio';
    fontRadio.name = 'fonts';
    fontRadio.id = `font-${index}`;
    fontRadio.value = font.fontName;

    const fontLabel = document.createElement('label');
    fontLabel.htmlFor = `font-${index}`;
    fontLabel.tabIndex = 0;
    const fontSpan = document.createElement('span');
    fontSpan.textContent = font.fontName;
    fontLabel.appendChild(fontSpan);

    // Create the delete button
    const deleteButton = document.createElement('button');
    deleteButton.textContent = '×';
    deleteButton.title = 'remove';
    deleteButton.type = 'button';
    deleteButton.dataset.value = fontRadio.value;
    deleteButton.addEventListener('click', handleRemove);

    const fontItem = document.createElement('div');
    fontItem.classList.add('font-item');
    fontItem.appendChild(fontRadio);
    fontItem.appendChild(fontLabel);
    fontLabel.appendChild(deleteButton);

    list.appendChild(fontItem);
  });

  setDisabled(fonts.length === 0);
}

function renderGlyphGrid(font) {
  const grid = clearGlyphGrid();

  const glyphs = font.glyphs;
  setFont(font);

  glyphs.forEach(({ name, unicode, width, index }) => {
    const cell = document.createElement('div');
    cell.classList.add('glyph-cell');
    if (name) cell.setAttribute('title', name);

    const glyphEl = document.createElement('div');
    glyphEl.classList.add('glyph');
    const string = String.fromCharCode(unicode);

    if (/\s/.test(string)) {
      const span = document.createElement('span');
      span.classList.add('whitespace');
      span.textContent = string;
      glyphEl.innerHTML = '';
      glyphEl.appendChild(span);
    } else {
      glyphEl.textContent = string;
    }

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

function handleRemove({ target }) {
  const name = target.dataset.value;
  const font = [...fonts].find((i) => i.fontName === name);
  if (font) {
    fonts.delete(font);
    removeFontFromStorage(font.fileName);
    render(fonts);
  }
}

function clearGlyphGrid() {
  const grid = document.getElementById('glyph-grid');
  grid.innerHTML = '';
  return grid;
}

//

async function loadWAWOFF2() {
  if (!window.Module) {
    await new Promise((onRuntimeInitialized) => {
      window.Module = { onRuntimeInitialized };
    });
  }
}

function downloadFile(content, filename, type = 'application/json') {
  const blob = new Blob([content], { type });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
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

function toPascalCase(str) {
  return str.replace(/(^\w|[\s_-]\w)/g, (match) =>
    match.replace(/[\s_-]/, '').toUpperCase()
  );
}
