# Rockola

Aplicación de Rockola en Electron.

## Carpeta `dist` (salida de build)

- La carpeta `dist/` contiene artefactos generados (build/paquetes) y no debe subirse al repositorio.
- Está agregada en `.gitignore` para evitar que se versionen por error.
- En tu entorno Windows la ruta típica es:
  - `C:\\Rockola_2025\\dist`

### Si `dist/` ya fue versionada por error
Puedes dejar de rastrearla (sin borrar archivos locales) con:

```powershell
# Dejar de rastrear dist, mantenerla en disco
git rm --cached -r dist
git commit -m "Stop tracking dist directory; keep it locally"
# Luego empuja el commit
git push
```

## Carpeta `drops` (contenido local opcional)

- Si usas sonidos/efectos locales, crea una carpeta `drops/` en la raíz:
  - `C:\\Rockola_2025\\drops`
- Puedes ignorarla también si no quieres subir su contenido pesado (añadiendo `drops/` a `.gitignore`).
- Formatos sugeridos: `.mp3`, `.wav`, `.ogg`.

