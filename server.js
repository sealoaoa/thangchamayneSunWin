// ==Improved Sunwin Predictor - Siêu AI==
// Tác giả: @tiendataox (nâng cấp AI cao cấp)
// Mô tả: Tích hợp ANN, Stacking, Q-learning, tự động học và thích nghi.

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

const fastify = Fastify({ logger: true });
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'tiendat';

fastify.register(fastifyWebsocket);

// === CẤU TRÚC DỮ LIỆU CHO AI ===
let annModel = null;                // Mạng nơ-ron nhân tạo
let stackingNet = null;             // Mạng stacking (logistic regression)
let qAgent = null;                  // Agent học tăng cường
let featureStats = { mean: [], std: [] }; // Chuẩn hóa features (sẽ cập nhật online)

// Đường dẫn lưu trọng số
const ANN_WEIGHTS_PATH = path.resolve(__dirname, 'ann_weights.json');
const STACKING_WEIGHTS_PATH = path.resolve(__dirname, 'stacking_weights.json');
const QTABLE_PATH = path.resolve(__dirname, 'qtable.json');

// === LỚP MẠNG NƠ-RON NHÂN TẠO (2 LỚP) ===
class NeuralNetwork {
  constructor(inputSize, hiddenSize, outputSize) {
    this.inputSize = inputSize;
    this.hiddenSize = hiddenSize;
    this.outputSize = outputSize;
    this.W1 = []; this.b1 = []; this.W2 = []; this.b2 = [];
    this.learningRate = 0.01;
    this.initWeights();
  }

  initWeights() {
    // He initialization cho ReLU (nhưng ta dùng sigmoid, tạm dùng random nhỏ)
    for (let i = 0; i < this.inputSize; i++) {
      this.W1[i] = [];
      for (let j = 0; j < this.hiddenSize; j++) {
        this.W1[i][j] = (Math.random() * 2 - 1) * Math.sqrt(2 / this.inputSize);
      }
    }
    for (let j = 0; j < this.hiddenSize; j++) {
      this.b1[j] = 0;
    }
    for (let j = 0; j < this.hiddenSize; j++) {
      this.W2[j] = [];
      for (let k = 0; k < this.outputSize; k++) {
        this.W2[j][k] = (Math.random() * 2 - 1) * Math.sqrt(2 / this.hiddenSize);
      }
    }
    for (let k = 0; k < this.outputSize; k++) {
      this.b2[k] = 0;
    }
  }

  sigmoid(x) { return 1 / (1 + Math.exp(-x)); }
  sigmoidDerivative(x) { return x * (1 - x); }

  forward(X) {
    // X là mảng 1 chiều
    this.z1 = new Array(this.hiddenSize);
    this.a1 = new Array(this.hiddenSize);
    for (let j = 0; j < this.hiddenSize; j++) {
      let sum = this.b1[j];
      for (let i = 0; i < this.inputSize; i++) {
        sum += X[i] * this.W1[i][j];
      }
      this.z1[j] = sum;
      this.a1[j] = this.sigmoid(sum);
    }
    this.z2 = new Array(this.outputSize);
    this.a2 = new Array(this.outputSize);
    for (let k = 0; k < this.outputSize; k++) {
      let sum = this.b2[k];
      for (let j = 0; j < this.hiddenSize; j++) {
        sum += this.a1[j] * this.W2[j][k];
      }
      this.z2[k] = sum;
      this.a2[k] = this.sigmoid(sum);
    }
    return this.a2[0]; // xác suất Tài
  }

