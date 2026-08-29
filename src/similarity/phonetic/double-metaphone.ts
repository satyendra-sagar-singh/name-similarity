/**
 * Double Metaphone (Lawrence Philips, 2000).
 *
 * Emits a primary and an optional secondary code, which is what makes it worth
 * the complexity for names: `Schmidt` produces both the Germanic and the
 * anglicised reading, so it can match `Schmitt` and `Smith` without either
 * pairing being hard-coded.
 *
 * Codes are generated at full length; {@link doubleMetaphone} truncates to the
 * classic four characters. Full-length codes are used internally because a
 * four-character key collapses `Rodriguez` and `Rodrigo` onto each other.
 */

export type MetaphoneCodes = readonly [primary: string, secondary: string];

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U', 'Y']);

export function doubleMetaphoneFull(input: string): MetaphoneCodes {
  const word = input.toUpperCase().replace(/[^A-Z]/g, '');
  if (word.length === 0) return ['', ''];

  const length = word.length;
  const last = length - 1;
  const slavoGermanic = /W|K|CZ|WITZ/.test(word);

  let primary = '';
  let secondary = '';
  let current = 0;

  const at = (index: number): string =>
    index >= 0 && index < length ? word[index]! : '';

  const stringAt = (start: number, size: number, ...values: string[]): boolean => {
    if (start < 0 || start >= length) return false;
    const slice = word.slice(start, start + size);
    return values.includes(slice);
  };

  const add = (primaryCode: string, secondaryCode?: string): void => {
    primary += primaryCode;
    secondary += secondaryCode ?? primaryCode;
  };

  const isVowel = (index: number): boolean => VOWELS.has(at(index));

  // Silent initial clusters.
  if (stringAt(0, 2, 'GN', 'KN', 'PN', 'WR', 'PS')) current = 1;
  if (at(0) === 'X') {
    add('S');
    current = 1;
  }

  while (current < length) {
    switch (at(current)) {
      case 'A':
      case 'E':
      case 'I':
      case 'O':
      case 'U':
      case 'Y':
        if (current === 0) add('A');
        current++;
        break;

      case 'B':
        add('P');
        current += at(current + 1) === 'B' ? 2 : 1;
        break;

      case 'C':
        current = handleC();
        break;

      case 'D':
        if (stringAt(current, 2, 'DG')) {
          if (stringAt(current + 2, 1, 'I', 'E', 'Y')) {
            add('J');
            current += 3;
          } else {
            add('TK');
            current += 2;
          }
          break;
        }
        if (stringAt(current, 2, 'DT', 'DD')) {
          add('T');
          current += 2;
          break;
        }
        add('T');
        current++;
        break;

      case 'F':
        add('F');
        current += at(current + 1) === 'F' ? 2 : 1;
        break;

      case 'G':
        current = handleG();
        break;

      case 'H':
        // Retained only when it starts a syllable.
        if ((current === 0 || isVowel(current - 1)) && isVowel(current + 1)) {
          add('H');
          current += 2;
        } else {
          current++;
        }
        break;

      case 'J':
        current = handleJ();
        break;

      case 'K':
        add('K');
        current += at(current + 1) === 'K' ? 2 : 1;
        break;

      case 'L':
        if (at(current + 1) === 'L') {
          // Spanish `-illo`, `-illa`, `-alle` endings often lose the L sound.
          const spanishEnding =
            (current === length - 3 && stringAt(current - 1, 4, 'ILLO', 'ILLA', 'ALLE')) ||
            ((stringAt(last - 1, 2, 'AS', 'OS') || stringAt(last, 1, 'A', 'O')) &&
              stringAt(current - 1, 4, 'ALLE'));
          if (spanishEnding) {
            add('L', '');
            current += 2;
            break;
          }
          current += 2;
        } else {
          current++;
        }
        add('L');
        break;

      case 'M':
        if (
          (stringAt(current - 1, 3, 'UMB') &&
            (current + 1 === last || stringAt(current + 2, 2, 'ER'))) ||
          at(current + 1) === 'M'
        ) {
          current += 2;
        } else {
          current++;
        }
        add('M');
        break;

      case 'N':
        add('N');
        current += at(current + 1) === 'N' ? 2 : 1;
        break;

      case 'P':
        if (at(current + 1) === 'H') {
          add('F');
          current += 2;
          break;
        }
        add('P');
        current += stringAt(current + 1, 1, 'P', 'B') ? 2 : 1;
        break;

      case 'Q':
        add('K');
        current += at(current + 1) === 'Q' ? 2 : 1;
        break;

      case 'R':
        // French `-ier` endings drop the R in the primary reading.
        if (
          current === last &&
          !slavoGermanic &&
          stringAt(current - 2, 2, 'IE') &&
          !stringAt(current - 4, 2, 'ME', 'MA')
        ) {
          add('', 'R');
        } else {
          add('R');
        }
        current += at(current + 1) === 'R' ? 2 : 1;
        break;

      case 'S':
        current = handleS();
        break;

      case 'T':
        current = handleT();
        break;

      case 'V':
        add('F');
        current += at(current + 1) === 'V' ? 2 : 1;
        break;

      case 'W':
        current = handleW();
        break;

      case 'X':
        // French `-eaux` endings are silent.
        if (
          !(
            current === last &&
            (stringAt(current - 3, 3, 'IAU', 'EAU') || stringAt(current - 2, 2, 'AU', 'OU'))
          )
        ) {
          add('KS');
        }
        current += stringAt(current + 1, 1, 'C', 'X') ? 2 : 1;
        break;

      case 'Z':
        if (at(current + 1) === 'H') {
          add('J'); // pinyin `zhao`
          current += 2;
          break;
        }
        if (
          stringAt(current + 1, 2, 'ZO', 'ZI', 'ZA') ||
          (slavoGermanic && current > 0 && at(current - 1) !== 'T')
        ) {
          add('S', 'TS');
        } else {
          add('S');
        }
        current += at(current + 1) === 'Z' ? 2 : 1;
        break;

      default:
        current++;
        break;
    }
  }

  return [primary, secondary];

  /* ------------------------------ sub-handlers ----------------------------- */

  function handleC(): number {
    // Germanic `-ach-` as in `Bach`, but not `Michael`.
    if (
      current > 1 &&
      !isVowel(current - 2) &&
      stringAt(current - 1, 3, 'ACH') &&
      at(current + 2) !== 'I' &&
      (at(current + 2) !== 'E' || stringAt(current - 2, 6, 'BACHER', 'MACHER'))
    ) {
      add('K');
      return current + 2;
    }

    if (current === 0 && stringAt(current, 6, 'CAESAR')) {
      add('S');
      return current + 2;
    }

    if (stringAt(current, 4, 'CHIA')) {
      add('K'); // Italian `chianti`
      return current + 2;
    }

    if (stringAt(current, 2, 'CH')) {
      if (current > 0 && stringAt(current, 4, 'CHAE')) {
        add('K', 'X');
        return current + 2;
      }
      // Greek roots: `chemistry`, `chorus`.
      if (
        current === 0 &&
        (stringAt(current + 1, 5, 'HARAC', 'HARIS') ||
          stringAt(current + 1, 3, 'HOR', 'HYM', 'HIA', 'HEM')) &&
        !stringAt(0, 5, 'CHORE')
      ) {
        add('K');
        return current + 2;
      }
      const germanic =
        stringAt(0, 3, 'VAN', 'VON') ||
        stringAt(0, 3, 'SCH') ||
        stringAt(current - 2, 6, 'ORCHES', 'ARCHIT', 'ORCHID') ||
        stringAt(current + 2, 1, 'T', 'S') ||
        ((stringAt(current - 1, 1, 'A', 'O', 'U', 'E') || current === 0) &&
          stringAt(current + 2, 1, 'L', 'R', 'N', 'M', 'B', 'H', 'F', 'V', 'W', ' '));

      if (germanic) add('K');
      else if (current > 0) {
        if (stringAt(0, 2, 'MC')) add('K');
        else add('X', 'K');
      } else add('X');

      return current + 2;
    }

    if (stringAt(current, 2, 'CZ') && !stringAt(current - 2, 4, 'WICZ')) {
      add('S', 'X');
      return current + 2;
    }

    if (stringAt(current + 1, 3, 'CIA')) {
      add('X'); // `focaccia`
      return current + 3;
    }

    if (stringAt(current, 2, 'CC') && !(current === 1 && at(0) === 'M')) {
      if (stringAt(current + 2, 1, 'I', 'E', 'H') && !stringAt(current + 2, 2, 'HU')) {
        if (
          (current === 1 && at(current - 1) === 'A') ||
          stringAt(current - 1, 5, 'UCCEE', 'UCCES')
        ) {
          add('KS');
        } else {
          add('X');
        }
        return current + 3;
      }
      add('K');
      return current + 2;
    }

    if (stringAt(current, 2, 'CK', 'CG', 'CQ')) {
      add('K');
      return current + 2;
    }

    if (stringAt(current, 2, 'CI', 'CE', 'CY')) {
      if (stringAt(current, 3, 'CIO', 'CIE', 'CIA')) add('S', 'X');
      else add('S');
      return current + 2;
    }

    add('K');
    if (stringAt(current + 1, 1, 'C', 'K', 'Q') && !stringAt(current + 1, 2, 'CE', 'CI')) {
      return current + 2;
    }
    return current + 1;
  }

  function handleG(): number {
    if (at(current + 1) === 'H') {
      if (current > 0 && !isVowel(current - 1)) {
        add('K');
        return current + 2;
      }
      if (current === 0) {
        if (at(current + 2) === 'I') add('J');
        else add('K');
        return current + 2;
      }
      // Silent `gh` in `laugh`, `Gough`, `McLaughlin`.
      const silent =
        (current > 1 && stringAt(current - 2, 1, 'B', 'H', 'D')) ||
        (current > 2 && stringAt(current - 3, 1, 'B', 'H', 'D')) ||
        (current > 3 && stringAt(current - 4, 1, 'B', 'H'));
      if (silent) return current + 2;

      if (current > 2 && at(current - 1) === 'U' && stringAt(current - 3, 1, 'C', 'G', 'L', 'R', 'T')) {
        add('F');
        return current + 2;
      }
      if (current > 0 && at(current - 1) !== 'I') add('K');
      return current + 2;
    }

    if (at(current + 1) === 'N') {
      if (current === 1 && isVowel(0) && !slavoGermanic) add('KN', 'N');
      else if (!stringAt(current + 2, 2, 'EY') && at(current + 1) !== 'Y' && !slavoGermanic) {
        add('N', 'KN');
      } else add('KN');
      return current + 2;
    }

    if (stringAt(current + 1, 2, 'LI') && !slavoGermanic) {
      add('KL', 'L'); // `tagliaro`
      return current + 2;
    }

    if (
      current === 0 &&
      (at(current + 1) === 'Y' ||
        stringAt(current + 1, 2, 'ES', 'EP', 'EB', 'EL', 'EY', 'IB', 'IL', 'IN', 'IE', 'EI', 'ER'))
    ) {
      add('K', 'J');
      return current + 2;
    }

    if (
      (stringAt(current + 1, 2, 'ER') || at(current + 1) === 'Y') &&
      !stringAt(0, 6, 'DANGER', 'RANGER', 'MANGER') &&
      !stringAt(current - 1, 1, 'E', 'I') &&
      !stringAt(current - 1, 3, 'RGY', 'OGY')
    ) {
      add('K', 'J');
      return current + 2;
    }

    if (stringAt(current + 1, 1, 'E', 'I', 'Y') || stringAt(current - 1, 4, 'AGGI', 'OGGI')) {
      if (stringAt(0, 3, 'VAN', 'VON') || stringAt(0, 3, 'SCH') || stringAt(current + 1, 2, 'ET')) {
        add('K');
      } else if (stringAt(current + 1, 3, 'IER')) {
        add('J');
      } else {
        add('J', 'K');
      }
      return current + 2;
    }

    add('K');
    return current + (at(current + 1) === 'G' ? 2 : 1);
  }

  function handleJ(): number {
    // The reference rule keys off `San Jose` as two words; after tokenisation
    // only the standalone `Jose` reading survives.
    if (stringAt(current, 4, 'JOSE')) {
      if (current === 0 && length === 4) add('H');
      else add('J', 'H');
      return current + 1;
    }

    if (current === 0) {
      add('J', 'A');
    } else if (isVowel(current - 1) && !slavoGermanic && (at(current + 1) === 'A' || at(current + 1) === 'O')) {
      add('J', 'H');
    } else if (current === last) {
      add('J', '');
    } else if (
      !stringAt(current + 1, 1, 'L', 'T', 'K', 'S', 'N', 'M', 'B', 'Z') &&
      !stringAt(current - 1, 1, 'S', 'K', 'L')
    ) {
      add('J');
    }

    return current + (at(current + 1) === 'J' ? 2 : 1);
  }

  function handleS(): number {
    // Silent S in `island`, `Carlisle`.
    if (stringAt(current - 1, 3, 'ISL', 'YSL')) return current + 1;

    if (current === 0 && stringAt(current, 5, 'SUGAR')) {
      add('X', 'S');
      return current + 1;
    }

    if (stringAt(current, 2, 'SH')) {
      if (stringAt(current + 1, 4, 'HEIM', 'HOEK', 'HOLM', 'HOLZ')) add('S');
      else add('X');
      return current + 2;
    }

    if (stringAt(current, 3, 'SIO', 'SIA') || stringAt(current, 4, 'SIAN')) {
      if (!slavoGermanic) add('S', 'X');
      else add('S');
      return current + 3;
    }

    // The rule that lets `Smith` reach `Schmidt`.
    if ((current === 0 && stringAt(current + 1, 1, 'M', 'N', 'L', 'W')) || stringAt(current + 1, 1, 'Z')) {
      add('S', 'X');
      return current + (stringAt(current + 1, 1, 'Z') ? 2 : 1);
    }

    if (stringAt(current, 2, 'SC')) {
      if (at(current + 2) === 'H') {
        if (stringAt(current + 3, 2, 'OO', 'ER', 'EN', 'UY', 'ED', 'EM')) {
          if (stringAt(current + 3, 2, 'ER', 'EN')) add('X', 'SK');
          else add('SK');
          return current + 3;
        }
        if (current === 0 && !isVowel(3) && at(3) !== 'W') add('X', 'S');
        else add('X');
        return current + 3;
      }
      if (stringAt(current + 2, 1, 'I', 'E', 'Y')) {
        add('S');
        return current + 3;
      }
      add('SK');
      return current + 3;
    }

    if (current === last && stringAt(current - 2, 2, 'AI', 'OI')) add('', 'S');
    else add('S');

    return current + (stringAt(current + 1, 1, 'S', 'Z') ? 2 : 1);
  }

  function handleT(): number {
    if (stringAt(current, 4, 'TION')) {
      add('X');
      return current + 3;
    }
    if (stringAt(current, 3, 'TIA', 'TCH')) {
      add('X');
      return current + 3;
    }
    if (stringAt(current, 2, 'TH') || stringAt(current, 3, 'TTH')) {
      if (stringAt(current + 2, 2, 'OM', 'AM') || stringAt(0, 3, 'VAN', 'VON') || stringAt(0, 3, 'SCH')) {
        add('T');
      } else {
        add('0', 'T');
      }
      return current + 2;
    }
    add('T');
    return current + (stringAt(current + 1, 1, 'T', 'D') ? 2 : 1);
  }

  function handleW(): number {
    if (stringAt(current, 2, 'WR')) {
      add('R');
      return current + 2;
    }
    if (current === 0 && (isVowel(current + 1) || stringAt(current, 2, 'WH'))) {
      if (isVowel(current + 1)) add('A', 'F');
      else add('A');
    }
    // `Arnow` should reach `Arnoff`.
    if (
      (current === last && isVowel(current - 1)) ||
      stringAt(current - 1, 5, 'EWSKI', 'EWSKY', 'OWSKI', 'OWSKY') ||
      stringAt(0, 3, 'SCH')
    ) {
      add('', 'F');
      return current + 1;
    }
    if (stringAt(current, 4, 'WICZ', 'WITZ')) {
      add('TS', 'FX');
      return current + 4;
    }
    return current + 1;
  }
}

/** Classic four-character Double Metaphone codes. */
export function doubleMetaphone(input: string, maxLength = 4): MetaphoneCodes {
  const [primary, secondary] = doubleMetaphoneFull(input);
  if (!Number.isFinite(maxLength)) return [primary, secondary];
  return [primary.slice(0, maxLength), secondary.slice(0, maxLength)];
}

/** True when any primary/secondary pairing agrees. */
export function metaphoneCodesMatch(left: MetaphoneCodes, right: MetaphoneCodes): boolean {
  const [leftPrimary, leftSecondary] = left;
  const [rightPrimary, rightSecondary] = right;
  if (leftPrimary.length === 0 || rightPrimary.length === 0) return false;
  return (
    leftPrimary === rightPrimary ||
    leftPrimary === rightSecondary ||
    leftSecondary === rightPrimary ||
    (leftSecondary.length > 0 && leftSecondary === rightSecondary)
  );
}
