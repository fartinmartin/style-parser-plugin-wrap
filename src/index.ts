import { Styles, Plugin } from 'style-parser/src/types';

function normalizeText(string: string) {
  // all line breaks from PPRO (mac and win) come in as \r
  // one exception: mac users can enter `Line Separator` chars with `Cntrl + Enter`
  // we will convert ALL of these to "\r" chars (TODO: is that a good idea?? need to think about paragraph spacing etc... if PPRO only allows \r, then we need \r to represent \n and \r\r to be \r, right?)
  // if a \r line break occurs in a bullet, we should replace with \n
  // a bullet is defined as a line that starts with "• ", and ends with either:
  // - a next line that starts with "• "
  // - two returns: /r/r
  // - the end of the entire string
  const bulletGroupRegExp = /(?:^• (.|\r)*?)(?=(^•|\r\r|$(?!\r)))/gm;
  return (
    string
      .replace(/^[*\-] /gm, '• ')
      // convert `End Of Text` & `Line Separator` chars to "\r"
      .replace(/[\u0003\u2028]/, '\r')
      // convert "\r" characters that are within a bullet point to "\n"
      .replace(bulletGroupRegExp, (match) => match.replace(/\r(?!$)/g, '\n'))
  );
}

interface WrapOptions {
  maxWidth: number;
  indent: string;
  styles: Styles;
  fontMetrics: Record<string, FontMetrics>;
}

interface FontMetrics {
  unitsPerEm: number;
  defaultWidth: number;
  widthGroups: Record<number, Array<[number, number]>>;
}

interface FontStyles {
  font: string;
  fontSize: number;
}

function wrap({
  maxWidth,
  indent,
  styles: defaultStyles,
  fontMetrics,
}: WrapOptions): Plugin {
  const getRawCharWidth = (
    char: string,
    { widthGroups, defaultWidth }: FontMetrics
  ) => {
    const charCode = char.charCodeAt(0);

    for (const [width, ranges] of Object.entries(widthGroups)) {
      let left = 0;
      let right = ranges.length - 1;

      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const [start, end] = ranges[mid]!;
        if (start === undefined || end === undefined) {
          left = mid + 1;
        } else if (charCode >= start && charCode <= end) {
          return parseInt(width);
        } else if (charCode < start) {
          right = mid - 1;
        } else {
          left = mid + 1;
        }
      }
    }

    return defaultWidth;
  };

  const scale = (value: number, fontSize: number, emSize: number) => {
    return (value / emSize) * fontSize;
  };

  const getCharWidth = (char: string, fontStyles: FontStyles) => {
    const valid = Object.keys(fontMetrics).includes(fontStyles.font);
    if (!valid) throw `${fontStyles.font} is not supported!`;
    const font = fontMetrics[fontStyles.font];
    const charWidth = getRawCharWidth(char, font);
    return scale(charWidth, fontStyles.fontSize, font.unitsPerEm);
  };

  const getStringWidth = (string: string, fontStyles: FontStyles) => {
    return string
      .split('')
      .reduce((width, char) => width + getCharWidth(char, fontStyles), 0);
  };

  return {
    name: 'wrap',
    transform: (parsed, { updateTransforms, getStylesAtIndex }) => {
      const INDENT_STRING = indent;

      let wrappedText = '';
      let currentLineWidth = 0;
      let lastBreakIndex = 0;
      let indentString = '';
      let transforms = parsed.transforms;
      let currentWordLength = 0;

      const applyWrap = (breakIndex: number, breakChar: string) => {
        wrappedText += parsed.text.substring(lastBreakIndex, breakIndex);
        wrappedText += breakChar;
        if (breakChar === '\n' && indentString) {
          wrappedText += indentString;
          transforms = updateTransforms(
            transforms,
            breakIndex + 1,
            indentString.length
          );

          const styles = getStylesAtIndex(parsed, breakIndex, defaultStyles);
          const INDENT_WIDTH = getStringWidth(INDENT_STRING, {
            font: styles.font!,
            fontSize: styles.fontSize!,
          });

          currentLineWidth = INDENT_WIDTH + currentWordLength;
        } else {
          currentLineWidth = 0;
        }
        lastBreakIndex = breakIndex + 1;
      };

      for (let i = 0; i < parsed.text.length; i++) {
        const char = parsed.text[i]!;

        if (char === '•') {
          indentString = INDENT_STRING;
        } else if (char === '\r') {
          indentString = '';
        }

        // @ts-ignore
        if (/[\r\n\3]/.test(char)) {
          applyWrap(i, char);
          currentWordLength = 0;
          continue;
        }

        const charStyles = getStylesAtIndex(parsed, i, defaultStyles);
        const charWidth = getCharWidth(char, {
          font: charStyles.font!,
          fontSize: charStyles.fontSize!,
        });

        if (char === ' ') {
          currentWordLength = 0;
        } else {
          currentWordLength += charWidth;
        }

        if (currentLineWidth + charWidth > maxWidth) {
          const lastSpaceIndex = parsed.text.lastIndexOf(' ', i);
          applyWrap(lastSpaceIndex, '\n');
        } else {
          currentLineWidth += charWidth;
        }
      }

      wrappedText += parsed.text.substring(lastBreakIndex);

      return { text: wrappedText, transforms: transforms };
    },
  };
}

const version: string = '_npmVersion';

export { version, normalizeText, wrap };
