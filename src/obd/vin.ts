// VIN: se arma desde el Modo 09 PID 02 y se decodifica marca y año (sin base de datos externa).
import type { Mensaje } from '../elm/parser'

export interface InfoVin {
  vin: string
  /** El dígito 9 (verificador) cuadra. Los vehículos de Norteamérica y México siempre lo usan. */
  digitoOk: boolean
  marca?: string
  anio?: number
}

/** Une las respuestas 49 02 del primer módulo que contestó. CAN manda una trama larga; los antiguos, 5 mensajes de 4 letras. */
export function vinDesdeMensajes(mensajes: Mensaje[]): string | null {
  const vin = mensajes.filter((m) => m.datos[0] === 0x49 && m.datos[1] === 0x02)
  if (!vin.length) return null
  const propios = vin.filter((m) => m.ecu === vin[0]!.ecu).sort((a, b) => (a.datos[2] ?? 0) - (b.datos[2] ?? 0))
  const bytes = propios.flatMap((m) => m.datos.slice(3))
  // Quita rellenos (00, FF) y caracteres que un VIN no puede tener (I, O, Q).
  const texto = String.fromCharCode(...bytes).toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '')
  return texto.length >= 17 ? texto.slice(-17) : null
}

const VALOR: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5,
  P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
}
const PESOS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2]

export function digitoVerificadorOk(vin: string): boolean {
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return false
  const suma = [...vin].reduce((s, c, i) => s + (/\d/.test(c) ? Number(c) : VALOR[c]!) * PESOS[i]!, 0)
  const d = suma % 11
  return vin[8] === (d === 10 ? 'X' : String(d))
}

// Primeros caracteres del VIN (WMI) → marca. Solo las marcas del proyecto.
const FABRICANTES: [string, string][] = [
  ['JM1', 'Mazda'], ['JM3', 'Mazda'], ['JMZ', 'Mazda'], ['3MZ', 'Mazda'], ['3MD', 'Mazda'], ['3MV', 'Mazda'],
  ['4F2', 'Mazda'], ['4F4', 'Mazda'], ['1YV', 'Mazda'],
  ['1G1', 'Chevrolet'], ['1GN', 'Chevrolet'], ['1GC', 'Chevrolet'], ['1GB', 'Chevrolet'], ['2G1', 'Chevrolet'],
  ['2GN', 'Chevrolet'], ['2GC', 'Chevrolet'], ['3G1', 'Chevrolet'], ['3GN', 'Chevrolet'], ['3GC', 'Chevrolet'],
  ['3GB', 'Chevrolet'], ['KL1', 'Chevrolet'], ['KL7', 'Chevrolet'], ['KL8', 'Chevrolet'], ['9BG', 'Chevrolet'],
  ['8AG', 'Chevrolet'], ['LSG', 'Chevrolet'], ['LZW', 'Chevrolet'],
  ['1FA', 'Ford'], ['1FB', 'Ford'], ['1FC', 'Ford'], ['1FD', 'Ford'], ['1FM', 'Ford'], ['1FT', 'Ford'],
  ['1ZV', 'Ford'], ['2FA', 'Ford'], ['2FM', 'Ford'], ['2FT', 'Ford'], ['3FA', 'Ford'], ['3FE', 'Ford'],
  ['3FM', 'Ford'], ['3FT', 'Ford'], ['MAJ', 'Ford'], ['WF0', 'Ford'], ['9BF', 'Ford'], ['NM0', 'Ford'],
  ['MNB', 'Ford'], ['8AF', 'Ford'], ['LVS', 'Ford'],
]

const LETRAS_ANIO = 'ABCDEFGHJKLMNPRSTVWXY' // A = 1980/2010 … Y = 2000/2030

/** Año del modelo (posición 10). OBD2 existe desde 1996, eso resuelve casi todos los casos. */
export function anioVin(vin: string, hoy = new Date().getFullYear()): number | undefined {
  const c = vin[9] ?? ''
  if (/[1-9]/.test(c)) return 2000 + Number(c) // 2001–2009 (2031+ aún no existe)
  const i = LETRAS_ANIO.indexOf(c)
  if (i < 0) return undefined
  const opciones = [1980 + i, 2010 + i].filter((a) => a >= 1996 && a <= hoy + 1)
  if (opciones.length < 2) return opciones[0]
  // Ambos posibles (p. ej. T = 1996 o 2026): en Norteamérica, letra en la posición 7 = ciclo nuevo.
  return /[A-Z]/.test(vin[6] ?? '') ? opciones[1] : opciones[0]
}

export function decodificarVin(vin: string, hoy?: number): InfoVin {
  const marca = FABRICANTES.find(([p]) => vin.startsWith(p))?.[1]
  const anio = anioVin(vin, hoy)
  return {
    vin,
    digitoOk: digitoVerificadorOk(vin),
    ...(marca ? { marca } : {}),
    ...(anio ? { anio } : {}),
  }
}
