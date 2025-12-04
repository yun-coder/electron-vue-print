<template>
  <div class="designer-container">
    <!-- 中间设计区域 -->
    <div class="main-content">
      <div class="toolbar">
        <a-space wrap>
          <!-- 操作按钮 -->
          <a-button type="primary" @click="handlePrint">
            <template #icon>
              <PrinterOutlined/>
            </template>
            打印
          </a-button>
        </a-space>
      </div>

      <!-- Canvas设计区 -->
      <div class="canvas-wrapper">
        <RulerCanvas
            :canvas-width="canvasWidth"
            :canvas-height="canvasHeight"
            :scale="3.78 * displayScale"
        >
          <canvas
              ref="canvasRef"
              class="design-canvas"
              :width="canvasWidth"
              :height="canvasHeight"
              @mousedown="handleMouseDown"
              @mousemove="handleMouseMove"
              @mouseup="handleMouseUp"
          ></canvas>
        </RulerCanvas>
      </div>
    </div>
  </div>
</template>

<script setup>
import {onMounted, ref} from 'vue';
import {message} from 'ant-design-vue';
import {PrinterOutlined} from '@ant-design/icons-vue';
import QRCode from 'qrcode';
import RulerCanvas from '../components/RulerCanvas.vue';

const canvasRef = ref(null);
// 使用当前打印纸张尺寸（60x40mm），显示时放大2倍
const displayScale = 2;
const paperWidth = 60;
const paperHeight = 40;
const canvasWidth = ref(paperWidth * 3.78 * displayScale);
const canvasHeight = ref(paperHeight * 3.78 * displayScale);

// 二维码设置
const qrCodeValue = ref('Hello QR Code!');
const qrCodeOptions = ref({
  errorCorrectionLevel: 'M',
  width: 100,
  margin: 1,
  color: {
    dark: '#000000',
    light: '#ffffff',
  },
});

// 画布上的二维码
const qrCode = ref(null);
const selectedQRCode = ref(null);
const isDragging = ref(false);
const isResizing = ref(false);
const dragOffset = ref({x: 0, y: 0});
const resizeHandle = ref('');

// 常量定义
const CONSTANTS = {
  HANDLE_SIZE: 8,
  UPDATE_THROTTLE: 16, // 60fps
  MIN_SIZE: 30,
  INITIAL_SIZE: 100,
  MARGIN_OFFSET: 20,
  BORDER_OFFSET: 5
};

// 二维码图像缓存
let qrCodeImageCache = null;
let lastQRCodeHash = null;

// 动画优化
let animationFrameId = null;
let lastUpdateTime = 0;

let canvas = null;
let ctx = null;

onMounted(() => {
  canvas = canvasRef.value;
  ctx = canvas.getContext('2d');
  addDefaultQRCode();

  // 添加全局事件监听确保拖拽在canvas外也能正常工作
  document.addEventListener('mousemove', handleGlobalMouseMove);
  document.addEventListener('mouseup', handleGlobalMouseUp);
});

// 清理事件监听
const cleanup = () => {
  document.removeEventListener('mousemove', handleGlobalMouseMove);
  document.removeEventListener('mouseup', handleGlobalMouseUp);
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  // 清理缓存
  qrCodeImageCache = null;
  lastQRCodeHash = null;
};

// 组件卸载时清理
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', cleanup);
}

// 添加默认二维码
const addDefaultQRCode = () => {
  const initialSize = CONSTANTS.INITIAL_SIZE * displayScale;
  qrCode.value = {
    id: Date.now(),
    value: qrCodeValue.value,
    options: {...qrCodeOptions.value},
    x: CONSTANTS.MARGIN_OFFSET * displayScale,
    y: CONSTANTS.MARGIN_OFFSET * displayScale,
    rotation: 0,
    scale: 1,
    width: initialSize,
    height: initialSize,
  };
  
  clearImageCache();
  drawCanvas();
};

// 绘制画布 - 优化性能
const drawCanvas = async () => {
  if (!ctx) return;

  try {
    // 清空画布
    ctx.clearRect(0, 0, canvasWidth.value, canvasHeight.value);

    // 绘制背景
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth.value, canvasHeight.value);

    // 绘制二维码
    if (qrCode.value) {
      await drawQRCode(qrCode.value);
    }
  } catch (error) {
    handleError(error, '绘制画布');
  }
};


// 生成二维码内容的哈希值，用于缓存判断
// 注意：这里只包含二维码的内容和生成选项，不包含显示尺寸
const generateQRCodeHash = (qrCode) => {
  return JSON.stringify({
    value: qrCode.value,
    options: qrCode.options
  });
};

