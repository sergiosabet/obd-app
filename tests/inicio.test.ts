import { describe, expect, it } from 'vitest'
import { Elm327 } from '../src/elm/elm327'
import { inicializar } from '../src/services/inicio'
import { explicarErrorConexion } from '../src/services/conexion'
import { elegirCaracteristicas, ErrorSinServicio } from '../src/transport/ble'
import { SimulatorTransport } from '../src/transport/simulator'
import { SCENARIOS } from '../src/transport/scenarios'
import type { Transport } from '../src/transport/types'

/** Escáner falso que contesta de una tabla fija (para casos que el simulador no cubre). */
function escanerFalso(tabla: Record<string, string>): Transport {
  const t: Transport = {
    nombre: 'falso',
    connect: async () => {},
    disconnect: async () => {},
    write: async (texto) => {
      const cmd = texto.trim()
      setTimeout(() => t.onData?.(`${cmd}\r${tabla[cmd] ?? 'OK'}\r\r>`), 0) // con eco, como un clon recién encendido
    },
  }
  return t
}

describe('secuencia de inicio', () => {
  it.each(SCENARIOS.map((s) => [s.id, s] as const))('simulador: %s', async (_id, s) => {
    const sim = new SimulatorTransport(s.id, { delayMs: 0 })
    await sim.connect()
    const pasos: string[] = []
    const info = await inicializar(new Elm327(sim), (p) => pasos.push(p))
    expect(info.chip).toBe('ELM327 v1.5')
    expect(info.protocolo?.codigo).toBe('6')
    expect(info.vin?.vin).toBe(s.vin)
    expect(info.vin?.digitoOk).toBe(true)
    expect(info.voltaje).toBe(s.motorEncendido ? 14.2 : 12.1)
    expect(info.modulos).toEqual(['Motor', 'Transmisión'])
    expect(info.problemaVehiculo).toBeUndefined()
    expect(pasos.at(-1)).toBe('Leyendo el VIN…')
  })

  it('llave apagada: el escáner contesta pero el carro no', async () => {
    const t = escanerFalso({ ATZ: 'ELM327 v2.1', '0100': 'SEARCHING...\rUNABLE TO CONNECT', ATDPN: 'A0', ATI: 'ELM327 v2.1', ATRV: '12.4V' })
    const info = await inicializar(new Elm327(t))
    expect(info).toMatchObject({ chip: 'ELM327 v2.1', protocolo: null, vin: null, voltaje: 12.4, modulos: [] })
    expect(info.problemaVehiculo).toMatch(/llave/)
  })

  it('Ford antiguo con J1850 PWM', async () => {
    const t = escanerFalso({
      '0100': 'SEARCHING...\r41 6B 10 41 00 BE 3E B8 11 C9',
      ATDPN: 'A1',
      ATRV: '12.9V',
      '0902': '41 6B 10 49 02 01 00 00 00 31 00\r41 6B 10 49 02 02 46 41 44 50 00\r41 6B 10 49 02 03 33 46 32 39 00\r41 6B 10 49 02 04 45 4C 31 30 00\r41 6B 10 49 02 05 30 30 30 34 00',
    })
    const info = await inicializar(new Elm327(t))
    expect(info.protocolo?.tipo).toBe('legacy')
    expect(info.modulos).toEqual(['Motor'])
    expect(info.vin).toMatchObject({ vin: '1FADP3F29EL100004', marca: 'Ford', digitoOk: true })
  })
})

describe('Bluetooth', () => {
  const c = (uuid: string, p: Partial<{ notify: boolean; indicate: boolean; write: boolean; writeWithoutResponse: boolean }>) => ({
    uuid,
    properties: { notify: false, indicate: false, write: false, writeWithoutResponse: false, ...p },
  })

  it('vLinker: fff1 recibe, fff2 escribe', () => {
    const par = elegirCaracteristicas([c('fff1', { notify: true }), c('fff2', { write: true, writeWithoutResponse: true })])
    expect([par?.lectura.uuid, par?.escritura.uuid]).toEqual(['fff1', 'fff2'])
  })

  it('iCar viejo: ffe1 hace todo', () => {
    const par = elegirCaracteristicas([c('ffe1', { notify: true, writeWithoutResponse: true })])
    expect([par?.lectura.uuid, par?.escritura.uuid]).toEqual(['ffe1', 'ffe1'])
  })

  it('servicio 18f0: 2af0 recibe, 2af1 escribe', () => {
    const par = elegirCaracteristicas([c('2af1', { write: true }), c('2af0', { notify: true })])
    expect([par?.lectura.uuid, par?.escritura.uuid]).toEqual(['2af0', '2af1'])
  })

  it('sin característica que avise, no sirve', () => {
    expect(elegirCaracteristicas([c('fff2', { write: true })])).toBeNull()
  })

  it('mensajes de error en español', () => {
    expect(explicarErrorConexion(new DOMException('User cancelled the requestDevice() chooser.', 'NotFoundError')).mensaje).toBe('No se eligió ningún escáner.')
    expect(explicarErrorConexion(new DOMException('Bluetooth adapter not available.', 'NotFoundError')).mensaje).toMatch(/apagado/)
    expect(explicarErrorConexion(new ErrorSinServicio('x')).mensaje).toMatch(/no parece un escáner/)
  })
})
