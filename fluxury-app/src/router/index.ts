import { createRouter, createWebHistory } from 'vue-router'

const routes = [
    {
        path: '/',
        name: 'Home',
        component: () => import('../views/HomeView.vue')
    },
    {
        path: '/beats',
        name: 'Beats',
        component: () => import('../views/BeatBrowserView.vue')
    },
    {
        path: '/sessions',
        name: 'Sessions',
        component: () => import('../views/HomeView.vue')
    },
    {
        path: '/session/:id',
        name: 'SessionEditor',
        component: () => import('../views/BeatBrowserView.vue')
    }
]

const router = createRouter({
    history: createWebHistory(),
    routes
})

export default router
