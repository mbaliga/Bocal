import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

/** Real same-origin HTTP in browser tests: file:// has different storage semantics. */
export async function servePreview(htmlPath) {
  const html = await readFile(htmlPath);
  const server = createServer((request, response) => {
    if (request.url === "/favicon.ico") { response.writeHead(204).end(); return; }
    if (request.method !== "GET" || !["/", "/index.html"].includes(request.url)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    response.end(html);
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    close: () => new Promise((resolve, reject) => { server.close((error) => error ? reject(error) : resolve()); server.closeAllConnections(); }),
  };
}
