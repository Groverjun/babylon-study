import * as BABYLON from "@babylonjs/core";

export class EarthController {
  private engine!: BABYLON.Engine | BABYLON.WebGPUEngine;
  private scene!: BABYLON.Scene;
  private material!: BABYLON.ShaderMaterial;
  private earthMesh!: BABYLON.Mesh;
  private sunDirection: BABYLON.Vector3 = new BABYLON.Vector3(1, 0, 0);
  private time: number = 0;


  constructor(private canvas: HTMLCanvasElement) {}

  async init() {
    if (await BABYLON.WebGPUEngine.IsSupportedAsync) {
      const wgpu = new BABYLON.WebGPUEngine(this.canvas);
      await wgpu.initAsync();
      this.engine = wgpu;
    } else {
      this.engine = new BABYLON.Engine(this.canvas, true);
    }

    this.scene = new BABYLON.Scene(this.engine);
    this.scene.clearColor = new BABYLON.Color4(0, 0, 0, 1);

    const camera = new BABYLON.ArcRotateCamera(
      "cam",
      -Math.PI / 2,
      Math.PI / 2.5,
      5,
      BABYLON.Vector3.Zero(),
      this.scene,
    );
    camera.attachControl(this.canvas, true);

    camera.lowerRadiusLimit = 2.2;
    camera.upperRadiusLimit = 15;
    camera.wheelPrecision = 120;
    camera.inertia = 0.9;
    this.setupShaders();
    this.setupEarth();
    this.startLoop();
    // this.drawEquator();
    // this.drawPrimeMeridian();
    // this.drawGrid();
    // this.drawLongitudeLines();
    // this.drawLatitudeLines();
    this.drawChinaContours()
  }
/**
 * 加载并绘制中国城市轮廓
 * @param color 轮廓颜色
 * @param opacity 细线透明度，建议不要太高，否则叠加在一起会很乱
 */
public async drawChinaContours(color: string = "#00ffff") {
    const url = "https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json";
    
    try {
        const response = await fetch(url);
        const data = await response.json();

        data.features.forEach((feature: any) => {
            const { type, coordinates } = feature.geometry;

            if (type === "Polygon") {
                // 单个闭合区域
                coordinates.forEach((ring: [number, number][]) => {
                    this.createContourLine(ring, color);
                });
            } else if (type === "MultiPolygon") {
                // 多个闭合区域（如带岛屿的城市）
                coordinates.forEach((polygon: [number, number][][]) => {
                    polygon.forEach((ring: [number, number][]) => {
                        this.createContourLine(ring, color);
                    });
                });
            }
        });
        console.log("中国城市轮廓绘制完成");
    } catch (error) {
        console.error("加载轮廓数据失败:", error);
    }
}

/**
 * 将一组经纬度点集转换为球面线条
 */
private createContourLine(points: [number, number][], color: string) {
    const vertexes: BABYLON.Vector3[] = [];
    
    // 轮廓半径稍高于地表 (1.005)，避免深度冲突（Z-Fighting）
    const contourRadius = 1.005;

    points.forEach((p) => {
        // p[0] 是经度, p[1] 是纬度
        vertexes.push(this.latLonToVector3(p[1], p[0], contourRadius));
    });

    // 创建线条
    const line = BABYLON.MeshBuilder.CreateLines(
        "city_contour",
        { points: vertexes, updatable: false },
        this.scene
    );

    line.color = BABYLON.Color3.FromHexString(color);
    line.alpha = 0.5; // 设置半透明，视觉效果更具科技感
    line.parent = this.earthMesh; // 随地球同步旋转
}
  private setupShaders() {
    BABYLON.Effect.ShadersStore["earthDayNightFragmentShader"] = `
            precision highp float;
            varying vec2 vUV;
            varying vec3 vNormalW;
            varying vec3 vPositionW;
            uniform sampler2D dayTexture;
            uniform sampler2D nightTexture;
            uniform sampler2D cloudTexture;
            uniform sampler2D normalTexture;
            uniform sampler2D specularTexture;
            uniform vec3 sunDir;
            uniform vec3 cameraPosition;
            uniform float time;

            void main(void) {
                vec3 viewDir = normalize(cameraPosition - vPositionW);
                vec3 lightDir = normalize(sunDir);
                vec3 normalDetail = texture2D(normalTexture, vUV).rgb * 2.0 - 1.0;
                vec3 perturbedNormal = normalize(vNormalW + normalDetail * 0.1); 
                float intensity = dot(perturbedNormal, lightDir);
                float mixer = smoothstep(-0.3, 0.3, intensity);

                vec4 dayColor = texture2D(dayTexture, vUV);
                vec4 nightColor = texture2D(nightTexture, vUV);
                
                float nightBrightness = 0.4;
                float nightContrast = 1.2;
                vec3 enhancedNight = (nightColor.rgb * nightContrast) + vec3(nightBrightness * nightColor.r); 
                vec3 ambientColor = vec3(0.05, 0.06, 0.1) * (1.0 - mixer);
                vec3 reflectDir = reflect(-lightDir, perturbedNormal);
                float specFactor = pow(max(dot(viewDir, reflectDir), 0.0), 20.0);
                float oceanMask = texture2D(specularTexture, vUV).r;
                vec3 specular = vec3(0.4) * specFactor * oceanMask * mixer;

                vec2 cloudUV = vUV + vec2(time * 0.005, 0.0);
                vec4 cloudColor = texture2D(cloudTexture, cloudUV);
                
                vec3 baseColor = mix(enhancedNight, dayColor.rgb, mixer);
                float cloudMixer = cloudColor.r;
                vec3 cloudEffect = mix(cloudColor.rgb * 0.15, cloudColor.rgb, mixer);
                baseColor = mix(baseColor, cloudEffect, cloudMixer * 0.8);

                // gl_FragColor = vec4(baseColor + specular, 1.0);
                gl_FragColor = vec4(baseColor + ambientColor + specular, 1.0);
            }
        `;

    BABYLON.Effect.ShadersStore["earthDayNightVertexShader"] = `
            precision highp float;
            attribute vec3 position;
            attribute vec2 uv;
            attribute vec3 normal;
            uniform mat4 worldViewProjection;
            uniform mat4 world;
            varying vec2 vUV;
            varying vec3 vNormalW;
            varying vec3 vPositionW;

            void main(void) {
                vec4 worldPos = world * vec4(position, 1.0);
                gl_Position = worldViewProjection * worldPos;
                // gl_Position = worldViewProjection * vec4(position, 1.0);
                // vUV = uv;
                
                vUV = vec2(1.0 - uv.x, 1.0 - uv.y); 
                
                vNormalW = vec3(world * vec4(normal, 0.0));
                vPositionW = worldPos.xyz;
            }
        `;
  }

