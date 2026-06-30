<script setup>
import { ref } from 'vue'
import { onLoad, onShareAppMessage } from '@dcloudio/uni-app'
import houseJson from '@/static/house.json'

const house = ref(null)
const houseIndex = ref('')
const loading = ref(true)

// 安全区域高度
const statusBarHeight = ref(0)
const navBarHeight = ref(44)

function getSystemInfo() {
  try {
    const info = uni.getSystemInfoSync()
    statusBarHeight.value = info.statusBarHeight || 0
    const menu = uni.getMenuButtonBoundingClientRect ? uni.getMenuButtonBoundingClientRect() : null
    if (menu) {
      navBarHeight.value = (menu.top - (info.statusBarHeight || 0)) * 2 + menu.height
    }
  } catch (e) {
    console.log('get system info failed', e)
  }
}

onLoad((options) => {
  getSystemInfo()
  const idx = options.idx
  if (idx === undefined || idx === null || idx === '') {
    uni.showToast({ title: '参数错误', icon: 'error' })
    setTimeout(() => uni.navigateBack(), 1500)
    return
  }
  houseIndex.value = idx
  loadDetail(idx)
})

function loadDetail(idx) {
  loading.value = true
  Promise.resolve().then(() => {
    const list = houseJson || []
    const index = parseInt(idx)
    if (index >= 0 && index < list.length) {
      house.value = list[index]
    } else {
      uni.showToast({ title: '未找到房源', icon: 'error' })
      setTimeout(() => uni.navigateBack(), 1500)
    }
    loading.value = false
  })
}

function goBack() {
  uni.navigateBack()
}

function formatPrice(price) {
  if (!price) return '-'
  const num = parseFloat(price.toString().replace(/,/g, ''))
  if (isNaN(num)) return price
  if (num >= 10000) {
    return (num / 10000).toFixed(2) + ' 万'
  }
  return num.toLocaleString()
}

function calcDiscount(start, evalPrice) {
  if (!start || !evalPrice) return '-'
  const s = parseFloat(start.toString().replace(/,/g, ''))
  const e = parseFloat(evalPrice.toString().replace(/,/g, ''))
  if (isNaN(s) || isNaN(e) || e === 0) return '-'
  return (s / e * 100).toFixed(1) + '%'
}

function isEmpty(val) {
  return val === undefined || val === null || val === ''
}

onShareAppMessage(() => {
  if (!house.value) return { title: '仁和街道法拍房' }
  return {
    title: `${house.value['小区名'] || ''} ${house.value['房间号'] || ''} - 法拍房`,
    path: `/pages/detail/detail?idx=${houseIndex.value}`
  }
})
</script>

