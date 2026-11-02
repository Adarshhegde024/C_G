"""
CloudGuard Dual-Port Forwarder (5173 -> 8080)
Forwards requests from port 5173 to Lovable's native port 8080
so the app opens on both http://localhost:5173 and http://localhost:8080.
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import urllib.request
import urllib.error
import sys

TARGET_HOST = "http://127.0.0.1:8080"


class PortForwarder(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress noisy request logs
        pass

    def _forward(self):
        target_url = f"{TARGET_HOST}{self.path}"
        length = int(self.headers.get("content-length", 0))
        body = self.rfile.read(length) if length > 0 else None
        headers = {k: v for k, v in self.headers.items() if k.lower() not in ("host", "connection")}
        headers["Host"] = "127.0.0.1:8080"

        req = urllib.request.Request(target_url, data=body, headers=headers, method=self.command)
        try:
            with urllib.request.urlopen(req) as resp:
                self.send_response(resp.status)
                for k, v in resp.headers.items():
                    if k.lower() not in ("transfer-encoding", "content-length", "connection"):
                        self.send_header(k, v)
                data = resp.read()
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Connection", "close")
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            for k, v in e.headers.items():
                if k.lower() not in ("transfer-encoding", "content-length", "connection"):
                    self.send_header(k, v)
            data = e.read()
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(data)
        except Exception:
            self.send_response(502)
            self.end_headers()

    do_GET = _forward
    do_POST = _forward
    do_HEAD = _forward
    do_OPTIONS = _forward
    do_PUT = _forward
    do_DELETE = _forward
    do_PATCH = _forward


if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", 5173), PortForwarder)
    print("Dual-Port Forwarder listening on http://localhost:5173 -> forwarding to http://localhost:8080")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