  private setupEarth() {
    this.earthMesh = BABYLON.MeshBuilder.CreateSphere(
      "earth",
      { segments: 64, diameter: 2 },
      this.scene,
    );
    this.material = new BABYLON.ShaderMaterial(
      "earthShader",
      this.scene,
      {
        vertex: "earthDayNight",
        fragment: "earthDayNight",
      },
      {
        attributes: ["position", "normal", "uv"],
        uniforms: [
          "world",
          "worldViewProjection",
          "sunDir",
          "cameraPosition",
          "time",
        ],
        samplers: [
          "dayTexture",
          "nightTexture",
          "cloudTexture",
          "normalTexture",
          "specularTexture",
        ],
      },
    );
    this.earthMesh.material = this.material;
  }

  /**
   * 将经纬度转换为 3D 空间坐标
   */
  private latLonToVector3(
    lat: number,
    lon: number,
    radius: number = 1.01,
  ): BABYLON.Vector3 {
    const latRad = BABYLON.Tools.ToRadians(lat);
    // 这里直接写 -lon 配合 Shader 镜像
    const lonRad = BABYLON.Tools.ToRadians(-lon - 90);

    const x = radius * Math.cos(latRad) * Math.sin(lonRad);
    const y = radius * Math.sin(latRad);
    const z = radius * Math.cos(latRad) * Math.cos(lonRad);

    return new BABYLON.Vector3(x, y, z);
  }
  /**
   * 添加标记点
   * 关键点：将 marker 设置为 earthMesh 的子物体，这样旋转就自动对齐了
   */
  public addMarker(lat: number, lon: number, color: string = "#00ff00") {
    if (!this.earthMesh) return;

    const position = this.latLonToVector3(lat, lon);
    const marker = BABYLON.MeshBuilder.CreateSphere(
      "marker",
      { diameter: 0.04 },
      this.scene,
    );

    // 关键：绑定父级，这样地球旋转时，点位会跟着地图走
    marker.parent = this.earthMesh;
    marker.position = position;

    const mat = new BABYLON.StandardMaterial("markerMat", this.scene);
    mat.emissiveColor = BABYLON.Color3.FromHexString(color);
    marker.material = mat;
  }

