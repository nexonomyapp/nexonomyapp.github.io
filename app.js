import { kinds } from "./assets-model.js";
import { createMap } from "./map.js";
import {
  accountsConfigured, addAccountAsset, connectAccounts, createAccountList, hasBrowserStorage,
  readAccountLists, readGuestActiveId, readGuestLists, removeAccountAsset, writeGuestActiveId, writeGuestLists,
} from "./store.js";

const $ = id => document.getElementById(id);
const el = (tag, className, text) => {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text) item.textContent = text;
  return item;
};
const icon = name => {
  const item = el("img");
  item.src = `./assets/${name}.svg`;
  item.alt = "";
  return item;
};
const swatch = kind => el("span", `swatch ${kind.toLowerCase()}`);
const button = (label, className, click) => {
  const item = el("button", className, label);
  item.type = "button";
  item.addEventListener("click", click);
  return item;
};
const option = (value, label) => new Option(label, value);
const announce = (id, text = "", isError = false) => {
  $(id).textContent = text;
  $(id).dataset.error = String(isError);
};

let guestLists = readGuestLists();
let lists = guestLists;
let activeId = readGuestActiveId();
let visible = new Map();
let selected = null;
let user = null;
let client = null;
let accountError = false;
let accountListError = false;
let loadingLists = false;
let writing = false;
let authBusy = false;
let mapView;

function activeList() {
  return lists.find(list => list.id === activeId) ?? lists[0];
}

function chooseAsset(asset, origin) {
  selected = asset;
  mapView.showSelected(asset, origin === "saved" || origin === "browse");
  $("visible-assets").value = visible.has(asset?.id) ? asset.id : "";
  announce("list-status");
  renderInspector();
  if (origin === "map" && asset && matchMedia("(max-width: 550px)").matches) {
    $("inspect-title").scrollIntoView({ block: "nearest" });
  }
  if (origin === "saved" && matchMedia("(max-width: 890px)").matches) {
    $("map-title").closest(".map-panel").scrollIntoView({ block: "start" });
  }
}

function browse(assets, total) {
  visible = new Map(assets.map(asset => [asset.id, asset]));
  const select = $("visible-assets");
  const caption = total > assets.length ? `Browse ${assets.length} of ${total} visible assets` : "Browse visible assets";
  const groups = Object.entries(kinds).flatMap(([kind, meta]) => {
    const matching = assets.filter(asset => asset.properties.kind === kind);
    if (!matching.length) return [];
    const group = el("optgroup");
    group.label = `${meta.label}s`;
    group.append(...matching.map(asset => option(asset.id, `${asset.properties.name} · ${asset.id}`)));
    return [group];
  });
  select.replaceChildren(option("", visible.size ? caption : "No visible assets to browse"), ...groups);
  select.disabled = !visible.size;
  select.value = selected && visible.has(selected.id) ? selected.id : "";
}

function renderInspector() {
  const target = $("asset-details");
  if (!selected) {
    const box = el("div", "empty pick-empty");
    const text = el("div");
    text.append(el("strong", "", "Pick an asset on the map"), el("p", "", "Click a highlighted building, road, tree or pond."));
    box.append(icon("mouse-pointer-2"), text);
    target.replaceChildren(box);
    return;
  }
  const asset = selected;
  const { kind, name, descriptor } = asset.properties;
  const card = el("div", "asset-card");
  const type = el("div", "kind-label");
  type.append(swatch(kind), document.createTextNode(kinds[kind].label));
  const meta = el("p", "asset-meta");
  const source = el("a", "", `OpenStreetMap ${asset.id}`);
  if (/^(node|way|relation)\/\d+$/.test(asset.id)) source.href = `https://www.openstreetmap.org/${asset.id}`;
  source.target = "_blank";
  source.rel = "noopener";
  meta.append(`${asset.geometry.type}${descriptor ? ` · ${descriptor}` : ""}`, el("br"), source);
  const list = activeList();
  const alreadySaved = list?.assets.some(item => item.id === asset.id);
  const action = button(alreadySaved ? "Already in this list" : list ? "Add to active list" : "Create a list to add this asset", "primary", () => addAsset(asset));
  action.id = "add-asset";
  action.disabled = !list || alreadySaved || writing || loadingLists;
  card.append(type, el("h3", "", name), meta, action);
  target.replaceChildren(card);
}

