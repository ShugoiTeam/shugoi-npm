import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = new URL('../src/', import.meta.url)
const forbidden = [
  /\bas any\b/u,
  /\b(?:const|let|var|function|class|interface|type)\s+[^\n]*:\s*any\b/u,
  /(?:as\s+unknown|:\s*unknown\b|<unknown\b|unknown\[\])/u,
  /Record<string,\s*unknown>/u,
]

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const result = []
  for (const entry of entries) {
    const path = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory)
    if (entry.isDirectory()) result.push(...await files(path))
    else if (path.pathname.endsWith('.ts')) result.push(path)
  }
  return result
}

const violations = []
for (const file of await files(root)) {
  const source = await readFile(file, 'utf8')
  const lines = source.split('\n')
  lines.forEach((line, index) => {
    if (forbidden.some((pattern) => pattern.test(line))) {
      violations.push(`${file.pathname}:${index + 1}`)
    }
  })
}

if (violations.length > 0) {
  console.error(violations.join('\n'))
  process.exitCode = 1
}
