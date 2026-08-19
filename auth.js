const ATHKAR_API = "https://athkar-api.5jfwpmvt9w.workers.dev";
const AUTH_LOCAL_KEY = "athkarSessionToken";
const AUTH_SESSION_KEY = "athkarSessionTokenTemp";
const AUTH_USER_KEY = "athkarCurrentUser";

function authToken() {
  return localStorage.getItem(AUTH_LOCAL_KEY) ||
         sessionStorage.getItem(AUTH_SESSION_KEY) || "";
}

function authSavedUser() {
  try { return JSON.parse(localStorage.getItem(AUTH_USER_KEY) || "null"); }
  catch { return null; }
}

function saveAuth(token, user, remember=true) {
  localStorage.removeItem(AUTH_LOCAL_KEY);
  sessionStorage.removeItem(AUTH_SESSION_KEY);
  if (remember) localStorage.setItem(AUTH_LOCAL_KEY, token);
  else sessionStorage.setItem(AUTH_SESSION_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user || null));
}

function clearAuth() {
  localStorage.removeItem(AUTH_LOCAL_KEY);
  sessionStorage.removeItem(AUTH_SESSION_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}


function currentUserId() {
  return window.ATHKAR_USER?.id || authSavedUser()?.id || null;
}

function scopedStorageKey(base) {
  const uid = currentUserId();
  return uid ? `${base}:user:${uid}` : `${base}:anonymous`;
}

function storageGet(base, fallback = null) {
  const value = localStorage.getItem(scopedStorageKey(base));
  return value === null ? fallback : value;
}

function storageSet(base, value) {
  localStorage.setItem(scopedStorageKey(base), String(value));
}

function storageRemove(base) {
  localStorage.removeItem(scopedStorageKey(base));
}

function purgeLegacySharedUserData() {
  const legacy = [
    "selectedCity","athkarCityDefaultV11","iqamahMinutes",
    "athkarAppointmentsV1","athkarFinanceOverridesV1",
    "athkarState","athkarQuranReadingStateV2",
    "tasbeehCount","darkMode","deviceTopPercent"
  ];
  for (const key of legacy) localStorage.removeItem(key);
}

async function authFetch(path, options={}) {
  const headers = new Headers(options.headers || {});
  const token = authToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type","application/json");
  return fetch(ATHKAR_API + path, {...options, headers});
}

async function fetchMe() {
  const r = await authFetch("/api/me");
  if (!r.ok) throw new Error("unauthorized");
  const j = await r.json();
  if (!j.ok || !j.user) throw new Error("unauthorized");
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(j.user));
  return j.user;
}

async function requireAuth() {
  document.documentElement.classList.add("auth-pending");
  if (!authToken()) {
    location.replace("login.html?next=" + encodeURIComponent(location.pathname.split("/").pop() || "time.html"));
    return null;
  }
  try {
    const user = await fetchMe();
    window.ATHKAR_USER = user;
    purgeLegacySharedUserData();
    document.documentElement.classList.remove("auth-pending");
    document.dispatchEvent(new CustomEvent("athkar-auth-ready", {detail:user}));
    return user;
  } catch {
    clearAuth();
    location.replace("login.html");
    return null;
  }
}

async function logoutAthkar() {
  try { await authFetch("/api/logout", {method:"POST"}); } catch {}
  clearAuth();
  location.replace("login.html");
}

window.AthkarAuth = {
  API_BASE: ATHKAR_API,
  token: authToken,
  user: authSavedUser,
  save: saveAuth,
  clear: clearAuth,
  fetch: authFetch,
  me: fetchMe,
  require: requireAuth,
  logout: logoutAthkar,
  userId: currentUserId,
  storageKey: scopedStorageKey,
  storageGet,
  storageSet,
  storageRemove
};
