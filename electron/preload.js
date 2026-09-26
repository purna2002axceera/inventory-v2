const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  auth: {
    login: (username, password) => ipcRenderer.invoke('auth:login', { username, password }),
  },
  items: {
    listTypes: (params) => ipcRenderer.invoke('items:listTypes', params),
    createType: (params) => ipcRenderer.invoke('items:createType', params),
    deleteType: (params) => ipcRenderer.invoke('items:deleteType', params),
    list: (params) => ipcRenderer.invoke('items:list', params),
    get: (itemId) => ipcRenderer.invoke('items:get', { itemId }),
    create: (item) => ipcRenderer.invoke('items:create', item),
    update: (item) => ipcRenderer.invoke('items:update', item),
    archive: (itemId) => ipcRenderer.invoke('items:archive', { itemId }),
  },
  production: {
    create: (payload) => ipcRenderer.invoke('production:create', payload),
    createBulk: (payload) => ipcRenderer.invoke('production:createBulk', payload),
    approve: (payload) => ipcRenderer.invoke('production:approve', payload),
    reject: (payload) => ipcRenderer.invoke('production:reject', payload),
    reverse: (payload) => ipcRenderer.invoke('production:reverse', payload),
    list: (params) => ipcRenderer.invoke('production:list', params),
    listBatches: (params) => ipcRenderer.invoke('production:listBatches', params),
  },
  customers: {
    list: (params) => ipcRenderer.invoke('customers:list', params),
    create: (customer) => ipcRenderer.invoke('customers:create', customer),
    update: (customer) => ipcRenderer.invoke('customers:update', customer),
    delete: (customerId) => ipcRenderer.invoke('customers:delete', { customerId }),
    getCreditHistory: (customerId) => ipcRenderer.invoke('customers:getCreditHistory', { customerId }),
  },
  salesOrders: {
    create: (payload) => ipcRenderer.invoke('salesOrders:create', payload),
    list: (params) => ipcRenderer.invoke('salesOrders:list', params),
    get: (soId) => ipcRenderer.invoke('salesOrders:get', { soId }),
    report: (params) => ipcRenderer.invoke('salesOrders:report', params),
    recordCreditPayment: (payload) => ipcRenderer.invoke('salesOrders:recordCreditPayment', payload),
    writeOffCredit: (payload) => ipcRenderer.invoke('salesOrders:writeOffCredit', payload),
  },
  returns: {
    create: (payload) => ipcRenderer.invoke('returns:create', payload),
    list: (params) => ipcRenderer.invoke('returns:list', params),
    get: (returnId) => ipcRenderer.invoke('returns:get', { returnId }),
    approve: (payload) => ipcRenderer.invoke('returns:approve', payload),
    reject: (payload) => ipcRenderer.invoke('returns:reject', payload),
    getReturnableItems: (soNumber) => ipcRenderer.invoke('returns:getReturnableItems', { soNumber }),
  },
  stockAdjustments: {
    create: (payload) => ipcRenderer.invoke('stockAdjustments:create', payload),
    listForItem: (params) => ipcRenderer.invoke('stockAdjustments:listForItem', params),
  },
  reports: {
    getStocks: (params) => ipcRenderer.invoke('reports:getStocks', params),
    getGRNs: (params) => ipcRenderer.invoke('reports:getGRNs', params),
    getReturns: (params) => ipcRenderer.invoke('reports:getReturns', params),
  },
  system: {
    printToPDF: (reportData) => ipcRenderer.invoke('system:printToPDF', reportData),
    generateReceiptPdf: (payload) => ipcRenderer.invoke('system:generateReceiptPdf', payload),
    openExternal: (url) => ipcRenderer.invoke('system:openExternal', url),
  },
  dashboard: {
    getMetrics: (params) => ipcRenderer.invoke('dashboard:getMetrics', params),
  },
  drive: {
    status: () => ipcRenderer.invoke('drive:status'),
    connect: () => ipcRenderer.invoke('drive:connect'),
    disconnect: () => ipcRenderer.invoke('drive:disconnect'),
    backup: () => ipcRenderer.invoke('drive:backup'),
  },
  license: {
    status: () => ipcRenderer.invoke('license:status'),
    activate: (key) => ipcRenderer.invoke('license:activate', key),
  }
});