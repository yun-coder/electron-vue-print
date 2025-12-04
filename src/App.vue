<script setup>
import {ref} from 'vue';
import {message} from 'ant-design-vue';
import zhCN from 'ant-design-vue/es/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';

// 设置 dayjs 为中文
dayjs.locale('zh-cn');

// 中文语言配置
const locale = zhCN;

const printerList = ref([]);
const loading = ref(false);
const showPrintParams = ref(false);
const printParams = ref({
  pageWidth: 60, // 毫米
  pageHeight: 40, // 毫米
  marginType: 'none',
  silent: true,
  printBackground: true
});

async function fetchPrinters() {
  loading.value = true;
  try {
    const printers = await window.electronAPI.getPrinters();
    printerList.value = printers;
  } catch (error) {
    message.error(error.message);
  } finally {
    loading.value = false;
  }
}

async function printQRCode() {
  try {
    await window.electronAPI.printQRCode("123");
    message.success("二维码打印成功");
  } catch (e) {
    message.error("二维码打印失败");
  }
}

async function printBarCode() {
  try {
    await window.electronAPI.printBarCode("456");
    message.success("条形码打印成功");
  } catch (e) {
    message.error("条形码打印失败");
  }
}

async function getPrintJobs() {
  try {
    const jobs = await window.electronAPI.getPrintJobs();
    console.log("当前打印任务：", jobs);
    message.success("获取打印任务成功，查看控制台日志");
  } catch (e) {
    message.error("获取打印任务失败");
  }
}

async function setPrintParams() {
  showPrintParams.value = true;
}

async function savePrintParams() {
  // 转换为 Electron 需要的微米单位
  const paramsToSave = {
    width: printParams.value.pageWidth * 1000,
    height: printParams.value.pageHeight * 1000
  };
  try {
    await window.electronAPI.setPrintParams(paramsToSave);
    message.success("设置打印参数成功");
    showPrintParams.value = false;
  } catch (e) {
    message.warning("设置打印机参数失败，将使用默认参数");
  }
}
</script>

<template>
  <a-config-provider :locale="locale">
    <div class="container">
    <h1 class="page-title">打印功能演示</h1>

    <div class="card-grid">
      <a-card class="function-card" hoverable>
        <div class="card-content">
          <div class="card-icon">📋</div>
          <h3 class="card-title">获取打印机列表</h3>
          <a-button type="primary" block :loading="loading" @click="fetchPrinters">
            获取打印机列表
          </a-button>
        </div>
      </a-card>

      <a-card class="function-card" hoverable>
        <div class="card-content">
          <div class="card-icon">📱</div>
          <h3 class="card-title">打印二维码</h3>
          <a-button type="primary" block @click="printQRCode">
            静默打印二维码
          </a-button>
        </div>
      </a-card>

      <a-card class="function-card" hoverable>
        <div class="card-content">
          <div class="card-icon">🏷️</div>
          <h3 class="card-title">打印条形码</h3>
          <a-button type="primary" block @click="printBarCode">
            静默打印条形码
          </a-button>
        </div>
      </a-card>

      <a-card class="function-card" hoverable>
        <div class="card-content">
          <div class="card-icon">⚙️</div>
          <h3 class="card-title">设置打印参数</h3>
          <a-button type="primary" block @click="setPrintParams">
            设置打印参数
          </a-button>
        </div>
      </a-card>

      <a-card class="function-card" hoverable>
        <div class="card-content">
          <div class="card-icon">📄</div>
          <h3 class="card-title">获取打印任务</h3>
          <a-button type="primary" block @click="getPrintJobs">
            获取打印任务
          </a-button>
        </div>
      </a-card>
    </div>

    <div v-if="printerList.length" class="printer-list">
      <h2 class="section-title">打印机列表</h2>
      <a-list :data-source="printerList" bordered>
        <template #renderItem="{ item }">
          <a-list-item>
            <a-list-item-meta>
              <template #title>
                <span class="printer-name">{{ item.name }}</span>
                <a-tag v-if="item.isDefault" color="blue" style="margin-left: 8px;">默认</a-tag>
              </template>
              <template #description>
                状态: {{ item.status }}
              </template>
            </a-list-item-meta>
          </a-list-item>
        </template>
      </a-list>
    </div>

    <!-- 打印参数设置弹窗 -->
    <a-modal
        v-model:open="showPrintParams"
        title="打印参数设置"
        width="600px"
        :centered="true"
        @ok="savePrintParams"
    >
      <a-form :model="printParams" layout="vertical">
        <a-form-item label="页面宽度 (毫米)">
          <a-input-number v-model:value="printParams.pageWidth" :min="1" :max="300" style="width: 100%;"/>
        </a-form-item>

        <a-form-item label="页面高度 (毫米)">
          <a-input-number v-model:value="printParams.pageHeight" :min="1" :max="300" style="width: 100%;"/>
        </a-form-item>
      </a-form>
    </a-modal>
    </div>
  </a-config-provider>
</template>

<style scoped>
.page-title {
  font-size: 24px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0 0 24px 0;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.function-card {
  transition: all 0.3s ease;
  border-radius: 8px;
}

.function-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.card-content {
  text-align: center;
  padding: 8px;
}

.card-icon {
  font-size: 40px;
  margin-bottom: 8px;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0 0 4px 0;
}

.card-desc {
  font-size: 12px;
  color: #666;
  margin: 0 0 10px 0;
  line-height: 1.3;
}

.printer-list {
  background: white;
  padding: 24px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.section-title {
  font-size: 20px;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 16px;
}

.printer-name {
  font-weight: 500;
  font-size: 16px;
}
</style>
