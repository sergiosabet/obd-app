import { describe, expect, it } from 'vitest'
import { anioVin, decodificarVin, digitoVerificadorOk, vinDesdeMensajes } from '../src/obd/vin'

const bytes = (s: string) => [...s].map((c) => c.charCodeAt(0))

describe('VIN', () => {
  it('dígito verificador', () => {
    expect(digitoVerificadorOk('1M8GDM9AXKP042788')).toBe(true) // ejemplo clásico con X
    expect(digitoVerificadorOk('JM1BN1V75J1100001')).toBe(true)
    expect(digitoVerificadorOk('JM1BN1V76J1100001')).toBe(false)
    expect(digitoVerificadorOk('JM1BN1V75J110000')).toBe(false) // 16 caracteres
  })

  it('marca y año', () => {
    expect(decodificarVin('JM1BN1V75J1100001', 2026)).toEqual({ vin: 'JM1BN1V75J1100001', digitoOk: true, marca: 'Mazda', anio: 2018 })
    expect(decodificarVin('3G1TA5AF0FL100002', 2026)).toMatchObject({ marca: 'Chevrolet', anio: 2015 })
    expect(decodificarVin('1FADP3F29EL100004', 2026)).toMatchObject({ marca: 'Ford', anio: 2014 })
    expect(decodificarVin('LVSHFFAC5PF000000', 2026)).toMatchObject({ marca: 'Ford', anio: 2023 })
    expect(decodificarVin('ZZZ00000000000000', 2026).marca).toBeUndefined()
  })

  it('año ambiguo se resuelve con la posición 7 y el año actual', () => {
    expect(anioVin('1G1JC1244T0000000', 2026)).toBe(1996) // posición 7 numérica → ciclo viejo
    expect(anioVin('1G1JC1A44T0000000', 2026)).toBe(2026) // letra → ciclo nuevo
    expect(anioVin('1G1JC1A44T0000000', 2024)).toBe(1996) // 2026 todavía no existe
    expect(anioVin('1G1JC124450000000', 2026)).toBe(2005)
    expect(anioVin('1G1JC1244A0000000', 2026)).toBe(2010) // 1980 no tiene OBD2
  })

  it('arma el VIN desde CAN (una trama) con relleno', () => {
    expect(vinDesdeMensajes([{ ecu: '7E8', datos: [0x49, 0x02, 0x01, ...bytes('JM1BN1V75J1100001')] }])).toBe('JM1BN1V75J1100001')
    expect(vinDesdeMensajes([{ ecu: '7E8', datos: [0x49, 0x02, 0x01, 0, 0, 0xff, ...bytes('JM1BN1V75J1100001')] }])).toBe('JM1BN1V75J1100001')
  })

  it('arma el VIN desde 5 mensajes en desorden', () => {
    const vin = '1FADP3F29EL100004'
    const partes = ['\0\0\0' + vin[0], vin.slice(1, 5), vin.slice(5, 9), vin.slice(9, 13), vin.slice(13)]
    const mensajes = partes.map((p, i) => ({ ecu: '10', datos: [0x49, 0x02, i + 1, ...bytes(p)] })).reverse()
    expect(vinDesdeMensajes(mensajes)).toBe(vin)
  })

  it('sin VIN', () => {
    expect(vinDesdeMensajes([])).toBeNull()
    expect(vinDesdeMensajes([{ ecu: '7E8', datos: [0x49, 0x02, 0x01, ...bytes('ABC')] }])).toBeNull()
  })
})
