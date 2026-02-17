// server.js - Sunwin Tài Xỉu Predictor with ML (TensorFlow.js)
// Chạy trên Render, dùng SQLite, WebSocket, tự động học

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
const API_KEY = process.env.API_KEY || 'nhutquang';

fastify.register(fastifyWebsocket);

// Middleware xác thực HTTP
fastify.addHook('onRequest', async (request, reply) => {
  const publicPaths = ['/api/sunwin/taixiu/ws'];
  if (publicPaths.some(p => request.url.startsWith(p))) return;
  if (request.url.startsWith('/api/sunwin') || request.url.startsWith('/api/history-json') || 
      request.url.startsWith('/api/his') || request.url.startsWith('/api/analysis')) {
    const urlKey = request.query.key;
    if (!urlKey || urlKey !== API_KEY) {
      return reply.code(403).send({ error: 'Key sai, liên hệ tele: @nhutquangdz' });
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

// Promise wrapper cho db
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

// --- Logic performance (chỉ dùng cho fallback, ML sẽ tự học) ---
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
  try {
    await fs.appendFile(cauLogFilePath, JSON.stringify(patternData) + '\n');
  } catch (err) {
    console.error('Lỗi ghi log cầu:', err);
  }
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

function analyzeAndExtractPatterns(history) {
  const patterns = {};
  if (history.length >= 10) {
    patterns.last10 = history.slice(0, 10).map(s => s.result === 'Tài' ? 'T' : 'X').join('');
  }
  if (history.length >= 20) {
    patterns.last20_totals = history.slice(0, 20).map(s => s.total).join(',');
  }
  if (history.length >= 5) {
    patterns.sum_pairs = [];
    for (let i = 0; i < 4; i++) {
      if (history[i+1]) patterns.sum_pairs.push(`${history[i].total}-${history[i+1].total}`);
    }
  }
  if (history.length >= 10) {
    const diceFreq = getDiceFrequencies(history, 10);
    patterns.dice_freq = diceFreq.slice(1);
  }
  if (history.length >= 20) {
    const totals = history.slice(0, 20).map(s => s.total);
    patterns.stddev = calculateStdDev(totals);
  }
  let currentStreakLength = 0;
  const currentResult = history[0].result;
  for (let i = 0; i < history.length; i++) {
    if (history[i].result === currentResult) currentStreakLength++; else break;
  }
  patterns.last_streak = { result: currentResult === 'Tài' ? 'T' : 'X', length: currentStreakLength };
  if (history.length >= 5) {
    patterns.alternating5 = history.slice(0, 5).map(s => s.result === 'Tài' ? 'T' : 'X').join('');
  }
  if (history.length >= 2) {
    patterns.sum_sequence_patterns = [
      { key: `${history[0].total}-${history[0].result === 'Tài' ? 'T' : 'X'}_${history[1]?.total}-${history[1]?.result === 'Tài' ? 'T' : 'X'}` }
    ];
  }
  return patterns;
}

// ==================== 25 LOGIC CŨ ====================
// Giữ nguyên các hàm logic từ code cũ (đã được kiểm tra)

function predictLogic1(lastSession, history) {
  if (!lastSession || history.length < 10) return null;
  const lastDigitOfSession = lastSession.sid % 10;
  const totalPreviousSession = lastSession.total;
  let indicatorSum = lastDigitOfSession + totalPreviousSession;
  const currentPrediction = indicatorSum % 2 === 0 ? 'Xỉu' : 'Tài';
  let correctCount = 0, totalCount = 0;
  const consistencyWindow = Math.min(history.length - 1, 25);
  for (let i = 0; i < consistencyWindow; i++) {
    const session = history[i];
    const prevSession = history[i + 1];
    if (prevSession) {
      const prevIndicatorSum = (prevSession.sid % 10) + prevSession.total;
      const prevPredicted = prevIndicatorSum % 2 === 0 ? 'Xỉu' : 'Tài';
      if (prevPredicted === session.result) correctCount++;
      totalCount++;
    }
  }
  if (totalCount > 5 && (correctCount / totalCount) >= 0.65) return currentPrediction;
  return null;
}

function predictLogic2(nextSessionId, history) {
  if (history.length < 15) return null;
  let thuanScore = 0, nghichScore = 0;
  const analysisWindow = Math.min(history.length, 60);
  for (let i = 0; i < analysisWindow; i++) {
    const session = history[i];
    const isEvenSID = session.sid % 2 === 0;
    const weight = 1.0 - (i / analysisWindow) * 0.6;
    if ((isEvenSID && session.result === 'Xỉu') || (!isEvenSID && session.result === 'Tài')) thuanScore += weight;
    if ((isEvenSID && session.result === 'Tài') || (!isEvenSID && session.result === 'Xỉu')) nghichScore += weight;
  }
  const currentSessionIsEven = nextSessionId % 2 === 0;
  const totalScore = thuanScore + nghichScore;
  if (totalScore < 10) return null;
  const thuanRatio = thuanScore / totalScore;
  const nghichRatio = nghichScore / totalScore;
  if (thuanRatio > nghichRatio + 0.15) return currentSessionIsEven ? 'Xỉu' : 'Tài';
  else if (nghichRatio > thuanRatio + 0.15) return currentSessionIsEven ? 'Tài' : 'Xỉu';
  return null;
}

function predictLogic3(history) {
  if (history.length < 15) return null;
  const analysisWindow = Math.min(history.length, 50);
  const lastXTotals = history.slice(0, analysisWindow).map(s => s.total);
  const sumOfTotals = lastXTotals.reduce((a, b) => a + b, 0);
  const average = sumOfTotals / analysisWindow;
  const stdDev = calculateStdDev(lastXTotals);
  const deviationFactor = 0.8;
  const recentTrendLength = Math.min(5, history.length);
  const recentTrend = history.slice(0, recentTrendLength).map(s => s.total);
  let isRising = false, isFalling = false;
  if (recentTrendLength >= 3) {
    isRising = true; isFalling = true;
    for (let i = 0; i < recentTrendLength - 1; i++) {
      if (recentTrend[i] <= recentTrend[i + 1]) isRising = false;
      if (recentTrend[i] >= recentTrend[i + 1]) isFalling = false;
    }
  }
  if (average < 10.5 - (deviationFactor * stdDev) && isFalling) return 'Xỉu';
  else if (average > 10.5 + (deviationFactor * stdDev) && isRising) return 'Tài';
  return null;
}

function predictLogic4(history) {
  if (history.length < 25) return null;
  let bestPrediction = null, maxConfidence = 0;
  const volatility = calculateStdDev(history.slice(0, Math.min(25, history.length)).map(s => s.total));
  const patternLengths = (volatility < 1.8) ? [5, 4, 3] : [4, 3, 2];
  for (const len of patternLengths) {
    if (history.length < len + 2) continue;
    const recentPattern = history.slice(0, len).map(s => s.result).reverse().join('');
    let taiFollows = 0, xiuFollows = 0, totalMatches = 0;
    for (let i = len; i < Math.min(history.length - 1, 150); i++) {
      const patternToMatch = history.slice(i, i + len).map(s => s.result).reverse().join('');
      if (patternToMatch === recentPattern) {
        totalMatches++;
        const nextResult = history[i - 1].result;
        if (nextResult === 'Tài') taiFollows++; else xiuFollows++;
      }
    }
    if (totalMatches < 2) continue;
    const taiConfidence = taiFollows / totalMatches;
    const xiuConfidence = xiuFollows / totalMatches;
    const MIN_PATTERN_CONFIDENCE = 0.65;
    if (taiConfidence >= MIN_PATTERN_CONFIDENCE && taiConfidence > maxConfidence) {
      maxConfidence = taiConfidence;
      bestPrediction = 'Tài';
    } else if (xiuConfidence >= MIN_PATTERN_CONFIDENCE && xiuConfidence > maxConfidence) {
      maxConfidence = xiuConfidence;
      bestPrediction = 'Xỉu';
    }
  }
  return bestPrediction;
}

function predictLogic5(history) {
  if (history.length < 40) return null;
  const sumCounts = {};
  const analysisWindow = Math.min(history.length, 400);
  for (let i = 0; i < analysisWindow; i++) {
    const total = history[i].total;
    const weight = 1.0 - (i / analysisWindow) * 0.8;
    sumCounts[total] = (sumCounts[total] || 0) + weight;
  }
  let mostFrequentSum = -1, maxWeightedCount = 0;
  for (const sum in sumCounts) {
    if (sumCounts[sum] > maxWeightedCount) {
      maxWeightedCount = sumCounts[sum];
      mostFrequentSum = parseInt(sum);
    }
  }
  if (mostFrequentSum !== -1) {
    const minWeightedCountRatio = 0.08;
    const totalWeightedSum = Object.values(sumCounts).reduce((a, b) => a + b, 0);
    if (totalWeightedSum > 0 && (maxWeightedCount / totalWeightedSum) > minWeightedCountRatio) {
      const neighbors = [];
      if (sumCounts[mostFrequentSum - 1]) neighbors.push(sumCounts[mostFrequentSum - 1]);
      if (sumCounts[mostFrequentSum + 1]) neighbors.push(sumCounts[mostFrequentSum + 1]);
      const isPeak = neighbors.every(n => maxWeightedCount > n * 1.05);
      if (isPeak) {
        if (mostFrequentSum <= 10) return 'Xỉu';
        if (mostFrequentSum >= 11) return 'Tài';
      }
    }
  }
  return null;
}

function predictLogic6(lastSession, history) {
  if (!lastSession || history.length < 40) return null;
  const nextSessionLastDigit = (lastSession.sid + 1) % 10;
  const lastSessionTotalParity = lastSession.total % 2;
  let taiVotes = 0, xiuVotes = 0;
  const analysisWindow = Math.min(history.length, 250);
  if (analysisWindow < 2) return null;
  for (let i = 0; i < analysisWindow - 1; i++) {
    const currentHistSessionResult = history[i].result;
    const prevHistSession = history[i + 1];
    const prevSessionLastDigit = prevHistSession.sid % 10;
    const prevSessionTotalParity = prevHistSession.total % 2;
    const featureSetHistory = `${prevSessionLastDigit % 2}-${prevSessionTotalParity}-${(prevHistSession.total > 10.5 ? 'T' : 'X')}`;
    const featureSetCurrent = `${nextSessionLastDigit % 2}-${lastSessionTotalParity}-${(lastSession.total > 10.5 ? 'T' : 'X')}`;
    if (featureSetHistory === featureSetCurrent) {
      if (currentHistSessionResult === 'Tài') taiVotes++; else xiuVotes++;
    }
  }
  const totalVotes = taiVotes + xiuVotes;
  if (totalVotes < 5) return null;
  const voteDifferenceRatio = Math.abs(taiVotes - xiuVotes) / totalVotes;
  if (voteDifferenceRatio > 0.25) {
    if (taiVotes > xiuVotes) return 'Tài';
    if (xiuVotes > taiVotes) return 'Xỉu';
  }
  return null;
}

function predictLogic7(history) {
  const TREND_STREAK_LENGTH_MIN = 3, TREND_STREAK_LENGTH_MAX = 6;
  if (history.length < TREND_STREAK_LENGTH_MIN) return null;
  const volatility = calculateStdDev(history.slice(0, Math.min(20, history.length)).map(s => s.total));
  const effectiveStreakLength = (volatility < 1.7) ? TREND_STREAK_LENGTH_MAX : (volatility < 2.0) ? TREND_STREAK_LENGTH_MAX - 1 : TREND_STREAK_LENGTH_MIN;
  const recentResults = history.slice(0, effectiveStreakLength).map(s => s.result);
  if (recentResults.length < effectiveStreakLength) return null;
  if (recentResults.every(r => r === 'Tài')) {
    let continuationCount = 0, reversalCount = 0;
    for (let i = effectiveStreakLength; i < Math.min(history.length - 1, 100); i++) {
      const potentialStreak = history.slice(i, i + effectiveStreakLength);
      if (potentialStreak.every(s => s.result === 'Tài')) {
        if (history[i - 1].result === 'Tài') continuationCount++; else reversalCount++;
      }
    }
    if (continuationCount > reversalCount * 1.5) return 'Tài';
    else if (reversalCount > continuationCount * 1.5) return 'Xỉu';
  }
  if (recentResults.every(r => r === 'Xỉu')) {
    let continuationCount = 0, reversalCount = 0;
    for (let i = effectiveStreakLength; i < Math.min(history.length - 1, 100); i++) {
      const potentialStreak = history.slice(i, i + effectiveStreakLength);
      if (potentialStreak.every(s => s.result === 'Xỉu')) {
        if (history[i - 1].result === 'Xỉu') continuationCount++; else reversalCount++;
      }
    }
    if (continuationCount > reversalCount * 1.5) return 'Xỉu';
    else if (reversalCount > continuationCount * 1.5) return 'Tài';
  }
  return null;
}

function predictLogic8(history) {
  const LONG_PERIOD = 30;
  if (history.length < LONG_PERIOD + 1) return null;
  const longTermTotals = history.slice(1, LONG_PERIOD + 1).map(s => s.total);
  const longTermAverage = longTermTotals.reduce((a, b) => a + b, 0) / longTermTotals.length;
  const longTermStdDev = calculateStdDev(longTermTotals);
  const lastSessionTotal = history[0].total;
  const dynamicDeviationThreshold = Math.max(1.5, 0.8 * longTermStdDev);
  const last5Totals = history.slice(0, Math.min(5, history.length)).map(s => s.total);
  let isLast5Rising = false, isLast5Falling = false;
  if (last5Totals.length >= 2) {
    isLast5Rising = true;
    isLast5Falling = true;
    for (let i = 0; i < last5Totals.length - 1; i++) {
      if (last5Totals[i] <= last5Totals[i + 1]) isLast5Rising = false;
      if (last5Totals[i] >= last5Totals[i + 1]) isLast5Falling = false;
    }
  }
  if (lastSessionTotal > longTermAverage + dynamicDeviationThreshold && isLast5Rising) return 'Xỉu';
  else if (lastSessionTotal < longTermAverage - dynamicDeviationThreshold && isLast5Falling) return 'Tài';
  return null;
}

function predictLogic9(history) {
  if (history.length < 15) return null;
  const mostRecentResult = history[0].result;
  let currentConsecutiveCount = 0;
  for (let i = 0; i < history.length; i++) {
    if (history[i].result === mostRecentResult) currentConsecutiveCount++; else break;
  }
  if (currentConsecutiveCount < 2) return null;
  let totalReversals = 0, totalContinuations = 0;
  const searchWindow = Math.min(history.length, 80);
  for (let i = currentConsecutiveCount; i < searchWindow; i++) {
    const potentialStreak = history.slice(i, i + currentConsecutiveCount);
    if (potentialStreak.every(s => s.result === mostRecentResult)) {
      if (history[i - 1] && history[i - 1].result !== mostRecentResult) totalReversals++;
      else if (history[i - 1] && history[i - 1].result === mostRecentResult) totalContinuations++;
    }
  }
  if (totalReversals + totalContinuations > 2) {
    if (totalReversals > totalContinuations * 1.2) return mostRecentResult === 'Tài' ? 'Xỉu' : 'Tài';
    else if (totalContinuations > totalReversals * 1.2) return mostRecentResult;
  }
  return null;
}

function predictLogic10(history) {
  const MOMENTUM_STREAK_LENGTH = 3, STABILITY_CHECK_LENGTH = 7;
  if (history.length < STABILITY_CHECK_LENGTH + 1) return null;
  const recentResults = history.slice(0, MOMENTUM_STREAK_LENGTH).map(s => s.result);
  const widerHistory = history.slice(0, STABILITY_CHECK_LENGTH).map(s => s.result);
  if (recentResults.every(r => r === 'Tài')) {
    const taiCountInWider = widerHistory.filter(r => r === 'Tài').length;
    if (taiCountInWider / STABILITY_CHECK_LENGTH >= 0.75 && predictLogic9(history) !== 'Xỉu') return 'Tài';
  }
  if (recentResults.every(r => r === 'Xỉu')) {
    const xiuCountInWider = widerHistory.filter(r => r === 'Xỉu').length;
    if (xiuCountInWider / STABILITY_CHECK_LENGTH >= 0.75 && predictLogic9(history) !== 'Tài') return 'Xỉu';
  }
  return null;
}

function predictLogic11(history) {
  if (history.length < 15) return null;
  const reversalPatterns = [
    { pattern: 'TàiXỉuTài', predict: 'Xỉu', minOccurrences: 3, weight: 1.5 },
    { pattern: 'XỉuTàiXỉu', predict: 'Tài', minOccurrences: 3, weight: 1.5 },
    { pattern: 'TàiTàiXỉu', predict: 'Tài', minOccurrences: 4, weight: 1.3 },
    { pattern: 'XỉuXỉuTài', predict: 'Xỉu', minOccurrences: 4, weight: 1.3 },
    { pattern: 'TàiXỉuXỉu', predict: 'Tài', minOccurrences: 3, weight: 1.4 },
    { pattern: 'XỉuTàiTài', predict: 'Xỉu', minOccurrences: 3, weight: 1.4 },
    { pattern: 'XỉuTàiTàiXỉu', predict: 'Xỉu', minOccurrences: 2, weight: 1.6 },
    { pattern: 'TàiXỉuXỉuTài', predict: 'Tài', minOccurrences: 2, weight: 1.6 },
    { pattern: 'TàiXỉuTàiXỉu', predict: 'Tài', minOccurrences: 2, weight: 1.4 },
    { pattern: 'XỉuTàiXỉuTài', predict: 'Xỉu', minOccurrences: 2, weight: 1.4 },
    { pattern: 'TàiXỉuXỉuXỉu', predict: 'Tài', minOccurrences: 1, weight: 1.7 },
    { pattern: 'XỉuTàiTàiTài', predict: 'Xỉu', minOccurrences: 1, weight: 1.7 },
  ];
  let bestPatternMatch = null, maxWeightedConfidence = 0;
  for (const patternDef of reversalPatterns) {
    const patternDefShort = patternDef.pattern.replace(/Tài/g, 'T').replace(/Xỉu/g, 'X');
    const patternLength = patternDefShort.length;
    if (history.length < patternLength + 1) continue;
    const currentWindowShort = history.slice(0, patternLength).map(s => s.result === 'Tài' ? 'T' : 'X').reverse().join('');
    if (currentWindowShort === patternDefShort) {
      let matchCount = 0, totalPatternOccurrences = 0;
      for (let i = patternLength; i < Math.min(history.length - 1, 350); i++) {
        const historicalPatternShort = history.slice(i, i + patternLength).map(s => s.result === 'Tài' ? 'T' : 'X').reverse().join('');
        if (historicalPatternShort === patternDefShort) {
          totalPatternOccurrences++;
          if (history[i - 1].result === patternDef.predict) matchCount++;
        }
      }
      if (totalPatternOccurrences < patternDef.minOccurrences) continue;
      const patternAccuracy = matchCount / totalPatternOccurrences;
      if (patternAccuracy >= 0.68) {
        const weightedConfidence = patternAccuracy * patternDef.weight;
        if (weightedConfidence > maxWeightedConfidence) {
          maxWeightedConfidence = weightedConfidence;
          bestPatternMatch = patternDef.predict;
        }
      }
    }
  }
  return bestPatternMatch;
}

function predictLogic12(lastSession, history) {
  if (!lastSession || history.length < 20) return null;
  const nextSessionParity = (lastSession.sid + 1) % 2;
  const mostRecentResult = history[0].result;
  let currentConsecutiveCount = 0;
  for (let i = 0; i < history.length; i++) {
    if (history[i].result === mostRecentResult) currentConsecutiveCount++; else break;
  }
  let taiVotes = 0, xiuVotes = 0;
  const analysisWindow = Math.min(history.length, 250);
  for (let i = 0; i < analysisWindow - 1; i++) {
    const currentHistSession = history[i];
    const prevHistSession = history[i + 1];
    const prevHistSessionParity = prevHistSession.sid % 2;
    let histConsecutiveCount = 0;
    for (let j = i + 1; j < analysisWindow; j++) {
      if (history[j].result === prevHistSession.result) histConsecutiveCount++; else break;
    }
    if (prevHistSessionParity === nextSessionParity && histConsecutiveCount === currentConsecutiveCount) {
      if (currentHistSession.result === 'Tài') taiVotes++; else xiuVotes++;
    }
  }
  const totalVotes = taiVotes + xiuVotes;
  if (totalVotes < 6) return null;
  if (taiVotes / totalVotes >= 0.68) return 'Tài';
  if (xiuVotes / totalVotes >= 0.68) return 'Xỉu';
  return null;
}

function predictLogic13(history) {
  if (history.length < 80) return null;
  const mostRecentResult = history[0].result;
  let currentStreakLength = 0;
  for (let i = 0; i < history.length; i++) {
    if (history[i].result === mostRecentResult) currentStreakLength++; else break;
  }
  if (currentStreakLength < 1) return null;
  const streakStats = {};
  const analysisWindow = Math.min(history.length, 500);
  for (let i = 0; i < analysisWindow - 1; i++) {
    const sessionResult = history[i].result;
    const prevSessionResult = history[i + 1].result;
    let tempStreakLength = 1;
    for (let j = i + 2; j < analysisWindow; j++) {
      if (history[j].result === prevSessionResult) tempStreakLength++; else break;
    }
    if (tempStreakLength > 0) {
      const streakKey = `${prevSessionResult}_${tempStreakLength}`;
      if (!streakStats[streakKey]) streakStats[streakKey] = { 'Tài': 0, 'Xỉu': 0 };
      streakStats[streakKey][sessionResult]++;
    }
  }
  const currentStreakKey = `${mostRecentResult}_${currentStreakLength}`;
  if (streakStats[currentStreakKey]) {
    const stats = streakStats[currentStreakKey];
    const totalFollowUps = stats['Tài'] + stats['Xỉu'];
    if (totalFollowUps < 5) return null;
    const taiProb = stats['Tài'] / totalFollowUps;
    const xiuProb = stats['Xỉu'] / totalFollowUps;
    if (taiProb >= 0.65) return 'Tài';
    if (xiuProb >= 0.65) return 'Xỉu';
  }
  return null;
}

function predictLogic14(history) {
  if (history.length < 50) return null;
  const shortPeriod = 8, longPeriod = 30;
  if (history.length < longPeriod) return null;
  const shortTermTotals = history.slice(0, shortPeriod).map(s => s.total);
  const longTermTotals = history.slice(0, longPeriod).map(s => s.total);
  const shortAvg = shortTermTotals.reduce((a, b) => a + b, 0) / shortPeriod;
  const longAvg = longTermTotals.reduce((a, b) => a + b, 0) / longPeriod;
  const longStdDev = calculateStdDev(longTermTotals);
  if (shortAvg > longAvg + (longStdDev * 0.8)) {
    const last2Results = history.slice(0, 2).map(s => s.result);
    if (last2Results.length === 2 && last2Results.every(r => r === 'Tài')) return 'Xỉu';
  } else if (shortAvg < longAvg - (longStdDev * 0.8)) {
    const last2Results = history.slice(0, 2).map(s => s.result);
    if (last2Results.length === 2 && last2Results.every(r => r === 'Xỉu')) return 'Tài';
  }
  return null;
}

function predictLogic15(history) {
  if (history.length < 80) return null;
  const analysisWindow = Math.min(history.length, 400);
  const evenCounts = { 'Tài': 0, 'Xỉu': 0 };
  const oddCounts = { 'Tài': 0, 'Xỉu': 0 };
  let totalEven = 0, totalOdd = 0;
  for (let i = 0; i < analysisWindow; i++) {
    const session = history[i];
    const isTotalEven = session.total % 2 === 0;
    if (isTotalEven) {
      evenCounts[session.result]++;
      totalEven++;
    } else {
      oddCounts[session.result]++;
      totalOdd++;
    }
  }
  if (totalEven < 20 || totalOdd < 20) return null;
  const lastSessionTotal = history[0].total;
  const isLastTotalEven = lastSessionTotal % 2 === 0;
  const minDominance = 0.65;
  if (isLastTotalEven) {
    if (evenCounts['Tài'] / totalEven >= minDominance) return 'Tài';
    if (evenCounts['Xỉu'] / totalEven >= minDominance) return 'Xỉu';
  } else {
    if (oddCounts['Tài'] / totalOdd >= minDominance) return 'Tài';
    if (oddCounts['Xỉu'] / totalOdd >= minDominance) return 'Xỉu';
  }
  return null;
}

function predictLogic16(history) {
  if (history.length < 60) return null;
  const MODULO_N = 5;
  const analysisWindow = Math.min(history.length, 500);
  const moduloPatterns = {};
  for (let i = 0; i < analysisWindow - 1; i++) {
    const prevSession = history[i + 1];
    const currentSessionResult = history[i].result;
    const moduloValue = prevSession.total % MODULO_N;
    if (!moduloPatterns[moduloValue]) moduloPatterns[moduloValue] = { 'Tài': 0, 'Xỉu': 0 };
    moduloPatterns[moduloValue][currentSessionResult]++;
  }
  const lastSessionTotal = history[0].total;
  const currentModuloValue = lastSessionTotal % MODULO_N;
  if (moduloPatterns[currentModuloValue]) {
    const stats = moduloPatterns[currentModuloValue];
    const totalCount = stats['Tài'] + stats['Xỉu'];
    if (totalCount < 7) return null;
    const taiProb = stats['Tài'] / totalCount;
    const xiuProb = stats['Xỉu'] / totalCount;
    if (taiProb >= 0.65) return 'Tài';
    if (xiuProb >= 0.65) return 'Xỉu';
  }
  return null;
}

function predictLogic17(history) {
  if (history.length < 100) return null;
  const analysisWindow = Math.min(history.length, 600);
  const totals = history.slice(0, analysisWindow).map(s => s.total);
  const meanTotal = totals.reduce((a, b) => a + b, 0) / totals.length;
  const stdDevTotal = calculateStdDev(totals);
  const lastSessionTotal = history[0].total;
  const deviation = Math.abs(lastSessionTotal - meanTotal);
  const zScore = stdDevTotal > 0 ? deviation / stdDevTotal : 0;
  if (zScore >= 1.5) {
    if (lastSessionTotal > meanTotal) return 'Xỉu';
    else return 'Tài';
  }
  return null;
}

function predictLogic18(history) {
  if (history.length < 50) return null;
  const analysisWindow = Math.min(history.length, 300);
  const patternStats = {};
  for (let i = 0; i < analysisWindow - 1; i++) {
    const prevSession = history[i + 1];
    const currentSessionResult = history[i].result;
    const p1 = prevSession.d1 % 2, p2 = prevSession.d2 % 2, p3 = prevSession.d3 % 2;
    const patternKey = `${p1}-${p2}-${p3}`;
    if (!patternStats[patternKey]) patternStats[patternKey] = { 'Tài': 0, 'Xỉu': 0 };
    patternStats[patternKey][currentSessionResult]++;
  }
  const lastSession = history[0];
  const currentP1 = lastSession.d1 % 2, currentP2 = lastSession.d2 % 2, currentP3 = lastSession.d3 % 2;
  const currentPatternKey = `${currentP1}-${currentP2}-${currentP3}`;
  if (patternStats[currentPatternKey]) {
    const stats = patternStats[currentPatternKey];
    const totalCount = stats['Tài'] + stats['Xỉu'];
    if (totalCount < 8) return null;
    const taiProb = stats['Tài'] / totalCount;
    const xiuProb = stats['Xỉu'] / totalCount;
    if (taiProb >= 0.65) return 'Tài';
    if (xiuProb >= 0.65) return 'Xỉu';
  }
  return null;
}

function predictLogic19(history) {
  if (history.length < 50) return null;
  let taiScore = 0, xiuScore = 0;
  const now = Date.now();
  const analysisWindowMs = 2 * 60 * 60 * 1000;
  for (const session of history) {
    if (now - session.timestamp > analysisWindowMs) break;
    const ageFactor = 1 - ((now - session.timestamp) / analysisWindowMs);
    const weight = ageFactor * ageFactor * ageFactor;
    if (session.result === 'Tài') taiScore += weight; else xiuScore += weight;
  }
  const totalScore = taiScore + xiuScore;
  if (totalScore < 10) return null;
  const taiRatio = taiScore / totalScore;
  const xiuRatio = xiuScore / totalScore;
  const BIAS_THRESHOLD = 0.10;
  if (taiRatio > xiuRatio + BIAS_THRESHOLD) return 'Tài';
  if (xiuRatio > taiRatio + BIAS_THRESHOLD) return 'Xỉu';
  return null;
}

// Logic 20 (meta) - sẽ dùng khi fallback
async function predictLogic20(history, logicPerf, cauLogData) {
  // Đơn giản hóa: lấy logic có accuracy cao nhất trong lịch sử
  let bestLogic = null;
  let bestAcc = 0;
  for (const [name, perf] of Object.entries(logicPerf)) {
    if (perf.total > 5 && perf.accuracy > bestAcc) {
      bestAcc = perf.accuracy;
      bestLogic = name;
    }
  }
  if (!bestLogic) return null;
  // Gọi logic tương ứng (cần ánh xạ)
  const lastSession = history[0];
  const nextSessionId = lastSession.sid + 1;
  const logicMap = {
    logic1: () => predictLogic1(lastSession, history),
    logic2: () => predictLogic2(nextSessionId, history),
    logic3: () => predictLogic3(history),
    logic4: () => predictLogic4(history),
    logic5: () => predictLogic5(history),
    logic6: () => predictLogic6(lastSession, history),
    logic7: () => predictLogic7(history),
    logic8: () => predictLogic8(history),
    logic9: () => predictLogic9(history),
    logic10: () => predictLogic10(history),
    logic11: () => predictLogic11(history),
    logic12: () => predictLogic12(lastSession, history),
    logic13: () => predictLogic13(history),
    logic14: () => predictLogic14(history),
    logic15: () => predictLogic15(history),
    logic16: () => predictLogic16(history),
    logic17: () => predictLogic17(history),
    logic18: () => predictLogic18(history),
    logic19: () => predictLogic19(history),
    logic21: () => predictLogic21(history),
    logic22: () => predictLogic22(history, cauLogData),
    logic23: () => predictLogic23(history),
    logic24: () => predictLogic24(history),
    logic25: async () => await predictLogic25(history, cauLogData),
  };
  const fn = logicMap[bestLogic];
  if (fn) return fn();
  return null;
}

// Logic 21
function markovWeightedV3(patternArr) {
  if (patternArr.length < 3) return null;
  const transitions = {};
  const lastResult = patternArr[patternArr.length - 1];
  const secondLastResult = patternArr.length > 1 ? patternArr[patternArr.length - 2] : null;
  for (let i = 0; i < patternArr.length - 1; i++) {
    const current = patternArr[i];
    const next = patternArr[i + 1];
    const key = current + next;
    if (!transitions[key]) transitions[key] = { 'T': 0, 'X': 0 };
    if (i + 2 < patternArr.length) transitions[key][patternArr[i + 2]]++;
  }
  if (secondLastResult && lastResult) {
    const currentTransitionKey = secondLastResult + lastResult;
    if (transitions[currentTransitionKey]) {
      const stats = transitions[currentTransitionKey];
      const total = stats['T'] + stats['X'];
      if (total > 3) {
        if (stats['T'] / total > 0.60) return 'Tài';
        if (stats['X'] / total > 0.60) return 'Xỉu';
      }
    }
  }
  return null;
}
function repeatingPatternV3(patternArr) {
  if (patternArr.length < 4) return null;
  const lastThree = patternArr.slice(-3).join('');
  const lastFour = patternArr.slice(-4).join('');
  let taiFollows = 0, xiuFollows = 0, totalMatches = 0;
  for (let i = 0; i < patternArr.length - 4; i++) {
    const sliceThree = patternArr.slice(i, i + 3).join('');
    const sliceFour = patternArr.slice(i, i + 4).join('');
    let isMatch = false;
    if (lastThree === sliceThree) isMatch = true;
    else if (lastFour === sliceFour) isMatch = true;
    if (isMatch && i + 4 < patternArr.length) {
      totalMatches++;
      if (patternArr[i + 4] === 'T') taiFollows++; else xiuFollows++;
    }
  }
  if (totalMatches < 3) return null;
  if (taiFollows / totalMatches > 0.65) return 'Tài';
  if (xiuFollows / totalMatches > 0.65) return 'Xỉu';
  return null;
}
function detectBiasV3(patternArr) {
  if (patternArr.length < 5) return null;
  let taiCount = 0, xiuCount = 0;
  patternArr.forEach(r => { if (r === 'T') taiCount++; else xiuCount++; });
  const total = taiCount + xiuCount;
  if (total === 0) return null;
  const taiRatio = taiCount / total;
  const xiuRatio = xiuCount / total;
  if (taiRatio > 0.60) return 'Tài';
  if (xiuRatio > 0.60) return 'Xỉu';
  return null;
}
function predictLogic21(history) {
  if (history.length < 20) return null;
  const patternArr = history.map(s => s.result === 'Tài' ? 'T' : 'X');
  const voteCounts = { Tài: 0, Xỉu: 0 };
  let totalWeightSum = 0;
  const windows = [3, 5, 8, 12, 20, 30, 40, 60, 80];
  for (const win of windows) {
    if (patternArr.length < win) continue;
    const subPattern = patternArr.slice(0, win);
    const weight = win / 10;
    const markovRes = markovWeightedV3(subPattern.slice().reverse());
    if (markovRes) { voteCounts[markovRes] += weight * 0.7; totalWeightSum += weight * 0.7; }
    const repeatRes = repeatingPatternV3(subPattern.slice().reverse());
    if (repeatRes) { voteCounts[repeatRes] += weight * 0.15; totalWeightSum += weight * 0.15; }
    const biasRes = detectBiasV3(subPattern);
    if (biasRes) { voteCounts[biasRes] += weight * 0.15; totalWeightSum += weight * 0.15; }
  }
  if (totalWeightSum === 0) return null;
  if (voteCounts.Tài > voteCounts.Xỉu * 1.08) return 'Tài';
  if (voteCounts.Xỉu > voteCounts.Tài * 1.08) return 'Xỉu';
  return null;
}

// Logic 22
function predictLogic22(history, cauLogData) {
  if (history.length < 15) return null;
  const resultsOnly = history.map(s => s.result === 'Tài' ? 'T' : 'X');
  const totalsOnly = history.map(s => s.total);
  let taiVotes = 0, xiuVotes = 0, totalContributionWeight = 0;
  const currentStreakResult = resultsOnly[0];
  let currentStreakLength = 0;
  for (let i = 0; i < resultsOnly.length; i++) {
    if (resultsOnly[i] === currentStreakResult) currentStreakLength++; else break;
  }
  if (currentStreakLength >= 3) {
    let streakBreakCount = 0, streakContinueCount = 0;
    const streakSearchWindow = Math.min(resultsOnly.length, 200);
    for (let i = currentStreakLength; i < streakSearchWindow; i++) {
      const potentialStreak = resultsOnly.slice(i, i + currentStreakLength);
      if (potentialStreak.every(r => r === currentStreakResult)) {
        if (resultsOnly[i - 1]) {
          if (resultsOnly[i - 1] === currentStreakResult) streakContinueCount++; else streakBreakCount++;
        }
      }
    }
    const totalStreakOccurrences = streakBreakCount + streakContinueCount;
    if (totalStreakOccurrences > 5) {
      if (streakBreakCount / totalStreakOccurrences > 0.65) {
        if (currentStreakResult === 'T') xiuVotes += 1.5; else taiVotes += 1.5;
        totalContributionWeight += 1.5;
      } else if (streakContinueCount / totalStreakOccurrences > 0.65) {
        if (currentStreakResult === 'T') taiVotes += 1.5; else xiuVotes += 1.5;
        totalContributionWeight += 1.5;
      }
    }
  }
  if (history.length >= 4) {
    const lastFour = resultsOnly.slice(0, 4).join('');
    let patternMatches = 0, taiFollows = 0, xiuFollows = 0;
    const patternToMatch = lastFour.substring(0, 3);
    const searchLength = Math.min(resultsOnly.length, 150);
    for (let i = 0; i < searchLength - 3; i++) {
      const historicalPattern = resultsOnly.slice(i, i + 3).join('');
      if (historicalPattern === patternToMatch) {
        if (resultsOnly[i + 3] === 'T') taiFollows++; else xiuFollows++;
        patternMatches++;
      }
    }
    if (patternMatches > 4) {
      if (taiFollows / patternMatches > 0.70) { taiVotes += 1.2; totalContributionWeight += 1.2; }
      else if (xiuFollows / patternMatches > 0.70) { xiuVotes += 1.2; totalContributionWeight += 1.2; }
    }
  }
  if (history.length >= 2) {
    const lastTwoTotals = totalsOnly.slice(0, 2);
    const lastTwoResults = resultsOnly.slice(0, 2);
    if (lastTwoTotals.length === 2) {
      const targetPatternKey = `${lastTwoTotals[1]}-${lastTwoResults[1]}_${lastTwoTotals[0]}-${lastTwoResults[0]}`;
      let taiFollows = 0, xiuFollows = 0, totalPatternMatches = 0;
      const relevantLogs = cauLogData.filter(log => log.patterns && log.patterns.sum_sequence_patterns);
      for (const log of relevantLogs) {
        for (const pattern of log.patterns.sum_sequence_patterns) {
          if (pattern.key === targetPatternKey) {
            totalPatternMatches++;
            if (log.actual_result === 'Tài') taiFollows++; else xiuFollows++;
          }
        }
      }
      if (totalPatternMatches > 3) {
        if (taiFollows / totalPatternMatches > 0.70) { taiVotes += 1.0; totalContributionWeight += 1.0; }
        else if (xiuFollows / totalPatternMatches > 0.70) { xiuVotes += 1.0; totalContributionWeight += 1.0; }
      }
    }
  }
  if (totalContributionWeight === 0) return null;
  if (taiVotes > xiuVotes * 1.1) return 'Tài';
  if (xiuVotes > taiVotes * 1.1) return 'Xỉu';
  return null;
}

// Logic 23
function predictLogic23(history) {
  if (history.length < 5) return null;
  const totals = history.map(s => s.total);
  const allDice = history.slice(0, 10).flatMap(s => [s.d1, s.d2, s.d3]);
  const diceFreq = getDiceFrequencies(history, 10);
  const avg_total = totals.slice(0, 10).reduce((a, b) => a + b, 0) / Math.min(history.length, 10);
  const simplePredictions = [];
  if (history.length >= 2) {
    if ((totals[0] + totals[1]) % 2 === 0) simplePredictions.push('Tài'); else simplePredictions.push('Xỉu');
  }
  if (avg_total > 10.5) simplePredictions.push('Tài'); else simplePredictions.push('Xỉu');
  if (diceFreq[4] + diceFreq[5] > diceFreq[1] + diceFreq[2]) simplePredictions.push('Tài'); else simplePredictions.push('Xỉu');
  if (history.filter(s => s.total > 10).length > history.length / 2) simplePredictions.push('Tài'); else simplePredictions.push('Xỉu');
  if (history.length >= 3) {
    if (totals.slice(0, 3).reduce((a, b) => a + b, 0) > 33) simplePredictions.push('Tài'); else simplePredictions.push('Xỉu');
  }
  if (history.length >= 5) {
    if (Math.max(...totals.slice(0, 5)) > 15) simplePredictions.push('Tài'); else simplePredictions.push('Xỉu');
    if (totals.slice(0, 5).filter(t => t > 10).length >= 3) simplePredictions.push('Tài'); else simplePredictions.push('Xỉu');
  }
  if (history.length >= 3) {
    if (totals.slice(0, 3).reduce((a, b) => a + b, 0) > 34) simplePredictions.push('Tài'); else simplePredictions.push('Xỉu');
  }
  if (history.length >= 2) {
    if (totals[0] > 10 && totals[1] > 10) simplePredictions.push('Tài'); else simplePredictions.push('Xỉu');
    if (totals[0] < 10 && totals[1] < 10) simplePredictions.push('Xỉu'); else simplePredictions.push('Tài');
  }
  if (history.length >= 1) {
    if ((totals[0] + diceFreq[3]) % 2 === 0) simplePredictions.push('Tài'); else simplePredictions.push('Xỉu');
    if (diceFreq[2] > 3) simplePredictions.push('Tài'); else simplePredictions.push('Xỉu');
    if ([11, 12, 13].includes(totals[0])) simplePredictions.push('Tài'); else simplePredictions.push('Xỉu');
  }
  if (history.length >= 2) {
    if (totals[0] + totals[1] > 30) simplePredictions.push('Tài'); else simplePredictions.push('Xỉu');
  }
  if (allDice.filter(d => d > 3).length > 7) simplePredictions.push('Tài'); else simplePredictions.push('Xỉu');
  if (history.length >= 1) {
    if (totals[0] % 2 === 0) simplePredictions.push('Tài'); else simplePredictions.push('Xỉu');
  }
  if (allDice.filter(d => d > 3).length > 8) simplePredictions.push('Tài'); else simplePredictions.push('Xỉu');
  if (history.length >= 3) {
    if (totals.slice(0, 3).reduce((a, b) => a + b, 0) % 4 === 0) simplePredictions.push('Tài'); else simplePredictions.push('Xỉu');
    if (totals.slice(0, 3).reduce((a, b) => a + b, 0) % 3 === 0) simplePredictions.push('Tài'); else simplePredictions.push('Xỉu');
  }
  if (history.length >= 1) {
    if (totals[0] % 3 === 0) simplePredictions.push('Tài'); else simplePredictions.push('Xỉu');
    if (totals[0] % 5 === 0) simplePredictions.push('Tài'); else simplePredictions.push('Xỉu');
    if (totals[0] % 4 === 0) simplePredictions.push('Tài'); else simplePredictions.push('Xỉu');
  }
  if (diceFreq[4] > 2) simplePredictions.push('Tài'); else simplePredictions.push('Xỉu');
  let taiVotes = 0, xiuVotes = 0;
  simplePredictions.forEach(p => { if (p === 'Tài') taiVotes++; else if (p === 'Xỉu') xiuVotes++; });
  if (taiVotes > xiuVotes * 1.5) return 'Tài';
  if (xiuVotes > taiVotes * 1.5) return 'Xỉu';
  return null;
}

// Logic 24
const PATTERN_DATA = {
  'ttxttx': { tai: 80, xiu: 20 }, 'xxttxx': { tai: 25, xiu: 75 },
  'ttxxtt': { tai: 75, xiu: 25 }, 'txtxt': { tai: 60, xiu: 40 },
  'xtxtx': { tai: 40, xiu: 60 }, 'ttx': { tai: 70, xiu: 30 },
  'xxt': { tai: 30, xiu: 70 }, 'txt': { tai: 65, xiu: 35 },
  'xtx': { tai: 35, xiu: 65 }, 'tttt': { tai: 85, xiu: 15 },
  'xxxx': { tai: 15, xiu: 85 }, 'ttttt': { tai: 88, xiu: 12 },
  'xxxxx': { tai: 12, xiu: 88 }, 'tttttt': { tai: 92, xiu: 8 },
  'xxxxxx': { tai: 8, xiu: 92 }, 'tttx': { tai: 75, xiu: 25 },
  'xxxt': { tai: 25, xiu: 75 }, 'ttxtx': { tai: 78, xiu: 22 },
  'xxtxt': { tai: 22, xiu: 78 }, 'txtxtx': { tai: 82, xiu: 18 },
  'xtxtxt': { tai: 18, xiu: 82 }, 'ttxtxt': { tai: 85, xiu: 15 },
  'xxtxtx': { tai: 15, xiu: 85 }, 'txtxxt': { tai: 83, xiu: 17 },
  'xtxttx': { tai: 17, xiu: 83 }, 'ttttttt': { tai: 95, xiu: 5 },
  'xxxxxxx': { tai: 5, xiu: 95 }, 'tttttttt': { tai: 97, xiu: 3 },
  'xxxxxxxx': { tai: 3, xiu: 97 }, 'txtx': { tai: 60, xiu: 40 },
  'xtxt': { tai: 40, xiu: 60 }, 'txtxt': { tai: 65, xiu: 35 },
  'xtxtx': { tai: 35, xiu: 65 }, 'txtxtxt': { tai: 70, xiu: 30 },
  'xtxtxtx': { tai: 30, xiu: 70 }
};
function analyzePatterns(lastResults) {
  if (!lastResults || lastResults.length === 0) return [null, 'Không có dữ liệu'];
  const resultsShort = lastResults.map(r => r === 'Tài' ? 'T' : 'X');
  const displayLength = Math.min(resultsShort.length, 10);
  const recentSequence = resultsShort.slice(0, displayLength).join('');
  return [null, `: ${recentSequence}`];
}
function predictLogic24(history) {
  if (!history || history.length < 5) return null;
  const lastResults = history.map(s => s.result);
  const totals = history.map(s => s.total);
  const allDice = history.flatMap(s => [s.d1, s.d2, s.d3]);
  const diceFreq = new Array(7).fill(0);
  allDice.forEach(d => { if (d >= 1 && d <= 6) diceFreq[d]++; });
  const avg_total = totals.slice(0, 10).reduce((a, b) => a + b, 0) / Math.min(history.length, 10);
  const votes = [];
  if (history.length >= 2) {
    if ((totals[0] + totals[1]) % 2 === 0) votes.push('Tài'); else votes.push('Xỉu');
  }
  if (avg_total > 10.5) votes.push('Tài'); else votes.push('Xỉu');
  if (diceFreq[4] + diceFreq[5] > diceFreq[1] + diceFreq[2]) votes.push('Tài'); else votes.push('Xỉu');
  if (history.filter(s => s.total > 10).length > history.length / 2) votes.push('Tài'); else votes.push('Xỉu');
  if (history.length >= 3) {
    if (totals.slice(0, 3).reduce((a, b) => a + b, 0) > 33) votes.push('Tài'); else votes.push('Xỉu');
  }
  if (history.length >= 5) {
    if (Math.max(...totals.slice(0, 5)) > 15) votes.push('Tài'); else votes.push('Xỉu');
  }
  const patternSeq = lastResults.slice(0, 3).reverse().map(r => r === 'Tài' ? 't' : 'x').join('');
  if (PATTERN_DATA[patternSeq]) {
    const prob = PATTERN_DATA[patternSeq];
    if (prob.tai > prob.xiu + 15) votes.push('Tài');
    else if (prob.xiu > prob.tai + 15) votes.push('Xỉu');
  }
  const [patternPred, patternDesc] = analyzePatterns(lastResults);
  if (patternPred) votes.push(patternPred);
  const taiCount = votes.filter(v => v === 'Tài').length;
  const xiuCount = votes.filter(v => v === 'Xỉu').length;
  if (taiCount + xiuCount < 4) return null;
  if (taiCount >= xiuCount + 3) return 'Tài';
  if (xiuCount >= taiCount + 3) return 'Xỉu';
  return null;
}

// Logic 25
async function predictLogic25(history, cauLogData) {
  if (history.length < 20) return null;
  const currentPattern = history.slice(0, 10).map(s => s.result === 'Tài' ? 'T' : 'X').join('');
  const recentLogs = cauLogData.slice(-500);
  let taiCount = 0, xiuCount = 0;
  for (const log of recentLogs) {
    if (log.patterns && log.patterns.last10 === currentPattern) {
      if (log.actual_result === 'Tài') taiCount++;
      else if (log.actual_result === 'Xỉu') xiuCount++;
    }
  }
  const total = taiCount + xiuCount;
  if (total < 5) return null;
  const taiRatio = taiCount / total;
  const xiuRatio = xiuCount / total;
  if (taiRatio >= 0.65) return 'Tài';
  if (xiuRatio >= 0.65) return 'Xỉu';
  return null;
}

// ==================== MLPredictor Class ====================
class MLPredictor {
  constructor() {
    this.model = null;
    this.scaler = { mean: null, std: null };
    this.predictedFeatures = new Map(); // sid -> features
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
      if (!call.fn) {
        results.push(0.5);
        continue;
      }
      try {
        let pred;
        if (call.fn.constructor.name === 'AsyncFunction') {
          pred = await call.fn(...call.args);
        } else {
          pred = call.fn(...call.args);
        }
        results.push(pred === 'Tài' ? 1 : (pred === 'Xỉu' ? 0 : 0.5));
      } catch (e) {
        results.push(0.5);
      }
    }
    return results;
  }

  async extractFeatures(history, cauLogData) {
    if (history.length < 10) return null;

    const features = [];

    // 1. Kết quả 25 logic cũ (25 features)
    const logicResults = await this.predictAllLogics(history, cauLogData);
    features.push(...logicResults);

    // 2. Streak hiện tại (có dấu)
    let streak = 0;
    const lastResult = history[0].result;
    for (let i = 0; i < history.length; i++) {
      if (history[i].result === lastResult) streak++;
      else break;
    }
    features.push(lastResult === 'Tài' ? streak : -streak);

    // 3. Trung bình tổng 5 phiên gần nhất
    const avg5 = history.slice(0, 5).reduce((a, s) => a + s.total, 0) / 5;
    features.push(avg5);

    // 4. Độ lệch chuẩn tổng 10 phiên gần nhất
    const totals10 = history.slice(0, 10).map(s => s.total);
    const mean10 = totals10.reduce((a, b) => a + b, 0) / 10;
    const std10 = Math.sqrt(totals10.reduce((a, b) => a + (b - mean10) ** 2, 0) / 10);
    features.push(std10);

    // 5. Tần suất từng mặt xúc xắc trong 20 phiên gần nhất (6 features)
    const diceFreq = new Array(7).fill(0);
    history.slice(0, 20).forEach(s => {
      diceFreq[s.d1]++;
      diceFreq[s.d2]++;
      diceFreq[s.d3]++;
    });
    const totalDice = Math.min(history.length, 20) * 3;
    for (let i = 1; i <= 6; i++) {
      features.push(diceFreq[i] / totalDice);
    }

    // 6. Tỷ lệ Tài trong 20 phiên gần nhất
    const taiCount20 = history.slice(0, 20).filter(s => s.result === 'Tài').length;
    features.push(taiCount20 / Math.min(history.length, 20));

    // 7. Pattern 5 phiên gần nhất (5 bit)
    for (let i = 0; i < 5; i++) {
      if (i < history.length) {
        features.push(history[i].result === 'Tài' ? 1 : 0);
      } else {
        features.push(0.5);
      }
    }

    // 8. Tổng điểm phiên cuối
    features.push(history[0].total);

    // 9. Parity tổng điểm phiên cuối
    features.push(history[0].total % 2 === 0 ? 1 : 0);

    // 10. Giá trị từng xúc xắc phiên cuối (3 features)
    features.push(history[0].d1, history[0].d2, history[0].d3);

    // 11. Trung bình tổng 3 phiên gần nhất
    const avg3 = history.slice(0, 3).reduce((a, s) => a + s.total, 0) / 3;
    features.push(avg3);

    // 12. Độ lệch chuẩn 5 phiên gần nhất
    const totals5 = history.slice(0, 5).map(s => s.total);
    const mean5 = totals5.reduce((a, b) => a + b, 0) / 5;
    const std5 = Math.sqrt(totals5.reduce((a, b) => a + (b - mean5) ** 2, 0) / 5);
    features.push(std5);

    return features;
  }

  buildModel(inputDim) {
    const model = tf.sequential();
    model.add(tf.layers.dense({ units: 64, activation: 'relu', inputShape: [inputDim] }));
    model.add(tf.layers.dropout({ rate: 0.3 }));
    model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
    model.add(tf.layers.dropout({ rate: 0.2 }));
    model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));
    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'binaryCrossentropy',
      metrics: ['accuracy']
    });
    return model;
  }

  calculateMeanStd(data) {
    const dim = data[0].length;
    const sum = new Array(dim).fill(0);
    const sumSq = new Array(dim).fill(0);
    data.forEach(row => {
      row.forEach((v, i) => {
        sum[i] += v;
        sumSq[i] += v * v;
      });
    });
    const n = data.length;
    const mean = sum.map(s => s / n);
    const std = mean.map((m, i) => Math.sqrt((sumSq[i] / n) - m * m));
    return { mean, std };
  }

  async trainOffline(allSessions) {
    const X = [];
    const y = [];
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

    if (X.length < 100) {
      console.log('Not enough training samples:', X.length);
      return false;
    }

    const { mean, std } = this.calculateMeanStd(X);
    this.scaler = { mean, std };
    const Xnorm = X.map(row => row.map((v, i) => (v - mean[i]) / (std[i] || 1)));

    const inputDim = X[0].length;
    this.model = this.buildModel(inputDim);

    const xs = tf.tensor2d(Xnorm);
    const ys = tf.tensor2d(y, [y.length, 1]);

    await this.model.fit(xs, ys, {
      epochs: 50,
      batchSize: 32,
      validationSplit: 0.2,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          console.log(`Epoch ${epoch}: loss = ${logs.loss.toFixed(4)}, acc = ${logs.acc.toFixed(4)}`);
        }
      }
    });

    xs.dispose();
    ys.dispose();
    return true;
  }

  async predict(history, cauLogData) {
    if (!this.model) throw new Error('Model not trained');
    const features = await this.extractFeatures(history, cauLogData);
    if (!features) return null;
    const featuresNorm = features.map((v, i) => (v - this.scaler.mean[i]) / (this.scaler.std[i] || 1));
    const input = tf.tensor2d([featuresNorm]);
    const output = this.model.predict(input);
    const prob = (await output.data())[0];
    input.dispose();
    output.dispose();
    return {
      prediction: prob > 0.5 ? 'Tài' : 'Xỉu',
      probability: prob,
      features
    };
  }

  async updateOnline(features, actualResult) {
    if (!this.model) return;
    const featuresNorm = features.map((v, i) => (v - this.scaler.mean[i]) / (this.scaler.std[i] || 1));
    const xs = tf.tensor2d([featuresNorm]);
    const ys = tf.tensor2d([[actualResult === 'Tài' ? 1 : 0]]);
    await this.model.fit(xs, ys, {
      epochs: 1,
      batchSize: 1,
      verbose: 0
    });
    xs.dispose();
    ys.dispose();
  }

  async saveModel(path) {
    await this.model.save(`file://${path}`);
    const fs = require('fs').promises;
    await fs.writeFile(`${path}/scaler.json`, JSON.stringify(this.scaler));
  }

  async loadModel(path) {
    this.model = await tf.loadLayersModel(`file://${path}/model.json`);
    const fs = require('fs').promises;
    const scalerData = await fs.readFile(`${path}/scaler.json`, 'utf8');
    this.scaler = JSON.parse(scalerData);
  }
}

