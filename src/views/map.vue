<template>
  <div class="canvas-container">
    <canvas ref="renderCanvas" class="earth-canvas"></canvas>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { Vector3 } from '@babylonjs/core';
import { EarthController } from '../utils/EarthController';

const renderCanvas = ref<HTMLCanvasElement | null>(null);
let earthCtrl: EarthController | null = null;

onMounted(async () => {
  if (renderCanvas.value) {
    earthCtrl = new EarthController(renderCanvas.value);
    await earthCtrl.init();

    // 加载所有纹理
    earthCtrl.setAllTextures(
      "/GoogleEarth/earth_day.jpg",
      "/GoogleEarth/earth_night.jpg",
      "/GoogleEarth/earth_clouds.jpg",
      "/GoogleEarth/earth_normal.png",
      "/GoogleEarth/earth_specular.jpg"
    );
    // earthCtrl.addMarker(39.9, 116.4, "#00ff00");
    earthCtrl.addMarker(51.5,-0.1,"#ff0000"); // 伦敦
    // earthCtrl.addMarker(40.7, -74.0, "#0000ff");
    // earthCtrl.addFlightLine(39.9, 116.4, 51.5, -0.1, "#00ff00");
    // earthCtrl.addFlightLine(39.9, 116.4, 40.7, -74.0, "#ffff00");
    // earthCtrl.addAnimatedFlightLine(39.9, 116.4, 51.5, -0.1, "#00ff00");
    // earthCtrl.addAnimatedFlightLine(39.9, 116.4, 40.7, -74.0, "#00ccff");
    let angle = 0;
    const animateSun = () => {
      angle += 0.005;
      const sunDir = new Vector3(Math.cos(angle), 0, Math.sin(angle));
      earthCtrl?.updateSun(sunDir);
      requestAnimationFrame(animateSun);
    };
    const myRoute: [number, number][] = [
      [39.9, 116.], // 人民广场
      [51.5,-0.1], // 外滩
      [31.2351, 121.5063], // 陆家嘴
      [31.2155, 121.5447]  // 世纪公园
    ];
    earthCtrl.drawSmoothPath(myRoute, "#FF5733");
    const updateRealWorldSun = () => {
      // 1. 获取实时太阳方向
      const sunDir = (earthCtrl as any).calculateSunDirection(new Date());
      // 2. 更新 Shader
      earthCtrl?.updateSun(sunDir);
      
      requestAnimationFrame(updateRealWorldSun);
    };
    updateRealWorldSun();
    // animateSun();
  }
});

onUnmounted(() => {
  earthCtrl?.dispose();
});
</script>

<style>
html,body {
  padding: 0;
  margin: 0;
  height: 100vh;
  overflow: hidden;
}
.canvas-container {
  width: 100%;
  height: 100vh;
  overflow: hidden;
}
.earth-canvas {
  width: 100%;
  height: 100%;
  display: block;
  outline: none;
}
</style>