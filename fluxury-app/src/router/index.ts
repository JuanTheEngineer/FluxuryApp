import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import DefaultLayout from "@/layouts/DefaultLayout.vue";
import SessionBrowserView from "@/views/SessionBrowserView.vue";
import SessionEditorView from "@/views/SessionEditorView.vue";
import BeatBrowserView from "@/views/BeatBrowserView.vue";
import HomeView from "@/views/HomeView.vue";
import AddBeatView from "@/views/AddBeatView.vue";

const routes = [
    {
        path: '/',
        component: DefaultLayout,
        children: [
            {
                path: '',
                redirect: '/sessions'
            },
            {
                path: 'home',
                component: HomeView,
                meta: { requiresAuth: true }
            },
            {
                path: 'sessions',
                component: SessionBrowserView,
                meta: { requiresAuth: true }
            },
            {
                path: 'session/:id',
                component: SessionEditorView,
                meta: { requiresAuth: true }
            },
            {
                path: 'beats',
                component: BeatBrowserView,
                meta: { requiresAuth: true }
            },
            {
                path: 'beats/add',
                component: AddBeatView,
                meta: { requiresAuth: true }
            }
        ]
    },
    {
        path: '/login',
        component: () => import('@/components/AuthForm.vue'),
        meta: { requiresGuest: true }
    },
    {
        path: '/:pathMatch(.*)*',
        redirect: '/sessions'
    }
]

const router = createRouter({
    history: createWebHistory(),
    routes
})

// Navigation guards
router.beforeEach(async (to, from, next) => {
    const authStore = useAuthStore()

    // Check auth status if not already checked
    if (!authStore.isAuthenticated && !authStore.isLoading) {
        await authStore.checkAuthStatus()
    }

    // Handle protected routes
    if (to.meta.requiresAuth && !authStore.isAuthenticated) {
        next('/login')
        return
    }

    // Handle guest-only routes (like login page)
    if (to.meta.requiresGuest && authStore.isAuthenticated) {
        next('/sessions')
        return
    }

    next()
})

export default router
