from flask import Flask, request, jsonify
from flask_cors import CORS
from agents.supervisor import process_query

app = Flask(__name__, static_folder="application", static_url_path="")
CORS(app, resources={r"/chat": {"origins": "*"}})

@app.route("/")
def index():
    return app.send_static_file("index.html")

@app.route("/chat", methods=["POST"])
def chat():
    data = request.get_json(silent=True) or {}
    msg = (data.get("message") or "").strip()
    filters = data.get("filters", {})
    reasoning = data.get("reasoning", True)
    messages = data.get("messages", [])

    if not msg:
        return jsonify({"error": "message missing"}), 400

    reply_obj = process_query(msg, filters, reasoning, messages)
    return jsonify(reply_obj)

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
