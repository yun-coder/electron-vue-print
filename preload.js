const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  getPrintJobs: (printerName) => ipcRenderer.invoke('get-print-jobs', printerName),
  printQRCode: (content) => ipcRenderer.invoke('silent-print-qrcode', content),
  printBarCode: (content) => ipcRenderer.invoke('silent-print-barcode', content),
});
