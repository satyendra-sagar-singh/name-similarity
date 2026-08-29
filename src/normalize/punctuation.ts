/**
 * Punctuation handling for names.
 *
 * Three classes matter and each behaves differently:
 *
 * - separators (`-`, `’`, `.`)  -> become spaces, because `Mary-Jane` and
 *   `Mary Jane` are the same person and `A.K.` is two initials.
 * - joiners (`_`, `+`)          -> become spaces as well but never signal a
 *   compound family name.
 * - noise (`()[]"#*`)           -> removed outright.
 */

const APOSTROPHES = /[‘’ʼʻ՚′'`´]/g;
const HYPHENS = /[‐-―−­－-]/g;
const NOISE = /["()[\]{}<>;:!?*#@^~|\\/+=_$%& …]/g;
const DOTS = /[.·‧]/g;
const COMMAS = /[,،、]/g;
const WHITESPACE = /\s+/g;

/** `S/O`, `D/O`, `W/O`, `C/O` and everything following them. */
const RELATIONSHIP_MARKER = /[\s,]+[sdwc]\s*[/.]\s*o\b[\s\S]*$/i;

export interface PunctuationOptions {
  splitHyphens: boolean;
  splitApostrophes: boolean;
}

export interface PunctuationResult {
  text: string;
  /** True when the input used the `Family, Given` convention. */
  commaInverted: boolean;
  hadHyphen: boolean;
  hadApostrophe: boolean;
  hadPeriod: boolean;
}

/**
 * Normalise punctuation and detect the comma-inverted form.
 *
 * A comma only means inversion when it separates two non-empty chunks and the
 * trailing chunk is not a bare suffix (`Smith, Jr.` is not inverted).
 */
export function normalizePunctuation(
  input: string,
  options: PunctuationOptions,
  isSuffixToken: (token: string) => boolean,
): PunctuationResult {
  const hadHyphen = HYPHENS.test(input);
  HYPHENS.lastIndex = 0;
  const hadApostrophe = APOSTROPHES.test(input);
  APOSTROPHES.lastIndex = 0;
  const hadPeriod = /\./.test(input);

  // Relationship markers introduce somebody else's name. In South Asian records
  // `Rajesh Kumar S/O Suresh` is Rajesh Kumar, son of Suresh — comparing the
  // father's name against the subject's is simply wrong.
  let text = input.replace(RELATIONSHIP_MARKER, ' ');

  // Parenthetical annotations are record-keeping, not name parts:
  // `John Smith (deceased)` and `John Smith` are the same person.
  text = text.replace(/[([{][^)\]}]*[)\]}]/g, ' ');
  text = text.replace(NOISE, ' ');
  text = text.replace(APOSTROPHES, options.splitApostrophes ? ' ' : '');
  text = text.replace(HYPHENS, options.splitHyphens ? ' ' : '');
  text = text.replace(DOTS, ' ');

  const commaParts = text
    .split(COMMAS)
    .map((part) => part.replace(WHITESPACE, ' ').trim())
    .filter((part) => part.length > 0);

  let commaInverted = false;
  if (commaParts.length >= 2) {
    const tail = commaParts.slice(1).join(' ');
    const tailTokens = tail.split(' ').filter(Boolean);
    const tailIsOnlySuffixes = tailTokens.length > 0 && tailTokens.every(isSuffixToken);
    if (!tailIsOnlySuffixes) {
      commaInverted = true;
      // `Smith, John Michael` reads as `John Michael Smith`.
      text = `${tail} ${commaParts[0]}`;
    } else {
      text = commaParts.join(' ');
    }
  } else {
    text = commaParts.join(' ');
  }

  text = text.replace(COMMAS, ' ').replace(WHITESPACE, ' ').trim();
  return { text, commaInverted, hadHyphen, hadApostrophe, hadPeriod };
}

export function collapseWhitespace(input: string): string {
  return input.replace(WHITESPACE, ' ').trim();
}
