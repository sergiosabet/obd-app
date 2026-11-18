import { useEffect, useState } from 'react'
import { Icon } from './icons'
import { SCREENS, screenById, type ScreenInfo } from './screens'
import { Ajustes } from './Ajustes'
import { leer, guardar } from './prefs'
import { scenarioById } from '../transport/scenarios'

const rutaActual = () => location.hash.replace(/^#\/?/, '') || 'inicio'

export function App() {
  const [ruta, setRuta] = useState(rutaActual)
  const [escenario, setEscenario] = useState(() => leer('escenario', 'sano'))

  useEffect(() => {
    const onHash = () => {
      setRuta(rutaActual())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const cambiarEscenario = (id: string) => {
    setEscenario(id)
    guardar('escenario', id)
  }

  const screen = screenById(ruta)
  if (!screen) return <Inicio escenario={escenario} />

  return (
    <div className="app">
      <header className="barra">
        <a className="atras" href="#/" aria-label="Volver al inicio">
          <Icon name="atras" />
        </a>
        <h1>{screen.titulo}</h1>
      </header>
      <main className="contenido">
        {screen.id === 'ajustes' ? <Ajustes escenario={escenario} onEscenario={cambiarEscenario} /> : <Pendiente screen={screen} />}
      </main>
    </div>
  )
}

function Inicio({ escenario }: { escenario: string }) {
  const sim = scenarioById(escenario)
  const principales = SCREENS.filter((s) => ['escaneo', 'tablero', 'codigos'].includes(s.id))
  const demas = SCREENS.filter((s) => !principales.includes(s))
  return (
    <div className="app">
      <main className="contenido inicio">
        <h1 className="marca">Diagnóstico OBD2</h1>
        <section className="estado" aria-label="Estado de la conexión">
          <p className="estado-linea">
            <span className="punto" aria-hidden="true" /> Sin conectar
          </p>
          <p className="estado-detalle">
            Modo simulador: <strong>{sim.nombre}</strong> · {sim.vehiculo}
          </p>
        </section>

        <nav className="acciones" aria-label="Acciones principales">
          <a className="accion accion-principal" href="#/ajustes">
            <Icon name="conectar" size={32} />
            <span className="accion-titulo">Conectar</span>
            <span className="accion-nota">El escáner real llega en la Fase 1. Por ahora: probar el simulador.</span>
          </a>
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
        <p className="version">Versión de prueba · Fase 0</p>
      </main>
    </div>
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