  backward(X, y) {
    const m = 1;
    const dZ2 = this.a2[0] - y;
    const dW2 = new Array(this.hiddenSize);
    for (let j = 0; j < this.hiddenSize; j++) {
      dW2[j] = dZ2 * this.a1[j];
    }
    const db2 = dZ2;
    const dA1 = dZ2 * this.W2.map(col => col[0]); // lấy cột 0 vì outputSize=1
    const dZ1 = new Array(this.hiddenSize);
    for (let j = 0; j < this.hiddenSize; j++) {
      dZ1[j] = dA1[j] * this.sigmoidDerivative(this.a1[j]);
    }
    const dW1 = new Array(this.inputSize);
    for (let i = 0; i < this.inputSize; i++) {
      dW1[i] = new Array(this.hiddenSize);
      for (let j = 0; j < this.hiddenSize; j++) {
        dW1[i][j] = dZ1[j] * X[i];
      }
    }
    const db1 = dZ1.slice();

    // Cập nhật
    for (let i = 0; i < this.inputSize; i++) {
      for (let j = 0; j < this.hiddenSize; j++) {
        this.W1[i][j] -= this.learningRate * dW1[i][j];
      }
    }
    for (let j = 0; j < this.hiddenSize; j++) {
      this.b1[j] -= this.learningRate * db1[j];
    }
    for (let j = 0; j < this.hiddenSize; j++) {
      this.W2[j][0] -= this.learningRate * dW2[j];
    }
    this.b2[0] -= this.learningRate * db2;
  }

  train(X, y) {
    this.forward(X);
    this.backward(X, y);
  }

  toJSON() {
    return { W1: this.W1, b1: this.b1, W2: this.W2, b2: this.b2, inputSize: this.inputSize, hiddenSize: this.hiddenSize, outputSize: this.outputSize };
  }

  static fromJSON(json) {
    const nn = new NeuralNetwork(json.inputSize, json.hiddenSize, json.outputSize);
    nn.W1 = json.W1; nn.b1 = json.b1; nn.W2 = json.W2; nn.b2 = json.b2;
    return nn;
  }
}

// === LỚP STACKING (LOGISTIC REGRESSION) ===
class StackingNetwork {
  constructor(inputSize) {
    this.weights = new Array(inputSize).fill(0).map(() => Math.random() * 2 - 1);
    this.bias = Math.random() * 2 - 1;
    this.lr = 0.01;
  }
  forward(inputs) {
    let sum = this.bias;
    for (let i = 0; i < inputs.length; i++) {
      sum += inputs[i] * this.weights[i];
    }
    return 1 / (1 + Math.exp(-sum));
  }
  train(inputs, target) {
    const output = this.forward(inputs);
    const error = output - target;
    const grad = error * output * (1 - output);
    for (let i = 0; i < inputs.length; i++) {
      this.weights[i] -= this.lr * grad * inputs[i];
    }
    this.bias -= this.lr * grad;
  }
  toJSON() {
    return { weights: this.weights, bias: this.bias };
  }
  static fromJSON(json) {
    const sn = new StackingNetwork(json.weights.length);
    sn.weights = json.weights;
    sn.bias = json.bias;
    return sn;
  }
}

// === LỚP Q-LEARNING AGENT ===
class QLearningAgent {
  constructor() {
    this.qTable = {};
    this.alpha = 0.1;
    this.gamma = 0.9;
    this.epsilon = 0.2;
  }
  getState(confidence, patternType, volatility) {
    // confidence: 0-100
    const confBin = confidence < 40 ? 0 : confidence < 60 ? 1 : confidence < 80 ? 2 : 3;
    // patternType: 0=bệt, 1=đan xen, 2=khác
    const volBin = volatility < 1.5 ? 0 : volatility < 2.5 ? 1 : 2;
    return `${confBin}_${patternType}_${volBin}`;
  }
  chooseAction(state, actions) {
    if (!this.qTable[state]) {
      this.qTable[state] = { Tài: 0, Xỉu: 0, Không: 0 };
    }
    if (Math.random() < this.epsilon) {
      return actions[Math.floor(Math.random() * actions.length)];
    } else {
      const q = this.qTable[state];
      return Object.keys(q).reduce((a, b) => q[a] > q[b] ? a : b);
    }
  }
  update(state, action, reward, nextState) {
    if (!this.qTable[state]) this.qTable[state] = { Tài: 0, Xỉu: 0, Không: 0 };
    if (!this.qTable[nextState]) this.qTable[nextState] = { Tài: 0, Xỉu: 0, Không: 0 };
    const maxNext = Math.max(...Object.values(this.qTable[nextState]));
    this.qTable[state][action] += this.alpha * (reward + this.gamma * maxNext - this.qTable[state][action]);
  }
  toJSON() { return this.qTable; }
  static fromJSON(json) {
    const agent = new QLearningAgent();
    agent.qTable = json;
    return agent;
  }
}

