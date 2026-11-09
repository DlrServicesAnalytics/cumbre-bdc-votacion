// Capa de datos de la votación: Firebase (producción) o localStorage (modo demostración: agrega ?demo a la URL).
import { FIREBASE_CONFIG } from "./config.js";

export const MODE = (new URLSearchParams(location.search).has("demo") || !FIREBASE_CONFIG?.projectId) ? "demo" : "firebase";
const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
let api = null;

export class VotoError extends Error { constructor(code, msg) { super(msg || code); this.code = code; } }

const withTimeout = (p, ms = 12000) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new VotoError("timeout")), ms))]);

export async function store() {
  if (api) return api;
  api = MODE === "demo" ? demoStore() : await firebaseStore();
  return api;
}

/* ================= Firebase ================= */
async function firebaseStore() {
  const appMod = await import(SDK + "firebase-app.js");
  const fs = await import(SDK + "firebase-firestore.js");
  const app = appMod.initializeApp(FIREBASE_CONFIG);
  const db = fs.getFirestore(app);
  const d = (c, id) => fs.doc(db, c, id);
  let authMod = null, auth = null;
  const getAuth = async () => { if (!auth) { authMod = await import(SDK + "firebase-auth.js"); auth = authMod.getAuth(app); } return auth; };
  const snapList = s => s.docs.map(x => ({ id: x.id, ...x.data(), ts: x.data().ts?.toMillis ? x.data().ts.toMillis() : x.data().ts }));

  return {
    mode: "firebase",
    async getConfig() { const s = await withTimeout(fs.getDoc(d("config", "votacion"))); return s.exists() ? s.data() : null; },
    watchConfig(cb, onErr) { return fs.onSnapshot(d("config", "votacion"), s => cb(s.exists() ? s.data() : null), onErr); },
    async getCodigo(code) { const s = await withTimeout(fs.getDoc(d("codigos", code))); return s.exists() ? s.data() : null; },
    async getUsado(code) { const s = await withTimeout(fs.getDoc(d("usados", code))); return s.exists(); },
    async votar(code, seg, picks) {
      const b = fs.writeBatch(db);
      b.set(d("votos", code), { seg, picks, ts: fs.serverTimestamp() });
      b.set(d("usados", code), { ts: fs.serverTimestamp() });
      try { await withTimeout(b.commit(), 15000); }
      catch (e) { if (e.code === "permission-denied") throw new VotoError("denied"); throw e instanceof VotoError ? e : new VotoError("network", e.message); }
    },
    /* --- administración --- */
    async onAuth(cb) { const a = await getAuth(); return authMod.onAuthStateChanged(a, u => cb(u ? { email: u.email } : null)); },
    async login(email, pw) { const a = await getAuth(); await authMod.signInWithEmailAndPassword(a, email, pw); },
    async logout() { const a = await getAuth(); await authMod.signOut(a); },
    watch(col, cb, onErr) { return fs.onSnapshot(fs.collection(db, col), s => cb(snapList(s)), onErr); },
    async setConfig(patch) { await fs.setDoc(d("config", "votacion"), { ...patch, actualizado: fs.serverTimestamp() }, { merge: true }); },
    async putCodes(list) {
      for (let i = 0; i < list.length; i += 200) {
        const b = fs.writeBatch(db);
        list.slice(i, i + 200).forEach(c => { b.set(d("codigos", c.code), c.pub); b.set(d("padron", c.code), c.priv); });
        await b.commit();
      }
    },
    async delCodes(codes) {
      for (let i = 0; i < codes.length; i += 200) {
        const b = fs.writeBatch(db);
        codes.slice(i, i + 200).forEach(c => { b.delete(d("codigos", c)); b.delete(d("padron", c)); });
        await b.commit();
      }
    },
    async resetVotos() {
      const [v, u] = await Promise.all([fs.getDocs(fs.collection(db, "votos")), fs.getDocs(fs.collection(db, "usados"))]);
      const refs = [...v.docs, ...u.docs].map(x => x.ref);
      for (let i = 0; i < refs.length; i += 400) { const b = fs.writeBatch(db); refs.slice(i, i + 400).forEach(r => b.delete(r)); await b.commit(); }
      return v.size;
    }
  };
}

/* ================= Demostración (localStorage) ================= */
function demoStore() {
  const KEY = "votacion_demo_db";
  const bc = "BroadcastChannel" in window ? new BroadcastChannel("votacion_demo") : null;
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; } };
  const subs = new Set();
  const write = m => { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) {} if (bc) bc.postMessage(1); subs.forEach(f => f()); };
  if (bc) bc.onmessage = () => subs.forEach(f => f());
  window.addEventListener("storage", e => { if (e.key === KEY) subs.forEach(f => f()); });
  const col = (m, c) => Object.keys(m).filter(k => k.startsWith(c + "/")).map(k => ({ id: k.slice(c.length + 1), ...m[k] }));
  const sub = f => { subs.add(f); f(); return () => subs.delete(f); };
  let user = null; const authSubs = new Set();
  return {
    mode: "demo",
    async getConfig() { return read()["config/votacion"] || null; },
    watchConfig(cb) { return sub(() => cb(read()["config/votacion"] || null)); },
    async getCodigo(code) { return read()["codigos/" + code] || null; },
    async getUsado(code) { return !!read()["usados/" + code]; },
    async votar(code, seg, picks) {
      const m = read(), c = m["config/votacion"], k = m["codigos/" + code];
      const n = c?.finalistas?.length || 0, need = c?.modo === "unico" ? 1 : 3;
      const ok = c?.abierta && k && k.seg === seg && Array.isArray(picks) && picks.length === need
        && new Set(picks).size === need && picks.every(p => Number.isInteger(p) && p >= 0 && p < n) && !m["votos/" + code];
      if (!ok) throw new VotoError("denied");
      m["votos/" + code] = { seg, picks, ts: Date.now() }; m["usados/" + code] = { ts: Date.now() }; write(m);
    },
    async onAuth(cb) { authSubs.add(cb); cb(user); return () => authSubs.delete(cb); },
    async login(email) { user = { email: email || "demo@local" }; authSubs.forEach(f => f(user)); },
    async logout() { user = null; authSubs.forEach(f => f(null)); },
    watch(c, cb) { return sub(() => cb(col(read(), c))); },
    async setConfig(patch) { const m = read(); m["config/votacion"] = { ...(m["config/votacion"] || {}), ...patch, actualizado: Date.now() }; write(m); },
    async putCodes(list) { const m = read(); list.forEach(c => { m["codigos/" + c.code] = c.pub; m["padron/" + c.code] = c.priv; }); write(m); },
    async delCodes(codes) { const m = read(); codes.forEach(c => { delete m["codigos/" + c]; delete m["padron/" + c]; }); write(m); },
    async resetVotos() { const m = read(); let n = 0; Object.keys(m).forEach(k => { if (k.startsWith("votos/")) n++; if (k.startsWith("votos/") || k.startsWith("usados/")) delete m[k]; }); write(m); return n; }
  };
}