function renderLists() {
  const list = activeList();
  const select = $("active-list");
  select.replaceChildren(...(lists.length
    ? lists.map(item => option(item.id, item.name))
    : [option("", loadingLists ? "Loading your lists…" : "No lists yet")]));
  select.disabled = !lists.length || writing || loadingLists;
  if (list) select.value = list.id;
  $("new-list").disabled = writing || loadingLists || accountListError;
  const count = list?.assets.length ?? 0;
  $("list-count").textContent = `${count} ${count === 1 ? "asset" : "assets"}`;
  $("storage-label").textContent = user ? "Account lists" : hasBrowserStorage ? "This browser" : "This tab only";
  const target = $("list-contents");
  if (!count) {
    const blank = el("div", "empty");
    blank.append(icon("bookmark"), el("p", "", loadingLists ? "Loading your saved assets." : accountListError
      ? "Your account lists couldn’t be loaded." : list ? "Your saved assets will appear here." : "Create a list to start saving assets."));
    if (accountListError && !loadingLists) blank.append(button("Retry", "secondary", refreshAccountLists));
    target.replaceChildren(blank);
    return;
  }
  const rows = el("ul", "saved-list");
  for (const asset of list.assets) {
    const { kind, name } = asset.properties;
    const row = el("li", "saved-row");
    const locate = button("", "locate", () => chooseAsset(asset, "saved"));
    const description = el("span");
    description.append(el("strong", "", name), el("small", "", `${kinds[kind].label} · ${asset.id}`));
    locate.append(swatch(kind), description);
    const remove = button("", "icon-button", () => removeAsset(asset));
    remove.append(icon("trash-2"));
    remove.setAttribute("aria-label", `Remove ${name} from ${list.name}`);
    remove.disabled = writing;
    row.append(locate, remove);
    rows.append(row);
  }
  target.replaceChildren(rows);
}

function renderWorkspace() {
  renderLists();
  renderInspector();
}

function saveGuest(next) {
  writeGuestLists(next);
  guestLists = next;
  lists = next;
}

async function updateMembership(asset, remove = false) {
  const list = activeList();
  if (!list || writing || loadingLists || list.assets.some(item => item.id === asset.id) === !remove) return;
  const owner = user?.id;
  const restoreScroll = $("list-contents").querySelector(".saved-list")?.scrollTop || 0;
  const actionHadFocus = $("add-asset") === document.activeElement;
  writing = true;
  renderWorkspace();
  try {
    if (owner) {
      if (remove) await removeAccountAsset(client, list.id, asset.id);
      else await addAccountAsset(client, owner, list.id, asset);
    }
    if (owner !== user?.id) return;
    const next = lists.map(item => item.id === list.id ? {
      ...item, assets: remove ? item.assets.filter(saved => saved.id !== asset.id) : [asset, ...item.assets],
    } : item);
    if (owner) lists = next;
    else saveGuest(next);
    announce("list-status", remove ? `Removed from ${list.name}.` : `Added to ${list.name}.`);
  } catch {
    if (owner === user?.id) announce("list-status", "The change could not be saved. Try again.", true);
  } finally {
    writing = false;
    renderWorkspace();
    const rows = $("list-contents").querySelector(".saved-list");
    if (rows) rows.scrollTop = restoreScroll;
    if (actionHadFocus) {
      const destination = $("add-asset")?.disabled ? $("active-list") : $("add-asset");
      destination?.focus({ preventScroll: true });
    }
  }
}

const addAsset = asset => updateMembership(asset);
const removeAsset = asset => updateMembership(asset, true);

async function refreshAccountLists() {
  const owner = user?.id;
  if (!owner) return;
  loadingLists = true;
  accountListError = false;
  renderWorkspace();
  try {
    const loaded = await readAccountLists(client);
    if (user?.id !== owner) return;
    lists = loaded;
    activeId = activeList()?.id;
  } catch {
    if (user?.id === owner) accountListError = true;
  } finally {
    if (user?.id === owner) {
      loadingLists = false;
      renderWorkspace();
    }
  }
}

function renderAccount() {
  const account = $("account");
  account.querySelector("span").textContent = user?.email || (accountsConfigured && !accountError ? "Sign in" : "Guest mode");
  account.setAttribute("aria-label", user ? "Account settings" : accountsConfigured && !accountError ? "Sign in" : "Guest mode");
  $("auth-form").hidden = Boolean(user || !accountsConfigured || accountError);
  const text = user ? `Signed in as ${user.email}. Lists in this account are separate from guest lists.`
    : accountError ? "The account service couldn’t start. You can still use the guest workspace."
      : accountsConfigured ? "Sign in to save lists to your account. Guest lists remain on this browser and are not transferred."
        : hasBrowserStorage ? "Guest lists are saved in this browser. Account sign-in is not enabled on this deployment."
          : "This preview can’t save to browser storage. Guest lists are available until you close or reload this tab.";
  $("account-description").textContent = text;
  $("account-actions").replaceChildren(...(user
    ? [button("Sign out", "secondary", signOut)]
    : $("auth-form").hidden ? [button("Continue as guest", "primary", () => $("account-dialog").close())] : []));
}

