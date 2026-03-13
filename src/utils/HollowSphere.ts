import * as BABYLON from '@babylonjs/core';
// 核心模块导入
import "@babylonjs/core/Materials/standardMaterial";
import "@babylonjs/core/Shaders/default.vertex";
import "@babylonjs/core/Shaders/default.fragment";
import "@babylonjs/core/Animations/easing";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";

export class HollowSphere {
    private engine: BABYLON.Engine;
    private scene: BABYLON.Scene;
    private canvas: HTMLCanvasElement;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.engine = new BABYLON.Engine(this.canvas, true);
        this.scene = new BABYLON.Scene(this.engine);
        this.initScene();
    }

    private initScene() {
        // 相机固定在一个好观察的角度
        const camera = new BABYLON.ArcRotateCamera(
            "camera", 
            -Math.PI / 2, 
            Math.PI / 2.5, 
            15, 
            BABYLON.Vector3.Zero(), 
            this.scene
        );
        camera.attachControl(this.canvas, true);

        const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), this.scene);
        light.intensity = 0.8;

        // 辉光效果：让同步散开的小球看起来像发光的能量粒子
        const gl = new GlowLayer("glow", this.scene);
        gl.intensity = 0.6;

        this.engine.runRenderLoop(() => {
            this.scene.render();
        });

        window.addEventListener('resize', () => this.engine.resize());
    }

    /**
     * 同步爆炸扩散效果：所有小球同时从中心点弹出
     */
    public createExplosionEffect(count: number = 1000, radius: number = 6) {
        // 1. 创建原型球
        const rootSphere = BABYLON.MeshBuilder.CreateSphere("root", { diameter: 0.12 }, this.scene);
        
        const material = new BABYLON.StandardMaterial("sphereMat", this.scene);
        
        // --- 透明度核心设置 ---
        material.alpha = 0.5;                // 设置透明度 (0.0 到 1.0)
        material.backFaceCulling = false;    // 如果小球很大，关闭背面剔除可以让透明感更自然
        // ---------------------

        material.diffuseColor = new BABYLON.Color3(0.3, 0.7, 1.0);
        material.emissiveColor = new BABYLON.Color3(0.2, 0.5, 0.9); 
        rootSphere.material = material;
        rootSphere.isVisible = false;

        const easingFunction = new BABYLON.QuarticEase();
        easingFunction.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEOUT);

        for (let i = 0; i < count; i++) {
            const instance = rootSphere.createInstance("sphere_" + i);
            instance.position = BABYLON.Vector3.Zero();
            instance.scaling = BABYLON.Vector3.Zero();
            
            const phi = Math.acos(1 - 2 * (i + 0.5) / count);
            const theta = Math.sqrt(count * Math.PI) * phi;

            const targetPos = new BABYLON.Vector3(
                radius * Math.cos(theta) * Math.sin(phi),
                radius * Math.sin(theta) * Math.sin(phi),
                radius * Math.cos(phi)
            );

            // 动画逻辑保持不变...
            BABYLON.Animation.CreateAndStartAnimation("syncPos", instance, "position", 60, 90, BABYLON.Vector3.Zero(), targetPos, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT, easingFunction);
            BABYLON.Animation.CreateAndStartAnimation("syncScale", instance, "scaling", 60, 90, BABYLON.Vector3.Zero(), new BABYLON.Vector3(1, 1, 1), BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT, easingFunction);
        }
    }

    public dispose() {
        this.engine.dispose();
    }
}