// ==================== WebSocket và broadcast ====================
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
  } catch (err) {
    console.error('Lỗi gửi history:', err);
  }
}

// WebSocket Sunwin
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

            // Cập nhật predictions
            const predRow = await dbGet(`SELECT prediction, features FROM predictions WHERE sid = ?`, [newItem.sid]);
            if (predRow) {
              const status = (predRow.prediction === result) ? 'win' : 'lose';
              await dbRun(`UPDATE predictions SET actual = ?, status = ? WHERE sid = ?`, [result, status, newItem.sid]);
              // Online learning nếu có features
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
                logCauPattern({ sid_before: newItem.sid, actual_result: result, patterns, timestamp: Date.now() });
              }
            }
            broadcastPrediction(); // Gửi dự đoán mới
          }
        }
      }
    } catch (e) {
      console.error('Lỗi xử lý message Sunwin:', e);
    }
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

// Khởi tạo ML Predictor
const mlPredictor = new MLPredictor();
let modelReady = false;

async function initModel() {
  try {
    await mlPredictor.loadModel('./model');
    modelReady = true;
    console.log('Loaded ML model from disk.');
  } catch (err) {
    console.log('No saved model found, training offline...');
    try {
      const rows = await dbAll(`SELECT sid, d1, d2, d3, total, result, timestamp FROM sessions ORDER BY sid ASC`);
      if (rows.length >= 200) {
        const success = await mlPredictor.trainOffline(rows);
        if (success) {
          modelReady = true;
          await mlPredictor.saveModel('./model');
          console.log('Model trained and saved.');
        } else {
          console.error('Training failed, not enough samples.');
        }
      } else {
        console.log('Not enough historical data, using fallback logic.');
      }
    } catch (e) {
      console.error('Error during offline training:', e);
    }
  }
}

