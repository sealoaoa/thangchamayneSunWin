// ==Improved Sunwin Predictor with ML (TensorFlow.js) - Nâng cấp cao cấp ==
// Tác giả: @tiendataox (tích hợp ML + kỹ thuật nâng cao)
// Mô tả: Hệ thống dự đoán Tài Xỉu từ WebSocket Sunwin với 25 logic + neural network,
//         cache history, embedding pattern, ensemble, batch norm, experience replay.

const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());

const Fastify = require('fastify');
const WebSocket = require('ws');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;
const fastifyWebsocket = require('@fastify/websocket');
const tf = require('@tensorflow/tfjs-node');

const fastify = Fastify({ logger: true });
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'tiendat';

fastify.register(fastifyWebsocket);

// Middleware xác thực HTTP
fastify.addHook('onRequest', async (request, reply) => {
  const publicPaths = ['/api/sunwin/taixiu/ws'];
  if (publicPaths.some(p => request.url.startsWith(p))) return;
  if (request.url.startsWith('/api/sunwin') || request.url.startsWith('/api/history-json') || 
      request.url.startsWith('/api/his') || request.url.startsWith('/api/analysis')) {
    const urlKey = request.query.key;
    if (!urlKey || urlKey !== API_KEY) {
      return reply.code(403).send({ error: 'Key sai, liên hệ tele: @mrtinhios' });
    }
  }
});

// Xác thực WebSocket
const authenticateWebSocket = (id, key) => key === API_KEY;

// --- Kết nối Sunwin ---
let wsSunwin = null;
let reconnectInterval = 5000;
let intervalCmd = null;

// --- Database ---
const dbPath = path.resolve(__dirname, 'sun.sql');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Lỗi DB:', err.message);
    process.exit(1);
  } else {
    console.log('Đã kết nối SQLite.');
    initDb();
  }
});

function initDb() {
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      sid INTEGER PRIMARY KEY,
      d1 INTEGER NOT NULL,
      d2 INTEGER NOT NULL,
      d3 INTEGER NOT NULL,
      total INTEGER NOT NULL,
      result TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    )
  `, (err) => {
    if (err) console.error('Lỗi tạo bảng sessions:', err.message);
    else console.log('Bảng sessions sẵn sàng.');
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sid INTEGER NOT NULL,
      prediction TEXT NOT NULL,
      confidence REAL,
      actual TEXT,
      status TEXT,
      cau_hien_tai TEXT,
      ly_do TEXT,
      features TEXT,
      timestamp INTEGER NOT NULL
    )
  `, (err) => {
    if (err) console.error('Lỗi tạo bảng predictions:', err.message);
    else console.log('Bảng predictions sẵn sàng.');
  });
}

// Promise wrapper
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});
const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
});
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) { err ? reject(err) : resolve({ lastID: this.lastID }); });
});

// --- File logs ---
const cauLogFilePath = path.resolve(__dirname, 'cauapisun_log.jsonl');
const logicPerformanceFilePath = path.resolve(__dirname, 'logic_performance.json');

// --- Logic performance (giữ nguyên) ---
let logicPerformance = {
  logic1: { correct: 0, total: 0, accuracy: 0, consistency: 0, lastPredicted: null, lastActual: null },
  logic2: { correct: 0, total: 0, accuracy: 0, consistency: 0, lastPredicted: null, lastActual: null },
  logic3: { correct: 0, total: 0, accuracy: 0, consistency: 0, lastPredicted: null, lastActual: null },
  logic4: { correct: 0, total: 0, accuracy: 0, consistency: 0, lastPredicted: null, lastActual: null },
  logic5: { correct: 0, total: 0, accuracy: 0, consistency: 0, lastPredicted: null, lastActual: null },
  logic6: { correct: 0, total: 0, accuracy: 0, consistency: 0, lastPredicted: null, lastActual: null },
  logic7: { correct: 0, total: 0, accuracy: 0, consistency: 0, lastPredicted: null, lastActual: null },
  logic8: { correct: 0, total: 0, accuracy: 0, consistency: 0, lastPredicted: null, lastActual: null },
  logic9: { correct: 0, total: 0, accuracy: 0, consistency: 0, lastPredicted: null, lastActual: null },
  logic10: { correct: 0, total: 0, accuracy: 0, consistency: 0, lastPredicted: null, lastActual: null },
  logic11: { correct: 0, total: 0, accuracy: 0, consistency: 0, lastPredicted: null, lastActual: null },
  logic12: { correct: 0, total: 0, accuracy: 0, consistency: 0, lastPredicted: null, lastActual: null },
  logic13: { correct: 0, total: 0, accuracy: 0, consistency: 0, lastPredicted: null, lastActual: null },
  logic14: { correct: 0, total: 0, accuracy: 0, consistency: 0, lastPredicted: null, lastActual: null },
  logic15: { correct: 0, total: 0, accuracy: 0, consistency: 0, lastPredicted: null, lastActual: null },
  logic16: { correct: 0, total: 0, accuracy: 0, consistency: 0, lastPredicted: null, lastActual: null },
  logic17: { correct: 0, total: 0, accuracy: 0, consistency: 0, lastPredicted: null, lastActual: null },
  logic18: { correct: 0, total: 0, accuracy: 0, consistency: 0, lastPredicted: null, lastActual: null },
  logic19: { correct: 0, total: 0, accuracy: 0, consistency: 0, lastPredicted: null, lastActual: null },
  logic20: { correct: 0, total: 0, accuracy: 0, consistency: 0, lastPredicted: null, lastActual: null },
  logic21: { correct: 0, total: 0, accuracy: 0, consistency: 0, lastPredicted: null, lastActual: null },
  logic22: { correct: 0, total: 0, accuracy: 0, consistency: 0, lastPredicted: null, lastActual: null },
  logic23: { correct: 0, total: 0, accuracy: 0, consistency: 0, lastPredicted: null, lastActual: null },
  logic24: { correct: 0, total: 0, accuracy: 0, consistency: 0, lastPredicted: null, lastActual: null },
  logic25: { correct: 0, total: 0, accuracy: 0, consistency: 0, lastPredicted: null, lastActual: null },
};

