<script setup>
import { ref, computed, onMounted } from 'vue'

const communityData = ref({})
const houseList = ref([])
const loading = ref(false)

const selectedCommunity = ref('')
const selectedEstate = ref('')
const searchKeyword = ref('')

const currentPage = ref(1)
const pageSize = ref(15)

// 加载数据
onMounted(async () => {
  loading.value = true
  try {
    const [commRes, houseRes] = await Promise.all([
      fetch('/community.json'),
      fetch('/house.json')
    ])
    communityData.value = await commRes.json()
    houseList.value = await houseRes.json()
  } catch (e) {
    console.error('数据加载失败', e)
  } finally {
    loading.value = false
  }
})

// 当前社区下的小区列表
const estateOptions = computed(() => {
  if (!selectedCommunity.value) return []
  return communityData.value[selectedCommunity.value] || []
})

// 社区改变时重置小区选择
function onCommunityChange() {
  selectedEstate.value = ''
}

// 筛选后的数据
const filteredList = computed(() => {
  let list = houseList.value
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
  return list
})

// 分页后的数据
const paginatedList = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredList.value.slice(start, start + pageSize.value)
})

function resetFilters() {
  selectedCommunity.value = ''
  selectedEstate.value = ''
  searchKeyword.value = ''
  currentPage.value = 1
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
</script>

<template>
  <div class="app-wrapper">
    <header class="page-header">
      <div class="header-inner">
        <el-icon size="28" color="#fff"><OfficeBuilding /></el-icon>
        <h1>仁和社区法拍房信息平台</h1>
      </div>
    </header>

    <main class="main-content">
      <!-- 筛选卡片 -->
      <el-card shadow="hover" class="filter-card">
        <template #header>
          <div class="card-header">
            <el-icon><Filter /></el-icon>
            <span>筛选条件</span>
          </div>
        </template>
        <el-row :gutter="20" align="middle">
          <el-col :xs="24" :sm="12" :md="6" :lg="5">
            <el-select
              v-model="selectedCommunity"
              placeholder="选择社区"
              clearable
              @change="onCommunityChange"
              style="width: 100%"
            >
              <el-option
                v-for="(estates, name) in communityData"
                :key="name"
                :label="name"
                :value="name"
              />
            </el-select>
          </el-col>
          <el-col :xs="24" :sm="12" :md="6" :lg="5">
            <el-select
              v-model="selectedEstate"
              placeholder="选择小区"
              clearable
              :disabled="!selectedCommunity"
              style="width: 100%"
            >
              <el-option
                v-for="name in estateOptions"
                :key="name"
                :label="name"
                :value="name"
              />
            </el-select>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8" :lg="8">
            <el-input
              v-model="searchKeyword"
              placeholder="搜索地址、小区、房间号..."
              clearable
              style="width: 100%"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
          </el-col>
          <el-col :xs="24" :sm="12" :md="4" :lg="6">
            <el-button type="primary" @click="currentPage = 1">
              <el-icon><Search /></el-icon> 查询
            </el-button>
            <el-button @click="resetFilters">
              <el-icon><RefreshRight /></el-icon> 重置
            </el-button>
          </el-col>
        </el-row>
      </el-card>

      <!-- 统计栏 -->
      <div class="stats-bar">
        <el-tag type="info" effect="plain" size="large">
          共 <strong>{{ filteredList.length }}</strong> 条记录
        </el-tag>
      </div>

      <!-- 数据表格 -->
      <el-card shadow="never" class="table-card">
        <el-table
          :data="paginatedList"
          v-loading="loading"
          stripe
          border
          highlight-current-row
          style="width: 100%"
          :default-sort="{ prop: 'publish_date', order: 'descending' }"
        >
          <el-table-column type="index" label="序号" width="60" align="center" />
          <el-table-column prop="社区" label="社区" width="100" align="center" sortable />
          <el-table-column prop="小区名" label="小区" width="120" align="center" sortable />
          <el-table-column prop="房间号" label="房间号" width="120" align="center" />
          <el-table-column prop="property_address" label="房产地址" min-width="220" show-overflow-tooltip />
          <el-table-column prop="auction_round" label="拍卖轮次" width="110" align="center" />
          <el-table-column prop="publish_date" label="发布日期" width="110" align="center" sortable />
          <el-table-column prop="起拍价" label="起拍价" width="100" align="right">
            <template #default="{ row }">
              <span class="price-highlight">{{ formatPrice(row['起拍价']) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="评估价" label="评估价" width="100" align="right">
            <template #default="{ row }">
              <span class="price-muted">{{ formatPrice(row['评估价']) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="建筑面积" label="建筑面积" width="100" align="center">
            <template #default="{ row }">
              {{ row['建筑面积'] ? row['建筑面积'] + ' m²' : '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="用途" label="用途" width="80" align="center" />
          <el-table-column prop="总楼层" label="总楼层" width="80" align="center" />
          <el-table-column prop="当前楼层" label="当前楼层" width="90" align="center" />
          <el-table-column prop="建筑年份" label="建筑年份" width="100" align="center" />
          <el-table-column prop="是否已腾空" label="已腾空" width="90" align="center">
            <template #default="{ row }">
              <el-tag v-if="row['是否已腾空'] === '是'" type="success" size="small">是</el-tag>
              <el-tag v-else-if="row['是否已腾空'] === '否'" type="danger" size="small">否</el-tag>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column prop="租赁情况" label="租赁情况" width="120" align="center" show-overflow-tooltip />
          <el-table-column label="操作" width="100" align="center" fixed="right">
            <template #default="{ row }">
              <el-link
                :href="row.item_link"
                target="_blank"
                type="primary"
                :underline="false"
              >
                <el-icon><Link /></el-icon> 淘宝
              </el-link>
            </template>
          </el-table-column>
        </el-table>

        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 15, 20, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          :total="filteredList.length"
          class="pagination"
          @size-change="currentPage = 1"
        />
      </el-card>
    </main>

    <footer class="page-footer">
      <p>仁和社区法拍房信息查询系统</p>
    </footer>
  </div>
</template>

<style scoped>
.app-wrapper {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f7fa;
}

.page-header {
  background: linear-gradient(135deg, #1a2980 0%, #26d0ce 100%);
  padding: 0 24px;
  height: 64px;
  display: flex;
  align-items: center;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.header-inner {
  max-width: 1400px;
  width: 100%;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-header h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  color: #fff;
  letter-spacing: 1px;
}

.main-content {
  flex: 1;
  max-width: 1400px;
  width: 100%;
  margin: 0 auto;
  padding: 24px;
  box-sizing: border-box;
}

.filter-card {
  margin-bottom: 16px;
  border-radius: 12px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 15px;
  color: #303133;
}

.stats-bar {
  margin-bottom: 12px;
}

.table-card {
  border-radius: 12px;
}

.price-highlight {
  color: #f56c6c;
  font-weight: 600;
}

.price-muted {
  color: #909399;
}

.pagination {
  margin-top: 20px;
  justify-content: flex-end;
}

.page-footer {
  text-align: center;
  padding: 16px;
  color: #909399;
  font-size: 13px;
  background: #fff;
  border-top: 1px solid #ebeef5;
}

:deep(.el-table th) {
  background-color: #f0f9ff !important;
  font-weight: 600;
  color: #1a2980;
}

:deep(.el-table--striped .el-table__body tr.el-table__row--striped td) {
  background: #fafbfc;
}

:deep(.el-card__header) {
  padding: 14px 20px;
  border-bottom: 1px solid #ebeef5;
  background: #fafafa;
  border-radius: 12px 12px 0 0;
}
</style>
