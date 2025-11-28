const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const Stomp = require('stompjs');
const WebSocket = require('ws');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// 获取打印任务列表
async function getPrintJobs(printerName = null) {
  try {
    // 使用 PowerShell 查询打印任务
    let command;
    if (printerName) {
      // 查询指定打印机的任务
      command = `powershell -Command "Get-PrintJob -PrinterName '${printerName}' | Select-Object Id, DocumentName, UserName, JobStatus, TotalPages, Size | ConvertTo-Json"`;
    } else {
      // 查询所有打印机的任务
      command = `powershell -Command "Get-PrintJob | Select-Object Id, DocumentName, UserName, JobStatus, TotalPages, Size, PrinterName | ConvertTo-Json"`;
    }
    
    const { stdout, stderr } = await execPromise(command, { 
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 
    });
    
    if (stderr) {
      console.error('PowerShell stderr:', stderr);
    }
    
    if (!stdout || stdout.trim() === '') {
      return []; // 没有打印任务
    }
    
    const jobs = JSON.parse(stdout);
    // 如果只有一个任务，PowerShell 返回对象而不是数组
    return Array.isArray(jobs) ? jobs : [jobs];
  } catch (error) {
    console.error('获取打印任务失败:', error);
    return [];
  }
}

// 获取默认打印机名称
async function getDefaultPrinterName() {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  if (focusedWindow) {
    const printers = await focusedWindow.webContents.getPrintersAsync();
    // 修复中文乱码问题：将打印机信息转换为正确的编码
    const fixedPrinters = printers.map(printer => ({
      ...printer,
      name: Buffer.from(printer.name, 'latin1').toString('utf8'),
      displayName: Buffer.from(printer.displayName, 'latin1').toString('utf8')
    }));
    console.log(fixedPrinters);
    const defaultPrinter = fixedPrinters.find((v) => v.isDefault);
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
      const printers = await BrowserWindow.getFocusedWindow().webContents.getPrintersAsync();
      // 修复中文乱码问题
      const fixedPrinters = printers.map(printer => ({
        ...printer,
        name: Buffer.from(printer.name, 'latin1').toString('utf8'),
        displayName: Buffer.from(printer.displayName, 'latin1').toString('utf8')
      }));
      return fixedPrinters;
    } catch (e) {
      throw new Error('获取失败');
    }
  });

  // 获取打印任务列表
  ipcMain.handle('get-print-jobs', async (event, printerName) => {
    try {
      return await getPrintJobs(printerName);
    } catch (e) {
      throw new Error('获取打印任务失败');
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
