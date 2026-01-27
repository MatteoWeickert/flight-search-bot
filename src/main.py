from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
from agents.supervisor import process_query
import json
import queue
import threading

app = Flask(__name__, static_folder="application", static_url_path="")
CORS(app, resources={r"/chat": {"origins": "*"}})

@app.route("/")
def index():
    return app.send_static_file("index.html")

@app.route("/chat", methods=["POST"])
def chat():
    data = request.get_json(silent=True) or {}
    msg = (data.get("message") or "").strip()
    
    filters = data.get("filters", [])
    if not isinstance(filters, list):
        filters = []

    geojson_input = data.get("geojsonInput", None)
    
    reasoning = data.get("reasoning", True)
    messages = data.get("messages", [])

    if not msg:
        return jsonify({"error": "message missing"}), 400

    status_queue = queue.Queue()

    def task():
        try:
            reply = process_query(msg, filters, reasoning, messages, status_queue, geojson_input)
            status_queue.put({"type": "result", "data": reply})
        finally:
            status_queue.put(None)

    thread = threading.Thread(target=task)
    thread.start()

    def generate():
        while True:
            item = status_queue.get()
            if item is None:
                break
            yield json.dumps(item) + "\n"

    return Response(stream_with_context(generate()), mimetype='application/x-ndjson')

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)