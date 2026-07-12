# Dota Yanapay

Agente táctico flotante para Dota 2. Lee el estado permitido por GSI, detecta
posiciones visibles en el minimapa, consulta DeepSeek V4 Flash y muestra y pronuncia
consejos breves. También acepta preguntas por voz.

## Flujo

```text
Dota GSI + minimapa → combinador → filtro delta → DeepSeek → overlay + voz
                                               ↑
                                      pregunta por micrófono
```

Todo excepto la consulta de texto a DeepSeek se procesa localmente. No se envían
capturas de pantalla a la API.

## Instalación automática

Requiere Node.js 20+, Python 3.11+ y Windows 10/11.

```powershell
npm install
```

Ese comando:

- Crea o actualiza `.env` sin sobrescribir credenciales existentes.
- Genera un token GSI local seguro.
- Instala OpenCV, MSS y NumPy si faltan.
- Detecta las bibliotecas de Steam.
- Copia una configuración GSI con el token correcto a Dota 2.

La clave de DeepSeek es el único secreto que debes completar manualmente:

```env
DEEPSEEK_API_KEY=tu-clave-real
```

Si el instalador no encuentra Dota, configura la ruta que contiene `game/dota`:

```env
DOTA2_PATH=D:\SteamLibrary\steamapps\common\dota 2 beta
```

Después ejecuta:

```powershell
npm run setup
```

## Iniciar la aplicación

```powershell
npm run app
```

Este comando abre el overlay y arranca automáticamente el servidor GSI y la visión.
Puede ejecutarse antes o después de abrir Dota 2.

- Di en una sola frase **“Yanapay” + tu pregunta**.
- `Ctrl+Shift+Espacio` permanece como respaldo.
- Yanapay pronuncia automáticamente cada consejo nuevo.
- Para que el overlay aparezca sobre el juego, usa Dota en modo ventana sin bordes.
- Para reconocimiento en español, instala un paquete de voz desde Configuración de
  Windows > Hora e idioma > Voz.

## Calibrar el minimapa

La configuración está en `components/vision/config/minimap.json`. De forma
predeterminada se captura únicamente un cuadrado inferior izquierdo equivalente al
27% de la altura del monitor. Ajusta `side`, `sizeFractionOfScreenHeight` o
`paddingPixels` si cambias la ubicación, escala del HUD o resolución.

Para inspeccionar el recorte durante una calibración, establece temporalmente
`VISION_DEBUG=true`; se guardará solo el recorte del minimapa, nunca la pantalla
completa.

## Comandos útiles

```powershell
npm install          # Instalación completa y configuración de Dota
npm run setup        # Repetir configuración sin reinstalar npm
npm run app          # Aplicación completa
npm start            # Solo servidor GSI
npm run api:smoke    # Prueba facturable con estado simulado
npm test             # Pruebas locales, sin llamadas externas
```

Diagnóstico del servidor:

```text
http://127.0.0.1:3000/health
http://127.0.0.1:3000/state
http://127.0.0.1:3000/advice
```

## Limitaciones

GSI no expone información enemiga oculta ni garantiza datos como el estado exacto
de Roshan. La visión detecta únicamente marcadores visibles del minimapa y necesita
calibración cuando cambia el HUD. Yanapay no controla el juego ni inyecta código en
Dota 2.
