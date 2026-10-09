import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import ts from 'typescript'

const require = createRequire(import.meta.url)
export function loadTs(file, mocks = {}, globals = {}) {
  const absolute = path.resolve(file)
  const source = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
  }).outputText
  const module = { exports: {} }
  const localRequire = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.startsWith('.') && name.endsWith('?raw')) return { default: fs.readFileSync(path.resolve(path.dirname(absolute), name.slice(0, -4)), 'utf8') }
    if (name.startsWith('.')) {
      const base = path.resolve(path.dirname(absolute), name)
      if (name.endsWith('.mjs')) return require(base)
      return loadTs(fs.existsSync(base + '.ts') ? base + '.ts' : base + '.tsx', mocks, globals)
    }
    return require(name)
  }
  const wrapper = vm.runInNewContext('(function(exports, require, module) {\n' + source + '\n})', {
    process, Buffer, console, setTimeout, clearTimeout, AbortController, AbortSignal, DOMException, crypto: globalThis.crypto, ...globals
  }, { filename: absolute })
  wrapper(module.exports, localRequire, module)
  return module.exports
}
