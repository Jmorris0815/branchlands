# Receives raw file bodies at POST /save?name=x and writes them to ./fbx (also serves the repo + this folder for the converter page).
import os, sys, urllib.parse, urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, "fbx"); os.makedirs(OUT, exist_ok=True)
class H(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*"); self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Private-Network", "true"); self.send_header("Cache-Control", "no-store"); super().end_headers()
    def do_OPTIONS(self): self.send_response(204); self.end_headers()
    def do_POST(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query); name = "".join(c for c in q.get("name", ["x"])[0] if c.isalnum() or c in "-_.")
        data = self.rfile.read(int(self.headers["Content-Length"]))
        if self.path.startswith("/fetch"):

            u = data.decode().strip()
            assert u.startswith("https://") and ".amazonaws.com/" in u.split("?")[0], "unexpected host"
            data = urllib.request.urlopen(u, timeout=120).read()
        open(os.path.join(OUT, name), "wb").write(data); print("saved", name, len(data), flush=True)
        self.send_response(200); self.end_headers(); self.wfile.write(b"ok")
    def log_message(self, *a): pass
ThreadingHTTPServer(("127.0.0.1", 8767), partial(H, directory=HERE)).serve_forever()
