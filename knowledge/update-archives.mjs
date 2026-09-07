// Add the new full article card to its category's data-article-list, then run:
// node knowledge/update-archives.mjs
// Existing archived rows are retained; article files are never modified or deleted.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const categories = ['rules', 'world-racing', 'other'];
const gridPattern = /(<div class="placeholder-grid" data-article-list>)([\s\S]*?)(<\/div>)/;
const cardPattern = /<a class="placeholder-card article-card world-article-card"[\s\S]*?<\/a>/g;
const archiveCard = '<a class="placeholder-card article-card" href="archive/"><span>ARCHIVE</span><h3>過去の記事</h3><p>過去の記事を見る →</p></a>';
const plan = [];

for (const category of categories) {
  const indexPath = path.join(root, category, 'index.html');
  let index = fs.readFileSync(indexPath, 'utf8');
  const cards = [...index.matchAll(cardPattern)].map(([html]) => ({
    html,
    href: html.match(/href="([^"]+)"/)[1],
    date: html.match(/datetime="([^"]+)"/)[1],
    title: html.match(/<h3>([\s\S]*?)<\/h3>/)[1].replace(/<br\s*\/?\s*>/g, ' ')
  })).sort((a, b) => b.date.localeCompare(a.date));
  if (!cards.length || new Set(cards.map(c => c.href)).size !== cards.length) throw Error(category + ': missing or duplicate article cards');
  const archivePath = path.join(root, category, 'archive', 'index.html');
  const existing = fs.existsSync(archivePath) ? fs.readFileSync(archivePath, 'utf8') : '';
  const archived = [...existing.matchAll(/<a href="\.\.\/([^"]+)"><time datetime="([^"]+)">[^<]*<\/time><span>([\s\S]*?)<\/span><\/a>/g)].map(m => ({ href: m[1], date: m[2], title: m[3] }));
  if (new Set(archived.map(c => c.href)).size !== archived.length) throw Error(category + ': duplicate archive entries');
  const latest = cards.slice(0, 2);
  const past = new Map(archived.map(c => [c.href, c]));
  for (const c of cards.slice(2)) past.set(c.href, c);
  for (const c of latest) past.delete(c.href);
  const rows = [...past.values()].sort((a, b) => b.date.localeCompare(a.date));
  const before = new Set([...cards, ...archived].map(c => c.href));
  const after = [...latest, ...rows].map(c => c.href);
  if (after.length !== before.size || after.some(href => !before.has(href))) throw Error(category + ': article loss or duplication');
  const rowHtml = rows.map(c => '<a href="../' + c.href + '"><time datetime="' + c.date + '">' + c.date.replaceAll('-', '.') + '</time><span>' + c.title + '</span></a>').join('');
  const listHtml = '<div class="deep-archive-list">' + rowHtml + '</div>' + (rows.length ? '' : '<p class="edition-empty">過去の記事はまだありません。</p>');
  const categoryTitle = index.match(/<h1>([\s\S]*?)<\/h1>/)[1];
  const head = index.slice(0, index.indexOf('<main>')).replace(/(href|src)="(\.\.\/[^\"]*)"/g, (_, attr, url) => attr + '="../' + url + '"').replace(/<title>[\s\S]*?<\/title>/, '<title>過去の記事｜' + categoryTitle + '｜OGBうまラボ</title>').replace('</head>', '<link rel="stylesheet" href="../../deep-archive.css"></head>');
  const footer = index.slice(index.indexOf('<footer class="site-footer">')).replace(/(href|src)="(\.\.\/[^\"]*)"/g, (_, attr, url) => attr + '="../' + url + '"');
  const main = '<main><section class="page-hero"><div class="container"><div class="breadcrumbs"><a href="../../../">ホーム</a> ／ <a href="../../">競馬の知識・深掘り</a> ／ <a href="../">' + categoryTitle + '</a> ／ 過去の記事</div><p class="eyebrow">ARCHIVE</p><h1>過去の記事</h1><p class="lead">' + categoryTitle + '</p></div></section><section class="page-body"><div class="container"><div class="page-intro"><h2>記事アーカイブ</h2><p>最新2記事より前の記事を、新しい日付順に掲載しています。</p></div>' + listHtml + '<div class="article-back"><a href="../">' + categoryTitle + 'の記事一覧へ</a></div></div></section></main>';
  // The Other category previously separated its one article and an empty section.
  if (category === 'other' && index.includes('<nav class="edition-nav"')) {
    const start = index.indexOf('<nav class="edition-nav"');
    const end = index.indexOf('</div></section></main>', start);
    index = index.slice(0, start) + '<section id="overseas-info" class="edition-section" aria-labelledby="other-articles"><div class="edition-heading"><h2 id="other-articles">記事一覧</h2><span>OTHER</span></div><div class="placeholder-grid" data-article-list>' + cards.map(c => c.html).join('') + '</div></section>' + index.slice(end);
  }
  if (!gridPattern.test(index)) throw Error(category + ': article list not found');
  const revised = index.replace(gridPattern, (_, open, body, close) => open + latest.map(c => c.html).join('') + archiveCard + close);
  plan.push({ category, archivePath, archive: head + main + footer, indexPath, revised, latest: latest.map(c => c.href), archived: rows.map(c => c.href) });
}

// Save and verify every archive before removing any full cards from category lists.
for (const item of plan) {
  fs.mkdirSync(path.dirname(item.archivePath), { recursive: true });
  fs.writeFileSync(item.archivePath, item.archive);
  if (fs.readFileSync(item.archivePath, 'utf8') !== item.archive) throw Error('Archive write verification failed');
}
for (const item of plan) fs.writeFileSync(item.indexPath, item.revised);
console.log(JSON.stringify(plan.map(({ category, latest, archived }) => ({ category, latest, archived })), null, 2));
