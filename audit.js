#!/usr/bin/env node
// YDS Hazirlik — Kod Denetcisi
// Calistir: node audit.js

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const ERRORS = [];
const WARNINGS = [];

function err(msg)  { ERRORS.push(msg); }
function warn(msg) { WARNINGS.push(msg); }

// ─── 1. CSS DEGİSKEN DENETİMİ ─────────────────────────────────────────────
function auditCssVars(html) {
  // Tanimlanan degiskenler (tum temalar)
  const defined = new Set();
  const defRe = /--([\w-]+)\s*:/g;
  let m;
  while ((m = defRe.exec(html)) !== null) defined.add(m[1]);

  // Kullanilan degiskenler
  const used = new Set();
  const useRe = /var\(--([\w-]+)[,)]/g;
  while ((m = useRe.exec(html)) !== null) used.add(m[1]);

  for (const v of used) {
    if (!defined.has(v)) err(`CSS: var(--${v}) kullanılıyor ama hiç tanımlanmamış`);
  }

  const unusedDefs = [...defined].filter(v => !used.has(v));
  // Sadece --s*, --fs-* gibi spacing/font sistemleri haric
  const notableUnused = unusedDefs.filter(v => !/^(s\d|fs-)/.test(v));
  if (notableUnused.length)
    warn(`CSS: Tanımlı ama hiç kullanılmayan değişkenler: ${notableUnused.map(v=>'--'+v).join(', ')}`);
}

// ─── 2. CSS SINIF DENETİMİ ───────────────────────────────────────────────────
function auditCssClasses(html) {
  // CSS'te tanimlanan siniflar
  const cssClasses = new Set();
  const cssRe = /\.([\w-]+)\s*[{,:]/g;
  let m;
  while ((m = cssRe.exec(html)) !== null) cssClasses.add(m[1]);

  // JS template literal + HTML'de kullanilan className'ler
  const usedClasses = new Set();
  const useRe = /class="([^"]+)"/g;
  while ((m = useRe.exec(html)) !== null)
    m[1].split(/\s+/).forEach(c => c && usedClasses.add(c));
  // JS'teki dinamik siniflar (class="... ${...}")
  const jsRe = /className\s*=\s*['"`]([^'"`]+)['"`]/g;
  while ((m = jsRe.exec(html)) !== null)
    m[1].split(/\s+/).forEach(c => c && !/[${}]/.test(c) && usedClasses.add(c));

  // Kritik siniflar: kullanilan ama CSS'te tanimlanmamis
  const ignore = new Set(['active','hidden','done','locked','selected','dark','light',
    'just-done','no-select','scrolled','open','closed','visible','invalid','disabled',
    'ad-slot','banner','mq-result','mq-result-score','mq-result-msg','btn-green',
    'btn-primary','btn-outline','btn-sm','cobweb','heavy',
  ]);
  for (const c of usedClasses) {
    // Template literal kalıntısı olan satirlari atla
    if (c.includes('$') || c.includes('{') || c.includes('}') || c.includes("'") || c.includes(':')) continue;
    if (!cssClasses.has(c) && !ignore.has(c) && !/^(js-|is-|has-)/.test(c))
      warn(`CSS: .${c} HTML'de kullanılıyor ama CSS'te tanımlanmamış`);
  }
}

// ─── 3. DAHİLİ LINK DENETİMİ ────────────────────────────────────────────────
function auditLinks(html) {
  const linkRe = /href="\/?([\w-]+\.html)"/g;
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    const file = path.join(ROOT, m[1]);
    if (!fs.existsSync(file)) err(`Link: ${m[1]} linkleniyor ama dosya yok`);
  }
}

// ─── 4. SİTEMAP DENETİMİ ────────────────────────────────────────────────────
function auditSitemap() {
  const sitemapPath = path.join(ROOT, 'sitemap.xml');
  if (!fs.existsSync(sitemapPath)) { warn('sitemap.xml bulunamadı'); return; }

  const sitemap = fs.readFileSync(sitemapPath, 'utf8');
  const locRe = /<loc>https:\/\/yds-hazirlik\.com\/([\w-]+\.html)<\/loc>/g;
  let m;
  while ((m = locRe.exec(sitemap)) !== null) {
    const file = path.join(ROOT, m[1]);
    if (!fs.existsSync(file))
      err(`Sitemap: ${m[1]} sitemap'te var ama dosya yok`);
  }

  // Dosyada olan ama sitemap'te olmayan .html (hariç tutulanlar haric)
  const allHtml = fs.readdirSync(ROOT).filter(f => f.endsWith('.html') && f !== 'index.html' && !SKIP_FILES.has(f));
  for (const f of allHtml) {
    if (!sitemap.includes(f))
      warn(`Sitemap: ${f} dosyası var ama sitemap'e eklenmemiş`);
  }
}

