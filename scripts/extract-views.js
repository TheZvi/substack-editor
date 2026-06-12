// Paste this into your browser console on any thezvi.substack.com page while logged in.
// It fetches view counts for all posts via the authenticated API, then downloads a JSON file.

(async () => {
  const SUBDOMAIN = 'thezvi';
  const BASE = `https://${SUBDOMAIN}.substack.com`;
  const LIMIT = 25;
  let offset = 0;
  let allPosts = [];

  console.log('Fetching post stats from Substack dashboard API...');

  while (true) {
    const url = `${BASE}/api/v1/post/management?offset=${offset}&limit=${LIMIT}&order_by=post_date&order_direction=desc`;
    const res = await fetch(url, { credentials: 'include' });

    if (res.status === 429) {
      console.log('Rate limited, waiting 30s...');
      await new Promise(r => setTimeout(r, 30000));
      continue;
    }

    if (!res.ok) {
      console.error('API error:', res.status, await res.text());
      break;
    }

    const data = await res.json();
    const posts = data.posts || data;

    if (!Array.isArray(posts) || posts.length === 0) break;

    for (const p of posts) {
      allPosts.push({
        id: p.id,
        slug: p.slug,
        title: p.title,
        date: (p.post_date || '').split('T')[0],
        views: p.page_views || p.views || p.email_views || 0,
        pageViews: p.page_views || 0,
        emailViews: p.email_views || 0,
        likes: p.reaction_count || p.reactions?.length || 0,
        comments: p.comment_count || 0
      });
    }

    console.log(`  ${allPosts.length} posts fetched...`);
    offset += posts.length;

    if (posts.length < LIMIT) break;
    await new Promise(r => setTimeout(r, 300));
  }

  // Also try the stats aggregate endpoint for subscriber data
  let subscriberData = null;
  try {
    const statsRes = await fetch(`${BASE}/api/v1/stats/aggregate`, { credentials: 'include' });
    if (statsRes.ok) subscriberData = await statsRes.json();
  } catch(e) { console.log('Could not fetch subscriber stats:', e.message); }

  const output = {
    generatedAt: new Date().toISOString(),
    totalPosts: allPosts.length,
    totalViews: allPosts.reduce((s, p) => s + (p.views || 0), 0),
    subscriberData,
    posts: allPosts
  };

  // Download as file
  const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'substack-views.json';
  a.click();

  console.log(`Done! ${allPosts.length} posts. Total views: ${output.totalViews.toLocaleString()}`);
  console.log('File downloaded as substack-views.json');
})();