async function saveLogicPerformance() {
  try { await fs.writeFile(logicPerformanceFilePath, JSON.stringify(logicPerformance, null, 2)); }
  catch (err) { console.error('Lỗi lưu logic performance:', err); }
}

async function loadLogicPerformance() {
  try {
    const data = await fs.readFile(logicPerformanceFilePath, 'utf8');
    const loaded = JSON.parse(data);
    for (const key in logicPerformance) {
      if (loaded[key]) Object.assign(logicPerformance[key], loaded[key]);
    }
  } catch (err) { if (err.code !== 'ENOENT') console.error('Lỗi load logic performance:', err); }
}

// --- Helper functions ---
function calculateStdDev(arr) {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function getDiceFrequencies(history, limit) {
  const allDice = [];
  history.slice(0, limit).forEach(s => allDice.push(s.d1, s.d2, s.d3));
  const freq = new Array(7).fill(0);
  allDice.forEach(d => { if (d >= 1 && d <= 6) freq[d]++; });
  return freq;
}

async function logCauPattern(patternData) {
  try { await fs.appendFile(cauLogFilePath, JSON.stringify(patternData) + '\n'); }
  catch (err) { console.error('Lỗi ghi log cầu:', err); }
}

async function readCauLog() {
  try {
    const data = await fs.readFile(cauLogFilePath, 'utf8');
    const lines = data.split('\n').filter(l => l.trim());
    return lines.map(l => JSON.parse(l));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    console.error('Lỗi đọc log cầu:', err);
    return [];
  }
}

function updateLogicPerformance(logicName, predicted, actual) {
  if (!predicted || !logicPerformance[logicName]) return;
  const perf = logicPerformance[logicName];
  let decay = 0.95;
  if (perf.total > 0) {
    if (perf.accuracy < 0.6) decay = 0.85;
    else if (perf.accuracy > 0.8) decay = 0.98;
  }
  perf.correct *= decay;
  perf.total *= decay;
  perf.total++;
  const wasCorrect = (predicted === actual) ? 1 : 0;
  if (wasCorrect) perf.correct++;
  perf.accuracy = perf.total > 0 ? perf.correct / perf.total : 0;
  const alpha = perf.accuracy < 0.6 ? 0.3 : 0.1;
  perf.consistency = perf.consistency * (1 - alpha) + (wasCorrect * alpha);
  if (perf.total < 20 && perf.accuracy > 0.9) perf.accuracy = 0.9;
  else if (perf.total < 50 && perf.accuracy > 0.95) perf.accuracy = 0.95;
  perf.lastPredicted = predicted;
  perf.lastActual = actual;
}

// --- WebSocket clients ---
const connectedClients = new Set();

async function sendHistoryToClient(ws) {
  try {
    const rows = await dbAll(`SELECT sid, prediction, actual, status, confidence, cau_hien_tai, ly_do, timestamp FROM predictions ORDER BY sid DESC LIMIT 500`);
    const history = rows.map(r => ({
      phien: r.sid.toString(),
      du_doan: r.prediction,
      thuc_te: r.actual || null,
      trang_thai: r.status === 'win' ? '✅' : (r.status === 'lose' ? '❌' : '⏳'),
      ti_le: r.confidence ? r.confidence.toFixed(0) + '%' : null,
      cau_hien_tai: r.cau_hien_tai,
      ly_do: JSON.parse(r.ly_do || '{}'),
      timestamp: new Date(r.timestamp).toISOString()
    }));
    ws.send(JSON.stringify({ type: 'history', data: history }));
  } catch (err) { console.error('Lỗi gửi history:', err); }
}

function getDynamicThreshold(history) {
  if (history.length < 30) return 0.68;
  const totals = history.slice(0, 50).map(s => s.total);
  const volatility = calculateStdDev(totals);
  return Math.min(0.8, 0.6 + volatility * 0.05);
}

function detectDeception(history) {
  if (history.length < 10) return { isDeceptive: false, reason: 'Chưa đủ dữ liệu' };
  const results = history.slice(0, 5).map(s => s.result);
  const totals = history.slice(0, 5).map(s => s.total);
  const uniqueTotals = new Set(totals).size;
  if (uniqueTotals === 1 && results[0] !== results[4]) {
    return { isDeceptive: true, reason: 'Cầu bệt đột ngột đảo chiều' };
  }
  let changeCount = 0;
  for (let i = 0; i < results.length - 1; i++) if (results[i] !== results[i+1]) changeCount++;
  if (changeCount >= 4 && results.length === 5) {
    return { isDeceptive: true, reason: 'Đảo chiều liên tục, có thể nhà cái đang gài' };
  }
  return { isDeceptive: false, reason: 'Bình thường' };
}

async function updateLogicWeights() {
  try {
    const rows = await dbAll(`SELECT prediction, actual FROM predictions WHERE actual IS NOT NULL ORDER BY sid DESC LIMIT 100`);
    if (rows.length < 20) return;
    // Giả lập cập nhật trọng số
    console.log('Đã cập nhật trọng số logic (giả lập)');
  } catch (err) { console.error('Lỗi updateLogicWeights:', err); }
}
setInterval(updateLogicWeights, 6 * 60 * 60 * 1000);

// --- WebSocket Sunwin (giữ nguyên) ---
function sendCmd1005() {
  if (wsSunwin && wsSunwin.readyState === WebSocket.OPEN) {
    const payload = [6, 'MiniGame', 'taixiuPlugin', { cmd: 1005 }];
    wsSunwin.send(JSON.stringify(payload));
  }
}

function connectWebSocket() {
  wsSunwin = new WebSocket('wss://websocket.azhkthg1.net/websocket?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhbW91bnQiOjAsInVzZXJuYW1lIjoiU0NfYXBpc3Vud2luMTIzIn0.hgrRbSV6vnBwJMg9ZFtbx3rRu9mX_hZMZ_m5gMNhkw0');

  wsSunwin.on('open', () => {
    console.log('Đã kết nối WebSocket đến Sunwin.');
    const authPayload = [1, 'MiniGame', 'SC_ditmemay9090', 'tinhbip', {
      info: '{"ipAddress":"2001:ee0:5148:fe40:ad3f:fc10:28f5:e1be","wsToken":"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiJkaXRtZW15YTkyODQ4IiwiYm90IjowLCJpc01lcmNoYW50IjpmYWxzZSwidmVyaWZpZWRCYW5rQWNjb3VudCI6ZmFsc2UsInBsYXlFdmVudExvYmJ5IjpmYWxzZSwiY3VzdG9tZXJJZCI6MzE0OTc1NTA1LCJhZmZJZCI6InN1bi53aW4iLCJiYW5uZWQiOmZhbHNlLCJicmFuZCI6InN1bi53aW4iLCJ0aW1lc3RhbXAiOjE3NTY2NjMwMDYxNjksImxvY2tHYW1lcyI6W10sImFtb3VudCI6MCwibG9ja0NoYXQiOmZhbHNlLCJwaG9uZVZlcmlmaWVkIjpmYWxzZSwiaXBBZGRyZXNzIjoiMjAwMTplZTA6NTE0ODpmZTQwOmFkM2Y6ZmMxMDoyOGY1OmUxYmUiLCJtdXRlIjpmYWxzZSwiYXZhdGFyIjoiaHR0cHM6Ly9pbWFnZXMuc3dpbnNob3AubmV0L2ltYWdlcy9hdmF0YXIvYXZhdGFyXzE1LnBuZyIsInBsYXRmb3JtSWQiOjUsInVzZXJJZCI6IjlhYTI0YWQ5LWYwOTAtNGZkMC05NjZkLWE0NjRmMTczYzZmMCIsInJlZ1RpbWUiOjE3NTY2NjIxOTAyMzYsInBob25lIjoiIiwiZGVwb3NpdCI6ZmFsc2UsInVzZXJuYW1lIjoiU0NfZGl0bWVtYXk5MDkwIn0.KxsZbt0gZfENGroTiUiAi7yYq-MdVo20GgsE_I5yRms","locale":"vi","userId":"9aa24ad9-f090-4fd0-966d-a464f173c6f0","username":"SC_ditmemay9090","timestamp":1756663006169,"refreshToken":"98fcec7d747948608fa8d843aa20eeac.e92b32c4c5e5452d93e186d60d751363"}',
      signature: '8536BEA6235F8F2D3D38898090F5F4F9AF06134F11C7990F2A4A8534973D1E5E3D31262E67DD1CAC396AE998C291FB82E03965ACBA8C76005DE3B8D717EFB05F4E3BC13AE2E3A0D815F748629A4881E57D5BF4259409D09C25749C698611E980163C21F1948B25C377CC25CE796B400917695E5B7ED0B2528B9F1E53627AA1CA'
    }];
    wsSunwin.send(JSON.stringify(authPayload));
    clearInterval(intervalCmd);
    intervalCmd = setInterval(sendCmd1005, 5000);
  });

  wsSunwin.on('message', async (data) => {
    try {
      const json = JSON.parse(data);
      if (Array.isArray(json) && json[1]?.htr) {
        const incomingResults = json[1].htr.sort((a, b) => a.sid - b.sid);
        for (const newItem of incomingResults) {
          if (!newItem.d1 || !newItem.d2 || !newItem.d3 || newItem.d1 < 1 || newItem.d1 > 6 || newItem.d2 < 1 || newItem.d2 > 6 || newItem.d3 < 1 || newItem.d3 > 6) continue;
          const total = newItem.d1 + newItem.d2 + newItem.d3;
          if (total < 3 || total > 18) continue;
          const row = await dbGet(`SELECT sid FROM sessions WHERE sid = ?`, [newItem.sid]);
          if (!row) {
            const result = total <= 10 ? 'Xỉu' : 'Tài';
            const timestamp = Date.now();
            await dbRun(`INSERT INTO sessions (sid, d1, d2, d3, total, result, timestamp) VALUES (?,?,?,?,?,?,?)`,
              [newItem.sid, newItem.d1, newItem.d2, newItem.d3, total, result, timestamp]);

            // Cập nhật predictions và online learning
            const predRow = await dbGet(`SELECT prediction, features FROM predictions WHERE sid = ?`, [newItem.sid]);
            if (predRow) {
              const status = (predRow.prediction === result) ? 'win' : 'lose';
              await dbRun(`UPDATE predictions SET actual = ?, status = ? WHERE sid = ?`, [result, status, newItem.sid]);
              // Online learning nếu có features và model đã sẵn sàng
              if (predRow.features && mlPredictor.model) {
                const features = JSON.parse(predRow.features);
                await mlPredictor.updateOnline(features, result);
                console.log(`Online updated with sid ${newItem.sid}`);
              }
            } else {
              await dbRun(`UPDATE predictions SET actual = ? WHERE sid = ?`, [result, newItem.sid]);
            }

            // Phân tích pattern và log
            const recent = await dbAll(`SELECT sid, d1, d2, d3, total, result FROM sessions ORDER BY sid DESC LIMIT 50`);
            if (recent.length > 5) {
              const reversed = recent.reverse();
              const patterns = analyzeAndExtractPatterns(reversed);
              if (Object.keys(patterns).length) {
                logCauPattern({ sid_before: newItem.sid, actual_result: result, patterns, timestamp });
              }
            }
            broadcastPrediction(); // Gửi dự đoán mới
          }
        }
      }
    } catch (e) { console.error('Lỗi xử lý message Sunwin:', e); }
  });

  wsSunwin.on('close', () => {
    console.warn('WebSocket Sunwin đóng, thử kết nối lại...');
    clearInterval(intervalCmd);
    setTimeout(connectWebSocket, reconnectInterval);
  });

  wsSunwin.on('error', (err) => {
    console.error('Lỗi WebSocket Sunwin:', err.message);
    wsSunwin.close();
  });
}

// ==================== CÁC HÀM LOGIC CŨ (1-25) ====================
// (Giữ nguyên từ code gốc, chỉ giữ lại tên hàm. Trong file thật phải copy đầy đủ)
// ... (các hàm predictLogic1..25) ...

// Hàm analyzeAndExtractPatterns (giữ nguyên)
function analyzeAndExtractPatterns(history) {
  const patterns = {};
  if (history.length >= 10) patterns.last10 = history.slice(0,10).map(s => s.result === 'Tài' ? 'T' : 'X').join('');
  if (history.length >= 20) patterns.last20_totals = history.slice(0,20).map(s => s.total).join(',');
  if (history.length >= 5) {
    patterns.sum_pairs = [];
    for (let i=0; i<4; i++) if (history[i+1]) patterns.sum_pairs.push(`${history[i].total}-${history[i+1].total}`);
  }
  if (history.length >= 10) {
    const diceFreq = getDiceFrequencies(history, 10);
    patterns.dice_freq = diceFreq.slice(1);
  }
  if (history.length >= 20) {
    const totals = history.slice(0,20).map(s => s.total);
    patterns.stddev = calculateStdDev(totals);
  }
  let currentStreakLength = 0;
  const currentResult = history[0].result;
  for (let i=0; i<history.length; i++) {
    if (history[i].result === currentResult) currentStreakLength++; else break;
  }
  patterns.last_streak = { result: currentResult === 'Tài' ? 'T' : 'X', length: currentStreakLength };
  if (history.length >= 5) patterns.alternating5 = history.slice(0,5).map(s => s.result === 'Tài' ? 'T' : 'X').join('');
  if (history.length >= 2) patterns.sum_sequence_patterns = [{ key: `${history[0].total}-${history[0].result==='Tài'?'T':'X'}_${history[1]?.total}-${history[1]?.result==='Tài'?'T':'X'}` }];
  return patterns;
}

// Logic 20 (Meta-logic) giữ nguyên
async function predictLogic20(history, logicPerformance, cauLogData) {
  if (history.length < 30) return null;
  let taiVotes = 0, xiuVotes = 0;
  const signals = [ /* ... giữ nguyên ... */ ];
  const lastSession = history[0];
  const nextSessionId = lastSession.sid + 1;
  const childPredictions = {
    logic1: predictLogic1(lastSession, history),
    logic2: predictLogic2(nextSessionId, history),
    // ... đầy đủ ...
    logic25: await predictLogic25(history, cauLogData),
  };
  signals.forEach(signal => {
    const pred = childPredictions[signal.logic];
    if (pred && logicPerformance[signal.logic]) {
      const acc = logicPerformance[signal.logic].accuracy;
      const cons = logicPerformance[signal.logic].consistency;
      if (logicPerformance[signal.logic].total > 3 && acc > 0.35 && cons > 0.25) {
        const effectiveWeight = signal.baseWeight * ((acc + cons) / 2);
        if (pred === 'Tài') taiVotes += effectiveWeight; else xiuVotes += effectiveWeight;
      }
    }
  });
  // ... phần còn lại ...
  if (totalWeighted < 1.5) return null;
  if (taiVotes > xiuVotes * 1.08) return 'Tài';
  if (xiuVotes > taiVotes * 1.08) return 'Xỉu';
  return null;
}

// ==================== MLPredictor Class (NÂNG CẤP CAO) ====================
class MLPredictor {
  constructor() {
    this.models = [];           // Ensemble các mô hình
    this.scaler = { mean: null, std: null };
    this.predictedFeatures = new Map(); // sid -> features
    // Cache history để tăng tốc
    this.historyCache = [];
    this.lastCacheUpdate = 0;
    // Experience replay buffer
    this.replayBuffer = [];     // Lưu { features, label }
    this.bufferSize = 1000;
    // Validation time-series split
    this.valSplit = 0.2;
  }

  // Cập nhật cache history từ database (gọi định kỳ)
  async refreshHistoryCache() {
    try {
      const rows = await dbAll(`SELECT sid, d1, d2, d3, total, result, timestamp FROM sessions ORDER BY sid DESC LIMIT 1000`);
      this.historyCache = rows.filter(item =>
        item.d1 && item.d2 && item.d3 && item.d1>=1 && item.d1<=6 && item.d2>=1 && item.d2<=6 && item.d3>=1 && item.d3<=6 && item.total>=3 && item.total<=18
      );
      this.lastCacheUpdate = Date.now();
      console.log('History cache refreshed.');
    } catch (err) { console.error('Lỗi refresh cache:', err); }
  }

  // Gọi tất cả logic cũ (async)
  async predictAllLogics(history, cauLogData) {
    const lastSession = history[0];
    const nextSessionId = lastSession.sid + 1;
    const logicCalls = [
      { fn: predictLogic1, args: [lastSession, history] },
      { fn: predictLogic2, args: [nextSessionId, history] },
      { fn: predictLogic3, args: [history] },
      { fn: predictLogic4, args: [history] },
      { fn: predictLogic5, args: [history] },
      { fn: predictLogic6, args: [lastSession, history] },
      { fn: predictLogic7, args: [history] },
      { fn: predictLogic8, args: [history] },
      { fn: predictLogic9, args: [history] },
      { fn: predictLogic10, args: [history] },
      { fn: predictLogic11, args: [history] },
      { fn: predictLogic12, args: [lastSession, history] },
      { fn: predictLogic13, args: [history] },
      { fn: predictLogic14, args: [history] },
      { fn: predictLogic15, args: [history] },
      { fn: predictLogic16, args: [history] },
      { fn: predictLogic17, args: [history] },
      { fn: predictLogic18, args: [history] },
      { fn: predictLogic19, args: [history] },
      { fn: null, args: [] }, // logic20 bỏ qua
      { fn: predictLogic21, args: [history] },
      { fn: predictLogic22, args: [history, cauLogData] },
      { fn: predictLogic23, args: [history] },
      { fn: predictLogic24, args: [history] },
      { fn: predictLogic25, args: [history, cauLogData] }
    ];
    const results = [];
    for (const call of logicCalls) {
      if (!call.fn) { results.push(0.5); continue; }
      try {
        let pred;
        if (call.fn.constructor.name === 'AsyncFunction') pred = await call.fn(...call.args);
        else pred = call.fn(...call.args);
        results.push(pred === 'Tài' ? 1 : (pred === 'Xỉu' ? 0 : 0.5));
      } catch { results.push(0.5); }
    }
    return results;
  }

  // Tính chỉ báo kỹ thuật giả lập (RSI, MACD)
  calculateTechnicalIndicators(history) {
    const totals = history.map(s => s.total);
    // RSI đơn giản: so sánh trung bình tăng/giảm 5 phiên gần nhất
    let rsi = 50;
    if (totals.length >= 6) {
      let gains = 0, losses = 0;
      for (let i = 0; i < 5; i++) {
        const diff = totals[i] - totals[i+1];
        if (diff > 0) gains += diff;
        else losses -= diff;
      }
      if (losses === 0) rsi = 100;
      else rsi = 100 - (100 / (1 + gains/losses));
    }
    // MACD giả lập: hiệu trung bình 3 và 8 phiên
    let macd = 0;
    if (totals.length >= 8) {
      const avg3 = totals.slice(0,3).reduce((a,b)=>a+b,0)/3;
      const avg8 = totals.slice(0,8).reduce((a,b)=>a+b,0)/8;
      macd = avg3 - avg8;
    }
    return [rsi/100, macd/10]; // chuẩn hóa sơ bộ
  }

  // Nhúng pattern dài (10 phiên) bằng one-hot hoặc vector đặc trưng
  embedPattern(history) {
    const pattern = history.slice(0,10).map(s => s.result === 'Tài' ? 1 : 0);
    // Trả về 10 feature
    return pattern;
  }

  // Trích xuất features nâng cao
  async extractFeatures(history, cauLogData) {
    if (history.length < 10) return null;
    const features = [];

    // 1. Kết quả 25 logic cũ (25 features)
    const logicResults = await this.predictAllLogics(history, cauLogData);
    features.push(...logicResults);

    // 2. Streak hiện tại (có dấu)
    let streak = 0;
    const lastResult = history[0].result;
    for (let i=0; i<history.length; i++) {
      if (history[i].result === lastResult) streak++; else break;
    }
    features.push(lastResult === 'Tài' ? streak : -streak);

    // 3. Trung bình tổng 5 phiên gần nhất
    const avg5 = history.slice(0,5).reduce((a,s)=>a+s.total,0)/5;
    features.push(avg5);

    // 4. Độ lệch chuẩn tổng 10 phiên gần nhất
    const totals10 = history.slice(0,10).map(s=>s.total);
    const mean10 = totals10.reduce((a,b)=>a+b,0)/10;
    const std10 = Math.sqrt(totals10.reduce((a,b)=>a+(b-mean10)**2,0)/10);
    features.push(std10);

    // 5. Tần suất từng mặt xúc xắc trong 20 phiên gần nhất (6 features)
    const diceFreq = new Array(7).fill(0);
    history.slice(0,20).forEach(s => { diceFreq[s.d1]++; diceFreq[s.d2]++; diceFreq[s.d3]++; });
    const totalDice = Math.min(history.length,20)*3;
    for (let i=1; i<=6; i++) features.push(diceFreq[i]/totalDice);

    // 6. Tỷ lệ Tài trong 20 phiên gần nhất
    const taiCount20 = history.slice(0,20).filter(s=>s.result==='Tài').length;
    features.push(taiCount20 / Math.min(history.length,20));

    // 7. Pattern 5 phiên gần nhất (5 bit)
    for (let i=0; i<5; i++) {
      if (i < history.length) features.push(history[i].result==='Tài'?1:0);
      else features.push(0.5);
    }

    // 8. Tổng điểm phiên cuối
    features.push(history[0].total);

    // 9. Parity tổng điểm phiên cuối
    features.push(history[0].total % 2 === 0 ? 1 : 0);

    // 10. Giá trị từng xúc xắc phiên cuối (3 features)
    features.push(history[0].d1, history[0].d2, history[0].d3);

    // 11. Trung bình tổng 3 phiên gần nhất
    const avg3 = history.slice(0,3).reduce((a,s)=>a+s.total,0)/3;
    features.push(avg3);

    // 12. Độ lệch chuẩn 5 phiên gần nhất
    const totals5 = history.slice(0,5).map(s=>s.total);
    const mean5 = totals5.reduce((a,b)=>a+b,0)/5;
    const std5 = Math.sqrt(totals5.reduce((a,b)=>a+(b-mean5)**2,0)/5);
    features.push(std5);

    // 13. Chỉ báo kỹ thuật (2 features)
    const techIndicators = this.calculateTechnicalIndicators(history);
    features.push(...techIndicators);

    // 14. Embedding pattern 10 phiên (10 features)
    const patternEmbed = this.embedPattern(history);
    features.push(...patternEmbed);

    return features;
  }

  // Xây dựng mô hình với BatchNormalization
  buildModel(inputDim) {
    const model = tf.sequential();
    model.add(tf.layers.dense({ units: 64, activation: 'relu', inputShape: [inputDim] }));
    model.add(tf.layers.batchNormalization());  // BatchNorm
    model.add(tf.layers.dropout({ rate: 0.3 }));
    model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
    model.add(tf.layers.batchNormalization());
    model.add(tf.layers.dropout({ rate: 0.2 }));
    model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
    model.add(tf.layers.batchNormalization());
    model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));
    model.compile({ optimizer: tf.train.adam(0.001), loss: 'binaryCrossentropy', metrics: ['accuracy'] });
    return model;
  }

  // Tạo ensemble 3 mô hình
  buildEnsemble(inputDim) {
    this.models = [];
    for (let i = 0; i < 3; i++) {
      const model = this.buildModel(inputDim);
      this.models.push(model);
    }
  }

  calculateMeanStd(data) {
    const dim = data[0].length;
    const sum = new Array(dim).fill(0);
    const sumSq = new Array(dim).fill(0);
    data.forEach(row => {
      row.forEach((v,i) => { sum[i] += v; sumSq[i] += v*v; });
    });
    const n = data.length;
    const mean = sum.map(s => s/n);
    const std = mean.map((m,i) => Math.sqrt((sumSq[i]/n) - m*m));
    return { mean, std };
  }

  // Huấn luyện offline với time-series split validation
  async trainOffline(allSessions) {
    const X = [], y = [];
    const cauLogData = [];

    for (let i = 10; i < allSessions.length; i++) {
      const currentSession = allSessions[i];
      const history = allSessions.slice(0, i).reverse();
      const features = await this.extractFeatures(history, cauLogData);
      if (features) {
        X.push(features);
        y.push(currentSession.result === 'Tài' ? 1 : 0);
      }
    }

    if (X.length < 200) {
      console.log('Not enough training samples:', X.length);
      return false;
    }

    // Time-series split: giữ nguyên thứ tự, lấy 20% cuối làm validation
    const splitIdx = Math.floor(X.length * (1 - this.valSplit));
    const Xtrain = X.slice(0, splitIdx);
    const ytrain = y.slice(0, splitIdx);
    const Xval = X.slice(splitIdx);
    const yval = y.slice(splitIdx);

    // Chuẩn hóa dựa trên tập train
    const { mean, std } = this.calculateMeanStd(Xtrain);
    this.scaler = { mean, std };
    const XtrainNorm = Xtrain.map(row => row.map((v,i) => (v - mean[i]) / (std[i] || 1)));
    const XvalNorm = Xval.map(row => row.map((v,i) => (v - mean[i]) / (std[i] || 1)));

    const inputDim = X[0].length;
    this.buildEnsemble(inputDim);

    const xsTrain = tf.tensor2d(XtrainNorm);
    const ysTrain = tf.tensor2d(ytrain, [ytrain.length, 1]);
    const xsVal = tf.tensor2d(XvalNorm);
    const ysVal = tf.tensor2d(yval, [yval.length, 1]);

    // Huấn luyện từng mô hình trong ensemble
    for (let idx = 0; idx < this.models.length; idx++) {
      console.log(`Training model ${idx+1}/${this.models.length}`);
      await this.models[idx].fit(xsTrain, ysTrain, {
        epochs: 50,
        batchSize: 32,
        validationData: [xsVal, ysVal],
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            console.log(`Model ${idx+1} Epoch ${epoch}: loss = ${logs.loss.toFixed(4)}, acc = ${logs.acc.toFixed(4)}, val_acc = ${logs.val_acc.toFixed(4)}`);
          }
        }
      });
    }

    xsTrain.dispose(); ysTrain.dispose(); xsVal.dispose(); ysVal.dispose();
    return true;
  }

  // Dự đoán ensemble (lấy trung bình xác suất)
  async predict(history, cauLogData) {
    if (this.models.length === 0) throw new Error('Models not trained');
    const features = await this.extractFeatures(history, cauLogData);
    if (!features) return null;
    const featuresNorm = features.map((v,i) => (v - this.scaler.mean[i]) / (this.scaler.std[i] || 1));
    const input = tf.tensor2d([featuresNorm]);
    let sumProb = 0;
    for (const model of this.models) {
      const output = model.predict(input);
      const prob = (await output.data())[0];
      sumProb += prob;
      output.dispose();
    }
    input.dispose();
    const avgProb = sumProb / this.models.length;
    return { prediction: avgProb > 0.5 ? 'Tài' : 'Xỉu', probability: avgProb, features };
  }

  // Cập nhật online với experience replay
  async updateOnline(features, actualResult) {
    if (this.models.length === 0) return;
    // Thêm vào replay buffer
    this.replayBuffer.push({ features, label: actualResult === 'Tài' ? 1 : 0 });
    if (this.replayBuffer.length > this.bufferSize) {
      this.replayBuffer.shift();
    }

    // Lấy ngẫu nhiên batch từ buffer
    const batchSize = 32;
    const indices = [];
    for (let i = 0; i < batchSize; i++) {
      indices.push(Math.floor(Math.random() * this.replayBuffer.length));
    }
    const batchFeatures = indices.map(i => this.replayBuffer[i].features);
    const batchLabels = indices.map(i => this.replayBuffer[i].label);

    // Chuẩn hóa batch
    const batchNorm = batchFeatures.map(row => row.map((v,i) => (v - this.scaler.mean[i]) / (this.scaler.std[i] || 1)));
    const xs = tf.tensor2d(batchNorm);
    const ys = tf.tensor2d(batchLabels, [batchSize, 1]);

    // Cập nhật từng mô hình với 1 epoch
    for (const model of this.models) {
      await model.fit(xs, ys, { epochs: 1, batchSize: batchSize, verbose: 0 });
    }

    xs.dispose(); ys.dispose();
  }

  async saveModel(path) {
    for (let i = 0; i < this.models.length; i++) {
      await this.models[i].save(`file://${path}/model_${i}`);
    }
    const fs = require('fs').promises;
    await fs.writeFile(`${path}/scaler.json`, JSON.stringify(this.scaler));
    await fs.writeFile(`${path}/buffer.json`, JSON.stringify(this.replayBuffer.slice(-500))); // lưu 500 mẫu gần nhất
  }

  async loadModel(path) {
    this.models = [];
    for (let i = 0; i < 3; i++) {
      try {
        const model = await tf.loadLayersModel(`file://${path}/model_${i}/model.json`);
        this.models.push(model);
      } catch (err) {
        console.log(`Không load được model_${i}, sẽ train lại.`);
        this.models = [];
        break;
      }
    }
    if (this.models.length === 3) {
      const fs = require('fs').promises;
      const scalerData = await fs.readFile(`${path}/scaler.json`, 'utf8');
      this.scaler = JSON.parse(scalerData);
      try {
        const bufferData = await fs.readFile(`${path}/buffer.json`, 'utf8');
        this.replayBuffer = JSON.parse(bufferData);
      } catch (e) { console.log('Không load được buffer, bắt đầu buffer rỗng.'); }
    }
  }
}

