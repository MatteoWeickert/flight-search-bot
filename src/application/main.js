const chatHistoryEl = document.querySelector(".chat-history");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const loading = document.getElementById("chatLoading");
let resultLayer = null;
let uploadLayer = null; // separate layer for user-uploaded polygon
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

const uploadBtn = document.getElementById('uploadBtn');
const geojsonInput = document.getElementById('geojsonInput');
let uploadedGeojson = null; // will hold the validated geojson for later processing

// Ensure panels are hidden on load
document.addEventListener('DOMContentLoaded', () => {
  if (kpiPanel) kpiPanel.classList.add('is-hidden');
  if (dataPanel) dataPanel.classList.add('is-hidden');
});

reasoningToggle.addEventListener('change', () => {
  console.log('Reasoning enabled:', reasoningToggle.checked);
});

// Upload button -> open hidden file picker
if (uploadBtn && geojsonInput) {
  uploadBtn.addEventListener('click', () => geojsonInput.click());

  geojsonInput.addEventListener('change', (ev) => {
    const file = geojsonInput.files && geojsonInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      let data;
      try {
        data = JSON.parse(String(reader.result));
      } catch (e) {
        showStatusIcon('error', 'Invalid JSON file', 3000);
        geojsonInput.value = '';
        return;
      }

      // Validation rules (simple):
      // - Accept FeatureCollection with exactly one feature whose geometry is Polygon or MultiPolygon
      // - OR accept a Feature whose geometry is Polygon
      // - OR accept a raw geometry object of type Polygon
      let ok = false;
      if (data && typeof data === 'object') {
        if (data.type === 'FeatureCollection') {
          if (Array.isArray(data.features) && data.features.length === 1) {
            const feat = data.features[0];
            const g = feat && feat.geometry;
            if (g && (g.type === 'Polygon' || g.type === 'MultiPolygon')) ok = true;
          }
        } else if (data.type === 'Feature') {
          const g = data.geometry;
          if (g && g.type === 'Polygon') ok = true;
        } else if (data.type === 'Polygon') {
          ok = true;
        }
      }

      if (ok) {
        uploadedGeojson = data;
        showStatusIcon('ok', 'GeoJSON accepted', 3000);
        // normalize to a FeatureCollection
        let fc = null;
        if (data.type === 'FeatureCollection') fc = data;
        else if (data.type === 'Feature') fc = { type: 'FeatureCollection', features: [data] };
        else if (data.type === 'Polygon' || data.type === 'MultiPolygon') fc = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: data }] };

        if (fc) {
          // display uploaded polygon on its own layer so agent results don't overwrite it
          showUploadedGeojson(fc);
        }

        // status will clear automatically from showStatusIcon
      } else {
        showStatusIcon('error', 'Please provide a single Polygon or a FeatureCollection with one feature',3000);
      }

      geojsonInput.value = '';
    };

    reader.readAsText(file);
  });
}

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
  "esri/layers/FeatureLayer",
  "esri/Graphic"
], function (Map, MapView, GraphicsLayer, FeatureLayer, Graphic) {
  const map = new Map({
    basemap: "satellite"
  });

  const view = new MapView({
    container: "map",
    map: map,
    center: [11.5, 48.9],
    zoom: 6,
    popup: {
        defaultPopupTemplateEnabled: true // fallback
    }
  });

  window.view = view;
  window.GraphicsLayer = GraphicsLayer;
  window.FeatureLayer = FeatureLayer; // Expose to window
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

// Show a check or X icon alongside the loading status text for a short duration
function showStatusIcon(type, text, duration = 3000) {
  // Always show the global loading spinner while showing a status icon
  setLoading(true);
  updateLoadingStatus(text);

  const statusSpan = document.getElementById("loadingStatusText");
  if (!statusSpan) {
    setTimeout(() => setLoading(false), duration);
    return;
  }

  let iconSpan = document.getElementById("loadingStatusIcon");
  if (!iconSpan) {
    iconSpan = document.createElement('span');
    iconSpan.id = 'loadingStatusIcon';
    iconSpan.style.display = 'inline-flex';
    iconSpan.style.alignItems = 'center';
    iconSpan.style.marginRight = '8px';
    // insert icon before the status text
    statusSpan.parentNode.insertBefore(iconSpan, statusSpan);
  }

  if (type === 'ok') {
    iconSpan.innerHTML = `\
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">\
        <path d="M20 6L9 17L4 12" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>\
      </svg>`;
  } else {
    iconSpan.innerHTML = `\
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">\
        <path d="M18 6L6 18M6 6L18 18" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>\
      </svg>`;
  }

  // clear after duration
  setTimeout(() => {
    const el = document.getElementById('loadingStatusIcon');
    if (el) el.innerHTML = '';
    setLoading(false);
  }, duration);
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
        reasoning: reasoningToggle.checked,
        geojsonInput: uploadedGeojson || null
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
            if (mapData && ((mapData.points && mapData.points.length > 0) || (mapData.lines && mapData.lines.length > 0))) {
              console.log("Displaying map data:", mapData);
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

// GLOBAL VARIABLES FOR LAYERS
let pointFeatureLayer = null;
let lineFeatureLayer = null;

function displayOnMap(data) {
  const view = window.view;
  const FeatureLayer = window.FeatureLayer;
  const Graphic = window.Graphic;

  if (!view || !view.map || !FeatureLayer || !Graphic) return;

  // Clear existing layers if they exist
  if (pointFeatureLayer) {
    view.map.remove(pointFeatureLayer);
    pointFeatureLayer = null;
  }
  if (lineFeatureLayer) {
    view.map.remove(lineFeatureLayer);
    lineFeatureLayer = null;
  }

  // 1. Handle Points (Airports/Nodes)
  if (data.points && data.points.length > 0) {
    const pointGraphics = data.points.map((pt, index) => {
      // FIX: Ensure coordinates are [Longitude, Latitude]
      let geom = pt.geometry;
      if (geom.latitude && geom.longitude) {
        // If agent returned { latitude: 50, longitude: 7 }, ArcGIS handles it via key names
        // But if values are flipped in properties (e.g. lat=7, lon=50), we might need to swap.
        // Heuristic: For Europe, Lat (50ish) > Lon (7ish). 
        if (Math.abs(geom.latitude) < Math.abs(geom.longitude) && Math.abs(geom.longitude) > 30) {
             // Values likely swapped
             const temp = geom.latitude;
             geom.latitude = geom.longitude;
             geom.longitude = temp;
        }
      }
      
      return new Graphic({
        geometry: geom,
        attributes: {
          ObjectID: index,
          ...pt.attributes
        }
      });
    });

    pointFeatureLayer = new FeatureLayer({
      source: pointGraphics,
      objectIdField: "ObjectID",
      fields: [
        { name: "ObjectID", alias: "ObjectID", type: "oid" },
        { name: "name", alias: "Name", type: "string" },
        { name: "type", alias: "Type", type: "string" },
        { name: "desc", alias: "Description", type: "string" },
        { name: "id", alias: "ID", type: "string" }
      ],
      popupTemplate: {
        title: "{name}",
        content: [
          {
            type: "fields",
            fieldInfos: [
              { fieldName: "type", label: "Category" },
              { fieldName: "desc", label: "Details" },
              { fieldName: "id", label: "Code" }
            ]
          }
        ]
      },
      renderer: {
        type: "simple",
        symbol: {
          type: "simple-marker",
          color: [255, 77, 109, 0.9], // Pink/Red for airports
          size: "10px",
          outline: { color: [255, 255, 255, 0.8], width: 1 }
        }
      }
    });

    view.map.add(pointFeatureLayer);
  }

  // 2. Handle Lines (Trajectories)
  if (data.lines && data.lines.length > 0) {
    const lineGraphics = data.lines.map((ln, index) => {
      let geom = ln.geometry;
      
      // FIX: Swap coordinates for paths if necessary [Lat, Lon] -> [Lon, Lat]
      // Agent output: [50.8, 7.1] (Lat, Lon) -> Needs to be [7.1, 50.8] (Lon, Lat)
      if (geom.paths && geom.paths.length > 0) {
        geom.paths = geom.paths.map(path => {
            return path.map(coord => {
                // Heuristic: If 1st coord (x) > 2nd coord (y) and we are likely in Europe (x ~ 50),
                // then x is Latitude. Swap them.
                if (coord[0] > coord[1] && coord[0] > 30) {
                    return [coord[1], coord[0]]; // Swap to [Lon, Lat]
                }
                return coord;
            });
        });
      }

      return new Graphic({
        geometry: geom,
        attributes: {
          ObjectID: index,
          ...ln.attributes
        }
      });
    });

    lineFeatureLayer = new FeatureLayer({
      source: lineGraphics,
      objectIdField: "ObjectID",
      fields: [
        { name: "ObjectID", alias: "ObjectID", type: "oid" },
        { name: "name", alias: "Flight", type: "string" },
        { name: "type", alias: "Type", type: "string" },
        { name: "desc", alias: "Info", type: "string" },
        { name: "id", alias: "ID", type: "string" }
      ],
      popupTemplate: {
        title: "{name}",
        content: "{desc}" 
      },
      renderer: {
        type: "simple",
        symbol: {
          type: "simple-line",
          color: [0, 200, 255, 0.8], // Cyan for flights
          width: 2.5
        }
      }
    });

    view.map.add(lineFeatureLayer);
  }
  
  // 3. Zoom to new data
  const layersToZoom = [];
  if (pointFeatureLayer) layersToZoom.push(pointFeatureLayer);
  if (lineFeatureLayer) layersToZoom.push(lineFeatureLayer);
  
  if (layersToZoom.length > 0) {
      // Use queryExtent to find the bounds of client-side features
      let promises = layersToZoom.map(l => l.queryExtent());
      Promise.all(promises).then((results) => {
          let combinedExtent = null;
          results.forEach(res => {
              if (res && res.extent) {
                  if (!combinedExtent) combinedExtent = res.extent.clone();
                  else combinedExtent.union(res.extent);
              }
          });
          
          if (combinedExtent) {
              view.goTo(combinedExtent.expand(1.2)); // Expand by 20% for padding
          }
      }).catch(console.error);
  }
}
// Show uploaded polygon(s) on a separate layer and zoom to it
function showUploadedGeojson(geojson) {
  const view = window.view;
  const GraphicsLayer = window.GraphicsLayer;
  const Graphic = window.Graphic;
  if (!view || !view.map || !GraphicsLayer || !Graphic) return;

  if (!uploadLayer) {
    uploadLayer = new GraphicsLayer({ id: 'upload-layer' });
    view.map.add(uploadLayer);
  } else {
    uploadLayer.removeAll();
  }

  const features = (geojson && geojson.features) || [];
  const graphics = features.map(f => {
    const g = f.geometry || {};
    if (g.type !== 'Polygon' && g.type !== 'MultiPolygon') return null;
    const coords = g.coordinates || [];
    let rings = [];
    if (g.type === 'Polygon') {
      rings = coords.map(r => r.map(c => [c[0], c[1]]));
    } else {
      coords.forEach(polygon => polygon.forEach(ring => rings.push(ring.map(c => [c[0], c[1]]))));
    }
    return new Graphic({
      geometry: { type: 'polygon', rings },
      symbol: { type: 'simple-fill', color: [255,255,255,0.33], outline: { color: '#ffffff', width: 2 } },
      attributes: f.properties || {}
    });
  }).filter(g => g && g.geometry);

  if (!graphics.length) return;
  uploadLayer.addMany(graphics);
  // zoom to uploaded polygon
  try { view.goTo(uploadLayer.graphics); } catch (e) {}
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