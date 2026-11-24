export const config = {
  // Leave these blank for a ready-to-use, browser-local guest workspace.
  // If enabling accounts, use only the public/publishable browser key.
  supabaseUrl: "",
  supabasePublishableKey: "",
  tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  tileAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
  // Override with your own endpoint for a public or higher-traffic deployment.
  europeanOverpassEndpoint: "https://ovp.dresel.systems/api/interpreter",
  overpassEndpoints: [
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass-api.de/api/interpreter",
  ],
};
