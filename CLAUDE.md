# App de diagnóstico OBD2 (Sergio)
- Especificación completa: docs/especificacion-app-obd2.pdf. Síguela.
- Construye una fase a la vez. Al terminar: resumen, pasos de prueba
  en español y ESPERA autorización antes de la siguiente fase.
- El usuario no es programador: instrucciones paso a paso, sin jerga.
- Todo texto de la interfaz en español de México.
- TypeScript estricto. Mantén separadas las capas: transport, elm,
  obd, rules, ai, ui. El simulador debe poder reemplazar al BLE.
- Cada decodificador y fórmula lleva pruebas automáticas.
- Nunca escribas la llave de API en el código, repo o logs.
- La app es de solo lectura; Modo 04 solo con doble confirmación.
- Si algo de la especificación no se puede hacer, dilo antes de
  cambiar el plan y propone alternativa.
- Cuando el usuario pegue un log de la consola, analízalo primero
  antes de cambiar código.

## Comandos
- `npm run dev` servidor local · `npm test` pruebas · `npm run build` compilación
- Se publica solo en GitHub Pages al subir a la rama `main` (.github/workflows/deploy.yml).
