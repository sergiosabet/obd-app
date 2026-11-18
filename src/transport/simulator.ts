// Simulador de escáner ELM327: contesta como uno real (eco, encabezados CAN, tramas de varias
// líneas, SEARCHING..., NO DATA, ?) y entrega la respuesta en pedazos de 20 caracteres como BLE.
import type { Transport } from './types'
import { ATRV, scenarioById, type Scenario } from './scenarios'

const hex = (n: number) => n.toString(16).toUpperCase().padStart(2, '0')
const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
const u16 = (v: number) => {
  const n = Math.max(0, Math.min(0xffff, Math.round(v)))
  return [n >> 8, n & 0xff]
}
const pct = (v: number) => [byte((v * 255) / 100)]
const trim = (v: number) => [byte((v * 128) / 100 + 128)]
const temp = (v: number) => [byte(v + 40)]
const o2 = (v: number) => [byte(v * 200), 0xff] // B = 0xFF: el sensor no se usa para ajuste corto

/** Inverso de las fórmulas de la sección 7: valor físico → bytes A, B. */
const ENCODERS: Record<number, (v: number) => number[]> = {
  0x04: pct, 0x05: temp, 0x06: trim, 0x07: trim, 0x0b: (v) => [byte(v)],
  0x0c: (v) => u16(v * 4), 0x0d: (v) => [byte(v)], 0x0e: (v) => [byte((v + 64) * 2)],
  0x0f: temp, 0x10: (v) => u16(v * 100), 0x11: pct, 0x14: o2, 0x15: o2,
  0x1f: u16, 0x21: u16, 0x2f: pct, 0x31: u16, 0x33: (v) => [byte(v)],
  0x42: (v) => u16(v * 1000), 0x46: temp,
}
const SUPPORTED = [0x01, ...Object.keys(ENCODERS).map(Number)]
const ELM_ID = 'ELM327 v1.5'

/** Bytes A-D de los PIDs 00/20/40/60: qué PIDs de base+1 a base+32 existen. */
function bitmap(base: number): number[] | null {
  if (!SUPPORTED.some((p) => p > base)) return null
  let bits = 0
  for (let i = 1; i <= 32; i++) {
    const pid = base + i
    const yes = i === 32 ? SUPPORTED.some((p) => p > pid) : SUPPORTED.includes(pid)
    if (yes) bits |= 1 << (32 - i)
  }
  return [bits >>> 24, (bits >>> 16) & 0xff, (bits >>> 8) & 0xff, bits & 0xff]
}

/** "P0171" → [0x01, 0x71] (sección SAE J1979). */
export function dtcBytes(code: string): number[] {
  const tipo = 'PCBU'.indexOf(code[0] ?? 'P')
  const n = parseInt(code.slice(1), 16)
  return [(tipo << 6) | (n >> 8), n & 0xff]
}

export interface SimulatorOptions {
  /** Retardo base de cada respuesta en ms (0 en las pruebas). */
  delayMs?: number
  /** Reloj inyectable para pruebas. */
  now?: () => number
}

export class SimulatorTransport implements Transport {
  readonly nombre: string
  onData?: (chunk: string) => void
  onDisconnect?: () => void

  private readonly scenario: Scenario
  private readonly delayMs: number
  private readonly now: () => number
  private startedAt = 0
  private connected = false
  private input = ''
  private guardados: string[]
  private pendientes: string[]
  private echo = true
  private linefeeds = false
  private spaces = true
  private headers = false
  private protocolFound = false

  constructor(scenarioId: string, opts: SimulatorOptions = {}) {
    this.scenario = scenarioById(scenarioId)
    this.nombre = `Simulador: ${this.scenario.nombre}`
    this.delayMs = opts.delayMs ?? 60
    this.now = opts.now ?? Date.now
    this.guardados = [...this.scenario.guardados]
    this.pendientes = [...this.scenario.pendientes]
  }

  async connect() {
    this.connected = true
    this.startedAt = this.now()
  }

  async disconnect() {
    this.connected = false
    this.onDisconnect?.()
  }

  async write(text: string) {
    if (!this.connected) throw new Error('El simulador no está conectado')
    this.input += text
    let i: number
    while ((i = this.input.indexOf('\r')) >= 0) {
      const cmd = this.input.slice(0, i)
      this.input = this.input.slice(i + 1)
      const { text: out, extraDelay } = this.handle(cmd)
      this.emit(out, this.delayMs ? this.delayMs + extraDelay : 0) // delayMs 0 = sin esperas (pruebas)
    }
  }

  private emit(text: string, delay: number) {
    setTimeout(() => {
      for (let i = 0; i < text.length; i += 20) this.onData?.(text.slice(i, i + 20))
    }, delay)
  }

  private get t() {
    return (this.now() - this.startedAt) / 1000
  }

  /** Respuesta completa a un comando, incluyendo eco y el prompt ">". */
  handle(raw: string): { text: string; extraDelay: number } {
    const nl = this.linefeeds ? '\r\n' : '\r'
    const echo = this.echo ? raw + nl : ''
    const cmd = raw.replace(/\s/g, '').toUpperCase()
    let extraDelay = 0
    let lines: string[]
    if (cmd.startsWith('AT')) {
      lines = this.at(cmd.slice(2))
      if (cmd === 'ATZ') extraDelay = 1000
    } else {
      lines = this.obd(cmd)
      if (!this.protocolFound && lines[0] !== '?') {
        this.protocolFound = true
        lines = ['SEARCHING...', ...lines]
        extraDelay = 1500
      }
    }
    return { text: echo + lines.join(nl) + nl + nl + '>', extraDelay }
  }

