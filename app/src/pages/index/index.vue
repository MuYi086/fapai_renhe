<script setup>
import { ref, computed, watch } from 'vue'
import { onLoad, onPullDownRefresh, onShareAppMessage } from '@dcloudio/uni-app'
import communityJson from '@/static/community.json'
import houseJson from '@/static/house.json'

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

// 数据
const communityData = ref({})
const houseList = ref([])
const communityNames = ref([])
const loading = ref(false)

const selectedCommunity = ref('')
const selectedEstate = ref('')
const searchKeyword = ref('')
const showFilter = ref(false)

const page = ref(1)
const pageSize = ref(15) // 与 web 保持一致

// 加载数据
function loadData(refresh = false) {
  if (refresh) {
    page.value = 1
  }
  loading.value = true

  Promise.resolve().then(() => {
    communityData.value = communityJson || {}
    communityNames.value = Object.keys(communityJson || {})
    houseList.value = (houseJson || []).map((item, idx) => ({ ...item, _rawIdx: idx }))
    loading.value = false
    if (refresh) {
      uni.stopPullDownRefresh()
      uni.showToast({ title: '刷新成功', icon: 'success', duration: 1000 })
    }
  })
}

onLoad(() => {
  getSystemInfo()
  loadData()
})

onPullDownRefresh(() => {
  loadData(true)
})

// 小区选项
const currentEstateOptions = computed(() => {
  if (!selectedCommunity.value) return []
  return communityData.value[selectedCommunity.value] || []
})

// 筛选后的数据（与 web 逻辑一致）
const filteredList = computed(() => {
  let list = [...houseList.value]
  if (selectedCommunity.value) {
    list = list.filter(item => item['社区'] === selectedCommunity.value)
  }
  if (selectedEstate.value) {
    list = list.filter(item => item['小区名'] === selectedEstate.value)
  }
  if (searchKeyword.value.trim()) {
    const kw = searchKeyword.value.trim().toLowerCase()
    list = list.filter(item => {
      const addr = (item.property_address || '').toLowerCase()
      const room = (item['房间号'] || '').toLowerCase()
      const estate = (item['小区名'] || '').toLowerCase()
      return addr.includes(kw) || room.includes(kw) || estate.includes(kw)
    })
  }
  // 按发布日期降序排序，与 web 的 default-sort 保持一致
  return list.sort((a, b) => {
    const da = (a.publish_date || '').replace(/\./g, '')
    const db = (b.publish_date || '').replace(/\./g, '')
    return db.localeCompare(da)
  })
})

// 分页显示
const displayList = computed(() => {
  return filteredList.value.slice(0, page.value * pageSize.value)
})

const loadStatus = computed(() => {
  if (loading.value) return 'loading'
  if (displayList.value.length >= filteredList.value.length) return 'nomore'
  return 'loadmore'
})

const hasFilter = computed(() => {
  return selectedCommunity.value || selectedEstate.value || searchKeyword.value.trim()
})

function loadMore() {
  if (loadStatus.value === 'loadmore') {
    page.value++
  }
}

function onSearchInput(e) {
  searchKeyword.value = e.detail.value
  page.value = 1
}

function doSearch() {
  page.value = 1
  uni.hideKeyboard()
}

function clearSearch() {
  searchKeyword.value = ''
  page.value = 1
}

function confirmFilter() {
  page.value = 1
  showFilter.value = false
}

function resetFilter() {
  selectedCommunity.value = ''
  selectedEstate.value = ''
  page.value = 1
}

function resetAll() {
  selectedCommunity.value = ''
  selectedEstate.value = ''
  searchKeyword.value = ''
  page.value = 1
}

function selectCommunity(name) {
  if (selectedCommunity.value === name) {
    selectedCommunity.value = ''
  } else {
    selectedCommunity.value = name
  }
  selectedEstate.value = ''
}

function selectEstate(name) {
  if (selectedEstate.value === name) {
    selectedEstate.value = ''
  } else {
    selectedEstate.value = name
  }
}

