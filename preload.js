const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printQRCode: (content) => ipcRenderer.invoke('silent-print-qrcode', content),
  printBarCode: (content) => ipcRenderer.invoke('silent-print-barcode', content),
});
