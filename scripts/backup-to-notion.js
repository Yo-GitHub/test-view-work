// Notionページに「週次バックアップ」を追記するスクリプト
// 使い方: node scripts/backup-to-notion.js docs/implementation_memo.md
import fs from "node:fs";
import path from "node:path";
import { Client } from "@notionhq/client";

const token = process.env.NOTION_TOKEN;
const pageId = process.env.NOTION_PAGE_ID;
if (!token || !pageId) {
  console.error("NOTION_TOKEN / NOTION_PAGE_ID が未設定です");
  process.exit(1);
}
const filePath = process.argv[2];
if (!filePath || !fs.existsSync(filePath)) {
  console.error("バックアップ対象のMarkdownが見つかりません:", filePath);
  process.exit(1);
}

const md = fs.readFileSync(filePath, "utf8");
// 文字数・ブロック制約に配慮して段落に分割（空行基準）
const paragraphs = md
  .split(/\r?\n\r?\n/)
  .map(s => s.trim())
  .filter(Boolean);

// Notionクライアント
const notion = new Client({ auth: token });

// シンプルな変換：段落→paragraph ブロック（見出しは # を太字で代用）
function mdParaToNotion(p) {
  // 長すぎる段落は 1800 文字で分割（安全側）
  const chunks = [];
  for (let i = 0; i < p.length; i += 1800) chunks.push(p.slice(i, i + 1800));
  return chunks.map(text => ({
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [{ type: "text", text: { content: text } }]
    }
  }));
}

// 本文をBlock配列へ
const bodyBlocks = paragraphs.flatMap(mdParaToNotion);

// セクション見出し（JST基準）
const jst = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const headerBlocks = [
  {
    object: "block",
    type: "heading_2",
    heading_2: {
      rich_text: [
        {
          type: "text",
          text: { content: `週次バックアップ：${jst}` }
        }
      ]
    }
  }
];

const divider = [{ object: "block", type: "divider", divider: {} }];

(async () => {
  try {
    // 1) 見出し
    await notion.blocks.children.append({
      block_id: pageId,
      children: headerBlocks
    });
    // 2) 本文
    // Notion APIは一度に100ブロックまでなので分割投入
    const chunkSize = 90;
    for (let i = 0; i < bodyBlocks.length; i += chunkSize) {
      const slice = bodyBlocks.slice(i, i + chunkSize);
      await notion.blocks.children.append({
        // 1) 既存: blocks.children.append({ block_id: PAGE_ID, children })
//    ↓↓↓ ここを差し替え
import fs from 'fs';
import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const PARENT = (process.env.NOTION_PAGE_ID || '').trim();
const mdPath = process.argv[2] || 'docs/implementation_memo.md';

// 読み込み＆段落→Notionブロック化（長文は1800字で分割）
function toBlocks(text) {
  const paras = text.split(/\r?\n\r?\n/).map(s => s.trim()).filter(Boolean);
  const blocks = [];
  for (const p of paras) {
    for (let i = 0; i < p.length; i += 1800) {
      blocks.push({ type: 'paragraph', paragraph: { rich_text: [{ text: { content: p.slice(i, i+1800) } }] } });
    }
  }
  return blocks.length ? blocks : [{ type:'paragraph', paragraph:{ rich_text:[{ text:{ content:'(本文なし)'} }]} }];
}

// 本文ロード
if (!fs.existsSync(mdPath)) { console.error(`本文なし: ${mdPath}`); process.exit(1); }
const raw = fs.readFileSync(mdPath, 'utf-8');

// 週次タイトル（JST）
const nowJST = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
const weeklyTitle = `Weekly ${nowJST}`;

// 2) 新規の子ページとして作成（親ページ直下）
await notion.pages.create({
  parent: { page_id: PARENT },
  properties: {
    title: { title: [{ text: { content: weeklyTitle } }] }
  },
  children: toBlocks(raw)
});

console.log('Notion子ページ 作成 完了');
      });
    }
    // 3) 区切り線
    await notion.blocks.children.append({
      block_id: pageId,
      children: divider
    });
    console.log("Notionへ追記完了:", jst);
  } catch (e) {
    console.error("Notion追記に失敗:", e.message);
    process.exit(1);
  }
})();