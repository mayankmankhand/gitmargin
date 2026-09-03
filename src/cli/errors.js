// The one error type the CLI throws, and the exit codes it maps to.
//
// Two codes rather than one because they mean different things to whoever is
// reading: `1` is "you called it wrong", `2` is "you called it right but I
// refuse to write something broken". A script can tell those apart; a human
// reading the message does not have to.

export const EXIT_OK = 0;
export const EXIT_USAGE = 1;
export const EXIT_REFUSED = 2;

export class CliError extends Error {
  /**
   * @param {string} message  shown to the human on stderr, no stack trace
   * @param {number} code     EXIT_USAGE or EXIT_REFUSED
   * @param {string} [hint]   an optional second line saying what to do next
   */
  constructor(message, code = EXIT_USAGE, hint = '') {
    super(message);
    this.name = 'CliError';
    this.code = code;
    this.hint = hint;
  }
}

/**
 * Replace exactly one match, and throw when there was nothing to replace.
 *
 * Every insertion `attach` makes goes through this. A plain `String.replace`
 * that matches nothing returns the string unchanged and reports no error, so a
 * file would be written that silently lacks its stamp or its overlay and only
 * fails later, in a reviewer's browser, where nobody can debug it.
 *
 * This is deliberately NOT used for the strip operations: a clean prototype has
 * no previous stamp to remove, so "matched nothing" is the normal case there.
 */
export function replaceOnce(source, pattern, replacement, what) {
  if (!pattern.test(source)) {
    throw new CliError(`Could not ${what}.`, EXIT_REFUSED);
  }
  // Reset a global/sticky regex: `test` advances lastIndex and would make the
  // following replace start from the wrong offset.
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}
