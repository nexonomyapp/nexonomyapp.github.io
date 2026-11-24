import { config } from "./config.js";
import { kinds, makeQuery, normalizeFeatures } from "./assets-model.js";

const START = [48.84685, 2.33745];
const START_ZOOM = 17;
const L = window.L;
const DEMO_BOUNDS = L.latLngBounds([48.843, 2.332], [48.851, 2.3435]);
const format = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

export function createMap({ onSelect, onBrowse }) {
  const map = L.map("map", { zoomControl: false, worldCopyJump: true, maxZoom: 20, minZoom: 2 }).setView(START, START_ZOOM);
  map.attributionControl.setPrefix(false);
  L.control.zoom({ position: "topright" }).addTo(map);
  L.control.scale({ imperial: false }).addTo(map);
  const tiles = L.tileLayer(config.tileUrl, {
    maxZoom: 20,
    maxNativeZoom: 19,
    attribution: config.tileAttribution,
  }).addTo(map);
  let tileWarning = false;
  tiles.on("tileerror", () => { tileWarning = true; updateStatus(); });
  tiles.on("tileload", () => { if (tileWarning) { tileWarning = false; updateStatus(); } });

  const status = document.querySelector("#map-status");
  const coordinates = document.querySelector("#coordinates");
  const label = document.querySelector("#map-label");
  const loadButton = document.querySelector("#load-assets");
  const cache = new Map();
  let dataset = [];
  let groups = {};
  let layerById = new Map();
  let filter = "ALL";
  let lastLoad = 0;
  let controller;
  let areaType = "starter";
  let areaBounds = DEMO_BOUNDS;
  let notice = "Loading starter assets…";
  let demoPromise;
  let selected;

  const panes = { ROAD: 410, BUILDING: 420, POND: 425, TREE: 430, selected: 440 };
  for (const [key, z] of Object.entries(panes)) {
    const pane = map.createPane(key);
    pane.style.zIndex = z;
    if (key === "selected") pane.style.pointerEvents = "none";
  }
  const highlight = L.geoJSON(null, {
    pane: "selected",
    interactive: false,
    style: { color: "#153e2f", weight: 4, opacity: 1, fillColor: "#f4e199", fillOpacity: 0.36 },
    pointToLayer: (_, position) => L.circleMarker(position, {
      pane: "selected", interactive: false, radius: 8, color: "#153e2f", weight: 3, fillColor: "#f4e199", fillOpacity: 0.94,
    }),
  }).addTo(map);

  function draw() {
    for (const group of Object.values(groups)) group.remove();
    layerById = new Map();
    groups = Object.fromEntries(Object.entries(kinds).map(([kind, style]) => {
      const group = L.geoJSON(dataset.filter(asset => asset.properties.kind === kind), {
        pane: kind,
        bubblingMouseEvents: false,
        style: {
          color: style.color, fillColor: style.fill, weight: kind === "ROAD" ? 3 : 1.3,
          opacity: kind === "ROAD" ? 0.57 : 0.82, fillOpacity: kind === "POND" ? 0.34 : 0.23,
        },
        pointToLayer: (_, position) => L.circleMarker(position, {
          pane: kind, bubblingMouseEvents: false, radius: 3.6, color: style.color, weight: 1, fillColor: style.fill, fillOpacity: 0.73,
        }),
        onEachFeature(asset, layer) {
          layerById.set(asset.id, layer);
          layer.on("click", () => onSelect(asset, "map"));
          const tooltip = document.createElement("span");
          tooltip.textContent = asset.properties.name;
          layer.bindTooltip(tooltip, { sticky: true, direction: "top", opacity: 0.96 });
        },
      });
      return [kind, group];
    }));
    applyFilter();
  }

  function applyFilter() {
    for (const [kind, group] of Object.entries(groups)) {
      if (filter === "ALL" || filter === kind) group.addTo(map);
      else group.remove();
    }
    updateStatus();
  }

  function updateStatus() {
    const center = map.getCenter().wrap();
    const bounds = map.getBounds();
    coordinates.textContent = `${center.lat.toFixed(4)}°, ${center.lng.toFixed(4)}° · Z${map.getZoom()}`;
    const visible = dataset.filter(asset => {
      if (filter !== "ALL" && asset.properties.kind !== filter) return false;
      const layer = layerById.get(asset.id);
      return layer.getLatLng ? bounds.contains(layer.getLatLng()) : bounds.intersects(layer.getBounds());
    });
    const centerInArea = areaBounds?.contains(center);
    label.textContent = centerInArea ? (areaType === "starter" ? "Jardin du Luxembourg" : "Loaded map area") : "OpenStreetMap";
    let message = `${format.format(visible.length)} visible · ${areaType === "starter" ? "Starter data" : "OpenStreetMap data"}`;
    if (!centerInArea) message = map.getZoom() < START_ZOOM ? "Zoom in to load selectable assets." : "New area? Select “Load this area”.";
    status.textContent = [notice || message, tileWarning ? "Some basemap tiles are unavailable." : ""].filter(Boolean).join(" ");
    onBrowse(Object.keys(kinds).flatMap(kind => visible.filter(asset => asset.properties.kind === kind).slice(0, 200)), visible.length);
  }

  async function setStarter(reset = true) {
    controller?.abort();
    controller = undefined;
    areaType = "starter";
    areaBounds = DEMO_BOUNDS;
    notice = "Loading starter assets…";
    loadButton.disabled = false;
    if (reset) map.setView(START, START_ZOOM, { animate: false });
    updateStatus();
    try {
      demoPromise ||= fetch("./data/luxembourg.geojson").then(response => {
        if (!response.ok) throw new Error("Starter data unavailable");
        return response.json();
      }).catch(error => { demoPromise = undefined; throw error; });
      const data = await demoPromise;
      if (areaType !== "starter" || controller) return;
      dataset = data.features;
      notice = "";
      draw();
    } catch {
      if (areaType !== "starter" || controller) return;
      notice = "Starter data unavailable. Try “Load this area” or reopen the starter area.";
      updateStatus();
    }
  }

  async function loadHere() {
    const bounds = map.getBounds();
    if (map.getZoom() < START_ZOOM || bounds.getEast() - bounds.getWest() > 0.027 || bounds.getNorth() - bounds.getSouth() > 0.022) {
      notice = "Zoom in one or more levels before loading this area.";
      updateStatus();
      return;
    }
    const bbox = [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()].map(n => n.toFixed(4)).join(",");
    if (bounds.getWest() < -180 || bounds.getEast() > 180) {
      notice = "Pan to one side of the 180° meridian and try again.";
      updateStatus();
      return;
    }
    const cacheKey = bbox;
    if (cache.has(cacheKey)) {
      ({ dataset, areaBounds } = cache.get(cacheKey));
      areaType = "live";
      notice = dataset.length ? "" : "No mapped buildings, roads, trees or ponds found here.";
      draw();
      return;
    }
    if (Date.now() - lastLoad < 2500) {
      notice = "Please wait a moment before requesting another area.";
      updateStatus();
      return;
    }
    lastLoad = Date.now();
    const request = new AbortController();
    controller = request;
    loadButton.disabled = true;
    notice = "Requesting OpenStreetMap assets…";
    updateStatus();
    try {
      let loaded;
      const center = bounds.getCenter();
      const inEurope = center.lat > 43.5 && center.lat < 71.5 && center.lng > -11.5 && center.lng < 30;
      const endpoints = [inEurope && config.europeanOverpassEndpoint, ...config.overpassEndpoints].filter(Boolean);
      for (const endpoint of endpoints) {
        try {
          const url = new URL(endpoint);
          url.searchParams.set("data", makeQuery(bbox));
          const response = await fetch(url, { signal: AbortSignal.any([request.signal, AbortSignal.timeout(11500)]) });
          if (response.status === 429 || response.status === 406) lastLoad = Date.now() + 27500;
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const json = await response.json();
          if (json.remark || !Array.isArray(json.elements)) throw new Error("Incomplete result");
          loaded = normalizeFeatures(window.osmtogeojson(json, { flatProperties: false }));
          break;
        } catch {
          if (request.signal.aborted) return;
        }
      }
      if (!loaded) throw new Error("No available endpoints");
      dataset = loaded;
      areaType = "live";
      areaBounds = bounds;
      if (cache.size >= 8) cache.delete(cache.keys().next().value);
      cache.set(cacheKey, { dataset, areaBounds });
      notice = dataset.length ? "" : "No mapped buildings, roads, trees or ponds found here.";
      draw();
    } catch {
      if (!request.signal.aborted) {
        notice = "Live assets unavailable. Existing assets are unchanged; try again or return to Paris.";
        updateStatus();
      }
    } finally {
      if (controller === request) { controller = undefined; loadButton.disabled = false; }
    }
  }

  function showSelected(asset, recenter = false) {
    selected = asset;
    highlight.clearLayers();
    if (!selected) return;
    highlight.addData(selected);
    if (!recenter) return;
    const bounds = highlight.getBounds();
    const size = map.latLngToContainerPoint(bounds.getNorthEast()).distanceTo(map.latLngToContainerPoint(bounds.getSouthWest()));
    if (size < 3) map.setView(bounds.getCenter(), Math.max(START_ZOOM, map.getZoom()), { animate: false });
    else map.fitBounds(bounds, { padding: [45, 45], maxZoom: 18, animate: false });
  }

  map.on("moveend", () => {
    if (!controller && !notice.startsWith("Loading starter")) notice = "";
    updateStatus();
  });
  map.on("click", () => onSelect(null, "map"));
  loadButton.addEventListener("click", loadHere);
  document.querySelector("#starter").addEventListener("click", () => setStarter());
  setStarter(false);

  return {
    setFilter(kind) { filter = kind; applyFilter(); },
    showSelected,
    focus() { map.getContainer().focus({ preventScroll: true }); },
  };
}
