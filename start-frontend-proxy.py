from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent / "react-app" / "build"
BACKEND = "http://127.0.0.1:5000"
PORT = 3000


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if self.path.startswith("/api/"):
            self._proxy()
            return
        super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            self._proxy()
            return
        self.send_error(405)

    def _proxy(self):
        target = f"{BACKEND}{self.path}"
        length = int(self.headers.get("Content-Length", "0") or 0)
        body = self.rfile.read(length) if length else None
        req = Request(
            target,
            data=body,
            headers={k: v for k, v in self.headers.items() if k.lower() != "host"},
            method=self.command,
        )
        try:
            with urlopen(req) as resp:
                payload = resp.read()
                self.send_response(resp.status)
                for key, value in resp.headers.items():
                    if key.lower() in {"transfer-encoding", "connection", "content-length"}:
                        continue
                    self.send_header(key, value)
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
        except HTTPError as err:
            payload = err.read() if hasattr(err, "read") else b""
            self.send_response(err.code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            if payload:
                self.wfile.write(payload)
        except URLError as err:
            payload = f'{{"error":"{err.reason}"}}'.encode("utf-8")
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Serving {ROOT} on http://127.0.0.1:{PORT}")
    server.serve_forever()
