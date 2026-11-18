import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync(new URL('../src/lib/credentialStorage.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function harness(os = 'android') {
  const local = new Map(), secure = new Map();
  let fail = false;
  const asyncStorage = { getItem: async k => local.get(k) ?? null, setItem: async(k,v) => {local.set(k,v)}, removeItem: async k => {local.delete(k)} };
  const secureStore = { getItemAsync: async k => secure.get(k) ?? null, setItemAsync: async(k,v) => {if(fail) throw Error('Keystore unavailable');secure.set(k,v)}, deleteItemAsync: async k => {secure.delete(k)} };
  const exports = {};
  new Function('require', 'exports', code)(name => name === 'expo-secure-store' ? secureStore : name === 'react-native' ? {Platform:{OS:os}} : {__esModule:true,default:asyncStorage}, exports);
  return { ...exports, local, secure, setFail:()=>{fail=true} };
}
const a = harness();
a.local.set('session','existing');
assert.equal(await a.credentialStorage.getItem('session'),'existing');
assert.equal(a.secure.get('session'),'existing');
assert(!a.local.has('session'));
await a.credentialStorage.setItem('session','refreshed');
assert.equal(a.secure.get('session'),'refreshed');
await a.credentialStorage.removeItem('session');
assert(!a.secure.has('session'));
const b = harness(); b.local.set('session','preserve-me'); b.setFail();
await assert.rejects(b.credentialStorage.getItem('session'), /Keystore/);
assert.equal(b.local.get('session'),'preserve-me', 'Failed migration must not lose existing credentials');
await assert.rejects(b.credentialStorage.setItem('new','do-not-save-plaintext'), /Keystore/);
assert(!b.local.has('new'));
const web=harness('web'); await web.credentialStorage.setItem('session','browser');
assert.equal(await web.credentialStorage.getItem('session'),'browser');
assert.equal(web.secure.size,0);
console.log('PASS: credential migration, refresh, deletion, failure without plaintext fallback, browser storage.');
