import { useEffect, useRef, useState } from 'react'
import { Icon } from './icons'
import { SCENARIOS } from '../transport/scenarios'
import { SimulatorTransport } from '../transport/simulator'
import { Elm327, type LogEntry } from '../elm/elm327'

// Secuencia de inicio de la sección 6.2.
const SECUENCIA = ['ATZ', 'ATE0', 'ATL0', 'ATS0', 'ATH1', 'ATAT1', 'ATSP0', '0100', 'ATDPN', 'ATI', 'ATRV', '0902']
const RAPIDOS = ['010C', '0105', '0101', '03', '07', '0A', 'ATRV']
const MAX_LOG = 500

const hora = (ms: number) => new Date(ms).toLocaleTimeString('es-MX', { hour12: false }) + '.' + String(ms % 1000).padStart(3, '0')
const lineaLog = (e: LogEntry) => `${hora(e.hora)} ${e.dir === 'tx' ? '>>' : e.dir === 'rx' ? '<<' : '!!'} ${e.texto.replace(/\n/g, ' | ')}`

export function Ajustes({ escenario, onEscenario }: { escenario: string; onEscenario: (id: string) => void }) {
  const [log, setLog] = useState<LogEntry[]>([])
  const [ocupado, setOcupado] = useState(false)
  const [comando, setComando] = useState('')
  const [copiado, setCopiado] = useState(false)
  const elmRef = useRef<Elm327 | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  // Un simulador nuevo por escenario.
  useEffect(() => {
    const sim = new SimulatorTransport(escenario)
    const elm = new Elm327(sim)
    elm.onLog = (e) => setLog((l) => [...l, e].slice(-MAX_LOG))
    void sim.connect()
    elmRef.current = elm
    setLog([])
    return () => void sim.disconnect()
  }, [escenario])

  // Baja solo el cuadro del registro, no la página.
  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [log])

  const enviar = async (cmds: string[]) => {
    const elm = elmRef.current
    if (!elm || ocupado) return
    setOcupado(true)
    try {
      for (const c of cmds) await elm.send(c, c === '0100' ? 10000 : 2000)
    } catch {
      /* el error ya quedó en el log */
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
      <section className="bloque" aria-labelledby="t-sim">
        <h2 id="t-sim">Escenario del simulador</h2>
        <p className="ayuda">El simulador se comporta como un escáner conectado a un carro con esta situación.</p>
        <div className="opciones" role="radiogroup" aria-labelledby="t-sim">
          {SCENARIOS.map((s) => (
            <label key={s.id} className="opcion">
              <input type="radio" name="escenario" value={s.id} checked={s.id === escenario} onChange={() => onEscenario(s.id)} />
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

      <section className="bloque" aria-labelledby="t-consola">
        <h2 id="t-consola">Consola del escáner</h2>
        <p className="ayuda">Cada comando enviado (&gt;&gt;) y la respuesta cruda (&lt;&lt;). Si algo falla, usa “Copiar registro” y pégalo en Claude Code.</p>
        <button className="boton boton-principal" disabled={ocupado} onClick={() => enviar(SECUENCIA)}>
          {ocupado ? 'Enviando…' : 'Secuencia de inicio'}
        </button>
        <div className="rapidos">
          {RAPIDOS.map((c) => (
            <button key={c} className="boton chip" disabled={ocupado} onClick={() => enviar([c])}>
              {c}
            </button>
          ))}
        </div>
        <form
          className="manual"
          onSubmit={(e) => {
            e.preventDefault()
            const c = comando.trim().toUpperCase()
            if (c) void enviar([c])
            setComando('')
          }}
        >
          <label htmlFor="cmd" className="oculto">Comando</label>
          <input id="cmd" value={comando} onChange={(e) => setComando(e.target.value)} placeholder="Escribe un comando, ej. 010D" autoCapitalize="characters" autoComplete="off" spellCheck={false} />
          <button className="boton" type="submit" disabled={ocupado} aria-label="Enviar comando">
            <Icon name="enviar" />
          </button>
        </form>
        <div className="log" role="log" aria-live="polite" ref={logRef}>
          {log.length === 0 ? <p className="log-vacio">Todavía no hay tráfico. Presiona “Secuencia de inicio”.</p> : log.map((e, i) => (
            <div key={i} className={`log-${e.dir}`}>{lineaLog(e)}</div>
          ))}
        </div>
        <div className="fila">
          <button className="boton" onClick={copiar} disabled={!log.length}>
            <Icon name="copiar" /> {copiado ? '¡Copiado!' : 'Copiar registro'}
          </button>
          <button className="boton" onClick={() => setLog([])} disabled={!log.length}>
            <Icon name="borrar" /> Limpiar
          </button>
        </div>
      </section>
    </>
  )
}
