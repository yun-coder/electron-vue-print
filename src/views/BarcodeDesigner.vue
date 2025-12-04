<template>
  <div class="designer-container">
    <!-- 中间设计区域 -->
    <div class="main-content">
      <div class="toolbar">
        <a-space wrap>
          <!-- 操作按钮 -->
          <a-button type="primary" @click="handlePrint">
            <template #icon><PrinterOutlined /></template>
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
import {PrinterOutlined,} from '@ant-design/icons-vue';
import JsBarcode from 'jsbarcode';
import RulerCanvas from '../components/RulerCanvas.vue';

const canvasRef = ref(null);
// 使用当前打印纸张尺寸（60x40mm），显示时放大2倍
const displayScale = 2;
const paperWidth = 60;
const paperHeight = 40;
const canvasWidth = ref(paperWidth * 3.78 * displayScale);
const canvasHeight = ref(paperHeight * 3.78 * displayScale);

// 条形码设置
const barcodeValue = ref('123456789');
const barcodeFormat = ref('CODE128');
const barcodeOptions = ref({
  width: 2,
  height: 100,
  displayValue: true,
  fontSize: 14,
});

// 画布上的条形码
const barcode = ref(null);
const selectedBarcode = ref(null);
const isDragging = ref(false);
const isResizing = ref(false);
const dragOffset = ref({ x: 0, y: 0 });
const resizeHandle = ref('');

// 常量定义
const CONSTANTS = {
  HANDLE_SIZE: 8,
  UPDATE_THROTTLE: 16, // 60fps
  MIN_WIDTH: 50,
  MIN_HEIGHT: 30,
  INITIAL_WIDTH: 200,
  INITIAL_HEIGHT: 100,
  MARGIN_OFFSET: 50,
  BORDER_OFFSET: 5
};

// 条形码图像缓存
let barcodeImageCache = null;
let lastBarcodeHash = null;

// 动画优化
let animationFrameId = null;
let lastUpdateTime = 0;

let canvas = null;
let ctx = null;

onMounted(() => {
  canvas = canvasRef.value;
  ctx = canvas.getContext('2d');
  addDefaultBarcode();
  
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
  barcodeImageCache = null;
  lastBarcodeHash = null;
};

// 组件卸载时清理
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', cleanup);
}

// 添加默认条形码
const addDefaultBarcode = () => {
  barcode.value = {
    id: Date.now(),
    value: barcodeValue.value,
    format: barcodeFormat.value,
    options: { ...barcodeOptions.value },
    x: CONSTANTS.MARGIN_OFFSET * displayScale,
    y: CONSTANTS.MARGIN_OFFSET * displayScale,
    rotation: 0,
    width: CONSTANTS.INITIAL_WIDTH * displayScale,
    height: CONSTANTS.INITIAL_HEIGHT * displayScale,
  };
  
  clearImageCache();
  drawCanvas();
};


// 绘制画布
const drawCanvas = () => {
  if (!ctx) return;
  
  // 清空画布
  ctx.clearRect(0, 0, canvasWidth.value, canvasHeight.value);
  
  // 绘制背景
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasWidth.value, canvasHeight.value);
  
  // 绘制条形码
  if (barcode.value) {
    drawBarcode(barcode.value);
  }
};


// 生成条形码内容的哈希值，用于缓存判断
const generateBarcodeHash = (barcode) => {
  return JSON.stringify({
    value: barcode.value,
    format: barcode.format,
    options: barcode.options
  });
};

// 生成并缓存条形码图像
const generateBarcodeImage = (barcode) => {
  const currentHash = generateBarcodeHash(barcode);
  
  // 如果缓存存在且内容未变，直接返回缓存
  if (barcodeImageCache && lastBarcodeHash === currentHash) {
    return barcodeImageCache;
  }
  
  try {
    // 创建临时canvas来生成条形码
    const tempCanvas = document.createElement('canvas');
    JsBarcode(tempCanvas, barcode.value, {
      format: barcode.format,
      width: barcode.options.width,
      height: barcode.options.height,
      displayValue: barcode.options.displayValue,
      fontSize: barcode.options.fontSize,
    });
    
    // 更新缓存
    barcodeImageCache = tempCanvas;
    lastBarcodeHash = currentHash;
    
    return tempCanvas;
  } catch (error) {
    handleError(error, '生成条形码');
    return null;
  }
};

// 绘制单个条形码（优化版本）
const drawBarcode = (barcode) => {
  try {
    // 获取缓存的或新生成的条形码图像
    const tempCanvas = generateBarcodeImage(barcode);
    if (!tempCanvas) return;
    
    // 保存画布状态
    ctx.save();
    
    // 移动到条形码位置并旋转
    ctx.translate(barcode.x + tempCanvas.width / 2, barcode.y + tempCanvas.height / 2);
    ctx.rotate(barcode.rotation * Math.PI / 180);
    
    // 绘制条形码
    ctx.drawImage(tempCanvas, -tempCanvas.width / 2, -tempCanvas.height / 2);
    
    // 如果是选中的条形码，绘制选中框和缩放控制点
    if (selectedBarcode.value && selectedBarcode.value.id === barcode.id) {
      ctx.strokeStyle = '#1890ff';
      ctx.lineWidth = 2;
      const offset = CONSTANTS.BORDER_OFFSET;
      ctx.strokeRect(-tempCanvas.width / 2 - offset, -tempCanvas.height / 2 - offset, 
                     tempCanvas.width + offset * 2, tempCanvas.height + offset * 2);
      
      // 绘制缩放控制点
      const handleSize = CONSTANTS.HANDLE_SIZE;
      ctx.fillStyle = '#1890ff';
      ctx.fillRect(tempCanvas.width / 2 - handleSize / 2, tempCanvas.height / 2 - handleSize / 2, handleSize, handleSize);
    }
    
    // 恢复画布状态
    ctx.restore();
    
    // 更新条形码尺寸
    barcode.width = tempCanvas.width;
    barcode.height = tempCanvas.height;
    
  } catch (error) {
    handleError(error, '绘制条形码');
  }
};

