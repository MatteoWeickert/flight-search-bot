const chatHistoryEl = document.querySelector(".chat-history");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const loading = document.getElementById("chatLoading");
let resultLayer = null;

const dataBtn = document.getElementById("dataBtn");
const dataPanel = document.getElementById("dataPanel");
const dataPanelWrapper = document.getElementById("dataPanelTableWrapper");
const dataPanelClose = document.getElementById("dataPanelClose");

const filterState = new Set();
const filterButtons = document.querySelectorAll('.filter-btn');
// no user selection on map — selections are driven by agents/queries

const reasoningToggle = document.getElementById('reasoningToggle');
const reasoningLabel = document.getElementById('reasoningLabel');

reasoningToggle.addEventListener('change', () => {
  console.log('Reasoning enabled:', reasoningToggle.checked);
});

filterButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const filter = btn.dataset.filter;
    
    if (filterState.has(filter)) {
      filterState.delete(filter);
      btn.classList.remove('active');
    } else {
      if (filterState.size === 2 && !filterState.has(filter)) {
        return;
      }
      
      if (filter === 'ot') {
        filterState.clear();
        filterButtons.forEach(b => b.classList.remove('active'));
      } else {
        filterState.delete('ot');
        filterButtons.forEach(b => {
          if (b.dataset.filter === 'ot') {
            b.classList.remove('active');
          }
        });
      }
      
      filterState.add(filter);
      btn.classList.add('active');
    }
    
    console.log('Active filters:', Array.from(filterState));
  });
});

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
  // map is passive — agents provide features to display
});

function appendMessage(role, text, reasoningText = null) {
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

  const textContent = document.createElement("div");
  textContent.textContent = text;
  bubble.appendChild(textContent);

  if (reasoningText && reasoningText.trim()) {
    console.log("[DEBUG] Adding reasoning:", reasoningText);
    
    const reasoningWrapper = document.createElement("div");
    reasoningWrapper.className = "reasoning-wrapper";
    reasoningWrapper.style.marginTop = "8px";
    reasoningWrapper.style.paddingTop = "8px";
    reasoningWrapper.style.borderTop = "1px solid rgba(0,0,0,.08)";

    const toggleBtn = document.createElement("button");
    toggleBtn.className = "reasoning-toggle-btn";
    toggleBtn.innerHTML = `
      <svg class="reasoning-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.3s ease;">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
      <span>Show reasoning</span>
    `;
    toggleBtn.style.cssText = `
      appearance: none;
      border: 0;
      background: rgba(0, 136, 221, 0.08);
      color: #0088dd;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: all 0.2s ease;
    `;

    const reasoningContent = document.createElement("div");
    reasoningContent.className = "reasoning-content";
    reasoningContent.style.cssText = `
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s ease;
      margin-top: 6px;
      padding: 0;
      font-size: 11px;
      color: #4a4a4a;
      opacity: 0.85;
      line-height: 1.4;
    `;
    reasoningContent.textContent = reasoningText;

    let isOpen = false;
    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      isOpen = !isOpen;

      if (isOpen) {
        reasoningContent.style.maxHeight = reasoningContent.scrollHeight + "px";
        reasoningContent.style.padding = "8px";
        toggleBtn.querySelector("span").textContent = "Hide reasoning";
        toggleBtn.querySelector(".reasoning-icon").style.transform = "rotate(180deg)";
      } else {
        reasoningContent.style.maxHeight = "0";
        reasoningContent.style.padding = "0";
        toggleBtn.querySelector("span").textContent = "Show reasoning";
        toggleBtn.querySelector(".reasoning-icon").style.transform = "rotate(0deg)";
      }
    });

    toggleBtn.addEventListener("mouseenter", () => {
      toggleBtn.style.background = "rgba(0, 136, 221, 0.15)";
    });

    toggleBtn.addEventListener("mouseleave", () => {
      toggleBtn.style.background = "rgba(0, 136, 221, 0.08)";
    });

    reasoningWrapper.appendChild(toggleBtn);
    reasoningWrapper.appendChild(reasoningContent);
    bubble.appendChild(reasoningWrapper);
  } else {
    console.log("[DEBUG] No reasoning text provided"); // Debug log
  }

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
  console.log("[JS] Active filters:", Array.from(filterState));
  console.log("[JS] Reasoning enabled:", reasoningToggle.checked);

  appendMessage("user", text);
  chatInput.value = "";
  autosize();
  setLoading(true);

  try {
    const res = await fetch("http://127.0.0.1:5000/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        filters: Array.from(filterState),
        reasoning: reasoningToggle.checked
      }),
    });

    const data = await res.json();
    
    const chatText = data.chat_text || "Keine Antwort";
    const reasoningSummary = data.reasoning_summary || null;
    const mapData = data.map;
    const tableHtml = data.table_html;

    appendMessage("bot", chatText, reasoningSummary);

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
      "Service is currently not available. Please try again later."
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
