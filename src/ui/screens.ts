import type { IconName } from './icons'

export interface ScreenInfo {
  id: string
  titulo: string
  icono: IconName
  fase: number
  /** Qué tendrá la pantalla (sección 12 de la especificación). */
  contenido: string
}

export const SCREENS: ScreenInfo[] = [
  { id: 'escaneo', titulo: 'Escaneo completo', icono: 'escaneo', fase: 4, contenido: 'Un botón que lee todo: VIN, códigos, freeze frame, monitores, Modo 06 y datos en ralentí. Termina con un resumen y la opción de análisis con IA.' },
  { id: 'tablero', titulo: 'Tablero', icono: 'tablero', fase: 2, contenido: 'Carátulas en vivo, botón Grabar, alertas emergentes y la velocidad de actualización.' },
  { id: 'codigos', titulo: 'Códigos', icono: 'codigos', fase: 3, contenido: 'Códigos guardados, pendientes y permanentes con su descripción y freeze frame. Borrado con doble confirmación.' },
  { id: 'vehiculos', titulo: 'Vehículos', icono: 'vehiculos', fase: 4, contenido: 'Tus vehículos: alta por VIN o a mano (marca, modelo, año, motor, km) y cuál está activo.' },
  { id: 'monitores', titulo: 'Monitores', icono: 'monitores', fase: 3, contenido: 'Estado de cada monitor de emisiones y si el vehículo pasaría la verificación.' },
  { id: 'diagnostico', titulo: 'Diagnóstico', icono: 'diagnostico', fase: 5, contenido: 'Resultado de la IA: urgencia, causas probables, pasos de revisión y riesgos futuros. Campo para escribir síntomas.' },
  { id: 'historial', titulo: 'Historial', icono: 'historial', fase: 4, contenido: 'Escaneos y sesiones de cada vehículo, gráficas de tendencia y exportación.' },
  { id: 'ajustes', titulo: 'Ajustes', icono: 'ajustes', fase: 0, contenido: '' },
]

export const screenById = (id: string) => SCREENS.find((s) => s.id === id)
