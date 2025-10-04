WordJam風ツール｜「セッション要約＋苦手優先サンプリング」実装メモ

目的：学習セッションの履歴を集約して弱点を可視化し、次回の出題は弱点・間違い直近・復習期日を優先して自動サンプリングする。

⸻

0. 最短要約（3行）
    •   入力：problems.json（問題定義）, history.jsonl（解答履歴）, profile.json（タグ別熟達度）
    •   出力：session_pack.json（次セッション出題セット）, session_summary.md（今回要約）, profile.json更新
    •   比率：弱点70％・維持20％・探索10％、再現性のためseed固定可

⸻

1. 仕様（要点）
    1.  弱点指標：タグ別熟達度M[tag]∈[0,1]、直近7日誤答率E7[tag]、SRS期日超過度D[tag]を用いる。
    2.  タグ優先度：P[tag]=w1*(1-M)+w2*E7+w3*D+w4*coverage_gap（wはconfig.yml）
    3.  候補選定：上位Kタグから問題候補集合を作り、直近出題済/重複をBloom Filterで回避。
    4.  出題構成：N問のうち、弱点70%、維持20%、探索10%（未履修タグ・新規問題）。
    5.  サマリ：セッション終了時にタグ別正答率、平均解答時間、誤りトップ3、次回の重点タグをMarkdownで保存しNotionにも追記（任意）。
    6.  性能要件（目安）：問題数1万件・履歴10万行でサンプル生成<300ms（純Python）

⸻

2. データ構造（最小スキーマ）

2.1 problems.json（一部）

[
  {
    "id": "q_000123",
    "prompt": "可燃性液体の貯蔵に関する次の記述のうち、誤っているものはどれか",
    "choices": ["A", "B", "C", "D"],
    "answer": "C",
    "explanation": "...",
    "tags": ["乙四", "法規", "貯蔵"],
    "difficulty": 3,
    "source": "mock/2024-09"
  }
]

2.2 history.jsonl（1行=1解答）

{"ts":"2025-09-30T09:30:12+09:00","qid":"q_000123","result":0,"latency_ms":34000,"tags":["乙四","法規"],"session_id":"s_20250930_morning"}

    •   result: 正解=1/不正解=0/部分=0.5 等の簡易スコア

2.3 profile.json（タグ熟達/SRS）

{
  "mastery": {"乙四": 0.42, "法規": 0.38, "電工二種": 0.65},
  "leitner": {"乙四": 2, "法規": 1},
  "last_seen": {"乙四": "2025-09-30", "法規": "2025-09-28"},
  "due": {"乙四": "2025-09-29", "法規": "2025-09-27"}
}


⸻

3. サンプリング設計（擬似コード）

# 入力: problems, history, profile, N, seed, w1..w4
# 出力: session_pack

# 1) タグ統計更新
for each record in history(since last session window):
    update rolling accuracy per tag
    update latency stats per tag

# 2) 優先度計算
for tag in all_tags:
    M = mastery[tag] or 0.5
    E7 = recent_error_rate[tag]  # 0..1
    D  = max(0, today - due[tag]) / horizon
    C  = coverage_gap[tag]       # 0..1 (未出題率)
    P[tag] = w1*(1-M) + w2*E7 + w3*D + w4*C

# 3) 枠配分
n_weak = round(N*0.7)
n_keep = round(N*0.2)
n_exp  = N - n_weak - n_keep

# 4) 候補集合
Tweak = top_k_tags(P, k=ceil(n_weak*2))
Tkeep = medium_tags_by_mastery()
Texp  = unseen_or_new_tags()

# 5) 重複回避 & 難易度整形
avoid = recent_qids(last=50) ∪ blacklist
weak_pool = filter(problems, tags∈Tweak, qid∉avoid)
keep_pool = filter(problems, tags∈Tkeep, qid∉avoid)
exp_pool  = filter(problems, tags∈Texp,  qid∉avoid)

# 6) 重み付き抽選
w(q) = α*P_dominant_tag(q) + β*hardness_boost(q) + γ*recency_boost(q)
weak = weighted_sample(weak_pool, n_weak, w, seed)
keep = weighted_sample(keep_pool, n_keep, w, seed)
expl = weighted_sample(exp_pool,  n_exp,  w, seed)

session_pack = shuffle(weak+keep+expl, seed)


⸻

4. CLI/運用導線
    •   wj sample -n 15 --seed 42 > session_pack.json
    •   wj run session_pack.json（実施UI/CLI側）
    •   wj summarize --since s_20250930_morning > session_summary.md
    •   wj profile update --from history.jsonl（熟達更新）
    •   （任意）wj notion append session_summary.md（Notion API 秘密鍵必須）

自動化連携
    •   ローカル（launchd）：朝9時/夜21時にwj summarize→git add/commit/push
    •   GitHub Actions（週次）：wj summarize --since last_week→Notion追記→docs/再ビルド

⸻

5. Python雛形（単一ファイル版）

from __future__ import annotations
import json, random, datetime as dt, math, pathlib
from collections import defaultdict, Counter

RNG = random.Random()

def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def load_jsonl(path):
    out = []
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                out.append(json.loads(line))
    return out

def rolling_error_rate(history, days=7):
    cutoff = dt.datetime.now(dt.timezone(dt.timedelta(hours=9))) - dt.timedelta(days=days)
    ok, ng = Counter(), Counter()
    for r in history:
        ts = dt.datetime.fromisoformat(r['ts'])
        if ts >= cutoff:
            for t in r.get('tags', []):
                (ok if r.get('result',0)>=1 else ng)[t]+=1
    rate = {}
    for t in set(ok)|set(ng):
        total = ok[t]+ng[t]
        rate[t] = ng[t]/total if total else 0.0
    return rate

