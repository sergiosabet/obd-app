// Preferencias pequeñas del celular. shortcut: localStorage; el historial real irá en IndexedDB (Fase 4).
export function leer(clave: string, porDefecto: string): string {
  try {
    return localStorage.getItem(clave) ?? porDefecto
  } catch {
    return porDefecto
  }
}

export function guardar(clave: string, valor: string) {
  try {
    localStorage.setItem(clave, valor)
  } catch {
    /* sin almacenamiento (modo incógnito): se usa el valor en memoria */
  }
}
