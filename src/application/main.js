const chatHistoryEl = document.querySelector(".chat-history");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const loading = document.getElementById("chatLoading");
let resultLayer = null;
let uploadLayer = null;
const messages = [];
let nextMessageId = 1;

const personaBtn = document.getElementById("personaBtn");
const personaPanel = document.getElementById("personaPanel");
const personaPanelWrapper = document.getElementById("personaPanelWrapper");
const personaPanelClose = document.getElementById("personaPanelClose");
const personaSlider = document.getElementById("personaSlider");
const personaValue = document.getElementById("personaValue");
const personaDescription = document.getElementById("personaDescription");

let selectedPersona = 3;

const personaDescriptions = {
  1: "Best Friends",
  2: "Aviation Enthusiast",
  3: "Standard Persona",
  4: "Commercial Airline Pilot",
  5: "Military Flight Captain"
};



function clearChatContext() {
  messages.length = 0;
  nextMessageId = 1;

  clearMap();

  const historyEl = document.querySelector('.chat-history');
  if (historyEl) {
    console.log('Chat context and map cleared');
    historyEl.style.opacity = '0.5';
    setTimeout(() => {
      historyEl.innerHTML = '';
      historyEl.style.opacity = '1';
      
      const confirmMsg = document.createElement('div');
      confirmMsg.style.cssText = `
        text-align: center;
        padding: 12px;
        color: var(--muted);
        font-size: 12px;
        font-style: italic;
      `;
      confirmMsg.textContent = 'Context cleared - Starting fresh conversation';
      historyEl.appendChild(confirmMsg);
      
      // Remove confirmation after 2 seconds
      setTimeout(() => {
        if (historyEl.children.length === 1 && historyEl.children[0] === confirmMsg) {
          confirmMsg.remove();
        }
      }, 2000);
    }, 200);
  }
  
  console.log('Chat context cleared');
}

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
let uploadedGeojson = null;

let allFlightLines = [];
let currentPage = 0;
const FLIGHTS_PER_PAGE = 4;
let pagingControls = null;

