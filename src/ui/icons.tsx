// Íconos de trazo propio (24×24, trazo 1.75) para que todos tengan el mismo peso.
const paths: Record<string, string> = {
  conectar: 'M7 7l10 10-5 5V2l5 5L7 17',
  escaneo: 'M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3M4 12h16',
  tablero: 'M4 17a8 8 0 1 1 16 0M12 17l4-5M3 20h18',
  codigos: 'M12 3l10 18H2zM12 10v5M12 18v.01',
  vehiculos: 'M3 16v-4l2-5h14l2 5v4zM3 16v2M21 16v2M7 13h.01M17 13h.01',
  monitores: 'M9 11l3 3 7-8M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h10',
  diagnostico: 'M12 3a6 6 0 0 0-3 11.2V17h6v-2.8A6 6 0 0 0 12 3zM9 21h6',
  historial: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  ajustes: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4',
  atras: 'M15 5l-7 7 7 7',
  copiar: 'M9 9h11v11H9zM5 15H4V4h11v1',
  enviar: 'M5 12h14M13 6l6 6-6 6',
  borrar: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
}

export type IconName = keyof typeof paths

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}
