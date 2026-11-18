import { useEffect, useRef, useState } from 'react'
import { Icon } from './icons'
import { useConexion, useLog } from './useConexion'
import { SCENARIOS } from '../transport/scenarios'
import { BleTransport } from '../transport/ble'
import type { LogEntry } from '../elm/elm327'
import { conexion, type Fuente } from '../services/conexion'

const RAPIDOS = ['ATRV', 'ATDPN', '0100', '010C', '0105', '0101', '03', '0902']
const MARCA: Record<LogEntry['dir'], string> = { tx: '>>', rx: '<<', error: '!!', info: '--' }

const hora = (ms: number) => new Date(ms).toLocaleTimeString('es-MX', { hour12: false }) + '.' + String(ms % 1000).padStart(3, '0')
const lineaLog = (e: LogEntry) => `${hora(e.hora)} ${MARCA[e.dir]} ${e.texto.replace(/\n/g, ' | ')}`

interface Props {
  fuente: Fuente
  escenario: string
  onFuente: (f: Fuente) => void
  onEscenario: (id: string) => void
}

export function Ajustes({ fuente, escenario, onFuente, onEscenario }: Props) {
  const estado = useConexion()
  const log = useLog()
  const [ocupado, setOcupado] = useState(false)
  const [comando, setComando] = useState('')
  const [copiado, setCopiado] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const conectado = estado.fase === 'conectado'

  // Baja solo el cuadro del registro, no la página.
  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [log])

  const enviar = async (cmd: string) => {
    const elm = conexion.elm
    if (!elm || ocupado) return
    setOcupado(true)
    try {
      await elm.send(cmd, cmd === '0100' ? 10000 : 5000)
    } catch {
      /* el error ya quedó en el registro */
    } finally {
      setOcupado(false)
    }
  }

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(log.map(lineaLog).join('\n'))
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      alert('No se pudo copiar. Mantén presionado el texto del registro para copiarlo a mano.')
    }
  }

  return (
    <>
      <section className="bloque" aria-labelledby="t-fuente">
        <h2 id="t-fuente">Conectar con</h2>
        <div className="opciones" role="radiogroup" aria-labelledby="t-fuente">
          <label className="opcion">
            <input type="radio" name="fuente" checked={fuente === 'ble'} onChange={() => onFuente('ble')} />
            <span>
              <strong>Escáner Bluetooth</strong>
              <small>{BleTransport.disponible() ? 'Tu Vgate u otro escáner BLE (Bluetooth 4.0).' : 'Este navegador no tiene Bluetooth web: usa Chrome en Android.'}</small>
            </span>
          </label>
          <label className="opcion">
            <input type="radio" name="fuente" checked={fuente === 'simulador'} onChange={() => onFuente('simulador')} />
            <span>
              <strong>Simulador</strong>
              <small>Para probar la app sin carro ni escáner.</small>
            </span>
          </label>
        </div>
        {estado.fase !== 'desconectado' && <p className="ayuda">El cambio se aplica la próxima vez que presiones Conectar.</p>}
      </section>

      {fuente === 'simulador' && (
        <section className="bloque" aria-labelledby="t-sim">
          <h2 id="t-sim">Escenario del simulador</h2>
          <p className="ayuda">El simulador se comporta como un escáner conectado a un carro con esta situación.</p>
          <div className="opciones" role="radiogroup" aria-labelledby="t-sim">
            {SCENARIOS.map((s) => (
              <label key={s.id} className="opcion">
                <input type="radio" name="escenario" checked={s.id === escenario} onChange={() => onEscenario(s.id)} />
                <span>
                  <strong>{s.nombre}</strong>
                  <small>
                    {s.vehiculo}. {s.descripcion}
                  </small>
                </span>
              </label>
            ))}
          </div>
        </section>
      )}

      <section className="bloque" aria-labelledby="t-consola">
        <h2 id="t-consola">Consola del escáner</h2>
        <p className="ayuda">
          Todo lo que la app manda al escáner (&gt;&gt;) y lo que contesta (&lt;&lt;). Si algo falla, usa “Copiar registro” y pégalo en Claude Code.
        </p>
        {conectado ? (
          <>
            <div className="rapidos">
              {RAPIDOS.map((c) => (
                <button key={c} className="boton chip" disabled={ocupado} onClick={() => void enviar(c)}>
                  {c}
                </button>
              ))}
            </div>
            <form
              className="manual"
              onSubmit={(e) => {
                e.preventDefault()
                const c = comando.trim().toUpperCase()
                if (c) void enviar(c)
                setComando('')
              }}
            >
              <label htmlFor="cmd" className="oculto">Comando</label>
              <input id="cmd" value={comando} onChange={(e) => setComando(e.target.value)} placeholder="Escribe un comando, ej. 010D" autoCapitalize="characters" autoComplete="off" spellCheck={false} />
              <button className="boton" type="submit" disabled={ocupado} aria-label="Enviar comando">
                <Icon name="enviar" />
              </button>
            </form>
          </>
        ) : (
          <p className="ayuda">Para mandar comandos, primero conecta desde la pantalla de Inicio.</p>
        )}
        <div className="log" role="log" ref={logRef}>
          {log.length === 0 ? (
            <p className="log-vacio">Todavía no hay tráfico. Conecta desde Inicio.</p>
          ) : (
            log.map((e, i) => (
              <div key={i} className={`log-${e.dir}`}>
                {lineaLog(e)}
              </div>
            ))
          )}
        </div>
        <div className="fila">
          <button className="boton" onClick={copiar} disabled={!log.length}>
            <Icon name="copiar" /> {copiado ? '¡Copiado!' : 'Copiar registro'}
          </button>
          <button className="boton" onClick={() => conexion.limpiarLog()} disabled={!log.length}>
            <Icon name="borrar" /> Limpiar
          </button>
        </div>
      </section>
    </>
  )
}
