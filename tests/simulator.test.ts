import { describe, expect, it } from 'vitest'
import { SimulatorTransport, dtcBytes } from '../src/transport/simulator'
import { SCENARIOS } from '../src/transport/scenarios'
import { Elm327 } from '../src/elm/elm327'

/** Simulador conectado con la secuencia de inicio de la sección 6.2 (eco off, sin espacios, con encabezados). */
async function iniciar(escenario: string, now = () => 0) {
  const sim = new SimulatorTransport(escenario, { delayMs: 0, now })
  await sim.connect()
  const elm = new Elm327(sim)
  for (const c of ['ATZ', 'ATE0', 'ATL0', 'ATS0', 'ATH1', 'ATAT1', 'ATSP0']) await elm.send(c)
  return { sim, elm }
}

/** Bytes de datos de la respuesta del motor (7E8, trama simple). */
function datos7E8(resp: string): number[] {
  const line = resp.split('\n').find((l) => l.startsWith('7E8'))!
  const bytes = line.slice(3).match(/../g)!.map((h) => parseInt(h, 16))
  return bytes.slice(1, 1 + bytes[0]!)
}

/** Une las tramas de varias líneas (ISO 15765) del motor. */
function multitrama7E8(resp: string): number[] {
  const frames = resp.split('\n').filter((l) => l.startsWith('7E8')).map((l) => l.slice(3).match(/../g)!.map((h) => parseInt(h, 16)))
  const len = ((frames[0]![0]! & 0x0f) << 8) | frames[0]![1]!
  return [...frames[0]!.slice(2), ...frames.slice(1).flatMap((f) => f.slice(1))].slice(0, len)
}

