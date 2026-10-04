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

    // Resolve auth exactly once per app load, and always wait for it to
    // settle before deciding on protected routes. Gating on isLoading here
    // raced the check (checkAuthStatus sets isLoading=true immediately) and
    // could bounce a logged-in user to /login on refresh.
    if (!authStore.authChecked) {
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
