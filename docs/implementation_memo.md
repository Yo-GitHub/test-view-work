# 20250929

主ぅぅ……！

意図：**Notionの実装メモに沿って“セッション要約＋苦手優先サンプリング”を、いまのプロジェクトに実装再開**いたしまする。要約→ローカル保存→弱点優先抽出、の最短パッチを置きまする（コピペOK）。

（保存キーや流れはメモ準拠：wj_stats_v1 / wj_sessions_v1、log→集計→要約→保存→再サンプルの順でござる。）

---

# **1) ストレージ&ログ関数（共通JSに追記）**

index.html の <script> 末尾などに追加：

```
// ====== Storage (Notionメモ準拠) ======
const STATS_KEY = 'wj_stats_v1';     // 累積 ok/ng をID別に保存
const SESS_KEY  = 'wj_sessions_v1';  // セッション配列（末尾が最新）

function loadStats() { return JSON.parse(localStorage.getItem(STATS_KEY) || '{}'); }
function saveStats(obj) { localStorage.setItem(STATS_KEY, JSON.stringify(obj)); }
function statOf(id) { const s = loadStats()[id] || {ok:0, ng:0}; return s; }

function pushSession(rec){
  const arr = JSON.parse(localStorage.getItem(SESS_KEY) || '[]');
  arr.push(rec);
  localStorage.setItem(SESS_KEY, JSON.stringify(arr));
}

let __sessionLog = []; // 試行イベントの生ログ（このラウンド中のみ）
let __sessionStartedAt = null;

function startSession(){ __sessionLog = []; __sessionStartedAt = new Date().toISOString(); }

// mode: 'group'|'match'|'mcq', payload: 各モード仕様の最小形
function logAttempt(mode, payload){
  const now = Date.now();
  // 1) 累積統計
  const stats = loadStats();
  const id = (mode==='mcq') ? payload.key : (mode==='group' ? payload.label : payload.key); // メモのID指針に準拠
  stats[id] = stats[id] || {ok:0, ng:0};
  if (payload.result === 'ok') stats[id].ok++; else stats[id].ng++;
  stats[id].lastAt = now;
  saveStats(stats);
  // 2) セッションログ
  __sessionLog.push({ t: now, mode, ...payload });
}

// セッション終了時：要約生成→保存（UI表示は別）
function saveSessionSilently(mode){
  if (!__sessionStartedAt) __sessionStartedAt = new Date().toISOString();
  const endedAt = new Date().toISOString();

  // 集計
  let ok=0, ng=0, total=0;
  const missMap = {}; // id -> count
  for (const a of __sessionLog) {
    if (a.result === 'ok') ok++; else ng++;
    total++;
    const id = (mode==='mcq') ? a.key : (mode==='group' ? a.label : a.key);
    if (a.result === 'ng') missMap[id] = (missMap[id]||0)+1;
  }
  const rate = total ? Math.round((ok/total)*100) : 0;
  const topMiss = Object.entries(missMap)
    .map(([id,cnt])=>({id, cnt}))
    .sort((a,b)=>b.cnt-a.cnt)
    .slice(0,5);

  const record = {
    mode, startedAt: __sessionStartedAt, endedAt,
    ok, ng, total, rate, topMiss,
    attempts: __sessionLog.slice(-200) // 最新200件だけ保持（メモの上限方針より）
  };
  pushSession(record);
  // 次ラウンドのためクリア
  __sessionLog = []; __sessionStartedAt = null;
  return record; // UIで使う
}
```

> 仕様はメモの保存キー・ペイロード・セッション構造に沿っていまする（ID方針・要約項目など）。
> 

---

# **2) 要約モーダル（UI最小実装）**

</main>の直前あたりにUIを1枚追加：

```
<div id="summaryModal" class="modal" aria-live="polite" style="display:none">
  <div class="card">
    <h3>セッション要約</h3>
    <div id="sumBody"></div>
    <div class="row">
      <button id="btnRetry">もう一度</button>
      <button id="btnNext">次へ</button>
      <button id="btnClose">閉じる</button>
    </div>
  </div>
</div>
```