function goDetail(rawIdx) {
  if (rawIdx === undefined || rawIdx === null) return
  uni.navigateTo({
    url: '/pages/detail/detail?idx=' + rawIdx
  })
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

// 监听筛选条件变化，自动重置分页
watch([selectedCommunity, selectedEstate], () => {
  page.value = 1
}, { flush: 'post' })

onShareAppMessage(() => {
  return {
    title: '仁和街道法拍房信息查询',
    path: '/pages/index/index'
  }
})
</script>

<template>
  <view class="page">
    <!-- 自定义导航栏 -->
    <view class="custom-nav" :style="{ paddingTop: statusBarHeight + 'px' }">
      <view class="nav-bar" :style="{ height: navBarHeight + 'px' }">
        <text class="nav-title">仁和街道法拍房</text>
      </view>
    </view>

    <!-- 搜索筛选区 -->
    <view class="search-area">
      <view class="search-input-wrap">
        <view class="search-box">
          <text class="search-icon">&#128269;</text>
          <input
            class="search-input"
            :value="searchKeyword"
            placeholder="搜索地址、小区、房间号..."
            confirm-type="search"
            @input="onSearchInput"
            @confirm="doSearch"
          />
          <text v-if="searchKeyword" class="clear-icon" @click="clearSearch">&#10005;</text>
        </view>
      </view>
      <view class="filter-btn" @click="showFilter = true">
        <text>筛选</text>
        <view v-if="hasFilter" class="filter-dot"></view>
      </view>
    </view>

    <!-- 已选筛选标签 -->
    <view class="filter-tags" v-if="hasFilter">
      <scroll-view scroll-x class="filter-tags-scroll" show-scrollbar="false">
        <view class="filter-tags-inner">
          <view class="tag tag-primary" v-if="selectedCommunity" @click="selectedCommunity = ''">
            <text>社区：{{ selectedCommunity }}</text>
            <text class="tag-close">&#10005;</text>
          </view>
          <view class="tag tag-success" v-if="selectedEstate" @click="selectedEstate = ''">
            <text>小区：{{ selectedEstate }}</text>
            <text class="tag-close">&#10005;</text>
          </view>
          <view class="tag tag-warning" v-if="searchKeyword.trim()" @click="clearSearch">
            <text>搜索：{{ searchKeyword }}</text>
            <text class="tag-close">&#10005;</text>
          </view>
          <view class="reset-btn" @click="resetAll">
            <text>&#8634; 重置</text>
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- 统计栏 -->
    <view class="stats-bar">
      <view class="stats-left">
        <text>共 <text class="stats-num">{{ filteredList.length }}</text> 条记录</text>
      </view>
      <view class="stats-right">
        <text class="sort-hint">按发布日期降序</text>
      </view>
    </view>

    <!-- 列表 -->
    <scroll-view scroll-y class="list-scroll" @scrolltolower="loadMore">
      <view v-if="filteredList.length === 0 && !loading" class="empty-wrap">
        <view class="empty-icon">&#128196;</view>
        <text class="empty-text">暂无数据</text>
        <view class="empty-btn" @click="resetAll">
          <text>重置筛选条件</text>
        </view>
      </view>

      <view v-else class="card-list">
        <view
          v-for="(item, index) in displayList"
          :key="item._rawIdx"
          class="house-card"
          @click="goDetail(item._rawIdx)"
        >
          <!-- 卡片头部：序号 + 社区 + 小区 + 房间号 -->
          <view class="card-header">
            <view class="header-left">
              <text class="index-num">{{ index + 1 }}</text>
              <text class="community-tag">{{ item['社区'] }}</text>
              <text class="estate-name">{{ item['小区名'] }}</text>
            </view>
            <text class="room-no">{{ item['房间号'] }}</text>
          </view>

          <!-- 房产地址 -->
          <view class="card-address">{{ item.property_address }}</view>

          <!-- 信息网格 -->
          <view class="card-info-grid">
            <view class="info-item">
              <text class="info-label">拍卖轮次</text>
              <text class="info-value">{{ item.auction_round || '-' }}</text>
            </view>
            <view class="info-item">
              <text class="info-label">建筑面积</text>
              <text class="info-value">{{ item['建筑面积'] || '-' }} m²</text>
            </view>
            <view class="info-item">
              <text class="info-label">楼层</text>
              <text class="info-value">{{ item['当前楼层'] || '-' }}/{{ item['总楼层'] || '-' }}</text>
            </view>
            <view class="info-item">
              <text class="info-label">建筑年份</text>
              <text class="info-value">{{ item['建筑年份'] || '-' }}</text>
            </view>
            <view class="info-item">
              <text class="info-label">用途</text>
              <text class="info-value">{{ item['用途'] || '-' }}</text>
            </view>
            <view class="info-item">
              <text class="info-label">发布日期</text>
              <text class="info-value">{{ item.publish_date || '-' }}</text>
            </view>
          </view>

          <!-- 价格区 -->
          <view class="card-price">
            <view class="price-item">
              <text class="price-label">起拍价</text>
              <text class="price-value start">{{ formatPrice(item['起拍价']) }}</text>
            </view>
            <view class="price-divider"></view>
            <view class="price-item">
              <text class="price-label">评估价</text>
              <text class="price-value eval">{{ formatPrice(item['评估价']) }}</text>
            </view>
            <view class="price-divider"></view>
            <view class="price-item">
              <text class="price-label">状态</text>
              <text class="price-value status">{{ item['是否已腾空'] || '-' }}</text>
            </view>
          </view>

          <!-- 标签区 -->
          <view class="card-tags">
            <view v-if="item.auction_round" class="tag tag-warning">{{ item.auction_round }}</view>
            <view v-if="item['是否已腾空'] === '是'" class="tag tag-success">已腾空</view>
            <view v-else-if="item['是否已腾空'] === '否'" class="tag tag-danger">未腾空</view>
            <view v-if="item['租赁情况']" class="tag tag-info">{{ item['租赁情况'] }}</view>
          </view>

          <!-- 底部操作 -->
          <view class="card-footer">
            <text class="publish-date">发布: {{ item.publish_date }}</text>
            <view class="footer-actions">
              <view class="btn btn-mini btn-primary" @click.stop="goDetail(item._rawIdx)">查看详情</view>
            </view>
          </view>
        </view>
      </view>

      <!-- 加载状态 -->
      <view class="load-status" v-if="filteredList.length > 0">
        <view v-if="loadStatus === 'loading'" class="loading-wrap">
          <view class="loading-spinner"></view>
          <text>加载中...</text>
        </view>
        <view v-else-if="loadStatus === 'nomore'" class="nomore-wrap">
          <text>没有更多数据了</text>
        </view>
        <view v-else class="loadmore-wrap" @click="loadMore">
          <text>点击加载更多</text>
        </view>
      </view>

      <view class="safe-bottom"></view>
    </scroll-view>

    <!-- 弹窗遮罩 -->
    <view class="mask" v-if="showFilter" @click="showFilter = false"></view>
    <!-- 筛选弹窗 -->
    <view class="popup" v-if="showFilter">
      <view class="popup-content">
        <view class="popup-header">
          <text class="popup-title">筛选条件</text>
          <text class="close-icon" @click="showFilter = false">&#10005;</text>
        </view>

        <view class="popup-body">
          <view class="filter-section">
            <text class="section-title">社区</text>
            <view class="tag-list">
              <view
                v-for="name in communityNames"
                :key="name"
                class="select-tag"
                :class="{ active: selectedCommunity === name }"
                @click="selectCommunity(name)"
              >
                {{ name }}
              </view>
            </view>
          </view>

          <view class="filter-section" v-if="selectedCommunity">
            <text class="section-title">小区</text>
            <view class="tag-list">
              <view
                v-for="name in currentEstateOptions"
                :key="name"
                class="select-tag"
                :class="{ active: selectedEstate === name }"
                @click="selectEstate(name)"
              >
                {{ name }}
              </view>
            </view>
          </view>
        </view>

        <view class="popup-footer">
          <view class="btn btn-info" @click="resetFilter">重置</view>
          <view class="btn btn-primary" @click="confirmFilter">确定</view>
        </view>
      </view>
    </view>
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
  padding: 0 16px;
  padding-bottom: 12px;
  flex-shrink: 0;
}