// ─── 5. JS FONKSİYON DENETİMİ ────────────────────────────────────────────────
function auditJsFunctions(html) {
  // onclick="xxx()" gibi kullanimi kontrol et
  const calls = new Set();
  const callRe = /onclick="([\w]+)\(/g;
  let m;
  while ((m = callRe.exec(html)) !== null) calls.add(m[1]);

  // Tanimlanan fonksiyonlar (hem function xxx() hem window.xxx = function)
  const defs = new Set();
  const defRe = /function ([\w]+)\s*\(/g;
  while ((m = defRe.exec(html)) !== null) defs.add(m[1]);
  const winRe = /(?:window|self)\.([\w]+)\s*=/g;
  while ((m = winRe.exec(html)) !== null) defs.add(m[1]);

  const builtins = new Set(['alert','confirm','prompt','setTimeout','setInterval',
    'clearTimeout','clearInterval','console','Math','JSON','Object','Array',
    'parseInt','parseFloat','encodeURIComponent','decodeURIComponent']);

  for (const fn of calls) {
    if (!defs.has(fn) && !builtins.has(fn))
      warn(`JS: onclick="${fn}()" çağrılıyor ama function tanımı bulunamadı`);
  }
}

// ─── 6. META TAG DENETİMİ ────────────────────────────────────────────────────
function auditMeta(html, filename) {
  if (!html.includes('<title>'))
    err(`${filename}: <title> etiketi yok`);
  if (!html.includes('name="description"'))
    err(`${filename}: meta description yok`);
  if (!html.includes('rel="canonical"'))
    warn(`${filename}: canonical link yok`);
}

// ─── ÇALIŞTIR ────────────────────────────────────────────────────────────────
console.log('\nYDS Hazirlik — Denetim Basliyor...\n');

// index.html
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
auditCssVars(indexHtml);
auditCssClasses(indexHtml);
auditLinks(indexHtml);
auditJsFunctions(indexHtml);
auditMeta(indexHtml, 'index.html');

// Denetimden hariç tutulacak dosyalar (3. parti, oyunlar, eski)
const SKIP_FILES = new Set(['googlec5912f2f52c92300.html','bouncing-ball-game.html','kutu-oyunu.html','yds-hazirlik.html']);

// Diger HTML dosyalari
const htmlFiles = fs.readdirSync(ROOT).filter(f => f.endsWith('.html') && f !== 'index.html' && !SKIP_FILES.has(f));
for (const f of htmlFiles) {
  const content = fs.readFileSync(path.join(ROOT, f), 'utf8');
  auditMeta(content, f);
}

// Sitemap
auditSitemap();

// ─── RAPOR ───────────────────────────────────────────────────────────────────
const total = ERRORS.length + WARNINGS.length;

if (ERRORS.length) {
  console.log(`HATALAR (${ERRORS.length}):`);
  ERRORS.forEach(e => console.log(`  [HATA] ${e}`));
  console.log('');
}

if (WARNINGS.length) {
  console.log(`UYARILAR (${WARNINGS.length}):`);
  WARNINGS.forEach(w => console.log(`  [UYARI] ${w}`));
  console.log('');
}

if (total === 0) {
  console.log('Her sey temiz! Sorun bulunamadi.\n');
} else {
  console.log(`Toplam: ${ERRORS.length} hata, ${WARNINGS.length} uyari\n`);
}

process.exit(ERRORS.length > 0 ? 1 : 0);
