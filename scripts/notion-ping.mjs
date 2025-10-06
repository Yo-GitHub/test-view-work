import { Client } from '@notionhq/client';
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const id = process.env.NOTION_PAGE_ID;
const page = await notion.pages.retrieve({ page_id: id });
console.log('OK workspace:', page?.object, page?.id);