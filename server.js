const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const STORE = path.join(ROOT, 'data', 'election.json');
const PHOTO_DIR = path.join(ROOT, 'uploads', 'candidates');
const PORT = Number(process.env.PORT || 3000);
const ADMIN_USER = process.env.PILKETOS_ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.PILKETOS_ADMIN_PASSWORD || 'adminosis2026';
const demoCandidates = [
  { id: 1, n: 1, name: 'Aditya & Putri', school: 'Kelas XI IPA 2 · XI IPS 1', initials: ['A','P'], bio: 'Pasangan calon nomor urut 1 mengusung semangat kolaborasi dan ruang berkembang bagi seluruh siswa.', vision: ['OSIS yang terbuka dan dekat dengan siswa', 'Pekan minat bakat dan kompetisi antarkelas', 'Program teman belajar lintas kelas'] },
  { id: 2, n: 2, name: 'Raka & Nabila', school: 'Kelas XI IPA 1 · XI IPA 3', initials: ['R','N'], bio: 'Pasangan calon nomor urut 2 ingin menjadikan OSIS sebagai wadah aspirasi dan aksi positif di sekolah.', vision: ['Kotak aspirasi digital yang ditindaklanjuti', 'Gerakan sekolah bersih dan nyaman', 'Festival seni dan kreativitas siswa'] },
  { id: 3, n: 3, name: 'Fajar & Keisha', school: 'Kelas XI IPS 2 · XI IPA 4', initials: ['F','K'], bio: 'Pasangan calon nomor urut 3 membawa ide sekolah yang aktif, sehat, dan memberi kesempatan yang setara.', vision: ['Klub olahraga dan kegiatan sehat mingguan', 'Pelatihan kepemimpinan untuk siswa', 'Aksi sosial bersama warga sekitar sekolah'] },
];
const demoVoters = [
  { nisn: '0012345678', name: 'Siswa Demo 1', access: 'osis2026' },
  { nisn: '0012345679', name: 'Siswa Demo 2', access: 'osis2026' },
  { nisn: '0012345680', name: 'Siswa Demo 3', access: 'osis2026' },
];
const sessions = new Map();