.nav-bar {
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-title {
  font-size: 18px;
  font-weight: 600;
  color: #fff;
}

/* 搜索区 */
.search-area {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  gap: 10px;
  background: #fff;
  border-bottom: 1px solid #eee;
  flex-shrink: 0;
}

.search-input-wrap {
  flex: 1;
}

.search-box {
  display: flex;
  align-items: center;
  background: #f5f5f5;
  border-radius: 20px;
  padding: 8px 12px;
  gap: 8px;
}

.search-icon {
  font-size: 14px;
  color: #999;
}

.search-input {
  flex: 1;
  font-size: 14px;
  border: none;
  background: transparent;
  height: 20px;
  min-height: 20px;
  line-height: 20px;
}

.clear-icon {
  font-size: 12px;
  color: #999;
  padding: 4px;
}

.filter-btn {
  background: #1a2980;
  color: #fff;
  padding: 8px 14px;
  border-radius: 20px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 4px;
  position: relative;
}

.filter-dot {
  width: 8px;
  height: 8px;
  background: #f56c6c;
  border-radius: 50%;
  position: absolute;
  top: 4px;
  right: 4px;
}

/* 筛选标签 */
.filter-tags {
  padding: 8px 16px;
  background: #fff;
  border-bottom: 1px solid #eee;
  flex-shrink: 0;
}

.filter-tags-scroll {
  width: 100%;
  white-space: nowrap;
}

.filter-tags-inner {
  display: flex;
  align-items: center;
  gap: 8px;
}

.reset-btn {
  background: #f0f0f0;
  color: #666;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  flex-shrink: 0;
}

/* 统计 */
.stats-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  font-size: 13px;
  color: #666;
  background: #f5f7fa;
  flex-shrink: 0;
}

