import { describe, expect, it } from 'vitest';
import { errorText } from './error-text';

function withStack(error: Error, stack: string): Error {
  error.stack = stack;
  return error;
}

describe('errorText', () => {
  it('keeps a stack that starts with the name and message', () => {
    const error = withStack(new TypeError('no luck'), 'TypeError: no luck\n    at run (a.js:1:2)');
    expect(errorText(error)).toBe('TypeError: no luck\n    at run (a.js:1:2)');
  });

  it('puts the name and message before a stack of frames only, as Firefox and Safari write it', () => {
    const error = withStack(new RangeError('too far'), 'run@a.js:1:2\nstart@b.js:3:4');
    expect(errorText(error)).toBe('RangeError: too far\nrun@a.js:1:2\nstart@b.js:3:4');
  });

  it('gives the name and message of an error with no stack', () => {
    expect(errorText(withStack(new Error('bare'), ''))).toBe('Error: bare');
  });

  it('turns a thrown value that is no error into text', () => {
    expect(errorText('plain')).toBe('plain');
  });
});
