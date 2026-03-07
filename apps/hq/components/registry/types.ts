export type AtomicLevel = "atom" | "molecule" | "component"

export interface RegistryEntry {
  id: string
  label: string
  level: AtomicLevel
  sublabel: string
  source: string
  description: string
}
