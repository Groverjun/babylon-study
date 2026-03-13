<template>
  <div class="canvas-container">
    <canvas ref="babylonCanvas"></canvas>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { HollowSphere } from '../utils/HollowSphere'; 

const babylonCanvas = ref<HTMLCanvasElement | null>(null);
let effectInstance: HollowSphere | null = null;

onMounted(() => {
  if (babylonCanvas.value) {
    // 实例化
    effectInstance = new HollowSphere(babylonCanvas.value);
    
    // 延迟一小会儿执行，确保引擎完全就绪且用户看清了起点
    setTimeout(() => {
        effectInstance?.createExplosionEffect(500, 7);
    }, 1000);
  }
});

onUnmounted(() => {
  effectInstance?.dispose();
});
</script>

<style scoped>
.canvas-container {
  width: 100vw;
  height: 100vh;
  position: relative;
  background-color: #000; /* 背景设为黑色更显科技感 */
}

canvas {
  width: 100%;
  height: 100%;
  outline: none;
  touch-action: none;
}

.overlay {
    position: absolute;
    top: 20px;
    left: 20px;
    color: rgba(255, 255, 255, 0.5);
    font-family: sans-serif;
    pointer-events: none;
}
</style>