// 生成并缓存二维码图像
const generateQRCodeImage = async (qrCode) => {
  const currentHash = generateQRCodeHash(qrCode);
  
  // 如果缓存存在且内容未变，直接返回缓存
  // 缓存的是二维码的原始图像，与显示尺寸无关
  if (qrCodeImageCache && lastQRCodeHash === currentHash) {
    return qrCodeImageCache;
  }
  
  try {
    // 生成新的二维码
    const dataURL = await QRCode.toDataURL(qrCode.value, qrCode.options);
    const img = new Image();
    
    return new Promise((resolve) => {
      img.onload = () => {
        // 更新缓存
        qrCodeImageCache = img;
        lastQRCodeHash = currentHash;
        resolve(img);
      };
      img.src = dataURL;
    });
  } catch (error) {
    handleError(error, '生成二维码');
    return null;
  }
};

// 绘制单个二维码（优化版本）
const drawQRCode = async (qrCode) => {
  try {
    // 获取缓存的或新生成的二维码图像
    const img = await generateQRCodeImage(qrCode);
    if (!img) return;

    // 保存画布状态
    ctx.save();

    // 移动到二维码位置并旋转
    ctx.translate(qrCode.x + qrCode.width / 2, qrCode.y + qrCode.height / 2);
    ctx.rotate(qrCode.rotation * Math.PI / 180);

    // 绘制二维码，使用实际设置的尺寸
    ctx.drawImage(img, -qrCode.width / 2, -qrCode.height / 2, qrCode.width, qrCode.height);

    // 如果是选中的二维码，绘制选中框和缩放控制点
    if (selectedQRCode.value && selectedQRCode.value.id === qrCode.id) {
      ctx.strokeStyle = '#1890ff';
      ctx.lineWidth = 2;
      const offset = CONSTANTS.BORDER_OFFSET;
      ctx.strokeRect(-qrCode.width / 2 - offset, -qrCode.height / 2 - offset,
          qrCode.width + offset * 2, qrCode.height + offset * 2);

      // 绘制缩放控制点
      const handleSize = CONSTANTS.HANDLE_SIZE;
      ctx.fillStyle = '#1890ff';
      ctx.fillRect(qrCode.width / 2 - handleSize / 2, qrCode.height / 2 - handleSize / 2, handleSize, handleSize);
    }

    // 恢复画布状态
    ctx.restore();
  } catch (error) {
    handleError(error, '绘制二维码');
  }
};

// 鼠标事件处理
const handleMouseDown = (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  const qrCodeAtPosition = findQRCodeAtPosition(x, y);
  if (qrCodeAtPosition) {
    selectedQRCode.value = qrCodeAtPosition;

    // 先检查是否点击了缩放控制点
    const handle = getResizeHandle(x, y, qrCodeAtPosition);
    if (handle) {
      isResizing.value = true;
      resizeHandle.value = handle;
      isDragging.value = false;
    } else {
      // 检查是否点击了二维码本体（非控制点区域）
      const qr = qrCodeAtPosition;
      if (isWithinBounds(x, y, qr)) {
        isDragging.value = true;
        isResizing.value = false;
        dragOffset.value = {
          x: x - qr.x,
          y: y - qr.y,
        };
      }
    }
    drawCanvas();
  } else {
    selectedQRCode.value = null;
    isDragging.value = false;
    isResizing.value = false;
    drawCanvas();
  }
};

const handleMouseMove = (event) => {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  // 只在需要时更新光标
  if (!isDragging.value && !isResizing.value && selectedQRCode.value) {
    const handle = getResizeHandle(x, y, selectedQRCode.value);
    if (handle) {
      canvas.style.cursor = 'se-resize';
    } else {
      if (isWithinBounds(x, y, selectedQRCode.value)) {
        canvas.style.cursor = 'move';
      } else {
        canvas.style.cursor = 'default';
      }
    }
  } else if (!isDragging.value && !isResizing.value) {
    canvas.style.cursor = 'default';
  }
};

// 全局鼠标移动事件（用于拖拽和缩放）
const handleGlobalMouseMove = (event) => {
  if (!canvas || (!isDragging.value && !isResizing.value)) return;

  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  if (isResizing.value && selectedQRCode.value) {
    // 缩放逻辑 - 优化缩放算法
    const qrCode = selectedQRCode.value;
    const deltaX = x - qrCode.x;
    const deltaY = y - qrCode.y;
    const newSize = Math.max(CONSTANTS.MIN_SIZE * displayScale, Math.min(Math.abs(deltaX), Math.abs(deltaY)));

    // 直接更新二维码的实际尺寸
    qrCode.width = newSize;
    qrCode.height = newSize;
    // 更新缩放比例（用于显示和选中框）
    qrCode.scale = Math.max(0.5, Math.min(3, newSize / qrCodeOptions.value.width));
    
    // 缩放时不需要清除缓存，因为二维码内容和选项未变
    // 只有显示尺寸变化，可以复用原始二维码图像
    
    throttledDraw();
  } else if (isDragging.value && selectedQRCode.value) {
    // 拖拽移动逻辑 - 节流优化
    selectedQRCode.value.x = x - dragOffset.value.x;
    selectedQRCode.value.y = y - dragOffset.value.y;

    throttledDraw();
  }
};

// 全局鼠标释放事件
const handleGlobalMouseUp = () => {
  if (isDragging.value || isResizing.value) {
    handleMouseUp();
  }
};