fs.mkdirSync(path.dirname(STORE), { recursive: true });
fs.mkdirSync(PHOTO_DIR, { recursive: true });
function removeCandidatePhoto(id) {
  for (const ext of ['.jpg', '.png', '.webp']) {
    const file = path.join(PHOTO_DIR, `${id}${ext}`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}
function writeStore(state) {
  const temp = `${STORE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2));
  fs.renameSync(temp, STORE);
}
function readStore() {
  const state = JSON.parse(fs.readFileSync(STORE, 'utf8'));
  if (!state.voters || !state.candidates) {
    const legacyTally = state.tally || {};
    const migrated = {
      voters: demoVoters,
      candidates: demoCandidates,
      votedVoters: state.votedVoters || [],
      tally: Object.fromEntries(demoCandidates.map(c => [c.id, Number(legacyTally[c.id] || 0)])),
      electionOpen: true,
    };
    writeStore(migrated);
    return migrated;
  }
  return state;
}
if (!fs.existsSync(STORE)) writeStore({ voters: demoVoters, candidates: demoCandidates, votedVoters: [], tally: { 1: 0, 2: 0, 3: 0 }, electionOpen: true });

function publicStatus() {
  const state = readStore();
  return {
    school: 'SMA Nusantara', election: 'Pemilihan Ketua OSIS 2026',
    electionOpen: state.electionOpen,
    voterCount: state.voters.length,
    votesCast: state.votedVoters.length,
    candidates: state.candidates.map(c => ({ ...c, votes: state.tally[c.id] || 0 })),
  };
}
function adminData() {
  const state = readStore();
  return {
    ...publicStatus(),
    voters: state.voters.map(v => ({ nisn: v.nisn, name: v.name, hasVoted: state.votedVoters.includes(v.nisn) })),
  };
}
function send(res, status, payload, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(payload));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 8000000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('JSON tidak valid')); } });
    req.on('error', reject);
  });
}
function validToken(req) { return (req.headers.authorization || '').replace(/^Bearer\s+/i, ''); }
function authorized(req, role) { return sessions.get(validToken(req))?.role === role; }
function cleanCandidate(body, existing = {}) {
  const name = String(body.name || '').trim().slice(0, 80);
  if (!name) throw new Error('Nama pasangan calon wajib diisi.');
  const initials = String(body.initials || name.split(/[ &]+/).map(p => p[0]).join('').slice(0,2)).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0,2);
  const vision = Array.isArray(body.vision) ? body.vision : String(body.vision || '').split('\n');
  return { ...existing, name, n: existing.n || existing.id, school: String(body.school || '').trim().slice(0,100), initials: initials || 'OS', bio: String(body.bio || '').trim().slice(0,500), vision: vision.map(v => String(v).trim()).filter(Boolean).slice(0,8) };
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/api/status') return send(res, 200, publicStatus());

  if (req.method === 'POST' && url.pathname === '/api/login') {
    try {
      const { nisn, access } = await readBody(req);
      const voter = readStore().voters.find(v => v.nisn === String(nisn || ''));
      if (!voter || voter.access !== String(access || '')) return send(res, 401, { error: 'NISN atau kode akses tidak cocok.' });
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, { role: 'voter', nisn: voter.nisn });
      const state = readStore();
      return send(res, 200, { token, name: voter.name, hasVoted: state.votedVoters.includes(voter.nisn), electionOpen: state.electionOpen });
    } catch { return send(res, 400, { error: 'Data masuk tidak dapat dibaca.' }); }
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/login') {
    try {
      const { username, password } = await readBody(req);
      if (String(username || '') !== ADMIN_USER || String(password || '') !== ADMIN_PASSWORD) return send(res, 401, { error: 'Username atau password admin salah.' });
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, { role: 'admin' });
      return send(res, 200, { token });
    } catch { return send(res, 400, { error: 'Data masuk tidak dapat dibaca.' }); }
  }
  if (url.pathname.startsWith('/api/admin/')) {
    if (!authorized(req, 'admin')) return send(res, 401, { error: 'Sesi admin berakhir. Silakan masuk kembali.' });
    try {
      const state = readStore();
      if (req.method === 'GET' && url.pathname === '/api/admin/data') return send(res, 200, adminData());
      if (req.method === 'POST' && url.pathname === '/api/admin/voters') {
        const body = await readBody(req); const nisn = String(body.nisn || '').trim(); const name = String(body.name || '').trim(); const access = String(body.access || '').trim();
        if (!/^\d{10}$/.test(nisn)) return send(res, 400, { error: 'NISN harus terdiri dari 10 digit.' });
        if (!name || name.length > 100) return send(res, 400, { error: 'Nama siswa wajib diisi (maksimal 100 karakter).' });
        if (access.length < 6 || access.length > 60) return send(res, 400, { error: 'Kode akses harus terdiri dari 6–60 karakter.' });
        if (state.voters.some(v => v.nisn === nisn)) return send(res, 409, { error: 'NISN sudah terdaftar.' });
        state.voters.push({ nisn, name, access }); writeStore(state); return send(res, 201, adminData());
      }
      if (req.method === 'POST' && url.pathname === '/api/admin/voters/import') {
        const body = await readBody(req);
        if (!Array.isArray(body.rows) || body.rows.length > 1000) return send(res, 400, { error: 'Kirim 1–1000 baris siswa per impor.' });
        const known = new Set(state.voters.map(v => v.nisn));
        const accepted = [], rejected = [];
        body.rows.forEach((row, index) => {
          const nisn = String(row.nisn || '').trim();
          const name = String(row.name || '').trim();
          const access = String(row.access || '').trim();
          let reason = '';
          if (!/^\d{10}$/.test(nisn)) reason = 'NISN harus 10 digit';
          else if (!name || name.length > 100) reason = 'nama wajib diisi (maks. 100 karakter)';
          else if (access.length < 6 || access.length > 60) reason = 'kode akses harus 6–60 karakter';
          else if (known.has(nisn)) reason = 'NISN duplikat';
          if (reason) rejected.push({ row: index + 2, nisn, reason });
          else { known.add(nisn); accepted.push({ nisn, name, access }); }
        });
        if (accepted.length) { state.voters.push(...accepted); writeStore(state); }
        return send(res, 200, { imported: accepted.length, rejected, data: adminData() });
      }
      const voterMatch = url.pathname.match(/^\/api\/admin\/voters\/(\d{10})$/);
      if (req.method === 'PUT' && voterMatch) {
        const voter = state.voters.find(v => v.nisn === voterMatch[1]);
        if (!voter) return send(res, 404, { error: 'Siswa tidak ditemukan.' });
        const body = await readBody(req); const name = String(body.name || '').trim(); const access = String(body.access || '').trim();
        if (!name || name.length > 100) return send(res, 400, { error: 'Nama siswa wajib diisi (maksimal 100 karakter).' });
        if (access.length < 6 || access.length > 60) return send(res, 400, { error: 'Kode akses baru harus terdiri dari 6–60 karakter.' });
        voter.name = name; voter.access = access; writeStore(state); return send(res, 200, adminData());
      }
      if (req.method === 'DELETE' && voterMatch) {
        const nisn = voterMatch[1]; if (state.votedVoters.includes(nisn)) return send(res, 409, { error: 'Siswa yang sudah memilih tidak dapat dihapus.' });
        state.voters = state.voters.filter(v => v.nisn !== nisn); writeStore(state); return send(res, 200, adminData());
      }
      if (req.method === 'POST' && url.pathname === '/api/admin/candidates') {
        const body = await readBody(req); const id = Math.max(0, ...state.candidates.map(c => c.id)) + 1;
        state.candidates.push(cleanCandidate(body, { id, n: id })); state.tally[id] = 0; writeStore(state); return send(res, 201, { ...adminData(), createdId: id });
      }
      const photoMatch = url.pathname.match(/^\/api\/admin\/candidates\/(\d+)\/photo$/);
      if (photoMatch && req.method === 'POST') {
        const id = Number(photoMatch[1]); const candidate = state.candidates.find(c => c.id === id);
        if (!candidate) return send(res, 404, { error: 'Kandidat tidak ditemukan.' });
        const body = await readBody(req); const mime = String(body.mime || '').toLowerCase(); const encoded = String(body.data || '');
        const types = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
        if (!types[mime]) return send(res, 400, { error: 'Foto harus berformat JPG, PNG, atau WebP.' });
        if (!encoded || encoded.length > 7000000) return send(res, 400, { error: 'Ukuran foto maksimal 5 MB.' });
        const bytes = Buffer.from(encoded, 'base64');
        if (bytes.length > 5 * 1024 * 1024) return send(res, 400, { error: 'Ukuran foto maksimal 5 MB.' });
        const validSignature = mime === 'image/jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
          : mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
          : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
        if (!validSignature) return send(res, 400, { error: 'Isi file tidak sesuai dengan format gambar.' });
        removeCandidatePhoto(id);
        const ext = types[mime]; fs.writeFileSync(path.join(PHOTO_DIR, `${id}${ext}`), bytes);
        candidate.photoUrl = `/uploads/candidates/${id}${ext}?v=${Date.now()}`;
        writeStore(state); return send(res, 200, adminData());
      }
      if (photoMatch && req.method === 'DELETE') {
        const id = Number(photoMatch[1]); const candidate = state.candidates.find(c => c.id === id);
        if (!candidate) return send(res, 404, { error: 'Kandidat tidak ditemukan.' });
        removeCandidatePhoto(id); delete candidate.photoUrl; writeStore(state); return send(res, 200, adminData());
      }
      const candidateMatch = url.pathname.match(/^\/api\/admin\/candidates\/(\d+)$/);
      if (candidateMatch && req.method === 'PUT') {
        const id = Number(candidateMatch[1]); const index = state.candidates.findIndex(c => c.id === id);
        if (index < 0) return send(res, 404, { error: 'Kandidat tidak ditemukan.' });
        state.candidates[index] = cleanCandidate(await readBody(req), state.candidates[index]); writeStore(state); return send(res, 200, adminData());
      }
      if (candidateMatch && req.method === 'DELETE') {
        const id = Number(candidateMatch[1]);
        if ((state.tally[id] || 0) > 0) return send(res, 409, { error: 'Kandidat yang sudah menerima suara tidak dapat dihapus.' });
        if (state.candidates.length <= 2) return send(res, 409, { error: 'Pemilihan harus memiliki sedikitnya dua pasangan calon.' });
        state.candidates = state.candidates.filter(c => c.id !== id); delete state.tally[id]; removeCandidatePhoto(id); writeStore(state); return send(res, 200, adminData());
      }
      if (req.method === 'POST' && url.pathname === '/api/admin/election') {
        const body = await readBody(req); state.electionOpen = Boolean(body.open); writeStore(state); return send(res, 200, adminData());
      }
      return send(res, 404, { error: 'Endpoint admin tidak ditemukan.' });
    } catch (err) { return send(res, 400, { error: err.message || 'Permintaan admin tidak dapat diproses.' }); }
  }

  const session = sessions.get(validToken(req));
  if (req.method === 'POST' && url.pathname === '/api/vote') {
    if (session?.role !== 'voter') return send(res, 401, { error: 'Sesi berakhir. Silakan masuk kembali.' });
    try {
      const { candidateId } = await readBody(req); const id = Number(candidateId); const state = readStore();
      if (!state.electionOpen) return send(res, 403, { error: 'Pemungutan suara sedang ditutup.' });
      if (!state.candidates.some(c => c.id === id)) return send(res, 400, { error: 'Pasangan calon tidak ditemukan.' });
      if (state.votedVoters.includes(session.nisn)) return send(res, 409, { error: 'NISN ini sudah menggunakan hak pilih.' });
      state.votedVoters.push(session.nisn); state.tally[id] = (state.tally[id] || 0) + 1;
      writeStore(state); sessions.delete(validToken(req));
      return send(res, 200, { ok: true, status: publicStatus() });
    } catch { return send(res, 400, { error: 'Suara belum berhasil disimpan. Silakan coba kembali.' }); }
  }
  if (req.method === 'GET' && url.pathname === '/api/me') {
    if (session?.role !== 'voter') return send(res, 401, { error: 'Sesi berakhir.' });
    const state = readStore(); const voter = state.voters.find(v => v.nisn === session.nisn);
    return send(res, 200, { name: voter?.name, hasVoted: state.votedVoters.includes(session.nisn) });
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/')) return send(res, 404, { error: 'Endpoint tidak ditemukan.' });

  let file;
  if (url.pathname === '/') file = 'index.html';
  else if (url.pathname === '/admin' || url.pathname === '/admin/') file = 'admin.html';
  else file = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  const fullPath = path.resolve(ROOT, file);
  if (!fullPath.startsWith(ROOT + path.sep)) return send(res, 403, { error: 'Tidak diizinkan.' });
  fs.readFile(fullPath, (err, data) => {
    if (err) return send(res, 404, { error: 'Halaman tidak ditemukan.' });
    const ext = path.extname(fullPath).toLowerCase();
    const mime = ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' })[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' }); res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`PILKETOS berjalan di http://127.0.0.1:${PORT}`);
  console.log('Login admin demo: admin / adminosis2026');
});