// Broadcast prediction (sửa để dùng ML)
async function broadcastPrediction() {
  try {
    const rows = await dbAll(`SELECT sid, d1, d2, d3, total, result, timestamp FROM sessions ORDER BY sid DESC LIMIT 1000`);
    const history = rows.filter(item =>
      item.d1 && item.d2 && item.d3 && item.d1 >= 1 && item.d1 <= 6 && item.d2 >= 1 && item.d2 <= 6 && item.d3 >= 1 && item.d3 <= 6 && item.total >= 3 && item.total <= 18
    );

    const currentTimestamp = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });

    if (history.length < 5) {
      const msg = {
        Phien: null, Ket_qua: null, Xuc_xac_1: null, Xuc_xac_2: null, Xuc_xac_3: null,
        phien_hien_tai: null, du_doan: null, do_tin_cay: '0',
        cau_hien_tai: 'Chưa đủ dữ liệu', cau_10_phien: '',
        ly_do: {}, suggested_bet: 0,
        ngay: currentTimestamp, Id: '@nhutquangdz'
      };
      connectedClients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(msg)); });
      return;
    }

    const lastSession = history[0];
    const nextSessionId = lastSession.sid + 1;
    let finalPrediction, overallConfidence, lyDo, featuresForUpdate = null;

    if (modelReady) {
      const cauLogData = await readCauLog();
      const result = await mlPredictor.predict(history, cauLogData);
      if (result) {
        finalPrediction = result.prediction;
        const prob = result.probability;
        overallConfidence = (prob * 100).toFixed(2);
        featuresForUpdate = result.features;
        lyDo = {
          ket_luan: 'ML model',
          probability: prob,
          note: 'Neural network với 25 logic + features'
        };
        mlPredictor.predictedFeatures.set(nextSessionId, featuresForUpdate);
      } else {
        // fallback nếu không trích xuất được features
        finalPrediction = lastSession.result;
        overallConfidence = '50';
        lyDo = { ket_luan: 'Fallback (không đủ features)' };
      }
    } else {
      // Dùng logic cũ làm fallback
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

    const cau10Phien = history.slice(0, 10).map(s => s.result === 'Tài' ? 'T' : 'X').join('');
    const [_, patternDesc] = analyzePatterns(history.map(i => i.result));
    const detectedPatternString = patternDesc;

    // Gợi ý cược dựa trên confidence
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
      Id: '@nhutquangdz'
    };

    await dbRun(`INSERT INTO predictions (sid, prediction, confidence, cau_hien_tai, ly_do, features, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [nextSessionId, finalPrediction, parseFloat(overallConfidence), cau10Phien, JSON.stringify(lyDo), featuresForUpdate ? JSON.stringify(featuresForUpdate) : null, Date.now()]);

    connectedClients.forEach(c => {
      if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(predictionMessage));
    });

    console.log(`\n--- Broadcasted ${nextSessionId}: ${finalPrediction} (${overallConfidence}%) ---`);
  } catch (err) {
    console.error('Lỗi broadcastPrediction:', err);
  }
}

// --- WebSocket API cho client ---
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

// --- API /api/his ---
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
  } catch (err) {
    reply.status(500).send({ error: err.message });
  }
});

// --- API /api/history-json ---
fastify.get('/api/history-json', async (request, reply) => {
  try {
    const rows = await dbAll(`SELECT sid, d1, d2, d3, total, result, timestamp FROM sessions ORDER BY sid ASC`);
    reply.send(rows);
  } catch (err) {
    reply.status(500).send('Lỗi xuất dữ liệu');
  }
});

// --- API /api/analysis ---
fastify.get('/api/analysis', async (request, reply) => {
  try {
    const rows = await dbAll(`SELECT sid, d1, d2, d3, total, result, timestamp FROM sessions ORDER BY sid DESC LIMIT 100`);
    const history = rows.filter(r => r.d1 && r.d2 && r.d3);
    if (history.length < 10) {
      reply.send({ warning: 'Chưa đủ dữ liệu phân tích' });
      return;
    }
    const results = history.map(s => s.result);
    const totals = history.map(s => s.total);
    const taiCount = results.filter(r => r === 'Tài').length;
    const xiuCount = results.length - taiCount;
    const volatility = calculateStdDev(totals.slice(0, 30));
    let streakLength = 1;
    for (let i = 1; i < results.length; i++) {
      if (results[i] === results[0]) streakLength++;
      else break;
    }
    const streak = { result: results[0], length: streakLength };
    // deception detection đơn giản
    const deception = { isDeceptive: false, reason: 'Bình thường' };
    const analysis = {
      tong_phien: history.length,
      ti_le_tai: (taiCount / history.length * 100).toFixed(2) + '%',
      ti_le_xiu: (xiuCount / history.length * 100).toFixed(2) + '%',
      streak_hien_tai: streak,
      do_bien_dong: volatility.toFixed(2),
      canh_bao: deception,
      thoi_gian: new Date().toISOString()
    };
    reply.send(analysis);
  } catch (err) {
    reply.status(500).send({ error: err.message });
  }
});

// --- Khởi động server ---
const start = async () => {
  // Khởi tạo model sau khi DB ready
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