async function signOut(event) {
  const trigger = event.currentTarget;
  trigger.disabled = true;
  try {
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) throw error;
    $("account-dialog").close();
  } catch {
    announce("account-feedback", "Could not sign out. Please try again.", true);
    trigger.disabled = false;
  }
}

function changeSession(nextUser) {
  if ((nextUser?.id ?? null) === (user?.id ?? null)) return;
  user = nextUser;
  accountListError = false;
  loadingLists = Boolean(user);
  lists = user ? [] : guestLists;
  activeId = user ? undefined : readGuestActiveId();
  announce("list-status");
  renderAccount();
  renderWorkspace();
  if (user) refreshAccountLists();
}

$("active-list").addEventListener("change", event => {
  activeId = event.target.value;
  if (!user) writeGuestActiveId(activeId);
  announce("list-status");
  renderWorkspace();
});
$("visible-assets").addEventListener("change", event => {
  const asset = visible.get(event.target.value);
  if (asset) chooseAsset(asset, "browse");
});
for (const filter of document.querySelectorAll("[data-kind]")) {
  filter.addEventListener("click", () => {
    for (const item of document.querySelectorAll("[data-kind]")) item.setAttribute("aria-pressed", String(item === filter));
    mapView.setFilter(filter.dataset.kind);
  });
}
for (const closer of document.querySelectorAll("[data-close]")) {
  closer.addEventListener("click", () => closer.closest("dialog").close());
}
$("new-list").addEventListener("click", () => {
  $("new-list-form").reset();
  announce("new-list-feedback");
  $("list-dialog").showModal();
});
$("new-list-form").addEventListener("submit", async event => {
  event.preventDefault();
  const name = $("list-name").value.trim();
  if (!name) { announce("new-list-feedback", "Enter a name for this list.", true); return; }
  if (writing || loadingLists) return;
  const submit = event.submitter;
  submit.disabled = true;
  writing = true;
  const owner = user?.id;
  try {
    const list = owner ? await createAccountList(client, owner, name) : { id: crypto.randomUUID(), name, assets: [] };
    if (user?.id !== owner) return;
    if (owner) lists = [...lists, list];
    else {
      saveGuest([...lists, list]);
      writeGuestActiveId(list.id);
    }
    activeId = list.id;
    $("list-dialog").close();
    announce("list-status", `Created ${name}.`);
  } catch {
    announce("new-list-feedback", "The list could not be created. Please try again.", true);
  } finally {
    writing = false;
    submit.disabled = false;
    renderWorkspace();
  }
});
$("account").addEventListener("click", () => {
  announce("account-feedback");
  $("auth-form").reset();
  renderAccount();
  $("account-dialog").showModal();
});
$("auth-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (authBusy || !client) { announce("account-feedback", "Account service is still starting. Please try again."); return; }
  const isSignup = event.submitter?.value === "signUp";
  const email = $("email").value.trim();
  const password = $("password").value;
  if (isSignup && password.length < 8) { announce("account-feedback", "Choose a password with at least 8 characters.", true); return; }
  authBusy = true;
  const actions = [...$("auth-form").querySelectorAll("button")];
  actions.forEach(item => { item.disabled = true; });
  announce("account-feedback", isSignup ? "Creating your account…" : "Signing in…");
  try {
    const { data, error } = isSignup
      ? await client.auth.signUp({ email, password, options: { emailRedirectTo: new URL("./", location.href).href } })
      : await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    $("password").value = "";
    if (data.session) {
      changeSession(data.session.user);
      $("account-dialog").close();
    } else {
      announce("account-feedback", "Check your email for a confirmation link, then sign in.");
    }
  } catch {
    announce("account-feedback", isSignup ? "Account creation failed. Check your email and password and try again."
      : "Sign-in failed. Check your credentials and whether your email is confirmed, then try again.", true);
  } finally {
    authBusy = false;
    actions.forEach(item => { item.disabled = false; });
  }
});

mapView = createMap({ onSelect: chooseAsset, onBrowse: browse });
renderWorkspace();
renderAccount();
if (accountsConfigured) {
  connectAccounts(changeSession).then(result => { client = result; }).catch(() => {
    accountError = true;
    renderAccount();
  });
}
