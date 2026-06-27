这是具体的网站：https://www1.rmfysszc.gov.cn/News/Pmgg.shtml

高级法院选择: 浙江省高级人民法院
中级法院选择：浙江省杭州市中级人民法院
基层法院和法庭：保持默认
公告名称：仁和
是否包含辖区法院： 是

点击搜索出现关于杭州市余杭区仁和街道相关的房产拍卖信息。
注意：这个网站在浏览器打开调试模式，一打开点击按钮操作就会被403,然后提示：创宇盾提示您：您的IP最近有可疑的攻击行为，请稍后重试.
当前网址：https://www1.rmfysszc.gov.cn/News/Pmgg.shtml

客户端特征：Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36

拦截时间：2026-06-27 14:45:01  本次事件ID 

如果您是网站管理员，请登录知道创宇云防御  查看详情  或者  反馈误报
client: 115.197.175.83, server: 4b31633, time: 27/Jun/2026:14:45:02 +0800


这是bash复制的curl: curl 'https://www1.rmfysszc.gov.cn/News/Handler.aspx' \
  -H 'Accept: application/json, text/javascript, */*; q=0.01' \
  -H 'Accept-Language: zh-CN,zh;q=0.9,en;q=0.8' \
  -H 'Connection: keep-alive' \
  -H 'Content-Type: application/x-www-form-urlencoded; charset=UTF-8' \
  -b 'ASP.NET_SessionId=jl4iw2v4cxnsf3wwr00vyinm; insert_cookie=13963170; __jsluid_s=19d66314156ecca02205c27330c44db1; Hm_lvt_5698cdfa8b95bb873f5ca4ecf94ac150=1782538614; HMACCOUNT=0596B16683D862A9; Hm_lpvt_5698cdfa8b95bb873f5ca4ecf94ac150=1782541172' \
  -H 'Origin: https://www1.rmfysszc.gov.cn' \
  -H 'Referer: https://www1.rmfysszc.gov.cn/News/Pmgg.shtml' \
  -H 'Sec-Fetch-Dest: empty' \
  -H 'Sec-Fetch-Mode: cors' \
  -H 'Sec-Fetch-Site: same-origin' \
  -H 'User-Agent: test' \
  -H 'X-Requested-With: XMLHttpRequest' \
  -H 'sec-ch-ua: ""' \
  -H 'sec-ch-ua-mobile: ?1' \
  -H 'sec-ch-ua-platform: ""' \
  --data-raw 'search=%E4%BB%81%E5%92%8C&fid1=100&fid2=5320&fid3=&page=1&include=0'

  不打开调试模式，页面点击是可以正常搜索出结果的

  我的期望是你能找出分页的接口，然后在不被封禁和限流的情况下抓取到我上面搜索词对应的结果，总共10多页数据和对应的详情。
  其中每个详情需要搜集的信息包括：法院名称，发布日期，拍卖标的，或者房产地址，评估价，起拍价，第几次拍卖，标的介绍对应的网页链接等信息，汇总并输出为`仁和.json`。
  举例： https://www.rmfysszc.gov.cn/statichtml/rm_xmdetail/12377194.shtml
  这个链接中对应可以获得
  法院名称：杭州市余杭区人民法院
  发布日期：2026.06.26
  房产地址：杭州市余杭区仁和街道清合嘉园东区9幢1单元302室房产
  评估价：94.08万
  起拍价: 52.8万
  拍卖次数：第二次拍卖
  标的介绍：https://sf-item.taobao.com/sf_item/1062934316798.htm


