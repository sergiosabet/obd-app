// Estado de la conexión con el escáner, compartido por todas las pantallas. Incluye la reconexión automática.
import { Elm327, ErrorSinRespuesta, type LogEntry } from '../elm/elm327'
import { BleTransport, ErrorSinBluetooth, ErrorSinServicio } from '../transport/ble'
import { SimulatorTransport } from '../transport/simulator'
import type { Transport } from '../transport/types'
import { configurar, inicializar, type InfoEscaner } from './inicio'

export type Fuente = 'ble' | 'simulador'

export interface ErrorVisible {
  mensaje: string
  ayuda: string[]
}

export interface EstadoConexion {
  fase: 'desconectado' | 'conectando' | 'conectado' | 'reconectando'
  paso?: string
  error?: ErrorVisible
  info?: InfoEscaner
  /** "Bluetooth: vLinker MC" o "Simulador: …" */
  dispositivo?: string
}

const MAX_LOG = 1000
const COPIAR_LOG = 'Si sigue fallando: Ajustes → Consola → “Copiar registro” y pégalo en Claude Code.'

export function explicarErrorConexion(e: unknown): ErrorVisible {
  const nombre = e instanceof DOMException ? e.name : ''
  const texto = e instanceof Error ? e.message : String(e)
  if (e instanceof ErrorSinBluetooth)
    return { mensaje: 'Este navegador no puede usar Bluetooth.', ayuda: ['Abre la app en Chrome en un celular Android (en iPhone no funciona).', 'Actualiza Chrome desde Play Store.'] }
  if (nombre === 'NotFoundError' && /cancel/i.test(texto)) return { mensaje: 'No se eligió ningún escáner.', ayuda: [] }
  if (nombre === 'NotFoundError' || /adapter/i.test(texto))
    return { mensaje: 'El Bluetooth del celular está apagado o no está disponible.', ayuda: ['Enciende el Bluetooth.', 'Enciende la Ubicación (algunos Android la piden para buscar dispositivos).', 'Revisa que Chrome tenga permiso de “Dispositivos cercanos”.'] }
  if (nombre === 'SecurityError' || nombre === 'NotAllowedError')
    return { mensaje: 'Chrome no dio permiso para usar el Bluetooth.', ayuda: ['Revisa que Chrome tenga permiso de “Dispositivos cercanos” y “Ubicación” en los ajustes de Android.', 'Abre la app desde el ícono instalado o desde el link https.'] }
  if (e instanceof ErrorSinServicio)
    return { mensaje: 'El dispositivo elegido no parece un escáner OBD compatible.', ayuda: ['Elige el que se llame parecido a OBD, Vlink, vLinker, iCar o V-LINK.', 'Si tu escáner pide PIN en los ajustes de Bluetooth, es Bluetooth clásico y esta app no puede usarlo.', COPIAR_LOG] }
  if (e instanceof ErrorSinRespuesta)
    return { mensaje: 'El escáner no respondió.', ayuda: ['Revisa que esté bien metido en el puerto OBD y con la luz encendida.', 'Desconéctalo del puerto, espera 5 segundos y vuelve a conectarlo.', COPIAR_LOG] }
  if (nombre === 'NetworkError' || /gatt|connect/i.test(texto))
    return { mensaje: 'No se pudo conectar con el escáner.', ayuda: ['Cierra otras apps que lo estén usando (Car Scanner, Torque…): solo una puede conectarse a la vez.', 'Acerca el celular al escáner.', 'Apaga y vuelve a prender el Bluetooth del celular.', COPIAR_LOG] }
  return { mensaje: `Error: ${texto}`, ayuda: [COPIAR_LOG] }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

class Conexion {
  private estado: EstadoConexion = { fase: 'desconectado' }
  private log: LogEntry[] = []
  private transport: Transport | null = null
  private oyentes = new Set<() => void>()
  elm: Elm327 | null = null

  subscribe = (fn: () => void) => {
    this.oyentes.add(fn)
    return () => void this.oyentes.delete(fn)
  }
  getEstado = () => this.estado
  getLog = () => this.log

  limpiarLog() {
    this.log = []
    this.emitir()
  }

  async conectar(fuente: Fuente, escenario: string) {
    if (this.estado.fase === 'conectando' || this.estado.fase === 'reconectando') return
    await this.cerrar()
    this.poner({ fase: 'conectando', paso: fuente === 'ble' ? 'Elige tu escáner en la lista…' : 'Conectando con el simulador…' })
    const t: Transport = fuente === 'ble' ? new BleTransport() : new SimulatorTransport(escenario)
    const elm = new Elm327(t)
    elm.onLog = (e) => this.agregarLog(e)
    elm.info(`App ${__VERSION__} · ${new Date().toLocaleString('es-MX')} · ${navigator.userAgent}`)
    try {
      await t.connect()
      this.transport = t
      this.elm = elm
      t.onDisconnect = () => void this.reconectar()
      const info = await inicializar(elm, (paso) => this.poner({ fase: 'conectando', paso, dispositivo: t.nombre }))
      this.poner({ fase: 'conectado', info, dispositivo: t.nombre })
    } catch (e) {
      const error = explicarErrorConexion(e)
      if (error.ayuda.length) elm.info(`Error al conectar: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`)
      await this.cerrar(t)
      this.poner({ fase: 'desconectado', error })
    }
  }

  async desconectar() {
    await this.cerrar()
    this.poner({ fase: 'desconectado' })
  }

  private async cerrar(t = this.transport) {
    this.elm?.abortar('Conexión cerrada')
    if (t) {
      t.onDisconnect = undefined
      await t.disconnect().catch(() => undefined)
    }
    this.transport = null
    this.elm = null
  }

  /** Se cortó el Bluetooth: tres intentos de volver a conectar al mismo escáner, sin perder lo leído. */
  private async reconectar() {
    const t = this.transport
    const elm = this.elm
    const anterior = this.estado
    elm?.abortar('Se perdió la conexión Bluetooth')
    if (!(t instanceof BleTransport) || !elm) return this.desconectar()
    for (let i = 1; i <= 3; i++) {
      this.poner({ ...anterior, fase: 'reconectando', paso: `Reconectando (intento ${i} de 3)…` })
      await esperar(1500 * i)
      if (this.transport !== t) return // el usuario desconectó mientras tanto
      try {
        await t.reconnect()
        await configurar(elm)
        await elm.send('ATSP0')
        this.poner({ ...anterior, fase: 'conectado' })
        elm.info('Reconectado')
        return
      } catch (e) {
        elm.info(`Intento ${i} falló: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    await this.cerrar(t)
    this.poner({ fase: 'desconectado', error: { mensaje: 'Se perdió la conexión con el escáner.', ayuda: ['Revisa que el escáner siga conectado al carro.', 'Presiona Conectar otra vez.', COPIAR_LOG] } })
  }

  private poner(e: EstadoConexion) {
    this.estado = e
    this.emitir()
  }

  private agregarLog(e: LogEntry) {
    this.log = [...this.log, e].slice(-MAX_LOG)
    this.emitir()
  }

  private emitir() {
    for (const fn of this.oyentes) fn()
  }
}

export const conexion = new Conexion()
