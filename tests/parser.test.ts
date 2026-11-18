import { describe, expect, it } from 'vitest'
import { explicarError, nombreModulo, parseRespuesta, parseVoltaje } from '../src/elm/parser'
import { parseProtocolo } from '../src/obd/protocolos'
import { quitarEco } from '../src/elm/elm327'

const hexDe = (s: string) => [...s].map((c) => c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')).join(' ')

describe('parseRespuesta CAN 11 bits', () => {
  it('dos módulos con espacios y relleno', () => {
    const r = parseRespuesta('7E8 06 41 00 BE 3F A8 13 00\n7E9 06 41 00 98 18 80 01 00', 'can11')
    expect(r.error).toBeUndefined()
    expect(r.mensajes).toEqual([
      { ecu: '7E8', datos: [0x41, 0x00, 0xbe, 0x3f, 0xa8, 0x13] },
      { ecu: '7E9', datos: [0x41, 0x00, 0x98, 0x18, 0x80, 0x01] },
    ])
  })

  it('sin espacios (ATS0) y con SEARCHING...', () => {
    const r = parseRespuesta('SEARCHING...\n7E804410C0BB8', 'can11')
    expect(r.mensajes).toEqual([{ ecu: '7E8', datos: [0x41, 0x0c, 0x0b, 0xb8] }])
  })

  it('arma una trama de varias líneas (VIN)', () => {
    const r = parseRespuesta('7E81014490201314641\n7E82144503346323945\n7E8224C313030303034', 'can11')
    expect(r.mensajes).toHaveLength(1)
    expect(String.fromCharCode(...r.mensajes[0]!.datos.slice(3))).toBe('1FADP3F29EL100004')
  })

  it('tramas de dos módulos intercaladas', () => {
    const r = parseRespuesta('7E8100A49020131323334\n7E9037F0912\n7E82135363738', 'can11')
    expect(r.mensajes.find((m) => m.ecu === '7E8')!.datos).toEqual([0x49, 0x02, 0x01, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37])
    expect(r.mensajes.find((m) => m.ecu === '7E9')!.datos).toEqual([0x7f, 0x09, 0x12])
  })
})

describe('parseRespuesta otros protocolos', () => {
  it('CAN 29 bits', () => {
    const r = parseRespuesta('18 DA F1 10 03 41 0D 32 00 00 00 00', 'can29')
    expect(r.mensajes).toEqual([{ ecu: '18DAF110', datos: [0x41, 0x0d, 0x32] }])
    expect(nombreModulo('18DAF110')).toBe('Motor')
  })

  it('J1850 de Ford antiguo: quita encabezado y checksum', () => {
    const r = parseRespuesta('41 6B 10 41 0C 0B B8 5A', 'legacy')
    expect(r.mensajes).toEqual([{ ecu: '10', datos: [0x41, 0x0c, 0x0b, 0xb8] }])
    expect(nombreModulo('10')).toBe('Motor')
  })

  it('ISO 9141 con "BUS INIT: ...OK" antes de los datos', () => {
    const r = parseRespuesta('BUS INIT: ...OK\n48 6B 10 41 00 BE 1F B8 10 AA', 'legacy')
    expect(r.error).toBeUndefined()
    expect(r.mensajes[0]!.datos).toEqual([0x41, 0x00, 0xbe, 0x1f, 0xb8, 0x10])
  })

  it('VIN en 5 mensajes de un protocolo antiguo', () => {
    const vin = '1FADP3F29EL100004'
    const partes = ['\0\0\0' + vin[0], vin.slice(1, 5), vin.slice(5, 9), vin.slice(9, 13), vin.slice(13)]
    const raw = partes.map((p, i) => `48 6B 10 49 02 0${i + 1} ${hexDe(p)} 00`).join('\n')
    const r = parseRespuesta(raw, 'legacy')
    expect(r.mensajes).toHaveLength(5)
    expect(r.mensajes[4]!.datos).toEqual([0x49, 0x02, 0x05, 0x30, 0x30, 0x30, 0x34])
  })
})

describe('errores del escáner', () => {
  it.each(['NO DATA', 'UNABLE TO CONNECT', 'CAN ERROR', 'BUS INIT: ...ERROR', '?', 'STOPPED'])('%s', (e) => {
    const r = parseRespuesta(e, 'can11')
    expect(r.mensajes).toEqual([])
    expect(r.error).toBe(e)
    expect(explicarError(e)).not.toMatch(/^Respuesta del escáner/)
  })

  it('error desconocido se muestra tal cual', () => {
    expect(explicarError('ACT ALERT')).toBe('Respuesta del escáner: ACT ALERT')
  })
})

describe('protocolo, voltaje y eco', () => {
  it('ATDPN', () => {
    expect(parseProtocolo('A6')).toEqual({ codigo: '6', nombre: 'CAN 11 bits, 500 kbaud', tipo: 'can11' })
    expect(parseProtocolo('1')!.tipo).toBe('legacy')
    expect(parseProtocolo('A7')!.tipo).toBe('can29')
    expect(parseProtocolo('A0')).toBeNull()
    expect(parseProtocolo('?')).toBeNull()
  })

  it('ATRV', () => {
    expect(parseVoltaje('12.6V')).toBe(12.6)
    expect(parseVoltaje('14.2 V')).toBe(14.2)
    expect(parseVoltaje('?')).toBeNull()
  })

  it('quita el eco del comando', () => {
    expect(quitarEco('ATZ\r\r\rELM327 v1.5\r\r', 'ATZ')).toBe('ELM327 v1.5')
    expect(quitarEco('01 00\r41 00 BE 3F', '0100')).toBe('41 00 BE 3F')
    expect(quitarEco('OK\r\r', 'ATE0')).toBe('OK')
  })
})