<template>
  <view class="page" v-if="house">
    <!-- 自定义导航栏 -->
    <view class="custom-nav" :style="{ paddingTop: statusBarHeight + 'px' }">
      <view class="nav-bar" :style="{ height: navBarHeight + 'px' }">
        <view class="nav-left" @click="goBack">
          <text class="nav-back">&#8592;</text>
          <text class="nav-back-text">返回</text>
        </view>
        <text class="nav-title">房源详情</text>
        <view class="nav-right"></view>
      </view>
    </view>

    <scroll-view scroll-y class="scroll-wrap">
      <!-- 头部信息卡片 -->
      <view class="header-card">
        <view class="header-top">
          <view class="estate-badge">{{ house['小区名'] || '-' }}</view>
          <view class="room-badge">{{ house['房间号'] || '-' }}</view>
        </view>
        <view class="address">{{ house.property_address || '-' }}</view>
        <view class="header-tags">
          <view v-if="house.auction_round" class="tag tag-warning">{{ house.auction_round }}</view>
          <view v-if="house['是否已腾空'] === '是'" class="tag tag-success">已腾空</view>
          <view v-else-if="house['是否已腾空'] === '否'" class="tag tag-danger">未腾空</view>
          <view v-if="house['租赁情况']" class="tag tag-info">{{ house['租赁情况'] }}</view>
        </view>
      </view>

      <!-- 价格信息 -->
      <view class="section-card">
        <view class="section-title">价格信息</view>
        <view class="price-grid">
          <view class="price-box">
            <text class="price-label">起拍价</text>
            <text class="price-value start">{{ formatPrice(house['起拍价']) }}</text>
          </view>
          <view class="price-divider" />
          <view class="price-box">
            <text class="price-label">评估价</text>
            <text class="price-value eval">{{ formatPrice(house['评估价']) }}</text>
          </view>
          <view class="price-divider" />
          <view class="price-box">
            <text class="price-label">折扣</text>
            <text class="price-value discount">{{ calcDiscount(house['起拍价'], house['评估价']) }}</text>
          </view>
        </view>
      </view>

      <!-- 房产信息 -->
      <view class="section-card">
        <view class="section-title">房产信息</view>
        <view class="info-grid">
          <view class="info-cell">
            <text class="cell-label">社区</text>
            <text class="cell-value">{{ house['社区'] || '-' }}</text>
          </view>
          <view class="info-cell">
            <text class="cell-label">建筑面积</text>
            <text class="cell-value">{{ house['建筑面积'] || '-' }} m²</text>
          </view>
          <view class="info-cell">
            <text class="cell-label">套内面积</text>
            <text class="cell-value">{{ house['套内面积'] || '-' }} m²</text>
          </view>
          <view class="info-cell">
            <text class="cell-label">土地面积</text>
            <text class="cell-value">{{ house['土地使用权面积'] || '-' }} m²</text>
          </view>
          <view class="info-cell">
            <text class="cell-label">分摊面积</text>
            <text class="cell-value">{{ house['分摊面积'] || '-' }} m²</text>
          </view>
          <view class="info-cell">
            <text class="cell-label">用途</text>
            <text class="cell-value">{{ house['用途'] || '-' }}</text>
          </view>
          <view class="info-cell">
            <text class="cell-label">当前楼层</text>
            <text class="cell-value">{{ house['当前楼层'] || '-' }}</text>
          </view>
          <view class="info-cell">
            <text class="cell-label">总楼层</text>
            <text class="cell-value">{{ house['总楼层'] || '-' }}</text>
          </view>
          <view class="info-cell">
            <text class="cell-label">建筑年份</text>
            <text class="cell-value">{{ house['建筑年份'] || '-' }}</text>
          </view>
          <view class="info-cell">
            <text class="cell-label">朝向</text>
            <text class="cell-value">{{ house['朝向'] || '-' }}</text>
          </view>
          <view class="info-cell">
            <text class="cell-label">空间布局</text>
            <text class="cell-value">{{ house['空间布局'] || '-' }}</text>
          </view>
          <view class="info-cell">
            <text class="cell-label">梯户比</text>
            <text class="cell-value">{{ house['梯户比'] || '-' }}</text>
          </view>
          <view class="info-cell full-width">
            <text class="cell-label">房地产性质</text>
            <text class="cell-value">{{ house['房地产性质'] || '-' }}</text>
          </view>
          <view class="info-cell full-width">
            <text class="cell-label">房产截至日期</text>
            <text class="cell-value">{{ house['房产截至日期'] || '-' }}</text>
          </view>
        </view>
      </view>

      <!-- 拍卖信息 -->
      <view class="section-card">
        <view class="section-title">拍卖信息</view>
        <view class="info-list">
          <view class="info-row">
            <text class="row-label">发布日期</text>
            <text class="row-value">{{ house.publish_date || '-' }}</text>
          </view>
          <view class="info-row">
            <text class="row-label">拍卖轮次</text>
            <text class="row-value">{{ house.auction_round || '-' }}</text>
          </view>
          <view class="info-row">
            <text class="row-label">法院</text>
            <text class="row-value">{{ house.court_name || '-' }}</text>
          </view>
          <view class="info-row">
            <text class="row-label">法院裁定书</text>
            <text class="row-value">{{ house['法院裁定书'] || '-' }}</text>
          </view>
          <view class="info-row">
            <text class="row-label">腾空状态</text>
            <text class="row-value" :class="house['是否已腾空'] === '是' ? 'text-success' : 'text-danger'">
              {{ house['是否已腾空'] || '-' }}
            </text>
          </view>
          <view class="info-row">
            <text class="row-label">租赁情况</text>
            <text class="row-value">{{ house['租赁情况'] || '-' }}</text>
          </view>
          <view class="info-row">
            <text class="row-label">占有情况</text>
            <text class="row-value">{{ house['占有情况'] || '-' }}</text>
          </view>
          <view class="info-row">
            <text class="row-label">竞买记录</text>
            <text class="row-value">{{ house['竞买记录'] || '-' }}</text>
          </view>
        </view>
      </view>

      <!-- 特别提醒 -->
      <view class="section-card" v-if="!isEmpty(house['特别提醒'])">
        <view class="section-title">特别提醒</view>
        <view class="notice-text">{{ house['特别提醒'] }}</view>
      </view>

      <view class="safe-bottom" />
    </scroll-view>
  </view>
