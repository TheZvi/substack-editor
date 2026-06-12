// Fetch all Substack metrics via public API
const https = require('https');
const fs = require('fs');

function httpsFetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    }).on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchAllPosts() {
  let allPosts = [];
  let offset = 0;
  const limit = 12;

  while (true) {
    const url = `https://thezvi.substack.com/api/v1/archive?sort=new&limit=${limit}&offset=${offset}`;
    const r = await httpsFetch(url);

    if (r.status === 429) {
      process.stdout.write('  Rate limited, waiting 30s...\n');
      await sleep(30000);
      continue; // retry same offset
    }

    if (r.status !== 200) {
      console.error('API error:', r.status);
      break;
    }

    let data;
    try { data = JSON.parse(r.body); } catch(e) { console.error('Parse error'); break; }

    if (!Array.isArray(data) || data.length === 0) break;

    allPosts = allPosts.concat(data.map(p => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      postDate: p.post_date,
      audience: p.audience,
      type: p.type,
      wordCount: p.wordcount || 0,
      likes: p.reaction_count || 0,
      comments: p.comment_count || 0,
      childComments: p.child_comment_count || 0,
      subtitle: p.subtitle || '',
      url: `https://thezvi.substack.com/p/${p.slug}`
    })));

    process.stdout.write(`  ${allPosts.length} posts fetched...\r`);
    offset += data.length;

    if (data.length < limit) break;
    await sleep(500); // be gentle
  }
  process.stdout.write('\n');
  return allPosts;
}

async function main() {
  console.log('=== Fetching all published posts from thezvi.substack.com ===');
  const posts = await fetchAllPosts();
  console.log(`Total: ${posts.length} published posts`);

  // Compile metrics
  console.log('\n=== Compiling metrics ===');

  const byYear = {};
  posts.forEach(p => {
    const year = new Date(p.postDate).getFullYear();
    if (!byYear[year]) byYear[year] = [];
    byYear[year].push(p);
  });

  const yearStats = {};
  for (const [year, yPosts] of Object.entries(byYear)) {
    const sorted = [...yPosts].sort((a, b) => b.likes - a.likes);
    yearStats[year] = {
      totalPosts: yPosts.length,
      totalLikes: yPosts.reduce((s, p) => s + (p.likes || 0), 0),
      totalComments: yPosts.reduce((s, p) => s + (p.comments || 0), 0),
      totalWordCount: yPosts.reduce((s, p) => s + (p.wordCount || 0), 0),
      topPosts: sorted.slice(0, 25).map(p => ({
        title: p.title,
        likes: p.likes,
        comments: p.comments,
        wordCount: p.wordCount,
        date: p.postDate?.split('T')[0],
        url: p.url
      }))
    };
  }

  const byMonth = {};
  posts.forEach(p => {
    const d = new Date(p.postDate);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    if (!byMonth[key]) byMonth[key] = { posts: 0, likes: 0, comments: 0, words: 0 };
    byMonth[key].posts += 1;
    byMonth[key].likes += (p.likes || 0);
    byMonth[key].comments += (p.comments || 0);
    byMonth[key].words += (p.wordCount || 0);
  });

  const output = {
    generatedAt: new Date().toISOString(),
    blog: "Don't Worry About the Vase (thezvi.substack.com)",
    note: "View counts require authenticated access (CDP connection to Substack dashboard). Likes/comments are from the public API.",
    totalPosts: posts.length,
    totalLikes: posts.reduce((s, p) => s + (p.likes || 0), 0),
    totalComments: posts.reduce((s, p) => s + (p.comments || 0), 0),
    totalWords: posts.reduce((s, p) => s + (p.wordCount || 0), 0),
    byYear: yearStats,
    byMonth: Object.entries(byMonth).sort().map(([m, d]) => ({ month: m, ...d })),
    allPosts: posts
  };

  const outPath = 'C:/Users/Zvi Mowshowitz/substack-editor/scripts/substack-metrics.json';
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  // Print summary
  console.log('\n========================================');
  console.log("  Don't Worry About the Vase - Metrics");
  console.log('========================================');
  console.log(`Total posts: ${output.totalPosts}`);
  console.log(`Total likes: ${output.totalLikes.toLocaleString()}`);
  console.log(`Total comments: ${output.totalComments.toLocaleString()}`);
  console.log(`Total words: ${output.totalWords.toLocaleString()}`);

  console.log('\nBy Year:');
  for (const [year, stats] of Object.entries(yearStats).sort()) {
    console.log(`  ${year}: ${stats.totalPosts} posts, ${stats.totalLikes.toLocaleString()} likes, ${stats.totalComments.toLocaleString()} comments, ${stats.totalWordCount.toLocaleString()} words`);
  }

  console.log('\nBy Month (recent):');
  const months = Object.entries(byMonth).sort().reverse().slice(0, 12).reverse();
  for (const [m, d] of months) {
    console.log(`  ${m}: ${d.posts} posts, ${d.likes} likes, ${d.comments} comments`);
  }

  console.log('\nData saved to:', outPath);
  process.exit(0);
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
