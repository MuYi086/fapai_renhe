const https = require('https');
const fs = require('fs');
const path = require('path');

const SLEEP_MS = 800;
const TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadExistingResults() {
  try {
    const data = JSON.parse(fs.readFileSync('仁和.json', 'utf-8'));
    console.log(`Loaded ${data.length} existing results.`);
    return data;
  } catch (e) {
    return [];
  }
}

function fetchUrl(url, headers = {}, retries = 0) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : require('http');
    const req = client.get(url, { headers, timeout: TIMEOUT_MS }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Follow redirect
          fetchUrl(res.headers.location, headers, retries).then(resolve).catch(reject);
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', (err) => {
      if (retries < MAX_RETRIES) {
        sleep(2000).then(() => fetchUrl(url, headers, retries + 1)).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });

    req.on('timeout', () => {
      req.destroy();
      if (retries < MAX_RETRIES) {
        sleep(2000).then(() => fetchUrl(url, headers, retries + 1)).then(resolve).catch(reject);
      } else {
        reject(new Error('Request timeout'));
      }
    });
  });
}

function parseDetail(html) {
  const result = {
    court_name: '',
    publish_date: '',
    property_address: '',
    assessment_price: '',
    starting_price: '',
    auction_round: '',
    item_link: ''
  };

  // 1. Extract title from h1
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    const title = h1Match[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    // Title format: 法院名称关于...房产（第X次拍卖）的公告
    result.court_name = title.split('关于')[0]?.trim() || '';
    
    // Extract auction round from parentheses
    const roundMatch = title.match(/（第(.+?)次拍卖）/);
    if (roundMatch) {
      result.auction_round = '第' + roundMatch[1] + '次拍卖';
    }
    
    // Extract property address: try multiple title formats
    const addrMatch = title.match(/关于(.+?)（第.+?次拍卖）/);
    if (addrMatch) {
      result.property_address = addrMatch[1].trim();
    } else {
      const simpleAddr = title.match(/关于(.+?)的公告/);
      if (simpleAddr) {
        result.property_address = simpleAddr[1].trim();
      } else if (!title.includes('关于') && !title.includes('公告')) {
        // Direct address format
        result.property_address = title.trim();
      } else {
        const lastTry = title.match(/关于(.+?)(?:的|（)/);
        if (lastTry) result.property_address = lastTry[1].trim();
      }
    }
  }

  // 2. Extract assessment price (评估价)
  // Match price near 评估价 keyword, supporting both tagged and plain-text formats
  const assessMatch = html.match(/评估价[\s\S]{0,500}?(?:>|：|:)\s*(?:<[^>]+>)*\s*(?:￥)?\s*([\d.]+)\s*(?:<\/[\s\S]*?)?(?:万元|元)/);
  if (assessMatch) {
    let val = parseFloat(assessMatch[1]);
    const unit = assessMatch[0].includes('万元') ? 1 : 10000;
    result.assessment_price = (val / unit).toFixed(2) + '万';
  }

  // 3. Extract starting price (起拍价)
  const startMatch = html.match(/起拍价[\s\S]{0,500}?(?:>|：|:)\s*(?:<[^>]+>)*\s*(?:￥)?\s*([\d.]+)\s*(?:<\/[\s\S]*?)?(?:万元|元)/);
  if (startMatch) {
    let val = parseFloat(startMatch[1]);
    const unit = startMatch[0].includes('万元') ? 1 : 10000;
    result.starting_price = (val / unit).toFixed(2) + '万';
  }

  // 4. Extract item link from #bdjs section
  const bdjsMatch = html.match(/id=["']bdjs["'][^>]*>[\s\S]*?<a\s+href=["'](https:\/\/sf[^"']+)["'][^>]*>/);
  if (bdjsMatch) {
    result.item_link = bdjsMatch[1];
  } else {
    // Fallback: any sf.taobao.com link in the page
    const taobaoMatch = html.match(/https:\/\/sf[^"'\s]+/);
    if (taobaoMatch) result.item_link = taobaoMatch[0];
  }

  return result;
}

async function main() {
  const listData = JSON.parse(fs.readFileSync('list_results.json', 'utf-8'));
  let results = loadExistingResults();
  const failed = [];
  
  // Build a set of already processed URLs
  const processedUrls = new Set(results.map(r => r.detail_url));
  
  // Filter out already processed items
  const remaining = listData.filter(item => !processedUrls.has(item.href));
  console.log(`Total list: ${listData.length}, Already processed: ${processedUrls.size}, Remaining: ${remaining.length}`);

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Referer': 'https://www1.rmfysszc.gov.cn/News/Pmgg.shtml'
  };

  for (let i = 0; i < remaining.length; i++) {
    const item = remaining[i];
    console.log(`[${i + 1}/${remaining.length}] Fetching ${item.href}...`);
    try {
      const html = await fetchUrl(item.href, headers);
      const detail = parseDetail(html);
      
      // Merge with list data
      detail.publish_date = item.date;
      // Fix invalid court_name (e.g. "变卖公告", "拍卖公告")
      if (!detail.court_name || !detail.court_name.includes('法院')) {
        detail.court_name = item.court || '';
      }
      if (!detail.property_address && item.title) {
        const addr = item.title.match(/关于(.+?)(?:（|的)/);
        if (addr) detail.property_address = addr[1].trim();
      }
      detail.detail_url = item.href;
      detail.title = item.title;

      results.push(detail);
      console.log(`  -> OK: court=${detail.court_name}, date=${detail.publish_date}, price=${detail.starting_price}`);
    } catch (err) {
      console.error(`  -> FAILED: ${err.message}`);
      failed.push({ href: item.href, title: item.title, error: err.message });
    }

    // Save progress every 10 items
    if ((i + 1) % 10 === 0 || i === remaining.length - 1) {
      fs.writeFileSync('仁和.json', JSON.stringify(results, null, 2));
      console.log(`  -> Progress saved (${results.length} total)`);
    }

    if (i < remaining.length - 1) {
      await sleep(SLEEP_MS);
    }
  }

  // Save final results
  fs.writeFileSync('仁和.json', JSON.stringify(results, null, 2));
  if (failed.length > 0) {
    fs.writeFileSync('failed_items.json', JSON.stringify(failed, null, 2));
  }

  console.log(`\nDone! Total: ${results.length}, Failed: ${failed.length}`);
  console.log(`Output saved to 仁和.json`);
}

main();
