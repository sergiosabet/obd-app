// Controlador ELM327: un comando a la vez, espera el ">" y devuelve el texto crudo.
// Funciona igual con el simulador o con Bluetooth (sección 6.1).
import type { Transport } from '../transport/types'

export type LogEntry = { hora: number; dir: 'tx' | 'rx' | 'error' | 'info'; texto: string }

export class ErrorSinRespuesta extends Error {}

export class Elm327 {
  onLog?: (e: LogEntry) => void
  private buffer = ''
  private waiting: { cmd: string; resolve: (t: string) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private readonly transport: Transport

  constructor(transport: Transport) {
    this.transport = transport
    transport.onData = (chunk) => this.receive(chunk)
    transport.onLog = (texto) => this.log('info', texto)
  }

  /** Envía un comando y resuelve con la respuesta (sin eco ni ">"). Los comandos se encolan. */
  send(cmd: string, timeoutMs = 2000): Promise<string> {
    const run = () =>
      new Promise<string>((resolve, reject) => {
        this.buffer = ''
        const timer = setTimeout(() => {
          this.waiting = null
          this.log('error', `Sin respuesta a ${cmd} en ${timeoutMs / 1000} s`)
          reject(new ErrorSinRespuesta(`Sin respuesta a ${cmd}`))
        }, timeoutMs)
        this.waiting = { cmd, resolve, reject, timer }
        this.log('tx', cmd)
        this.transport.write(cmd + '\r').catch((e: unknown) => {
          this.abortar(e instanceof Error ? e.message : String(e))
        })
      })
    const p = this.queue.then(run, run)
    this.queue = p.catch(() => undefined)
    return p
  }

  /** Cancela el comando en espera (por ejemplo, si se cortó el Bluetooth). */
  abortar(motivo: string) {
    const w = this.waiting
    if (!w) return
    clearTimeout(w.timer)
    this.waiting = null
    this.log('error', motivo)
    w.reject(new Error(motivo))
  }

  info(texto: string) {
    this.log('info', texto)
  }

  private receive(chunk: string) {
    this.buffer += chunk
    const end = this.buffer.indexOf('>')
    if (end < 0 || !this.waiting) return
    const raw = this.buffer.slice(0, end)
    this.buffer = ''
    const w = this.waiting
    this.waiting = null
    clearTimeout(w.timer)
    this.log('rx', raw.replace(/\r\n?/g, '\n').trim())
    w.resolve(quitarEco(raw, w.cmd))
  }

  private log(dir: LogEntry['dir'], texto: string) {
    this.onLog?.({ hora: Date.now(), dir, texto })
  }
}

const compacto = (s: string) => s.replace(/\s/g, '').toUpperCase()

/** Quita líneas vacías y el eco del comando (aparece hasta que se manda ATE0). */
export function quitarEco(raw: string, cmd: string): string {
  const lineas = raw.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean)
  if (lineas.length && compacto(lineas[0]!) === compacto(cmd)) lineas.shift()
  return lineas.join('\n')
}