JSで開閉と描画（同じ <script> に追記）：

```
function openLatestSummary(){
  const arr = JSON.parse(localStorage.getItem(SESS_KEY) || '[]');
  if (!arr.length) return;
  renderSummary(arr[arr.length-1]);
}
function renderSummary(rec){
  const m = document.getElementById('summaryModal');
  const b = document.getElementById('sumBody');
  b.innerHTML = `
    <div>モード：${rec.mode}</div>
    <div>正答率：${(rec.rate).toFixed(0)}%</div>
    <div>結果：${rec.ok} / ${rec.total}</div>
    <div>よく間違えたTOP3：
      ${rec.topMiss.slice(0,3).map(x=>`${x.id}(${x.cnt})`).join('、') || '—'}
    </div>`;
  m.style.display = 'block';
}
['btnClose','btnRetry','btnNext'].forEach(id=>{
  const el = document.getElementById(id);
  if (!el) return;
  el.onclick = ()=>{
    document.getElementById('summaryModal').style.display='none';
    if (id==='btnRetry') { /* 現在のお題を再配置 */ retryCurrent(); }
    if (id==='btnNext')  { /* 次のお題へ */ goNextSet(); }
  };
});

// 既存の完了処理のあとに、要約を出す例：
// const rec = saveSessionSilently(mode); renderSummary(rec);
```

> メモにある「要約モーダルの Next/Retry をタブ定義後にバインド」の流儀を簡素化して反映。
> 

---

# **3) 弱点優先サンプリング（重み付け）**

メモの方針（weight = 1 + k*miss、k=2 既定）を実装。

```
let K_WEIGHT = 2; // UIで調整可能にするなら設定パネルと紐付けてもOK

function weightById(id){
  const s = statOf(id);
  const miss = s.ng || 0;
  const w = 1 + K_WEIGHT * miss;
  return Math.min(9, w); // クリップ提案（最大9）
}

// items: 出題候補配列, n: 個数, idGetter: アイテム→ID
function weightedSample(items, n, idGetter){
  const pool = items.map(it => ({ it, w: Math.max(1, weightById(idGetter(it))) }));
  const picks = [];
  for (let k=0; k<n && pool.length; k++){
    const sum = pool.reduce((s,r)=>s+r.w,0);
    let r = Math.random()*sum, i=0;
    for (; i<pool.length; i++){ if ((r -= pool[i].w) <= 0) break; }
    const [row] = pool.splice(i,1);
    picks.push(row.it);
  }
  return picks;
}
```

各モードの「問題抽出」関数で弱点優先を呼ぶだけで反映できまする：

```
// 例：グループ分けの候補アイテムから8枚を作るとき
// const next = weightedSample(FULL_GROUP_POOL, 8, it => it.label);
```

> モード別IDの対応（group: label / match: key / mcq: id）もメモに沿っておりまする。
> 

---

# **4) 既存フローに組み込む場所（要点だけ）**

- **解答時**：正解/不正解が判明した瞬間に logAttempt(mode, payload) を呼ぶ
    - group：{ label, correctGroup, triedGroup, result:'ok'|'ng' }
    - match：{ key, tried, result }（triedは任意）
    - mcq：{ key: <mcq.id>, tried: <optionText>, result }
        
        （メモのpayload仕様に一致。）
        
- **コンプリート時**：const rec = saveSessionSilently(mode); renderSummary(rec);
    - すでに自動で次へ進む処理がある場合は、**モーダルのNext/Retryで呼ぶ**ように寄せましょう（ダブル進行を避けるため）。

---

# **5) 動作チェック（3点）**

1. いずれかのモードで数問解く → **要約モーダル**が出て正答率とTOP3が表示
2. リロード後に openLatestSummary() を実行 → **直前の要約**が再表示
3. タブを切り替えても、**弱点頻出語が体感的に多め**に引かれる

---

必要なら、この共通ロジックを js/session.js のように**1ファイルに分離**して読み込む形に整えまする。

バグが出たら **最初の赤ログ1行**だけ教えてくだされ。すぐ結び直し申す。

また布を編みましょう