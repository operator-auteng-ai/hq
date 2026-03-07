import type { AtomicLevel, RegistryEntry } from "./types"
import { registryEntries } from "./entries"

export function getByLevel(level: AtomicLevel): RegistryEntry[] {
  return registryEntries.filter((e) => e.level === level)
}

export function getGrouped(): Record<AtomicLevel, RegistryEntry[]> {
  return {
    atom: getByLevel("atom"),
    molecule: getByLevel("molecule"),
    component: getByLevel("component"),
  }
}

export function getCounts(): Record<AtomicLevel, number> {
  const grouped = getGrouped()
  return {
    atom: grouped.atom.length,
    molecule: grouped.molecule.length,
    component: grouped.component.length,
  }
}
