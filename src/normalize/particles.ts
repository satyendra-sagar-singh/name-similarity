/**
 * Nobiliary and patronymic particles.
 *
 * These bind to the token that follows them (`van der Berg`, `de la Cruz`,
 * `bin Salman`). They are kept as part of the family unit rather than deleted,
 * because dropping them turns `De Souza` and `Souza` into the same key and
 * inflates false positives on Iberian and Dutch registries.
 */
export const PARTICLES: ReadonlySet<string> = new Set([
  'de',
  'del',
  'dela',
  'della',
  'delle',
  'dello',
  'degli',
  'dei',
  'di',
  'da',
  'das',
  'dos',
  'do',
  'du',
  'des',
  'la',
  'le',
  'les',
  'lo',
  'van',
  'von',
  'vander',
  'vanden',
  'ver',
  'ten',
  'ter',
  'den',
  'der',
  'het',
  'op',
  'aan',
  'af',
  'av',
  'zu',
  'zum',
  'zur',
  'el',
  'al',
  'abu',
  'abd',
  'bin',
  'ibn',
  'bint',
  'ben',
  'bar',
  'mac',
  'mc',
  'nic',
  'ni',
  'ap',
  'san',
  'santa',
  'santos',
  'st',
  'saint',
  'sainte',
  'ste',
  'ka',
  'te',
  'oz',
]);

/**
 * Particles that are also frequent standalone given names or initials, so they
 * only bind when followed by a longer token.
 */
const WEAK_PARTICLES: ReadonlySet<string> = new Set([
  'do',
  'la',
  'le',
  'el',
  'al',
  'ben',
  'bar',
  'ni',
  'te',
  'ka',
  'oz',
  'ap',
  'st',
  'san',
]);

export function isParticle(token: string): boolean {
  return PARTICLES.has(token);
}

/**
 * Collapse particle runs into the token they qualify.
 *
 * `["van", "der", "berg"]` becomes `["van der berg"]`; a trailing particle with
 * nothing to bind to is left as its own token.
 */
export function groupParticles(tokens: string[]): string[] {
  const grouped: string[] = [];
  let buffer: string[] = [];

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;
    const next = tokens[index + 1];
    // A leading particle in a two-token name is far more likely to be the given
    // name: `Abd Kamau` is a person, not a family unit with no first name.
    const wouldConsumeGivenName = index === 0 && tokens.length === 2;
    const bindsForward =
      isParticle(token) &&
      next !== undefined &&
      !wouldConsumeGivenName &&
      (!WEAK_PARTICLES.has(token) || next.length > 2) &&
      !(buffer.length === 0 && index === tokens.length - 1);

    if (bindsForward) {
      buffer.push(token);
      continue;
    }

    if (buffer.length > 0) {
      grouped.push([...buffer, token].join(' '));
      buffer = [];
      continue;
    }
    grouped.push(token);
  }

  if (buffer.length > 0) grouped.push(buffer.join(' '));
  return grouped;
}

/** Drop particles from a family unit to obtain its head word. */
export function familyHead(family: string[]): string {
  const flat = family.flatMap((part) => part.split(' ')).filter(Boolean);
  const meaningful = flat.filter((token) => !isParticle(token));
  return (meaningful.length > 0 ? meaningful : flat).join('');
}
