import { useSyncExternalStore } from 'react'
import { conexion } from '../services/conexion'

export const useConexion = () => useSyncExternalStore(conexion.subscribe, conexion.getEstado)
export const useLog = () => useSyncExternalStore(conexion.subscribe, conexion.getLog)
