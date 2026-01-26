const chatHistoryEl = document.querySelector(".chat-history");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const loading = document.getElementById("chatLoading");
let resultLayer = null;
const messages = [];
let nextMessageId = 1;

const kpiBtn = document.getElementById("kpiBtn");
const kpiPanel = document.getElementById("kpiPanel");
const kpiPanelWrapper = document.getElementById("kpiPanelWrapper");
const kpiPanelClose = document.getElementById("kpiPanelClose");

const dataBtn = document.getElementById("dataBtn");
const dataPanel = document.getElementById("dataPanel");
const dataPanelWrapper = document.getElementById("dataPanelTableWrapper");
const dataPanelClose = document.getElementById("dataPanelClose");

const filterState = new Set();
const filterButtons = document.querySelectorAll('.filter-btn');

const reasoningToggle = document.getElementById('reasoningToggle');
const reasoningLabel = document.getElementById('reasoningLabel');

// Ensure panels are hidden on load
document.addEventListener('DOMContentLoaded', () => {
  if (kpiPanel) kpiPanel.classList.add('is-hidden');
  if (dataPanel) dataPanel.classList.add('is-hidden');
});

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

    const reasoningContent = document.createElement("div");
    reasoningContent.className = "reasoning-content";
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

    reasoningWrapper.appendChild(toggleBtn);
    reasoningWrapper.appendChild(reasoningContent);
    bubble.appendChild(reasoningWrapper);
  }

  wrap.appendChild(bubble);
  chatHistoryEl.appendChild(wrap);
  chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
}

function setLoading(v) {
  loading.hidden = !v;
  sendBtn.disabled = v;
  if (!v) {
    updateLoadingStatus(""); // Clear text when done
  }
}

function updateLoadingStatus(text) {
  const statusSpan = document.getElementById("loadingStatusText");
  if (statusSpan) {
    statusSpan.textContent = text;
  }
}

function autosize() {
  chatInput.style.height = "0px";
  const next = Math.min(180, chatInput.scrollHeight);
  chatInput.style.height = next + "px";
}

async function sendMessage() {
  const text = (chatInput.value || "").trim();
  if (!text) return;

  const savedMessage = [messages.length > 0, [nextMessageId, String(text)]];
  messages.push(savedMessage);
  nextMessageId += 1;

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
        saved_message: savedMessage,
        messages: messages,
        filters: Array.from(filterState),
        reasoning: reasoningToggle.checked
      }),
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop(); // Keep partial line

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);

          if (json.type === "status") {
            updateLoadingStatus(json.msg);
          } 
          else if (json.type === "result") {
            const data = json.data;
            const chatText = data.chat_text || "Keine Antwort";
            const reasoningSummary = data.reasoning_summary || null;
            const mapData = data.map;
            const tableHtml = data.table_html;
            const kpiHtml = data.kpi_html;

            appendMessage("bot", chatText, reasoningSummary);

            if (tableHtml && tableHtml.trim()) {
              showTablePanel(tableHtml);
            }
            if (kpiHtml && kpiHtml.trim()) {
              showKpiPanel(kpiHtml);
            }
            if (mapData && mapData.features && mapData.features.length > 0) {
              displayOnMap(mapData);
            }
          }
          else if (json.type === "error") {
            console.error("Backend Error:", json.message);
            appendMessage("bot", "An error occurred: " + json.message);
          }
        } catch (e) {
          console.warn("JSON Parse error", e);
        }
      }
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
  const view = window.view;
  const GraphicsLayer = window.GraphicsLayer;
  const Graphic = window.Graphic;

  if (!view || !view.map || !GraphicsLayer || !Graphic) return;

  const features = (geojson && geojson.features) || [];
  if (!features.length) {
    if (resultLayer) resultLayer.removeAll();
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

      if (!geometry) return null;

      return new Graphic({
        geometry,
        symbol,
        attributes: f.properties || {},
      });
    })
    .filter((gr) => gr && gr.geometry);

  if (!graphics.length) return;
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

function showKpiPanel(html) {
  if (!kpiPanel || !kpiPanelWrapper) return;
  kpiPanelWrapper.innerHTML = html || "";
  kpiPanel.classList.remove("is-hidden");
}

function hideKpiPanel() {
  if (!kpiPanel) return;
  kpiPanel.classList.add("is-hidden");
}

if (kpiBtn) {
  kpiBtn.addEventListener("click", () => {
    if (!kpiPanel) return;
    kpiPanel.classList.toggle("is-hidden");
  });
}

if (kpiPanelClose) {
  kpiPanelClose.addEventListener("click", (e) => {
    e.stopPropagation();
    hideKpiPanel();
  });
}

if (dataBtn) {
  dataBtn.addEventListener("click", () => {
    if (!dataPanel) return;
    dataPanel.classList.toggle("is-hidden");
  });
}

if (dataPanelClose) {
  dataPanelClose.addEventListener("click", (e) => {
    e.stopPropagation();
    hideTablePanel();
  });
}

autosize();