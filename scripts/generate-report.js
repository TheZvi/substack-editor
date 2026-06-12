// Generate HTML report from Substack metrics JSON
const fs = require('fs');

const data = JSON.parse(fs.readFileSync('C:/Users/Zvi Mowshowitz/substack-editor/scripts/substack-metrics.json', 'utf8'));

function fmt(n) { return (n || 0).toLocaleString(); }

let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Don't Worry About the Vase - Substack Metrics Report</title>
<style>
  body { font-family: Georgia, serif; max-width: 900px; margin: 40px auto; padding: 0 20px; color: #222; line-height: 1.6; }
  h1 { border-bottom: 3px solid #333; padding-bottom: 10px; }
  h2 { border-bottom: 1px solid #999; padding-bottom: 5px; margin-top: 40px; }
  h3 { margin-top: 30px; color: #444; }
  table { border-collapse: collapse; width: 100%; margin: 15px 0; }
  th, td { border: 1px solid #ccc; padding: 8px 12px; text-align: left; }
  th { background: #f5f5f5; font-weight: bold; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr:nth-child(even) { background: #fafafa; }
  .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; margin: 20px 0; }
  .summary-card { background: #f8f8f8; border: 1px solid #ddd; border-radius: 8px; padding: 15px; text-align: center; }
  .summary-card .number { font-size: 28px; font-weight: bold; color: #333; }
  .summary-card .label { font-size: 14px; color: #666; margin-top: 5px; }
  .note { color: #888; font-style: italic; font-size: 14px; margin: 10px 0; }
  a { color: #1a5276; }
  .rank { color: #999; font-size: 13px; }
  @media print { body { max-width: 100%; } }
</style>
</head>
<body>

<h1>Don't Worry About the Vase &mdash; Substack Metrics Report</h1>
<p class="note">Generated ${new Date(data.generatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} from thezvi.substack.com public API</p>
<p class="note">Note: View counts and subscriber data require authenticated dashboard access and are not included in this report. Posts are ranked by likes as a proxy for engagement.</p>

<h2>Overall Summary</h2>
<div class="summary-grid">
  <div class="summary-card"><div class="number">${fmt(data.totalPosts)}</div><div class="label">Total Posts</div></div>
  <div class="summary-card"><div class="number">${fmt(data.totalLikes)}</div><div class="label">Total Likes</div></div>
  <div class="summary-card"><div class="number">${fmt(data.totalComments)}</div><div class="label">Total Comments</div></div>
  <div class="summary-card"><div class="number">${fmt(data.totalWords)}</div><div class="label">Total Words</div></div>
</div>

<h2>Yearly Summary</h2>
<table>
<tr><th>Year</th><th>Posts</th><th>Likes</th><th>Comments</th><th>Words</th><th>Avg Likes/Post</th></tr>`;

const years = Object.keys(data.byYear).sort();
for (const year of years) {
  const s = data.byYear[year];
  const avg = s.totalPosts > 0 ? Math.round(s.totalLikes / s.totalPosts) : 0;
  html += `\n<tr><td><strong>${year}</strong></td><td class="num">${fmt(s.totalPosts)}</td><td class="num">${fmt(s.totalLikes)}</td><td class="num">${fmt(s.totalComments)}</td><td class="num">${fmt(s.totalWordCount)}</td><td class="num">${fmt(avg)}</td></tr>`;
}
html += `\n</table>`;

html += `\n\n<h2>Monthly Summary</h2>
<table>
<tr><th>Month</th><th>Posts</th><th>Likes</th><th>Comments</th><th>Words</th></tr>`;

for (const m of data.byMonth) {
  html += `\n<tr><td>${m.month}</td><td class="num">${fmt(m.posts)}</td><td class="num">${fmt(m.likes)}</td><td class="num">${fmt(m.comments)}</td><td class="num">${fmt(m.words)}</td></tr>`;
}
html += `\n</table>`;

// Top posts by year (only years with meaningful data)
const significantYears = years.filter(y => data.byYear[y].totalPosts >= 5);
for (const year of significantYears) {
  const s = data.byYear[year];
  const tops = s.topPosts.slice(0, 25);
  html += `\n\n<h2>Top ${Math.min(25, tops.length)} Posts of ${year}</h2>
<p class="note">${s.totalPosts} posts published | ${fmt(s.totalLikes)} total likes | ${fmt(s.totalComments)} total comments</p>
<table>
<tr><th>#</th><th>Title</th><th>Date</th><th>Likes</th><th>Comments</th><th>Words</th></tr>`;

  tops.forEach((p, i) => {
    html += `\n<tr><td class="rank">${i + 1}</td><td><a href="${p.url}" target="_blank">${escHtml(p.title)}</a></td><td>${p.date || ''}</td><td class="num">${fmt(p.likes)}</td><td class="num">${fmt(p.comments)}</td><td class="num">${fmt(p.wordCount)}</td></tr>`;
  });
  html += `\n</table>`;
}

html += `\n\n</body></html>`;

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const outPath = 'C:/Users/Zvi Mowshowitz/substack-editor/scripts/substack-metrics-report.html';
fs.writeFileSync(outPath, html);
console.log('Report written to:', outPath);
console.log('Size:', (fs.statSync(outPath).size / 1024).toFixed(1) + ' KB');
