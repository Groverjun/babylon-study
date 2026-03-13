import { createRouter, createWebHistory,createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'map',
    component: () => import('../views/map.vue')
  },
  {
    path: '/sphere',
    name: 'sphere',
    component: () => import('../views/sphere.vue')
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
