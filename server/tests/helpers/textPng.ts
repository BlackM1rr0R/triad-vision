import { encodePng } from '../../src/lib/driveIntel/ocr.js';

/** 5×7 bitmap glyphs (rows top → bottom, '#' = ink) for test images with readable text. */
const GLYPHS: Record<string, string[]> = {
  A: [' ### ', '#   #', '#   #', '#####', '#   #', '#   #', '#   #'],
  C: [' ####', '#    ', '#    ', '#    ', '#    ', '#    ', ' ####'],
  D: ['#### ', '#   #', '#   #', '#   #', '#   #', '#   #', '#### '],
  E: ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#####'],
  H: ['#   #', '#   #', '#   #', '#####', '#   #', '#   #', '#   #'],
  I: ['#####', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '#####'],
  L: ['#    ', '#    ', '#    ', '#    ', '#    ', '#    ', '#####'],
  N: ['#   #', '##  #', '# # #', '#  ##', '#   #', '#   #', '#   #'],
  O: [' ### ', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '],
  R: ['#### ', '#   #', '#   #', '#### ', '# #  ', '#  # ', '#   #'],
  S: [' ####', '#    ', '#    ', ' ### ', '    #', '    #', '#### '],
  T: ['#####', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '  #  '],
  V: ['#   #', '#   #', '#   #', '#   #', '#   #', ' # # ', '  #  '],
  W: ['#   #', '#   #', '#   #', '# # #', '# # #', '## ##', '#   #'],
  ' ': ['     ', '     ', '     ', '     ', '     ', '     ', '     '],
};

/** A grey PNG with `text` (letters of GLYPHS only) drawn black on white, `scale` pixels per dot. */
export const textPng = (text: string, scale = 8) => {
  const chars = [...text.toUpperCase()];
  const pad = 4 * scale;
  const cw = 6 * scale;
  const width = pad * 2 + chars.length * cw;
  const height = pad * 2 + 7 * scale;
  const px = Buffer.alloc(width * height, 255);
  chars.forEach((ch, ci) => {
    const g = GLYPHS[ch] ?? GLYPHS[' '];
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 5; c++) {
        if (g[r][c] !== '#') continue;
        for (let y = 0; y < scale; y++)
          for (let x = 0; x < scale; x++) px[(pad + r * scale + y) * width + pad + ci * cw + c * scale + x] = 0;
      }
  });
  return { png: encodePng(px, width, height, 1), pixels: px, width, height };
};
