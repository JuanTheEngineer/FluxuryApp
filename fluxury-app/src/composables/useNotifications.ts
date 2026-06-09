import { ref, reactive } from 'vue'

export interface Notification {
  id: string
  message: string
  type: 'success' | 'error' | 'warning' | 'info'
  duration?: number
  visible: boolean
}

const notifications = ref<Notification[]>([])
let notificationIdCounter = 0

export const useNotifications = () => {
  const addNotification = (
    message: string,
    type: 'success' | 'error' | 'warning' | 'info' = 'info',
    duration: number = 5000
  ): string => {
    const id = `notification-${++notificationIdCounter}`

    const notification: Notification = {
      id,
      message,
      type,
      duration,
      visible: true
    }

    notifications.value.push(notification)

    // Auto-remove after duration + animation time
    if (duration > 0) {
      setTimeout(() => {
        removeNotification(id)
      }, duration + 300)
    }

    return id
  }

  const removeNotification = (id: string) => {
    const index = notifications.value.findIndex(n => n.id === id)
    if (index > -1) {
      notifications.value[index].visible = false

      // Remove from array after animation
      setTimeout(() => {
        const newIndex = notifications.value.findIndex(n => n.id === id)
        if (newIndex > -1) {
          notifications.value.splice(newIndex, 1)
        }
      }, 300)
    }
  }

  const clearAllNotifications = () => {
    notifications.value.forEach(n => n.visible = false)
    setTimeout(() => {
      notifications.value.splice(0)
    }, 300)
  }

  // Convenience methods
  const showSuccess = (message: string, duration?: number) =>
    addNotification(message, 'success', duration)

  const showError = (message: string, duration?: number) =>
    addNotification(message, 'error', duration)

  const showWarning = (message: string, duration?: number) =>
    addNotification(message, 'warning', duration)

  const showInfo = (message: string, duration?: number) =>
    addNotification(message, 'info', duration)

  return {
    notifications,
    addNotification,
    removeNotification,
    clearAllNotifications,
    showSuccess,
    showError,
    showWarning,
    showInfo
  }
}