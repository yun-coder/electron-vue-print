const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const Stomp = require('stompjs');
const WebSocket = require('ws');

// 获取默认打印机名称
async function getDefaultPrinterName() {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  if (focusedWindow) {
    const printers = await focusedWindow.webContents.getPrintersAsync();
    console.log(printers);
    const defaultPrinter = printers.find((v) => v.isDefault);
    return defaultPrinter ? defaultPrinter.name : null;
  } else {
    console.log('没有启用的窗口');
    return null;
  }
}

// 连接WebSocket服务
function connectSocket() {
  const ws = new WebSocket('ws://192.168.2.170:8082/pms/endpoint');
  const stompClient = Stomp.over(ws);
  stompClient.connect(
    {
      userCode: '218817272071061505',
    },
    (frame) => {
      stompClient.subscribe('/user/bubble', async (message) => {
        try {
          console.log(message.body);
          // await printQRCode('222')
          // await printBarCode("111")
        } catch (e) {
          console.log('websocket error:', e);
        }
      });
    },
    (error) => {
      console.error('STOMP error:', error);
    }
  );
}

// 二维码打印
async function printQRCode(content) {
  const printerName = await getDefaultPrinterName();
  if (!printerName) throw new Error('未找到默认的打印机');
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
    },
  });
  await printWindow.loadURL(
    `file://${__dirname}/static/qrCode.html?content=${encodeURIComponent(content)}`
  );
  const options = {
    silent: true,
    printBackground: true,
    pageSize: {
      width: 60000,
      height: 40000,
    },
    deviceName: printerName,
    margins: {
      marginType: 'none',
    },
  };
  printWindow.webContents.print(options, (success) => {
    printWindow.destroy();
  });
}

// 条形码打印
async function printBarCode(content) {
  const printerName = await getDefaultPrinterName();
  if (!printerName) throw new Error('未找到默认的打印机');
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
    },
  });
  await printWindow.loadURL(
    `file://${__dirname}/static/barCode.html?content=${encodeURIComponent(content)}`
  );
  const options = {
    silent: true,
    printBackground: false,
    pageSize: {
      width: 60000,
      height: 40000,
    },
    deviceName: printerName,
    margins: {
      marginType: 'none',
    },
  };
  printWindow.webContents.print(options, (success) => {
    printWindow.destroy();
  });
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  mainWindow.loadFile('dist/index.html');

  // 获取打印机列表
  ipcMain.handle('get-printers', async (event) => {
    try {
      await getDefaultPrinterName();
      return BrowserWindow.getFocusedWindow().webContents.getPrintersAsync();
    } catch (e) {
      throw new Error('获取失败');
    }
  });

  // 二维码打印处理
  ipcMain.handle('silent-print-qrcode', async (_, content) => {
    const printerName = await getDefaultPrinterName();
    if (!printerName) throw new Error('未找到默认的打印机');
    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: true,
      },
    });
    await printWindow.loadURL(
      `file://${__dirname}/static/qrCode.html?content=${encodeURIComponent(content)}`
    );
    const options = {
      silent: true,
      printBackground: true,
      pageSize: {
        width: 60000,
        height: 40000,
      },
      deviceName: printerName,
      margins: {
        marginType: 'none',
      },
    };
    printWindow.webContents.print(options, (success) => {
      printWindow.destroy();
    });
  });

  // 条形码打印处理
  ipcMain.handle('silent-print-barcode', async (_, content) => {
    const printerName = await getDefaultPrinterName();
    if (!printerName) throw new Error('未找到默认的打印机');
    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: true,
      },
    });
    await printWindow.loadURL(
      `file://${__dirname}/static/barCode.html?content=${encodeURIComponent(content)}`
    );
    const options = {
      silent: true,
      printBackground: false,
      pageSize: {
        width: 60000,
        height: 40000,
      },
      deviceName: printerName,
      margins: {
        marginType: 'none',
      },
    };
    printWindow.webContents.print(options, (success) => {
      printWindow.destroy();
    });
  });

  // 页面加载完成后连接WebSocket
  mainWindow.webContents.on('did-finish-load', () => {
    connectSocket();
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
