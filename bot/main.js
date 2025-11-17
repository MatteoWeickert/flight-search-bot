const chatHistoryEl = document.querySelector(".chat-history");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const loading = document.getElementById("chatLoading");
let resultLayer = null;
const dataBtn = document.getElementById("dataBtn");
const dataPanel = document.getElementById("dataPanel");
const dataPanelWrapper = document.getElementById("dataPanelTableWrapper");
const dataPanelClose = document.getElementById("dataPanelClose");


require([
  "esri/Map",
  "esri/views/MapView",
  "esri/layers/GraphicsLayer",
  "esri/Graphic"
], function (Map, MapView, GraphicsLayer, Graphic) {

  const map = new Map({
    basemap: "satellite"
  });

  const view = new MapView({
    container: "map",
    map: map,
    center: [11.5, 48.9],
    zoom: 6
  });

  window.view = view;
  window.GraphicsLayer = GraphicsLayer;
  window.Graphic = Graphic;
  view.ui.components = [];
});

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
        bubble.style.background =
            "linear-gradient(180deg, rgba(61,242,255,.12), rgba(61,242,255,.08))";
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
    console.log("[JS] Sende Nachricht:", text);
    appendMessage("user", text);
    chatInput.value = "";
    autosize();
    setLoading(true);
    try {
        const res = await fetch("http://127.0.0.1:5000/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text }),
        });
        const data = await res.json();
        const chatText = data.chat_text || "Keine Antwort";
        const mapData = data.map;
        const tableHtml = data.table_html;

        appendMessage("bot", chatText);

        if (tableHtml) {
          showTablePanel(tableHtml);
        }
        
        if (mapData && mapData.features && mapData.features.length > 0) {
            displayOnMap(mapData);
        }
    } catch (err) {
        console.error("[JS] Fetch Error:", err);
        appendMessage(
            "bot",
            "Es ist ein Fehler aufgetreten. Bitte später erneut versuchen."
        );
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

function displayOnMap(geojson) {
    console.log("Map data received:", geojson);
    const view = window.view;
    const GraphicsLayer = window.GraphicsLayer;
    const Graphic = window.Graphic;

    if (!view || !view.map || !GraphicsLayer || !Graphic) {
        console.warn("ArcGIS view or classes not available");
        return;
    }

    const features = (geojson && geojson.features) || [];
    if (!features.length) {
        if (resultLayer) {
            resultLayer.removeAll();
        }
        return;
    }

    if (!resultLayer) {
        resultLayer = new GraphicsLayer({ id: "llm-results" });
        view.map.add(resultLayer);
    } else {
        resultLayer.removeAll();
    }

  const graphics = features
    .map((f) => {
      const g = f.geometry || {};
      const coords = g.coordinates || [];
      let geometry = null;
      let symbol = null;

      if (g.type === "Point" && coords.length >= 2) {
        geometry = {
          type: "point",
          longitude: coords[0],
          latitude: coords[1],
        };
        symbol = {
          type: "simple-marker",
          color: "cyan",
          size: 8,
          outline: { color: "black", width: 1 },
        };
      }

      else if (g.type === "LineString" && coords.length >= 2) {
        geometry = {
          type: "polyline",
          paths: coords.map((c) => [c[0], c[1]]),
        };
        symbol = {
          type: "simple-line",
          color: "cyan",
          width: 2,
        };
      }

      if (!geometry) {
        return null;
      }

      return new Graphic({
        geometry,
        symbol,
        attributes: f.properties || {},
      });
    })
    .filter((gr) => gr && gr.geometry);


    if (!graphics.length) {
        return;
    }

    resultLayer.addMany(graphics);

    if (!graphics.length) {
      return;
    }

    const firstGeom = graphics[0].geometry;

    if (graphics.length === 1 && firstGeom.type === "point") {
      view.goTo({
        target: firstGeom,
        zoom: 2
      });
    }
    else if (resultLayer.fullExtent) {
      const ext = resultLayer.fullExtent.expand(1.2);

      view.goTo(ext).then(() => {
        if (view.zoom < 2) {
          view.zoom = 2;
        }
      });
    }
}

function showTablePanel(html) {
  if (!dataPanel || !dataPanelWrapper) return;
  dataPanelWrapper.innerHTML = html || "";
  dataPanel.classList.remove("is-hidden");
}

function hideTablePanel() {
  if (!dataPanel) return;
  dataPanel.classList.add("is-hidden");
}

if (dataBtn) {
  dataBtn.addEventListener("click", () => {
    if (!dataPanel) return;
    dataPanel.classList.toggle("is-hidden");
  });
}


if (dataPanelClose) {
  dataPanelClose.addEventListener("click", hideTablePanel);
}



autosize();
