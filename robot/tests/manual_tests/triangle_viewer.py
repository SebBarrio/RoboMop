#!/usr/bin/env python3
"""
Triangle Test Live Viewer (Web Version)

A robust WebSocket server that:
1. Receives real-time updates from the RoboMop robot (triangle test).
2. Serves a web-based visualization (triangle_viewer.html).
3. Relays robot data to connected web browsers.

Dependencies:
    pip install websockets

Usage:
    # Start the viewer server:
    python robot/tests/manual_tests/triangle_viewer.py --host 0.0.0.0 --port 8765 --http-port 8080

    # On the robot:
    python -m robot.src.main --triangle-test --triangle-stream-url ws://<viewer-ip>:8765

    # Open browser:
    http://localhost:8080
"""

import argparse
import asyncio
import http.server
import logging
import os
import socketserver
import threading
import webbrowser
from typing import Set
from pathlib import Path

import websockets
from websockets.server import WebSocketServerProtocol

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("triangle_viewer")

# HTML file location
CURRENT_DIR = Path(__file__).parent.absolute()
HTML_FILE = "triangle_viewer.html"

class ViewerState:
    """Shared state for the viewer application."""
    def __init__(self):
        self.clients: Set[WebSocketServerProtocol] = set()
        self.robot_connected = False

state = ViewerState()

class ViewerHttpHandler(http.server.SimpleHTTPRequestHandler):
    """Serves the viewer HTML file."""
    
    def do_GET(self):
        if self.path == "/" or self.path == "/index.html":
            # Serve the specific HTML file
            self.send_response(200)
            self.send_header("Content-type", "text/html")
            self.end_headers()
            
            html_path = CURRENT_DIR / HTML_FILE
            if not html_path.exists():
                self.wfile.write(b"Error: triangle_viewer.html not found.")
                return

            with open(html_path, "rb") as f:
                self.wfile.write(f.read())
        else:
            # Serve other static files if needed, or 404
            self.send_error(404, "File not found")

    def log_message(self, format, *args):
        # Suppress HTTP access logs to keep console clean
        pass

def run_http_server(host: str, port: int):
    """Run the HTTP server in a background thread."""
    # Allow reusing address to avoid "Address already in use" errors on restart
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer((host, port), ViewerHttpHandler) as httpd:
        logger.info(f"HTTP Server running at http://{host}:{port}")
        httpd.serve_forever()

async def broadcast_update(message: str, sender: WebSocketServerProtocol):
    """Relay message to all connected clients except the sender."""
    if not state.clients:
        return
        
    # Filter out the sender (robot) to avoid echo (though robot ignores it)
    recipients = [client for client in state.clients if client != sender]
    
    if recipients:
        # Broadcast
        websockets.broadcast(recipients, message)

async def handle_client(websocket: WebSocketServerProtocol):
    """Handle a new WebSocket connection."""
    state.clients.add(websocket)
    remote_addr = websocket.remote_address
    
    # Identify client type from User-Agent
    ua = websocket.request_headers.get("User-Agent", "Unknown")
    client_type = "Robot" if "Python" in ua or "websockets" in ua else "Viewer"
    
    logger.info(f"{client_type} connected: {remote_addr}")
    
    try:
        async for message in websocket:
            # We assume any message received is a data update from the Robot
            # We immediately relay it to all other clients (Browsers)
            await broadcast_update(message, websocket)
            
    except websockets.exceptions.ConnectionClosed:
        pass
    except Exception as e:
        logger.error(f"Error handling client {remote_addr}: {e}")
    finally:
        state.clients.remove(websocket)
        logger.info(f"{client_type} disconnected: {remote_addr}")

async def main():
    parser = argparse.ArgumentParser(description="Triangle Test Web Viewer")
    parser.add_argument("--host", default="0.0.0.0", help="Bind address")
    parser.add_argument("--port", type=int, default=8765, help="WebSocket port")
    parser.add_argument("--http-port", type=int, default=8080, help="HTTP port for browser")
    parser.add_argument("--no-browser", action="store_true", help="Do not open browser automatically")
    args = parser.parse_args()

    # Start HTTP Server in a separate thread
    http_thread = threading.Thread(
        target=run_http_server, 
        args=(args.host, args.http_port), 
        daemon=True
    )
    http_thread.start()

    # Start WebSocket Server
    logger.info(f"WebSocket Server running on ws://{args.host}:{args.port}")
    
    # Auto-open browser
    if not args.no_browser:
        url = f"http://localhost:{args.http_port}"
        logger.info(f"Opening browser at {url}...")
        webbrowser.open(url)

    logger.info("Waiting for robot connection...")
    
    async with websockets.serve(
        handle_client, 
        args.host, 
        args.port, 
        max_size=10 * 1024 * 1024 # 10MB max size for maps
    ):
        await asyncio.Future()  # Run forever

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Server stopped by user")
