import { createRouter, createWebHistory } from 'vue-router'
import DefaultLayout from "@/layouts/DefaultLayout.vue";
import SessionBrowserView from "@/views/SessionBrowserView.vue";
import SessionEditorView from "@/views/SessionEditorView.vue";
import BeatBrowserView from "@/views/BeatBrowserView.vue";

const routes = [
    {
        path: '/',
        component: DefaultLayout,
        children: [
            { path: 'sessions', component: SessionBrowserView },
            { path: 'session/:id', component: SessionEditorView },
            { path: 'beats', component: BeatBrowserView }
        ]
    }
]

export default createRouter({
    history: createWebHistory(),
    // @ts-ignore
    routes
})
