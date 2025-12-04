const {app, BrowserWindow, ipcMain} = require('electron');
const path = require('node:path');
const Stomp = require('stompjs');
const WebSocket = require('ws');
const {exec} = require('child_process');
const util = require('util');
const {reactive} = require("vue");
const execPromise = util.promisify(exec);
let pageSize = reactive({
    width: 60000,
    height: 40000,
});

// 获取打印任务列表
async function getPrintJobs(printerName = null) {
    try {
        let allJobs = [];

        if (printerName) {
            // 查询指定打印机的任务
            const escapedName = printerName.replace(/'/g, "''");
            const command = `powershell -NoProfile -Command "$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-PrintJob -PrinterName '${escapedName}' | Select-Object Id, DocumentName, UserName, JobStatus, TotalPages, Size, @{Name='PrinterName';Expression={'${escapedName}'}} | ConvertTo-Json"`;
            const {stdout} = await execPromise(command, {
                encoding: 'utf8',
                maxBuffer: 1024 * 1024
            });

            if (stdout && stdout.trim() !== '') {
                const jobs = JSON.parse(stdout);
                allJobs = Array.isArray(jobs) ? jobs : [jobs];
            }
        } else {
            // 获取所有打印机列表
            const getPrintersCommand = `powershell -NoProfile -Command "$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json"`;
            const {stdout: printersOutput} = await execPromise(getPrintersCommand, {
                encoding: 'utf8',
                maxBuffer: 1024 * 1024
            });

            if (!printersOutput || printersOutput.trim() === '') {
                return [];
            }

            const printers = JSON.parse(printersOutput);
            const printerList = Array.isArray(printers) ? printers : [printers];

            // 遍历每个打印机获取任务
            for (const printer of printerList) {
                try {
                    const escapedName = printer.replace(/'/g, "''");
                    const command = `powershell -NoProfile -Command "$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-PrintJob -PrinterName '${escapedName}' | Select-Object Id, DocumentName, UserName, JobStatus, TotalPages, Size, @{Name='PrinterName';Expression={'${escapedName}'}} | ConvertTo-Json"`;
                    const {stdout} = await execPromise(command, {
                        encoding: 'utf8',
                        maxBuffer: 1024 * 1024
                    });

                    if (stdout && stdout.trim() !== '') {
                        const jobs = JSON.parse(stdout);
                        const jobList = Array.isArray(jobs) ? jobs : [jobs];
                        allJobs = allJobs.concat(jobList);
                    }
                } catch (err) {
                    // 某个打印机查询失败时继续查询其他打印机
                    console.log(`查询打印机 ${printer} 的任务失败:`, err.message);
                }
            }
        }

        return allJobs;
    } catch (error) {
        console.error('获取打印任务失败:', error);
        throw error;
    }
}

// 获取默认打印机名称
async function getDefaultPrinterName() {
    try {
        // 使用和其他函数相同的编码处理方法
        const command = `powershell -NoProfile -Command "$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Printer | Where-Object {$_.Default -eq $true} | Select-Object -ExpandProperty Name"`;
        const {stdout, stderr} = await execPromise(command, {
            encoding: 'utf8',
            maxBuffer: 1024 * 1024
        });

        // 检查是否有输出
        if (stdout && stdout.trim() !== '') {
            const printerName = stdout.trim();
            console.log(`找到默认打印机: ${printerName}`);
            return printerName;
        }

        // 如果没有找到默认打印机，尝试获取第一个可用打印机
        const fallbackCommand = `powershell -NoProfile -Command "$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Printer | Select-Object -First 1 -ExpandProperty Name"`;
        const {stdout: fallbackStdout} = await execPromise(fallbackCommand, {
            encoding: 'utf8',
            maxBuffer: 1024 * 1024
        });

        if (fallbackStdout && fallbackStdout.trim() !== '') {
            const printerName = fallbackStdout.trim();
            console.log(`使用第一个可用打印机: ${printerName}`);
            return printerName;
        }

        console.log('系统中没有找到任何打印机');
        return null;
    } catch (error) {
        console.error('获取默认打印机失败:', error);
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
                    // console.log(message.body);
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
        pageSize: pageSize,
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
        pageSize: pageSize,
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
        width: 1000,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        },
    });
    mainWindow.loadFile('dist/index.html');
    // mainWindow.webContents.openDevTools();

    // 获取打印机列表
    ipcMain.handle('get-printers', async (event) => {
        try {
            // 使用 PowerShell 获取打印机列表，避免编码问题
            const command = `powershell -NoProfile -Command "$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Printer | Select-Object Name, @{Name='IsDefault';Expression={$_.Default}}, @{Name='Status';Expression={$_.PrinterStatus}} | ConvertTo-Json"`;
            const {stdout} = await execPromise(command, {
                encoding: 'utf8',
                maxBuffer: 1024 * 1024
            });

            if (!stdout || stdout.trim() === '') {
                return [];
            }

            const printers = JSON.parse(stdout);
            const printerList = Array.isArray(printers) ? printers : [printers];

            // 转换为前端需要的格式
            return printerList.map(p => ({
                name: p.Name,
                displayName: p.Name,
                isDefault: p.IsDefault || false,
                status: p.Status || 0
            }));
        } catch (e) {
            console.error('获取打印机列表失败:', e);
            throw new Error('获取失败');
        }
    });

    // 设置打印参数
    ipcMain.handle('set-print-params', async (event, content) => {
        pageSize = {...content};
    })

    // 获取打印任务列表
    ipcMain.handle('get-print-jobs', async (event, printerName) => {
        try {
            return await getPrintJobs(printerName);
        } catch (e) {
            throw new Error('获取打印任务失败');
        }
    });

    // 二维码打印处理 - 打印设计器canvas内容
    ipcMain.handle('silent-print-qrcode', async (_, content, canvasDataURL) => {
        const printerName = await getDefaultPrinterName();
        if (!printerName) throw new Error('未找到默认的打印机');
        
        const printWindow = new BrowserWindow({
            show: false,
            webPreferences: {
                nodeIntegration: true,
            },
        });
        
        // 创建临时HTML内容来显示canvas图像
        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { margin: 0; padding: 0; }
                img { display: block; width: 100%; height: auto; }
            </style>
        </head>
        <body>
            <img src="${canvasDataURL}" alt="QR Code" />
        </body>
        </html>
        `;
        
        await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
        
        const options = {
            silent: true,
            printBackground: true,
            pageSize: pageSize,
            deviceName: printerName,
            margins: {
                marginType: 'none',
            },
        };
        
        printWindow.webContents.print(options, (success) => {
            printWindow.destroy();
        });
    });

    // 条形码打印处理 - 打印设计器canvas内容
    ipcMain.handle('silent-print-barcode', async (_, content, canvasDataURL) => {
        const printerName = await getDefaultPrinterName();
        if (!printerName) throw new Error('未找到默认的打印机');
        
        const printWindow = new BrowserWindow({
            show: false,
            webPreferences: {
                nodeIntegration: true,
            },
        });
        
        // 创建临时HTML内容来显示canvas图像
        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { margin: 0; padding: 0; }
                img { display: block; width: 100%; height: auto; }
            </style>
        </head>
        <body>
            <img src="${canvasDataURL}" alt="Barcode" />
        </body>
        </html>
        `;
        
        await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
        
        const options = {
            silent: true,
            printBackground: true,
            pageSize: pageSize,
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
