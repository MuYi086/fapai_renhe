<script setup>
import { ref, computed, watch } from 'vue'
import { onLoad } from '@dcloudio/uni-app'

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
onLoad(() => {
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
    },
    fail: () => {
      loading.value = false
    }
  })
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
    list = list.filter(item => item['\u793e\u533a'] === selectedCommunity.value)
  }
  if (selectedEstate.value) {
    list = list.filter(item => item['\u5c0f\u533a\u540d'] === selectedEstate.value)
  }
  if (searchKeyword.value.trim()) {
    const kw = searchKeyword.value.trim().toLowerCase()
    list = list.filter(item => {
      const addr = (item.property_address || '').toLowerCase()
      const room = (item['\u623f\u95f4\u53f7'] || '').toLowerCase()
      const estate = (item['\u5c0f\u533a\u540d'] || '').toLowerCase()
      return addr.includes(kw) || room.includes(kw) || estate.includes(kw)
    })
  }
  // 按 publish_date 倒序
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
    return (num / 10000).toFixed(2) + '\u4e07'
  }
  return num.toLocaleString()
}

function openLink(url) {
  if (!url) return
  uni.showModal({
    title: '\u63d0\u793a',
    content: '\u5373\u5c06\u6253\u5f00\u6dd8\u5b9d\u62cd\u5356\u94fe\u63a5',
    confirmText: '\u6253\u5f00',
    success: (res) => {
      if (res.confirm) {
        uni.navigateTo({
          url: '/pages/webview/webview?url=' + encodeURIComponent(url)
        })
      }
    }
  })
}

// 监听筛选变化重置页码
watch([selectedCommunity, selectedEstate, searchKeyword], () => {
  page.value = 1
}, { flush: 'post' })
</script>

