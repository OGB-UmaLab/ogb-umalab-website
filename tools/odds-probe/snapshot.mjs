import {readFile,writeFile} from 'node:fs/promises';
const clean = s => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim();
const key = (...numbers) => numbers.sort((a,b) => a-b).join('-');
const rows = html => [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(x => x[1]);
const cells = row => [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(x => clean(x[1]));

export function parseOdds(html, raceId) {
  const title = clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
  const date = [raceId.slice(0,4),raceId.slice(4,6),raceId.slice(6,8)].join('/');
  const race = Number(raceId.slice(-2));
  if (!title.includes('三連複') || !title.includes(date + ' ' + race + 'R')) throw Error('対象レースが一致しません');
  const tables = [...html.matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi)];
  const raceCard = tables.find(t => t[1].includes('aria-label="出馬表"'));
  const horses = raceCard ? rows(raceCard[2]).map(row => Number(cells(row)[0])) : [];
  if (horses.length < 3 || new Set(horses).size !== horses.length
      || horses.some(n => !Number.isInteger(n) || n < 1)) throw Error('馬番一覧を検証できません');
  const expected = new Set();
  for (let i=0;i<horses.length;i++) for (let j=i+1;j<horses.length;j++) {
    for (let k=j+1;k<horses.length;k++) expected.add(key(horses[i],horses[j],horses[k]));
  }
  const odds = new Map(), axes = new Set();
  for (const table of tables.filter(t => /summary=['"]三連複オッズ['"]/.test(t[1]))) {
    const pairs = rows(table[2]).flatMap(row => [...row.matchAll(
      /<th\b[^>]*>\s*(\d+)\s*<\/th>\s*<td\b[^>]*data-grouping=['"](\d+)['"][^>]*>([\s\S]*?)<\/td>/gi
    )].map(([,c,b,value]) => [Number(b),Number(c),clean(value)]));
    const seen = new Set(pairs.flatMap(([b,c]) => [b,c]));
    const axis = horses.filter(n => !seen.has(n));
    if (axis.length !== 1 || axes.has(axis[0])) throw Error('馬番順表の軸を特定できません');
    axes.add(axis[0]);
    for (const [b,c,value] of pairs) {
      const combination = key(axis[0],b,c);
      if (!expected.has(combination) || !/^\d+(?:\.\d+)?$/.test(value)) throw Error('不正な馬番順セル');
      if (odds.has(combination) && odds.get(combination) !== value) throw Error('馬番順表の値が一致しません');
      odds.set(combination,value);
    }
  }
  if (odds.size !== expected.size) throw Error('全組み合わせを取得できません');
  const ranking = tables.map(t => rows(t[2]).map(cells)).find(r => r[0]?.join('|') === '順位|組番|オッズ')?.slice(1);
  if (!ranking?.length) throw Error('人気順表を確認できません');
  const ranked = new Set();
  for (const [,combination,value] of ranking) {
    if (ranked.has(combination) || odds.get(combination) !== value) throw Error('人気順表と値が一致しません');
    ranked.add(combination);
  }
  const entries = [...odds].map(([combination,display]) => ({combination,display,odds:Number(display)>0 ? Number(display) : null}));
  const listedTime = clean(html).match(/\d{1,2}:\d{2}\s*時点/)?.[0] ?? null;
  return {title, listedTime, fetchedAt:new Date().toISOString(), horses:horses.length,
    expected:expected.size, actual:entries.length, rankingMatches:ranked.size, entries};
}


const [raceId,input,output]=process.argv.slice(2);
if (!/^20\d{16}$/.test(raceId) || !input || !output) throw Error('Usage: node snapshot.mjs RACEID INPUT_HTML OUTPUT_JSON');
const result=parseOdds(await readFile(input,'utf8'),raceId);
await writeFile(output,JSON.stringify({raceId,...result},null,2)+'\n','utf8');
console.log(`PASS: ${result.actual}/${result.expected}; ranking matches: ${result.rankingMatches}`);
