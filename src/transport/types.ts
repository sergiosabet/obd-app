/** Conexión de bajo nivel con el escáner: Bluetooth real o simulador. Solo mueve texto. */
export interface Transport {
  readonly nombre: string
  connect(): Promise<void>
  disconnect(): Promise<void>
  /** Envía texto tal cual (el controlador ELM agrega el \r). */
  write(text: string): Promise<void>
  /** Llega texto del escáner, posiblemente en pedazos (BLE entrega de a 20 bytes). */
  onData?: (chunk: string) => void
  /** Se cortó la conexión sin que el usuario la cerrara. */
  onDisconnect?: () => void
  /** Avisos para la consola de depuración (qué identificadores Bluetooth se usaron, etc.). */
  onLog?: (texto: string) => void
}