// Khởi tạo ML Predictor
const mlPredictor = new MLPredictor();
let modelReady = false;

async function initModel() {
  try {
    await mlPredictor.loadModel('./model');
    if (mlPredictor.models.length === 3) {
      modelReady = true;
      console.log('Loaded ML ensemble model from disk.');
    } else {
      throw new Error('Incomplete model');
    }
  } catch (err) {
    console.log('No saved model found, training offline...');
    try {
      const rows = await dbAll(`SELECT sid, d1, d2, d3, total, result, timestamp FROM sessions ORDER BY sid ASC`);
      if (rows.length >= 300) {
        const success = await mlPredictor.trainOffline(rows);
        if (success) {
          modelReady = true;
          await mlPredictor.saveModel('./model');
          console.log('Ensemble model trained and saved.');
        } else {
          console.error('Training failed, not enough samples.');
        }
      } else {
        console.log('Not enough historical data, using fallback logic.');
      }
    } catch (e) { console.error('Error during offline training:', e); }
  }
  // Refresh cache định kỳ mỗi 10 phút
  setInterval(() => mlPredictor.refreshHistoryCache(), 10 * 60 * 1000);
  mlPredictor.refreshHistoryCache();
}

// ==================== Broadcast Prediction (dùng ML) ====================
async function broadcastPrediction() {
  try {
    // Dùng cache nếu có, nếu không query DB
    let history;
    if (mlPredictor.historyCache.length > 0 && (Date.now() - mlPredictor.lastCacheUpdate) < 600000) {
      history = mlPredictor.historyCache;
    } else {
      const rows = await dbAll(`SELECT sid, d1, d2, d3, total, result, timestamp FROM sessions ORDER BY sid DESC LIMIT 1000`);
      history = rows.filter(item =>
        item.d1 && item.d2 && item.d3 && item.d1>=1 && item.d1<=6 && item.d2>=1 && item.d2<=6 && item.d3>=1 && item.d3<=6 && item.total>=3 && item.total<=18
      );
    }

    const currentTimestamp = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });

    if (history.length < 5) {
      const msg = { Phien: null, Ket_qua: null, Xuc_xac_1: null, Xuc_xac_2: null, Xuc_xac_3: null,
        phien_hien_tai: null, du_doan: null, do_tin_cay: '0', cau_hien_tai: 'Chưa đủ dữ liệu', cau_10_phien: '',
        ly_do: {}, suggested_bet: 0, ngay: currentTimestamp, Id: '@tiendataox' };
      connectedClients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(msg)); });
      return;
    }

    const lastSession = history[0];
    const nextSessionId = lastSession.sid + 1;

    // --- Dự đoán ---
    let finalPrediction, overallConfidence, lyDo, featuresForUpdate = null;

    if (modelReady) {
      const cauLogData = await readCauLog();
      const result = await mlPredictor.predict(history, cauLogData);
      if (result) {
        finalPrediction = result.prediction;
        const prob = result.probability;
        overallConfidence = (prob * 100).toFixed(2);
        featuresForUpdate = result.features;
        lyDo = { ket_luan: 'ML ensemble', probability: prob, note: 'Neural network ensemble + kỹ thuật nâng cao' };
        mlPredictor.predictedFeatures.set(nextSessionId, featuresForUpdate);
      } else {
        // fallback
        finalPrediction = lastSession.result;
        overallConfidence = '50';
        lyDo = { ket_luan: 'Fallback (không đủ features)' };
      }
    } else {
      const cauLogData = await readCauLog();
      const logic20Pred = await predictLogic20(history, logicPerformance, cauLogData);
      if (logic20Pred) {
        finalPrediction = logic20Pred;
        overallConfidence = '70';
        lyDo = { ket_luan: 'Logic20 fallback' };
      } else {
        finalPrediction = lastSession.result;
        overallConfidence = '50';
        lyDo = { ket_luan: 'Fallback theo phiên cuối' };
      }
    }

    const cau10Phien = history.slice(0,10).map(s => s.result === 'Tài' ? 'T' : 'X').join('');
    const [_, patternDesc] = analyzePatterns(history.map(i => i.result));
    const detectedPatternString = patternDesc;

    let suggestedBet = 0;
    const confNum = parseFloat(overallConfidence);
    if (confNum >= 80) suggestedBet = 10;
    else if (confNum >= 60) suggestedBet = 5;
    else if (confNum >= 40) suggestedBet = 2;

    const predictionMessage = {
      Phien: lastSession.sid,
      Ket_qua: lastSession.result,
      Xuc_xac_1: lastSession.d1,
      Xuc_xac_2: lastSession.d2,
      Xuc_xac_3: lastSession.d3,
      phien_hien_tai: nextSessionId,
      du_doan: finalPrediction,
      do_tin_cay: `${Math.round(confNum)}`,
      cau_hien_tai: detectedPatternString,
      cau_10_phien: cau10Phien,
      ly_do: lyDo,
      suggested_bet: suggestedBet,
      ngay: currentTimestamp,
      Id: '@tiendataox'
    };

    await dbRun(`INSERT INTO predictions (sid, prediction, confidence, cau_hien_tai, ly_do, features, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [nextSessionId, finalPrediction, parseFloat(overallConfidence), cau10Phien, JSON.stringify(lyDo), featuresForUpdate ? JSON.stringify(featuresForUpdate) : null, Date.now()]);

    connectedClients.forEach(c => {
      if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(predictionMessage));
    });

    console.log(`\n--- Broadcasted ${nextSessionId}: ${finalPrediction} (${overallConfidence}%) ---`);
  } catch (err) { console.error('Lỗi broadcastPrediction:', err); }
}

// --- Các API giữ nguyên ---
fastify.get('/api/sunwin/taixiu/ws', { websocket: true }, (connection, req) => {
  const { socket } = connection;
  const { id, key } = req.query || {};
  if (!authenticateWebSocket(id, key)) {
    socket.send(JSON.stringify({ error: 'Authentication failed' }));
    socket.close();
    return;
  }
  console.log(`New WebSocket client: ${id}`);
  connectedClients.add(socket);
  sendHistoryToClient(socket).catch(err => console.error('Lỗi gửi history:', err));
  socket.on('close', () => connectedClients.delete(socket));
});

fastify.get('/api/his', async (request, reply) => {
  try {
    const rows = await dbAll(`SELECT sid, prediction, actual, status, confidence, cau_hien_tai, ly_do, timestamp FROM predictions ORDER BY sid DESC LIMIT 500`);
    const history = rows.map(r => ({
      phien: r.sid.toString(),
      du_doan: r.prediction,
      thuc_te: r.actual || null,
      trang_thai: r.status === 'win' ? '✅' : (r.status === 'lose' ? '❌' : '⏳'),
      ti_le: r.confidence ? r.confidence.toFixed(0) + '%' : null,
      cau_hien_tai: r.cau_hien_tai,
      ly_do: JSON.parse(r.ly_do || '{}'),
      timestamp: new Date(r.timestamp).toISOString()
    }));
    reply.send(history);
  } catch (err) { reply.status(500).send({ error: err.message }); }
});

fastify.get('/api/history-json', async (request, reply) => {
  try {
    const rows = await dbAll(`SELECT sid, d1, d2, d3, total, result, timestamp FROM sessions ORDER BY sid ASC`);
    reply.send(rows);
  } catch (err) { reply.status(500).send('Lỗi xuất dữ liệu'); }
});

fastify.get('/api/analysis', async (request, reply) => {
  try {
    const rows = await dbAll(`SELECT sid, d1, d2, d3, total, result, timestamp FROM sessions ORDER BY sid DESC LIMIT 100`);
    const history = rows.filter(r => r.d1 && r.d2 && r.d3);
    if (history.length < 10) return reply.send({ warning: 'Chưa đủ dữ liệu phân tích' });
    const results = history.map(s => s.result);
    const totals = history.map(s => s.total);
    const taiCount = results.filter(r => r === 'Tài').length;
    const xiuCount = results.length - taiCount;
    const volatility = calculateStdDev(totals.slice(0,30));
    let streakLength = 1;
    for (let i=1; i<results.length; i++) {
      if (results[i] === results[0]) streakLength++; else break;
    }
    const streak = { result: results[0], length: streakLength };
    const deception = detectDeception(history);
    const analysis = {
      tong_phien: history.length,
      ti_le_tai: (taiCount/history.length*100).toFixed(2)+'%',
      ti_le_xiu: (xiuCount/history.length*100).toFixed(2)+'%',
      streak_hien_tai: streak,
      do_bien_dong: volatility.toFixed(2),
      canh_bao: deception,
      thoi_gian: new Date().toISOString()
    };
    reply.send(analysis);
  } catch (err) { reply.status(500).send({ error: err.message }); }
});

// --- Khởi động server ---
const start = async () => {
  await loadLogicPerformance();
  await initModel();
  connectWebSocket();

  try {
    const address = await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`Server Fastify đang chạy tại ${address}`);
    console.log(`API his: http://localhost:${PORT}/api/his?key=${API_KEY}`);
    console.log(`API analysis: http://localhost:${PORT}/api/analysis?key=${API_KEY}`);
    console.log(`WebSocket: ws://localhost:${PORT}/api/sunwin/taixiu/ws?id=test&key=${API_KEY}`);
  } catch (err) {
    console.error('Lỗi khởi động server:', err);
    process.exit(1);
  }
};

start();
