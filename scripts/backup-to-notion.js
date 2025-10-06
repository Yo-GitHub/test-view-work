// Notionページに「週次バックアップ」を子ページとして作成するスクリプト
// 使い方: node scripts/backup-to-notion.js docs/implementation_memo.md
import fs from 'node:fs';
import { Client } from '@notionhq/client';

const token = (process.env.NOTION_TOKEN || '').trim();
const parentPageId = (process.env.NOTION_PAGE_ID || '').trim();
const mdPath = process.argv[2] || 'docs/implementation_memo.md';

if (!token || !parentPageId) {
  console.error('NOTION_TOKEN / NOTION_PAGE_ID が未設定です');
  process.exit(1);
}
if (!fs.existsSync(mdPath)) {
  console.error('バックアップ対象のMarkdownが見つかりません:', mdPath);
  process.exit(1);
}

const notion = new Client({ auth: token });

// 段落テキストを Notion ブロックに単純変換（空行で段落分割、長文は1800字で分割）
function mdToBlocks(text) {
  const paras = text.split(/\r?\n\r?\n/).map(s => s.trim()).filter(Boolean);
  const blocks = [];
  for (const p of paras) {
    for (let i = 0; i < p.length; i += 1800) {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [{ type: 'text', text: { content: p.slice(i, i + 1800) } }] }
      });
    }
  }
  return blocks.length ? blocks : [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: '(本文なし)'}}] } }];
}

// 見出しブロック（週次タイトル）
function weeklyHeaderBlocks(jstString) {
  return [{
    object: 'block',
    type: 'heading_2',
    heading_2: { rich_text: [{ type: 'text', text: { content: `週次バックアップ：${jstString}` } }] }
  }];
}

async function main() {
  const raw = fs.readFileSync(mdPath, 'utf8');
  const jst = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  const title = `Weekly ${jst}`;

  // 1) 子ページを親ページ直下に作成
  const page = await notion.pages.create({
    parent: { page_id: parentPageId },
    properties: { title: { title: [{ type: 'text', text: { content: title } }] } },
    children: weeklyHeaderBlocks(jst)
  });

  // 2) 本文ブロックを 90 件ずつ分割して追記
  const bodyBlocks = mdToBlocks(raw);
  const chunkSize = 90;
  for (let i = 0; i < bodyBlocks.length; i += chunkSize) {
    const slice = bodyBlocks.slice(i, i + chunkSize);
    await notion.blocks.children.append({ block_id: page.id, children: slice });
  }

  // 3) 区切り線
  await notion.blocks.children.append({ block_id: page.id, children: [{ object: 'block', type: 'divider', divider: {} }] });

  console.log('Notion子ページ 作成 完了:', title);
}

main().catch(err => {
  console.error('Notion追記に失敗:', err?.message || err);
  process.exit(1);
});