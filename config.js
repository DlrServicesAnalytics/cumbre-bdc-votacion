// Configuración del Concurso de Mejores Prácticas BDC.
// Usa el mismo proyecto de Firebase que "Respuestas en Vivo" (cumbre-bdc-2026).
// Estos datos son públicos por diseño; la seguridad la dan las reglas de Firestore (firestore.rules).
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDo1zR-yVPACdAKPXL742h9C0JDQf4b9Sg",
  authDomain: "cumbre-bdc-2026.firebaseapp.com",
  projectId: "cumbre-bdc-2026",
  storageBucket: "cumbre-bdc-2026.firebasestorage.app",
  messagingSenderId: "455076483260",
  appId: "1:455076483260:web:84881e1cfb5e3dc7c3c0b9"
};

// Correos que pueden entrar al tablero de administración.
// Deben coincidir EXACTAMENTE con la lista de firestore.rules (función esAdmin).
export const ADMINS = ["nataliaricardezcdk@gmail.com"];

// Textos del evento.
export const EVENTO = "Cumbre Líderes de BDC Kia México 2026";
export const CONCURSO = "Concurso de Mejores Prácticas BDC";
export const SEDE = "Kia Campus CDMX";

// Padrón esperado (solo para medir participación si aún no se cargan todos los códigos).
export const PADRON = { dir: 15, part: 115 };
