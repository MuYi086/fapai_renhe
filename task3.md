再scripts内写一个脚本，要求遍历`result\仁和房产.json`的数据，遍历对象是item，同时一个json记录当前执行的count信息。如果ctrl+c或者异常中断了，下次执行该脚本继续从上次中断的count开始遍历执行。然后根据每条记录的信息，再`仁和社区总览`目录下具体社区具体小区目录下新建一个该房产对应的楼幢信息目录a，利用其中item_link进行二次爬取，在不被封禁和限流的情况下抓取到该链接对应的结果。需要获取房产的`基础信息.json`输出到a.包括法院裁定书、房地产性质、建筑面积、套内面积、土地使用权面积、用途、总楼层、当前楼层、建筑年份、朝向、空间布局、梯户比、土地剩余使用期限、评估价、起拍价、特别提醒、竞买记录等以及item的court_name、publish_date、property_address、auction_round、item_link、detail_url
然后再a目录创建一个`附件`目录，存放下载的附件信息，包括`评估报告`,`不动产信息调查表`,`执行裁定书`等，在a目录创建一个`图片目录`,存放房产对应的图片信息，再创建一个`视频目录`,存放房产对应的拍摄视频.

以下是举例: https://sf-item.taobao.com/sf_item/1062934316798.htm

对应的标题：杭州市余杭区仁和街道清合嘉园东区9幢1单元302室房产
那么就找到`仁和社区总览\獐山社区\清合嘉园东区`目录，建立新目录`9幢1单元302`

对应页面的div是id="J_desc"，包含了以下基础信息：
"court_name": "杭州市余杭区人民法院" (来自遍历对象item)
"publish_date": "2026.06.26" (来自遍历对象item)
"property_address": "杭州市余杭区仁和街道清合嘉园东区9幢1单元302室房产" (来自遍历对象item)
"assessment_price": "94.08万" (来自遍历对象item)
"starting_price": "52.80万" (来自遍历对象item)
"auction_round": "第二次拍卖" (来自遍历对象item) 
"item_link": "https://sf.taobao.com/spc_item.htm?id=54BA81942CC4ACE35866216619E96DA9" (来自遍历对象item)
"detail_url": "https://www.rmfysszc.gov.cn/statichtml/rm_xmdetail/12377194.shtml" (来自遍历对象item)
包括法院裁定书: （2025）浙0110执8452号
房地产性质: 住宅/住宅
占有情况: 无
是否已腾空: 是
租赁情况： 无租赁
建筑面积: 87.68
套内面积: 78.14
土地使用权面积: 50.7
分摊面积: 9.54
用途: 住宅
总楼层: 6
当前楼层: 3
建筑年份: 2008
朝向: 朝南
空间布局: 估价对象内部格局为两室两厅一卫一厨一阳台
梯户比: 所在单元一梯（楼梯）两户
土地剩余使用期限: 48.9年
评估价: 94.08万 从div的class=family-tahoma找出评估价
起拍价: 52.8万 从div的class=family-tahoma找出起拍价
特别提醒: 一、标的物可能存在的物业费、水、电、煤、物业维修基金、房屋维修基金等欠费具体金额请自行向物业和相关管理部门等确认为准。所有欠费均由买受人承担。根据估价人员至物业服务处了解，估价对象于2026年01月01日至2026年12月31日未缴纳物业费，收费标准为0.6元/月/平方米，因该物业未能出具相关证明材料，故本次查询仅供参考，具体以物业出具证明材料为准。本次评估结果为估价对象在价值时点的市场价值，没有扣除本次存在的物业费，也没有考虑估价对象可能存在的水费、电费、燃气费、电信通讯费、宽带费以及其他等因物业使用而产生拖欠费用对其市场价值的影响。在此提醒报告使用方注意今后这些额外费用的发生。

二、房屋户口不在执行范围内，请竞买人自行向公安机关了解。

三、本次评估范围包含室内现状利用条件下的附属配套设施设备。我司为房地产估价机构，并非专业设备鉴定及检测机构，评估专业人员在未借助专业检测仪器的前提下，经实地查勘，在无合理理由怀疑相关附属配套设施设备存在故障的情况下，假设其具备正常使用状态下的技术性能与质量。实际情况中，不排除相关附属配套设施设备存在故障及其他不可预见问题，敬请竞买人在看样时重点关注。请竞买人于拍卖前亲临现场看样，仔细核查竞买标的物的实际状况；未看样即参与竞买的，视为已对标的物实物现状确认。竞买人一经作出竞买决定，即表明已完全了解并接受标的物现状及一切已知与未知瑕疵。在此提醒报告使用方及竞买人注意。

对应目录建立新目录`附件`，下载对应的附件文件到`附件`目录，对应页面div的id是J_DownLoadFirst，包含了以下链接：https://sf.taobao.com/download_attach.do?spm=a213w.6688509.tabs.6.1c754ad1Ilzq55&attach_id=U47BEJBYFKD26SLV7AQP6NU6VI
https://sf.taobao.com/download_attach.do?spm=a213w.6688509.tabs.7.1c754ad1Ilzq55&attach_id=B6AGRF6IPQWI6SLV7AQP6NU6VI
https://sf.taobao.com/download_attach.do?spm=a213w.6688509.tabs.8.1c754ad1Ilzq55&attach_id=H772UYWZEC4IMSLV7AQP6NU6VI

对应目录建立新目录`视频`，下载对应的视频文件到`视频`目录，对应页面div的id="player"，包含链接是: http://cloud.video.taobao.com/play/u/1935409001/p/1/e/6/t/1/564307958798.mp4

对应目录建立新目录`图片`，下载对应的视频文件到`图片`目录，对应页面的div的class="sf-pic-slide，包含链接是: https://img.alicdn.com/bao/uploaded/i3/1935409001/O1CN01EA3oU42GMW8ZtOm3r_!!1935409001-0-paimai_gov.jpg
https://img.alicdn.com/bao/uploaded/i2/1935409001/O1CN01PHzQ3u2GMW8Zy54sZ_!!1935409001-0-paimai_gov.jpg
https://img.alicdn.com/bao/uploaded/i1/1935409001/O1CN01qusF1F2GMW8ZvwcKx_!!1935409001-0-paimai_gov.jpg
https://img.alicdn.com/bao/uploaded/i2/1935409001/O1CN01zTl9he2GMW8bRWanY_!!1935409001-0-paimai_gov.jpg_1200x1200.jpg
https://img.alicdn.com/bao/uploaded/i3/1935409001/O1CN01yualkp2GMW8ZtPmPG_!!1935409001-0-paimai_gov.jpg_1200x1200.jpg
https://img.alicdn.com/bao/uploaded/i1/1935409001/O1CN01pXlirL2GMW8Zla1nK_!!1935409001-0-paimai_gov.jpg_1200x1200.jpg
https://img.alicdn.com/bao/uploaded/i1/1935409001/O1CN01FqqTTb2GMW8Zlci57_!!1935409001-0-paimai_gov.jpg_1200x1200.jpg
https://img.alicdn.com/bao/uploaded/i1/1935409001/O1CN01U7BL4S2GMW8VPeQCM_!!1935409001-0-paimai_gov.jpg_1200x1200.jpg




