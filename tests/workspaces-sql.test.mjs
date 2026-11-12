import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Runs migration 041 against a throw-away PostgreSQL instance (initdb in a temp dir).
// Skipped when PostgreSQL binaries are not available; set PG_BIN to the bin directory to force it.
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const exe = process.platform === 'win32' ? '.exe' : ''

function findBin() {
  const candidates = [process.env.PG_BIN, ...(process.env.PATH ?? '').split(process.platform === 'win32' ? ';' : ':')]
  return candidates.find((dir) => dir && existsSync(join(dir, `initdb${exe}`)) && existsSync(join(dir, `psql${exe}`)))
}

const bin = findBin()

test('041_workspaces.sql migrates users, isolates data and enforces roles', { skip: !bin && 'PostgreSQL binaries not found' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'abapfy-pg-'))
  const port = String(55000 + Math.floor(Math.random() * 4000))
  const run = (file, args, options = {}) => spawnSync(join(bin, file + exe), args, { encoding: 'utf8', cwd: root, ...options })
  try {
    const init = run('initdb', ['-D', join(dir, 'data'), '-U', 'postgres', '--auth=trust', '-E', 'UTF8'])
    assert.equal(init.status, 0, init.stderr)
    const start = run('pg_ctl', ['-D', join(dir, 'data'), '-o', `-p ${port} -c listen_addresses=127.0.0.1 -c lc_messages=C`, '-l', join(dir, 'log'), '-w', 'start'], { stdio: 'ignore' })
    assert.equal(start.status, 0, `pg_ctl start failed; see ${join(dir, 'log')}`)
    const psql = (...files) => {
      const args = ['-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q']
      for (const file of files) args.push('-f', file)
      return run('psql', args)
    }
    try {
      for (const step of [
        ['tests/sql/workspaces-pre041.sql'],
        ['tests/sql/workspaces-seed.sql'],
        ['supabase/sql/041_workspaces.sql'],
        ['tests/sql/workspaces-041.test.sql']
      ]) {
        const result = psql(...step)
        assert.equal(result.status, 0, `${step[0]} failed:\n${result.stderr}`)
      }
    } finally {
      run('pg_ctl', ['-D', join(dir, 'data'), '-m', 'immediate', 'stop'])
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
