/* 간단 해시 라우터: #/  (목록), #/post/<slug>, #/tags, #/tag/<name> */
const md = window.markdownit({ html: true, linkify: true, typographer: true, highlight(str, lang) {
  try { return window.hljs.highlight(str, { language: lang }).value; }
  catch { return window.hljs.highlightAuto(str).value; }
}});
const app = document.getElementById('app');
document.getElementById('year').textContent = new Date().getFullYear();

const state = {
  posts: [],               // posts/index.json 로드 결과
  tags: new Map(),         // tag → [post...]
};

async function loadIndex() {
  if (state.posts.length) return;
  const res = await fetch('posts/index.json', { cache: 'no-store' });
  const list = await res.json();
  // 최신 글이 위로 오도록 정렬
  list.sort((a, b) => new Date(b.date) - new Date(a.date));
  state.posts = list;

  // 태그 맵 구성
  for (const p of state.posts) {
    (p.tags || []).forEach(t => {
      const key = String(t).trim();
      if (!state.tags.has(key)) state.tags.set(key, []);
      state.tags.get(key).push(p);
    });
  }
}

function tplPostCard(p) {
  return `
  <article class="post-card">
    <h2><a href="#/post/${encodeURIComponent(p.slug)}">${p.title}</a></h2>
    <div class="meta">${dayjs(p.date).format('YYYY.MM.DD')} · ${(p.tags||[]).map(t=>`<a class="tag" href="#/tag/${encodeURIComponent(t)}">${t}</a>`).join(' ')}</div>
    ${p.excerpt ? `<p>${p.excerpt}</p>` : ''}
  </article>`;
}

async function renderHome() {
  await loadIndex();
  app.innerHTML = `<section>
    ${state.posts.map(tplPostCard).join('')}
  </section>`;
  window.scrollTo(0,0);
}

async function renderTags() {
  await loadIndex();
  const items = [...state.tags.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
  app.innerHTML = `<section>
    <h1>Tags</h1>
    ${items.map(([tag, posts]) => `
      <h3 id="tag-${encodeURIComponent(tag)}">${tag} <small>(${posts.length})</small></h3>
      ${posts.slice(0,5).map(tplPostCard).join('')}
      <p><a href="#/tag/${encodeURIComponent(tag)}">…more</a></p>
    `).join('')}
  </section>`;
  window.scrollTo(0,0);
}

async function renderTag(name) {
  await loadIndex();
  const posts = state.tags.get(name) || [];
  app.innerHTML = `<section>
    <h1>Tag: ${name}</h1>
    ${posts.map(tplPostCard).join('') || '<p>No posts.</p>'}
  </section>`;
  window.scrollTo(0,0);
}

function splitFrontMatter(text) {
  // ---\n yaml \n---\n markdown
  if (text.startsWith('---')) {
    const end = text.indexOf('\n---', 3);
    if (end !== -1) {
      const yaml = text.slice(3, end).trim();
      const body = text.slice(end + 4).trim();
      return { fm: window.jsyaml.load(yaml) || {}, body };
    }
  }
  return { fm: {}, body: text };
}

async function renderPost(slug) {
  const path = `posts/${slug}.md`;
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) {
    app.innerHTML = `<p>포스트를 찾을 수 없습니다: ${slug}</p>`;
    return;
  }
  const raw = await res.text();
  const { fm, body } = splitFrontMatter(raw);
  const html = md.render(body);
  app.innerHTML = `
    <article class="post">
      <h1>${fm.title || slug}</h1>
      <div class="meta">${fm.date ? dayjs(fm.date).format('YYYY.MM.DD') : ''} 
        ${(fm.tags||[]).map(t=>`· <a class="tag" href="#/tag/${encodeURIComponent(t)}">${t}</a>`).join(' ')}
      </div>
      <div class="post-content">${html}</div>
    </article>
  `;
  // 내부 앵커, 코드 하이라이트는 markdown-it + highlight.js로 이미 처리됨
  window.scrollTo(0,0);
}

function router() {
  const hash = location.hash || '#/';
  const [, route, param] = hash.split('/'); // ["#", "", ""] or ["#", "post", "slug"]
  if (!route) return renderHome();
  if (route === 'post' && param) return renderPost(decodeURIComponent(param));
  if (route === 'tags') return renderTags();
  if (route === 'tag' && param) return renderTag(decodeURIComponent(param));
  return renderHome();
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', () => router());
