const express = require('express');
const path = require('path');
const admin = require('firebase-admin');

const app = express();
app.use(express.json());

// Firebase Admin SDKの初期化
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// 共通ユーザーID（認証排除のため固定）
const DEFAULT_USER = 'user_default';

app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/config/save', async (req, res) => {
  const { config } = req.body;
  try {
    await db.collection('vaultConfigs').doc(DEFAULT_USER).set({
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
    const doc = await db.collection('vaultConfigs').doc(DEFAULT_USER).get();
    if (!doc.exists) return res.json({ config: null });
    res.json({ config: doc.data().config });
  } catch (e) {
    res.status(500).json({ error: '読み込み失敗: ' + e.message });
  }
});

app.post('/api/history/save', async (req, res) => {
  const { snapshot } = req.body;
  try {
    await db.collection('vaultHistory').add({
      uid: DEFAULT_USER,
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
    const snap = await db.collection('vaultHistory').where('uid', '==', DEFAULT_USER).orderBy('savedAt', 'desc').limit(50).get();
    const history = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ history });
  } catch (e) {
    res.status(500).json({ error: '読み込み失敗: ' + e.message });
  }
});

app.post('/api/history/delete', async (req, res) => {
  const { id } = req.body;
  try {
    const doc = await db.collection('vaultHistory').doc(id).get();
    if (!doc.exists || doc.data().uid !== DEFAULT_USER) return res.status(403).json({ error: '権限がありません' });
    await db.collection('vaultHistory').doc(id).delete();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '削除失敗: ' + e.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
