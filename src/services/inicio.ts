// Secuencia de inicio de la sección 6.2: deja el escáner listo y lee chip, protocolo, voltaje y VIN.
import type { Elm327 } from '../elm/elm327'
import { explicarError, nombreModulo, parseRespuesta, parseVoltaje } from '../elm/parser'
import { parseProtocolo, type Protocolo } from '../obd/protocolos'
import { decodificarVin, vinDesdeMensajes, type InfoVin } from '../obd/vin'

export interface InfoEscaner {
  /** Lo que dice ATI. Algunos clones mienten, es solo informativo. */
  chip: string
  protocolo: Protocolo | null
  vin: InfoVin | null
  voltaje: number | null
  /** Módulos que contestaron (Motor, Transmisión…). */
  modulos: string[]
  /** El escáner contesta pero el carro no (llave apagada, etc.). */
  problemaVehiculo?: string
}

/** Reinicia el escáner y lo configura (también se usa al reconectar). */
export async function configurar(elm: Elm327) {
  await elm.send('ATZ', 4000)
  for (const c of ['ATE0', 'ATL0', 'ATS0', 'ATH1', 'ATAT1']) await elm.send(c)
}

export async function inicializar(elm: Elm327, avisar: (paso: string) => void = () => {}): Promise<InfoEscaner> {
  avisar('Reiniciando el escáner…')
  await configurar(elm)
  await elm.send('ATSP0')

  avisar('Buscando el protocolo del carro (hasta 10 s)…')
  const r0100 = await elm.send('0100', 10000)
  const protocolo = parseProtocolo(await elm.send('ATDPN'))
  const chip = (await elm.send('ATI')).split('\n').pop() ?? ''
  const voltaje = parseVoltaje(await elm.send('ATRV'))

  const tipo = protocolo?.tipo ?? 'can11'
  const resp = parseRespuesta(r0100, tipo)
  const modulos = [...new Set(resp.mensajes.map((m) => nombreModulo(m.ecu)))]
  if (!resp.mensajes.length) {
    return { chip, protocolo, vin: null, voltaje, modulos, problemaVehiculo: explicarError(resp.error ?? 'NO DATA') }
  }

  avisar('Leyendo el VIN…')
  const vinTexto = vinDesdeMensajes(parseRespuesta(await elm.send('0902', 5000), tipo).mensajes)
  return { chip, protocolo, vin: vinTexto ? decodificarVin(vinTexto) : null, voltaje, modulos }
}
