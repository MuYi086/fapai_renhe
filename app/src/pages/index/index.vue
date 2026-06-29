<script setup>
import { ref, computed, watch } from 'vue'
import { onLoad, onPullDownRefresh, onShareAppMessage } from '@dcloudio/uni-app'

// 安全区域高度
const statusBarHeight = ref(0)
const navBarHeight = ref(44)
const totalNavHeight = computed(() => statusBarHeight.value + navBarHeight.value)

function getSystemInfo() {
  try {
    const info = uni.getSystemInfoSync()
    statusBarHeight.value = info.statusBarHeight || 0
    // 胶囊按钮高度 + 间距 作为导航栏高度参考
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
const pageSize = ref(10)

// 加载数据
function loadData(refresh = false) {
  if (refresh) {
    page.value = 1
  }
  loading.value = true
  uni.request({
    url: '/static/community.json',
    success: (res) => {
      communityData.value = res.data || {}
      communityNames.value = Object.keys(res.data || {})
    }
  })
  uni.request({
    url: '/static/house.json',
    success: (res) => {
      houseList.value = res.data || []
      loading.value = false
      if (refresh) {
        uni.stopPullDownRefresh()
        uni.showToast({ title: '刷新成功', icon: 'success', duration: 1000 })
      }
    },
    fail: () => {
      loading.value = false
      if (refresh) {
        uni.stopPullDownRefresh()
      }
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

// 筛选
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

function loadMore() {
  if (loadStatus.value === 'loadmore') {
    page.value++
  }
}

function onSearchInput(e) {
  searchKeyword.value = e.detail.value
}

function doSearch() {
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

function formatPrice(price) {
  if (!price) return '-'
  const num = parseFloat(price.toString().replace(/,/g, ''))
  if (isNaN(num)) return price
  if (num >= 10000) {
    return (num / 10000).toFixed(2) + ' 万'
  }
  return num.toLocaleString()
}

function openLink(url) {
  if (!url) return
  uni.showModal({
    title: '提示',
    content: '即将打开淘宝拍卖链接',
    confirmText: '打开',
    success: (res) => {
      if (res.confirm) {
        uni.navigateTo({
          url: '/pages/webview/webview?url=' + encodeURIComponent(url)
        })
      }
    }
  })
}

function goDetail(index) {
  uni.navigateTo({
    url: '/pages/detail/detail?idx=' + index
  })
}

watch([selectedCommunity, selectedEstate, searchKeyword], () => {
  page.value = 1
}, { flush: 'post' })

onShareAppMessage(() => {
  return {
    title: '仁和社区法拍房信息查询',
    path: '/pages/index/index'
  }
})
</script>

<template>
  <view class="page">
    <!-- 自定义导航栏 -->
    <view class="custom-nav" :style="{ paddingTop: statusBarHeight + 'px' }">
      <view class="nav-bar" :style="{ height: navBarHeight + 'px' }">
        <text class="nav-title">仁和社区法拍房</text>
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
            placeholder="搜索地址、小区、房间号"
            confirm-type="search"
            @input="onSearchInput"
            @confirm="doSearch"
          />
          <text v-if="searchKeyword" class="clear-icon" @click="searchKeyword = ''">&#10005;</text>
        </view>
      </view>
      <view class="filter-btn" @click="showFilter = true">
        <text>筛选</text>
      </view>
    </view>

    <!-- 已选筛选标签 -->
    <view class="filter-tags" v-if="selectedCommunity || selectedEstate">
      <view class="tag tag-primary" v-if="selectedCommunity" @click="selectedCommunity = ''">
        <text>{{ selectedCommunity }}</text>
        <text class="tag-close">&#10005;</text>
      </view>
      <view class="tag tag-success" v-if="selectedEstate" @click="selectedEstate = ''">
        <text>{{ selectedEstate }}</text>
        <text class="tag-close">&#10005;</text>
      </view>
    </view>

    <!-- 统计 -->
    <view class="stats-bar">
      <text>共 {{ filteredList.length }} 条记录</text>
    </view>

    <!-- 列表 -->
    <scroll-view scroll-y class="list-scroll" @scrolltolower="loadMore">
      <view v-if="filteredList.length === 0 && !loading" class="empty-wrap">
        <view class="empty-icon">&#128196;</view>
        <text class="empty-text">暂无数据</text>
      </view>

      <view v-else class="card-list">
        <view
          v-for="(item, index) in displayList"
          :key="index"
          class="house-card"
          @click="goDetail(houseList.indexOf(item))"
        >
          <view class="card-header">
            <view class="header-left">
              <text class="community-tag">{{ item['社区'] }}</text>
              <text class="estate-name">{{ item['小区名'] }}</text>
            </view>
            <text class="room-no">{{ item['房间号'] }}</text>
          </view>
          <view class="card-address">{{ item.property_address }}</view>
          <view class="card-info">
            <view class="info-item">
              <text class="info-label">面积</text>
              <text class="info-value">{{ item['建筑面积'] || '-' }} m²</text>
            </view>
            <view class="info-item">
              <text class="info-label">楼层</text>
              <text class="info-value">{{ item['当前楼层'] || '-' }}/{{ item['总楼层'] || '-' }}</text>
            </view>
            <view class="info-item">
              <text class="info-label">年份</text>
              <text class="info-value">{{ item['建筑年份'] || '-' }}</text>
            </view>
            <view class="info-item">
              <text class="info-label">用途</text>
              <text class="info-value">{{ item['用途'] || '-' }}</text>
            </view>
          </view>
          <view class="card-price">
            <view class="price-item">
              <text class="price-label">起拍价</text>
              <text class="price-value start">{{ formatPrice(item['起拍价']) }}</text>
            </view>
            <view class="price-item">
              <text class="price-label">评估价</text>
              <text class="price-value eval">{{ formatPrice(item['评估价']) }}</text>
            </view>
          </view>
          <view class="card-tags">
            <view class="tag tag-warning">{{ item.auction_round }}</view>
            <view v-if="item['是否已腾空'] === '是'" class="tag tag-success">已腾空</view>
            <view v-else-if="item['是否已腾空'] === '否'" class="tag tag-danger">未腾空</view>
            <view v-if="item['租赁情况']" class="tag tag-info">{{ item['租赁情况'] }}</view>
          </view>
          <view class="card-footer">
            <text class="publish-date">发布: {{ item.publish_date }}</text>
            <view class="footer-actions">
              <view class="btn btn-mini btn-plain" @click.stop="goDetail(houseList.indexOf(item))">查看详情</view>
              <view class="btn btn-mini btn-primary" @click.stop="openLink(item.item_link)">淘宝链接</view>
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
}

/* 筛选标签 */
.filter-tags {
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  background: #fff;
  flex-shrink: 0;
}

/* 统计 */
.stats-bar {
  padding: 8px 16px;
  font-size: 13px;
  color: #666;
  background: #f5f7fa;
  flex-shrink: 0;
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

.card-info {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
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

.card-price {
  display: flex;
  gap: 24px;
  margin-bottom: 10px;
}

.price-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.price-label {
  font-size: 11px;
  color: #999;
}

.price-value {
  font-size: 16px;
  font-weight: 600;
}

.price-value.start {
  color: #f56c6c;
}

.price-value.eval {
  color: #999;
  font-size: 14px;
  font-weight: 400;
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
