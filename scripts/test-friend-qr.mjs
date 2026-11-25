import assert from 'node:assert/strict';

import {
  buildFriendQrPayload,
  buildFriendShareMessage,
  generateQrMatrix,
  normalizeFriendCode,
  parseFriendCodeFromScan,
} from '../src/lib/qr.ts';

// 1. Normalization & payload formatting
assert.equal(normalizeFriendCode(' am4-gau '), 'AM4GAU');
assert.equal(buildFriendQrPayload('am4gau'), 'learnshift://friends?code=AM4GAU');
assert.ok(buildFriendShareMessage('AM4GAU', 'Mika').includes('AM4GAU'));
assert.ok(buildFriendShareMessage('AM4GAU', 'Mika').includes('learnshift://friends?code=AM4GAU'));

// 2. Round-trip scan parsing across supported formats
assert.equal(parseFriendCodeFromScan('learnshift://friends?code=AM4GAU'), 'AM4GAU');
assert.equal(parseFriendCodeFromScan('learnshift://friends?code=am4gau'), 'AM4GAU');
assert.equal(parseFriendCodeFromScan('LEARNSHIFT://friends?friendCode=XY789Z'), 'XY789Z');
assert.equal(parseFriendCodeFromScan('learnshift://friends/ABC234'), 'ABC234');
assert.equal(parseFriendCodeFromScan('https://learnshift.expo.app/friends?code=K9P2MN'), 'K9P2MN');
assert.equal(parseFriendCodeFromScan('LS:AM4GAU'), 'AM4GAU');
assert.equal(parseFriendCodeFromScan('LEARNSHIFT: AM4-GAU'), 'AM4GAU');
assert.equal(parseFriendCodeFromScan('AM4GAU'), 'AM4GAU');
assert.equal(parseFriendCodeFromScan('AM4 GAU'), 'AM4GAU');
assert.equal(parseFriendCodeFromScan('am4-gau'), 'AM4GAU');

// 3. Rejects unrelated URLs and malformed payloads
assert.equal(parseFriendCodeFromScan('https://youtube.com/watch?v=dQw4w9WgXcQ'), null);
assert.equal(parseFriendCodeFromScan('https://evil.example.com/friends?code=AM4GAU'), null);
assert.equal(parseFriendCodeFromScan('hello world'), null);
assert.equal(parseFriendCodeFromScan('123'), null);
assert.equal(parseFriendCodeFromScan(''), null);

// 4. Generates valid ISO/IEC 18004 ECC-H matrix with 3 finder patterns
const payload = buildFriendQrPayload('AM4GAU');
const matrix = generateQrMatrix(payload);
assert.ok(matrix.size >= 29 && matrix.size <= 37, `expected compact QR size, got ${matrix.size}`);
assert.equal(matrix.cells.length, matrix.size * matrix.size);
// Verify top-left 7x7 finder outer border & center 3x3 eye are dark
assert.equal(matrix.cells[0], true, 'top-left finder corner must be dark');
assert.equal(matrix.cells[3 * matrix.size + 3], true, 'top-left finder eye center must be dark');
assert.equal(matrix.cells[1 * matrix.size + 1], false, 'top-left finder inner white ring must be light');
// Verify top-right & bottom-left finder centers are dark
assert.equal(matrix.cells[3 * matrix.size + (matrix.size - 4)], true, 'top-right finder eye must be dark');
assert.equal(matrix.cells[(matrix.size - 4) * matrix.size + 3], true, 'bottom-left finder eye must be dark');

console.log(
  `Friend QR checks passed (matrix ${matrix.size}x${matrix.size} v${matrix.version} ECC-H, payload "${payload}").`,
);
