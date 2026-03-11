import { createRouter, createWebHistory,createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'map',
    component: () => import('../views/map.vue')
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
