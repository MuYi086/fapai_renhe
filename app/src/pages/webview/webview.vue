<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'

const url = ref('')
const title = ref('拍卖链接')

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
  url.value = decodeURIComponent(options.url || '')
  if (options.title) {
    title.value = decodeURIComponent(options.title)
  }
})

function goBack() {
  uni.navigateBack()
}
</script>

<template>
  <view class="page">
    <view class="custom-nav" :style="{ paddingTop: statusBarHeight + 'px' }">
      <view class="nav-bar" :style="{ height: navBarHeight + 'px' }">
        <view class="nav-left" @click="goBack">
          <text class="nav-back">&#8592;</text>
          <text class="nav-back-text">返回</text>
        </view>
        <text class="nav-title">{{ title }}</text>
        <view class="nav-right"></view>
      </view>
    </view>
    <view class="webview-wrap">
      <web-view :src="url" />
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

.webview-wrap {
  flex: 1;
  overflow: hidden;
}
</style>
