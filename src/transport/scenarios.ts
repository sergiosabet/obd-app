// Escenarios del simulador: vehículos ficticios con valores físicos (rpm, °C, V, %) en función del tiempo.

export type ScenarioId =
  | 'sano'
  | 'bateria_baja'
  | 'sobrecalentamiento'
  | 'mezcla_pobre'
  | 'fallas_encendido'
  | 'catalizador'

/** PID de Modo 01 → valor físico en las unidades de la especificación (sección 7). */
export type Lecturas = Partial<Record<number, number>>

/** Clave especial en Lecturas para el voltaje que reporta el propio escáner (comando ATRV). */
export const ATRV = -1

export interface Scenario {
  id: ScenarioId
  nombre: string
  descripcion: string
  vehiculo: string
  vin: string
  motorEncendido: boolean
  guardados: string[]
  pendientes: string[]
  permanentes: string[]
  /** Bits de monitores incompletos (byte D del PID 01): 0x01 catalizador, 0x04 EVAP, 0x20 O2, 0x40 calentador O2. */
  monitoresIncompletos: number
  lecturas(t: number): Lecturas
}

// Variación suave y repetible (sin azar) para que las pruebas den siempre lo mismo.
const ondula = (t: number, periodo: number, amplitud: number) => amplitud * Math.sin((2 * Math.PI * t) / periodo)

/** Motor en ralentí que cada 30 s acelera a 2500 rpm durante 10 s, en estacionamiento. */
function motorBase(t: number, voltaje = 14.2): Lecturas {
  const acelerando = t % 30 >= 20
  const rpm = acelerando ? 2500 + ondula(t, 3, 40) : 750 + ondula(t, 4, 15)
  const carga = acelerando ? 35 : 20
  return {
    0x04: carga,
    0x05: Math.min(90, 40 + (50 * t) / 300),
    0x06: ondula(t, 2.3, 3),
    0x07: 2,
    0x0b: acelerando ? 40 : 32,
    0x0c: rpm,
    0x0d: 0,
    0x0e: acelerando ? 28 : 12,
    0x0f: 30,
    0x10: (rpm * carga) / 6000,
    0x11: acelerando ? 22 : 14,
    0x14: 0.5 + ondula(t, 1, 0.4),
    0x15: 0.65 + ondula(t, 7, 0.02),
    0x1f: t,
    0x21: 0,
    0x2f: 55,
    0x31: 3450,
    0x33: 80,
    0x42: voltaje,
    0x46: 26,
    [ATRV]: voltaje,
  }
}

function motorApagado(voltaje: number): Lecturas {
  return {
    0x04: 0, 0x05: 25, 0x06: 0, 0x07: 2, 0x0b: 80, 0x0c: 0, 0x0d: 0, 0x0e: 0, 0x0f: 25,
    0x10: 0, 0x11: 14, 0x14: 0.45, 0x15: 0.45, 0x1f: 0, 0x21: 0, 0x2f: 55, 0x31: 3450,
    0x33: 80, 0x42: voltaje, 0x46: 25, [ATRV]: voltaje,
  }
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'sano',
    nombre: 'Vehículo sano',
    descripcion: 'Todo normal, sin códigos.',
    vehiculo: 'Mazda 3 2018 2.5L',
    vin: 'JM1BN1V75J1100001',
    motorEncendido: true,
    guardados: [], pendientes: [], permanentes: [],
    monitoresIncompletos: 0,
    lecturas: (t) => motorBase(t),
  },
  {
    id: 'bateria_baja',
    nombre: 'Batería baja',
    descripcion: 'Motor apagado, llave en encendido, batería en 12.1 V.',
    vehiculo: 'Chevrolet Aveo 2015 1.6L',
    vin: '3G1TA5AF0FL100002',
    motorEncendido: false,
    guardados: [], pendientes: [], permanentes: [],
    monitoresIncompletos: 0x04, // EVAP incompleto, típico tras desconectar la batería
    lecturas: () => motorApagado(12.1),
  },
  {
    id: 'sobrecalentamiento',
    nombre: 'Sobrecalentamiento',
    descripcion: 'El refrigerante sube hasta 118 °C.',
    vehiculo: 'Ford Fiesta 2016 1.6L',
    vin: '3FADP4BJ1GM100003',
    motorEncendido: true,
    guardados: [], pendientes: [], permanentes: [],
    monitoresIncompletos: 0,
    lecturas: (t) => ({ ...motorBase(t), 0x05: Math.min(118, 85 + 0.3 * t) }),
  },
  {
    id: 'mezcla_pobre',
    nombre: 'Mezcla pobre (P0171)',
    descripcion: 'Ajuste de combustible muy positivo, peor en ralentí (fuga de vacío).',
    vehiculo: 'Ford Focus 2014 2.0L',
    vin: '1FADP3F29EL100004',
    motorEncendido: true,
    guardados: ['P0171'], pendientes: [], permanentes: ['P0171'],
    monitoresIncompletos: 0,
    lecturas: (t) => {
      const base = motorBase(t)
      const ralenti = (base[0x0c] ?? 0) < 1500
      return { ...base, 0x06: 8 + ondula(t, 2.3, 3), 0x07: ralenti ? 18 : 8, 0x21: 120 }
    },
  },
  {
    id: 'fallas_encendido',
    nombre: 'Fallas de encendido (P0300)',
    descripcion: 'Ralentí inestable; P0300 guardado y P0302 pendiente.',
    vehiculo: 'Mazda CX-5 2017 2.5L',
    vin: 'JM3KE4CY7H0100005',
    motorEncendido: true,
    guardados: ['P0300'], pendientes: ['P0302'], permanentes: ['P0300'],
    monitoresIncompletos: 0,
    lecturas: (t) => {
      const base = motorBase(t)
      return { ...base, 0x0c: (base[0x0c] ?? 0) + ondula(t, 0.7, 60) + ondula(t, 1.9, 40), 0x21: 45 }
    },
  },
  {
    id: 'catalizador',
    nombre: 'Catalizador (P0420)',
    descripcion: 'El sensor de oxígeno trasero copia al delantero.',
    vehiculo: 'Chevrolet Cruze 2013 1.8L',
    vin: '1G1PC5SB7D7100006',
    motorEncendido: true,
    guardados: ['P0420'], pendientes: [], permanentes: ['P0420'],
    monitoresIncompletos: 0,
    lecturas: (t) => ({ ...motorBase(t), 0x15: 0.5 + ondula(t, 1, 0.35), 0x21: 300 }),
  },
]

export const scenarioById = (id: string): Scenario => SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0]!