// 鼠标事件处理
const handleMouseDown = (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  
  const clickedBarcode = findBarcodeAtPosition(x, y);
  if (clickedBarcode) {
    selectedBarcode.value = clickedBarcode;
    
    // 先检查是否点击了缩放控制点
    const handle = getResizeHandle(x, y, clickedBarcode);
    if (handle) {
      isResizing.value = true;
      resizeHandle.value = handle;
      isDragging.value = false;
    } else {
      // 检查是否点击了条形码本体（非控制点区域）
      const bc = clickedBarcode;
      if (isWithinBounds(x, y, bc)) {
        isDragging.value = true;
        isResizing.value = false;
        dragOffset.value = {
          x: x - bc.x,
          y: y - bc.y,
        };
      }
    }
    drawCanvas();
  } else {
    selectedBarcode.value = null;
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
  if (!isDragging.value && !isResizing.value && selectedBarcode.value) {
    const handle = getResizeHandle(x, y, selectedBarcode.value);
    if (handle) {
      canvas.style.cursor = 'se-resize';
    } else {
      // 检查是否在条形码区域内
      if (isWithinBounds(x, y, selectedBarcode.value)) {
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
  
  if (isResizing.value && selectedBarcode.value) {
    // 缩放逻辑 - 优化缩放算法
    const barcode = selectedBarcode.value;
    const newWidth = Math.max(CONSTANTS.MIN_WIDTH * displayScale, Math.abs(x - barcode.x));
    const newHeight = Math.max(CONSTANTS.MIN_HEIGHT * displayScale, Math.abs(y - barcode.y));
    
    // 更新条形码的实际显示尺寸
    barcode.width = newWidth;
    barcode.height = newHeight;
    // 同时更新选项中的尺寸参数
    barcode.options.width = Math.max(1, newWidth / (60 * displayScale)); // 调整系数使缩放更灵敏
    barcode.options.height = Math.max(20, newHeight / displayScale);
    
    throttledDraw();
  } else if (isDragging.value && selectedBarcode.value) {
    // 拖拽移动逻辑 - 节流优化
    selectedBarcode.value.x = x - dragOffset.value.x;
    selectedBarcode.value.y = y - dragOffset.value.y;
    
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

// 查找指定位置的条形码（包含控制点区域）
const findBarcodeAtPosition = (x, y) => {
  if (!barcode.value) return null;
  
  const bc = barcode.value;
  const handleSize = CONSTANTS.HANDLE_SIZE;
  // 扩大检测区域，包含控制点
  return (x >= bc.x - handleSize && x <= bc.x + bc.width + handleSize &&
          y >= bc.y - handleSize && y <= bc.y + bc.height + handleSize) ? bc : null;
};

// 工具函数
const isWithinBounds = (x, y, element) => {
  return x >= element.x && x <= element.x + element.width &&
         y >= element.y && y <= element.y + element.height;
};

const clearImageCache = () => {
  barcodeImageCache = null;
  lastBarcodeHash = null;
};

// 统一错误处理
const handleError = (error, context = '') => {
  console.error(`[条形码设计器${context}] 错误:`, error);
  message.error(`操作失败: ${error.message || '未知错误'}`);
};

// 获取缩放控制点
const getResizeHandle = (x, y, barcode) => {
  const handleSize = CONSTANTS.HANDLE_SIZE;
  const rightX = barcode.x + barcode.width;
  const bottomY = barcode.y + barcode.height;
  
  // 检查右下角控制点（扩大检测区域）
  if (x >= rightX - handleSize / 2 && x <= rightX + handleSize / 2 &&
      y >= bottomY - handleSize / 2 && y <= bottomY + handleSize / 2) {
    return 'se';
  }
  
  return null;
};



// 打印
const handlePrint = async () => {
  if (!barcode.value) {
    message.warning('请先添加条形码');
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
    
    // 绘制条形码到打印canvas，按设计器中的实际调整后内容
    const tempCanvas = document.createElement('canvas');
    try {
      const bc = barcode.value;
      // 使用调整后的尺寸生成条形码
      JsBarcode(tempCanvas, bc.value, {
        format: bc.format,
        width: bc.options.width,
        height: bc.options.height,
        displayValue: bc.options.displayValue,
        fontSize: bc.options.fontSize,
      });
      
      printCtx.save();
      // 按设计器中的位置和尺寸缩放到打印尺寸
      const printX = bc.x / displayScale;
      const printY = bc.y / displayScale;
      const printWidth = bc.width / displayScale;
      const printHeight = bc.height / displayScale;
      
      printCtx.translate(printX + printWidth / 2, printY + printHeight / 2);
      printCtx.rotate(bc.rotation * Math.PI / 180);
      // 绘制时使用设计器中调整后的尺寸
      printCtx.drawImage(tempCanvas, -printWidth / 2, -printHeight / 2, printWidth, printHeight);
      printCtx.restore();
    } catch (error) {
      handleError(error, '生成打印条形码');
    }
    
    // 这里可以调用electron的打印API，传入打印用的canvas数据
    const printData = printCanvas.toDataURL();
    await window.electronAPI?.printBarCode(barcodeValue.value, printData);
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

.ruler-canvas-wrapper {
  position: relative;
}

.design-canvas {
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  border: 1px solid #d9d9d9;
  display: block;
  cursor: pointer;
}
</style>
