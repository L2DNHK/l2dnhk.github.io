/* ====== GitHub 설정: 여기를 본인 저장소로 바꿔주세요 ====== */
const GH = {
  owner: "USERNAME",                    // 예: "dnh-lx"
  repo:  "USERNAME.github.io",          // 사용자 페이지면 보통 이 이름
  branch:"main",                        // 기본 브랜치
  dir:   "posts",                       // 게시물 폴더
  token: null,                          // 필요시 읽기 전용 토큰(없으면 null)
};
/* ========================================================== */

const md = window.markdownit({
  html: true, linkify: true, typographer: true,
  highlight(str, lang) {
    try { return window.hljs.highlight(str, { language: lang }).value; }
    catch { return window.hljs.highlightAuto(str).value; }
  }
});
const app = document.getElementById("app");
document.getElementById("year").textContent = new Date().getFullYear();

const state = { posts: [], tags: new Map(), loaded: false };

function ghHeaders() {
  const h = { "Accept": "application/vnd.github+json" };
  if (GH.token) h["Authorization"] = `Bearer ${GH.token}`;
  return h;
}

/** posts/ 폴더 내 .md 파일 리스트 */
async function listPostFiles() {
  const url = `https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/${GH.dir}?ref=${encodeURIComponent(GH.branch)}`;
  const res = await fetch(url, { headers: ghHeaders(), cache: "no-store" });
  if (!res.ok) throw new Error("GitHub API 목록 호출 실패");
  const items = await res.json();
  return items
    .filter(it => it.type === "file" && /\.md$/i.test(it.name))
    .map(it => ({
      name: it.name,
      slug: it.name.replace(/\.md$/i, ""),
      path: it.path,
    }));
}

/** raw.githubusercontent.com에서 파일 원문 다운로드 */
async function fetchRawFile(path) {
  const url = `https://raw.githubusercontent.com/${GH.owner}/${GH.repo}/${GH.branch}/${path}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`파일 로드 실패: ${path}`);
  return await res.text();
}

function splitFrontMatter(text) {
  if (text.startsWith("---")) {
    const end = text.indexOf("\n---", 3);
    if (end !== -1) {
      const yaml = text.slice(3, end).trim();
      const body = text.slice(end + 4).trim();
      return { fm: window.jsyaml.load(yaml) || {}, body };
    }
  }
  return { fm: {}, body: text };
}

function collectTags(posts) {
  const map = new Map();
  for (const p of posts) {
    (p.tags || []).forEach(t => {
      const key = String(t).trim();
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    });
  }
  return map;
}

/** 최초 로딩: 파일 목록 → 각 문서 파싱 → 메타 수집 */
async function loadIndex() {
  if (state.loaded) return;
  const files = await listPostFiles();

  // 병렬로 적당히(너무 많으면 배치) 로드
  const chunks = [];
  const BATCH = 8;
  for (let i = 0; i < files.length; i += BATCH) chunks.push(files.slice(i, i + BATCH));

  const posts = [];
  for (const batch of chunks) {
    const texts = await Promise.all(batch.map(f => fetchRawFile(f.path).then(txt => ({ f, txt }))));
    for (const { f, txt } of texts) {
      const { fm, body } = splitFrontMatter(txt);
      posts.push({
        slug: f.slug,
        title: fm.title || f.slug,
        date: fm.date || null,
        tags: fm.tags || [],
        excerpt: fm.excerpt || null,
        body, // 상세 페이지에서만 사용
      });
    }
  }

  // 날짜 내림차순(없으면 맨 아래)
  posts.sort((a,b) => new Date(b.date||0) - new Date(a.date||0));

  state.posts = posts;
  state.tags  = collectTags(posts);
  state.loaded = true;
}

function tplPostCard(p) {
  return `
  <article class="post-card">
    <h2><a href="#/post/${encodeURIComponent(p.slug)}">${p.title}</a></h2>
    <div class="meta">${p.date ? dayjs(p.date).format("YYYY.MM.DD") : ""} 
      ${(p.tags||[]).map(t=>`<a class="tag" href="#/tag/${encodeURIComponent(t)}">${t}</a>`).join(" ")}
    </div>
    ${p.excerpt ? `<p>${p.excerpt}</p>` : ""}
  </article>`;
}

async function renderHome() {
  await loadIndex();
  app.innerHTML = `<section>${state.posts.map(tplPostCard).join("")}</section>`;
  window.scrollTo(0,0);
}

async function renderTags() {
  await loadIndex();
  const items = [...state.tags.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
  app.innerHTML = `<section>
    <h1>Tags</h1>
    ${items.map(([tag, posts]) => `
      <h3 id="tag-${encodeURIComponent(tag)}">${tag} <small>(${posts.length})</small></h3>
      ${posts.slice(0,5).map(tplPostCard).join("")}
      <p><a href="#/tag/${encodeURIComponent(tag)}">…more</a></p>
    `).join("")}
  </section>`;
  window.scrollTo(0,0);
}

async function renderTag(name) {
  await loadIndex();
  const posts = state.tags.get(name) || [];
  app.innerHTML = `<section>
    <h1>Tag: ${name}</h1>
    ${posts.map(tplPostCard).join("") || "<p>No posts.</p>"}
  </section>`;
  window.scrollTo(0,0);
}

async function renderPost(slug) {
  await loadIndex();
  const p = state.posts.find(x => x.slug === slug);
  if (!p) { app.innerHTML = `<p>포스트를 찾을 수 없습니다: ${slug}</p>`; return; }
  const html = md.render(p.body);
  app.innerHTML = `
    <article class="post">
      <h1>${p.title}</h1>
      <div class="meta">${p.date ? dayjs(p.date).format("YYYY.MM.DD") : ""} 
        ${(p.tags||[]).map(t=>`· <a class="tag" href="#/tag/${encodeURIComponent(t)}">${t}</a>`).join(" ")}
      </div>
      <div class="post-content">${html}</div>
    </article>
  `;
  window.scrollTo(0,0);
}

function router() {
  const hash = location.hash || "#/";
  const [, route, param] = hash.split("/");
  if (!route) return renderHome();
  if (route === "post" && param) return renderPost(decodeURIComponent(param));
  if (route === "tags") return renderTags();
  if (route === "tag" && param) return renderTag(decodeURIComponent(param));
  return renderHome();
}

window.addEventListener("hashchange", router);
window.addEventListener("DOMContentLoaded", () => router());
