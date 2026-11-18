import { useEffect, useState } from 'react'
import { Icon } from './icons'
import { SCREENS, screenById, type ScreenInfo } from './screens'
import { Ajustes } from './Ajustes'
import { leer, guardar } from './prefs'
import { useConexion } from './useConexion'
import { scenarioById } from '../transport/scenarios'
import { conexion, type EstadoConexion, type Fuente } from '../services/conexion'

const rutaActual = () => location.hash.replace(/^#\/?/, '') || 'inicio'

export function App() {
  const [ruta, setRuta] = useState(rutaActual)
  const [escenario, setEscenario] = useState(() => leer('escenario', 'sano'))
  const [fuente, setFuente] = useState<Fuente>(() => (leer('fuente', 'ble') === 'simulador' ? 'simulador' : 'ble'))

  useEffect(() => {
    const onHash = () => {
      setRuta(rutaActual())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const prefs = {
    fuente,
    escenario,
    onFuente: (f: Fuente) => {
      setFuente(f)
      guardar('fuente', f)
    },
    onEscenario: (id: string) => {
      setEscenario(id)
      guardar('escenario', id)
    },
  }

  const screen = screenById(ruta)
  if (!screen) return <Inicio fuente={fuente} escenario={escenario} />

  return (
    <div className="app">
      <header className="barra">
        <a className="atras" href="#/" aria-label="Volver al inicio">
          <Icon name="atras" />
        </a>
        <h1>{screen.titulo}</h1>
      </header>
      <main className="contenido">{screen.id === 'ajustes' ? <Ajustes {...prefs} /> : <Pendiente screen={screen} />}</main>
    </div>
  )
}

const nombreFuente = (fuente: Fuente, escenario: string) =>
  fuente === 'ble' ? 'Escáner Bluetooth' : `Simulador: ${scenarioById(escenario).nombre}`

function Inicio({ fuente, escenario }: { fuente: Fuente; escenario: string }) {
  const estado = useConexion()
  const principales = SCREENS.filter((s) => ['escaneo', 'tablero', 'codigos'].includes(s.id))
  const demas = SCREENS.filter((s) => !principales.includes(s))
  const ocupado = estado.fase === 'conectando' || estado.fase === 'reconectando'
  return (
    <div className="app">
      <main className="contenido inicio">
        <h1 className="marca">Diagnóstico OBD2</h1>
        <Estado estado={estado} fuente={nombreFuente(fuente, escenario)} />

        <nav className="acciones" aria-label="Acciones principales">
          {estado.fase === 'conectado' ? (
            <button className="accion accion-ancha accion-secundaria" onClick={() => void conexion.desconectar()}>
              <span className="accion-titulo">Desconectar</span>
            </button>
          ) : (
            <button className="accion accion-principal" disabled={ocupado} onClick={() => void conexion.conectar(fuente, escenario)}>
              <Icon name="conectar" size={32} />
              <span className="accion-titulo">{ocupado ? 'Conectando…' : 'Conectar'}</span>
              <span className="accion-nota">
                {ocupado ? estado.paso : `Con: ${nombreFuente(fuente, escenario)}. Se cambia en Ajustes.`}
              </span>
            </button>
          )}
          {principales.map((s) => (
            <a key={s.id} className={s.id === 'escaneo' ? 'accion accion-ancha' : 'accion'} href={`#/${s.id}`}>
              <Icon name={s.icono} size={32} />
              <span className="accion-titulo">{s.titulo}</span>
            </a>
          ))}
        </nav>

        <nav className="lista" aria-label="Más pantallas">
          {demas.map((s) => (
            <a key={s.id} href={`#/${s.id}`}>
              <Icon name={s.icono} />
              <span>{s.titulo}</span>
            </a>
          ))}
        </nav>
        <p className="version">Versión {__VERSION__} · Fase 1</p>
      </main>
    </div>
  )
}

function Estado({ estado, fuente }: { estado: EstadoConexion; fuente: string }) {
  const { fase, info, error } = estado
  const titulo = { desconectado: 'Sin conectar', conectando: 'Conectando…', conectado: 'Conectado', reconectando: 'Reconectando…' }[fase]
  return (
    <section className="estado" aria-label="Estado de la conexión" aria-live="polite">
      <p className="estado-linea">
        <span className={`punto punto-${fase}`} aria-hidden="true" /> {titulo}
      </p>
      <p className="estado-detalle">{fase === 'desconectado' ? fuente : estado.dispositivo ?? fuente}</p>
      {fase === 'reconectando' && <p className="estado-detalle">{estado.paso}</p>}

      {error && fase === 'desconectado' && (
        <div className="aviso aviso-error" role="alert">
          <p className="aviso-titulo">{error.mensaje}</p>
          {error.ayuda.length > 0 && (
            <ul>
              {error.ayuda.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {info && fase !== 'desconectado' && fase !== 'conectando' && (
        <>
          {info.problemaVehiculo && (
            <div className="aviso aviso-alerta" role="alert">
              <p className="aviso-titulo">El escáner está conectado, pero el carro no contesta</p>
              <p>{info.problemaVehiculo}</p>
            </div>
          )}
          <dl className="ficha">
            <div>
              <dt>VIN</dt>
              <dd>
                {info.vin ? (
                  <>
                    <span className="dato">{info.vin.vin}</span>
                    <span className="sub">
                      {[info.vin.marca, info.vin.anio].filter(Boolean).join(' · ') || 'Marca no reconocida'}
                      {!info.vin.digitoOk && ' · el dígito verificador no cuadra'}
                    </span>
                  </>
                ) : (
                  <span className="sub">El vehículo no reporta su VIN. Se podrá capturar a mano (Fase 4).</span>
                )}
              </dd>
            </div>
            <div>
              <dt>Voltaje</dt>
              <dd className="dato">{info.voltaje !== null ? `${info.voltaje.toFixed(1)} V` : '—'}</dd>
            </div>
            <div>
              <dt>Protocolo</dt>
              <dd>{info.protocolo?.nombre ?? 'No detectado'}</dd>
            </div>
            <div>
              <dt>Chip</dt>
              <dd>
                {info.chip || '—'} <span className="sub">(según el escáner; los clones a veces mienten)</span>
              </dd>
            </div>
            {info.modulos.length > 0 && (
              <div>
                <dt>Responden</dt>
                <dd>{info.modulos.join(', ')}</dd>
              </div>
            )}
          </dl>
        </>
      )}
    </section>
  )
}

function Pendiente({ screen }: { screen: ScreenInfo }) {
  return (
    <div className="pendiente">
      <p className="pendiente-fase">Se construye en la Fase {screen.fase}</p>
      <p>{screen.contenido}</p>
    </div>
  )
}
