/* global AbortSignal */
// scripts/review-release.ts
import { parseArgs } from "node:util";
import { readFile as readFile2 } from "node:fs/promises";
import { resolve } from "node:path";

// scripts/lib/review-release.ts
import { createHash, randomUUID } from "node:crypto";
import {
  readdir,
  readFile,
  writeFile,
  rename,
  mkdir,
  lstat
} from "node:fs/promises";
import { join, dirname } from "node:path";
var start = "<!-- review-connect:start -->";
var end = "<!-- review-connect:end -->";
var escapeAttribute = (value) => value.replace(
  /[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
);
function reviewScript(identity) {
  const metadata = [
    ["version-label", identity.versionLabel],
    ["commit-sha", identity.commitSha]
  ].filter(([, value]) => value).map(([name, value]) => ` data-${name}="${escapeAttribute(value)}"`).join("");
  return `${start}
<script type="module" src="${escapeAttribute(identity.apiUrl)}/sdk/review-connect.js" data-review-connect data-api-url="${escapeAttribute(identity.apiUrl)}" data-project-id="${escapeAttribute(identity.projectId)}" data-deployment-id="${escapeAttribute(identity.deploymentId)}" data-build-id="${escapeAttribute(identity.buildId)}"${metadata}></script>
${end}`;
}
function tags(html) {
  const found = [];
  let offset = 0;
  while ((offset = html.indexOf("<", offset)) !== -1) {
    if (html.startsWith("<!--", offset)) {
      const stop2 = html.indexOf("-->", offset + 4);
      if (stop2 < 0) break;
      found.push({
        name: "!comment",
        close: false,
        raw: html.slice(offset, stop2 + 3),
        offset
      });
      offset = stop2 + 3;
      continue;
    }
    const match = /^<\s*(\/?)\s*([a-z][a-z0-9:-]*)\b/i.exec(html.slice(offset));
    if (!match) {
      offset++;
      continue;
    }
    let stop = offset + match[0].length, quote = "";
    for (; stop < html.length; stop++) {
      const c = html[stop];
      if (quote) {
        if (c === quote) quote = "";
      } else if (c === '"' || c === "'") quote = c;
      else if (c === ">") break;
    }
    if (stop === html.length) throw new Error("HTML incompleto");
    const name = match[2].toLowerCase(), close = !!match[1];
    found.push({ name, close, raw: html.slice(offset, stop + 1), offset });
    offset = stop + 1;
    if (!close && ["script", "style", "textarea", "title"].includes(name)) {
      const closing = new RegExp(`</${name}\\s*>`, "ig");
      closing.lastIndex = offset;
      const result = closing.exec(html);
      if (!result) throw new Error("HTML incompleto");
      offset = result.index;
    }
  }
  return found;
}
function injectReviewScript(source, snippet) {
  let html = source;
  const markers = tags(html).filter(
    (t) => t.name === "!comment" && (t.raw === start || t.raw === end)
  );
  const begin = markers.find((t) => t.raw === start)?.offset ?? -1, finish = markers.find((t) => t.raw === end)?.offset ?? -1;
  if (begin >= 0 || finish >= 0) {
    if (begin < 0 || finish < begin || markers.length !== 2)
      throw new Error("Bloque Review Connect incompleto o duplicado");
    html = html.slice(0, begin) + html.slice(finish + end.length).replace(/^\r?\n/, "");
  }
  const parsed = tags(html);
  if (parsed.some(
    (t) => t.name === "script" && !t.close && /\bdata-review-connect(?:\s|=|>)/i.test(t.raw)
  ))
    throw new Error(
      "Ya existe una instalaci\xF3n manual de Review Connect; ret\xEDrala una vez antes de automatizar."
    );
  const destination = parsed.find((t) => t.name === "head" && t.close) ?? parsed.find((t) => t.name === "body" && t.close);
  if (!destination)
    throw new Error(
      "Se requiere un documento HTML completo con cierre head o body; usa --snippet-out para SSR."
    );
  return html.slice(0, destination.offset).replace(/\n?$/, "\n") + snippet + "\n" + html.slice(destination.offset);
}
async function htmlFiles(directory) {
  if ((await lstat(directory)).isSymbolicLink())
    throw new Error("No se modifican enlaces simb\xF3licos en el artefacto");
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink())
      throw new Error("No se modifican enlaces simb\xF3licos en el artefacto");
    if (entry.isDirectory()) files.push(...await htmlFiles(path));
    else if (entry.isFile() && /\.html?$/i.test(entry.name))
      files.push({ path, html: await readFile(path, "utf8") });
  }
  return files;
}
async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true });
  const temp = path + "." + randomUUID() + ".tmp";
  await writeFile(temp, content, { mode: 420 });
  await rename(temp, path);
}
function publicationId(projectId, key) {
  const hash = createHash("sha256").update(projectId + ":" + key).digest();
  hash[6] = hash[6] & 15 | 64;
  hash[8] = hash[8] & 63 | 128;
  const h = hash.subarray(0, 16).toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// scripts/review-release.ts
var [command, ...args] = process.argv.slice(2);
var { values } = parseArgs({
  args,
  options: Object.fromEntries(
    [
      "project-id",
      "target-id",
      "build-id",
      "commit-sha",
      "version-label",
      "url",
      "publication-key",
      "out",
      "html-dir",
      "snippet-out",
      "manifest",
      "summary"
    ].map((k) => [k, { type: "string" }])
  )
});
function required(key) {
  const value = values[key];
  if (typeof value !== "string" || !value)
    throw new Error("--" + key + " es obligatorio");
  return value;
}
function publicUrl(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new Error("URL no v\xE1lida");
  return value.replace(/\/$/, "");
}
var apiUrl = publicUrl(process.env.RC_API_URL ?? "");
var token = process.env.RC_DEPLOY_TOKEN;
if (!token)
  throw new Error("RC_DEPLOY_TOKEN con deployments:write es obligatorio");
async function request(method, path, body) {
  const response = await fetch(apiUrl + "/api/v1" + path, {
    method,
    headers: {
      authorization: "Bearer " + token,
      "content-type": "application/json"
    },
    body: JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(3e4)
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(`Review Connect: ${data.code ?? response.status}`);
  return data;
}
var uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
if (command === "prepare") {
  const projectId = required("project-id"), targetId = required("target-id"), buildId = required("build-id"), url = publicUrl(required("url"));
  if (!uuid.test(projectId) || !uuid.test(targetId))
    throw new Error("Identificador de proyecto/sitio inv\xE1lido");
  const output = resolve(required("out")), key = required("publication-key");
  if (!values["html-dir"] && !values["snippet-out"])
    throw new Error("Indica --html-dir o --snippet-out");
  const files = values["html-dir"] ? await htmlFiles(resolve(values["html-dir"])) : [];
  if (values["html-dir"] && !files.length)
    throw new Error(
      "No hay documentos HTML en --html-dir; para SSR usa --snippet-out"
    );
  for (const file of files) injectReviewScript(file.html, "");
  const commitSha = values["commit-sha"], versionLabel = values["version-label"];
  await request("POST", `/projects/${projectId}/builds`, {
    buildId,
    ...commitSha ? { commitSha } : {},
    ...versionLabel ? { versionLabel } : {}
  });
  const deployment = await request(
    "POST",
    `/projects/${projectId}/deployments`,
    {
      targetId,
      buildId,
      url,
      clientMutationId: publicationId(projectId, key),
      activate: false
    }
  );
  if (!uuid.test(deployment.id) || !(deployment.previousDeploymentId === null || uuid.test(deployment.previousDeploymentId)))
    throw new Error("Respuesta de publicaci\xF3n inv\xE1lida");
  const manifest = {
    schemaVersion: 1,
    apiUrl,
    projectId,
    targetId,
    deploymentId: deployment.id,
    buildId,
    previousDeploymentId: deployment.previousDeploymentId,
    url,
    ...commitSha ? { commitSha } : {},
    ...versionLabel ? { versionLabel } : {}
  };
  const snippet = reviewScript(manifest);
  for (const file of files)
    await atomicWrite(file.path, injectReviewScript(file.html, snippet));
  if (values["snippet-out"])
    await atomicWrite(resolve(values["snippet-out"]), snippet + "\n");
  await atomicWrite(output, JSON.stringify(manifest, null, 2) + "\n");
  console.log(
    `Publicaci\xF3n preparada; SDK insertado en ${files.length} documentos. Act\xEDvala despu\xE9s de desplegar correctamente.`
  );
} else if (command === "activate" || command === "ready") {
  const manifest = JSON.parse(
    await readFile2(resolve(required("manifest")), "utf8")
  );
  if (manifest.apiUrl !== apiUrl || !uuid.test(manifest.projectId) || !uuid.test(manifest.deploymentId) || !(manifest.previousDeploymentId === null || uuid.test(manifest.previousDeploymentId)))
    throw new Error("Manifiesto inv\xE1lido o pertenece a otra API");
  if (command === "ready") {
    const result = await request(
      "POST",
      `/projects/${manifest.projectId}/publications/ready`,
      {
        deploymentId: manifest.deploymentId,
        summary: values.summary ?? ""
      }
    );
    console.log(
      `Versi\xF3n lista en la revisi\xF3n ${result.reviewId}; ${result.notificationCount} avisos preparados.`
    );
  } else {
    await request(
      "POST",
      `/projects/${manifest.projectId}/deployments/${manifest.deploymentId}/activate`,
      { expectedCurrentDeploymentId: manifest.previousDeploymentId }
    );
    console.log(
      "Publicaci\xF3n activada para las revisiones que siguen este sitio."
    );
  }
} else throw new Error("Usa prepare, activate o ready");