  public setAllTextures(
    day: string,
    night: string,
    cloud: string,
    normal: string,
    specular: string,
  ) {
    this.material.setTexture(
      "dayTexture",
      new BABYLON.Texture(day, this.scene, false, true),
    );
    this.material.setTexture(
      "nightTexture",
      new BABYLON.Texture(night, this.scene, false, true),
    );
    this.material.setTexture(
      "cloudTexture",
      new BABYLON.Texture(cloud, this.scene, false, true),
    );
    this.material.setTexture(
      "normalTexture",
      new BABYLON.Texture(normal, this.scene, false, true),
    );
    this.material.setTexture(
      "specularTexture",
      new BABYLON.Texture(specular, this.scene, false, true),
    );
  }

  public updateSun(direction: BABYLON.Vector3) {
    this.sunDirection.copyFrom(direction);
    this.material.setVector3("sunDir", this.sunDirection);
    this.material.setVector3(
      "cameraPosition",
      this.scene.activeCamera!.position,
    );
  }

  private startLoop() {
    this.engine.runRenderLoop(() => {
      this.time += 0.01;
      this.material.setFloat("time", this.time);
      this.scene.render();
    });
    window.addEventListener("resize", () => this.engine.resize());
  }
  public drawEquator() {
    const points: BABYLON.Vector3[] = [];

    for (let lon = -180; lon <= 180; lon += 2) {
      points.push(this.latLonToVector3(0, lon, 1.02));
    }

    const line = BABYLON.MeshBuilder.CreateLines(
      "equator",
      { points },
      this.scene,
    );
    line.color = new BABYLON.Color3(1, 0, 0); // 红色
    line.parent = this.earthMesh;
  }
  public drawPrimeMeridian() {
    const points: BABYLON.Vector3[] = [];

    for (let lat = -90; lat <= 90; lat += 2) {
      points.push(this.latLonToVector3(lat, 0, 1.02));
    }

    const line = BABYLON.MeshBuilder.CreateLines(
      "meridian",
      { points },
      this.scene,
    );
    line.color = new BABYLON.Color3(0, 1, 0); // 绿色
    line.parent = this.earthMesh;
  }
  /**
 * 根据日期计算太阳在地球坐标系中的方向向量
 * @param date 默认当前时间
 */
private calculateSunDirection(date: Date = new Date()): BABYLON.Vector3 {
    // 1. 赤纬（纬度）保持不变
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
    const declination = 23.45 * Math.sin((2 * Math.PI / 365) * (dayOfYear + 284));

    // 2. 计算太阳当前的真实经度 (Solar Longitude)
    // UTC 12:00 时，太阳在经度 0° 附近
    // 地球每秒自转 360/86400 度
    const utcHours = date.getUTCHours();
    const utcMinutes = date.getUTCMinutes();
    const utcSeconds = date.getUTCSeconds();
    const totalSeconds = (utcHours * 3600) + (utcMinutes * 60) + utcSeconds;

    // 太阳经度计算：
    // 当 totalSeconds = 43200 (UTC 12:00) 时，lon = 0
    // 太阳是向西移的，所以是 (43200 - totalSeconds)
    const sunLon = ((43200 - totalSeconds) / 86400) * 360;

    // 3. 关键：直接调用你现有的转换函数，确保坐标系 100% 一致
    // 使用 radius = 1 即可，因为我们要的是方向向量
    return this.latLonToVector3(declination, sunLon, 1.0);
}
  public drawGrid() {
    // 纬线
    for (let lat = -60; lat <= 60; lat += 30) {
      const points: BABYLON.Vector3[] = [];

      for (let lon = -180; lon <= 180; lon += 2) {
        points.push(this.latLonToVector3(lat, lon, 1.02));
      }

      const line = BABYLON.MeshBuilder.CreateLines(
        "lat",
        { points },
        this.scene,
      );
      line.color = new BABYLON.Color3(0.5, 0.5, 0.5);
      line.parent = this.earthMesh;
    }

    // 经线
    for (let lon = -180; lon <= 180; lon += 30) {
      const points: BABYLON.Vector3[] = [];

      for (let lat = -90; lat <= 90; lat += 2) {
        points.push(this.latLonToVector3(lat, lon, 1.02));
      }

      const line = BABYLON.MeshBuilder.CreateLines(
        "lon",
        { points },
        this.scene,
      );
      line.color = new BABYLON.Color3(0.5, 0.5, 0.5);
      line.parent = this.earthMesh;
    }
  }
  private createLabel(text: string, position: BABYLON.Vector3) {
    const plane = BABYLON.MeshBuilder.CreatePlane(
      "label",
      { size: 0.2 },
      this.scene,
    );

    const texture = new BABYLON.DynamicTexture(
      "labelTex",
      { width: 256, height: 128 },
      this.scene,
    );
    texture.drawText(text, 20, 80, "bold 40px Arial", "white", "transparent");

    const mat = new BABYLON.StandardMaterial("labelMat", this.scene);
    mat.diffuseTexture = texture;
    mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
    mat.backFaceCulling = false;

    plane.material = mat;
    plane.position = position;

    // 让文字始终面向相机
    plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;

    plane.parent = this.earthMesh;
  }
  public drawLongitudeLines() {
    for (let lon = -180; lon <= 180; lon += 30) {
      const points: BABYLON.Vector3[] = [];

      for (let lat = -90; lat <= 90; lat += 2) {
        points.push(this.latLonToVector3(lat, lon, 1.02));
      }

      const line = BABYLON.MeshBuilder.CreateLines(
        "lon",
        { points },
        this.scene,
      );
      line.color = new BABYLON.Color3(0, 1, 0);
      line.parent = this.earthMesh;

      // 在赤道标经度
      const pos = this.latLonToVector3(0, lon, 1.1);
      this.createLabel(`Lon ${lon}°`, pos);
    }
  }
  public drawLatitudeLines() {
    for (let lat = -60; lat <= 60; lat += 30) {
      const points: BABYLON.Vector3[] = [];

      for (let lon = -180; lon <= 180; lon += 2) {
        points.push(this.latLonToVector3(lat, lon, 1.02));
      }

      const line = BABYLON.MeshBuilder.CreateLines(
        "lat",
        { points },
        this.scene,
      );
      line.color = new BABYLON.Color3(1, 0, 0);
      line.parent = this.earthMesh;

      // 在 0 经线标纬度
      const pos = this.latLonToVector3(lat, 0, 1.1);
      this.createLabel(`Lat ${lat}°`, pos);
    }
  }
  /**
   * 添加两点间的飞线
   * @param startLat 起点纬度
   * @param startLon 起点经度
   * @param endLat 终点纬度
   * @param endLon 终点经度
   * @param color 颜色
   */
  public addFlightLine(
    startLat: number,
    startLon: number,
    endLat: number,
    endLon: number,
    color: string = "#00ffff",
  ) {
    const startVec = this.latLonToVector3(startLat, startLon, 1.01);
    const endVec = this.latLonToVector3(endLat, endLon, 1.01);

    // 1. 计算中点方向并拉高，作为贝塞尔曲线的控制点
    const middleVec = BABYLON.Vector3.Center(startVec, endVec).normalize();
    // 这里的 1.5 是高度系数，可以根据距离动态调整
    const distance = BABYLON.Vector3.Distance(startVec, endVec);
    const height = 1 + distance * 0.3;
    const controlVec = middleVec.scale(height);

    // 2. 使用贝塞尔曲线生成路径点
    const points = [];
    const steps = 50; // 线条精度
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // 二阶贝塞尔公式: (1-t)^2*P0 + 2t(1-t)*P1 + t^2*P2
      const p = BABYLON.Vector3.Lerp(
        BABYLON.Vector3.Lerp(startVec, controlVec, t),
        BABYLON.Vector3.Lerp(controlVec, endVec, t),
        t,
      );
      points.push(p);
    }

