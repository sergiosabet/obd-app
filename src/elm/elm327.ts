// Controlador ELM327: un comando a la vez, espera el ">" y devuelve el texto crudo.
// Funciona igual con el simulador o con Bluetooth (sección 6.1).
import type { Transport } from '../transport/types'

export type LogEntry = { hora: number; dir: 'tx' | 'rx' | 'error'; texto: string }

export class Elm327 {
  onLog?: (e: LogEntry) => void
  private buffer = ''
  private waiting: ((text: string) => void) | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private readonly transport: Transport

  constructor(transport: Transport) {
    this.transport = transport
    transport.onData = (chunk) => this.receive(chunk)
  }

  /** Envía un comando y resuelve con la respuesta (sin eco ni ">"). Los comandos se encolan. */
  send(cmd: string, timeoutMs = 2000): Promise<string> {
    const run = () =>
      new Promise<string>((resolve, reject) => {
        this.buffer = ''
        const timer = setTimeout(() => {
          this.waiting = null
          this.log('error', `Sin respuesta a ${cmd} en ${timeoutMs / 1000} s`)
          reject(new Error(`Sin respuesta a ${cmd}`))
        }, timeoutMs)
        this.waiting = (text) => {
          clearTimeout(timer)
          resolve(text)
        }
        this.log('tx', cmd)
        this.transport.write(cmd + '\r').catch((e: unknown) => {
          clearTimeout(timer)
          this.waiting = null
          this.log('error', String(e))
          reject(e)
        })
      })
    const p = this.queue.then(run, run)
    this.queue = p.catch(() => undefined)
    return p
  }

  private receive(chunk: string) {
    this.buffer += chunk
    const end = this.buffer.indexOf('>')
    if (end < 0 || !this.waiting) return
    const raw = this.buffer.slice(0, end)
    this.buffer = ''
    const done = this.waiting
    this.waiting = null
    const text = raw.replace(/\r\n?/g, '\n').trim()
    this.log('rx', text)
    done(text)
  }

  private log(dir: LogEntry['dir'], texto: string) {
    this.onLog?.({ hora: Date.now(), dir, texto })
  }
}