def coverage_gap(problems, history):
    seen = set(r['qid'] for r in history)
    tag_total = Counter()
    tag_seen = Counter()
    for q in problems:
        for t in q.get('tags', []):
            tag_total[t]+=1
            if q['id'] in seen:
                tag_seen[t]+=1
    gap = {}
    for t in tag_total:
        gap[t] = 1.0 - (tag_seen[t]/tag_total[t])
    return gap

def priority_tags(problems, history, profile, w=(0.5,0.3,0.15,0.05)):
    M = profile.get('mastery', {})
    due = profile.get('due', {})
    e7 = rolling_error_rate(history)
    gap = coverage_gap(problems, history)
    today = dt.date.today()
    P = {}
    for q in problems:
        for t in q.get('tags', []):
            if t in P: continue
            m = float(M.get(t, 0.5))
            e = float(e7.get(t, 0.0))
            d = 0.0
            if t in due:
                try:
                    dd = dt.date.fromisoformat(due[t])
                    d = max(0, (today - dd).days)/7.0  # 1週間遅延=1.0
                except Exception:
                    d = 0.0
            c = float(gap.get(t, 0.0))
            P[t] = w[0]*(1-m) + w[1]*e + w[2]*d + w[3]*c
    return P

def weighted_sample(pool, n, weight_fn, seed=42):
    RNG.seed(seed)
    items = list(pool)
    if not items: return []
    ws = [max(1e-6, weight_fn(q)) for q in items]
    total = sum(ws)
    chosen = []
    for _ in range(min(n, len(items))):
        r = RNG.random() * total
        acc = 0.0
        for i,(q,w) in enumerate(zip(items, ws)):
            acc += w
            if acc >= r:
                chosen.append(q)
                total -= ws[i]
                del items[i]; del ws[i]
                break
    return chosen

def plan_session(problems, history, profile, N=15, seed=42):
    P = priority_tags(problems, history, profile)
    def dominant_tag(q):
        ts = q.get('tags', [])
        return max(ts, key=lambda t: P.get(t,0.0)) if ts else None
    recent = set(r['qid'] for r in history[-50:])
    pool = [q for q in problems if q['id'] not in recent]

    # 枠配分
    n_weak = round(N*0.7); n_keep = round(N*0.2); n_exp = N - n_weak - n_keep

    # タグ集合
    tags_sorted = sorted(P.keys(), key=lambda t: P[t], reverse=True)
    tweak = set(tags_sorted[:max(1, math.ceil(n_weak*2/3))])
    tkeep = set(tags_sorted[max(1, math.ceil(len(tags_sorted)*0.4)) : max(1, math.ceil(len(tags_sorted)*0.7))])
    texp  = set(t for t in P.keys() if t not in tweak|tkeep)

    def w(q):
        t = dominant_tag(q)
        base = P.get(t, 0.1)
        hard = 0.1 * (q.get('difficulty',3)-3)  # 難易度補正
        return max(1e-6, base + hard)

    weak_pool = [q for q in pool if set(q.get('tags',[])) & tweak]
    keep_pool = [q for q in pool if set(q.get('tags',[])) & tkeep]
    exp_pool  = [q for q in pool if set(q.get('tags',[])) & texp]

    weak = weighted_sample(weak_pool, n_weak, w, seed)
    keep = weighted_sample(keep_pool, n_keep, w, seed+1)
    expl = weighted_sample(exp_pool,  n_exp,  w, seed+2)

    pack = weak + keep + expl
    RNG.seed(seed)
    RNG.shuffle(pack)
    return pack

if __name__ == '__main__':
    base = pathlib.Path('.')
    problems = load_json(base/'problems.json')
    history = load_jsonl(base/'history.jsonl') if (base/'history.jsonl').exists() else []
    profile = load_json(base/'profile.json') if (base/'profile.json').exists() else {"mastery":{}}
    pack = plan_session(problems, history, profile, N=15, seed=42)
    with open('session_pack.json', 'w', encoding='utf-8') as f:
        json.dump([q['id'] for q in pack], f, ensure_ascii=False, indent=2)
    print('generated session_pack.json:', len(pack), 'items')


⸻

6. セッション要約テンプレ（session_summary.md）

# セッション要約（{{date}} / {{session_id}}）
- 実施数：{{n}}　正答率：{{acc}}%　平均時間：{{latency}}秒
- 誤りタグ：{{top_error_tags}}
- 重点タグ：{{focus_tags}}
- 次回出題比率：弱点70%・維持20%・探索10%

## 詳細
- タグ別正答率：
  - 乙四：42%（前回比 +6%）
  - 法規：38%（前回比 -2%）

## 次回アクション
- 法規・貯蔵を先頭10問で固める
- 誤答解説の要点を1行メモに転記


⸻

7. チェックリスト（実装順）
    •   profile.jsonの初期値生成（未履修タグ=0.5）
    •   history.jsonlのローリング集計関数
    •   優先度P[tag]と枠配分のテスト
    •   直近重複回避（Bloom Filter/固定長セット）
    •   session_pack.json生成とシード再現
    •   session_summary.md生成＆Git/Notion連携

⸻

8. 将来拡張
    •   AIによる自動問題生成→problems/yyyymmdd.json追記→週次取り込み
    •   Notion双方向：要約→Notion、弱点表→カンバン自動更新
    •   難易度適応：IRT/2PL近似でdifficultyとdiscrimination推定
    •   セッション内アダプティブ：正誤・信頼度で次問の重み更新