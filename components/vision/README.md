# Vision del minimapa

Captura exclusivamente la region configurable del minimapa mediante `mss`, detecta
los colores de los diez slots con OpenCV y publica las posiciones en
`POST /vision` del servidor local.

Instalacion:

```powershell
npm run vision:install
```

La configuracion predeterminada asume minimapa abajo a la izquierda y un tamaño
del 27% de la altura de pantalla. Ajusta `config/minimap.json` si la escala del HUD
o la ubicacion del minimapa son diferentes.
