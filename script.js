// Only rewrite explicit UmaLab-home links; never rewrite research-site links.
if (/^\/(?:global-news|ogb-data|class-promotion|knowledge|about|privacy|umalab)(?:\/|$)/.test(location.pathname)) {
  document.querySelectorAll('a[href]').forEach(link => {
    const raw = link.getAttribute('href');
    if (!raw || raw.startsWith('#')) return;
    const label = (link.textContent || '').trim();
    const isUmaLabHome = /^(OGBうまラボ|うまラボ|ホーム|トップページ|HOME)$/i.test(label) || link.classList.contains('brand');
    if (!isUmaLabHome) return;
    try {
      const target = new URL(raw, document.baseURI);
      if (target.origin === location.origin && target.pathname === '/' && !target.search && !target.hash) {
        link.setAttribute('href', '/umalab/');
      }
    } catch (_) { /* Keep original link. */ }
  });
}
const GA_MEASUREMENT_ID='G-KF9P62K5M8';window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config',GA_MEASUREMENT_ID);const gaScript=document.createElement('script');gaScript.async=true;gaScript.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(GA_MEASUREMENT_ID);document.head.append(gaScript);
// Shared UmaLab navigation. Leave the research site and unrelated tools untouched.
if (/^\/(?:global-news|ogb-data|class-promotion|knowledge|about|privacy|umalab)(?:\/|$)/.test(location.pathname)) {
  const umaLabNav = document.querySelector('.site-header .global-nav');
  if (umaLabNav) {
    umaLabNav.innerHTML = "<div class=\"nav-cluster\"><button class=\"nav-cluster-toggle\" type=\"button\" aria-expanded=\"false\">最新情報</button><div class=\"nav-submenu\"><a href=\"/global-news/#morning\">海外競馬ニュース【朝刊】</a><a href=\"/global-news/#evening\">OGB競馬NEWS EVENING</a><a href=\"/class-promotion/\">クラス昇級可能馬情報</a></div></div><div class=\"nav-cluster\"><button class=\"nav-cluster-toggle\" type=\"button\" aria-expanded=\"false\">主要コンテンツ</button><div class=\"nav-submenu\"><a href=\"/global-news/\">海外競馬ニュース</a><a href=\"/class-promotion/\">クラス昇級可能馬データ</a><a href=\"/ogb-data/\">OGB指数・競馬データ</a><a href=\"/knowledge/\">競馬の知識・深掘り</a></div></div><a href=\"/ogb-data/\">OGB指数・データ</a><div class=\"nav-cluster\"><button class=\"nav-cluster-toggle\" type=\"button\" aria-expanded=\"false\">競馬収支管理</button><div class=\"nav-submenu\"><a href=\"/racing-ledger/\">OGB競馬収支管理</a><a href=\"/knowledge/horse-racing-tax/\">競馬の税金・確定申告ガイド</a></div></div><a href=\"/about/\">OGB総合案内</a><a class=\"nav-research\" href=\"/\">OGBデータ研究所 ↗</a>";
    if (![...document.querySelectorAll('link[rel="stylesheet"]')].some(link => new URL(link.href).pathname === '/navigation.css')) {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = '/navigation.css'; document.head.append(css);
    }
  }
}
const toggle=document.querySelector('.nav-toggle');const nav=document.querySelector('.global-nav');toggle?.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')==='true';toggle.setAttribute('aria-expanded',String(!open));nav.classList.toggle('is-open',!open)});nav?.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>{toggle?.setAttribute('aria-expanded','false');nav.classList.remove('is-open')}));const footerYear=document.getElementById('year');if(footerYear)footerYear.textContent=new Date().getFullYear();const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;if(!reduced&&'IntersectionObserver'in window){const targets=document.querySelectorAll('.section-heading,.latest-card,.about-copy,.content-card,.data-visual,.data-copy');targets.forEach(el=>el.classList.add('reveal'));const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target)}}),{threshold:.12});targets.forEach(el=>observer.observe(el))}
const clusterButtons=[...document.querySelectorAll('.nav-cluster-toggle')];
const closeClusters=()=>clusterButtons.forEach(button=>button.setAttribute('aria-expanded','false'));
clusterButtons.forEach(button=>button.addEventListener('click',()=>{const open=button.getAttribute('aria-expanded')==='true';closeClusters();button.setAttribute('aria-expanded',String(!open))}));
document.addEventListener('click',event=>{if(!event.target.closest('.nav-cluster'))closeClusters()});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){const active=clusterButtons.find(button=>button.getAttribute('aria-expanded')==='true');closeClusters();active?.focus()}});
nav?.querySelectorAll('.nav-submenu a').forEach(link=>link.addEventListener('click',closeClusters));

const raceJump=document.querySelector('[data-race-jump]');if(raceJump){const races=[...document.querySelectorAll('.race-section')].map(section=>{const heading=section.querySelector('h2');const match=heading?.textContent.match(/^■\s*(\d+)R/);return match?{number:Number(match[1]),section}:null}).filter(Boolean).sort((a,b)=>a.number-b.number);if(races.length){raceJump.replaceChildren();const title=document.createElement('p');title.className='race-jump-title';title.textContent='レースへジャンプ';const links=document.createElement('div');links.className='race-jump-links';races.forEach(race=>{const id='race-'+race.number+'r';race.section.id=id;const link=document.createElement('a');link.href='#'+id;link.textContent=race.number+'R';links.append(link);const back=document.createElement('a');back.className='race-jump-back';back.href='#race-jump';back.textContent='↑ レース一覧へ戻る';race.section.append(back)});raceJump.append(title,links)}else{raceJump.hidden=true}}

document.querySelectorAll('[data-section-jump]').forEach(jump=>{const scope=jump.parentElement?.querySelector('[data-jump-scope]');const sections=scope?[...scope.querySelectorAll('[data-jump-section]')]:[];if(!sections.length){jump.hidden=true;return}const moveTo=(target,smooth=false)=>{const header=document.querySelector('.site-header')?.getBoundingClientRect().height||0;window.scrollTo({top:target.getBoundingClientRect().top+window.scrollY-header-24,behavior:smooth&&!reduced?'smooth':'auto'})};const title=document.createElement('p');title.className='section-jump-title';title.textContent=jump.getAttribute('aria-label')||'ページ内目次';const links=document.createElement('div');links.className='section-jump-links';sections.forEach((section,index)=>{if(!section.id)section.id='section-'+(index+1);const link=document.createElement('a');link.href='#'+section.id;link.textContent=section.dataset.jumpLabel||section.querySelector('h2')?.textContent.trim()||String(index+1);links.append(link);const back=document.createElement('a');back.className='section-jump-back';back.href='#section-jump';back.textContent='↑ 目次へ戻る';back.addEventListener('click',event=>{event.preventDefault();moveTo(jump,true);history.replaceState(null,'','#section-jump')});section.append(back)});jump.replaceChildren(title,links);if(location.hash){const target=scope.querySelector(location.hash);if(target){const align=()=>setTimeout(()=>moveTo(target),50);document.readyState==='complete'?align():window.addEventListener('load',align,{once:true})}}});