    // 3. 创建线条
    const line = BABYLON.MeshBuilder.CreateLines(
      "flightLine",
      { points: points, updatable: false },
      this.scene,
    );
    line.color = BABYLON.Color3.FromHexString(color);
    line.parent = this.earthMesh;

    // 可选：添加一点发光效果
    // line.renderingGroupId = 1;
  }
  /**
   * 添加带动画发光点的飞线
   */
  public addAnimatedFlightLine(
    startLat: number,
    startLon: number,
    endLat: number,
    endLon: number,
    color: string = "#00ffff",
  ) {
    const startVec = this.latLonToVector3(startLat, startLon, 1.01);
    const endVec = this.latLonToVector3(endLat, endLon, 1.01);

    // 1. 计算控制点（高度）
    const middleVec = BABYLON.Vector3.Center(startVec, endVec).normalize();
    const distance = BABYLON.Vector3.Distance(startVec, endVec);
    const controlVec = middleVec.scale(1 + distance * 0.3);

    // 2. 绘制静态轨迹线
    const points = [];
    for (let i = 0; i <= 50; i++) {
      const t = i / 50;
      points.push(this.getBezierPoint(startVec, controlVec, endVec, t));
    }
    const line = BABYLON.MeshBuilder.CreateLines(
      "line",
      { points },
      this.scene,
    );
    line.color = BABYLON.Color3.FromHexString(color).scale(0.5); // 线条颜色暗一点
    line.parent = this.earthMesh;

    // 3. 创建发光点（小球）
    const dot = BABYLON.MeshBuilder.CreateSphere(
      "dot",
      { diameter: 0.03 },
      this.scene,
    );
    const dotMat = new BABYLON.StandardMaterial("dotMat", this.scene);
    dotMat.emissiveColor = BABYLON.Color3.FromHexString(color);
    dot.material = dotMat;
    dot.parent = this.earthMesh;

    // 4. 动画逻辑
    let progress = 0;
    const speed = 0.005; // 调节速度

    const observer = this.scene.onBeforeRenderObservable.add(() => {
      progress += speed;
      if (progress > 1) progress = 0; // 循环播放

      const pos = this.getBezierPoint(startVec, controlVec, endVec, progress);
      dot.position.copyFrom(pos);
    });

    // 返回以方便后续清理
    return { line, dot, observer };
  }
