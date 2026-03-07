import { contextBridge, ipcRenderer } from "electron"

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  send: (channel: string, ...args: unknown[]) => {
    const allowedChannels = ["app:minimize", "app:maximize", "app:close"]
    if (allowedChannels.includes(channel)) {
      ipcRenderer.send(channel, ...args)
    }
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const allowedChannels = ["app:update-available"]
    if (allowedChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args))
    }
  },
})
