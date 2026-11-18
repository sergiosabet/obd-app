// Convierte el texto crudo del ELM327 (con encabezados, ATH1) en mensajes por módulo.
// Arma las tramas de varias líneas de CAN (ISO 15765) y quita el checksum de los protocolos antiguos.

export type TipoProtocolo = 'can11' | 'can29' | 'legacy'

export interface Mensaje {
  /** Quién contesta: "7E8" (CAN 11), "18DAF110" (CAN 29) o "10" (dirección en protocolos antiguos). */
  ecu: string
  datos: number[]
}

export interface Respuesta {
  mensajes: Mensaje[]
  /** Primera línea que no es dato (NO DATA, CAN ERROR, ?...). */
  error?: string
}

const LARGO_ENCABEZADO: Record<TipoProtocolo, number> = { can11: 3, can29: 8, legacy: 6 }

// shortcut: supone encabezados activados (ATH1, como manda la sección 6.2); con ATH0 no se sabría qué módulo contesta.
export function parseRespuesta(raw: string, tipo: TipoProtocolo): Respuesta {
  const lineas = raw
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('SEARCHING') && !/^BUS INIT.*OK$/i.test(l))

  const mensajes: Mensaje[] = []
  const enCurso = new Map<string, { largo: number; datos: number[] }>()
  let error: string | undefined
  const hl = LARGO_ENCABEZADO[tipo]

  for (const linea of lineas) {
    const hex = linea.replace(/\s/g, '').toUpperCase()
    if (!/^[0-9A-F]+$/.test(hex) || hex.length <= hl || (hex.length - hl) % 2) {
      error ??= linea
      continue
    }
    const ecu = hex.slice(0, hl)
    const bytes = hex.slice(hl).match(/../g)!.map((h) => parseInt(h, 16))

    if (tipo === 'legacy') {
      // 3 bytes de encabezado (prioridad, destino, origen) + datos + checksum.
      if (bytes.length >= 2) mensajes.push({ ecu: ecu.slice(4), datos: bytes.slice(0, -1) })
      continue
    }

    const pci = bytes[0]! >> 4
    if (pci === 0) {
      const largo = bytes[0]! & 0x0f
      if (largo >= 1 && largo <= bytes.length - 1) mensajes.push({ ecu, datos: bytes.slice(1, 1 + largo) })
    } else if (pci === 1) {
      enCurso.set(ecu, { largo: ((bytes[0]! & 0x0f) << 8) | (bytes[1] ?? 0), datos: bytes.slice(2) })
    } else if (pci === 2) {
      const m = enCurso.get(ecu)
      if (!m) continue
      m.datos.push(...bytes.slice(1))
      if (m.datos.length >= m.largo) {
        mensajes.push({ ecu, datos: m.datos.slice(0, m.largo) })
        enCurso.delete(ecu)
      }
    }
    // pci 3 = control de flujo: no trae datos.
  }
  // Una trama larga que llegó incompleta se entrega con lo que haya.
  for (const [ecu, m] of enCurso) mensajes.push({ ecu, datos: m.datos })

  return error === undefined ? { mensajes } : { mensajes, error }
}

export function nombreModulo(ecu: string): string {
  const id = ecu.length === 3 ? ecu : ecu.slice(-2)
  if (id === '7E8' || id === '10') return 'Motor'
  if (id === '7E9' || id === '18') return 'Transmisión'
  return `Módulo ${ecu}`
}

/** Traduce a español los mensajes de error del ELM327. */
export function explicarError(e: string): string {
  const t = e.toUpperCase().replace(/[<>]/g, '').trim()
  if (t.includes('NO DATA')) return 'El vehículo no respondió a este dato.'
  if (t.includes('UNABLE TO CONNECT')) return 'El escáner no pudo comunicarse con el carro. Revisa que la llave esté en encendido (ON) o el motor prendido.'
  if (t.includes('BUS INIT')) return 'No se pudo iniciar la comunicación con el carro. Pon la llave en ON e inténtalo otra vez.'
  if (t.includes('CAN ERROR') || t.includes('BUS ERROR') || t.includes('BUS BUSY')) return 'Error en la red del carro. Revisa que el escáner esté bien metido en el puerto OBD.'
  if (t.includes('STOPPED')) return 'La respuesta se interrumpió antes de terminar.'
  if (t.includes('BUFFER FULL')) return 'El escáner se saturó de datos.'
  if (t.includes('LV RESET')) return 'El escáner se reinició por bajo voltaje.'
  if (t === '?') return 'El escáner no entendió el comando.'
  return `Respuesta del escáner: ${e}`
}

/** "12.6V" → 12.6 */
export function parseVoltaje(raw: string): number | null {
  const m = raw.match(/(\d{1,2}(?:\.\d+)?)\s*V/i)
  return m ? Number(m[1]) : null
}
