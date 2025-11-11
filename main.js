(() => {
  const chatHistoryEl = document.querySelector(".chat-history");
  const chatInput = document.getElementById("chatInput");
  const sendBtn = document.getElementById("sendBtn");
  const loading = document.getElementById("chatLoading");

  function appendMessage(role, text) {
    const wrap = document.createElement("div");
    wrap.className = `msg msg-${role}`;
    wrap.style.margin = "8px 0";

    const bubble = document.createElement("div");
    bubble.className = "glass";
    bubble.style.padding = "10px 12px";
    bubble.style.borderRadius = "12px";
    bubble.style.display = "inline-block";
    bubble.style.maxWidth = "90%";
    bubble.style.whiteSpace = "pre-wrap";
    bubble.style.wordBreak = "break-word";
    bubble.style.border = "1px solid rgba(255,255,255,.08)";

    if (role === "user") {
      bubble.style.background = "linear-gradient(180deg, rgba(61,242,255,.12), rgba(61,242,255,.08))";
      bubble.style.borderColor = "rgba(61,242,255,.35)";
    }

    bubble.textContent = text;
    wrap.appendChild(bubble);
    chatHistoryEl.appendChild(wrap);
    chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
  }

  function setLoading(v) {
    loading.hidden = !v;
    sendBtn.disabled = v;
  }

  function autosize() {
    chatInput.style.height = "0px";
    const next = Math.min(180, chatInput.scrollHeight);
    chatInput.style.height = next + "px";
  }

  async function sendMessage() {
    const text = (chatInput.value || "").trim();
    if (!text) return;

    appendMessage("user", text);
    chatInput.value = "";
    autosize();
    setLoading(true);

    try {
        const API = "http://127.0.0.1:5000/chat";
        const res = await fetch("http://127.0.0.1:5000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text })
        });

        if (!res.ok) {
            const errText = await res.text().catch(() => "");
            throw new Error(`HTTP ${res.status} ${res.statusText} ${errText}`);
        }

      const data = await res.json();
      const reply = (data && data.reply) ? data.reply : "Fehler: Keine Antwort erhalten.";
      appendMessage("bot", reply);
    } catch (err) {
      console.error(err);
      appendMessage("bot", "Es ist ein Fehler aufgetreten. Bitte später erneut versuchen.");
    } finally {
      setLoading(false);
      chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
      chatInput.focus();
    }
  }

  sendBtn.addEventListener("click", sendMessage);

  chatInput.addEventListener("input", autosize);

  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  autosize();
})();
