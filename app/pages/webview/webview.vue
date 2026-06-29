<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'

const url = ref('')

onLoad((options) => {
  url.value = decodeURIComponent(options.url || '')
})
</script>

<template>
  <view style="height: 100vh;">
    <web-view :src="url" />
  </view>
</template>