describe('simulador ELM327', () => {
  it('se presenta como ELM327 y contesta OK a la configuración', async () => {
    const sim = new SimulatorTransport('sano', { delayMs: 0 })
    await sim.connect()
    const elm = new Elm327(sim)
    expect(await elm.send('ATZ')).toContain('ELM327 v1.5')
    expect(await elm.send('ATE0')).toContain('OK') // todavía trae eco
    expect(await elm.send('ATH1')).toBe('OK')
    expect(await elm.send('ATI')).toBe('ELM327 v1.5')
  })

  it('busca protocolo la primera vez y reporta CAN 11/500', async () => {
    const { elm } = await iniciar('sano')
    expect(await elm.send('ATDPN')).toBe('A0')
    const r = await elm.send('0100')
    expect(r.split('\n')[0]).toBe('SEARCHING...')
    expect(await elm.send('ATDPN')).toBe('A6')
    expect(await elm.send('0100')).not.toContain('SEARCHING')
  })

  it('PID 00: motor y transmisión contestan, y el mapa incluye RPM (0C)', async () => {
    const { elm } = await iniciar('sano')
    const r = await elm.send('0100')
    expect(r).toContain('7E9')
    const [svc, pid, a, b] = datos7E8(r)
    expect([svc, pid]).toEqual([0x41, 0x00])
    const bits = (a! << 24) | (b! << 16)
    expect(bits & (1 << (32 - 0x0c))).not.toBe(0) // 0C soportado
    expect(bits & (1 << (32 - 0x0a))).toBe(0) // 0A no soportado
  })

  it('RPM en ralentí ≈ 750 con la fórmula (256A+B)/4', async () => {
    const { elm } = await iniciar('sano', () => 5000)
    await elm.send('0100')
    const [, , a, b] = datos7E8(await elm.send('010C'))
    expect((256 * a! + b!) / 4).toBeGreaterThan(700)
    expect((256 * a! + b!) / 4).toBeLessThan(800)
  })

  it('varios PIDs en un comando', async () => {
    const { elm } = await iniciar('sano', () => 5000)
    await elm.send('0100')
    const d = multitrama7E8(await elm.send('010C0D05'))
    expect(d[0]).toBe(0x41)
    expect(d[1]).toBe(0x0c)
    expect(d[4]).toBe(0x0d)
    expect(d[6]).toBe(0x05)
  })

  it('sobrecalentamiento llega a 118 °C (A − 40)', async () => {
    let ms = 0
    const { elm } = await iniciar('sobrecalentamiento', () => ms)
    await elm.send('0100')
    ms = 200_000 // 200 s después de arrancar
    const [, , a] = datos7E8(await elm.send('0105'))
    expect(a! - 40).toBe(118)
  })

  it('batería baja: ATRV 12.1V y RPM 0', async () => {
    const { elm } = await iniciar('bateria_baja')
    expect(await elm.send('ATRV')).toBe('12.1V')
    await elm.send('0100')
    expect(datos7E8(await elm.send('010C')).slice(2)).toEqual([0, 0])
  })

  it('mezcla pobre: P0171 guardado, foco encendido, y Modo 04 lo borra', async () => {
    const { elm } = await iniciar('mezcla_pobre')
    await elm.send('0100')
    expect(datos7E8(await elm.send('03'))).toEqual([0x43, 1, 0x01, 0x71])
    expect(datos7E8(await elm.send('0101'))[2]).toBe(0x81) // MIL + 1 código
    expect(datos7E8(await elm.send('020200'))).toEqual([0x42, 0x02, 0x00, 0x01, 0x71]) // freeze frame
    expect(datos7E8(await elm.send('04'))).toEqual([0x44])
    expect(datos7E8(await elm.send('03'))).toEqual([0x43, 0])
    expect(datos7E8(await elm.send('0A'))).toEqual([0x4a, 1, 0x01, 0x71]) // el permanente se queda
  })

  it('fallas de encendido: P0302 pendiente', async () => {
    const { elm } = await iniciar('fallas_encendido')
    await elm.send('0100')
    expect(datos7E8(await elm.send('07'))).toEqual([0x47, 1, 0x03, 0x02])
  })

  it('VIN en varias tramas', async () => {
    for (const s of SCENARIOS) {
      const { elm } = await iniciar(s.id)
      await elm.send('0100')
      const d = multitrama7E8(await elm.send('0902'))
      expect(String.fromCharCode(...d.slice(3))).toBe(s.vin)
    }
  })

  it('VIN sin encabezados usa el formato 0:, 1:, 2:', async () => {
    const sim = new SimulatorTransport('sano', { delayMs: 0 })
    await sim.connect()
    const elm = new Elm327(sim)
    await elm.send('ATE0')
    const r = (await elm.send('0902')).split('\n')
    expect(r).toEqual(['SEARCHING...', '014', '0: 49 02 01 4A 4D 31', '1: 42 4E 31 56 37 35 4A', '2: 31 31 30 30 30 30 31'])
  })

  it('errores: ? para basura, NO DATA para PID no soportado', async () => {
    const { elm } = await iniciar('sano')
    expect(await elm.send('HOLA')).toBe('?')
    await elm.send('0100')
    expect(await elm.send('015C')).toBe('NO DATA') // temperatura de aceite: no soportada
    expect(await elm.send('0601')).toBe('NO DATA')
  })

  it('acepta el comando partido en pedazos, como llega por BLE', async () => {
    const sim = new SimulatorTransport('sano', { delayMs: 0 })
    await sim.connect()
    let out = ''
    sim.onData = (c) => (out += c)
    await sim.write('AT')
    await sim.write('I\r')
    await new Promise((r) => setTimeout(r, 5))
    expect(out).toBe('ATI\rELM327 v1.5\r\r>')
  })

  it('codifica DTC según SAE J1979', () => {
    expect(dtcBytes('P0420')).toEqual([0x04, 0x20])
    expect(dtcBytes('U0100')).toEqual([0xc1, 0x00])
    expect(dtcBytes('C1234')).toEqual([0x52, 0x34])
  })
})