// 节流重绘函数
const throttledDraw = () => {
  const now = Date.now();
  if (now - lastUpdateTime < CONSTANTS.UPDATE_THROTTLE) {
    if (!animationFrameId) {
      animationFrameId = requestAnimationFrame(() => {
        drawCanvas();
        lastUpdateTime = Date.now();
        animationFrameId = null;
      });
    }
    return;
  }

  drawCanvas();
  lastUpdateTime = now;
};

const handleMouseUp = () => {
  if (!isDragging.value && !isResizing.value) return;

  isDragging.value = false;
  isResizing.value = false;
  resizeHandle.value = '';

  // 重置光标
  if (canvas) {
    canvas.style.cursor = 'default';
  }

  // 清理动画帧并确保最终重绘
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  drawCanvas();
};

// 查找指定位置的二维码（包含控制点区域）
const findQRCodeAtPosition = (x, y) => {
  if (!qrCode.value) return null;

  const qr = qrCode.value;
  const handleSize = CONSTANTS.HANDLE_SIZE;
  // 扩大检测区域，包含控制点
  return (x >= qr.x - handleSize && x <= qr.x + qr.width + handleSize &&
      y >= qr.y - handleSize && y <= qr.y + qr.height + handleSize) ? qr : null;
};

// 工具函数
const isWithinBounds = (x, y, element) => {
  return x >= element.x && x <= element.x + element.width &&
         y >= element.y && y <= element.y + element.height;
};

const clearImageCache = () => {
  qrCodeImageCache = null;
  lastQRCodeHash = null;
};

// 统一错误处理
const handleError = (error, context = '') => {
  console.error(`[二维码设计器${context}] 错误:`, error);
  message.error(`操作失败: ${error.message || '未知错误'}`);
};

// 性能监控
const performanceMonitor = {
  start: (label) => {
    if (process.env.NODE_ENV === 'development') {
      performance.mark(`${label}-start`);
    }
  },
  end: (label) => {
    if (process.env.NODE_ENV === 'development') {
      performance.mark(`${label}-end`);
      performance.measure(label, `${label}-start`, `${label}-end`);
    }
  }
};

// 获取缩放控制点
const getResizeHandle = (x, y, qrCode) => {
  const handleSize = CONSTANTS.HANDLE_SIZE;
  const rightX = qrCode.x + qrCode.width;
  const bottomY = qrCode.y + qrCode.height;

  // 检查右下角控制点（扩大检测区域）
  if (x >= rightX - handleSize / 2 && x <= rightX + handleSize / 2 &&
      y >= bottomY - handleSize / 2 && y <= bottomY + handleSize / 2) {
    return 'se';
  }

  return null;
};

// 打印
const handlePrint = async () => {
  if (!qrCode.value) {
    message.warning('请先添加二维码');
    return;
  }

  try {
    // 创建打印用的canvas，按实际尺寸（缩小2倍）
    const printCanvas = document.createElement('canvas');
    printCanvas.width = paperWidth * 3.78;
    printCanvas.height = paperHeight * 3.78;
    const printCtx = printCanvas.getContext('2d');

    // 绘制白色背景
    printCtx.fillStyle = '#ffffff';
    printCtx.fillRect(0, 0, printCanvas.width, printCanvas.height);

    // 绘制二维码到打印canvas，按设计器中的实际调整后内容
    try {
      const qr = qrCode.value;
      // 使用调整后的尺寸生成二维码
      const printOptions = {
        ...qr.options,
        width: Math.round(qr.width / displayScale), // 转换为实际打印尺寸
        margin: 1
      };

      const dataURL = await QRCode.toDataURL(qr.value, printOptions);
      const img = new Image();

      await new Promise((resolve) => {
        img.onload = () => {
          printCtx.save();
          // 按设计器中的位置和尺寸缩放到打印尺寸
          const printX = qr.x / displayScale;
          const printY = qr.y / displayScale;
          const printWidth = qr.width / displayScale;
          const printHeight = qr.height / displayScale;

          printCtx.translate(printX + printWidth / 2, printY + printHeight / 2);
          printCtx.rotate(qr.rotation * Math.PI / 180);
          printCtx.drawImage(img, -printWidth / 2, -printHeight / 2, printWidth, printHeight);
          printCtx.restore();
          resolve();
        };
        img.src = dataURL;
      });
    } catch (error) {
      handleError(error, '生成打印二维码');
    }

    // 这里可以调用electron的打印API，传入打印用的canvas数据
    const printData = printCanvas.toDataURL();
    await window.electronAPI?.printQRCode(qrCodeValue.value, printData);
    message.success('打印成功');
  } catch (error) {
    handleError(error, '打印操作');
  }
};
</script>

<style scoped>
.designer-container {
  width: 100%;
  height: 100%;
}

.toolbar {
  padding: 16px;
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
}

.canvas-wrapper {
  flex: 1;
  overflow: auto;
  padding: 40px;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  background: #ffffff;
}

.design-canvas {
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  border: 1px solid #d9d9d9;
  display: block;
  cursor: pointer;
}
</style>
