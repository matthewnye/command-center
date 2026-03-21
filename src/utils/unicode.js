// ── Unicode Text Transforms for LinkedIn Posts ──

const CHAR_MAPS = {
  bold: Object.fromEntries([
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('').map((c, i) => {
      if (i < 26) return [c, String.fromCodePoint(0x1D400 + i)];
      if (i < 52) return [c, String.fromCodePoint(0x1D41A + (i - 26))];
      return [c, String.fromCodePoint(0x1D7CE + (i - 52))];
    })
  ]),
  italic: Object.fromEntries([
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('').map((c, i) => {
      if (i < 26) return [c, String.fromCodePoint(0x1D434 + i)];
      return [c, String.fromCodePoint(0x1D44E + (i - 26))];
    })
  ]),
  boldItalic: Object.fromEntries([
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('').map((c, i) => {
      if (i < 26) return [c, String.fromCodePoint(0x1D468 + i)];
      return [c, String.fromCodePoint(0x1D482 + (i - 26))];
    })
  ]),
  script: Object.fromEntries([
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('').map((c, i) => {
      if (i < 26) return [c, String.fromCodePoint(0x1D49C + i)];
      return [c, String.fromCodePoint(0x1D4B6 + (i - 26))];
    })
  ]),
  boldScript: Object.fromEntries([
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('').map((c, i) => {
      if (i < 26) return [c, String.fromCodePoint(0x1D4D0 + i)];
      return [c, String.fromCodePoint(0x1D4EA + (i - 26))];
    })
  ]),
  fraktur: Object.fromEntries([
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('').map((c, i) => {
      if (i < 26) return [c, String.fromCodePoint(0x1D504 + i)];
      return [c, String.fromCodePoint(0x1D51E + (i - 26))];
    })
  ]),
  monospace: Object.fromEntries([
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('').map((c, i) => {
      if (i < 26) return [c, String.fromCodePoint(0x1D670 + i)];
      if (i < 52) return [c, String.fromCodePoint(0x1D68A + (i - 26))];
      return [c, String.fromCodePoint(0x1D7F6 + (i - 52))];
    })
  ]),
  doubleStruck: Object.fromEntries([
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('').map((c, i) => {
      if (i < 26) return [c, String.fromCodePoint(0x1D538 + i)];
      if (i < 52) return [c, String.fromCodePoint(0x1D552 + (i - 26))];
      return [c, String.fromCodePoint(0x1D7D8 + (i - 52))];
    })
  ]),
  circled: Object.fromEntries([
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('').map((c, i) => {
      if (i < 26) return [c, String.fromCodePoint(0x24B6 + i)];
      return [c, String.fromCodePoint(0x24D0 + (i - 26))];
    })
  ]),
  squared: Object.fromEntries([
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c, i) => [c, String.fromCodePoint(0x1F130 + i)])
  ]),
  sansSerif: Object.fromEntries([
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('').map((c, i) => {
      if (i < 26) return [c, String.fromCodePoint(0x1D5A0 + i)];
      if (i < 52) return [c, String.fromCodePoint(0x1D5BA + (i - 26))];
      return [c, String.fromCodePoint(0x1D7E2 + (i - 52))];
    })
  ]),
  sansSerifBold: Object.fromEntries([
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('').map((c, i) => {
      if (i < 26) return [c, String.fromCodePoint(0x1D5D4 + i)];
      if (i < 52) return [c, String.fromCodePoint(0x1D5EE + (i - 26))];
      return [c, String.fromCodePoint(0x1D7EC + (i - 52))];
    })
  ]),
};

// Fix known Unicode exceptions
const FIXES = {
  script: { B: '\u212C', E: '\u2130', F: '\u2131', H: '\u210B', I: '\u2110', L: '\u2112', M: '\u2133', R: '\u211B', e: '\u212F', g: '\u210A', o: '\u2134' },
  fraktur: { C: '\u212D', H: '\u210C', I: '\u2111', R: '\u211C', Z: '\u2128' },
  doubleStruck: { C: '\u2102', H: '\u210D', N: '\u2115', P: '\u2119', Q: '\u211A', R: '\u211D', Z: '\u2124' },
};

for (const [style, fixes] of Object.entries(FIXES)) {
  if (CHAR_MAPS[style]) Object.assign(CHAR_MAPS[style], fixes);
}

export function transformText(text, style) {
  const map = CHAR_MAPS[style];
  if (!map) return text;
  return text.split('').map(c => map[c] || c).join('');
}

export const STYLE_NAMES = {
  bold: '𝐁𝐨𝐥𝐝',
  italic: '𝐼𝑡𝑎𝑙𝑖𝑐',
  boldItalic: '𝑩𝒐𝒍𝒅 𝑰𝒕',
  script: '𝒮𝒸𝓇𝒾𝓅𝓉',
  boldScript: '𝓑𝓸𝓵𝓭 𝓢',
  fraktur: '𝔉𝔯𝔞𝔨𝔱𝔲𝔯',
  monospace: '𝙼𝚘𝚗𝚘',
  doubleStruck: '𝔻𝕠𝕦𝕓𝕝𝕖',
  circled: 'Ⓒⓘⓡⓒⓛⓔ',
  sansSerif: '𝖲𝖺𝗇𝗌',
  sansSerifBold: '𝗦𝗮𝗻𝘀 𝗕',
  squared: '🅂🅀🅄🄰🅁🄴',
};

export const STYLE_KEYS = Object.keys(STYLE_NAMES);