document.addEventListener('DOMContentLoaded', () => {
  if (kpiPanel) kpiPanel.classList.add('is-hidden');
  if (dataPanel) dataPanel.classList.add('is-hidden');
  if (personaPanel) personaPanel.classList.add('is-hidden');

  if (personaBtn && personaPanel) {
  personaBtn.addEventListener('click', () => {
    const isHidden = personaPanel.classList.contains('is-hidden');
    if (isHidden) {
      personaPanel.classList.remove('is-hidden');
      setTimeout(() => personaPanel.classList.add('is-visible'), 10);
    } else {
      personaPanel.classList.remove('is-visible');
      setTimeout(() => personaPanel.classList.add('is-hidden'), 300);
    }
  });
}

if (personaPanelClose) {
  personaPanelClose.addEventListener('click', () => {
    personaPanel.classList.remove('is-visible');
    setTimeout(() => personaPanel.classList.add('is-hidden'), 300);
  });
}

if (personaSlider) {
  personaSlider.addEventListener('input', (e) => {
    selectedPersona = parseInt(e.target.value);
    personaValue.textContent = selectedPersona;
    personaDescription.innerHTML = `<p>${personaDescriptions[selectedPersona]}</p>`;
  });
  
  personaDescription.innerHTML = `<p>${personaDescriptions[selectedPersona]}</p>`;
}
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
  let formattedText = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Fett
    .replace(/\*(.*?)\*/g, '<em>$1</em>')           // Kursiv
    .replace(/\n/g, '<br>');                         // Zeilenumbrüche
  textContent.innerHTML = formattedText;
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
        geojsonInput: uploadedGeojson || null,
        persona: selectedPersona
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
let customPopup = null; // NEW: Custom popup element

// NEW: Create custom popup element
function createCustomPopup() {
  if (customPopup) return customPopup;
  
  const popup = document.createElement('div');
  popup.id = 'customFlightPopup';
  popup.style.cssText = `
    position: absolute;
    z-index: 999;
    display: none;
    pointer-events: none;
  `;
  
  popup.innerHTML = `
    <div class="custom-popup-content glass" style="
      min-width: 240px;
      max-width: 300px;
      padding: 16px;
      border-radius: 12px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
      pointer-events: auto;
      background: rgba(15, 23, 42, 0.95); /* Sehr dunkles Blau, fast deckend */
      backdrop-filter: blur(10px);
      border: 1px solid rgba(61, 242, 255, 0.3); /* Cyanfarbener Rand */
      color: #ffffff; /* Erzwinge weißen Text */
    ">
      <div class="popup-close" style="
        position: absolute;
        top: 10px;
        right: 12px;
        cursor: pointer;
        color: rgba(255,255,255,0.6);
        font-size: 20px;
        line-height: 1;
        transition: color 0.2s;
      ">×</div>
      
      <div class="popup-route" style="
        font-size: 16px;
        font-weight: 800;
        color: #3df2ff; /* Knalliges Cyan für die Route */
        margin-bottom: 12px;
        padding-right: 20px;
        border-bottom: 1px solid rgba(61, 242, 255, 0.2);
        padding-bottom: 8px;
      "></div>
      
      <div class="popup-details" style="
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 8px 15px;
        font-size: 13px;
      "></div>
    </div>
  `;
  
  document.body.appendChild(popup);
  
  // Close button handler
  const closeBtn = popup.querySelector('.popup-close');
  closeBtn.addEventListener('click', () => hideCustomPopup());
  closeBtn.addEventListener('mouseenter', (e) => {
    e.target.style.color = 'var(--danger)';
  });
  closeBtn.addEventListener('mouseleave', (e) => {
    e.target.style.color = 'var(--muted)';
  });
  
  customPopup = popup;
  return popup;
}

// NEW: Show custom popup
function showCustomPopup(attributes, screenPoint) {
  console.log("Popup Attributes received:", attributes); // Debugging: Schau in die Konsole!
  
  const popup = createCustomPopup();
  const routeEl = popup.querySelector('.popup-route');
  const detailsEl = popup.querySelector('.popup-details');
  
  // Header: Zeige Route oder Name
  if (attributes.origin && attributes.destination && attributes.origin !== "N/A") {
    routeEl.innerHTML = `<span style="color: var(--accent)">${attributes.origin}</span> → <span style="color: var(--accent)">${attributes.destination}</span>`;
  } else {
    routeEl.textContent = attributes.name || attributes.callsign || "Flight Info";
  }
  
  // Details Grid
  const rows = [
    { label: "Flight ID", val: attributes.id },
    { label: "Callsign", val: attributes.callsign },
    { label: "Operator", val: attributes.operator },
    { label: "Aircraft", val: attributes.aircraft },
    { label: "Origin", val: attributes.origin },
    { label: "Destination", val: attributes.destination }
  ];
  
  let detailsHTML = "";
  rows.forEach(row => {
    if (row.val && row.val !== "N/A") {
      detailsHTML += `
        <div style="color: rgba(255, 255, 255, 0.5); font-weight: 500;">${row.label}</div>
        <div style="color: #ffffff; text-align: right; font-weight: 600;">${row.val}</div>
      `;
    }
  });
  
  detailsEl.innerHTML = detailsHTML || "<div>No additional data available</div>";
  
  // Positionierung
  popup.style.display = "block";
  popup.style.left = (screenPoint.x + 15) + "px";
  popup.style.top = (screenPoint.y - 15) + "px";
}

// NEW: Hide custom popup
function hideCustomPopup() {
  if (customPopup) {
    customPopup.style.display = 'none';
  }
}

// NEW: Generate random vibrant colors for flight trajectories
function generateFlightColor(index) {
  const colors = [
    [0, 200, 255],    // Cyan
    [255, 77, 109],   // Pink/Red
    [144, 238, 144],  // Light Green
    [255, 215, 0],    // Gold
    [255, 140, 0],    // Dark Orange
    [147, 112, 219],  // Medium Purple
    [255, 105, 180],  // Hot Pink
    [64, 224, 208],   // Turquoise
    [255, 192, 203],  // Pink
    [173, 255, 47]    // Green Yellow
  ];
  
  // If more than 10 flights, generate random colors
  if (index < colors.length) {
    return colors[index];
  } else {
    return [
      Math.floor(Math.random() * 156) + 100, // 100-255
      Math.floor(Math.random() * 156) + 100,
      Math.floor(Math.random() * 156) + 100
    ];
  }
}

// NEW: Create paging controls
function createPagingControls() {
  const view = window.view;
  if (!view) return;
  
  // Remove old controls if they exist
  if (pagingControls) {
    view.ui.remove(pagingControls);
  }
  
  const totalPages = Math.ceil(allFlightLines.length / FLIGHTS_PER_PAGE);
  if (totalPages <= 1) {
    pagingControls = null;
    return; // No paging needed
  }
  
  const container = document.createElement('div');
  container.className = 'paging-controls glass';
  container.style.cssText = `
    padding: 12px 16px;
    background: rgba(0, 0, 0, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  `;
  
  const prevBtn = document.createElement('button');
  prevBtn.innerHTML = '◀';
  prevBtn.style.cssText = `
    background: rgba(61, 242, 255, 0.2);
    border: 1px solid rgba(61, 242, 255, 0.4);
    color: #3df2ff;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s;
  `;
  prevBtn.onmouseover = () => prevBtn.style.background = 'rgba(61, 242, 255, 0.3)';
  prevBtn.onmouseout = () => prevBtn.style.background = 'rgba(61, 242, 255, 0.2)';
  prevBtn.onclick = () => {
    if (currentPage > 0) {
      currentPage--;
      displayFlightPage(currentPage);
      updatePagingDisplay();
    }
  };
  
  const pageInfo = document.createElement('span');
  pageInfo.id = 'pageInfo';
  pageInfo.style.cssText = `
    color: white;
    font-size: 14px;
    min-width: 100px;
    text-align: center;
  `;
  pageInfo.textContent = `Page ${currentPage + 1} / ${totalPages}`;
  
  const nextBtn = document.createElement('button');
  nextBtn.innerHTML = '▶';
  nextBtn.style.cssText = prevBtn.style.cssText;
  nextBtn.onmouseover = () => nextBtn.style.background = 'rgba(61, 242, 255, 0.3)';
  nextBtn.onmouseout = () => nextBtn.style.background = 'rgba(61, 242, 255, 0.2)';
  nextBtn.onclick = () => {
    if (currentPage < totalPages - 1) {
      currentPage++;
      displayFlightPage(currentPage);
      updatePagingDisplay();
    }
  };
  
  const flightCount = document.createElement('span');
  flightCount.style.cssText = `
    color: rgba(255, 255, 255, 0.7);
    font-size: 12px;
    margin-left: 8px;
  `;
  flightCount.textContent = `${allFlightLines.length} flights`;
  
  container.appendChild(prevBtn);
  container.appendChild(pageInfo);
  container.appendChild(nextBtn);
  container.appendChild(flightCount);
  
  pagingControls = container;
  view.ui.add(pagingControls, 'bottom-right');
}

function updatePagingDisplay() {
  const pageInfo = document.getElementById('pageInfo');
  if (pageInfo) {
    const totalPages = Math.ceil(allFlightLines.length / FLIGHTS_PER_PAGE);
    pageInfo.textContent = `Page ${currentPage + 1} / ${totalPages}`;
  }
}

function displayFlightPage(page) {
  const view = window.view;
  const FeatureLayer = window.FeatureLayer;
  const Graphic = window.Graphic;
  
  if (!view || !view.map || !FeatureLayer || !Graphic) return;
  
  // Remove existing line layer
  if (lineFeatureLayer) {
    view.map.remove(lineFeatureLayer);
    lineFeatureLayer = null;
  }
  
  // Calculate slice
  const start = page * FLIGHTS_PER_PAGE;
  const end = Math.min(start + FLIGHTS_PER_PAGE, allFlightLines.length);
  const pageFlights = allFlightLines.slice(start, end);
  
  if (pageFlights.length === 0) return;
  
  // Create graphics with unique colors
  const lineGraphics = pageFlights.map((flightData, pageIndex) => {
    const globalIndex = start + pageIndex;
    const color = generateFlightColor(globalIndex);
    const attr = flightData.attributes || {};
    
    return new Graphic({
      geometry: flightData.geometry,
      attributes: {
        ObjectID: globalIndex,
        type: attr.type || "Flight",
        origin: attr.origin || "N/A",
        destination: attr.destination || "N/A",
        aircraft: attr.aircraft || "N/A",
        operator: attr.operator || "N/A",
        callsign: attr.callsign || "N/A",
        id: String(attr.id || globalIndex),
        name: attr.callsign || "Flight" // Wichtig für das Popup-Fallback
      }
    });
  });
  
  // Create unique value renderer for individual colors
  const uniqueValueInfos = lineGraphics.map((graphic, i) => {
    const color = generateFlightColor(start + i);
    return {
      value: graphic.attributes.ObjectID,
      symbol: {
        type: "simple-line",
        color: [...color, 0.8],
        width: 2.5
      }
    };
  });
  
  lineFeatureLayer = new FeatureLayer({
    source: lineGraphics,
    objectIdField: "ObjectID",
    outFields: ["*"],
    fields: [
      { name: "ObjectID", alias: "ObjectID", type: "oid" },
      { name: "type", alias: "Type", type: "string" },
      { name: "origin", alias: "Origin", type: "string" },
      { name: "destination", alias: "Destination", type: "string" },
      { name: "aircraft", alias: "Aircraft", type: "string" },
      { name: "operator", alias: "Operator", type: "string" },
      { name: "callsign", alias: "Callsign", type: "string" },
      { name: "id", alias: "ID", type: "string" },
      { name: "name", alias: "Name", type: "string" }
    ],
    popupEnabled: false, // Disable default popup
    renderer: {
      type: "unique-value",
      field: "ObjectID",
      uniqueValueInfos: uniqueValueInfos,
      defaultSymbol: {
        type: "simple-line",
        color: [0, 200, 255, 0.8],
        width: 2.5
      }
    }
  });
  
  view.map.add(lineFeatureLayer);
  
  // Zoom to current page
  lineFeatureLayer.queryExtent().then((result) => {
    if (result && result.extent) {
      view.goTo(result.extent.expand(1.3));
    }
  });
}

function displayOnMap(data) {
  const view = window.view;
  const FeatureLayer = window.FeatureLayer;
  const Graphic = window.Graphic;

  clearMap(); 

  if (!view || !view.map || !FeatureLayer || !Graphic) return;

  // Clear existing layers
  if (pointFeatureLayer) {
    view.map.remove(pointFeatureLayer);
    pointFeatureLayer = null;
  }
  if (lineFeatureLayer) {
    view.map.remove(lineFeatureLayer);
    lineFeatureLayer = null;
  }

  // Reset paging
  allFlightLines = [];
  currentPage = 0;

  if (!data) return;

  // 1. Handle Points (Airports/Nodes)
  if (data.points && data.points.length > 0) {
    const pointGraphics = data.points.map((pt, index) => {
      let geom = pt.geometry;
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
      outFields: ["*"],
      fields: [
        { name: "ObjectID", alias: "ObjectID", type: "oid" },
        { name: "name", alias: "Name", type: "string" },
        { name: "type", alias: "Type", type: "string" },
        { name: "id", alias: "ID", type: "string" }
      ],
      popupEnabled: false, // Disable default popup
      renderer: {
        type: "simple",
        symbol: {
          type: "simple-marker",
          color: [255, 77, 109, 0.9],
          size: "10px",
          outline: { color: [255, 255, 255, 0.8], width: 1 }
        }
      }
    });

    view.map.add(pointFeatureLayer);
  }

  // 2. Handle Lines (Trajectories) - Store for paging
  if (data.lines && data.lines.length > 0) {
    data.lines.forEach((ln) => {
      let geom = ln.geometry;
      
      // Fix coordinate order
      if (geom.paths && geom.paths.length > 0) {
        geom.paths = geom.paths.map(path => {
            return path.map(coord => {
                return coord;
            });
        });
      }

      allFlightLines.push({
        geometry: geom,
        attributes: ln.attributes
      });
    });

    // Display first page and create controls
    displayFlightPage(0);
    createPagingControls();
  }
  
  // 3. Zoom to all data
  const layersToZoom = [];
  if (pointFeatureLayer) layersToZoom.push(pointFeatureLayer);
  if (lineFeatureLayer) layersToZoom.push(lineFeatureLayer);
  
  if (layersToZoom.length > 0) {
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
              view.goTo(combinedExtent.expand(1.2));
          }
      }).catch(console.error);
  }
  
  // NEW: Add click handler for custom popup (only once)
  if (!view._customPopupHandlerAdded) {
    view.on('click', (event) => {
      view.hitTest(event).then((response) => {
        if (response.results.length > 0) {
          const result = response.results.find(r => 
            r.graphic && r.graphic.layer && 
            (r.graphic.layer === pointFeatureLayer || r.graphic.layer === lineFeatureLayer)
          );
          
          if (result && result.graphic && result.graphic.attributes) {
            showCustomPopup(result.graphic.attributes, event.screenPoint);
            event.stopPropagation();
          } else {
            hideCustomPopup();
          }
        } else {
          hideCustomPopup();
        }
      });
    });
    
    view._customPopupHandlerAdded = true;
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

// NEW: Clear Context Button Handler
const clearContextBtn = document.getElementById('clearContextBtn');
if (clearContextBtn) {
  clearContextBtn.addEventListener('click', () => {
    if (confirm('Clear conversation history? This will start a fresh context.')) {
      clearChatContext();
    }
  });
}

function clearMap() {
  const view = window.view;
  if (!view) return;

  // 1. Point Layer sicher entfernen
  if (pointFeatureLayer && view.map) {
    view.map.remove(pointFeatureLayer);
    pointFeatureLayer = null;
  }

  // 2. Line Layer sicher entfernen
  if (lineFeatureLayer && view.map) {
    view.map.remove(lineFeatureLayer);
    lineFeatureLayer = null;
  }

  // 3. Paging Variablen zurücksetzen
  allFlightLines = [];
  currentPage = 0;

  // 4. Paging Controls aus dem UI entfernen
  if (pagingControls && view.ui) {
    view.ui.remove(pagingControls);
    pagingControls = null;
  }

  // 5. DEIN Custom Popup schließen (wichtig!)
  if (typeof hideCustomPopup === "function") {
    hideCustomPopup();
  }

  // 6. ArcGIS Standard Popup sicher schließen (Fix für deinen Fehler)
  if (view.popup) {
    // Prüfen, ob die Funktion existiert, bevor sie aufgerufen wird
    if (typeof view.popup.close === "function") {
      view.popup.close();
    } else {
      // Fallback: Einfach unsichtbar schalten
      view.popup.visible = false;
    }
  }

  console.log("Map cleared successfully.");
}

autosize();

