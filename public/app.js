// VulnNotes istemci tarafi
// NOT (B2 bonus lab): Bu dosya tarayiciya oldugu gibi gonderilir.
// Buraya konan hicbir sey "gizli" degildir.
const CONFIG = {
  apiBase: '/api',
  // "gizli" ucuncu-parti anahtari - istemciye koymak buyuk hata:
  ANALYTICS_API_KEY: 'sk_live_ORNEK_client_side_anahtar_asla_gercek_degil_42x',
};

async function loadWallet() {
  const res = await fetch(CONFIG.apiBase + '/wallet', { credentials: 'include' });
  return res.json();
}

console.log('VulnNotes istemci yuklendi.');
