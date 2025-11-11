from flask import Flask, request, jsonify
from flask_cors import CORS
from agent import answer_question

app = Flask(__name__, static_folder=".", static_url_path="")
CORS(app, resources={r"/chat": {"origins": "*"}})

@app.route("/chat", methods=["POST"])
def chat():
    data = request.get_json(silent=True) or {}
    msg = (data.get("message") or "").strip()
    if not msg:
        return jsonify({"error": "message missing"}), 400
    try:
        reply = answer_question(msg)
        return jsonify({"reply": reply})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
