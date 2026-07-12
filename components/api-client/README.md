# Cliente de DeepSeek

Convierte un estado compacto de la partida en un consejo tactico breve usando
`deepseek-v4-flash`, sin modo de razonamiento y con salida JSON.

## Prueba manual

Configura `DEEPSEEK_API_KEY` en el `.env` de la raiz y ejecuta:

```powershell
npm run api:smoke
```

Esta es la unica prueba que realiza una llamada facturable. `npm test` utiliza un
servidor simulado y nunca contacta a DeepSeek.
