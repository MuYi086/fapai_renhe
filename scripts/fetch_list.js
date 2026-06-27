const https = require('https');
const fs = require('fs');
const path = require('path');

const RESULT_DIR = path.join(__dirname, '..', 'result');
const LIST_URL = 'https://www1.rmfysszc.gov.cn/News/Handler.aspx';
const HEADERS = {
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Connection': 'keep-alive',
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'Origin': 'https://www1.rmfysszc.gov.cn',
  'Referer': 'https://www1.rmfysszc.gov.cn/News/Pmgg.shtml',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
  'X-Requested-With': 'XMLHttpRequest',
  'sec-ch-ua': '""',
  'sec-ch-ua-mobile': '?1',
  'sec-ch-ua-platform': '""'
};

function fetchListPage(page) {
  return new Promise((resolve, reject) => {
    const postData = `search=${encodeURIComponent('仁和')}&fid1=100&fid2=5320&fid3=&page=${page}&include=0`;
    const options = {
      hostname: 'www1.rmfysszc.gov.cn',
      path: '/News/Handler.aspx',
      method: 'POST',
      headers: {
        ...HEADERS,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
          return;
        }
        resolve(data);
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  const results = [];
  let page = 1;
  const maxPages = 30; // safety limit

  while (page <= maxPages) {
    console.log(`Fetching page ${page}...`);
    try {
      const html = await fetchListPage(page);
      // Parse JSON wrapper if present
      let content = html;
      try {
        const parsed = JSON.parse(html);
        if (parsed.html) content = parsed.html;
      } catch (e) {
        // not JSON, use raw
      }

      // Extract rows with regex
      const rowRegex = /<tr[^>]*class=['"]listtr['"][^>]*>([\s\S]*?)<\/tr>/g;
      let match;
      let found = 0;
      while ((match = rowRegex.exec(content)) !== null) {
        const row = match[1];
        // Extract href and title
        const linkMatch = row.match(/<a\s+href=['"]([^'"]+)['"]\s+title=['"]([^'"]+)['"]/);
        if (linkMatch) {
          const href = linkMatch[1];
          const title = linkMatch[2];
          // Extract court name from title span
          const courtMatch = row.match(/title='([^']+)'[^>]*style='[^']*margin-left:50px/);
          const court = courtMatch ? courtMatch[1] : '';
          // Extract date
          const dateMatch = row.match(/<span[^>]*class=['"]n_c_r['"][^>]*>([^<]+)<\/span>/);
          const date = dateMatch ? dateMatch[1].trim() : '';

          results.push({
            href,
            title,
            court,
            date
          });
          found++;
        }
      }

      if (found === 0) {
        console.log(`No more items at page ${page}, stopping.`);
        break;
      }

      console.log(`  Page ${page}: found ${found} items (total: ${results.length})`);
      page++;
      // Delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      console.error(`Error on page ${page}:`, err.message);
      break;
    }
  }

  fs.writeFileSync(path.join(RESULT_DIR, 'list_results.json'), JSON.stringify(results, null, 2));
  console.log(`Saved ${results.length} list items to result/list_results.json`);
}

main();
