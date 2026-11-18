import type { TipoProtocolo } from '../elm/parser'

export interface Protocolo {
  codigo: string
  nombre: string
  tipo: TipoProtocolo
}

// Números que devuelve ATDPN (hoja de datos del ELM327).
const TABLA: Record<string, [string, TipoProtocolo]> = {
  '1': ['SAE J1850 PWM (Ford antiguos)', 'legacy'],
  '2': ['SAE J1850 VPW (GM antiguos)', 'legacy'],
  '3': ['ISO 9141-2 (antiguos, p. ej. Mazda)', 'legacy'],
  '4': ['ISO 14230-4 KWP, inicio lento', 'legacy'],
  '5': ['ISO 14230-4 KWP, inicio rápido', 'legacy'],
  '6': ['CAN 11 bits, 500 kbaud', 'can11'],
  '7': ['CAN 29 bits, 500 kbaud', 'can29'],
  '8': ['CAN 11 bits, 250 kbaud', 'can11'],
  '9': ['CAN 29 bits, 250 kbaud', 'can29'],
  A: ['SAE J1939 (diésel pesado, fuera de alcance)', 'can29'],
  B: ['CAN definido por usuario 1', 'can11'],
  C: ['CAN definido por usuario 2', 'can11'],
}

/** "A6" o "6" → protocolo. null si aún no se detecta ("A0", "0") o no se entiende. */
export function parseProtocolo(dpn: string): Protocolo | null {
  const m = dpn.trim().toUpperCase().match(/^A?([0-9A-C])$/)
  const fila = m ? TABLA[m[1]!] : undefined
  return fila ? { codigo: m![1]!, nombre: fila[0], tipo: fila[1] } : null
}
