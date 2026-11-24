# Nexonomy | Map workspace

A static, map-first prototype for collecting territorial assets in named lists. It implements the map navigation, asset geometry and provenance concepts in the [Nexonomy map requirements](https://github.com/nexonomyapp/specification/blob/main/docs/13_map_requirements.md) and [asset model](https://github.com/nexonomyapp/specification/blob/main/docs/09_asset_model.md). It does not edit OpenStreetMap or implement study-area drawing, dependency graphs, scenarios or valuation.

## Deploy on GitHub Pages

1. Extract the ZIP and copy its contents to the root of [`nexonomyapp/nexonomyapp.github.io`](https://github.com/nexonomyapp/nexonomyapp.github.io), so `index.html` is alongside the repository’s existing `LICENSE`. Keep the `assets/`, `data/`, and `vendor/` directories intact, and include `.nojekyll`.
2. Commit or upload the files to `main`. In the repository, open **Settings → Pages**, choose **Deploy from a branch**, select `main` and `/(root)`, and save. See [GitHub’s Pages instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
3. Open `https://nexonomyapp.github.io/`. No build, API key or account is required to try the map and guest lists.

For a local preview, run `python3 -m http.server 8000` from the extracted directory and open `http://localhost:8000/`. Serve the files over HTTP rather than double-clicking `index.html`, because JavaScript modules and the starter dataset are fetched separately.

## Use the map

- The included starter data opens at the Jardin du Luxembourg in Paris. Click a highlighted building, road, mapped tree, or pond/basin to inspect its geometry type and direct OpenStreetMap record. The category chips filter the overlays. The **Browse visible assets** menu allows selection without clicking the map.
- Create or pick a list, then select **Add to active list**. Entries can be removed or clicked to locate their geometry again. A given OpenStreetMap element can only appear once per list. Guest lists persist in the current browser; they are not shared with other browsers or transferred to a signed-in account.
- To explore beyond the starter area, pan or zoom out to navigate, zoom back in to street level, then select **Load this area**. Live selectable overlays depend on public [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) availability and OpenStreetMap tagging. Not every real-world feature is mapped. If the provider is unavailable, existing assets remain available, and **Starter area: Paris** restores the included snapshot. Use a suitable dedicated provider for a higher-traffic deployment, and update `overpassEndpoints` and `europeanOverpassEndpoint` in `config.js`.

## Enable email accounts and synced lists

Guest mode is ready without this step. For authenticated users and lists shared across their devices:

1. Create a [Supabase project](https://supabase.com/dashboard). Run `supabase/schema.sql` once in its SQL Editor. The schema grants access only to authenticated users and uses [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security) to scope records to their owner.
2. In `config.js`, enter your project HTTPS URL and its browser-safe **publishable** key (the legacy `anon` key is also supported). Never publish a `service_role` or secret key.
3. Enable the Email provider and configure **Authentication → URL Configuration**. Set **Site URL** to `https://nexonomyapp.github.io/`, and add `https://nexonomyapp.github.io/` to allowed redirects. For local integration tests, also allow `http://localhost:8000/` or the exact local origin used. Follow [Supabase’s password authentication guide](https://supabase.com/docs/guides/auth/passwords) for email confirmation and production mail delivery.
4. Redeploy. Verify email signup or sign-in, list creation, and persistence after signing out and back in. As a permissions check, provision a separate test account and verify that it cannot read or change the first account’s lists. This package is not linked to a live Supabase project.

## Data and licenses

The starter extract `data/luxembourg.geojson` contains real OpenStreetMap features for the bounding box `2.332, 48.843, 2.3435, 48.851` (west, south, east, north). The extract retains OSM element identifiers, selected tags, and WGS 84 GeoJSON geometry. It is a snapshot, not a live census. The data is © OpenStreetMap contributors under the [Open Database License](https://www.openstreetmap.org/copyright). The prototype uses the [standard OpenStreetMap basemap](https://operations.osmfoundation.org/policies/tiles/); configure `tileUrl` and `tileAttribution` in `config.js` if you switch to a dedicated tile provider.

Third-party components are vendored to avoid runtime CDN dependencies for app code. Their license notices are bundled under `vendor/`. Internet access is still required for tiles, live asset requests, and configured accounts.