  private at(c: string): string[] {
    const toggle: Record<string, () => void> = {
      E0: () => (this.echo = false), E1: () => (this.echo = true),
      L0: () => (this.linefeeds = false), L1: () => (this.linefeeds = true),
      S0: () => (this.spaces = false), S1: () => (this.spaces = true),
      H0: () => (this.headers = false), H1: () => (this.headers = true),
    }
    if (c === 'Z' || c === 'WS' || c === 'D') {
      this.echo = true; this.linefeeds = false; this.spaces = true; this.headers = false
      return c === 'D' ? ['OK'] : ['', ELM_ID]
    }
    if (c === 'I') return [ELM_ID]
    if (c === '@1') return ['OBDII to RS232 Interpreter']
    if (c === 'RV') return [`${(this.scenario.lecturas(this.t)[ATRV] ?? 12.6).toFixed(1)}V`]
    if (c === 'DPN') return [this.protocolFound ? 'A6' : 'A0']
    if (c === 'DP') return [this.protocolFound ? 'AUTO, ISO 15765-4 (CAN 11/500)' : 'AUTO']
    if (c.startsWith('SP')) { this.protocolFound = false; return ['OK'] }
    const fn = toggle[c]
    if (fn) fn()
    return ['OK']
  }

  private obd(c: string): string[] {
    if (!/^[0-9A-F]+$/.test(c) || c.length < 2) return ['?']
    if (c.length % 2 === 1) c = c.slice(0, -1) // dígito final = número de respuestas esperadas
    const bytes = c.match(/../g)!.map((h) => parseInt(h, 16))
    const [mode, ...args] = bytes as [number, ...number[]]
    const ecm = (payload: number[] | null) => (payload ? this.format('7E8', payload) : ['NO DATA'])

    switch (mode) {
      case 0x01: {
        if (args.length === 0 || args.length > 6) return ['?']
        const data = args.flatMap((pid) => {
          const d = this.pid(pid)
          return d ? [pid, ...d] : []
        })
        if (!data.length) return ['NO DATA']
        const lines = this.format('7E8', [0x41, ...data])
        // El módulo de transmisión también contesta la lista de PIDs soportados.
        if (args.length === 1 && args[0] === 0x00) lines.push(...this.format('7E9', [0x41, 0x00, 0x98, 0x18, 0x00, 0x01]))
        return lines
      }
      case 0x02: {
        const [pid = 0, frame = 0] = args
        if (!this.guardados.length || frame !== 0) return ['NO DATA']
        const d = pid === 0x02 ? dtcBytes(this.guardados[0]!) : this.pid(pid, 45)
        return ecm(d ? [0x42, pid, frame, ...d] : null)
      }
      case 0x03: return ecm(this.dtcPayload(0x43, this.guardados))
      case 0x07: return ecm(this.dtcPayload(0x47, this.pendientes))
      case 0x0a: return ecm(this.dtcPayload(0x4a, this.scenario.permanentes))
      case 0x04:
        this.guardados = []
        this.pendientes = []
        return ecm([0x44])
      case 0x09: {
        const ascii = (s: string, len: number) => [...s.padEnd(len, '\0').slice(0, len)].map((ch) => ch.charCodeAt(0))
        if (args[0] === 0x00) return ecm([0x49, 0x00, 0x50, 0x00, 0x00, 0x00])
        if (args[0] === 0x02) return ecm([0x49, 0x02, 0x01, ...ascii(this.scenario.vin, 17)])
        if (args[0] === 0x04) return ecm([0x49, 0x04, 0x01, ...ascii(`SIM${this.scenario.id.toUpperCase()}`, 16)])
        return ['NO DATA']
      }
      default:
        return ['NO DATA'] // Modo 06 y otros: se agregan en fases posteriores
    }
  }

  private dtcPayload(svc: number, codes: string[]) {
    return [svc, codes.length, ...codes.flatMap(dtcBytes)]
  }

  /** Bytes de datos de un PID de Modo 01 (o null si "el vehículo" no lo soporta). */
  private pid(pid: number, at = this.t): number[] | null {
    if (pid % 0x20 === 0) return bitmap(pid)
    if (pid === 0x01) {
      const n = this.guardados.length
      return [(n ? 0x80 : 0) | n, 0x07, 0x65, this.scenario.monitoresIncompletos]
    }
    const enc = ENCODERS[pid]
    const v = this.scenario.lecturas(at)[pid]
    return enc && v !== undefined ? enc(v) : null
  }

  /** Arma las tramas CAN (ISO 15765) como las imprime un ELM327 con o sin encabezados. */
  private format(header: string, payload: number[]): string[] {
    const join = (parts: string[]) => parts.join(this.spaces ? ' ' : '')
    const pad = (f: number[]) => [...f, ...Array(8 - f.length).fill(0)]
    if (payload.length <= 7) {
      return this.headers ? [join([header, ...pad([payload.length, ...payload]).map(hex)])] : [join(payload.map(hex))]
    }
    const chunks = [payload.slice(0, 6)]
    for (let i = 6; i < payload.length; i += 7) chunks.push(payload.slice(i, i + 7))
    if (!this.headers) {
      const len = payload.length.toString(16).toUpperCase().padStart(3, '0')
      return [len, ...chunks.map((c, i) => `${(i & 0xf).toString(16).toUpperCase()}:${this.spaces ? ' ' : ''}${join(c.map(hex))}`)]
    }
    return chunks.map((c, i) => {
      const pci = i === 0 ? [0x10 | (payload.length >> 8), payload.length & 0xff] : [0x20 | (i & 0xf)]
      return join([header, ...pad([...pci, ...c]).map(hex)])
    })
  }
}
