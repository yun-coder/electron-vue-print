
<script setup>
import { ref } from 'vue';
import { message} from 'ant-design-vue';

const printerList = ref([]);
const loading = ref(false);

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
</script>

<template>
  <div class="main-card">
    <a-card title="打印功能演示" bordered>
      <a-row>
        <a-col :span="8">
          <a-button type="primary" block :loading="loading" @click="fetchPrinters">获取打印机列表</a-button>
        </a-col>
        <a-col :span="8">
          <a-button type="primary" block @click="printQRCode">静默打印二维码</a-button>
        </a-col>
        <a-col :span="8">
          <a-button type="primary" block @click="printBarCode">静默打印条形码</a-button>
        </a-col>
        <a-col :span="8">
          <a-button type="primary" block @click="getPrintJobs">获取打印任务</a-button>
        </a-col>
      </a-row>
      <a-row :gutter="16" style="margin-top: 24px;">
        <a-col :span="24">
          <a-card v-if="printerList.length" title="打印机列表" style="margin-top: 8px;">
            <ul>
              <li v-for="p in printerList" :key="p.name">
                <strong>{{ p.name }}</strong>
                <span style="margin-left:8px;">状态: {{ p.status }} ({{ p.isDefault ? '默认打印机' : '非默认' }})</span>
              </li>
            </ul>
          </a-card>
        </a-col>
      </a-row>
    </a-card>
  </div>
</template>

<style scoped>
.main-card {
  max-width: 700px;
  margin: 40px auto;
  padding: 24px;
}
</style>
