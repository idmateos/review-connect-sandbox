# Estudio Norte · Review Connect sandbox

Web ficticia para comprobar revisiones visuales y publicaciones automáticas.

- Web: https://idmateos.github.io/review-connect-sandbox/
- Panel de revisión: https://review.igordiaz.com

Incluye tarjetas, botones, un icono SVG, un modal y un formulario sin envío de datos. El acceso a las revisiones se concede desde Review Connect mediante invitaciones.

## Desarrollo

Requiere Node 24. No necesita instalar paquetes.

```sh
node build.mjs
python3 -m http.server 4403 --bind 127.0.0.1 --directory dist
```

Abre http://127.0.0.1:4403. El script de Review Connect se inserta en el artefacto durante la publicación, no en los archivos fuente.

## Publicar una versión para revisar

Haz los cambios necesarios en `public/`, crea tus commits y súbelos a `main`. Cuando quieras publicar:

```sh
git tag review/v3
git push origin review/v3
```

Usa un tag nuevo para cada publicación. Los commits intermedios no generan otra revisión. El workflow compila, inserta el script, despliega en Pages, activa la publicación y la marca lista en la revisión estable. También puede ejecutarse manualmente desde Actions.

Las publicaciones conservan su identidad de build y commit. Pages reemplaza la web publicada; no conserva URLs individuales para visitar versiones antiguas. Review Connect conserva los comentarios y su versión de origen.

## Configuración inicial de GitHub

En Settings → Pages, selecciona GitHub Actions. El entorno `github-pages` debe permitir la rama `main` y los tags `review/*`.

Variables de Actions: `RC_API_URL`, `RC_PROJECT_ID`, `RC_TARGET_ID`, `RC_PUBLICATION_URL`.

Secreto de Actions: `RC_DEPLOY_TOKEN`, limitado al proyecto con permisos `deployments:write` y `reviews:publish`. Nunca se incorpora al HTML.

`tools/review-connect.mjs` es el ejecutable portable generado por Review Connect. Para actualizarlo, compila el servidor de Review Connect y copia de nuevo su archivo `dist/automation/review-connect.mjs`.
