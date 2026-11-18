// Conexión Bluetooth de baja energía (Web Bluetooth) con escáneres tipo ELM327 (sección 4.3).
// Pide permiso para todos los servicios conocidos y descubre cuál característica lee y cuál escribe.
import type { Transport } from './types'

const uuid16 = (n: string) => `0000${n}-0000-1000-8000-00805f9b34fb`

export const SERVICIOS = [
  { uuid: uuid16('fff0'), donde: 'vLinker FD/MC, iCar Pro 2023+, genéricos' },
  { uuid: uuid16('ffe0'), donde: 'iCar Pro 2017–2022' },
  { uuid: uuid16('18f0'), donde: 'algunos Vgate y OBDLink' },
  { uuid: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', donde: 'algunos iCar Pro BLE' },
]

export class ErrorSinBluetooth extends Error {}
export class ErrorSinServicio extends Error {}

interface Props {
  notify: boolean
  indicate: boolean
  write: boolean
  writeWithoutResponse: boolean
}

/** De las características de un servicio, elige la que avisa (lectura) y con la que se escribe. */
export function elegirCaracteristicas<T extends { properties: Props }>(chars: T[]): { lectura: T; escritura: T } | null {
  const lectura = chars.find((c) => c.properties.notify || c.properties.indicate)
  if (!lectura) return null
  const escribe = (c: T) => c.properties.write || c.properties.writeWithoutResponse
  const escritura = chars.find((c) => c !== lectura && escribe(c)) ?? (escribe(lectura) ? lectura : undefined)
  return escritura ? { lectura, escritura } : null
}

const describir = (p: Props) =>
  [p.notify && 'notify', p.indicate && 'indicate', p.write && 'write', p.writeWithoutResponse && 'writeNoResp'].filter(Boolean).join('+')
const corto = (u: string) => (u.startsWith('0000') && u.endsWith('-0000-1000-8000-00805f9b34fb') ? u.slice(4, 8) : u)

export class BleTransport implements Transport {
  onData?: (chunk: string) => void
  onDisconnect?: () => void
  onLog?: (texto: string) => void

  private device?: BluetoothDevice
  private lectura?: BluetoothRemoteGATTCharacteristic
  private escritura?: BluetoothRemoteGATTCharacteristic
  private conRespuesta = true
  private cerradoAMano = false
  private colaEscritura: Promise<unknown> = Promise.resolve()
  private readonly decoder = new TextDecoder()
  private readonly encoder = new TextEncoder()

  get nombre() {
    return `Bluetooth: ${this.device?.name ?? 'escáner'}`
  }

  static disponible() {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator
  }

  async connect() {
    if (!BleTransport.disponible()) throw new ErrorSinBluetooth('Este navegador no tiene Web Bluetooth')
    this.device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: SERVICIOS.map((s) => s.uuid),
    })
    this.device.addEventListener('gattserverdisconnected', this.alDesconectarse)
    this.cerradoAMano = false
    await this.abrir()
  }

  /** Vuelve a conectar al mismo escáner sin mostrar la lista de dispositivos. */
  async reconnect() {
    if (!this.device) throw new Error('No hay escáner elegido')
    await this.abrir()
  }

  async disconnect() {
    this.cerradoAMano = true
    this.lectura?.removeEventListener('characteristicvaluechanged', this.alRecibir)
    this.device?.gatt?.disconnect()
  }

  write(text: string): Promise<void> {
    const tarea = this.colaEscritura.then(async () => {
      const c = this.escritura
      if (!c || !this.device?.gatt?.connected) throw new Error('El Bluetooth no está conectado')
      const bytes = this.encoder.encode(text)
      for (let i = 0; i < bytes.length; i += 20) {
        const trozo = bytes.slice(i, i + 20) // BLE 4.0 manda máximo 20 bytes por envío
        if (this.conRespuesta) await c.writeValueWithResponse(trozo)
        else await c.writeValueWithoutResponse(trozo)
      }
    })
    this.colaEscritura = tarea.catch(() => undefined)
    return tarea
  }

  private async abrir() {
    const device = this.device!
    const server = await device.gatt!.connect()
    this.onLog?.(`Conectado a "${device.name ?? 'sin nombre'}"`)
    for (const s of SERVICIOS) {
      let servicio: BluetoothRemoteGATTService
      try {
        servicio = await server.getPrimaryService(s.uuid)
      } catch {
        continue // este escáner no usa ese servicio
      }
      const chars = await servicio.getCharacteristics()
      this.onLog?.(`Servicio ${corto(s.uuid)}: ${chars.map((c) => `${corto(c.uuid)}[${describir(c.properties)}]`).join(', ') || 'sin características'}`)
      const par = elegirCaracteristicas(chars)
      if (!par) continue
      this.lectura?.removeEventListener('characteristicvaluechanged', this.alRecibir)
      this.lectura = par.lectura
      this.escritura = par.escritura
      // Con respuesta es más lento pero no pierde datos; solo se usa sin respuesta si es lo único que acepta.
      this.conRespuesta = par.escritura.properties.write
      par.lectura.addEventListener('characteristicvaluechanged', this.alRecibir)
      await par.lectura.startNotifications()
      this.onLog?.(`Usando lectura ${corto(par.lectura.uuid)}, escritura ${corto(par.escritura.uuid)} (${this.conRespuesta ? 'con' : 'sin'} respuesta)`)
      return
    }
    server.disconnect()
    throw new ErrorSinServicio('El dispositivo no tiene ningún servicio de escáner conocido')
  }

  private alRecibir = (e: Event) => {
    const valor = (e.target as BluetoothRemoteGATTCharacteristic).value
    if (valor) this.onData?.(this.decoder.decode(valor, { stream: true }))
  }

  private alDesconectarse = () => {
    this.onLog?.('El Bluetooth se desconectó')
    if (!this.cerradoAMano) this.onDisconnect?.()
  }
}
