import { readdirSync } from 'node:fs'

const readers = new URL('./readers/', import.meta.url)

// The services the import page offers: one for each reader in readers/, so a
// new service needs nothing here.
export function listServices() {
  let files = []
  try {
    files = readdirSync(readers)
  } catch {
    return []
  }
  return files
    .filter((f) => /^[a-z]+\.js$/.test(f))
    .map((f) => f.slice(0, -3))
    .sort()
    .map((id) => ({ id, label: serviceLabel(id) }))
}

export const serviceLabel = (id) => String(id).charAt(0).toUpperCase() + String(id).slice(1)
