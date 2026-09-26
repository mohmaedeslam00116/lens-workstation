import { createHash } from 'node:crypto';

/**
 * Compute the SHA-256 hexadecimal digest of a string or Buffer.
 *
 * @param {string | Buffer} content
 * @returns {string} Hexadecimal SHA-256 digest
 */
export function computeSha256(content) {
  if (content === null || content === undefined) {
    return '';
  }
  return createHash('sha256').update(content).digest('hex');
}