</template>

<style>
.page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #f5f7fa;
}

/* 自定义导航栏 */
.custom-nav {
  background: linear-gradient(135deg, #1a2980 0%, #26d0ce 100%);
  flex-shrink: 0;
}

.nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
}

.nav-left {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 60px;
}

.nav-back {
  font-size: 20px;
  color: #fff;
}

.nav-back-text {
  font-size: 14px;
  color: #fff;
}

.nav-title {
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  flex: 1;
  text-align: center;
}

.nav-right {
  width: 60px;
}

.scroll-wrap {
  flex: 1;
  overflow: hidden;
}

/* 头部卡片 */
.header-card {
  background: linear-gradient(135deg, #1a2980 0%, #26d0ce 100%);
  padding: 0 16px 20px;
  color: #fff;
}

.header-top {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.estate-badge {
  font-size: 20px;
  font-weight: 700;
}

.room-badge {
  font-size: 13px;
  background: rgba(255, 255, 255, 0.2);
  padding: 2px 10px;
  border-radius: 12px;
}

.address {
  font-size: 14px;
  opacity: 0.9;
  margin-bottom: 12px;
  line-height: 1.5;
}

.header-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* 信息区块 */
.section-card {
  background: #fff;
  margin: 12px 16px;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin-bottom: 14px;
  padding-left: 8px;
  border-left: 3px solid #1a2980;
}

/* 价格网格 */
.price-grid {
  display: flex;
  align-items: center;
  justify-content: space-around;
}

.price-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex: 1;
}

.price-label {
  font-size: 12px;
  color: #999;
}

.price-value {
  font-size: 18px;
  font-weight: 700;
}

.price-value.start {
  color: #f56c6c;
}

.price-value.eval {
  color: #666;
  font-size: 16px;
  font-weight: 500;
}

.price-value.discount {
  color: #1a2980;
}

.price-divider {
  width: 1px;
  height: 40px;
  background: #eee;
}

/* 房产信息网格 */
.info-grid {
  display: flex;
  flex-wrap: wrap;
}

.info-cell {
  width: 50%;
  padding: 10px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-cell.full-width {
  width: 100%;
}

.cell-label {
  font-size: 12px;
  color: #999;
}

.cell-value {
  font-size: 14px;
  color: #333;
  font-weight: 500;
}

/* 列表 */
.info-list {
  display: flex;
  flex-direction: column;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #f5f5f5;
}

.info-row:last-child {
  border-bottom: none;
}

.row-label {
  font-size: 14px;
  color: #666;
}

.row-value {
  font-size: 14px;
  color: #333;
  font-weight: 500;
  flex: 1;
  text-align: right;
  margin-left: 12px;
  word-break: break-all;
}

.text-success {
  color: #67c23a;
}

.text-danger {
  color: #f56c6c;
}

/* 特别提醒 */
.notice-text {
  font-size: 13px;
  color: #666;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 标签 */
.tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
}

.tag-success {
  background: #e8f5e9;
  color: #2e7d32;
}

.tag-danger {
  background: #ffebee;
  color: #c62828;
}

.tag-warning {
  background: #fff3e0;
  color: #ef6c00;
}

.tag-info {
  background: #f5f5f5;
  color: #666;
}

/* 操作栏 */
.action-bar {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  gap: 6px;
}

.btn-primary {
  background: #1a2980;
  color: #fff;
}

.btn-info {
  background: #f0f0f0;
  color: #666;
}

.btn-large {
  padding: 12px 16px;
  font-size: 15px;
}

.safe-bottom {
  height: 20px;
}
</style>