.stats-num {
  color: #1a2980;
  font-weight: 600;
}

.sort-hint {
  font-size: 12px;
  color: #999;
}

/* 列表 */
.list-scroll {
  flex: 1;
  overflow: hidden;
}

.card-list {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty-wrap {
  padding: 60px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.empty-icon {
  font-size: 48px;
  opacity: 0.3;
}

.empty-text {
  font-size: 14px;
  color: #999;
}

.empty-btn {
  margin-top: 8px;
  background: #1a2980;
  color: #fff;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 13px;
}

/* 卡片 */
.house-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.index-num {
  width: 22px;
  height: 22px;
  background: #1a2980;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.community-tag {
  font-size: 11px;
  color: #fff;
  background: #1a2980;
  padding: 2px 8px;
  border-radius: 4px;
}

.estate-name {
  font-size: 17px;
  font-weight: 600;
  color: #333;
}

.room-no {
  font-size: 13px;
  color: #666;
  background: #f0f0f0;
  padding: 2px 8px;
  border-radius: 4px;
}

.card-address {
  font-size: 13px;
  color: #888;
  margin-bottom: 12px;
  line-height: 1.5;
}

/* 信息网格 */
.card-info-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 0;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.info-item {
  width: 33.33%;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-right: 4px;
  box-sizing: border-box;
}

.info-label {
  font-size: 11px;
  color: #999;
}

.info-value {
  font-size: 13px;
  color: #333;
  font-weight: 500;
}

/* 价格 */
.card-price {
  display: flex;
  align-items: center;
  justify-content: space-around;
  margin-bottom: 10px;
  padding: 10px 0;
  background: #fafbfc;
  border-radius: 8px;
}

.price-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex: 1;
}

.price-label {
  font-size: 12px;
  color: #999;
}

.price-value {
  font-size: 16px;
  font-weight: 700;
}

.price-value.start {
  color: #f56c6c;
}

.price-value.eval {
  color: #666;
  font-size: 15px;
  font-weight: 500;
}

.price-value.status {
  color: #1a2980;
  font-size: 13px;
  font-weight: 500;
}

.price-divider {
  width: 1px;
  height: 36px;
  background: #e0e0e0;
}

.card-tags {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 10px;
  border-top: 1px solid #f0f0f0;
}

.footer-actions {
  display: flex;
  gap: 8px;
}

.publish-date {
  font-size: 12px;
  color: #999;
}

/* 按钮 */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
}

.btn-primary {
  background: #1a2980;
  color: #fff;
}

.btn-info {
  background: #f0f0f0;
  color: #666;
}

.btn-plain {
  border: 1px solid #1a2980;
  color: #1a2980;
  background: #fff;
}

.btn-mini {
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 4px;
}

/* 标签 */
.tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  gap: 4px;
}

.tag-primary {
  background: #e6f7ff;
  color: #1a2980;
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

.tag-close {
  font-size: 10px;
  margin-left: 4px;
}

/* 加载状态 */
.load-status {
  padding: 16px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.loading-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #999;
}

.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #e0e0e0;
  border-top-color: #1a2980;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.nomore-wrap {
  font-size: 13px;
  color: #999;
}

.loadmore-wrap {
  font-size: 13px;
  color: #1a2980;
}

.safe-bottom {
  height: 20px;
}

/* 弹窗 */
.mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 998;
}

.popup {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 999;
  background: #fff;
  border-radius: 16px 16px 0 0;
  max-height: 70vh;
}

.popup-content {
  padding: 16px;
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  max-height: 70vh;
}

.popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-shrink: 0;
}

.popup-title {
  font-size: 17px;
  font-weight: 600;
  color: #333;
}

.close-icon {
  font-size: 16px;
  color: #999;
  padding: 4px;
}

.popup-body {
  margin-bottom: 16px;
  overflow-y: auto;
  flex: 1;
}

.filter-section {
  margin-bottom: 16px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin-bottom: 10px;
  display: block;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.select-tag {
  padding: 6px 14px;
  border-radius: 20px;
  background: #f5f5f5;
  font-size: 13px;
  color: #666;
  border: 1px solid transparent;
}

.select-tag.active {
  background: #e6f7ff;
  color: #1a2980;
  border-color: #1a2980;
  font-weight: 500;
}

.popup-footer {
  display: flex;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid #eee;
  flex-shrink: 0;
}

.popup-footer .btn {
  flex: 1;
}
</style>