public drawSmoothPath(pathData: [number, number][], color: string = "#00ff00") {
    // 1. 增加前置守卫，确保数据存在且足够连成线
    if (!pathData || pathData.length < 2) return;

    const allPoints: BABYLON.Vector3[] = [];
    const radius = 1.02;

    for (let i = 0; i < pathData.length - 1; i++) {
        // 2. 使用解构赋值，并加上类型保护，或者直接告诉 TS 这里肯定有值
        const startData = pathData[i];
        const endData = pathData[i + 1];

        // 再次确认数据存在（消除 ts 2532 报错）
        if (!startData || !endData) continue;

        const start = this.latLonToVector3(startData[0], startData[1], radius);
        const end = this.latLonToVector3(endData[0], endData[1], radius);

        const distance = BABYLON.Vector3.Distance(start, end);
        const interpolationSteps = Math.max(1, Math.floor(distance * 50));

        for (let step = 0; step <= interpolationSteps; step++) {
            const t = step / interpolationSteps;
            // 混合 Lerp 和归一化来模拟球面路径
            const p = BABYLON.Vector3.Lerp(start, end, t);
            p.normalize().scaleInPlace(radius);
            allPoints.push(p);
        }
    }

    // 3. 检查生成的点集是否有效
    if (allPoints.length > 0) {
        const line = BABYLON.MeshBuilder.CreateLines(
            "smooth_path",
            { points: allPoints, updatable: false },
            this.scene
        );
        line.color = BABYLON.Color3.FromHexString(color);
        line.parent = this.earthMesh;
    }
}
  /**
   * 二阶贝塞尔曲线公式工具函数
   */
  private getBezierPoint(
    p0: BABYLON.Vector3,
    p1: BABYLON.Vector3,
    p2: BABYLON.Vector3,
    t: number,
  ): BABYLON.Vector3 {
    const invT = 1 - t;
    return p0
      .scale(invT * invT)
      .add(p1.scale(2 * t * invT))
      .add(p2.scale(t * t));
  }
  public dispose() {
    this.engine.dispose();
  }
}