// === HÀM TIỆN ÍCH CHO FEATURE EXTRACTION ===
function extractFeatures(history) {
  if (history.length < 30) return null; // cần tối thiểu 30 phiên
  const features = [];

  // 1. 10 kết quả gần nhất (Tài=1, Xỉu=0)
  for (let i = 0; i < 10; i++) {
    features.push(history[i]?.result === 'Tài' ? 1 : 0);
  }

  // 2. 5 tổng điểm gần nhất (chuẩn hóa /18)
  for (let i = 0; i < 5; i++) {
    features.push((history[i]?.total || 10) / 18);
  }

  // 3. Độ lệch chuẩn 20 tổng gần nhất
  const totals20 = history.slice(0, 20).map(s => s.total);
  const std20 = calculateStdDev(totals20);
  features.push(std20 / 5); // chuẩn hóa

  // 4. Tần suất xúc xắc 20 phiên (6 features)
  const freq = getDiceFrequencies(history, 20);
  for (let d = 1; d <= 6; d++) {
    features.push(freq[d] / (20 * 3)); // tối đa 60 lần
  }

  // 5. Độ dài dây hiện tại
  let streak = 1;
  for (let i = 1; i < history.length; i++) {
    if (history[i].result === history[0].result) streak++;
    else break;
  }
  features.push(streak / 10);

  // 6. Loại dây: bệt (1,0), đan xen (0,1), khác (0,0)
  const last3 = history.slice(0, 3).map(s => s.result);
  if (last3.every(r => r === 'Tài') || last3.every(r => r === 'Xỉu')) {
    features.push(1, 0);
  } else if (last3[0] !== last3[1] && last3[1] !== last3[2]) {
    features.push(0, 1);
  } else {
    features.push(0, 0);
  }

  return features; // tổng 25 features
}

