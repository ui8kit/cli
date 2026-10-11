import fs from "node:fs"
import http from "node:http"
import path from "node:path"

/** Minimal static file server on 127.0.0.1 (random port). Returns { url, close }. */
export function serveDir(root) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent((req.url || "/").split("?")[0]).replace(/^\/+/, "")
    const file = path.join(root, rel)
    if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.statusCode = 404
      res.end("not found")
      return
    }
    res.setHeader("content-type", "application/json")
    res.end(fs.readFileSync(file))
  })
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address()
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(() => r())),
      })
    })
  })
}
