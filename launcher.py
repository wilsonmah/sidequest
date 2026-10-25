"""Start the local app, or reopen an already running SideQuest instance."""
import argparse
import json
import webbrowser
from urllib.error import URLError
from urllib.request import ProxyHandler, build_opener

from werkzeug.serving import make_server

from app import create_app

URL = "http://127.0.0.1:4173/"


def already_running():
    try:
        with build_opener(ProxyHandler({})).open(URL + "api/health", timeout=2) as response:
            return json.load(response).get("app") == "sidequest"
    except (OSError, URLError, ValueError, AttributeError):
        return False


def main(open_browser=False):
    if already_running():
        print("SideQuest is already running: " + URL, flush=True)
        if open_browser:
            webbrowser.open(URL)
        return
    # Bind before opening the browser so a failed startup never opens a dead link.
    server = make_server("127.0.0.1", 4173, create_app(), threaded=True)
    print("SideQuest is ready: " + URL, flush=True)
    print("Keep this window open. Press Ctrl+C to stop.", flush=True)
    if open_browser:
        webbrowser.open(URL)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--open-browser", action="store_true")
    main(parser.parse_args().open_browser)