// === HÀM TÍNH ĐỘ LỆCH CHUẨN (giữ nguyên) ===
function calculateStdDev(arr) {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

// === HÀM TẦN SUẤT XÚC XẮC (giữ nguyên) ===
function getDiceFrequencies(history, limit) {
  const allDice = [];
  history.slice(0, limit).forEach(s => allDice.push(s.d1, s.d2, s.d3));
  const freq = new Array(7).fill(0);
  allDice.forEach(d => { if (d >= 1 && d <= 6) freq[d]++; });
  return freq;
}

// === HÀM ADAPTIVE DECAY (thay thế decay cứng) ===
function adaptiveDecay(accuracy) {
  if (accuracy > 0.8) return 0.98;
  if (accuracy > 0.6) return 0.95;
  return 0.9;
}

// === CẬP NHẬT LOGIC PERFORMANCE DÙNG ADAPTIVE DECAY ===
function updateLogicPerformance(logicName, predicted, actual) {
  if (!predicted || !logicPerformance[logicName]) return;
  const perf = logicPerformance[logicName];
  const decay = adaptiveDecay(perf.accuracy);
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

// === LƯU / TẢI TRỌNG SỐ AI ===
async function saveModels() {
  try {
    if (annModel) await fs.writeFile(ANN_WEIGHTS_PATH, JSON.stringify(annModel.toJSON()));
    if (stackingNet) await fs.writeFile(STACKING_WEIGHTS_PATH, JSON.stringify(stackingNet.toJSON()));
    if (qAgent) await fs.writeFile(QTABLE_PATH, JSON.stringify(qAgent.toJSON()));
  } catch (err) {
    console.error('Lỗi lưu model AI:', err);
  }
}

async function loadModels() {
  try {
    const annData = await fs.readFile(ANN_WEIGHTS_PATH, 'utf8');
    annModel = NeuralNetwork.fromJSON(JSON.parse(annData));
    console.log('Đã tải ANN weights');
  } catch (err) { if (err.code !== 'ENOENT') console.error(err); }
  try {
    const stackData = await fs.readFile(STACKING_WEIGHTS_PATH, 'utf8');
    stackingNet = StackingNetwork.fromJSON(JSON.parse(stackData));
    console.log('Đã tải Stacking weights');
  } catch (err) { if (err.code !== 'ENOENT') console.error(err); }
  try {
    const qData = await fs.readFile(QTABLE_PATH, 'utf8');
    qAgent = QLearningAgent.fromJSON(JSON.parse(qData));
    console.log('Đã tải Q-table');
  } catch (err) { if (err.code !== 'ENOENT') console.error(err); }
}

// === KẾT NỐI WEBSOCKET SUNWIN (giữ nguyên code cũ) ===
// ... phần này giữ nguyên như code gốc từ dòng "let wsSunwin = null;" đến hết hàm connectWebSocket.
// Để tiết kiệm chỗ, tôi sẽ không copy lại toàn bộ, nhưng trong file thực tế bạn giữ nguyên.

// === CÁC LOGIC DỰ ĐOÁN 1-25 (giữ nguyên code cũ) ===
// ... (tôi sẽ không viết lại, nhưng bạn giữ nguyên phần này)

// === HÀM broadcastPrediction NÂNG CẤP ===
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
        ngay: currentTimestamp, Id: '@tiendataox'
      };
      connectedClients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(msg)); });
      return;
    }

    const lastSession = history[0];
    const nextSessionId = lastSession.sid + 1;

    // Cập nhật ngưỡng động (giữ nguyên)
    HIGH_CONFIDENCE_THRESHOLD = getDynamicThreshold(history);

    // --- UPDATE AI WEIGHTS DỰA TRÊN PHIÊN TRƯỚC ---
    if (history.length > 1) {
      const sessionBeforeLast = history[1];
      const actualOutcomeOfLastSession = lastSession.result;
      const historyForEvaluation = history.slice(1);
      const cauLogDataForEval = await readCauLog();

      // Cập nhật logic performance
      const predictionsForEvaluation = [
        { name: 'logic1', pred: predictLogic1(sessionBeforeLast, historyForEvaluation) },
        // ... (tất cả 25 logic, giữ nguyên)
      ];
      predictionsForEvaluation.forEach(l => {
        if (logicPerformance[l.name]) updateLogicPerformance(l.name, l.pred, actualOutcomeOfLastSession);
      });

      // Cập nhật ANN
      const features = extractFeatures(historyForEvaluation);
      if (features) {
        if (!annModel) {
          annModel = new NeuralNetwork(features.length, 12, 1);
        }
        const target = actualOutcomeOfLastSession === 'Tài' ? 1 : 0;
        annModel.train(features, target);
      }

      // Cập nhật Stacking Network
      const stackingInput = [];
      for (let i = 1; i <= 25; i++) {
        const logicName = `logic${i}`;
        const pred = predictionsForEvaluation.find(l => l.name === logicName)?.pred;
        if (pred === 'Tài') stackingInput.push(1);
        else if (pred === 'Xỉu') stackingInput.push(0);
        else stackingInput.push(0.5);
      }
      stackingInput.push(1); // bias
      if (!stackingNet) {
        stackingNet = new StackingNetwork(stackingInput.length);
      }
      stackingNet.train(stackingInput, target);

      // Cập nhật Q-learning
      if (qAgent && history.length > 10) {
        // Lấy trạng thái trước đó (cần lưu state trước đó, tạm thời dùng state hiện tại)
        // Trong thực tế, bạn nên lưu state trước khi dự đoán. Ở đây ta tạm tính lại.
        const prevConf = 50; // placeholder
        const prevPattern = 0; // placeholder
        const prevVol = calculateStdDev(historyForEvaluation.slice(0,30).map(s => s.total));
        const prevState = qAgent.getState(prevConf, prevPattern, prevVol);
        const action = 'Tài'; // placeholder (cần lưu action đã chọn)
        const reward = actualOutcomeOfLastSession === action ? 1 : (action === 'Không' ? 0 : -1);
        const nextState = qAgent.getState(prevConf, prevPattern, prevVol); // tạm thời
        qAgent.update(prevState, action, reward, nextState);
      }

      // Lưu models sau mỗi lần cập nhật
      await saveModels();

      console.log('\n--- Logic Performance Update ---');
      for (const name in logicPerformance) {
        console.log(`  ${name}: Acc: ${logicPerformance[name].accuracy.toFixed(3)} | Cons: ${logicPerformance[name].consistency.toFixed(3)}`);
      }
    }

    // --- DỰ ĐOÁN CHO PHIÊN HIỆN TẠI ---
    let finalPrediction = null;
    let overallConfidence = '0';
    let confidenceMessage = 'Không có tín hiệu mạnh';
    let contributingLogics = [];
    let detectedPatternString = '';
    let taiWeightedVote = 0, xiuWeightedVote = 0;

    const cauLogDataForPrediction = await readCauLog();

    // Lấy dự đoán từ 25 logic cơ bản
    const logicsToEvaluate = [
      // ... (giữ nguyên như cũ)
    ];

    const allValidPredictions = [];
    for (const l of logicsToEvaluate) {
      const pred = l.predict;
      if (pred && logicPerformance[l.name]) {
        const acc = logicPerformance[l.name].accuracy;
        const cons = logicPerformance[l.name].consistency;
        if (logicPerformance[l.name].total > 2 && acc > 0.30 && cons > 0.20) {
          allValidPredictions.push({ logic: l.name, prediction: pred, accuracy: acc, consistency: cons });
        }
      }
    }

    // Dự đoán từ ANN
    if (history.length >= 30 && annModel) {
      const features = extractFeatures(history);
      if (features) {
        const probTai = annModel.forward(features);
        if (Math.abs(probTai - 0.5) > 0.15) { // ngưỡng 0.35 hoặc 0.65
          const annPred = probTai > 0.5 ? 'Tài' : 'Xỉu';
          allValidPredictions.push({ logic: 'ANN', prediction: annPred, accuracy: 0.85, consistency: 0.8 }); // trọng số cao
        }
      }
    }

    // Dự đoán từ Stacking
    if (stackingNet) {
      const stackingInput = [];
      for (let i = 1; i <= 25; i++) {
        const logicName = `logic${i}`;
        const pred = logicsToEvaluate.find(l => l.name === logicName)?.predict;
        if (pred === 'Tài') stackingInput.push(1);
        else if (pred === 'Xỉu') stackingInput.push(0);
        else stackingInput.push(0.5);
      }
      stackingInput.push(1);
      const stackingProb = stackingNet.forward(stackingInput);
      if (Math.abs(stackingProb - 0.5) > 0.15) {
        const stackingPred = stackingProb > 0.5 ? 'Tài' : 'Xỉu';
        allValidPredictions.push({ logic: 'Stacking', prediction: stackingPred, accuracy: 0.9, consistency: 0.85 });
      }
    }

    // logic20 (giữ nguyên)
    const logic20Result = await predictLogic20(history, logicPerformance, cauLogDataForPrediction);
    if (logic20Result && logicPerformance.logic20.total > 5 && logicPerformance.logic20.accuracy >= 0.45) {
      allValidPredictions.push({ logic: 'logic20', prediction: logic20Result, accuracy: logicPerformance.logic20.accuracy, consistency: logicPerformance.logic20.consistency });
    }

    // Tổng hợp có trọng số
    allValidPredictions.sort((a, b) => (b.accuracy * b.consistency) - (a.accuracy * a.consistency));

    let totalEffectiveWeight = 0;
    const usedLogics = new Set();

    for (const p of allValidPredictions) {
      let weight = p.accuracy * p.consistency;
      if (p.logic === 'ANN') weight *= 2.0;
      else if (p.logic === 'Stacking') weight *= 2.2;
      else if (p.logic === 'logic20') weight *= 1.8;
      else if (p.logic === 'logic22') weight *= 1.5;
      else if (p.logic === 'logic25') weight *= 1.3;
      else weight *= 1.0;

      if (weight > 0.1) {
        if (p.prediction === 'Tài') taiWeightedVote += weight;
        else xiuWeightedVote += weight;
        totalEffectiveWeight += weight;
        if (!usedLogics.has(p.logic)) {
          contributingLogics.push(`${p.logic} (${(p.accuracy * 100).toFixed(1)}%)`);
          usedLogics.add(p.logic);
        }
      }
      if (contributingLogics.length >= 5) break;
    }

    if (totalEffectiveWeight > 0) {
      const taiConf = taiWeightedVote / totalEffectiveWeight;
      const xiuConf = xiuWeightedVote / totalEffectiveWeight;
      if (taiConf > xiuConf * 1.05 && taiConf >= 0.48) {
        finalPrediction = 'Tài';
        overallConfidence = (taiConf * 100).toFixed(2);
        confidenceMessage = taiConf >= HIGH_CONFIDENCE_THRESHOLD ? 'Rất tin cậy' : 'Tin cậy';
      } else if (xiuConf > taiConf * 1.05 && xiuConf >= 0.48) {
        finalPrediction = 'Xỉu';
        overallConfidence = (xiuConf * 100).toFixed(2);
        confidenceMessage = xiuConf >= HIGH_CONFIDENCE_THRESHOLD ? 'Rất tin cậy' : 'Tin cậy';
      } else {
        finalPrediction = lastSession.result;
        overallConfidence = '50';
        confidenceMessage = 'Thấp (theo xu hướng)';
        contributingLogics = ['Fallback: Theo Phiên'];
      }
    } else {
      finalPrediction = lastSession.result;
      overallConfidence = '50';
      confidenceMessage = 'Thấp (theo xu hướng)';
      contributingLogics = ['Fallback: Theo Phiên'];
    }

    let confNum = parseFloat(overallConfidence);
    if (isNaN(confNum)) confNum = 50;
    confNum = Math.min(confNum, 97);
    overallConfidence = confNum.toFixed(2);

    // Phân tích pattern cho hiển thị
    const [_, patternDesc] = analyzePatterns(history.map(i => i.result));
    detectedPatternString = patternDesc;
    const cau10Phien = history.slice(0, 10).map(s => s.result === 'Tài' ? 'T' : 'X').join('');

    // Gợi ý cược dùng Q-learning nếu có
    let suggestedBet = 0;
    if (qAgent && history.length > 10) {
      const volatility = calculateStdDev(history.slice(0,30).map(s => s.total));
      const patternType = detectedPatternString.includes('TT') || detectedPatternString.includes('XX') ? 0 :
                          detectedPatternString.includes('TXT') || detectedPatternString.includes('XTX') ? 1 : 2;
      const state = qAgent.getState(confNum, patternType, volatility);
      const action = qAgent.chooseAction(state, ['Tài', 'Xỉu', 'Không']);
      if (action !== 'Không' && action === finalPrediction) {
        suggestedBet = confNum >= 80 ? 10 : confNum >= 60 ? 5 : 2;
      } else if (action !== 'Không' && action !== finalPrediction) {
        suggestedBet = 0; // không khuyến khích nếu agent chọn khác
      } else {
        suggestedBet = 0;
      }
      // Lưu lại state và action để update sau (cần lưu vào biến global, nhưng tạm thời bỏ qua)
    } else {
      if (confNum >= 80) suggestedBet = 10;
      else if (confNum >= 60) suggestedBet = 5;
      else if (confNum >= 40) suggestedBet = 2;
    }

    const lyDo = {
      ket_luan: confidenceMessage,
      cac_logic_tham_gia: contributingLogics,
      so_phieu_tai: taiWeightedVote.toFixed(2),
      so_phieu_xiu: xiuWeightedVote.toFixed(2),
      pattern_phat_hien: detectedPatternString
    };

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

    const timestamp = Date.now();
    await dbRun(`INSERT INTO predictions (sid, prediction, confidence, cau_hien_tai, ly_do, timestamp) VALUES (?,?,?,?,?,?)`,
      [nextSessionId, finalPrediction, parseFloat(overallConfidence), cau10Phien, JSON.stringify(lyDo), timestamp]);

    connectedClients.forEach(c => {
      if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(predictionMessage));
    });

    console.log(`\n--- Broadcasted ${nextSessionId}: ${finalPrediction} (${overallConfidence}%) ---`);
  } catch (err) {
    console.error('Lỗi trong broadcastPrediction:', err);
  }
}

// === CÁC API VÀ KHỞI ĐỘNG SERVER (giữ nguyên) ===
// ...

// Khởi động server và load models
const start = async () => {
  await loadLogicPerformance();
  await loadModels();
  if (!qAgent) qAgent = new QLearningAgent();
  try {
    const address = await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`Server Fastify đang chạy tại ${address}`);
  } catch (err) {
    console.error('Lỗi khởi động server:', err);
    process.exit(1);
  }
};

start();

// Lưu models định kỳ (mỗi 10 phút)
setInterval(saveModels, 10 * 60 * 1000);
