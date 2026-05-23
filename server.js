const express = require('express');
const path = require('path');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

// Firebase Admin SDKの初期化
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// 認証不要のため、データを一箇所に保存・参照するための固定ID
const DEFAULT_UID = 'default_user';

// --- 設定保存・取得 ---

app.post('/api/config/save', async (req, res) => {
  const { config } = req.body;
  if (!config) return res.status(400).json({ error: 'configがありません' });
  try {
    await db.collection('vaultConfigs').doc(DEFAULT_UID).set({
      config,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '保存失敗: ' + e.message });
  }
});

app.get('/api/config/load', async (req, res) => {
  try {
    const doc = await db.collection('vaultConfigs').doc(DEFAULT_UID).get();
    if (!doc.exists) return res.json({ config: null });
    res.json({ config: doc.data().config });
  } catch (e) {
    res.status(500).json({ error: '読み込み失敗: ' + e.message });
  }
});

// --- 計算処理 (認証不要) ---

app.post('/api/calculate', (req, res) => {
  const { inputs, config } = req.body;
  const prices = [10000, 5000, 1000, 500, 100, 50, 10, 5, 1];
  let currentTotal = 0, needMoney = 0, availableMoney = 0;
  let results = {};

  prices.forEach(price => {
    const s = config.denoms[price];
    const barVal = Number(inputs[price]?.b || 0);
    const coinVal = Number(inputs[price]?.c || 0);
    let rowAmount = (s.bMode !== "none" || s.cMode !== "none") ? ((barVal * s.perBar) + coinVal) * price : 0;
    currentTotal += rowAmount;
    
    let bText = "-", bClass = "";
    if (s.bMode !== "hidden" && s.bMode !== "none") {
      const dBar = barVal - s.tBar;
      bText = dBar > 0 ? "+" + dBar : (dBar < 0 ? dBar : "OK");
      bClass = dBar > 0 ? "txt-plus" : (dBar < 0 ? `txt-minus ${s.bMode}` : "txt-ok bg-ok");
      if (dBar > 0 && s.isAvailB) availableMoney += dBar * s.perBar * price;
      if (dBar < 0 && s.bMode === "bg-red") needMoney += Math.abs(dBar) * s.perBar * price;
    }
    
    let cText = "-", cClass = "";
    if (s.cMode !== "hidden" && s.cMode !== "none") {
      const dCoin = coinVal - s.tCoin;
      cText = dCoin > 0 ? "+" + dCoin : (dCoin < 0 ? dCoin : "OK");
      cClass = dCoin > 0 ? "txt-plus" : (dCoin < 0 ? `txt-minus ${s.cMode}` : "txt-ok bg-ok");
      if (dCoin > 0 && s.isAvailC) availableMoney += dCoin * price;
      if (dCoin < 0 && s.cMode === "bg-red") needMoney += Math.abs(dCoin) * price;
    }
    results[price] = { rowAmount, bText, bClass, cText, cClass };
  });
  
  const diffVal = currentTotal - config.vaultTotal;
  res.json({ currentTotal, diffVal, needMoney, availableMoney, results });
});

// --- 履歴保存・取得・削除 ---

app.post('/api/history/save', async (req, res) => {
  const { snapshot } = req.body;
  if (!snapshot) return res.status(400).json({ error: 'snapshotがありません' });
  try {
    await db.collection('vaultHistory').add({
      uid: DEFAULT_UID,
      ...snapshot,
      savedAt: snapshot.savedAt || new Date().toISOString()
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '保存失敗: ' + e.message });
  }
});

app.get('/api/history/load', async (req, res) => {
  try {
    const snap = await db.collection('vaultHistory').where('uid', '==', DEFAULT_UID).orderBy('savedAt', 'desc').limit(50).get();
    const history = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ history });
  } catch (e) {
    res.status(500).json({ error: '読み込み失敗: ' + e.message });
  }
});

app.post('/api/history/delete', async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'idがありません' });
  try {
    const doc = await db.collection('vaultHistory').doc(id).get();
    // 自身のデータであるかを確認（念のため）
    if (!doc.exists || doc.data().uid !== DEFAULT_UID) return res.status(403).json({ error: '権限がありません' });
    await db.collection('vaultHistory').doc(id).delete();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '削除失敗: ' + e.message });
  }
});

// --- 静的ファイル ---

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