<template>
  <view class="page">
    <!-- 导航栏 -->
    <uv-nav-bar title="\u4ec1\u548c\u793e\u533a\u6cd5\u62cd\u623f" fixed placeholder safeAreaInsetTop />

    <!-- 搜索筛选区 -->
    <view class="search-area">
      <view class="search-input-wrap">
        <uv-input
          v-model="searchKeyword"
          placeholder="\u641c\u7d22\u5730\u5740\u3001\u5c0f\u533a\u3001\u623f\u95f4\u53f7"
          prefixIcon="search"
          clearable
          shape="circle"
          @confirm="doSearch"
        />
      </view>
      <uv-button type="primary" size="small" @click="showFilter = true">
        <uv-icon name="setting" size="14" color="#fff" />
        \u7b5b\u9009
      </uv-button>
    </view>

    <!-- 已选筛选标签 -->
    <view class="filter-tags" v-if="selectedCommunity || selectedEstate">
      <uv-tag v-if="selectedCommunity" type="primary" closable @close="selectedCommunity = ''">
        {{ selectedCommunity }}
      </uv-tag>
      <uv-tag v-if="selectedEstate" type="success" closable @close="selectedEstate = ''">
        {{ selectedEstate }}
      </uv-tag>
    </view>

    <!-- 统计 -->
    <view class="stats-bar">
      <text>\u5171 {{ filteredList.length }} \u6761\u8bb0\u5f55</text>
    </view>

    <!-- 列表 -->
    <scroll-view scroll-y class="list-scroll" @scrolltolower="loadMore">
      <view v-if="filteredList.length === 0 && !loading" class="empty-wrap">
        <uv-empty text="\u6682\u65e0\u6570\u636e" />
      </view>

      <view v-else class="card-list">
        <view
          v-for="(item, index) in displayList"
          :key="index"
          class="house-card"
          @click="openLink(item.item_link)"
        >
          <view class="card-header">
            <text class="estate-name">{{ item['\u5c0f\u533a\u540d'] }}</text>
            <text class="room-no">{{ item['\u623f\u95f4\u53f7'] }}</text>
          </view>
          <view class="card-address">{{ item.property_address }}</view>
          <view class="card-info">
            <view class="info-item">
              <text class="info-label">\u5efa\u7b51\u9762\u79ef</text>
              <text class="info-value">{{ item['\u5efa\u7b51\u9762\u79ef'] || '-' }} m\u00b2</text>
            </view>
            <view class="info-item">
              <text class="info-label">\u697c\u5c42</text>
              <text class="info-value">{{ item['\u5f53\u524d\u697c\u5c42'] || '-' }}/{{ item['\u603b\u697c\u5c42'] || '-' }}</text>
            </view>
            <view class="info-item">
              <text class="info-label">\u5e74\u4efd</text>
              <text class="info-value">{{ item['\u5efa\u7b51\u5e74\u4efd'] || '-' }}</text>
            </view>
          </view>
          <view class="card-price">
            <view class="price-item">
              <text class="price-label">\u8d77\u62cd\u4ef7</text>
              <text class="price-value start">{{ formatPrice(item['\u8d77\u62cd\u4ef7']) }}</text>
            </view>
            <view class="price-item">
              <text class="price-label">\u8bc4\u4f30\u4ef7</text>
              <text class="price-value eval">{{ formatPrice(item['\u8bc4\u4f30\u4ef7']) }}</text>
            </view>
          </view>
          <view class="card-tags">
            <uv-tag size="mini" type="warning">{{ item.auction_round }}</uv-tag>
            <uv-tag
              v-if="item['\u662f\u5426\u5df2\u817e\u7a7a'] === '\u662f'"
              size="mini"
              type="success"
            >\u5df2\u817e\u7a7a</uv-tag>
            <uv-tag
              v-else-if="item['\u662f\u5426\u5df2\u817e\u7a7a'] === '\u5426'"
              size="mini"
              type="danger"
            >\u672a\u817e\u7a7a</uv-tag>
          </view>
          <view class="card-footer">
            <text class="publish-date">\u53d1\u5e03: {{ item.publish_date }}</text>
            <uv-button type="primary" size="mini" plain @click.stop="openLink(item.item_link)">
              \u67e5\u770b\u94fe\u63a5
            </uv-button>
          </view>
        </view>
      </view>

      <uv-load-more :status="loadStatus" />
    </scroll-view>

    <!-- 筛选弹窗 -->
    <uv-popup v-model:show="showFilter" mode="bottom" round="12">
      <view class="popup-content">
        <view class="popup-header">
          <text class="popup-title">\u7b5b\u9009\u6761\u4ef6</text>
          <uv-icon name="close" size="20" @click="showFilter = false" />
        </view>

        <view class="popup-body">
          <view class="filter-section">
            <text class="section-title">\u793e\u533a</text>
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
            <text class="section-title">\u5c0f\u533a</text>
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
          <uv-button type="info" plain @click="resetFilter">\u91cd\u7f6e</uv-button>
          <uv-button type="primary" @click="confirmFilter">\u786e\u5b9a</uv-button>
        </view>
      </view>
    </uv-popup>
  </view>
</template>

<style>
.page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #f5f7fa;
}

/* 搜索区 */
.search-area {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  gap: 10px;
  background: #fff;
  border-bottom: 1px solid #eee;
}

.search-input-wrap {
  flex: 1;
}

/* 筛选标签 */
.filter-tags {
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  background: #fff;
}

/* 统计 */
.stats-bar {
  padding: 8px 16px;
  font-size: 13px;
  color: #666;
  background: #f5f7fa;
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
  justify-content: center;
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

.estate-name {
  font-size: 17px;
  font-weight: 600;
  color: #1a2980;
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
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 10px;
  border-top: 1px solid #f0f0f0;
}

.publish-date {
  font-size: 12px;
  color: #999;
}

/* 弹窗 */
.popup-content {
  padding: 16px;
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
}

.popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.popup-title {
  font-size: 17px;
  font-weight: 600;
  color: #333;
}

.popup-body {
  margin-bottom: 16px;
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
}

.popup-footer :deep(.uv-button) {
  flex: 1;
}
</style>
