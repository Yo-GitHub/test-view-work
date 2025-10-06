WordJam 再開パケット v1.0.1（JSON固定化）

1) 本パケットの目的
    •   JSON設計を実運用フォーマットとして固定。
    •   ひな形ファイル一式を提示（そのまま配置して試走可能）。
    •   既存データの移行指針を最短で明示。

⸻

2) ひな形ファイル（そのまま保存可）

2-1. themes.json

{
  "group": [
    { "id": "g-basic", "title": "危険物の類 基本", "file": "group.basic.json" }
  ],
  "match": [
    { "id": "m-basic", "title": "類 ↔ 定義（基礎）", "file": "match.basic.json" }
  ],
  "mcq": [
    { "id": "q-basic", "title": "四択（基礎）", "file": "mcq.basic.json" }
  ],
  "version": "1.0.1"
}

2-2. group.basic.json

{
  "group": {
    "questions": [
      {
        "id": "grp-0001",
        "title": "第1〜第4類の基本分類",
        "bins": [
          { "key": "第1類", "title": "第1類（酸化性固体）" },
          { "key": "第2類", "title": "第2類（可燃性固体）" },
          { "key": "第3類", "title": "第3類（自然発火/禁水）" },
          { "key": "第4類", "title": "第4類（引火性液体）" }
        ],
        "items": [
          { "id": "it-1", "label": "過マンガン酸カリウム", "bin": "第1類" },
          { "id": "it-2", "label": "硫黄", "bin": "第2類" },
          { "id": "it-3", "label": "黄リン", "bin": "第3類" },
          { "id": "it-4", "label": "ガソリン", "bin": "第4類" }
        ]
      }
    ],
    "version": "1.0.1"
  }
}

2-3. match.basic.json

{
  "match": {
    "questions": [
      {
        "id": "mat-0001",
        "title": "類 ↔ 定義（基礎）",
        "leftTitle": "左：類",
        "rightTitle": "右：定義",
        "left": [
          { "id": "L1", "label": "第1類", "bin": "第1類" },
          { "id": "L2", "label": "第2類", "bin": "第2類" }
        ],
        "right": [
          { "id": "R1", "label": "酸化性固体", "bin": "第1類" },
          { "id": "R2", "label": "可燃性固体", "bin": "第2類" }
        ]
      }
    ],
    "version": "1.0.1"
  }
}

2-4. mcq.basic.json

{
  "quiz": [
    {
      "id": "q-0001",
      "type": "one",
      "question": "第4類の表示で正しいのは？\n（記述をよく読む）",
      "hint": "語彙：火気○○",
      "options": ["火気注意", "火気厳禁", "高温注意", "衝撃注意"],
      "answer": ["火気厳禁"],
      "reason": "第4類は引火性液体のため“火気厳禁”が正しい。",
      "source": "乙四：性質"
    },
    {
      "id": "q-0002",
      "type": "multi",
      "question": "適切な消火剤を全て選べ。",
      "options": ["水", "泡", "二酸化炭素", "粉末"],
      "answer": ["泡", "粉末"]
    }
  ],
  "version": "1.0.1"
}


⸻

3) ログスキーマ（固定）

3-1. 試行ログ attempt

{
  "t": 1730706123456,
  "mode": "group|match|mcq",
  "label": "過マンガン酸カリウム",
  "bin": ["第1類"],
  "tried": ["第2類"],
  "result": "ok|ng"
}

3-2. セッション記録 session

{
  "mode": "group",
  "startedAt": "2025-10-05T12:00:00.000Z",
  "endedAt": "2025-10-05T12:07:21.000Z",
  "ok": 22,
  "ng": 6,
  "total": 28,
  "rate": 79,
  "topMiss": [ { "id": "黄リン", "cnt": 3 }, { "id": "硫黄", "cnt": 2 } ],
  "attempts": []
}

3-3. 累積統計 stats

{
  "ok": 10,
  "ng": 4
}

※ 将来拡張：lastAt, stability, interval を追加し SM-2 風に。

⸻

4) 既存データの最短移行手順
    1.  四択で番号基準の answer が来たら 読込時に options[index-1] へ変換。
    2.  answer は常にテキスト配列へ統一（単一も配列）。
    3.  group/match 旧形式は bins/items 構造へ正規化。

擬似コード（JS）

function normalizeMcq(item){
  const ans = Array.isArray(item.answer) ? item.answer : [item.answer];
  const asText = ans.every(n => Number.isInteger(n))
    ? ans.map(n => item.options[n-1])
    : ans;
  return { ...item, type: item.type || (asText.length>1 ? 'multi':'one'), answer: asText };
}


⸻

5) 本日のチェックリスト
    •   themes.json を参照元に紐付け
    •   読込層で normalizeMcq を適用
    •   ログ書き込みキー（wj_*_v1）を端末で確認
    •   テストセッション1本を実行し session.rate が出ること

⸻

付記
    •   固定点：bin/answerはテキスト、answerは常に配列、複数お題は questions[]。
    •   バージョン刻み：1.0.1（フォーマット同値・参照名の明示強化）。