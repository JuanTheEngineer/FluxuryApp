import { createRouter, createWebHistory } from 'vue-router'

const routes = [
    {
        path: '/',
        name: 'Home',
        component: () => import('../views/HomeView.vue') // ✅ use this style
    },
    {
        path: '/beats',
        name: 'Beats',
        component: () => import('../views/BeatBrowserView.vue')
    }
]

const router = createRouter({
    history: createWebHistory(),
    routes
})

export default router
